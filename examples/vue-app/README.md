# aardwin + Vue 3 Example

A reference authentication example using [aardwin](https://aard.win) with Vue 3 +
Vite. It demonstrates the same end-to-end flow as the Next.js example but with a
pure-Vite dev-server plugin as the backend: login, OAuth callback, session cookie,
dashboard, and the inline `<aardwin-account>` management UI.

You only need the two public npm packages — `@aardwin/auth-browser` and
`@aardwin/auth-server` — plus a `siteId`/`clientSecret` pair from
[aard.win](https://aard.win). No aardwin source code or self-hosted services are required.

## Prerequisites

- Node.js ≥ 20.19 (required by Vite 7)
- A site registered at [aard.win](https://aard.win), which gives you a `siteId`
  and `clientSecret`

## Install

```bash
npm install
cp .env.example .env.local
# Fill in VITE_AARDWIN_SITE_ID (public) and AARDWIN_CLIENT_SECRET (server-only).
# VITE_AARDWIN_CALLBACK_PATH defaults to /callback; leave it blank to let the bff
# fall back to the registered callbackUrl.
```

## Run

```bash
npm run dev
# open http://localhost:5173/login
```

The Vite dev server is pinned to port 5173 (`strictPort: true`) because the
`<aardwin-auth callback-path>` value is relative to the current origin.

## Flow

1. `/login` embeds `<aardwin-auth>` (registered by importing `@aardwin/auth-browser` in `src/main.ts`).
2. User clicks a provider button.
3. The SDK generates a `state` nonce, sets the `aard_win_auth_state` cookie
   (`SameSite=Lax`, non-HttpOnly), and redirects to the bff `/authorize`.
   If `VITE_AARDWIN_CALLBACK_PATH` is set, it appends `return_url` to the redirect.
4. aardwin handles the provider authorization and redirects back to
   `/callback?code=...&state=...`.
5. The dev-server plugin verifies `state`, calls `exchangeCode()`, mints a session
   cookie (`sid`), and redirects to `/dashboard`.
6. `/dashboard` fetches `/api/me`, displays the user info, and mints a short-lived
   handoff code via `/api/account-handoff` to render `<aardwin-account>`.

## Backend architecture

The entire backend is a single Vite dev-server plugin (`src/server/index.ts`).
It does **not** introduce Express, Hono, or any other server framework — it uses
Vite's built-in `configureServer` middleware hook.

Sessions and accounts are stored in an in-memory `Map` (no database), so they are
lost when the dev server restarts.

## Endpoint contract

| Endpoint | Method | Query / Body | Cookie | Response |
| --- | --- | --- | --- | --- |
| `/callback` | GET | `?code=<one-time>&state=<nonce>` | `aard_win_auth_state` | 302 `/dashboard`; clears state cookie; sets `sid` |
| `/api/me` | GET | — | `sid` | 200 `{user:{user_id,provider,email,nickname,avatar}}` or 401 |
| `/api/account-handoff` | POST | — (no body; userId from server session) | `sid` | 200 `{code, expiresIn}` or 401 or 500 |
| `/api/logout` | POST | — | `sid` | 200 `{ok:true}`; clears `sid` |

All other paths fall through to Vite's SPA handler.

## Cookie semantics

| Cookie | Set by | HttpOnly | SameSite | Max-Age | Domain | Why |
| --- | --- | --- | --- | --- | --- | --- |
| `aard_win_auth_state` | SDK (browser) | no | Lax | 1800 | host-only | CSRF nonce; must be readable by the browser callback handler so it can be sent to the server in the same host. No `Domain` means it is bound to the exact login host. |
| `sid` | server callback | yes | Lax | 86400 | host-only | Session token; `HttpOnly` prevents XSS from stealing it; `SameSite=Lax` mitigates cross-site POST CSRF; host-only enforces the same-host constraint. |

## Register / Login / Bind

- **Register**: first time a `user_id` is seen via `exchangeCode`, an account is created.
- **Login**: subsequent logins with the same `user_id` are treated as returning users.
- **Bind (demo-level)**: the same `user_id` logging in via a different provider accumulates
  providers under one account in the in-memory store.
- **Account management (real)**: the dashboard embeds `<aardwin-account>`, aardwin's inline
  UI for binding/unbinding identity providers. It is driven by a one-time handoff code minted
  server-side (`client.createAccountHandoff({ userId })`).

## Callback URL

The SDK supports an optional `callback-path` attribute.

- **Set**: `<aardwin-auth callback-path="/callback">` sends `return_url=http://localhost:5173/callback`
  to the bff. This tells the bff exactly where to redirect after authorization.
- **Unset / empty**: the SDK does not send `return_url`; the bff uses the `callbackUrl`
  registered for the site in the aardwin console.

**Validation rules**:

- Demo / localhost: `localhost` and `127.0.0.1` are allowed with any port.
- Real production sites: the host of the callback URL must match the host of the
  registered `callbackUrl` exactly.
- If you see a `400 return_url not allowed` error, the callback host does not match
  the registered callback host.

## State verification

The SDK writes the `aard_win_auth_state` cookie before redirecting. The `/callback`
handler reads the cookie and the query `?state=` parameter and compares them with
`crypto.timingSafeEqual`. The lengths are compared first because `timingSafeEqual`
requires equal-length buffers; otherwise it would throw and potentially leak which
string is shorter. After a successful exchange, the server clears the state cookie.

## `exchangeCode` semantics

`createAardwinClient({ siteId, clientSecret }).exchangeCode({ code })` calls the
aardwin API `POST /api/oauth/token` and returns a `SessionUser`:

| Field | Type | Meaning |
| --- | --- | --- |
| `user_id` | `string` | Stable provider-agnostic user id |
| `provider` | `string` | The provider used for this login (e.g. `github`, `wechat`) |
| `email` | `string \| null` | User email when available |
| `nickname` | `string` | Display name when available |
| `avatar` | `string` | Avatar URL when available |

`client.createAccountHandoff({ userId })` calls `POST /api/account/handoff` and returns
`{ code, expiresIn }`. The `code` is single-use and expires in 60 seconds.

## Error matrix

| Symptom | HTTP / Event | Reason | Fix |
| --- | --- | --- | --- |
| State mismatch | `400 state mismatch` | `aard_win_auth_state` cookie missing or `?state=` does not match | Ensure login and callback are on the same host; cookie is host-only. |
| Auth failed | `400 auth failed: ...` | `exchangeCode` rejected (expired/invalid code, bad secret) | Retry the login flow from `/login`. |
| No session | `401 no session` | `sid` cookie missing or invalid | User is not logged in; redirect to `/login`. |
| Handoff failure | 500 in dashboard | `createAccountHandoff` transient failure | Non-fatal; dashboard still shows user info. Refresh to retry. |
| Component error | `aardwin:error` event | Provider fetch failed or zero providers | The login page shows a host-level error banner + Retry. |

## Same-host constraint

The SDK login page (`/login`) and the callback URL (`/callback`) must be on the
**same host**. The `aard_win_auth_state` cookie is host-only (no `Domain` attribute),
so a cross-host callback will fail state verification.

## Important constraints

- This example is **dev-only**. The Vite plugin only runs in `vite dev`; the
  production build (`vite build`) does not include a server.
- The `clientSecret` is loaded by `vite.config.ts` and passed only to the
  dev-server plugin. It is never sent to the browser.
- In-memory sessions are lost on server restart.

## TypeScript

`types/aardwin-elements.d.ts` registers `<aardwin-auth>` and `<aardwin-account>` in
Vue's `GlobalComponents` so `vue-tsc` recognizes the kebab-case attributes
(`site-id`, `i18n`, `api-origin`, `callback-path`, `code`).

## Verification

```bash
npm run typecheck   # vue-tsc --noEmit
npm run build       # vue-tsc --noEmit && vite build
```

End-to-end verification requires a real `siteId`/`clientSecret` in `.env.local` and
completing the OAuth/email flow at `/login`.

## 回调路径与 return_url 说明

- `callback-path` 是可选属性。非空时 SDK 会把 `return_url` 追加到 bff 跳转 URL，
  缺省/空串时 SDK 不发 `return_url`，bff 回退到站点注册 callbackUrl。
- 本地 demo 允许 `localhost/127.0.0.1` 任意端口作为回调；真实站点回调 host 必须与控制台
  注册的 callbackUrl host 完全一致，否则会收到 `400 return_url not allowed`。
- 回调必须与登录页同 host，因为 `aard_win_auth_state` cookie 是 host-only。

## 站点注册完整路径

1. 打开 https://aard.win 控制台，登录后创建或进入一个站点。
2. 在站点设置中启用需要的 provider（Wechat / Google / GitHub / Outlook / Discord / Email）。
3. 复制页面显示的 `siteId`（公开）填入 `.env.local` 的 `VITE_AARDWIN_SITE_ID`。
4. 复制 `clientSecret`（仅服务端）填入 `.env.local` 的 `AARDWIN_CLIENT_SECRET`。
5. 在控制台注册 callbackUrl，例如 `http://localhost:5173/callback`（本地开发）或你的生产地址。
6. 运行 `npm run dev` 并在 http://localhost:5173/login 完成登录。

## 本地开发与 nextjs 示例的差异

- Next.js 示例在 `app/api/*` 路由中实现后端；Vue 示例把整个后端塞进一个 Vite 插件，
  避免引入 Express/Hono 等额外依赖。
- Next.js 示例在服务端组件里直接调用 `client.createAccountHandoff`；Vue 示例通过
  `/api/account-handoff` 端点把 handoff code 从服务端暴露给浏览器，因为 Vue 没有
  服务端组件运行时。
- 两种示例都依赖相同的 `@aardwin/auth-server` 客户端和完全相同的 cookie/端点语义。
