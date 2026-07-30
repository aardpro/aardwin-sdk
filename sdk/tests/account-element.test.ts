import { describe, it, expect, afterEach } from 'bun:test';
import '../src/account-element';

/**
 * <aardwin-account> 重写后的 DOM 集成测试（happy-dom）。
 *
 * 覆盖契约关键路径：
 *   - 属性：site-id / code / i18n / api-origin（无 manage-url）。
 *   - 会话：无 token + 无 code → missingAccountCode；无 token + code → POST /api/account/session
 *     {code} → access_token 存 sessionStorage（key=aardwin_account_token）；已存 token 复用、不重发 session。
 *   - 渲染：已绑 identity 列表（provider label / nickname / linkedAt + 解绑按钮）+ 未绑 provider（排除 email）绑定按钮（固定排序）。
 *   - XSS：所有动态文本 escapeHtml（nickname 含 <script> 不执行、不出现在 raw 形态）。
 *   - 绑定：点击 → POST /api/account/link/:provider {return_url}（Bearer）→ 跳 authorize_endpoint?provider&state&flow=link&link_token。
 *   - 回调 confirm：URL ?pending & ?provider → POST /confirm {pending_token}（Bearer）→ 成功 banner + 清 URL + 重载；401 → sessionExpired。
 *   - 解绑：confirm() false 不 DELETE；true → DELETE → 重载（identity 消失）。
 *   - 401（identities）：渲染 sessionExpired + 清 token + aardwin:account-error。
 *   - seq race-guard：被取代的 render 即便晚 resolve 也不覆盖更新的 DOM。
 *
 * happy-dom 全局（sessionStorage / history / confirm）由 tests/setup-dom.ts 注入。
 */

const ORIGINAL_FETCH = globalThis.fetch;
const SESSION_KEY = 'aardwin_account_token';

function waitFor(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shadow(el: HTMLElement): ShadowRoot {
  return (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot!;
}

interface MockRes {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text?: () => Promise<string>;
}

function jsonRes(json: unknown, status = 200): MockRes {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(json),
  };
}

/** 按完整 URL（可能带 query）匹配的路由 fetch。返回 MockRes 或 Promise<MockRes>。 */
type Handler = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => MockRes | Promise<MockRes>;

function installFetch(handler: Handler): void {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    return Promise.resolve(handler(url, init as { method?: string; body?: string; headers?: Record<string, string> }));
  }) as unknown as typeof fetch;
}

/** 只取 path（去掉 origin）便于路由匹配。 */
function pathOf(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, '');
}

function resetEnv(): void {
  globalThis.fetch = ORIGINAL_FETCH;
  document.body.innerHTML = '';
  sessionStorage.clear();
  (globalThis as { confirm: unknown }).confirm = () => false;
  try {
    window.location.href = 'http://localhost/';
  } catch {
    /* ignore */
  }
}

describe('aardwin-account — registration & attributes', () => {
  afterEach(resetEnv);

  it('is registered as a custom element', () => {
    expect(customElements.get('aardwin-account')).toBeDefined();
  });

  it('observedAttributes = site-id, code, i18n, api-origin (no manage-url)', () => {
    const Klass = customElements.get('aardwin-account') as typeof HTMLElement;
    expect(Klass.observedAttributes).toEqual(['site-id', 'code', 'i18n', 'api-origin']);
  });
});

