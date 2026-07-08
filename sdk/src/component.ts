import { STATE_COOKIE } from "./config";
import { resolveAardwinApiOrigin } from "./aardwin-api-origin";
import { resolveSdkTexts } from "./i18n";
import type { ProviderInfo } from "./types";

/**
 * <aardwin-auth site-id="…" i18n="…" aardwin-api-origin="…">
 *
 * Only `site-id` is required.
 * `i18n`（可选）：'zh' | 'en' 显式指定；缺省/非法值时按 `navigator.language` 检测（含 zh → 中文，否则英文），英文是 default。切换所有文案（按钮、错误、加载提示）。
 * `aardwin-api-origin`（可选）：覆盖默认 api 入口 AARDWIN_API_ORIGIN，用于本地开发
 * （仅覆盖 `/api/providers` 拉取入口与 `/authorize` 兜底，provider 的 authorizeEndpoint
 * 由 admin 在平台 provider 配置里维护，不受此属性影响）。
 *
 * Renders one button per provider registered for the site (fetched from
 * `GET ${apiOrigin ?? AARDWIN_API_ORIGIN}/api/providers?site_id=…`). Each button records the provider's
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
    return ["site-id", "i18n", "aardwin-api-origin"];
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
    // aardwin-api-origin 属性覆盖默认 AARDWIN_API_ORIGIN（api 入口）。空串/省略走常量。
    const apiOrigin = resolveAardwinApiOrigin(this.getAttribute("aardwin-api-origin"));

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

    const buttons = visibleProviders
      .map((p) => {
        const isEmail = p.id === "email";
        // email 与 OAuth 统一由 api 返回的 authorizeEndpoint（email-endpoint attribute 已移除）。
        const endpoint = p.authorizeEndpoint;
        const label = isEmail
          ? texts.emailButton
          : `${texts.labels[p.id] ?? p.id} ${texts.oauthSuffix}`;
        const icon = isEmail
          ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 4-10 8L2 4"/></svg>'
          : "";
        const cls = isEmail ? "btn btn-email" : "btn";
        return `<button class="${cls}" part="button" data-provider="${escapeAttr(p.id)}" data-endpoint="${escapeAttr(endpoint)}">${icon}${escapeHtml(label)}</button>`;
      })
      .join("");

    this.mount(
      `<style>:host{display:block}.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;margin:4px 4px 0 0;border:1px solid #d0d0d8;border-radius:8px;background:#fff;color:#222;cursor:pointer;font-size:14px;font-family:inherit}.btn:hover{background:#f5f5f7}.btn-email{background:#f8fafc;border:2px solid #e2e8f0;color:#475569;font-weight:500}.btn-email:hover{background:#f1f5f9;border-color:#cbd5e1}.loading,.error{padding:8px;color:#666}.error{color:#b91c1c}</style><div class="wrap">${buttons}</div>`,
    );

    this.root.querySelectorAll<HTMLButtonElement>("button.btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const provider = btn.getAttribute("data-provider") ?? "";
        const endpoint = btn.getAttribute("data-endpoint") ?? "";
        this.startAuth(siteId, provider, endpoint, apiOrigin);
      });
    });

    // ready 在 click handler 绑定之后才发出，确保父页面 aardwin:ready 回调里
    // 同步 click 按钮能命中已绑定的 listener（而非无 listener 的空按钮）。
    this.emitReady();
  }

  /**
   * Generate state nonce, set the SameSite=Lax cookie, full-page redirect to the
   * provider's regional bff `/authorize`. endpoint 由 api 在 /api/providers 响应里给出，
   * 已去末尾 /；空 endpoint 时回退到 aardwin-api-origin 属性（已解析，省略时即 AARDWIN_API_ORIGIN）。
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
  ): void {
    try {
      const state = randomState();
      document.cookie = `${STATE_COOKIE}=${state}; Path=/; Max-Age=1800; SameSite=Lax`;
      if (provider === "email") {
        // email 验证码不走 /authorize 授权码流程，直达邮箱验证页；
        // state 走 query，由 bff 表单隐藏字段透传至最终回调。
        window.location.href = `${endpoint}/email-auth/${encodeURIComponent(siteId)}?state=${encodeURIComponent(state)}`;
        return;
      }
      const params = new URLSearchParams({ site_id: siteId, provider, state });
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

if (!customElements.get("aardwin-auth")) {
  customElements.define("aardwin-auth", AardwinAuthElement);
}
