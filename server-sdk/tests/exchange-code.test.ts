import { describe, it, expect } from 'bun:test';
import { exchangeCode, AardwinError } from '../src/exchange-code';
import type { AuthUser } from '../src/types';

/**
 * Regression guard PORTED from `packages/sdk/tests/exchange-code.test.ts`. The task-2
 * refactor moved the HTTP/envelope/abort logic into a shared `postJson` (http-client.ts)
 * and `exchangeCode` now delegates to it; these tests lock that the observable behavior
 * is byte-identical to the pre-extraction implementation.
 *
 * Field-name changes vs the old sdk signature (all observable behavior unchanged):
 *   - `proxyOrigin` → `origin`
 *   - `fetchImpl`   → `fetch`
 */

/** Minimal fake Response shape that matches what postJson reads (res.status + res.json()). */
type FakeResponse = {
  status: number;
  ok?: boolean;
  json: () => Promise<unknown>;
  text?: () => Promise<string>;
};

/** Build a fake Response object cast to the global Response type. */
function fakeRes(body: unknown, status = 200, rawText?: string): Response {
  const r: FakeResponse = {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
  if (rawText !== undefined) {
    r.text = async () => rawText;
  }
  return r as unknown as Response;
}

/** Build a fetch that returns `body`/`status` immediately. */
function makeJsonFetch(
  body: unknown,
  status = 200
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async () => fakeRes(body, status);
}

/** Build a fetch that returns a non-JSON body (json() rejects). */
function makeNonJsonFetch(
  status: number,
  rawText: string
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async () =>
    fakeRes(undefined, status, rawText) &&
    ({
      status,
      ok: false,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
      text: async () => rawText,
    } as unknown as Response);
}

const BASE_INPUT = {
  code: 'CODE',
  siteId: 'SITE',
  clientSecret: 'SECRET',
};

describe('exchangeCode — success', () => {
  it('success: code 0 returns AuthUser', async () => {
    const user: AuthUser = {
      user_id: 'u1',
      provider: 'github',
      nickname: 'a',
    };
    const fetchImpl = makeJsonFetch(
      { code: 0, message: 'ok', data: user },
      200
    );
    const result = await exchangeCode({ ...BASE_INPUT, fetch: fetchImpl });
    expect(result).toEqual(user);
  });

  it('success with caller signal that is not aborted resolves normally', async () => {
    const user: AuthUser = { user_id: 'u2', provider: 'google' };
    const fetchImpl = makeJsonFetch(
      { code: 0, message: 'ok', data: user },
      200
    );
    const ac = new AbortController();
    const result = await exchangeCode({
      ...BASE_INPUT,
      fetch: fetchImpl,
      signal: ac.signal,
    });
    expect(result).toEqual(user);
    expect(ac.signal.aborted).toBe(false);
  });
});

describe('exchangeCode — failure modes (throw AardwinError)', () => {
  it('40001 (bad code) throws AardwinError with code=40001 status=400', async () => {
    const fetchImpl = makeJsonFetch(
      { code: 40001, message: 'code 不存在' },
      400
    );
    try {
      await exchangeCode({ ...BASE_INPUT, fetch: fetchImpl });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AardwinError);
      expect(e).toBeInstanceOf(Error);
      const ae = e as AardwinError;
      expect(ae.code).toBe(40001);
      expect(ae.status).toBe(400);
      expect(ae.reason).toBeUndefined();
      expect(ae.name).toBe('AardwinError');
      expect(ae.message).toBe('code 不存在');
    }
  });

  it('40002 (wrong secret) throws AardwinError with code=40002 status=401', async () => {
    const fetchImpl = makeJsonFetch(
      { code: 40002, message: 'invalid client_secret' },
      401
    );
    try {
      await exchangeCode({ ...BASE_INPUT, fetch: fetchImpl });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AardwinError);
      const ae = e as AardwinError;
      expect(ae.code).toBe(40002);
      expect(ae.status).toBe(401);
      expect(ae.message).toBe('invalid client_secret');
    }
  });

  it('401 unauthorized (no envelope code) throws AardwinError with undefined code, status 401', async () => {
    // Site missing → api returns `{ message: "unauthorized" }` with no `code` field, status 401.
    const fetchImpl = makeJsonFetch({ message: 'unauthorized' }, 401);
    try {
      await exchangeCode({ ...BASE_INPUT, fetch: fetchImpl });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AardwinError);
      const ae = e as AardwinError;
      expect(ae.code).toBeUndefined();
      expect(ae.status).toBe(401);
      expect(ae.message).toBe('unauthorized');
    }
  });

  it('403 origin-not-allowed throws AardwinError with undefined code, status 403', async () => {
    const fetchImpl = makeJsonFetch(
      { message: 'origin not allowed for this site' },
      403
    );
    try {
      await exchangeCode({ ...BASE_INPUT, fetch: fetchImpl });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AardwinError);
      const ae = e as AardwinError;
      expect(ae.code).toBeUndefined();
      expect(ae.status).toBe(403);
      expect(ae.message).toBe('origin not allowed for this site');
    }
  });

  it('non-JSON body throws AardwinError with status and non-JSON marker', async () => {
    const fetchImpl = makeNonJsonFetch(502, '<html>bad gateway</html>');
    try {
      await exchangeCode({ ...BASE_INPUT, fetch: fetchImpl });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AardwinError);
      const ae = e as AardwinError;
      expect(ae.status).toBe(502);
      expect(ae.code).toBeUndefined();
      expect(ae.message).toMatch(/non-JSON/);
      expect(ae.message).toMatch(/502/);
    }
  });

  it('network error throws AardwinError with undefined status, original as cause', async () => {
    const original = new TypeError('failed to fetch');
    const fetchImpl = async () => {
      throw original;
    };
    try {
      await exchangeCode({ ...BASE_INPUT, fetch: fetchImpl });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AardwinError);
      const ae = e as AardwinError;
      expect(ae.code).toBeUndefined();
      expect(ae.status).toBeUndefined();
      expect(ae.reason).toBeUndefined();
      expect(ae.cause).toBe(original);
      expect(ae.message).toMatch(/aardwin-auth exchange failed/);
      expect(ae.message).toMatch(/failed to fetch/);
    }
  });
});

