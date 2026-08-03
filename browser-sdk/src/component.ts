import { STATE_COOKIE } from "./config";
import { resolveApiOrigin } from "./api-origin";
import { resolveSdkTexts, type SdkLang } from "./i18n";
import type { ProviderInfo } from "./types";
import {
  escapeHtml,
  escapeAttr,
  PROVIDER_ICONS,
  orderIndexOf,
  fetchSiteProviders,
} from "./provider-shared";

/**
 * <aardwin-auth site-id="…" i18n="…" api-origin="…" callback-path="…">
 *
 * Only `site-id` is required.
 * `i18n`（可选）：'zh' | 'en' 显式指定；缺省/非法值时按 `navigator.language` 检测（含 zh → 中文，否则英文），英文是 default。切换所有文案（按钮、错误、加载提示）。
 * `api-origin`（可选）：覆盖默认 api 入口 API_ORIGIN，用于本地开发
 * （仅覆盖 `/api/providers` 拉取入口与 `/authorize` 兜底，provider 的 authorizeEndpoint
 * 由 admin 在平台 provider 配置里维护，不受此属性影响）。
 * `callback-path`（可选）：显式指定 OAuth / email 回调路径；非空时追加 `return_url`
 * 到 bff 跳转 URL，缺省/空串时不发 `return_url`，bff 回退站点注册 callbackUrl（向后兼容）。
 *
 * Renders one button per provider registered for the site (fetched from
 * `GET ${apiOrigin ?? API_ORIGIN}/api/providers?site_id=…`). Each button records the provider's
 * authorizeEndpoint (api 返回的、admin 按 provider 配的 bff origin)，clicking sets the CSRF state cookie
 * and does a full-page redirect to `${authorizeEndpoint}/authorize?…` —— 微信跳国内
 * bff，Google 跳海外 bff。换码仍走 api `/api/oauth/token`（见 exchangeCode）。
 */
/** 错误态警示图标：16px 三角告警（currentColor，随 .error 的红色渲染）。 */
const WARN_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>';

/** Shadow-DOM scoped 设计系统（与 <aardwin-account> 同源 token —— 品牌化中性面）。
 *  每次 mount 都注入（loading/error 等非终态同样有品味），宿主可覆盖 --aa-*。 */
const STYLES = `
:host{
  display:block;
  /* 品牌化设计 token（与 <aardwin-account> 同源）——宿主可覆盖 --aa-* */
  --aa-fg:#16181d;--aa-muted:#5b616e;--aa-faint:#8a919e;
  --aa-border:#e3e6ea;--aa-border-strong:#c8cdd4;
  --aa-surface:#ffffff;--aa-surface-2:#f7f8fa;
  --aa-accent:#059669;--aa-focus:rgba(5,150,105,.30);
  --aa-radius:12px;
  color:var(--aa-fg);
  -webkit-font-smoothing:antialiased;
}
*,*::before,*::after{box-sizing:border-box}
.wrap{display:flex;flex-direction:column;gap:10px;width:100%}
/* 等宽全宽纵向列；描边按钮（前 5 个 provider） */
.btn{
  display:flex;align-items:center;justify-content:center;gap:9px;
  width:100%;box-sizing:border-box;min-height:44px;padding:10px 16px;
  border:1px solid var(--aa-border);border-radius:var(--aa-radius);
  background:var(--aa-surface);color:var(--aa-fg);
  font-size:14px;font-weight:500;font-family:inherit;line-height:1.2;
  cursor:pointer;
  transition:background-color .18s ease,border-color .18s ease,box-shadow .18s ease,transform .1s ease;
  animation:aa-rise .5s cubic-bezier(.16,1,.3,1) both;
  animation-delay:calc(var(--i,0) * 55ms);
}
.btn svg{flex-shrink:0}
.btn:hover{background:var(--aa-surface-2);border-color:var(--aa-border-strong);box-shadow:0 1px 2px rgba(16,24,40,.04),0 3px 10px rgba(16,24,40,.06)}
.btn:active{transform:scale(.98)}
.btn:focus-visible{outline:none;border-color:var(--aa-accent);box-shadow:0 0 0 3px var(--aa-focus)}
/* email：链接形态（无边框、透明底、hover 下划线）——品牌深绿文字 */
.btn-email{
  background:transparent;border:none;color:var(--aa-accent);
  min-height:36px;padding:7px 16px;box-shadow:none;
  animation-delay:calc(var(--i,0) * 55ms + 70ms);
}
.btn-email:hover{background:transparent;text-decoration:underline;box-shadow:none}
.btn-email:active{transform:scale(.98)}
.btn-email:focus-visible{box-shadow:0 0 0 3px var(--aa-focus)}
/* 骨架屏 loading（无 spinner，匹配按钮行高） */
.loading{display:flex;flex-direction:column;gap:10px;padding:2px 0}
.skel{height:44px;border-radius:var(--aa-radius);background:linear-gradient(90deg,#f1f2f4 25%,#f8f9fa 37%,#f1f2f4 63%);background-size:400% 100%;animation:aa-shimmer 1.4s ease-in-out infinite}
.skel:nth-child(2){animation-delay:.15s}
.skel:nth-child(3){animation-delay:.3s}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
/* 错误态：内联警示条（图标 + 文案） */
.error{
  display:flex;align-items:flex-start;gap:9px;padding:11px 13px;
  border:1px solid #f1d5d3;border-radius:var(--aa-radius);
  background:#fdf3f2;color:#b42318;
  font-size:13px;line-height:1.45;word-break:break-word;
}
.error svg{flex-shrink:0;margin-top:1px}
@keyframes aa-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes aa-shimmer{0%{background-position:100% 50%}100%{background-position:0 50%}}
@media(prefers-reduced-motion:reduce){.btn,.skel{animation:none}.btn{transition:none}}
`;

