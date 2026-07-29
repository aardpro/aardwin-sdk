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
      `<style>:host{display:block}button{cursor:pointer;padding:10px 20px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-size:14px}button:hover{background:#1d4ed8}</style>
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
