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

    const src = `${manageUrl}?code=${encodeURIComponent(code)}`;

    this.mount(
      `<style>:host{display:block;width:100%}iframe{width:100%;border:0;min-height:400px}</style>
<iframe src="${escapeAttr(src)}" allow="scripts same-origin popups" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>`,
    );
  }

  private mount(html: string): void {
    this.root.innerHTML = html;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

if (!customElements.get("aardwin-account")) {
  customElements.define("aardwin-account", AardwinAccountElement);
}