export class AardwinAuthElement extends HTMLElement {
  private readonly root: ShadowRoot;
  // H7: render race-guard. 每次 render 入口自增，fetch 返回后若 seq 不匹配，说明期间
  // 已有更新的 render（用户改了 site-id/i18n），旧 fetch 的 DOM 改写需丢弃。
  #renderSeq = 0;

  /** 错误事件：dispatch 到 host this（非 shadowRoot），composed:true 穿 Shadow DOM 到父页面。 */
  private emitError(phase: 'render' | 'start', message: string, provider?: string): void {
    const detail: { phase: 'render' | 'start'; message: string; provider?: string } = { phase, message };
    if (provider !== undefined) detail.provider = provider;
    this.dispatchEvent(new CustomEvent('aardwin:error', { bubbles: true, composed: true, detail }));
  }

  /** 就绪事件：providers 渲染成功后通知父页面。 */
  private emitReady(): void {
    this.dispatchEvent(new CustomEvent('aardwin:ready', { bubbles: true, composed: true }));
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  static get observedAttributes(): string[] {
    return ["site-id", "i18n", "api-origin", "callback-path"];
  }

  attributeChangedCallback(): void {
    if (this.isConnected) void this.render();
  }

  async connectedCallback(): Promise<void> {
    await this.render();
  }

  private async render(): Promise<void> {
    // H7: 自增 seq 拿本次 render 的 token；后续任何新 render 都会使该 token 失效。
    const seq = ++this.#renderSeq;
    const siteId = this.getAttribute("site-id")?.trim();
    // i18n 属性：与 site-id 同处读取，属性变化（observedAttributes 已声明）会触发
    // attributeChangedCallback → 重渲染。
    const texts = resolveSdkTexts(this.getAttribute("i18n"), navigator.language);
    // api-origin 属性覆盖默认 API_ORIGIN（api 入口）。空串/省略走常量。
    const apiOrigin = resolveApiOrigin(this.getAttribute("api-origin"));

    if (!siteId) {
      this.mount(`${WARN_SVG}<div class="error" role="alert">${escapeHtml(texts.missingSiteId)}</div>`);
      this.emitError('render', texts.missingSiteId);
      return;
    }

    this.mount(
      `<div class="loading" role="status"><div class="skel"></div><div class="skel"></div><div class="skel"></div><span class="sr-only">${escapeHtml(texts.loading)}</span></div>`,
    );

    // 拉取 + 校验 provider 列表抽出为共享 fetchSiteProviders（与 <aardwin-account> 复用），
    // 行为与原内联 fetch+校验逐行等价：网络/非 2xx/缺 data.providers 数组 → loadFailed。
    const fetched = await fetchSiteProviders(apiOrigin, siteId);
    // H7: fetch 完成（含 JSON 解析）后，最终 mount 前校验 seq。
    if (seq !== this.#renderSeq) return;
    if (!fetched.ok) {
      this.emitError('render', texts.loadFailed);
      this.mount(`${WARN_SVG}<div class="error" role="alert">${escapeHtml(texts.loadFailed)}</div>`);
      return;
    }
    const providers: ProviderInfo[] = fetched.providers;

    if (providers.length === 0) {
      this.emitError('render', texts.zeroChannels);
      this.mount(`${WARN_SVG}<div class="error" role="alert">${escapeHtml(texts.zeroChannels)}</div>`);
      return;
    }

    // M15: 过滤 authorizeEndpoint 为空的 provider，避免渲染跳不动的死按钮。
    // 注意 email 走的也是 authorizeEndpoint（api 由 DEFAULT_EMAIL_BFF_ORIGIN 兜底，
    // 见 share/constants.ts），所以这里不会误伤 email。
    const visibleProviders = providers.filter((p) => p.authorizeEndpoint);
    if (visibleProviders.length === 0) {
      // 可观性：api 返回了 provider 但全被空 endpoint 过滤掉，几乎肯定是
      // admin/platform-provider 配置漏了 bff_origin —— 打 warn 便于线上排障。
      console.warn(
        "[aardwin-sdk] filtered out providers with empty authorizeEndpoint:",
        providers.map((p) => p.id),
      );
      this.emitError('render', texts.zeroChannels);
      this.mount(`<div class="error">${escapeHtml(texts.zeroChannels)}</div>`);
      return;
    }

    // issue 6：固定顺序 Wechat → Google → Outlook → Github → Discord → Email。
    // api 未返回的天然不在 visibleProviders 里（跳过）；返回但不在该表的未知 provider
    // 落队尾、保持稳定相对顺序。authorizeEndpoint 空值过滤（M15）已在上游完成。
    const ordered = [...visibleProviders].sort(
      (a, b) => orderIndexOf(a.id) - orderIndexOf(b.id),
    );

    const buttons = ordered
      .map((p) => {
        const isEmail = p.id === "email";
        // email 与 OAuth 统一由 api 返回的 authorizeEndpoint（email-endpoint attribute 已移除）。
        const endpoint = p.authorizeEndpoint;
        // OAuth：「{prefix}{sep}{label}[{sep}{suffix}]」；sep: zh="" / en=" "。
        //   en → "Continue with Google"；zh → "使用微信继续"。
        // email 沿用独立文案 emailButton（Continue with Email / 继续使用邮箱）。
        const sep = texts.lang === "zh" ? "" : " ";
        const label = isEmail
          ? texts.emailButton
          : `${texts.continueWithPrefix}${sep}${texts.labels[p.id] ?? p.id}${
              texts.continueWithSuffix ? `${sep}${texts.continueWithSuffix}` : ""
            }`;
        // issue 6：每个 provider 配 16px 单色 SVG（currentColor），主题中立；未知 provider 无图标。
        const icon = PROVIDER_ICONS[p.id] ?? "";
        // 前 5 个：等宽全宽描边按钮；email：链接形态（无边框、透明底、整行可点、hover 下划线）。
        // 视觉：品牌化中性面 —— 12px 圆角 + 发丝边框 + 渐次入场（stagger，--i 逐项 55ms）。
        const cls = isEmail ? "btn btn-email" : "btn";
        const delay = ordered.findIndex((x) => x.id === p.id);
        return `<button class="${cls}" part="button" data-provider="${escapeAttr(p.id)}" data-endpoint="${escapeAttr(endpoint)}" style="--i:${delay}">${icon}${escapeHtml(label)}</button>`;
      })
      .join("");

    this.mount(`<div class="wrap">${buttons}</div>`);

    this.root.querySelectorAll<HTMLButtonElement>("button.btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const provider = btn.getAttribute("data-provider") ?? "";
        const endpoint = btn.getAttribute("data-endpoint") ?? "";
        this.startAuth(siteId, provider, endpoint, apiOrigin, texts.lang);
      });
    });

