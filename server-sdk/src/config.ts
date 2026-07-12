/**
 * Default aardwin api origin. The server SDK calls this service to exchange one-time codes
 * for end-user identity (`POST /api/oauth/token`).
 *
 * Override per-call via {@link ExchangeCodeInput.apiOrigin} or per-client via
 * {@link CreateAardwinClientOptions.apiOrigin} (e.g. point at a local api during development).
 */
export const API_ORIGIN = 'https://api.aard.win';

/** Default per-call timeout for HTTP requests issued by this SDK: 8 seconds. */
export const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Normalize an api origin: trim trailing slashes (so `${origin}${path}` never produces a
 * double slash) and fall back to {@link API_ORIGIN} when the input is empty / undefined.
 *
 * Centralized so `client.ts` and `exchange-code.ts` apply identical normalization — the
 * single source of truth for "what origin do we POST to?".
 */
export function normalizeOrigin(origin: string | undefined): string {
  const next = (origin ?? '').trim();
  return (next === '' ? API_ORIGIN : next).replace(/\/+$/, '');
}