describe('aardwin-account — session resolution', () => {
  afterEach(resetEnv);

  it('no token + no code → missingAccountCode + aardwin:account-error', async () => {
    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('site-id', 'S');
    let event: CustomEvent | null = null;
    el.addEventListener('aardwin:account-error', (e: Event) => {
      event = e as CustomEvent;
    });
    document.body.appendChild(el);
    await waitFor(20);

    expect(shadow(el).innerHTML).toMatch(/requires a code attribute|需要 code 属性/);
    expect(event).not.toBeNull();
    expect((event!.detail as { message?: string }).message).toBeTruthy();
    expect((event!.detail as { phase?: string }).phase).toBe('session');
  });

  it('no token + code → POST /api/account/session {code} (Bearer-less) → token stored in sessionStorage', async () => {
    let sessionBody: { code?: string } | undefined;
    let sessionHadAuth = false;
    installFetch((url, init) => {
      if (pathOf(url) === '/api/account/session') {
        sessionBody = JSON.parse(init?.body ?? '{}');
        sessionHadAuth = !!init?.headers?.Authorization;
        return jsonRes({ data: { access_token: 'TOK123' } });
      }
      if (pathOf(url) === '/api/account/identities') return jsonRes({ data: { identities: [] } });
      if (pathOf(url).includes('/api/providers')) return jsonRes({ data: { providers: [] } });
      return jsonRes({}, 404);
    });

    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('site-id', 'S');
    el.setAttribute('code', 'HANDOFF_CODE');
    document.body.appendChild(el);
    await waitFor(30);

    expect(sessionBody).toEqual({ code: 'HANDOFF_CODE' });
    // 建会话请求不带 Authorization（它正是换 token 的入口）。
    expect(sessionHadAuth).toBe(false);
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('TOK123');
    expect(shadow(el).querySelector('.empty')).toBeTruthy();
  });

  it('stored token is reused — no second /api/account/session call (one-time code not re-consumed)', async () => {
    sessionStorage.setItem(SESSION_KEY, 'CACHED');
    let sessionCalls = 0;
    let identitiesAuth = '';
    installFetch((url, init) => {
      if (pathOf(url) === '/api/account/session') {
        sessionCalls++;
        return jsonRes({ data: { access_token: 'NEW' } });
      }
      if (pathOf(url) === '/api/account/identities') {
        identitiesAuth = init?.headers?.Authorization ?? '';
        return jsonRes({ data: { identities: [{ provider: 'github', identityId: 'id1' }] } });
      }
      if (pathOf(url).includes('/api/providers')) return jsonRes({ data: { providers: [] } });
      return jsonRes({}, 404);
    });

    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('site-id', 'S');
    el.setAttribute('code', 'FRESH_CODE');
    document.body.appendChild(el);
    await waitFor(30);

    expect(sessionCalls).toBe(0); // 复用已存 token，未再建会话
    expect(identitiesAuth).toBe('Bearer CACHED'); // 用缓存的 token 鉴权
    expect(shadow(el).querySelector('[data-provider="github"]')).toBeTruthy();
  });
});

