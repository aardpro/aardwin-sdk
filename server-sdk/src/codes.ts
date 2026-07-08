/**
 * Numeric business codes returned in the response envelope (`{ code, message, data }`)
 * by `POST /api/oauth/token`. Surfaced as `AardwinError.code`.
 *
 * DEFINED LOCALLY (not imported from `@aardwin/share`) so the published package is
 * self-contained. These mirror the magic numbers emitted by the api at
 * `packages/api/src/routes/oauth-token.ts` (`40001` at the bad/consumed/mismatched
 * code paths, `40002` at the wrong-secret path). The api has no `40003` emission
 * path today — that value is reserved for forward use (channel-not-enabled).
 *
 * NOTE: these are DISTINCT from the OAuth `error=` redirect PARAM strings documented
 * in `docs/technical-architecture.md` (e.g. `'access_denied'`, `'timeout'`). Those
 * travel in a browser redirect query string; `EXCHANGE_CODES` travels in a JSON
 * envelope body. Do not conflate.
 */
export const EXCHANGE_CODES = {
  /** Code is invalid / expired / already consumed / site-mismatched. */
  BAD_CODE: 40001,
  /** Wrong `client_secret` for the site. */
  BAD_SECRET: 40002,
  /**
   * Reserved: OAuth channel not enabled for the site. NOT currently emitted by
   * `POST /api/oauth/token` (the channel-not-enabled check happens earlier, in the
   * bff authorize flow, surfacing as an `error=channel_not_enabled` redirect).
   * Documented in `docs/technical-architecture.md` for forward reference.
   */
  CHANNEL_NOT_ENABLED: 40003,
} as const;

export type ExchangeCodeValue =
  (typeof EXCHANGE_CODES)[keyof typeof EXCHANGE_CODES];
