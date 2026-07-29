import { resolveSdkTexts } from "./i18n";

export class AardwinAccountElement extends HTMLElement {
  private readonly root: ShadowRoot;

  private emitError(message: string): void {
    this.dispatchEvent(new CustomEvent('aardwin:account-error', {
      bubbles: true,
      composed: true,
      detail: { message },
    }));
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  static get observedAttributes(): string[] {
    return ["code", "manage-url"];
  }

  attributeChangedCallback(): void {
    if (this.isConnected) void this.render();
  }

  async connectedCallback(): Promise<void> {
    await this.render();
  }

  private async render(): Promise<void> {
    const code = this.getAttribute("code")?.trim();
    const manageUrl = this.getAttribute("manage-url")?.trim();
    const texts = resolveSdkTexts(this.getAttribute("i18n"), navigator.language);

    if (!code) {
      const msg = texts.missingAccountCode;
      this.mount(`<div class="error">${escapeHtml(msg)}</div>`);
      this.emitError(msg);
      return;
    }

    if (!manageUrl) {
      const msg = texts.missingManageUrl;
      this.mount(`<div class="error">${escapeHtml(msg)}</div>`);
      this.emitError(msg);
      return;
    }

    this.mount(
      `<style>:host{display:block}button{cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:10px 22px;border:none;border-radius:10px;background:#6366f1;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;font-weight:500;line-height:1.4;letter-spacing:0.01em;box-shadow:0 1px 3px rgba(99,102,241,.3),0 1px 2px rgba(0,0,0,.06);transition:background .15s ease,box-shadow .15s ease,transform .1s ease}button:hover{background:#4f46e5;box-shadow:0 4px 12px rgba(99,102,241,.35),0 1px 3px rgba(0,0,0,.08)}button:active{background:#4338ca;transform:scale(.97)}button:focus-visible{outline:2px solid #6366f1;outline-offset:2px}button:disabled{background:#c7d2fe;color:#6b7280;cursor:not-allowed;box-shadow:none;transform:none}@media(max-width:480px){button{width:100%;justify-content:center;padding:12px 20px;font-size:15px}}</style>
<button part="button">${escapeHtml(texts.manageAccountButton)}</button>`,
    );

    this.root.querySelector("button")!.addEventListener("click", () => {
      location.href = `${manageUrl}?code=${encodeURIComponent(code)}&return=${encodeURIComponent(location.href)}`;
    });
  }

  private mount(html: string): void {
    this.root.innerHTML = html;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

if (!customElements.get("aardwin-account")) {
  customElements.define("aardwin-account", AardwinAccountElement);
}