describe('aardwin-account — rendering (identities + bind buttons)', () => {
  afterEach(resetEnv);

  function standardFetch(opts?: {
    identities?: unknown;
    providers?: unknown;
    email?: string;
  }): void {
    installFetch((url) => {
      if (pathOf(url) === '/api/account/session') return jsonRes({ data: { access_token: 'TOK' } });
      if (pathOf(url) === '/api/account/identities')
        return jsonRes({ data: { identities: opts?.identities ?? [], email: opts?.email } });
      if (pathOf(url).includes('/api/providers'))
        return jsonRes({
          data: {
            providers: opts?.providers ?? [
              { id: 'github', authorizeEndpoint: 'https://auth.aard.win' },
              { id: 'google', authorizeEndpoint: 'https://auth.aard.win' },
              { id: 'email', authorizeEndpoint: 'https://auth.aard.win' },
            ],
          },
        });
      return jsonRes({}, 404);
    });
  }

  it('renders identity rows with label/nickname/linkedAt + unbind button', async () => {
    standardFetch({
      identities: [
        { provider: 'github', identityId: 'id1', nickname: 'octocat', linkedAt: '2026-07-30' },
      ],
      email: 'user@example.com',
    });

    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('site-id', 'S');
    el.setAttribute('code', 'C');
    el.setAttribute('i18n', 'en');
    document.body.appendChild(el);
    await waitFor(30);

    const row = shadow(el).querySelector('.identity');
    expect(row).toBeTruthy();
    expect(row!.getAttribute('data-identity-id')).toBe('id1');
    expect(row!.getAttribute('data-provider')).toBe('github');
    expect(row!.querySelector('.i-label')!.textContent).toBe('GitHub');
    expect(row!.querySelector('.i-nick')!.textContent).toBe('octocat');
    expect(row!.querySelector('.i-date')!.textContent).toContain('2026-07-30');
    expect(row!.querySelector('button.unbind')!.textContent).toBe('Unbind');
    // 账号级 email 行渲染。
    expect(shadow(el).querySelector('.row .row-value')!.textContent).toBe('user@example.com');
  });

  it('renders bind buttons for unbound providers (excludes email + already-bound), fixed order', async () => {
    // 已绑 github；站点返回 [discord, email, google, github]（打乱）。可绑应为 google + discord（去 email/github）。
    standardFetch({
      identities: [{ provider: 'github', identityId: 'id1' }],
      providers: [
        { id: 'discord', authorizeEndpoint: 'https://auth.aard.win' },
        { id: 'email', authorizeEndpoint: 'https://auth.aard.win' },
        { id: 'google', authorizeEndpoint: 'https://auth.aard.win' },
        { id: 'github', authorizeEndpoint: 'https://auth.aard.win' },
      ],
    });

    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('site-id', 'S');
    el.setAttribute('code', 'C');
    el.setAttribute('i18n', 'en');
    document.body.appendChild(el);
    await waitFor(30);

    const bindBtns = Array.from(shadow(el).querySelectorAll<HTMLButtonElement>('button.bind-btn'));
    expect(bindBtns.map((b) => b.getAttribute('data-bind'))).toEqual(['google', 'discord']);
    // email 不出现为绑定按钮。
    expect(shadow(el).querySelector('button.bind-btn[data-bind="email"]')).toBeNull();
    // github 已绑，不再出现为绑定按钮。
    expect(shadow(el).querySelector('button.bind-btn[data-bind="github"]')).toBeNull();
    // 绑定按钮带 icon（共享 PROVIDER_ICONS）。
    expect(bindBtns[0]!.querySelector('svg')).toBeTruthy();
  });

  it('empty state when no identities', async () => {
    standardFetch({ identities: [] });
    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('site-id', 'S');
    el.setAttribute('code', 'C');
    el.setAttribute('i18n', 'en');
    document.body.appendChild(el);
    await waitFor(30);
    expect(shadow(el).querySelector('.empty')!.textContent).toBe('No linked accounts yet');
  });

  it('i18n=zh renders Chinese labels', async () => {
    standardFetch({ identities: [{ provider: 'github', identityId: 'id1' }] });
    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('site-id', 'S');
    el.setAttribute('code', 'C');
    el.setAttribute('i18n', 'zh');
    document.body.appendChild(el);
    await waitFor(30);
    expect(shadow(el).querySelector('.group-title')!.textContent).toBe('已绑定的账号');
    expect(shadow(el).querySelector('button.unbind')!.textContent).toBe('解绑');
  });

  it('escapes dynamic PII text (nickname / linkedAt) — no element injection', async () => {
    // identityId 带经典属性注入载荷：escapeAttr 必须转义 " 防止破出双引号属性 → 注入 img。
    standardFetch({
      identities: [
        {
          provider: 'github',
          identityId: 'id"><img src=x onerror=alert(1)>',
          nickname: '<script>alert(1)</script>',
          linkedAt: '"><b>',
        },
      ],
    });
    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('site-id', 'S');
    el.setAttribute('code', 'C');
    el.setAttribute('i18n', 'en');
    document.body.appendChild(el);
    await waitFor(30);

    // 关键 XSS 性质：nickname 里的 <script> 没有变成真实 script 元素，<img>/onerror 也没注入。
    expect(shadow(el).querySelector('script')).toBeNull();
    expect(shadow(el).querySelector('img')).toBeNull();
    expect(shadow(el).querySelector('[onerror]')).toBeNull();
    // 序列化文本里 <script> 被转义为 &lt;script&gt;（escapeHtml 生效）。
    expect(shadow(el).innerHTML).toContain('&lt;script&gt;');
    expect(shadow(el).innerHTML).not.toContain('<script>alert(1)</script>');
    // identityId 原值完整保留（未被截断），未破出属性注入新元素。
    const row = shadow(el).querySelector('.identity')!;
    expect(row.getAttribute('data-identity-id')).toBe('id"><img src=x onerror=alert(1)>');
    expect(row.querySelectorAll('img, script').length).toBe(0);
  });
});

