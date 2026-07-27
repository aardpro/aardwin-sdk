import { describe, it, expect, afterEach, mock } from 'bun:test';
import '../src/component';

/**
 * DOM 集成测试（happy-dom 环境）。
 *
 * 覆盖 T7 两条关键路径：
 *   ① aardwin:error 事件 escape Shadow DOM —— host 元素上的 listener 能收到
 *     （证明 dispatch 到 `this` + composed:true）。直接断言 `event.composed` 标志，
 *     避免 host listener 在 target 阶段触发与 composed 无关的假绿。
 *   ② click provider 按钮 → 设 aard_win_auth_state cookie（32 hex）+ window.location.href
 *     重定向到 /authorize?...&state=...。
 *
 * happy-dom 20 不再自动注册全局；tests/setup-dom.ts 手动注入 document /
 * customElements / HTMLElement / navigator 等（crypto 保留 bun webcrypto）。
 */

const ORIGINAL_FETCH = globalThis.fetch;

function waitFor(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** best-effort 删除 state cookie，避免测试间脏值。happy-dom 的 cookie 删除行为有限，
 *  即便不生效，测② 仍验证 click 后存在新 cookie（不依赖残留）。 */
function clearStateCookie(): void {
  try {
    document.cookie = 'aard_win_auth_state=; Max-Age=0; Path=/';
  } catch {
    /* ignore — happy-dom cookie 删除限制 */
  }
}

describe('aardwin:error escapes Shadow DOM (composed:true)', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    document.body.innerHTML = '';
    clearStateCookie();
  });

  it('host listener receives aardwin:error {phase:"render"} with composed:true when fetch rejects', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('network down')),
    ) as unknown as typeof fetch;

    const el = document.createElement('aardwin-auth');
    el.setAttribute('site-id', 'test-site');

    let event: CustomEvent | null = null;
    el.addEventListener('aardwin:error', (e: Event) => {
      event = e as CustomEvent;
    });

    // connectedCallback → render → fetch reject → emitError('render', loadFailed)
    document.body.appendChild(el);
    await waitFor(50);

    // listener 挂在 host（el）上能收到，证明事件 dispatch 到 this。直接断言 composed:true
    // 确认事件能穿透 Shadow DOM（而非仅因 target 阶段触发而假绿）。
    expect(event).not.toBeNull();
    expect(event!.composed).toBe(true);
    const detail = event!.detail as { phase?: string; message?: string };
    expect(detail.phase).toBe('render');
    expect(typeof detail.message).toBe('string');
    expect(detail.message!.length).toBeGreaterThan(0);
  });
});

describe('click → state cookie + authorize redirect', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    document.body.innerHTML = '';
    clearStateCookie();
  });

  it('clicking a provider button sets aard_win_auth_state cookie (32 hex) + redirects to /authorize', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              providers: [
                { id: 'github', authorizeEndpoint: 'https://auth.aard.win' },
              ],
            },
          }),
      }),
    ) as unknown as typeof fetch;

    const el = document.createElement('aardwin-auth') as HTMLElement;
    el.setAttribute('site-id', 'test-site');
    document.body.appendChild(el);

    // render: fetch providers → mount buttons → bind click → emitReady
    await waitFor(50);

    const shadow = (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot;
    const btn = shadow?.querySelector<HTMLButtonElement>('button.btn');
    expect(btn).toBeTruthy();

    btn!.click();

    // state cookie = randomState() 的 16 bytes → 32 hex 字符。
    expect(document.cookie).toMatch(/aard_win_auth_state=[0-9a-f]{32}/);

    // 重定向到 ${endpoint}/authorize?site_id=…&provider=github&state=…&lang=…
    const href = window.location.href;
    expect(href).toContain('/authorize');
    expect(href).toContain('site_id=test-site');
    expect(href).toContain('provider=github');
    expect(href).toContain('state=');
    // issue 2：locale 透传到 /authorize（lang 取自 i18n 属性，此处 zh|en 之一）。
    expect(href).toMatch(/lang=(zh|en)/);
  });
});

/**
 * issue 6：按钮重设计。
 *   - 固定顺序 Wechat → Google → Outlook → Github → Discord → Email（与 api 返回顺序无关）。
 *   - 等宽全宽纵向列（wrap 为 flex-direction:column、btn 为 width:100%）。
 *   - 前 5 个带边框 button；email 为链接形态（btn-email：无边框、透明底、hover 下划线）。
 *   - 每个按钮渲染 16px 单色 SVG icon。
 */
