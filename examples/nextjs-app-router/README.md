# aardwin + Next.js 15 App Router Example

A reference authentication example using [aardwin](https://aard.win) with Next.js 15 App Router.
Demonstrates register, login, and provider binding (bind) with in-memory session storage.

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
# fill in AARDWIN_SITE_ID and AARDWIN_CLIENT_SECRET (and their NEXT_PUBLIC_ mirrors).
# Leave AARDWIN_API_ORIGIN / NEXT_PUBLIC_AARDWIN_API_ORIGIN BLANK to use the
# public aardwin api (https://api.aard.win).
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

This example ships **no automated tests**; verification is limited to
`npm run build` (typecheck + build). For a real end-to-end run, fill in a valid
`siteId`/`clientSecret` in `.env.local` (leave the api origin blank to target the
public `https://api.aard.win`), then run `npm run dev` and complete the flow at
`/login`.
