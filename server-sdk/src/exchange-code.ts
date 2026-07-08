/**
 * Standalone convenience for one-off code exchange. Callers with multiple exchanges
 * (or several SDK methods) should create a client via {@link createAardwinClient} and
 * call `client.exchangeCode(...)`.
 *
 * Endpoint: `${origin}/api/oauth/token` — the aardwin **api** (not bff) owns code
 * exchange. Standard OAuth2 `client_secret_post`: one POST, no crypto on the caller
 * side.
 *
 * ONE-SHOT, no automatic retry: the api consumes the one-time code atomically
 * (`packages/api/src/services/oauth-code-service.ts` `consume()`), so retrying after
 * any non-2xx / network error risks hitting "already consumed" (`40001`). On failure
 * the caller should re-prompt the user to re-authenticate (which mints a fresh code).
 *
 * All failure paths throw {@link AardwinError} (an `Error` subclass). The default 8 s
 * timeout guarantees the caller's request returns instead of hanging on a wedged
 * upstream; pass `timeoutMs: 0` to disable it.
 */
import type { AuthUser } from './types';
import { postJson } from './http-client';
import { normalizeOrigin } from './config';

export { AardwinError } from './aardwin-error';
export type { AardwinErrorOptions } from './aardwin-error';

/** Per-call inputs for the standalone {@link exchangeCode}. */
export interface ExchangeCodeInput {
  /** One-time code delivered to your callback URL as `?code=`. */
  code: string;
  /** Site id (public; identifies the registered app). Required on the standalone call. */
  siteId?: string;
  /** Server-only `client_secret`. NEVER ship to the browser. Required on the standalone call. */
  clientSecret?: string;
  /** Per-call api origin override (default: {@link API_ORIGIN}); trailing slashes trimmed. */
  apiOrigin?: string;
  /**
   * Per-call timeout override in ms. `0` (or `Infinity`) disables the default 8 s timeout
   * entirely and relies solely on `signal`. Default: 8000.
   */
  timeoutMs?: number;
  /** Caller-supplied AbortSignal; composed with the internal timeout signal. */
  signal?: AbortSignal;
  /** Per-call fetch override (testing). Defaults to global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Exchange a one-time `code` (+ the registered `client_secret`) for the end-user identity.
 *
 * ONE-SHOT: do not retry on failure (the code is consumed atomically at the api).
 *
 * @param input Must include `code`, `siteId`, and `clientSecret`.
 * @returns {@link AuthUser} on success; throws {@link AardwinError} on every failure path.
 */
export async function exchangeCode(
  input: ExchangeCodeInput & { siteId: string; clientSecret: string },
): Promise<AuthUser> {
  const fetchImpl = input.fetch ?? fetch;
  const origin = normalizeOrigin(input.apiOrigin);

  const { data } = await postJson<AuthUser>({
    apiOrigin: origin,
    path: '/api/oauth/token',
    body: { site_id: input.siteId, code: input.code },
    clientSecret: input.clientSecret,
    timeoutMs: input.timeoutMs,
    signal: input.signal,
    fetchImpl,
  });
  return data;
}
