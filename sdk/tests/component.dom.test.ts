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

    // 重定向到 ${endpoint}/authorize?site_id=…&provider=github&state=…
    const href = window.location.href;
    expect(href).toContain('/authorize');
    expect(href).toContain('site_id=test-site');
    expect(href).toContain('provider=github');
    expect(href).toContain('state=');
  });
});
