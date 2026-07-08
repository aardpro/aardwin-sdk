# aardwin + Next.js 15 App Router Example

A reference authentication example using [aardwin](https://aard.win) with Next.js 15 App Router.

## Prerequisites

- A running aardwin stack (API + BFF + DB)
- A test site created in the aardwin console with a `siteId` and `client_secret`

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

1. `/login` embeds `<aardwin-auth>`
2. User clicks a provider
3. BFF handles authorization
4. Redirects back to `/callback`
5. `/callback` verifies state and calls `exchangeCode()`
6. Server mints a session and redirects to `/dashboard`

## Important Constraints

- **Same-host requirement:** The SDK embed page (`/login`) and the callback URL (`/callback`) must be on the **same host**. The `aard_win_auth_state` cookie is host-only (no `Domain` attribute), so cross-host reads will fail and state verification will reject.
- **Error handling:**
  - State mismatch -> 400
  - Code exchange failure -> error UI with retry
  - Empty providers list -> caught via `aardwin:error` listener
