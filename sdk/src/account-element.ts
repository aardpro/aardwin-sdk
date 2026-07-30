import { resolveApiOrigin } from "./api-origin";
import { resolveSdkTexts } from "./i18n";
import type { ProviderInfo } from "./types";
import {
  escapeHtml,
  escapeAttr,
  PROVIDER_ICONS,
  orderIndexOf,
  fetchSiteProviders,
} from "./provider-shared";

/**
 * <aardwin-account site-id="…" code="…" i18n="…" api-origin="…">
 *
 * 自包含的内联账号管理组件（与 `<aardwin-auth>` 同形：provider 拉取 / 排序 / 图标 / 转义 /
 * seq race-guard 全部复用 provider-shared）。**无 `manage-url`** —— 不再跳外部 manage 页，
 * 而是在 shadow DOM 内渲染：
 *   - 已绑 identity 列表（可解绑）；
 *   - 未绑 provider（排除 email）的绑定按钮。
 *
 * 属性：
 *   - `site-id`：拉 `GET /api/providers?site_id=` 决定可绑 provider。
 *   - `code`：一次性 handoff code（用于建会话；sessionStorage 已有 token 时不消费）。
 *   - `i18n`：'zh' | 'en'，缺省按 navigator.language 检测。
 *   - `api-origin`：覆盖默认 API_ORIGIN。
 *
 * 会话：`POST /api/account/session {code}` → access_token 存 sessionStorage（key=
 * aardwin_account_token）。优先复用已存 token；仅当无 token 且有 code 时才建会话（code 一次性，
 * ensureSession 按 code 值去重，避免多 render 并发重复消费）。
 *
 * 列已绑：`GET /api/account/identities`（Bearer）→ `{identities, email?}`。
 * 绑定：`POST /api/account/link/:provider {return_url}`（Bearer）→
 *   `{authorize_endpoint,state,link_token}` → 整页跳 `${authorize_endpoint}?provider=&state=&flow=link&link_token=`。
 *   OAuth provider 回跳带回 `?pending=&provider=`。
 * 回调 confirm：挂载时若 URL 带 `?pending`&`?provider` →
 *   `POST /api/account/link/:provider/confirm {pending_token}`（Bearer）→ 渲染成功/失败反馈，清 URL 参数，重载。
 * 解绑：`DELETE /api/account/identities/:identityId`（Bearer，带 confirm()）→ 重载。
 * 401（token 过期）：清 token + 渲染"会话过期，请刷新页面"（dashboard 每次加载重铸 handoff）。
 */

const SESSION_KEY = "aardwin_account_token";

/** 一条已绑 identity（GET /api/account/identities 的元素）。PII 仅渲染白名单字段。 */
interface Identity {
  provider: string;
  identityId: string;
  verifiedEmail?: string;
  nickname?: string;
  linkedAt?: string;
}

/** 绑定 / 解绑后的内联反馈条（成功 / 失败）。 */
interface Feedback {
  ok: boolean;
  text: string;
}

/** 鉴权 fetch 的非 2xx 错误，带 HTTP status（用于 401 判定）。 */
class AccountHttpError extends Error {
  status: number;
  constructor(status: number) {
    super(`account http ${status}`);
    this.name = "AccountHttpError";
    this.status = status;
  }
}

function isUnauthorized(e: unknown): boolean {
  return e instanceof AccountHttpError && e.status === 401;
}