describe('issue 6 — button redesign: order, layout, email link, icons', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    document.body.innerHTML = '';
    clearStateCookie();
  });

  it('renders providers in fixed order regardless of api order, equal-width column, email as link, with icons', async () => {
    // 故意打乱 api 返回顺序，验证 render 按固定顺序排列。
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              providers: [
                { id: 'discord', authorizeEndpoint: 'https://auth.aard.win' },
                { id: 'email', authorizeEndpoint: 'https://auth.aard.win' },
                { id: 'google', authorizeEndpoint: 'https://auth.aard.win' },
                { id: 'wechat', authorizeEndpoint: 'https://auth.aard.win' },
                { id: 'github', authorizeEndpoint: 'https://auth.aard.win' },
                { id: 'outlook', authorizeEndpoint: 'https://auth.aard.win' },
              ],
            },
          }),
      }),
    ) as unknown as typeof fetch;

    const el = document.createElement('aardwin-auth') as HTMLElement;
    el.setAttribute('site-id', 'test-site');
    el.setAttribute('i18n', 'en');
    document.body.appendChild(el);
    await waitFor(50);

    const shadow = (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot;
    const buttons = Array.from(
      shadow?.querySelectorAll<HTMLButtonElement>('button.btn') ?? [],
    );

    // 固定顺序（issue 6）：与上方打乱后的 api 顺序无关。
    const order = buttons.map((b) => b.getAttribute('data-provider'));
    expect(order).toEqual([
      'wechat',
      'google',
      'outlook',
      'github',
      'discord',
      'email',
    ]);

    // 前 5 个 = 描边 button（class 仅 btn）；email = 链接形态（btn btn-email）。
    expect(buttons[0]!.className).toBe('btn');
    expect(buttons[4]!.className).toBe('btn');
    const emailBtn = buttons[5]!;
    expect(emailBtn.className).toBe('btn btn-email');

    // 等宽全宽纵向列：wrap 为 flex-direction:column，btn 为 width:100%。
    const style = shadow?.querySelector('style')?.textContent ?? '';
    expect(style).toContain('flex-direction:column');
    expect(style).toContain('width:100%');
    // email 链接形态：无边框、透明底、hover 下划线。
    expect(style).toContain('.btn-email');
    expect(style).toContain('text-decoration:underline');

    // 每个按钮都渲染了 16px 单色 SVG icon。
    for (const b of buttons) {
      const svg = b.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('width')).toBe('16');
      expect(svg?.getAttribute('height')).toBe('16');
    }

    // en 文案形状：Continue with <Provider>；email 沿用 Continue with Email。
    expect(buttons[1]!.textContent).toBe('Continue with Google');
    expect(emailBtn.textContent).toBe('Continue with Email');
  });
});

/**
 * issue 2（DOM）：email 与 OAuth 两条跳转都透传 ?lang=，且 lang 跟随 i18n 属性。
 */
describe('issue 2 — lang passthrough on click (email + oauth)', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    document.body.innerHTML = '';
    clearStateCookie();
  });

  it('clicking the email link redirects to /email-auth/ with lang=en (i18n=en)', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              providers: [
                { id: 'email', authorizeEndpoint: 'https://auth.aard.win' },
              ],
            },
          }),
      }),
    ) as unknown as typeof fetch;

    const el = document.createElement('aardwin-auth') as HTMLElement;
    el.setAttribute('site-id', 'test-site');
    el.setAttribute('i18n', 'en');
    document.body.appendChild(el);
    await waitFor(50);

    const shadow = (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot;
    const emailBtn = shadow?.querySelector<HTMLButtonElement>('button.btn-email');
    expect(emailBtn).toBeTruthy();
    emailBtn!.click();

    const href = window.location.href;
    expect(href).toContain('/email-auth/test-site');
    expect(href).toContain('state=');
    expect(href).toContain('lang=en');
  });

  it('clicking an oauth button redirects to /authorize with deterministic lang (i18n=zh → lang=zh)', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              providers: [
                { id: 'wechat', authorizeEndpoint: 'https://auth.aard.win' },
              ],
            },
          }),
      }),
    ) as unknown as typeof fetch;

    const el = document.createElement('aardwin-auth') as HTMLElement;
    el.setAttribute('site-id', 'test-site');
    el.setAttribute('i18n', 'zh');
    document.body.appendChild(el);
    await waitFor(50);

    const shadow = (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot;
    const btn = shadow?.querySelector<HTMLButtonElement>('button.btn');
    expect(btn).toBeTruthy();
    btn!.click();

    const href = window.location.href;
    expect(href).toContain('/authorize');
    expect(href).toContain('provider=wechat');
    expect(href).toContain('lang=zh');
    // zh 文案形状：使用 <provider> 继续。
    expect(btn!.textContent).toBe('使用 微信 继续');
  });
});
