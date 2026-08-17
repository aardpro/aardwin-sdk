# aardwin browser SDK — full integration guide

**English** | [中文](./SDK.zh-CN.md)

The [browser-sdk README](./README.md) is the short onboarding. This file is the complete integration guide: how the OAuth2 authorization-code flow works, what `<aardwin-auth>` and `<aardwin-account>` do, and exactly what your backend callback route must implement.

---
## How the flow works

```text
  ┌─────────────────┐
  │  Your login page │  <aardwin-auth site-id="…">
  │  (same host as   │  fetches GET /api/providers?site_id=…
  │   callbackUrl)   │  renders one button per provider
  └────────┬────────┘
           │ click
           │ sets aard_win_auth_state cookie (SameSite=Lax)
           ▼
  ┌─────────────────┐      ┌──────────────┐      ┌──────────────┐
  │ aardwin bff      │ ──▶ │   provider   │ ──▶ │   provider   │
  │ /authorize       │ scan │  (WeChat/etc)│ auth │  returns code│
  └────────┬────────┘      └──────────────┘      └──────────────┘
           │ 302 redirect to your registered callbackUrl
           │ ?code=<one-time>&state=<nonce>
           ▼
  ┌─────────────────┐
  │ Your callback    │  1. read aard_win_auth_state cookie
  │ route            │  2. timingSafeEqual(state cookie, state param)
  │                  │  3. POST /api/oauth/token {site_id,code,client_secret}
  │                  │  4. mint your own session, redirect to app
  └─────────────────┘
```

There is **no iframe** and **no postMessage**. The provider scan happens via a full-page redirect, and the one-time code is handed back to your backend callback route. Your route verifies the `state` nonce and exchanges the code with `@aardwin/auth-server`.

---
## Quickstart

### 1. Register your site on https://aard.win

You receive / configure:

- `siteId` — public, goes in the `<aardwin-auth>` tag.
- `clientSecret` — server-only, used in `exchangeCode()`.
- The **provider list** (wechat / google / github / outlook / discord / email).
- Your **callbackUrl** — the route that receives `?code=&state=`.

The provider list and callbackUrl are stored on the site record; the tag fetches providers dynamically.

### 2. Install

```bash
npm install @aardwin/auth-browser
```

```ts
import '@aardwin/auth-browser'; // registers <aardwin-auth> and <aardwin-account>
```

### 3. Place the tag on your login page

```html
<aardwin-auth site-id="YOUR_SITE_ID"></aardwin-auth>
```

### 4. Implement the callback route

The route is framework-agnostic; the snippet below uses the Web Fetch API. Adapt it to Astro, Next.js, Hono, Express, etc.

