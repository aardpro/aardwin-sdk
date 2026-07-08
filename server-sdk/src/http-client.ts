/**
 * INTERNAL shared HTTP wrapper. NOT exported from `index.ts`.
 *
 * Every public method (`exchangeCode`, future `getUser`/etc.) delegates here, so there
 * is exactly ONE HTTP code path and exactly ONE envelope→error mapping in the whole
 * SDK. This is what lets the spine absorb new methods without churning existing public
 * signatures (see the design stress-test comment block in `client.ts`).
 *
 * Behavior is a faithful lift of the original `packages/sdk/src/exchange-code.ts`
 * fetch/error logic (abort composition, envelope handling, network-error wrapping).
 * The existing `exchange-code.test.ts` is the regression guard that this refactor
 * preserves exact current behavior.
 *
 * Retry / idempotency posture: `postJson` is ONE-SHOT, no automatic retry. The single
 * caller today (`exchangeCode`) consumes a one-time code atomically at the api
 * (`packages/api/src/services/oauth-code-service.ts` `consume()`), so a retry after
 * any non-2xx / network error risks hitting "already consumed" (`40001`). The caller
 * decides whether to re-prompt the user to re-authenticate.
 */
import { AardwinError } from './aardwin-error';
import { DEFAULT_TIMEOUT_MS } from './config';

export interface HttpPostOptions {
  /** aardwin api origin (e.g. `https://oauth.aard.win`). Trailing slashes are trimmed. */
  apiOrigin: string;
  /** Request path beginning with `/`, e.g. `/api/oauth/token`. */
  path: string;
  body: Record<string, unknown>;
  /** Required by `exchangeCode`; unused by methods that don't need it. */
  clientSecret?: string;
  /** Per-call timeout in ms. `0` / `Infinity` disables; default {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Caller-supplied AbortSignal; composed with the internal timeout signal via `AbortSignal.any`. */
  signal?: AbortSignal;
  /** Inject a custom fetch (testing / edge runtimes). */
  fetchImpl: typeof fetch;
}

export interface HttpResult<T> {
  /** Parsed envelope `data` on success (envelope `code === 0` with `data !== undefined`). */
  data: T;
  /** HTTP status of the response. */
  status: number;
}

/** aardwin 统一响应信封：{ code, message, data }，code === 0 表示成功。*/
interface ResponseEnvelope {
  code?: number;
  message?: string;
  data?: unknown;
}

/**
 * Decide whether the default timeout applies for the given input.
 *
 * - Explicit number `n`: apply iff `n > 0 && Number.isFinite(n)` (so `0` and `Infinity` disable).
 * - Non-number (undefined / NaN): the 8 s default applies.
 */
function shouldUseTimeout(timeoutMs: number | undefined): boolean {
  if (typeof timeoutMs !== 'number' || Number.isNaN(timeoutMs)) return true;
  return timeoutMs > 0 && Number.isFinite(timeoutMs);
}

/**
 * Detect whether `err` is an abort-family DOMException / event.
 * - `AbortSignal.timeout` fires → `DOMException` with `name === "TimeoutError"`.
 * - Caller `signal.abort()` → `DOMException` with `name === "AbortError"`.
 * - Some runtimes surface a bare `Error` with `name === "AbortError"` — accept that too.
 */
function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === 'TimeoutError' || err.name === 'AbortError';
  }
  const name = (err as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/**
 * POST JSON to `${apiOrigin}${path}`, throwing {@link AardwinError} on EVERY failure path
 * and returning `{ data, status }` ONLY on envelope `code === 0 && data !== undefined`.
 *
 * Failure mapping (mirrors the pre-refactor `exchangeCode` semantics):
 * - abort-family rejection → `AardwinError(..., { reason: 'timeout' | 'aborted', cause })`
 *   (the `internalSignal.aborted` precedence rule stays — internal timeout wins ties).
 * - bare network error → `AardwinError('... failed: <msg>', { cause })`
 * - non-JSON body → `AardwinError('... non-JSON body', { status })`
 * - envelope `code !== 0` / missing data → `AardwinError(message, { code, status })`
 */
export async function postJson<T>(opts: HttpPostOptions): Promise<HttpResult<T>> {
  // Compose caller `signal` with an internal default-timeout signal via AbortSignal.any.
  const signals: AbortSignal[] = [];
  if (opts.signal) signals.push(opts.signal);

  const useTimeout = shouldUseTimeout(opts.timeoutMs);
  const effectiveTimeout =
    typeof opts.timeoutMs === 'number' && !Number.isNaN(opts.timeoutMs)
      ? opts.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  let internalSignal: AbortSignal | undefined;
  if (useTimeout) {
    internalSignal = AbortSignal.timeout(effectiveTimeout);
    signals.push(internalSignal);
  }

  const combined: AbortSignal | undefined =
    signals.length === 0
      ? undefined
      : signals.length === 1
        ? signals[0]
        : AbortSignal.any(signals);

  const bodyObj: Record<string, unknown> = { ...opts.body };
  if (opts.clientSecret !== undefined) {
    bodyObj.client_secret = opts.clientSecret;
  }

  let res: Response;
  try {
    res = await opts.fetchImpl(`${opts.apiOrigin}${opts.path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bodyObj),
      signal: combined,
    });
  } catch (err) {
    // Abort-family rejection: disambiguate default-timeout vs caller-signal.
    if (isAbortError(err)) {
      // If the internal timeout signal fired first, it's the default-timeout. Otherwise the
      // caller's signal was the source of the abort. (If both fired near-simultaneously the
      // internal one is treated as authoritative, matching the documented contract.)
      if (internalSignal?.aborted) {
        throw new AardwinError('aardwin-auth exchange timed out', {
          reason: 'timeout',
          cause: err,
        });
      }
      throw new AardwinError('aardwin-auth exchange aborted', {
        reason: 'aborted',
        cause: err,
      });
    }
    // Bare network error (TypeError: failed to fetch) — no HTTP response, no status.
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : 'unknown network error';
    throw new AardwinError(`aardwin-auth exchange failed: ${message}`, {
      cause: err,
    });
  }

  // Parse the JSON envelope. A non-JSON body (e.g. HTML 502 from a proxy) yields null.
  const json = (await res.json().catch(() => null)) as ResponseEnvelope | null;

  if (json && json.code === 0 && json.data !== undefined) {
    return { data: json.data as T, status: res.status };
  }

  // Non-JSON body: there is no envelope to inspect; surface the HTTP status + marker.
  if (!json) {
    throw new AardwinError(
      `aardwin-auth exchange failed: HTTP ${res.status} (non-JSON body)`,
      { status: res.status }
    );
  }

  // Envelope present but `code !== 0` or missing `data`: malformed/known-business-error row.
  // Map every documented status → AardwinError with the envelope's code/message.
  throw new AardwinError(
    json.message ?? `aardwin-auth exchange failed: HTTP ${res.status}`,
    {
      code: typeof json.code === 'number' ? json.code : undefined,
      status: res.status,
    }
  );
}