describe('aardwin-account — bind flow', () => {
  afterEach(resetEnv);

  it('clicking a bind button → POST /api/account/link/:provider {return_url} (Bearer) → redirect to authorize_endpoint', async () => {
    sessionStorage.setItem(SESSION_KEY, 'TOK');
    let linkUrl = '';
    let linkBody: { return_url?: string } | undefined;
    let linkAuth = '';
    installFetch((url, init) => {
      if (pathOf(url) === '/api/account/identities') return jsonRes({ data: { identities: [] } });
      if (pathOf(url).includes('/api/account/link/github') && !pathOf(url).includes('confirm')) {
        linkUrl = url;
        linkBody = JSON.parse(init?.body ?? '{}');
        linkAuth = init?.headers?.Authorization ?? '';
        return jsonRes({
          data: { authorize_endpoint: 'https://auth.aard.win', state: 'ST', link_token: 'LT' },
        });
      }
      if (pathOf(url).includes('/api/providers'))
        return jsonRes({ data: { providers: [{ id: 'github', authorizeEndpoint: 'https://auth.aard.win' }] } });
      if (pathOf(url) === '/api/account/session') return jsonRes({ data: { access_token: 'TOK' } });
      return jsonRes({}, 404);
    });

    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('site-id', 'S');
    el.setAttribute('code', 'C');
    el.setAttribute('i18n', 'en');
    document.body.appendChild(el);
    await waitFor(30);

    // 跳转会改写 window.location，先捕获当前 origin+pathname 作为期望 return_url。
    const returnUrlBefore = window.location.origin + window.location.pathname;

    shadow(el).querySelector<HTMLButtonElement>('button.bind-btn')!.click();
    await waitFor(30);

    expect(linkUrl).toBe('https://api.aard.win/api/account/link/github');
    expect(linkAuth).toBe('Bearer TOK');
    // return_url = origin + pathname（无 query）。
    expect(linkBody!.return_url).toBe(returnUrlBefore);
    // 整页跳到 authorize_endpoint，query 带 provider/state/flow=link/link_token。
    // 用 URL 解析断言（happy-dom 与真实浏览器都会把无 path 的 origin 补上 /）。
    const u = new URL(window.location.href);
    expect(u.origin).toBe('https://auth.aard.win');
    expect(u.searchParams.get('provider')).toBe('github');
    expect(u.searchParams.get('state')).toBe('ST');
    expect(u.searchParams.get('flow')).toBe('link');
    expect(u.searchParams.get('link_token')).toBe('LT');
  });

  it('link POST fails (non-401) → inline error banner + aardwin:account-error, no redirect', async () => {
    sessionStorage.setItem(SESSION_KEY, 'TOK');
    installFetch((url) => {
      if (pathOf(url) === '/api/account/identities') return jsonRes({ data: { identities: [] } });
      if (pathOf(url).includes('/api/account/link/github') && !pathOf(url).includes('confirm'))
        return jsonRes({}, 500);
      if (pathOf(url).includes('/api/providers'))
        return jsonRes({ data: { providers: [{ id: 'github', authorizeEndpoint: 'https://auth.aard.win' }] } });
      return jsonRes({}, 404);
    });

    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('site-id', 'S');
    el.setAttribute('code', 'C');
    el.setAttribute('i18n', 'en');
    let event: CustomEvent | null = null;
    el.addEventListener('aardwin:account-error', (e) => {
      event = e as CustomEvent;
    });
    document.body.appendChild(el);
    await waitFor(30);

    shadow(el).querySelector<HTMLButtonElement>('button.bind-btn')!.click();
    await waitFor(30);

    expect(shadow(el).querySelector('.banner.err')!.textContent).toBe('Failed to link. Please try again.');
    expect(event).not.toBeNull();
    expect((event!.detail as { phase?: string }).phase).toBe('link');
    expect(window.location.href).toBe('http://localhost/'); // 未跳转
  });
});