```ts
import { exchangeCode, AardwinError } from '@aardwin/auth-server';
import { timingSafeEqual } from 'node:crypto';

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const stateParam = url.searchParams.get('state');
  const code = url.searchParams.get('code');

  // 1. Read the state cookie that <aardwin-auth> set before the redirect.
  const cookieHeader = req.headers.get('cookie') ?? '';
  const stateCookie = parseCookie(cookieHeader, 'aard_win_auth_state');

  // 2. Constant-time compare. Mismatch → 400 (do NOT call exchangeCode).
  if (!stateCookie || !code || !safeStateEqual(stateCookie, stateParam)) {
    return new Response('bad state', { status: 400 });
  }

  // 3. Exchange the one-time code. ONE-SHOT — do not retry on failure.
  try {
    const user = await exchangeCode({
      code,
      siteId: process.env.AARD_SITE_ID!,
      clientSecret: process.env.AARDWIN_CLIENT_SECRET,
    });

    // 4. Mint YOUR session, set the session cookie, then redirect.
    const session = await createSession(user.user_id);
    const res = Response.redirect(new URL('/dashboard', url), 303);
    res.headers.append('set-cookie',
      `sid=${session.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${session.ttl}`);
    res.headers.append('set-cookie',
      'aard_win_auth_state=; Max-Age=0; Path=/'); // delete the consumed state cookie
    return res;
  } catch (e) {
    if (e instanceof AardwinError) {
      return new Response('auth failed: ' + e.message, { status: 400 });
    }
    throw e;
  }
}

function parseCookie(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function safeStateEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

async function createSession(userId: string): Promise<{ token: string; ttl: number }> {
  // ... your session store ...
  return { token: '...', ttl: 86400 };
}
```

The backend exchange helper lives in the separate package [`@aardwin/auth-server`](../server-sdk/README.md). The browser package no longer ships a server entry.

---
## State verification is your responsibility

The browser SDK only sets the cookie. **It does not verify state for you.** Your callback route must:

1. Read the cookie named `aard_win_auth_state`.
2. Compare it with the `?state=` query parameter using a constant-time comparison.
3. Consume it exactly once: delete the cookie after a successful exchange.
4. Return `400` on mismatch — do not proceed to `exchangeCode()`.

Cookie properties set by `<aardwin-auth>`:

| Property | Value |
|----------|-------|
| Name | `aard_win_auth_state` |
| Path | `/` |
| SameSite | `Lax` |
| Max-Age | `1800` seconds (30 minutes) |
| `Domain` | omitted — host-only cookie |

Because the cookie is host-only, the login page and the callback URL **must be on the same host**.

---
## `<aardwin-auth>` props reference

Only `site-id` is required.

| Attribute | Required | Type | Description |
|-----------|----------|------|-------------|
| `site-id` | yes | `string` | Site ID created in the aardwin console |
| `i18n` | no | `'zh' \| 'en'` | Explicit language. Omitted/invalid falls back to `navigator.language` detection; defaults to English |
| `callback-path` | no | `string` | Explicit OAuth/email callback path. Non-empty appends `return_url` to the bff redirect URL; empty/absent falls back to the registered callbackUrl |

For React type completion, opt in with `import '@aardwin/auth-browser/react.d.ts';` (React 18 / React 19 / Next.js 15). For Preact, Solid, or Vue JSX, add your own `JSX.IntrinsicElements` declaration.

CDN / zero build:

```html
<script src="/aardwin-auth.iife.js"></script>
<aardwin-auth site-id="YOUR_SITE_ID"></aardwin-auth>
```

The CDN URL will be published when the first stable IIFE build is released. For local testing, copy `dist/aardwin-auth.iife.js` into your `public/` folder.

---
## `<aardwin-account>` component

`<aardwin-account>` is a self-contained inline account-management Web Component. It renders inside Shadow DOM on whatever page hosts the tag. There is **no hosted manage page** and **no `manage-url`**.

It needs a one-time handoff code minted server-side via `createAccountHandoff()` from `@aardwin/auth-server`. The code is single-use and expires in 60 seconds, so mint it on demand when the user opens the account page — not at login.

```html
<aardwin-account site-id="YOUR_SITE_ID" code="ONE_TIME_HANDOFF_CODE"></aardwin-account>
```

```ts
import { createAardwinClient } from '@aardwin/auth-server';

const client = createAardwinClient({
  siteId: process.env.AARDWIN_SITE_ID,
  clientSecret: process.env.AARDWIN_CLIENT_SECRET, // server-only
});

const { code, expiresIn } = await client.createAccountHandoff({ userId: session.userId });
// pass `code` to the browser and render <aardwin-account site-id code>
```

### `<aardwin-account>` props

| Attribute | Required | Description |
|-----------|----------|-------------|
| `site-id` | yes | Site ID; decides which providers can be bound |
| `code` | yes | One-time handoff code from `createAccountHandoff()`. Not consumed if a token is already cached in `sessionStorage` |
| `i18n` | no | `'zh' \| 'en'`, defaults to `navigator.language` detection |

### Lifecycle

1. Resolves an access token: reuses a cached token in `sessionStorage` (`aardwin_account_token`), or, if there is no token and a fresh `code` is present, calls `POST /api/account/session {code}` and stores the returned `access_token`.
2. If the page URL carries `?pending` and `?provider` (returning from an OAuth provider), calls `POST /api/account/link/:provider/confirm {pending_token}` with the Bearer token, clears the URL params, and re-renders with a success/failure banner.
3. Otherwise renders the current state: `GET /api/account/identities` (Bearer) → bound identity list with an **Unbind** button each, plus bind buttons for the remaining site providers (excluding `email` and already-bound providers).

Bind and unbind behavior:

- **Bind**: `POST /api/account/link/:provider {return_url: <this page's URL>}` (Bearer) → full-page redirect to the provider's authorize endpoint. The OAuth callback returns to the same page with `?pending=&provider=`, handled by step 2.
- **Unbind**: `DELETE /api/account/identities/:identityId` (Bearer) after a native `confirm()` prompt.
- **Token expired (401)**: the cached token is cleared and a "session expired, refresh the page" message is shown. Re-mint the handoff code on the next dashboard load.

### Error events

Missing `code` with no cached token, session creation, fetch, bind, unbind, and token-expiration failures all dispatch `aardwin:account-error` (`bubbles: true, composed: true`). The `detail.phase` field distinguishes the source:

```ts
el.addEventListener('aardwin:account-error', (e) => {
  console.log(e.detail.phase, e.detail.message);
});
```

---
## Provider routing table

The component does not hardcode provider URLs. It calls `GET /api/providers?site_id=` and receives one `authorizeEndpoint` per provider. The platform routes providers automatically:

| Provider | Regional bff node |
|----------|-------------------|
| WeChat | China node (domestic bff) |
| Google, GitHub, Outlook, Discord | Global node (overseas bff) |
| email | Email endpoint served by the configured bff origin |

You do not need to handle this routing yourself. The button click redirects to `${authorizeEndpoint}/authorize?site_id=&provider=&state=&lang=` (or the email-specific entry point for `email`). The code exchange always goes to `POST /api/oauth/token` on the API origin.

---
## Contract reference

| Endpoint | Who calls | Purpose |
|----------|-----------|---------|
| `GET /api/providers?site_id=` | browser SDK → API | Provider list + per-provider `authorizeEndpoint`; validates Origin |
| `GET {authorizeEndpoint}/authorize?site_id=&provider=&state=` | browser → regional bff | Renders scan; 302→callbackUrl `?code=&state=` |
| `POST /api/oauth/token` | your backend → API | `{ site_id, code, client_secret }` → user identity |
| `POST /api/account/session` | browser SDK → API | `{ code }` → `{ access_token }` |
| `GET /api/account/identities` | browser SDK → API | Bearer token → bound identities |
| `POST /api/account/link/:provider` | browser SDK → API | Bearer + `{ return_url }` → redirect to bind provider |
| `POST /api/account/link/:provider/confirm` | browser SDK → API | Bearer + `{ pending_token }` → confirm binding |
| `DELETE /api/account/identities/:identityId` | browser SDK → API | Bearer → unbind identity |

---
## Troubleshooting

### Buttons do not render

Open the browser DevTools Network panel and check `GET /api/providers?site_id=...`:

- Confirm the response status is **200**.
- Confirm the response body has a non-empty `data.providers` array. An empty array means the site has no providers configured in the console.

### Iframe or embedded webview blocks the redirect

`<aardwin-auth>` performs a full-page redirect via `window.location.href`. If the login page is loaded inside an iframe or in-app webview that restricts top-level navigation, the OAuth provider may refuse the flow or the redirect may fail. Host the login page at a top-level browsing context.

### State mismatch

- Check that the `aard_win_auth_state` cookie is set (`Path=/`, `SameSite=Lax`, `Max-Age=1800`).
- Confirm the `?state=` query parameter matches the cookie value exactly.
- Confirm the login page and callback URL are on the **same host**. The cookie is host-only (no `Domain` attribute), so cross-host callbacks cannot read it.

### Code already consumed (`40001`)

`exchangeCode()` throws `AardwinError` with `code: 40001` when the code is invalid, expired, already consumed, or mismatched. The code is atomic one-shot: do **not** retry. Re-prompt the user to log in again, which generates a fresh code through the `<aardwin-auth>` redirect flow.

### Listen for lifecycle events

On `<aardwin-auth>`:

```ts
const el = document.querySelector('aardwin-auth');
el.addEventListener('aardwin:error', (e) => console.log(e.detail));
// { phase: 'render' | 'start', message: string, provider?: string }
el.addEventListener('aardwin:ready', () => console.log('rendered'));
```

On `<aardwin-account>`:

```ts
const el = document.querySelector('aardwin-account');
el.addEventListener('aardwin:account-error', (e) => console.log(e.detail.phase, e.detail.message));
```

---
## Styling

`<aardwin-auth>` exposes `part="button"`:

```css
aardwin-auth::part(button) {
  border-radius: 999px;
  background: #07c160;
  color: #fff;
}
```

`<aardwin-account>` bind buttons also expose `part="button"`.

---
## Links

- [browser-sdk README](./README.md)
- [server-sdk README](../server-sdk/README.md)
- [LOCALDEV.md](./LOCALDEV.md)
- [RELEASING.md](../RELEASING.md)
- [https://aard.win](https://aard.win) — developer portal
