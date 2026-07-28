# aardwin + Next.js 15 App Router Example

A reference authentication example using [aardwin](https://aard.win) with Next.js 15 App Router.
Demonstrates register, login, and provider binding (bind) with in-memory session storage.

## Prerequisites

- Node.js ≥ 18
- A running aardwin stack (API + BFF + DB)
- A test site created in the aardwin console with a `siteId` and `client_secret`

For local development of the aardwin stack itself, see [`sdk/LOCALDEV.md`](../../sdk/LOCALDEV.md).

## Install

```bash
npm install
cp .env.example .env.local
# fill in AARDWIN_SITE_ID, AARDWIN_CLIENT_SECRET, and AARDWIN_API_ORIGIN
```

## Run

```bash
npm run dev
# open http://localhost:3000/login
```

## Flow

1. `/login` embeds `<aardwin-auth>` (registered by importing `@aardwin/auth-browser`)
2. User clicks a provider button
3. BFF handles authorization (OAuth redirect or email verification)
4. Redirects back to `/callback?code=...&state=...`
5. `/callback` verifies state, calls `exchangeCode()`, mints a session cookie (`sid`)
6. Server redirects to `/dashboard` which reads the session and displays user info

## Register / Login / Bind

This demo uses in-memory `Map` storage (no database):

- **Register**: first time a `user_id` is seen via `exchangeCode`, an account is created.
- **Login**: subsequent logins with the same `user_id` are treated as returning users.
- **Bind**: the same `user_id` logging in via a different provider accumulates providers
  under one account. There is no separate bind API — this is the demo-level equivalent.

Sessions and accounts are lost on server restart.

## Important Constraints

- **Same-host requirement:** The SDK embed page (`/login`) and the callback URL (`/callback`) must be on the **same host**. The `aard_win_auth_state` cookie is host-only (no `Domain` attribute), so cross-host reads will fail and state verification will reject.
- **Error handling:**
  - State mismatch → 400
  - Code exchange failure → error UI with retry
  - Empty providers list → caught via `aardwin:error` listener

## Verification boundary

This example cannot be tested end-to-end without a running aardwin stack and valid
`siteId`/`client_secret`. Verification is limited to `npm run build` (typecheck + build).
Fill in `.env.local` and start the stack for a real E2E test.