describe('aardwin-account — pending callback confirm', () => {
  afterEach(resetEnv);

  it('URL ?pending & ?provider → POST /confirm {pending_token} (Bearer) → success banner + URL cleared + identities reloaded', async () => {
    sessionStorage.setItem(SESSION_KEY, 'TOK');
    window.location.href = 'http://localhost/dashboard?pending=PT&provider=github';
    let confirmUrl = '';
    let confirmBody: { pending_token?: string } | undefined;
    let confirmAuth = '';
    let identitiesCalled = false;
    installFetch((url, init) => {
      if (pathOf(url).includes('/api/account/link/github/confirm')) {
        confirmUrl = url;
        confirmBody = JSON.parse(init?.body ?? '{}');
        confirmAuth = init?.headers?.Authorization ?? '';
        return jsonRes({ data: {} });
      }
      if (pathOf(url) === '/api/account/identities') {
        identitiesCalled = true;
        return jsonRes({ data: { identities: [{ provider: 'github', identityId: 'id1' }] } });
      }
      if (pathOf(url).includes('/api/providers')) return jsonRes({ data: { providers: [] } });
      return jsonRes({}, 404);
    });

    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('site-id', 'S');
    el.setAttribute('code', 'C');
    el.setAttribute('i18n', 'en');
    document.body.appendChild(el);
    await waitFor(40);

    expect(confirmUrl).toBe('https://api.aard.win/api/account/link/github/confirm');
    expect(confirmBody).toEqual({ pending_token: 'PT' });
    expect(confirmAuth).toBe('Bearer TOK');
    // 成功反馈条。
    expect(shadow(el).querySelector('.banner.ok')!.textContent).toBe('Linked successfully');
    // URL 已清掉 ?pending & ?provider。
    expect(window.location.search).toBe('');
    // confirm 后重载了 identities（github 已绑）。
    expect(identitiesCalled).toBe(true);
    expect(shadow(el).querySelector('[data-provider="github"]')).toBeTruthy();
  });

  it('confirm 401 → sessionExpired rendered + token cleared', async () => {
    sessionStorage.setItem(SESSION_KEY, 'TOK');
    window.location.href = 'http://localhost/dashboard?pending=PT&provider=github';
    installFetch((url) => {
      // confirm 401 = token 已死；随后的 identities 拉取同样 401 → 落到 sessionExpired。
      if (pathOf(url).includes('/api/account/link/github/confirm')) return jsonRes({}, 401);
      if (pathOf(url) === '/api/account/identities') return jsonRes({}, 401);
      return jsonRes({}, 404);
    });

    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('site-id', 'S');
    el.setAttribute('code', 'C');
    el.setAttribute('i18n', 'en');
    document.body.appendChild(el);
    await waitFor(40);

    expect(shadow(el).innerHTML).toMatch(/Session expired|会话已过期/);
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

describe('aardwin-account — unbind flow', () => {
  afterEach(resetEnv);

  function setup(): HTMLElement {
    sessionStorage.setItem(SESSION_KEY, 'TOK');
    installFetch((url, init) => {
      if (pathOf(url) === '/api/account/identities') {
        // 删除后第二次拉取不再含该 identity（模拟重载）。
        const deleted = (globalThis as { __deletedId?: string }).__deletedId;
        const all = [
          { provider: 'github', identityId: 'id1' },
          { provider: 'google', identityId: 'id2' },
        ].filter((i) => i.identityId !== deleted);
        return jsonRes({ data: { identities: all } });
      }
      if (pathOf(url).includes('/api/account/identities/id')) {
        (globalThis as { __deletedId?: string }).__deletedId = decodeIdFromUrl(url);
        return jsonRes({}, 204);
      }
      if (pathOf(url).includes('/api/providers')) return jsonRes({ data: { providers: [] } });
      return jsonRes({}, 404);
    });

    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('site-id', 'S');
    el.setAttribute('code', 'C');
    el.setAttribute('i18n', 'en');
    document.body.appendChild(el);
    return el;
  }

  function decodeIdFromUrl(url: string): string {
    const m = url.match(/\/api\/account\/identities\/([^/?]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  afterEach(() => {
    delete (globalThis as { __deletedId?: string }).__deletedId;
  });

  it('confirm() = false → no DELETE issued, identity remains', async () => {
    const el = setup();
    await waitFor(30);
    expect(shadow(el).querySelectorAll('.identity').length).toBe(2);

    (globalThis as { confirm: unknown }).confirm = () => false;
    shadow(el).querySelector<HTMLButtonElement>('button[data-unbind="id1"]')!.click();
    await waitFor(30);

    expect(shadow(el).querySelectorAll('.identity').length).toBe(2); // 未删除
  });

  it('confirm() = true → DELETE /api/account/identities/:identityId (Bearer) → reload (identity gone)', async () => {
    const el = setup();
    await waitFor(30);
    expect(shadow(el).querySelectorAll('.identity').length).toBe(2);

    (globalThis as { confirm: unknown }).confirm = () => true;
    shadow(el).querySelector<HTMLButtonElement>('button[data-unbind="id1"]')!.click();
    await waitFor(30);

    // id1 (github) 被删除，只剩 google。
    expect(shadow(el).querySelector('[data-identity-id="id1"]')).toBeNull();
    expect(shadow(el).querySelector('[data-identity-id="id2"]')).toBeTruthy();
  });
});

describe('aardwin-account — 401 handling & seq race-guard', () => {
  afterEach(resetEnv);

  it('identities 401 → sessionExpired rendered + token cleared + aardwin:account-error', async () => {
    sessionStorage.setItem(SESSION_KEY, 'TOK');
    installFetch((url) => {
      if (pathOf(url) === '/api/account/identities') return jsonRes({}, 401);
      if (pathOf(url).includes('/api/providers')) return jsonRes({ data: { providers: [] } });
      return jsonRes({}, 404);
    });

    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('site-id', 'S');
    el.setAttribute('code', 'C');
    el.setAttribute('i18n', 'en');
    let event: CustomEvent | null = null;
    el.addEventListener('aardwin:account-error', (e) => {
      event = e as CustomEvent;
    });
    document.body.appendChild(el);
    await waitFor(30);

    expect(shadow(el).innerHTML).toMatch(/Session expired|会话已过期/);
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(event).not.toBeNull();
  });

  it('superseded render discards its stale DOM write (seq race-guard)', async () => {
    sessionStorage.setItem(SESSION_KEY, 'TOK');
    // render#1 的 identities 永远挂起；切 i18n 触发 render#2（token 已缓存，不再建会话），
    // render#2 解析出 github。随后手动 resolve render#1 的 identities 为 google（旧/错数据），
    // 断言 seq 守卫丢弃它——DOM 仍是 render#2 的 github，不出现 google。
    let firstIdentitiesResolve: ((r: MockRes) => void) | null = null;
    let firstCalled = false;
    installFetch((url) => {
      if (pathOf(url) === '/api/account/identities') {
        if (!firstCalled) {
          firstCalled = true;
          return new Promise<MockRes>((resolve) => {
            firstIdentitiesResolve = resolve;
          });
        }
        return jsonRes({ data: { identities: [{ provider: 'github', identityId: 'id1' }] } });
      }
      if (pathOf(url).includes('/api/providers')) return jsonRes({ data: { providers: [] } });
      return jsonRes({}, 404);
    });

    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('site-id', 'S');
    el.setAttribute('code', 'C');
    el.setAttribute('i18n', 'en');
    document.body.appendChild(el);
    await waitFor(30); // render#1：identities 挂起，显示 loading
    expect(shadow(el).querySelector('.stub')).toBeTruthy();

    el.setAttribute('i18n', 'zh'); // → render#2
    await waitFor(30); // render#2 解析出 github
    expect(shadow(el).querySelector('[data-provider="github"]')).toBeTruthy();
    expect(shadow(el).querySelector('.stub')).toBeNull();

    // render#1 的 identities 晚 resolve 为 google（旧/错数据）。
    firstIdentitiesResolve!(jsonRes({ data: { identities: [{ provider: 'google', identityId: 'STALE' }] } }));
    await waitFor(30);

    // seq 守卫：render#1 的旧结果被丢弃，DOM 仍是 render#2 的 github，无 google。
    expect(shadow(el).querySelector('[data-provider="github"]')).toBeTruthy();
    expect(shadow(el).querySelector('[data-provider="google"]')).toBeNull();
  });
});