    // ready 在 click handler 绑定之后才发出，确保父页面 aardwin:ready 回调里
    // 同步 click 按钮能命中已绑定的 listener（而非无 listener 的空按钮）。
    this.emitReady();
  }

  /**
   * Generate state nonce, set the SameSite=Lax cookie, full-page redirect to the
   * provider's regional bff `/authorize`. endpoint 由 api 在 /api/providers 响应里给出，
   * 已去末尾 /；空 endpoint 时回退到 api-origin 属性（已解析，省略时即 API_ORIGIN）。
   *
   * state 生成 + cookie 设置在 OAuth/email 分岔之前无条件执行：email 验证码流程同样需要
   * /console/apps/callback 的 state 校验通过，否则 AppCallbackPage 会判 state_mismatch。
   * email 把 state 通过 query 透传给 bff，bff 在 邮箱登录表单全程携带，最终回到
   * callbackUrl?code=…&state=… 中与 OAuth 同形。
   */
  private startAuth(
    siteId: string,
    provider: string,
    endpoint: string,
    apiOrigin: string,
    lang: SdkLang,
  ): void {
    try {
      const state = randomState();
      document.cookie = `${STATE_COOKIE}=${state}; Path=/; Max-Age=1800; SameSite=Lax`;
      // callback-path 可选：非空时追加 return_url，缺省时保持原行为（bff 回退注册 callbackUrl）。
      const callbackPath = this.getAttribute("callback-path")?.trim();
      const returnUrl = callbackPath
        ? new URL(callbackPath, location.origin).href
        : undefined;
      if (provider === "email") {
        // email 验证码不走 /authorize 授权码流程，直达邮箱验证页；
        // state 走 query，由 bff 表单隐藏字段透传至最终回调。
        // lang 透传（issue 2）：bff email-auth 的 pickLang 先读 query.lang，
        // 使按钮语言与跳转后页面语言一致。
        let href = `${endpoint}/email-auth/${encodeURIComponent(siteId)}?state=${encodeURIComponent(state)}&lang=${encodeURIComponent(lang)}`;
        if (returnUrl) {
          href += `&return_url=${encodeURIComponent(returnUrl)}`;
        }
        window.location.href = href;
        return;
      }
      // lang 同样透传到 OAuth /authorize（issue 2），统一两条跳转的页面语言。
      const params = new URLSearchParams({ site_id: siteId, provider, state, lang });
      if (returnUrl) {
        params.set("return_url", returnUrl);
      }
      const base = endpoint || apiOrigin;
      window.location.href = `${base}/authorize?${params.toString()}`;
    } catch (err) {
      // insecure-context（crypto.getRandomValues 不可用）或 cookie 写入失败等：
      // 非静默，dispatch 错误事件 + shadow DOM 渲染错误文案。
      const message = err instanceof Error ? err.message : String(err);
      this.emitError('start', message, provider);
      const texts = resolveSdkTexts(this.getAttribute('i18n'), navigator.language);
      this.mount(`${WARN_SVG}<div class="error" role="alert">${escapeHtml(texts.loadFailed)}</div>`);
    }
  }

  private mount(html: string): void {
    // 每次挂载都注入 scoped 样式：loading/error 等「非终态」也走 mount，
    // 确保骨架屏、警示条同样有品味（与 <aardwin-account> 的 mount 同模式）。
    this.root.innerHTML = `<style>${STYLES}</style>${html}`;
  }
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

if (!customElements.get("aardwin-auth")) {
  customElements.define("aardwin-auth", AardwinAuthElement);
}
