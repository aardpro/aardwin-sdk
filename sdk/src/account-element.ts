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

// Shadow-DOM scoped 设计系统（与 <aardwin-auth> 同源 token —— 品牌化中性面）。
// 设计 token 集中在 :host（宿主可覆盖 --aa-*）；语义反馈色取高对比 tint，
// 保证 banner 文本在浅底上达 WCAG AA。组件渲染自带浅色表面，嵌入深色宿主底也可读。
const STYLES = `
:host{
  display:block;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;
  color:#16181d;line-height:1.5;
  -webkit-font-smoothing:antialiased;
  --aa-text:#16181d;--aa-muted:#5b616e;--aa-faint:#8a919e;
  --aa-border:#e3e6ea;--aa-border-strong:#c8cdd4;
  --aa-surface:#ffffff;--aa-surface-2:#f7f8fa;
  --aa-radius:10px;--aa-radius-sm:8px;--aa-focus:rgba(5,150,105,.30);--aa-accent:#059669;
  --aa-ok-fg:#1a7f37;--aa-ok-bg:#eaf8ef;--aa-ok-bd:#b8e6c8;
  --aa-err-fg:#b42318;--aa-err-bg:#fdf3f2;--aa-err-bd:#f1d5d3;
  --aa-warn-fg:#9a6700;--aa-warn-bg:#fff8c5;--aa-warn-bd:#f4ddb1;
  --aa-info-fg:#0550ae;--aa-info-bg:#ddf4ff;--aa-info-bd:#54aeff;
}
*,*::before,*::after{box-sizing:border-box;}

.account{display:flex;flex-direction:column;gap:14px;width:100%;}
.group-title{font-size:11px;font-weight:600;color:var(--aa-muted);letter-spacing:.05em;margin:0;}

/* 账号级 key/value（顶层 email） */
.row{display:flex;gap:8px;align-items:baseline;font-size:14px;}
.row-label{color:var(--aa-muted);font-size:13px;min-width:64px;}
.row-value{color:var(--aa-text);word-break:break-word;min-width:0;}

/* 加载 / 致命态（spinner 仅 loading；err 隐藏 spinner） */
.stub{display:flex;align-items:center;gap:9px;padding:8px 4px;font-size:13px;color:var(--aa-muted);}
.stub::before{content:"";width:14px;height:14px;border-radius:50%;border:2px solid var(--aa-border);border-top-color:var(--aa-accent);animation:aa-spin .7s linear infinite;flex-shrink:0;}
.stub.err{color:var(--aa-err-fg);}
.stub.err::before{display:none;}
@keyframes aa-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.stub::before{animation:none;}}

/* 内联反馈条（成功 / 失败 / 警告 / 信息）——克制、非原生 alert；图标为内联 SVG */
.banner{display:flex;align-items:flex-start;gap:9px;padding:10px 13px;border-radius:var(--aa-radius);font-size:13px;line-height:1.45;word-break:break-word;border:1px solid transparent;}
.banner svg{flex-shrink:0;margin-top:1px;}
.banner.ok{background:var(--aa-ok-bg);color:var(--aa-ok-fg);border-color:var(--aa-ok-bd);}
.banner.err{background:var(--aa-err-bg);color:var(--aa-err-fg);border-color:var(--aa-err-bd);}
.banner.warn{background:var(--aa-warn-bg);color:var(--aa-warn-fg);border-color:var(--aa-warn-bd);}
.banner.info{background:var(--aa-info-bg);color:var(--aa-info-fg);border-color:var(--aa-info-bd);}

/* 已绑 identity 列表——渐次入场（--i 逐项 50ms） */
.identities{display:flex;flex-direction:column;gap:9px;}
.identity{display:flex;align-items:center;gap:12px;padding:13px;border:1px solid var(--aa-border);border-radius:var(--aa-radius);background:var(--aa-surface);transition:background-color .18s ease,border-color .18s ease,box-shadow .18s ease,transform .1s ease;animation:aa-rise .45s cubic-bezier(.16,1,.3,1) both;animation-delay:calc(var(--i,0) * 50ms);}
.identity:hover{background:var(--aa-surface-2);border-color:var(--aa-border-strong);box-shadow:0 1px 2px rgba(16,24,40,.04),0 3px 10px rgba(16,24,40,.05);}
.identity:active{transform:scale(.995)}
.i-icon{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:34px;height:34px;border-radius:var(--aa-radius-sm);background:var(--aa-surface-2);border:1px solid var(--aa-border);color:var(--aa-muted);}
.i-main{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;}
.i-label{font-size:14px;font-weight:600;color:var(--aa-text);word-break:break-word;}
.i-nick,.i-date{font-size:12px;color:var(--aa-faint);word-break:break-word;}

/* 解绑——幽灵动作，悬停转危险色（克制但明确） */
.unbind{cursor:pointer;flex-shrink:0;padding:5px 10px;border:1px solid transparent;border-radius:var(--aa-radius-sm);background:transparent;color:var(--aa-muted);font-size:12px;font-weight:500;font-family:inherit;line-height:1.4;transition:background-color .15s ease,color .15s ease,border-color .15s ease,box-shadow .15s ease;min-height:30px;}
.unbind:hover{color:var(--aa-err-fg);background:var(--aa-err-bg);border-color:var(--aa-err-bd);}

/* 空态 */
.empty{padding:18px 14px;border:1px dashed var(--aa-border-strong);border-radius:var(--aa-radius);color:var(--aa-faint);font-size:13px;text-align:center;background:var(--aa-surface-2);}

/* 绑定按钮——与 <aardwin-auth> 同美学（44px 描边 / 16px 图标 / 渐次入场） */
.bind-group{display:flex;flex-direction:column;gap:8px;}
.bind-buttons{display:flex;flex-direction:column;gap:10px;}
.btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;box-sizing:border-box;min-height:44px;padding:10px 16px;border:1px solid var(--aa-border);border-radius:var(--aa-radius);background:var(--aa-surface);color:var(--aa-text);font-size:14px;font-weight:500;font-family:inherit;line-height:1.2;cursor:pointer;transition:background-color .18s ease,border-color .18s ease,box-shadow .18s ease,transform .1s ease;animation:aa-rise .5s cubic-bezier(.16,1,.3,1) both;animation-delay:calc(var(--i,0) * 50ms + 80ms);}
.btn svg{flex-shrink:0;}
.btn:hover{background:var(--aa-surface-2);border-color:var(--aa-border-strong);box-shadow:0 1px 2px rgba(16,24,40,.04),0 3px 10px rgba(16,24,40,.06);}
.btn:active{transform:scale(.98)}

/* 键盘聚焦环（品牌深绿，非 Primer 蓝） */
.btn:focus-visible,.unbind:focus-visible{outline:none;border-color:var(--aa-accent);box-shadow:0 0 0 3px var(--aa-focus);}

/* 禁用（请求进行中 / 已绑态） */
.btn:disabled,.unbind:disabled{opacity:.55;cursor:not-allowed;animation:none;}
.btn:disabled:hover,.unbind:disabled:hover{background:var(--aa-surface);border-color:var(--aa-border);color:var(--aa-muted);box-shadow:none;}

@keyframes aa-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@media(prefers-reduced-motion:reduce){.identity,.btn{animation:none}.identity:active{transform:none}}

/* 窄屏：行内边距与图标收紧，保持单列不溢出 */
@media(max-width:420px){.identity{gap:10px;padding:11px;}.i-icon{width:30px;height:30px;}}
`;

