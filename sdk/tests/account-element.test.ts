import { describe, it, expect, afterEach } from 'bun:test';
import '../src/account-element';

function waitFor(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('aardwin-account — pure function tests', () => {
  it('class is defined as a custom element', () => {
    expect(customElements.get('aardwin-account')).toBeDefined();
  });

  it('observedAttributes returns code and manage-url', () => {
    const Klass = customElements.get('aardwin-account');
    expect(Klass).toBeDefined();
    expect((Klass as typeof HTMLElement).observedAttributes).toEqual(['code', 'manage-url']);
  });
});

describe('aardwin-account — missing attributes', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('missing code attribute shows error and dispatches aardwin:account-error', async () => {
    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('manage-url', 'https://auth.aard.win/account/manage');

    let event: CustomEvent | null = null;
    el.addEventListener('aardwin:account-error', (e: Event) => {
      event = e as CustomEvent;
    });

    document.body.appendChild(el);
    await waitFor(20);

    const shadow = (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot;
    expect(shadow?.innerHTML).toMatch(/requires a code attribute|需要 code 属性/);
    expect(event).not.toBeNull();
    expect((event!.detail as { message?: string }).message).toBeTruthy();
  });

  it('missing manage-url attribute shows error and dispatches aardwin:account-error', async () => {
    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('code', 'handoff_code');

    let event: CustomEvent | null = null;
    el.addEventListener('aardwin:account-error', (e: Event) => {
      event = e as CustomEvent;
    });

    document.body.appendChild(el);
    await waitFor(20);

    const shadow = (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot;
    expect(shadow?.innerHTML).toMatch(/requires a manage-url attribute|需要 manage-url 属性/);
    expect(event).not.toBeNull();
  });

  it('missing both attributes shows code error (first check)', async () => {
    const el = document.createElement('aardwin-account') as HTMLElement;
    document.body.appendChild(el);
    await waitFor(20);

    const shadow = (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot;
    expect(shadow?.innerHTML).toMatch(/requires a code attribute|需要 code 属性/);
  });
});

describe('aardwin-account — button rendering & redirect', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a button with manage account label', async () => {
    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('code', 'handoff_abc');
    el.setAttribute('manage-url', 'https://auth.aard.win/account/manage');
    document.body.appendChild(el);
    await waitFor(20);

    const shadow = (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot;
    const btn = shadow?.querySelector('button');
    expect(btn).toBeTruthy();
    expect(btn!.textContent).toMatch(/Manage account|管理账号/);
  });

  it('redirect URL contains ?code= and &return= with encoded current page', async () => {
    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('code', 'handoff_abc');
    el.setAttribute('manage-url', 'https://auth.aard.win/account/manage');
    document.body.appendChild(el);
    await waitFor(20);

    const shadow = (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot;
    const btn = shadow?.querySelector('button');
    expect(btn).toBeTruthy();

    let navigatedTo: string | null = null;
    const origHref = Object.getOwnPropertyDescriptor(window.location.__proto__, 'href')
      ?? Object.getOwnPropertyDescriptor(Location.prototype, 'href');
    Object.defineProperty(window.location, 'href', {
      set(v: string) { navigatedTo = v; },
      get() { return origHref?.get?.call(window.location) ?? 'http://localhost/'; },
      configurable: true,
    });

    btn!.click();

    expect(navigatedTo).toContain('https://auth.aard.win/account/manage?code=handoff_abc&return=');
    expect(navigatedTo).toMatch(/&return=.+/);

    if (origHref) {
      Object.defineProperty(window.location, 'href', origHref);
    }
  });

  it('encodes special characters in code for redirect URL', async () => {
    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('code', 'handoff a&b?c=d');
    el.setAttribute('manage-url', 'https://auth.aard.win/account/manage');
    document.body.appendChild(el);
    await waitFor(20);

    const shadow = (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot;
    const btn = shadow?.querySelector('button');
    expect(btn).toBeTruthy();

    let navigatedTo: string | null = null;
    const origHref = Object.getOwnPropertyDescriptor(window.location.__proto__, 'href')
      ?? Object.getOwnPropertyDescriptor(Location.prototype, 'href');
    Object.defineProperty(window.location, 'href', {
      set(v: string) { navigatedTo = v; },
      get() { return origHref?.get?.call(window.location) ?? 'http://localhost/'; },
      configurable: true,
    });

    btn!.click();

    expect(navigatedTo).toContain('?code=handoff%20a%26b%3Fc%3Dd&return=');

    if (origHref) {
      Object.defineProperty(window.location, 'href', origHref);
    }
  });

  it('captures return URL at click time, not mount time (SPA navigation)', async () => {
    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('code', 'handoff_abc');
    el.setAttribute('manage-url', 'https://auth.aard.win/account/manage');
    document.body.appendChild(el);
    await waitFor(20);

    const shadow = (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot;
    const btn = shadow?.querySelector('button');
    expect(btn).toBeTruthy();

    let navigatedTo: string | null = null;
    const origHref = Object.getOwnPropertyDescriptor(window.location.__proto__, 'href')
      ?? Object.getOwnPropertyDescriptor(Location.prototype, 'href');
    Object.defineProperty(window.location, 'href', {
      set(v: string) { navigatedTo = v; },
      get() { return 'http://localhost/dashboard/settings'; },
      configurable: true,
    });

    btn!.click();

    expect(navigatedTo).toContain('&return=' + encodeURIComponent('http://localhost/dashboard/settings'));

    if (origHref) {
      Object.defineProperty(window.location, 'href', origHref);
    }
  });
});
