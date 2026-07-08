/**
 * Structured error type thrown by this SDK on every failure path.
 *
 * Decision: STAY FLAT (one `Error` subclass, no base + per-method subtypes). The
 * roadmap methods (`getUser`, `verifyWebhookSignature`, `verifyToken`) do not need
 * new error shapes — they reuse `{ code, status }` or don't throw at all. If a
 * later method ever needs a distinct error type, it can subclass `AardwinError`
 * and `instanceof AardwinError` keeps holding for existing catch-blocks (no churn).
 */

export interface AardwinErrorOptions {
  /**
   * aardwin api business code from the response envelope (`code` field). See
   * `EXCHANGE_CODES` (in `codes.ts`) for the canonical list:
   *   - `0` = ok
   *   - `40001` = bad / expired / consumed / site-mismatched code
   *   - `40002` = wrong `client_secret`
   *   - `40003` = reserved (channel not enabled — not currently emitted)
   *
   * `undefined` when the api returned no numeric code (e.g. 401 unauthorized,
   * 403 origin-not-allowed) or when no envelope was received (network error /
   * abort / non-JSON body).
   */
  code?: number;
  /**
   * HTTP status of the response. `undefined` when there was no HTTP response
   * (network error / abort / default-timeout fire).
   */
  status?: number;
  /**
   * Discriminator for abort-family failures.
   * - `"timeout"` — the SDK's default 8 s timeout fired.
   * - `"aborted"` — the caller-supplied `AbortSignal` was aborted.
   * `undefined` for HTTP/envelope/network errors.
   */
  reason?: 'timeout' | 'aborted';
  /** Original error, attached for debugging (ES2022 `Error.cause`). */
  cause?: unknown;
}

/**
 * Structured error thrown by the server SDK on every failure path.
 *
 * - Extends `Error` so existing `catch (e) { if (e instanceof Error) … }` keeps working.
 * - `name === "AardwinError"` gives clean stack traces; `instanceof AardwinError` is the
 *   branching idiom for callers that want to read `code` / `status` / `reason`.
 * - The message string still starts with `aardwin-auth exchange failed:` on
 *   HTTP/envelope/network rows, so naive `e.message.includes(...)` consumers don't break.
 */
export class AardwinError extends Error {
  /** Envelope business code (`0`/`40001`/`40002`). `undefined` when no envelope was received. */
  readonly code?: number;
  /** HTTP status. `undefined` for network errors / aborts (no response). */
  readonly status?: number;
  /** `"timeout"` for the default-timeout fire, `"aborted"` for caller-signal abort. `undefined` otherwise. */
  readonly reason?: 'timeout' | 'aborted';

  constructor(message: string, opts: AardwinErrorOptions = {}) {
    super(message);
    this.name = 'AardwinError';
    this.code = opts.code;
    this.status = opts.status;
    this.reason = opts.reason;
    if (opts.cause !== undefined) {
      // ES2022 `Error.cause` — supported on Node 18+ / Bun / modern browsers.
      (this as { cause?: unknown }).cause = opts.cause;
    }
  }
}