/** 语义 banner 图标（currentColor 描边 SVG，非 emoji）。 */
const ICON_OK =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="20 6 9 17 4 12"/></svg>';
const ICON_ERR =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18M6 6l12 12"/></svg>';

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
        this.mount(`<div class="stub err" role="alert">${escapeHtml(texts.missingAccountCode)}</div>`);
        this.emitError(texts.missingAccountCode, "session");
        return;
      }
      this.mount(`<div class="stub" role="status">${escapeHtml(texts.accountLoading)}</div>`);
      try {
        token = await this.ensureSession(apiOrigin, code);
        this.writeToken(token);
      } catch {
        if (seq !== this.#renderSeq) return;
        this.emitError(texts.accountError, "session");
        this.mount(`<div class="stub err" role="alert">${escapeHtml(texts.accountError)}</div>`);
        return;
      }
    }
    if (seq !== this.#renderSeq) return;

    // 2) 绑定回调 confirm：URL 带 ?pending & ?provider → confirm 后带反馈重载。
    const cb = this.readPendingCallback();
    if (cb) {
      // H9: 先清 URL 再 confirm——React StrictMode 会双重挂载 custom element，
      // render() 并发跑两次，两次都读到同一 ?pending=。若不清 URL 就 confirm，
      // 第一次 confirm 消费 pending 成功后第二次 confirm 拿 404（not_found）→ 覆盖掉成功。
      // 此处 IMMEDIATELY 从 URL 删除 ?pending & ?provider（同步），确保第二次 render()
      // readPendingCallback() 读到 null 跳过 confirm；实际 confirm 只执行一次。
      this.clearPendingFromUrl();
      this.mount(`<div class="stub" role="status">${escapeHtml(texts.accountLoading)}</div>`);
      let feedback: Feedback;
      try {
        await this.confirmLink(apiOrigin, token, cb.provider, cb.pending);
        feedback = { ok: true, text: texts.linkSuccess };
      } catch {
        feedback = { ok: false, text: texts.linkFailed };
      }
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
    this.mount(`<div class="stub" role="status">${escapeHtml(texts.accountLoading)}</div>`);

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
        this.mount(`<div class="stub err" role="alert">${escapeHtml(texts.sessionExpired)}</div>`);
        return;
      }
      this.emitError(texts.accountError, "identities");
      this.mount(`<div class="stub err" role="alert">${escapeHtml(texts.accountError)}</div>`);
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
      ? `<div class="banner ${feedback.ok ? "ok" : "err"}" role="${feedback.ok ? "status" : "alert"}">${feedback.ok ? ICON_OK : ICON_ERR}<span>${escapeHtml(feedback.text)}</span></div>`
      : "";
    const emailRow = email
      ? `<div class="row"><span class="row-label">${escapeHtml(texts.emailLabel)}</span><span class="row-value">${escapeHtml(email)}</span></div>`
      : "";
    const title = identities.length > 0
      ? `<div class="group-title">${escapeHtml(texts.identitiesTitle)}</div>`
      : "";
    const idsHtml = identities.length === 0
      ? `<div class="empty">${escapeHtml(texts.noIdentities)}</div>`
      : identities.map((i, idx) => this.identityRow(i, texts, idx)).join("");
    const bindHtml = bindable.length === 0
      ? ""
      : `<div class="bind-group"><div class="group-title">${escapeHtml(texts.bindTitle)}</div><div class="bind-buttons">${bindable
          .map((p, idx) => {
            const label = `${texts.bindPrefix}${sep}${texts.labels[p.id] ?? p.id}`;
            const icon = PROVIDER_ICONS[p.id] ?? "";
            return `<button class="btn bind-btn" part="button" data-bind="${escapeAttr(p.id)}" style="--i:${idx}">${icon}${escapeHtml(label)}</button>`;
          })
          .join("")}</div></div>`;

    this.mount(
      `<div class="account">${banner}${emailRow}${title}<div class="identities">${idsHtml}</div>${bindHtml}</div>`,
    );
  }

  private identityRow(i: Identity, texts: ReturnType<typeof resolveSdkTexts>, index: number): string {
    const label = texts.labels[i.provider] ?? i.provider;
    const icon = PROVIDER_ICONS[i.provider] ?? "";
    const sep = texts.lang === "zh" ? "" : " ";
    // 可见文案保持简短；aria-label 带 provider 名，让屏幕阅读器念出「解绑 GitHub」。
    const unbindAria = `${texts.unbindLabel}${sep}${label}`;
    // PII 白名单：provider / nickname / linkedAt（+ identityId 仅作 data 属性供解绑用，不展示）。
    const nick = i.nickname ? `<span class="i-nick">${escapeHtml(i.nickname)}</span>` : "";
    const date = i.linkedAt ? `<span class="i-date">${escapeHtml(texts.linkedAtPrefix + i.linkedAt)}</span>` : "";
    return `<div class="identity" data-identity-id="${escapeAttr(i.identityId)}" data-provider="${escapeAttr(i.provider)}" style="--i:${index}"><span class="i-icon">${icon}</span><span class="i-main"><span class="i-label">${escapeHtml(label)}</span>${nick}${date}</span><button class="unbind" data-unbind="${escapeAttr(i.identityId)}" aria-label="${escapeAttr(unbindAria)}">${escapeHtml(texts.unbindLabel)}</button></div>`;
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
    div.setAttribute("role", feedback.ok ? "status" : "alert");
    // 图标为静态 SVG 字符串（无用户数据）；文案走 textContent 天然防 XSS（无需 escapeHtml）。
    div.innerHTML = `${feedback.ok ? ICON_OK : ICON_ERR}<span class="banner-text"></span>`;
    div.querySelector(".banner-text")!.textContent = feedback.text;
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
    // 每次挂载都注入 scoped 样式：loading/error 等「非终态」也走 mount，
    // 确保加载 spinner、致命错误态同样有品味（旧实现仅在终态注入 <style>）。
    this.root.innerHTML = `<style>${STYLES}</style>${html}`;
  }
}

if (!customElements.get("aardwin-account")) {
  customElements.define("aardwin-account", AardwinAccountElement);
}