/**
 * Build a fetch that hangs forever until its `init.signal` aborts — mirroring how real
 * `fetch` rejects when its abort signal fires. Used by the timeout/abort tests so the SDK's
 * internal `AbortSignal.any(...)` composition actually drives the rejection.
 *
 * Implementation note: we poll `signal.aborted` via `setInterval` rather than relying on the
 * signal's `abort` event. Bun's test runner does not dispatch the abort event while an `await`
 * is pending on a promise whose only resolver is that event handler — but timers (setInterval/
 * setTimeout) DO keep firing. Polling is the robust simulation of real fetch's abort behavior
 * in the test environment.
 *
 * On abort, rejects with the signal's `reason` (a DOMException named "TimeoutError" when
 * `AbortSignal.timeout` fired, or "AbortError" for a caller-signal abort), falling back to a
 * fresh "AbortError" DOMException if the runtime didn't set a reason.
 */
function makeHangingFetch(): (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response> {
  return (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        // No signal — hang forever (the test would time out and fail explicitly).
        return;
      }
      const rejectIfAborted = () => {
        if (signal.aborted) {
          reject(signal.reason ?? new DOMException('aborted', 'AbortError'));
          return true;
        }
        return false;
      };
      if (rejectIfAborted()) return;
      const iv = setInterval(() => {
        if (rejectIfAborted()) clearInterval(iv);
      }, 5);
    });
}

describe('exchangeCode — timeout & abort', () => {
  it('default timeout fires when upstream hangs', async () => {
    // fetch that hangs forever; rely on the injected short timeout to fire and abort it.
    const fetchImpl = makeHangingFetch();
    const start = Date.now();
    try {
      await exchangeCode({ ...BASE_INPUT, fetch: fetchImpl, timeoutMs: 30 });
      throw new Error('expected throw');
    } catch (e) {
      const elapsed = Date.now() - start;
      expect(e).toBeInstanceOf(AardwinError);
      const ae = e as AardwinError;
      expect(ae.reason).toBe('timeout');
      expect(ae.code).toBeUndefined();
      expect(ae.status).toBeUndefined();
      expect(ae.message).toBe('aardwin-auth exchange timed out');
      // Sanity: aborted within a reasonable window of the injected timeout.
      expect(elapsed).toBeLessThan(2000);
    }
  });

  it('caller signal aborts the in-flight fetch', async () => {
    const fetchImpl = makeHangingFetch();
    const ac = new AbortController();
    const p = exchangeCode({
      ...BASE_INPUT,
      fetch: fetchImpl,
      signal: ac.signal,
      timeoutMs: 0,
    });
    // Abort on next tick (after fetch has been called with the composed signal).
    queueMicrotask(() => ac.abort());
    try {
      await p;
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AardwinError);
      const ae = e as AardwinError;
      expect(ae.reason).toBe('aborted');
      expect(ae.code).toBeUndefined();
      expect(ae.status).toBeUndefined();
      expect(ae.message).toBe('aardwin-auth exchange aborted');
      expect(ae.cause).toBeDefined();
    }
  });

  it('timeoutMs: 0 disables the default timeout', async () => {
    // A fetch that resolves after 60 ms with a success envelope. Under the default 8 s
    // timeout this trivially resolves; the point is that timeoutMs: 0 doesn't short-circuit it.
    const user: AuthUser = { user_id: 'u3', provider: 'outlook' };
    const fetchImpl = () =>
      new Promise<Response>(resolve => {
        setTimeout(
          () => resolve(fakeRes({ code: 0, message: 'ok', data: user }, 200)),
          60
        );
      });
    const result = await exchangeCode({
      ...BASE_INPUT,
      fetch: fetchImpl,
      timeoutMs: 0,
    });
    expect(result).toEqual(user);
  });
});
