/**
 * End-user identity returned by `exchangeCode()`. Mirrors the `POST /api/oauth/token`
 * envelope `data` field byte-for-byte.
 *
 * DEFINED LOCALLY (not imported from `@aardwin/share`) so the published package is
 * self-contained for third-party consumers — the server SDK has zero runtime
 * dependencies. `user_id` (snake_case) is deliberate: it matches the public api wire
 * format (`packages/api/src/routes/oauth-token.ts`) and is the stable contract
 * integrators code against.
 */
export interface AuthUser {
  user_id: string;
  provider: string;
  nickname?: string;
  avatar?: string;
}

/**
 * Result returned by `createAccountHandoff()`. Mirrors the `POST /api/account/handoff`
 * envelope `data` field. `expires_in` is the TTL in seconds (always 60).
 */
export interface AccountHandoffResult {
  code: string;
  expires_in: number;
  manage_url: string;
}
