# aardwin + Next.js 15 App Router Example

A reference authentication example using [aardwin](https://aard.win) with Next.js 15 App Router.
Demonstrates register, login, the `<aardwin-account>` account-management UI (bind/unbind
providers), and in-memory session storage.

You only need the two public npm packages — `@aardwin/auth-browser` and
`@aardwin/auth-server` — plus a `siteId`/`clientSecret` pair from
[aard.win](https://aard.win). No aardwin source code or self-hosted services required.

## Prerequisites

- Node.js ≥ 18
- A site registered at [aard.win](https://aard.win), which gives you a `siteId`
  and `clientSecret`

## Install

```bash
npm install
cp .env.example .env.local
# fill in NEXT_PUBLIC_AARDWIN_SITE_ID (public siteId; read by browser + server) and
# AARDWIN_CLIENT_SECRET (server-only). The api origin defaults to the public
# aardwin api (https://api.aard.win) — no override needed.
```

## Run

```bash
npm run dev
# open http://localhost:3000/login
```

## Flow

1. `/login` embeds `<aardwin-auth>` (registered by importing `@aardwin/auth-browser`)
2. User clicks a provider button
3. aardwin handles authorization (OAuth redirect or email verification)
4. Redirects back to `/callback?code=...&state=...`
5. `/callback` verifies state, calls `exchangeCode()`, mints a session cookie (`sid`)
6. Server redirects to `/dashboard`, which reads the session, displays user info
   (including `email`), and embeds `<aardwin-account>` — the inline account-management UI
   (bind/unbind providers). The dashboard mints a short-lived handoff code server-side via
   `client.createAccountHandoff({ userId })` and passes `code` (and the public `siteId`) to the element.

## Register / Login / Bind

This demo uses in-memory `Map` storage (no database):

- **Register**: first time a `user_id` is seen via `exchangeCode`, an account is created.
- **Login**: subsequent logins with the same `user_id` are treated as returning users.
- **Bind (demo-level)**: the same `user_id` logging in via a different provider accumulates
  providers under one account in the in-memory store (shown under "Account Status").
- **Account management (real)**: the dashboard embeds `<aardwin-account>`, aardwin's inline
  UI for binding/unbinding identity providers. It is driven by a one-time
  handoff code minted server-side (`client.createAccountHandoff({ userId })`).

Sessions and accounts are lost on server restart.

## Important Constraints

- **Same-host requirement:** The SDK embed page (`/login`) and the callback URL (`/callback`) must be on the **same host**. The `aard_win_auth_state` cookie is host-only (no `Domain` attribute), so cross-host reads will fail and state verification will reject.
- **Error handling:**
  - State mismatch → 400
  - Code exchange failure → error UI with retry
  - Empty providers list → caught via `aardwin:error` listener

## Verification boundary

This example ships **no automated tests**; verification is limited to
`npm run build` (typecheck + build). For a real end-to-end run, fill in a valid
`siteId`/`clientSecret` in `.env.local` (leave the api origin blank to target the
public `https://api.aard.win`), then run `npm run dev` and complete the flow at
`/login`.
