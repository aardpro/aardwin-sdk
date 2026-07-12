# @aardwin/auth-server

Framework-agnostic aardwin API client for server-side code. Exchanges one-time OAuth codes for
end-user identity. Zero runtime dependencies; ESM-only; Node ≥ 18 / Bun.

This package does **one thing** today — `exchangeCode()` — and is built so future methods land
without changing any existing public signature (see [Roadmap](#roadmap-non-binding)).

> Pair it with the browser package `@aardwin/auth-browser` (the `<aardwin-auth>` Web Component) for
> the full OAuth2 authorization-code flow. This server SDK is the half that lives in your
> backend.

---

## 1. Install

```bash
bun add @aardwin/auth-server
# or
npm install @aardwin/auth-server
```

---

## 2. Quickstart (client instance)

Prefer `createAardwinClient()` for any process that issues multiple exchanges (or will use future
SDK methods) — it holds `siteId` / `clientSecret` / `apiOrigin` / `timeoutMs` / `fetch` in a closure
so you don't repeat them.

```ts
import { createAardwinClient } from '@aardwin/auth-server';

const client = createAardwinClient({
  siteId: 'YOUR_SITE_ID',
  clientSecret: process.env.AARDWIN_CLIENT_SECRET, // server-only; NEVER ship to the browser
  // apiOrigin: 'https://api.aard.win', // default; override for local dev
  // timeoutMs: 8000,                  // default; 0 / Infinity disables
});

// After your callback route receives ?code=...&state=...:
const user = await client.exchangeCode({ code });
// user = { user_id, provider, nickname?, avatar? }

const session = await createSession(user.user_id); // your own session
```

`client.exchangeCode(input)` falls back to the client's defaults for any field the `input` omits;
per-call fields (`code` is always required) override the client defaults.

---

## 3. One-off (standalone)

For serverless handlers / one-off scripts that issue a single exchange, `exchangeCode()` takes
everything inline:

```ts
import { exchangeCode } from '@aardwin/auth-server';

const user = await exchangeCode({
  code,
  siteId: 'YOUR_SITE_ID',
  clientSecret: process.env.AARDWIN_CLIENT_SECRET,
});
```

Both surfaces share the same internal HTTP path; pick whichever fits your call site.

---

## 4. Error handling

`exchangeCode()` throws an `AardwinError` (an `Error` subclass) on **every** failure path.
Branch with `instanceof`:

```ts
import { exchangeCode, AardwinError } from '@aardwin/auth-server';

try {
  const user = await exchangeCode({ code, siteId, clientSecret });
} catch (e) {
  if (e instanceof AardwinError) {
    // see the matrix below for which fields are populated on which row
  } else {
    throw e; // rethrow unknown errors
  }
}
```

### `AardwinError` field matrix

`AardwinError` exposes these fields (matches `src/aardwin-error.ts` field-for-field):

| Field      | Type                              | Always present? |
| ---------- | --------------------------------- | --------------- |
| `message`  | `string`                          | yes             |
| `name`     | `'AardwinError'`                  | yes             |
| `code`     | `number \| undefined`             | no              |
| `status`   | `number \| undefined`             | no              |
| `reason`   | `'timeout' \| 'aborted' \| undefined` | no          |
| `cause`    | `unknown` (ES2022 `Error.cause`)  | no              |

Which fields are populated by which failure row:

| Failure                                   | `code`                | `status`     | `reason`     | `cause`           | `message`                                      |
| ----------------------------------------- | --------------------- | ------------ | ------------ | ----------------- | ---------------------------------------------- |
| Bad / expired / consumed / mismatched code | `40001`               | `400`        | `undefined`  | `undefined`       | envelope message                               |
| Wrong `client_secret`                     | `40002`               | `401`        | `undefined`  | `undefined`       | envelope message                               |
| `401 unauthorized` (site missing)         | `undefined`           | `401`        | `undefined`  | `undefined`       | envelope message                               |
| `403 origin not allowed`                  | `undefined`           | `403`        | `undefined`  | `undefined`       | envelope message                               |
| Non-JSON body (e.g. HTML 502)             | `undefined`           | HTTP status  | `undefined`  | `undefined`       | `aardwin-auth exchange failed: HTTP <s> (non-JSON body)` |
| Bare network error                        | `undefined`           | `undefined`  | `undefined`  | original `Error`  | `aardwin-auth exchange failed: <msg>`         |
| Default 8 s timeout fired                 | `undefined`           | `undefined`  | `'timeout'`  | abort `DOMException` | `aardwin-auth exchange timed out`          |
| Caller `signal` aborted                   | `undefined`           | `undefined`  | `'aborted'`  | abort `DOMException` | `aardwin-auth exchange aborted`            |

> `code === 40003` (`CHANNEL_NOT_ENABLED`, see `EXCHANGE_CODES`) is **reserved** — not currently
> emitted by `POST /api/oauth/token` (the channel-not-enabled check happens earlier in the bff
> authorize flow and surfaces as an `error=channel_not_enabled` redirect). It's documented for
> forward reference.

---

## 5. Timeouts & abort

`exchangeCode()` applies an **8 second** default timeout (via `AbortSignal.timeout`) so your
request returns even if the upstream is wedged. Two fields let you tune it (both on the client
options and on each call):

```ts
await client.exchangeCode({
  code,
  timeoutMs: 5000,                     // override the default 8 s
  signal: myAbortController.signal,    // compose with a caller-supplied AbortSignal
});

// Disable the default timeout entirely (rely solely on `signal`, or none):
await client.exchangeCode({ code, timeoutMs: 0 });
```

The caller's `signal` is composed with the internal timeout via `AbortSignal.any`; whichever
fires first wins. Pass `timeoutMs: 0` (or `timeoutMs: Infinity`) to disable the default timeout.
On timeout the SDK throws `AardwinError` with `reason: 'timeout'`; on caller-signal abort it
throws with `reason: 'aborted'`.

---

## 6. State verification is YOUR responsibility

**This SDK does not manage cookies or sessions.** It only exchanges the one-time code. You must
verify the OAuth `state` nonce yourself in your callback route, exactly once, to prevent login
CSRF.

Below is an illustrative, framework-agnostic reference snippet expressed in Web Fetch API terms
(`Request` / `Response` / `Headers`). It is **not** code shipped by this package — copy and adapt
it to your framework (Astro / Next.js / Hono / Express / etc.).

```ts
// ILLUSTRATIVE REFERENCE SNIPPET — not exported by this package.
// Verifies the `state` nonce, then exchanges the one-time code.

import { exchangeCode, AardwinError } from '@aardwin/auth-server';
import { timingSafeEqual } from 'node:crypto';

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const stateParam = url.searchParams.get('state');
  const code = url.searchParams.get('code');

  // 1. Read the state cookie that the <aardwin-auth> tag set before the redirect.
  const cookieHeader = req.headers.get('cookie') ?? '';
  const stateCookie = parseCookie(cookieHeader, 'aard_win_auth_state');

  // 2. Constant-time compare. Mismatch → 400 (do NOT proceed to exchangeCode).
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
      // Re-prompt the user to re-authenticate (the code was consumed or invalid).
      return new Response('auth failed: ' + e.message, { status: 400 });
    }
    throw e;
  }
}

// --- tiny helpers you'd implement / pull from your framework ---
function parseCookie(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}
/** Constant-time string compare using Node's built-in crypto.timingSafeEqual.
 *  Avoids the length-leak of a hand-rolled loop. state is a fixed-length hex
 *  nonce (32 chars), so the length guard never leaks useful info in practice. */
function safeStateEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false; // guard: timingSafeEqual throws on mismatched lengths
  return timingSafeEqual(ab, bb);
}
async function createSession(userId: string): Promise<{ token: string; ttl: number }> {
  // ... your session store ...
  return { token: '...', ttl: 86400 };
}
```

---

## 7. Retry policy — do NOT retry

`exchangeCode()` is **one-shot**. The api consumes the one-time code atomically
(`UPDATE ... WHERE consumed_at IS NULL RETURNING`); a retry after any non-2xx / network error
risks hitting "already consumed" (`code: 40001`). On failure, **re-prompt the user to
re-authenticate** (which mints a fresh code via the `<aardwin-auth>` redirect flow).

---

## 8. Contract reference

This package touches exactly one endpoint:

| Endpoint              | Who calls           | Body                                                       | Success response (`data`)                                  |
| --------------------- | ------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `POST /api/oauth/token` | your backend → api | `{ site_id, code, client_secret }` (JSON, `client_secret_post`) | `{ user_id, provider, nickname?, avatar? }` (envelope `code: 0`) |

The default origin is `https://api.aard.win` (the aardwin **api**, not the bff). For the full
flow table (provider list, authorize redirect, callback) see the browser SDK's `SDK.md`; for a
side-by-side of both SDKs' origin-override params, see [technical-architecture.md §3.4](../../docs/technical-architecture.md).

---

## 9. Roadmap (non-binding)

The following methods are **under consideration**; the public API for the existing methods
(`createAardwinClient`, `client.exchangeCode`, standalone `exchangeCode`, `AardwinError`) will
**not** change when any of them ships. The client spine (`createAardwinClient` returning an
object whose methods delegate to one shared internal `postJson`) absorbs each as a new member or
top-level export:

- `client.getUser(userId)` — near-term; would require a new public api route.
- `verifyWebhookSignature(payload, sig, secret)` — pure function, no HTTP; new top-level export.
- `verifyToken(token, opts?)` — speculative; aardwin does not issue dev-facing JWTs today.

`AardwinError` stays a single flat `Error` subclass; any future method that needs a distinct
error type will subclass `AardwinError` so `instanceof AardwinError` keeps holding.

---

## License

MIT