const STYLES = `:host{display:block;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;color:#24292f}.account{display:flex;flex-direction:column;gap:14px;width:100%;box-sizing:border-box}.group-title{font-size:13px;font-weight:600;color:#57606a}.stub{padding:8px;color:#666}.stub.err{color:#b91c1c}.banner{padding:8px 12px;border-radius:8px;font-size:13px}.banner.ok{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}.banner.err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}.row{display:flex;gap:8px;font-size:14px;align-items:baseline}.row-label{color:#57606a;min-width:64px}.identities{display:flex;flex-direction:column;gap:8px}.identity{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #d0d7de;border-radius:8px;background:#fff}.i-icon{display:inline-flex;flex-shrink:0;color:#57606a}.i-main{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}.i-label{font-size:14px;font-weight:500;word-break:break-word}.i-nick,.i-date{font-size:12px;color:#6e7781;word-break:break-word}.unbind{cursor:pointer;padding:5px 10px;border:1px solid #d0d7de;border-radius:6px;background:#fff;color:#57606a;font-size:12px;font-family:inherit}.unbind:hover{background:#f6f8fa;border-color:#afb8c1}.unbind:disabled{opacity:.6;cursor:not-allowed}.empty{padding:8px;color:#6e7781;font-size:13px}.bind-buttons{display:flex;flex-direction:column;gap:10px}.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;box-sizing:border-box;padding:11px 16px;border:1px solid #d0d7de;border-radius:8px;background:#fff;color:#24292f;font-size:14px;font-weight:500;font-family:inherit;cursor:pointer;transition:background-color .15s ease,border-color .15s ease}.btn svg{flex-shrink:0}.btn:hover{background:#f6f8fa;border-color:#afb8c1}.btn:disabled{opacity:.6;cursor:not-allowed}`;

