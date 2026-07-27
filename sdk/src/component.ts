import { STATE_COOKIE } from "./config";
import { resolveApiOrigin } from "./api-origin";
import { resolveSdkTexts, type SdkLang } from "./i18n";
import type { ProviderInfo } from "./types";

/**
 * <aardwin-auth site-id="…" i18n="…" api-origin="…">
 *
 * Only `site-id` is required.
 * `i18n`（可选）：'zh' | 'en' 显式指定；缺省/非法值时按 `navigator.language` 检测（含 zh → 中文，否则英文），英文是 default。切换所有文案（按钮、错误、加载提示）。
 * `api-origin`（可选）：覆盖默认 api 入口 API_ORIGIN，用于本地开发
 * （仅覆盖 `/api/providers` 拉取入口与 `/authorize` 兜底，provider 的 authorizeEndpoint
 * 由 admin 在平台 provider 配置里维护，不受此属性影响）。
 *
 * Renders one button per provider registered for the site (fetched from
 * `GET ${apiOrigin ?? API_ORIGIN}/api/providers?site_id=…`). Each button records the provider's
 * authorizeEndpoint (api 返回的、admin 按 provider 配的 bff origin)，clicking sets the CSRF state cookie
 * and does a full-page redirect to `${authorizeEndpoint}/authorize?…` —— 微信跳国内
 * bff，Google 跳海外 bff。换码仍走 api `/api/oauth/token`（见 exchangeCode）。
 */
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
    return ["site-id", "i18n", "api-origin"];
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
      this.mount(`<div class="error">${escapeHtml(texts.missingSiteId)}</div>`);
      this.emitError('render', texts.missingSiteId);
      return;
    }

    this.mount(`<div class="loading">${escapeHtml(texts.loading)}</div>`);

    let providers: ProviderInfo[];
    try {
      const res = await fetch(
        `${apiOrigin}/api/providers?site_id=${encodeURIComponent(siteId)}`,
      );
      // H8: 先判 HTTP 状态。非 2xx 时 res.json() 多半拿到错误体（HTML/JSON 错误），
      // 直接当 providers 解析会误把空 data 当成 "零渠道"，误导用户。统一展示 loadFailed。
      if (!res.ok) {
        if (seq !== this.#renderSeq) return;
        this.emitError('render', texts.loadFailed);
        this.mount(`<div class="error">${escapeHtml(texts.loadFailed)}</div>`);
        return;
      }
      // H8 延伸：HTTP 200 也可能是反代/WAF 返回的 HTML 错误页或破损体。
      // 只有"api 明确返回成功且 providers 数组确实存在"才进入后续流程；
      // 解析失败 / 缺 data 字段 → loadFailed（不再静默退化为 zeroChannels）。
      const json = (await res.json().catch(() => null)) as
        | { data?: { providers?: ProviderInfo[] } }
        | null;
      if (!json || !json.data || !Array.isArray(json.data.providers)) {
        if (seq !== this.#renderSeq) return;
        this.emitError('render', texts.loadFailed);
        this.mount(`<div class="error">${escapeHtml(texts.loadFailed)}</div>`);
        return;
      }
      providers = json.data.providers;
    } catch {
      // H7: fetch 抛错也要过 seq 守门，避免覆盖更新的 render 写入的 DOM。
      if (seq !== this.#renderSeq) return;
      this.emitError('render', texts.loadFailed);
      this.mount(`<div class="error">${escapeHtml(texts.loadFailed)}</div>`);
      return;
    }

    // H7: fetch 完成（含 JSON 解析）后，最终 mount 前再校验 seq。
    if (seq !== this.#renderSeq) return;

    if (providers.length === 0) {
      this.emitError('render', texts.zeroChannels);
      this.mount(`<div class="error">${escapeHtml(texts.zeroChannels)}</div>`);
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
        const cls = isEmail ? "btn btn-email" : "btn";
        return `<button class="${cls}" part="button" data-provider="${escapeAttr(p.id)}" data-endpoint="${escapeAttr(endpoint)}">${icon}${escapeHtml(label)}</button>`;
      })
      .join("");

    this.mount(
      `<style>:host{display:block}.wrap{display:flex;flex-direction:column;gap:10px;width:100%}.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;box-sizing:border-box;padding:11px 16px;border:1px solid #d0d7de;border-radius:8px;background:#fff;color:#24292f;font-size:14px;font-weight:500;font-family:inherit;cursor:pointer;transition:background-color .15s ease,border-color .15s ease,box-shadow .15s ease}.btn svg{flex-shrink:0}.btn:hover{background:#f6f8fa;border-color:#afb8c1}.btn-email{background:transparent;border:none;color:#0969da;padding:8px 16px}.btn-email:hover{background:transparent;text-decoration:underline}.loading,.error{padding:8px;color:#666}.error{color:#b91c1c}</style><div class="wrap">${buttons}</div>`,
    );

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
      if (provider === "email") {
        // email 验证码不走 /authorize 授权码流程，直达邮箱验证页；
        // state 走 query，由 bff 表单隐藏字段透传至最终回调。
        // lang 透传（issue 2）：bff email-auth 的 pickLang 先读 query.lang，
        // 使按钮语言与跳转后页面语言一致。
        window.location.href = `${endpoint}/email-auth/${encodeURIComponent(siteId)}?state=${encodeURIComponent(state)}&lang=${encodeURIComponent(lang)}`;
        return;
      }
      // lang 同样透传到 OAuth /authorize（issue 2），统一两条跳转的页面语言。
      const params = new URLSearchParams({ site_id: siteId, provider, state, lang });
      const base = endpoint || apiOrigin;
      window.location.href = `${base}/authorize?${params.toString()}`;
    } catch (err) {
      // insecure-context（crypto.getRandomValues 不可用）或 cookie 写入失败等：
      // 非静默，dispatch 错误事件 + shadow DOM 渲染错误文案。
      const message = err instanceof Error ? err.message : String(err);
      this.emitError('start', message, provider);
      const texts = resolveSdkTexts(this.getAttribute('i18n'), navigator.language);
      this.mount(`<div class="error">${escapeHtml(texts.loadFailed)}</div>`);
    }
  }

  private mount(html: string): void {
    this.root.innerHTML = html;
  }
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ' 故意不转义：所有属性值都用双引号包裹，无需单引号转义
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/**
 * Provider 按钮固定渲染顺序（issue 6）：Wechat → Google → Outlook → Github → Discord → Email。
 * api 未返回的不在 visibleProviders 内（天然跳过）；返回但不在该表的未知 provider 由
 * orderIndexOf 给 MAX_SAFE_INTEGER 落到队尾，配合引擎稳定 sort 保持相对顺序。
 */
const PROVIDER_ORDER = ["wechat", "google", "outlook", "github", "discord", "email"] as const;
function orderIndexOf(id: string): number {
  const i = (PROVIDER_ORDER as readonly string[]).indexOf(id);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

/**
 * 16px 单色品牌图标（issue 6）：内联 SVG，fill/stroke=currentColor，主题中立（浅底深底都好看）。
 * wechat/google/outlook/github/discord 取自 simple-icons（CC0）的 solid path（fill）；
 * email 用既有信封 outline（stroke）。未知 provider 无图标（render 里 ?? '' 兜底）。
 */
const PROVIDER_ICONS: Record<string, string> = {
  wechat:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg>',
  google:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>',
  outlook:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V10.85l1.24.72h.01q.1.07.18.18.07.12.07.25zm-6-8.25v3h3v-3zm0 4.5v3h3v-3zm0 4.5v1.83l3.05-1.83zm-5.25-9v3h3.75v-3zm0 4.5v3h3.75v-3zm0 4.5v2.03l2.41 1.5 1.34-.8v-2.73zM9 3.75V6h2l.13.01.12.04v-2.3zM5.98 15.98q.9 0 1.6-.3.7-.32 1.19-.86.48-.55.73-1.28.25-.74.25-1.61 0-.83-.25-1.55-.24-.71-.71-1.24t-1.15-.83q-.68-.3-1.55-.3-.92 0-1.64.3-.71.3-1.2.85-.5.54-.75 1.3-.25.74-.25 1.63 0 .85.26 1.56.26.72.74 1.23.48.52 1.17.81.69.3 1.56.3zM7.5 21h12.39L12 16.08V17q0 .41-.3.7-.29.3-.7.3H7.5zm15-.13v-7.24l-5.9 3.54Z"/></svg>',
  github:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
  discord:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>',
  email:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 4-10 8L2 4"/></svg>',
};

if (!customElements.get("aardwin-auth")) {
  customElements.define("aardwin-auth", AardwinAuthElement);
}
