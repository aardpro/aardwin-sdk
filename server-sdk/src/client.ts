/**
 * Client spine: `createAardwinClient()` returns an {@link AardwinClient} instance whose
 * methods delegate to the internal shared `postJson` (see `http-client.ts`).
 *
 * The spine is built so adding roadmap methods does NOT churn any existing public
 * signature. See the design stress-test comment block at the bottom of this file.
 */
import { exchangeCode } from './exchange-code';
import type { ExchangeCodeInput } from './exchange-code';
import { createAccountHandoff } from './create-account-handoff';
import type { CreateAccountHandoffInput } from './create-account-handoff';
import type { AccountHandoffOutput } from './create-account-handoff';
import { normalizeOrigin } from './config';
import type { AuthUser } from './types';

/** Options for {@link createAardwinClient}. */
export interface CreateAardwinClientOptions {
  /** Site id (public; identifies the registered app). */
  siteId: string;
  /** Server-only `client_secret`. NEVER ship to the browser. */
  clientSecret: string;
  /** Override the hardcoded api origin (default: `https://api.aard.win`). */
  apiOrigin?: string;
  /** Per-client default timeout in ms; `0` / `Infinity` disables. Default: 8000. */
  timeoutMs?: number;
  /** Inject a custom fetch (testing / edge runtimes). Defaults to global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Framework-agnostic aardwin API client. New methods land here as additional members
 * (see the stress-test block below) — existing members' signatures stay stable.
 */
export interface AardwinClient {
  /**
   * Exchange a one-time code for the end-user identity. One-shot (no retry).
   * Fields omitted on `input` fall back to the client's defaults.
   */
  exchangeCode(input: ExchangeCodeInput): Promise<AuthUser>;

  /**
   * Create an account-handoff code for embedding <aardwin-account>.
   * One-shot (no retry). Fields omitted on `input` fall back to the client's defaults.
   */
  createAccountHandoff(input: CreateAccountHandoffInput): Promise<AccountHandoffOutput>;
}

/**
 * Create an {@link AardwinClient} with closure-held defaults. Prefer this over the
 * standalone {@link exchangeCode} when your process issues multiple exchanges or uses
 * several SDK methods — it avoids repeating `siteId` / `clientSecret` / `origin`.
 */
export function createAardwinClient(
  opts: CreateAardwinClientOptions,
): AardwinClient {
  const fetchImpl = opts.fetch ?? fetch;
  const origin = normalizeOrigin(opts.apiOrigin);
  const baseTimeout = opts.timeoutMs; // undefined → default 8000 inside postJson

  return {
    exchangeCode(input) {
      return exchangeCode({
        code: input.code,
        siteId: input.siteId ?? opts.siteId,
        clientSecret: input.clientSecret ?? opts.clientSecret,
        apiOrigin: input.apiOrigin ?? origin,
        timeoutMs: input.timeoutMs ?? baseTimeout,
        signal: input.signal,
        fetch: input.fetch ?? fetchImpl,
      });
    },

    createAccountHandoff(input) {
      return createAccountHandoff({
        siteId: input.siteId ?? opts.siteId,
        userId: input.userId,
        clientSecret: input.clientSecret ?? opts.clientSecret,
        apiOrigin: input.apiOrigin ?? origin,
        timeoutMs: input.timeoutMs ?? baseTimeout,
        signal: input.signal,
        fetch: input.fetch ?? fetchImpl,
      });
    },
  };
}

/* ============================================================================
 * DESIGN STRESS-TEST (Plan §2.4 / §7) — proof that the spine absorbs growth WITHOUT
 * churning existing public API. NONE of the candidates below are implemented; each is
 * shown as a hypothetical added member / export. The existing `createAardwinClient`
 * signature, `AardwinClient.exchangeCode` signature, and the standalone `exchangeCode`
 * signature are untouched in all three cases.
 * ==========================================================================*
 *
 * // (a) client.getUser(userId) — near-term, hits /internal/identities/:userId.
 * //     Today that route is bff-only (MANAGEMENT_TOKEN), so this would require
 * //     a new public api route. The point is the CLIENT signature doesn't change:
 * declare function createAardwinClient(opts: CreateAardwinClientOptions): AardwinClient & {
 *   getUser(userId: string): Promise<AuthUser>;  // new member only
 * };
 * // createAardwinClient(...) callers: ZERO diff. existing client.exchangeCode: ZERO diff.
 *
 * // (b) verifyWebhookSignature(payload, sig, secret) — pure function, no HTTP.
 * //     New top-level export; does not touch client.ts at all:
 * // export function verifyWebhookSignature(payload: string, sig: string, secret: string): boolean;
 * // Existing imports of { exchangeCode, AardwinError } are unchanged.
 *
 * // (c) verifyToken(token, opts) — speculative; aardwin does NOT issue dev-facing
 * //     JWTs today (admin-jwt.ts / dev-jwt.ts are console-internal). If ever added:
 * // export function verifyToken(token: string, opts?: VerifyTokenOptions): JWTPayload;
 * // Again a new top-level export; existing surface untouched.
 *
 * Conclusion: the spine (client instance with closure-held defaults + standalone
 * functions delegating to a shared `postJson`) absorbs all three roadmap candidates
 * without modifying any existing public signature.
 */