export class AardwinAccountElement extends HTMLElement {
  private readonly root: ShadowRoot;
  // 复用 aardwin-auth 的 render seq race-guard：属性切换（site-id/i18n/...）触发新 render
  // 时，旧 render 的 fetch 回调若 seq 不匹配，其 DOM 改写被丢弃，避免竞态覆盖。
  #renderSeq = 0;
  // 一次性 code 去重：同一 code 值的 ensureSession 只发起一次 POST，多次 render 复用同一
  // promise（成功/失败皆缓存），杜绝并发 render 重复消费 code。
  #sessionCode: string | null = null;
  #sessionPromise: Promise<string> | null = null;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  static get observedAttributes(): string[] {
    return ["site-id", "code", "i18n", "api-origin"];
  }

  attributeChangedCallback(): void {
    if (this.isConnected) void this.render();
  }

  async connectedCallback(): Promise<void> {
    await this.render();
  }

  /** 错误事件：dispatch 到 host（this），composed:true 穿 Shadow DOM 到父页面。 */
  private emitError(message: string, phase: string): void {
    this.dispatchEvent(
      new CustomEvent("aardwin:account-error", {
        bubbles: true,
        composed: true,
        detail: { phase, message },
      }),
    );
  }

  private async render(): Promise<void> {
    const seq = ++this.#renderSeq;
    const siteId = this.getAttribute("site-id")?.trim();
    const code = this.getAttribute("code")?.trim();
    const texts = resolveSdkTexts(this.getAttribute("i18n"), navigator.language);
    const apiOrigin = resolveApiOrigin(this.getAttribute("api-origin"));

    // 1) 解析 access token：优先 sessionStorage；无则用一次性 code 建会话。
    let token = this.readToken();
    if (!token) {
      if (!code) {
        this.mount(`<div class="stub err">${escapeHtml(texts.missingAccountCode)}</div>`);
        this.emitError(texts.missingAccountCode, "session");
        return;
      }
      this.mount(`<div class="stub">${escapeHtml(texts.accountLoading)}</div>`);
      try {
        token = await this.ensureSession(apiOrigin, code);
        this.writeToken(token);
      } catch {
        if (seq !== this.#renderSeq) return;
        this.emitError(texts.accountError, "session");
        this.mount(`<div class="stub err">${escapeHtml(texts.accountError)}</div>`);
        return;
      }
    }
    if (seq !== this.#renderSeq) return;

    // 2) 绑定回调 confirm：URL 带 ?pending & ?provider → confirm 后清 URL + 带反馈重载。
    const cb = this.readPendingCallback();
    if (cb) {
      this.mount(`<div class="stub">${escapeHtml(texts.accountLoading)}</div>`);
      let feedback: Feedback;
      try {
        await this.confirmLink(apiOrigin, token, cb.provider, cb.pending);
        feedback = { ok: true, text: texts.linkSuccess };
      } catch {
        // 任意 confirm 失败（含 401）都按契约清 URL + 重载 identities；
        // 若 token 已死（401），随后的 identities 拉取会落到 sessionExpired（并清 token）。
        feedback = { ok: false, text: texts.linkFailed };
      }
      this.clearPendingFromUrl();
      if (seq !== this.#renderSeq) return;
      await this.paintAll(apiOrigin, token, siteId, texts, seq, feedback);
      return;
    }

    // 3) 常规渲染：已绑列表 + 绑定按钮。
    await this.paintAll(apiOrigin, token, siteId, texts, seq, null);
  }

  /** 拉 identities（鉴权，fatal）+ providers（非 fatal）→ 计算 bindable → 渲染 + 绑事件。 */
  private async paintAll(
    apiOrigin: string,
    token: string,
    siteId: string | undefined,
    texts: ReturnType<typeof resolveSdkTexts>,
    seq: number,
    feedback: Feedback | null,
  ): Promise<void> {
    this.mount(`<div class="stub">${escapeHtml(texts.accountLoading)}</div>`);

    let identities: Identity[] = [];
    let email: string | undefined;
    try {
      const r = await this.fetchIdentities(apiOrigin, token);
      identities = r.identities;
      email = r.email;
    } catch (e) {
      if (seq !== this.#renderSeq) return;
      if (isUnauthorized(e)) {
        this.writeToken(null);
        this.emitError(texts.sessionExpired, "identities");
        this.mount(`<div class="stub err">${escapeHtml(texts.sessionExpired)}</div>`);
        return;
      }
      this.emitError(texts.accountError, "identities");
      this.mount(`<div class="stub err">${escapeHtml(texts.accountError)}</div>`);
      return;
    }
    if (seq !== this.#renderSeq) return;

    // providers（决定可绑按钮）——失败非 fatal：仅不渲染绑定区。
    let providers: ProviderInfo[] = [];
    if (siteId) {
      const pr = await fetchSiteProviders(apiOrigin, siteId);
      if (seq !== this.#renderSeq) return;
      if (pr.ok) providers = pr.providers;
    }

    // 绑定按钮 = 站点 provider − 已绑 − email，按固定顺序排。
    const bound = new Set(identities.map((i) => i.provider));
    const bindable = providers
      .filter((p) => p.id !== "email" && !bound.has(p.id))
      .sort((a, b) => orderIndexOf(a.id) - orderIndexOf(b.id));

    this.mountIdentities({ identities, email, bindable, texts, feedback });
    this.bindActions(apiOrigin, token, texts);
  }

  private mountIdentities(ctx: {
    identities: Identity[];
    email?: string;
    bindable: ProviderInfo[];
    texts: ReturnType<typeof resolveSdkTexts>;
    feedback: Feedback | null;
  }): void {
    const { identities, email, bindable, texts, feedback } = ctx;
    const sep = texts.lang === "zh" ? "" : " ";

    const banner = feedback
      ? `<div class="banner ${feedback.ok ? "ok" : "err"}">${escapeHtml(feedback.text)}</div>`
      : "";
    const emailRow = email
      ? `<div class="row"><span class="row-label">${escapeHtml(texts.emailLabel)}</span><span class="row-value">${escapeHtml(email)}</span></div>`
      : "";
    const title = identities.length > 0
      ? `<div class="group-title">${escapeHtml(texts.identitiesTitle)}</div>`
      : "";
    const idsHtml = identities.length === 0
      ? `<div class="empty">${escapeHtml(texts.noIdentities)}</div>`
      : identities.map((i) => this.identityRow(i, texts)).join("");
    const bindHtml = bindable.length === 0
      ? ""
      : `<div class="bind-group"><div class="group-title">${escapeHtml(texts.bindTitle)}</div><div class="bind-buttons">${bindable
          .map((p) => {
            const label = `${texts.bindPrefix}${sep}${texts.labels[p.id] ?? p.id}`;
            const icon = PROVIDER_ICONS[p.id] ?? "";
            return `<button class="btn bind-btn" part="button" data-bind="${escapeAttr(p.id)}">${icon}${escapeHtml(label)}</button>`;
          })
          .join("")}</div></div>`;

    this.mount(
      `<style>${STYLES}</style><div class="account">${banner}${emailRow}${title}<div class="identities">${idsHtml}</div>${bindHtml}</div>`,
    );
  }

  private identityRow(i: Identity, texts: ReturnType<typeof resolveSdkTexts>): string {
    const label = texts.labels[i.provider] ?? i.provider;
    const icon = PROVIDER_ICONS[i.provider] ?? "";
    // PII 白名单：provider / nickname / linkedAt（+ identityId 仅作 data 属性供解绑用，不展示）。
    const nick = i.nickname ? `<span class="i-nick">${escapeHtml(i.nickname)}</span>` : "";
    const date = i.linkedAt ? `<span class="i-date">${escapeHtml(texts.linkedAtPrefix + i.linkedAt)}</span>` : "";
    return `<div class="identity" data-identity-id="${escapeAttr(i.identityId)}" data-provider="${escapeAttr(i.provider)}"><span class="i-icon">${icon}</span><span class="i-main"><span class="i-label">${escapeHtml(label)}</span>${nick}${date}</span><button class="unbind" data-unbind="${escapeAttr(i.identityId)}">${escapeHtml(texts.unbindLabel)}</button></div>`;
  }

  private bindActions(
    apiOrigin: string,
    token: string,
    texts: ReturnType<typeof resolveSdkTexts>,
  ): void {
    // 绑定按钮：POST link → 整页跳转；失败则内联反馈条 + emit。
    this.root.querySelectorAll<HTMLButtonElement>("button.bind-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const provider = btn.getAttribute("data-bind") ?? "";
        btn.disabled = true;
        void this.startLink(apiOrigin, token, provider).catch((e) => {
          btn.disabled = false;
          if (isUnauthorized(e)) {
            this.writeToken(null);
            this.showBanner({ ok: false, text: texts.sessionExpired });
            this.emitError(texts.sessionExpired, "link");
            return;
          }
          this.showBanner({ ok: false, text: texts.linkFailed });
          this.emitError(texts.linkFailed, "link");
        });
      });
    });

    // 解绑按钮：confirm() → DELETE → 重载；失败则内联反馈条 + emit。
    this.root.querySelectorAll<HTMLButtonElement>("button.unbind").forEach((btn) => {
      btn.addEventListener("click", () => {
        const identityId = btn.getAttribute("data-unbind") ?? "";
        const provider = btn.closest(".identity")?.getAttribute("data-provider") ?? "";
        const label = texts.labels[provider] ?? provider;
        // 用函数 replacer 避免 label 里的 $ 被当替换模式（provider id 不可控）。
        if (!this.confirmDialog(texts.confirmUnbind.replace("{p}", () => label))) return;
        btn.disabled = true;
        void this.deleteIdentity(apiOrigin, token, identityId)
          .then(() => {
            void this.render();
          })
          .catch((e) => {
            btn.disabled = false;
            if (isUnauthorized(e)) {
              this.writeToken(null);
              this.showBanner({ ok: false, text: texts.sessionExpired });
              this.emitError(texts.sessionExpired, "unbind");
              return;
            }
            this.showBanner({ ok: false, text: texts.unbindFailed });
            this.emitError(texts.unbindFailed, "unbind");
          });
      });
    });
  }

  private showBanner(feedback: Feedback): void {
    const account = this.root.querySelector(".account");
    if (!account) return;
    account.querySelector(".banner")?.remove();
    const div = document.createElement("div");
    div.className = `banner ${feedback.ok ? "ok" : "err"}`;
    // textContent 赋值天然防 XSS（无需 escapeHtml）。
    div.textContent = feedback.text;
    account.insertBefore(div, account.firstChild);
  }

  // ---- 会话 ----

  /** 按 code 去重的建会话：同 code 只 POST 一次，promise 缓存（成功/失败）。 */
  private ensureSession(apiOrigin: string, code: string): Promise<string> {
    if (code !== this.#sessionCode) {
      this.#sessionCode = code;
      this.#sessionPromise = this.createSession(apiOrigin, code);
    }
    return this.#sessionPromise as Promise<string>;
  }

  /** POST /api/account/session {code}（跨域，非鉴权）→ access_token。 */
  private async createSession(apiOrigin: string, code: string): Promise<string> {
    const res = await fetch(`${apiOrigin}/api/account/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new AccountHttpError(res.status);
    const raw = (await res.json().catch(() => null)) as
      | { data?: { access_token?: string }; access_token?: string }
      | null;
    const token = raw?.data?.access_token ?? raw?.access_token;
    if (!token || typeof token !== "string") throw new AccountHttpError(res.status);
    return token;
  }

  // ---- 回调 confirm ----

  private readPendingCallback(): { provider: string; pending: string } | null {
    const params = new URLSearchParams(window.location.search);
    const pending = params.get("pending");
    const provider = params.get("provider");
    return pending && provider ? { provider, pending } : null;
  }

  /** 清掉 URL 里的 ?pending & ?provider（保留宿主页其它 query）。 */
  private clearPendingFromUrl(): void {
    try {
      const params = new URLSearchParams(window.location.search);
      params.delete("pending");
      params.delete("provider");
      const qs = params.toString();
      const url = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      window.history.replaceState(null, "", url);
    } catch {
      /* location/history 不可写时忽略（不影响 confirm 已完成） */
    }
  }

  /** POST /api/account/link/:provider/confirm {pending_token}（Bearer）。 */
  private async confirmLink(
    apiOrigin: string,
    token: string,
    provider: string,
    pendingToken: string,
  ): Promise<void> {
    await this.authedRequest(apiOrigin, token, "POST", `/api/account/link/${encodeURIComponent(provider)}/confirm`, {
      pending_token: pendingToken,
    });
  }

  // ---- identities / bind / unbind ----

  /** GET /api/account/identities（Bearer）→ {identities, email?}。 */
  private async fetchIdentities(
    apiOrigin: string,
    token: string,
  ): Promise<{ identities: Identity[]; email?: string }> {
    const raw = (await this.authedRequest(apiOrigin, token, "GET", "/api/account/identities")) as
      | { data?: { identities?: Identity[]; email?: string }; identities?: Identity[]; email?: string }
      | null;
    const payload = raw?.data ?? raw ?? {};
    const identities = Array.isArray(payload.identities) ? payload.identities : [];
    return { identities, email: payload.email };
  }

  /** POST /api/account/link/:provider {return_url}（Bearer）→ 整页跳 authorize_endpoint。 */
  private async startLink(apiOrigin: string, token: string, provider: string): Promise<void> {
    const returnUrl = window.location.origin + window.location.pathname;
    const raw = (await this.authedRequest(apiOrigin, token, "POST", `/api/account/link/${encodeURIComponent(provider)}`, {
      return_url: returnUrl,
    })) as
      | {
          data?: { authorize_endpoint?: string; state?: string; link_token?: string };
          authorize_endpoint?: string;
          state?: string;
          link_token?: string;
        }
      | null;
    const payload = raw?.data ?? raw ?? {};
    const ep = payload.authorize_endpoint;
    if (!ep) throw new Error("missing authorize_endpoint");
    const params = new URLSearchParams({
      provider,
      state: payload.state ?? "",
      flow: "link",
      link_token: payload.link_token ?? "",
    });
    // 整页跳走；session access_token 留在 sessionStorage，回跳后 confirm 复用。
    window.location.href = `${ep}?${params.toString()}`;
  }

  /** DELETE /api/account/identities/:identityId（Bearer）。 */
  private async deleteIdentity(apiOrigin: string, token: string, identityId: string): Promise<void> {
    await this.authedRequest(apiOrigin, token, "DELETE", `/api/account/identities/${encodeURIComponent(identityId)}`);
  }

  /** 统一鉴权 fetch：Bearer 头；非 2xx 抛 AccountHttpError（带 status，供 401 判定）。 */
  private async authedRequest(
    apiOrigin: string,
    token: string,
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${apiOrigin}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new AccountHttpError(res.status);
    if (res.status === 204) return null;
    return await res.json().catch(() => null);
  }

  // ---- 小工具 ----

  private confirmDialog(msg: string): boolean {
    return typeof confirm === "function" ? confirm(msg) : false;
  }

  private readToken(): string | null {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  }

  private writeToken(token: string | null): void {
    try {
      if (token) sessionStorage.setItem(SESSION_KEY, token);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* sessionStorage 不可写时忽略（token 仅缓存优化，非安全边界） */
    }
  }

  private mount(html: string): void {
    this.root.innerHTML = html;
  }
}

if (!customElements.get("aardwin-account")) {
  customElements.define("aardwin-account", AardwinAccountElement);
}
