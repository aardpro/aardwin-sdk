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

describe('aardwin-account — iframe rendering', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders iframe with src = manage-url?code=encodedCode', async () => {
    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('code', 'handoff_abc');
    el.setAttribute('manage-url', 'https://auth.aard.win/account/manage');
    document.body.appendChild(el);
    await waitFor(20);

    const shadow = (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot;
    const iframe = shadow?.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe!.getAttribute('src')).toBe(
      'https://auth.aard.win/account/manage?code=handoff_abc',
    );
  });

  it('encodes special characters in code', async () => {
    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('code', 'handoff a&b?c=d');
    el.setAttribute('manage-url', 'https://auth.aard.win/account/manage');
    document.body.appendChild(el);
    await waitFor(20);

    const shadow = (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot;
    const iframe = shadow?.querySelector('iframe');
    expect(iframe!.getAttribute('src')).toBe(
      'https://auth.aard.win/account/manage?code=handoff%20a%26b%3Fc%3Dd',
    );
  });

  it('iframe has sandbox attribute with allow-scripts allow-same-origin allow-popups', async () => {
    const el = document.createElement('aardwin-account') as HTMLElement;
    el.setAttribute('code', 'handoff_abc');
    el.setAttribute('manage-url', 'https://auth.aard.win/account/manage');
    document.body.appendChild(el);
    await waitFor(20);

    const shadow = (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot;
    const iframe = shadow?.querySelector('iframe');
    expect(iframe!.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe!.getAttribute('sandbox')).toContain('allow-same-origin');
    expect(iframe!.getAttribute('sandbox')).toContain('allow-popups');
  });

});
