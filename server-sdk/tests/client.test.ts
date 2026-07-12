import { describe, it, expect } from 'bun:test';
import { createAardwinClient } from '../src/client';
import type { AardwinClient } from '../src/client';
import type { AuthUser } from '../src/types';

/**
 * Coverage for `createAardwinClient`:
 *   - client-level `siteId` / `clientSecret` / `apiOrigin` are used when input omits them
 *     (assert the POSTed body + URL).
 *   - per-call `siteId` / `clientSecret` / `apiOrigin` override the client defaults.
 *   - client-level `timeoutMs` is inherited; per-call `timeoutMs` overrides.
 *   - client-level `fetch` injection is used; per-call `fetch` overrides.
 *   - returns the same `AuthUser` shape as standalone `exchangeCode`.
 *
 * Plus a comment-only design stress-test guard (Plan §7) documenting that the spine is
 * extension-safe.
 */

type FakeResponse = {
  status: number;
  ok?: boolean;
  json: () => Promise<unknown>;
};

function fakeRes(body: unknown, status = 200): Response {
  const r: FakeResponse = {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
  return r as unknown as Response;
}

/** Build a fetch that records the (url, body) it was called with, then returns success. */
function recordingFetch(
  captured: { url?: string; body?: Record<string, unknown> },
  data: unknown
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    captured.url = String(input);
    captured.body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    return fakeRes({ code: 0, message: 'ok', data }, 200);
  };
}

describe('createAardwinClient — defaults applied when input omits fields', () => {
  it('uses the client siteId / clientSecret / apiOrigin', async () => {
    const captured: { url?: string; body?: Record<string, unknown> } = {};
    const user: AuthUser = { user_id: 'u1', provider: 'github' };
    const client = createAardwinClient({
      siteId: 'SITE',
      clientSecret: 'SECRET',
      apiOrigin: 'https://example.test',
      fetch: recordingFetch(captured, user),
    });

    const result = await client.exchangeCode({ code: 'CODE' });
    expect(result).toEqual(user);
    expect(captured.url).toBe('https://example.test/api/oauth/token');
    expect(captured.body).toEqual({
      site_id: 'SITE',
      code: 'CODE',
      client_secret: 'SECRET',
    });
  });

  it('trims a trailing slash on the client apiOrigin', async () => {
    const captured: { url?: string } = {};
    const client = createAardwinClient({
      siteId: 'SITE',
      clientSecret: 'SECRET',
      apiOrigin: 'https://example.test/',
      fetch: recordingFetch(captured, { user_id: 'u', provider: 'p' }),
    });
    await client.exchangeCode({ code: 'CODE' });
    expect(captured.url).toBe('https://example.test/api/oauth/token');
  });

  it('falls back to API_ORIGIN when apiOrigin is omitted', async () => {
    const captured: { url?: string } = {};
    const client = createAardwinClient({
      siteId: 'SITE',
      clientSecret: 'SECRET',
      fetch: recordingFetch(captured, { user_id: 'u', provider: 'p' }),
    });
    await client.exchangeCode({ code: 'CODE' });
    expect(captured.url).toBe('https://api.aard.win/api/oauth/token');
  });
});

describe('createAardwinClient — per-call overrides win over client defaults', () => {
  it('per-call siteId / clientSecret / apiOrigin override the client defaults', async () => {
    const captured: { url?: string; body?: Record<string, unknown> } = {};
    const client = createAardwinClient({
      siteId: 'DEFAULT_SITE',
      clientSecret: 'DEFAULT_SECRET',
      apiOrigin: 'https://default.test',
      fetch: recordingFetch(captured, { user_id: 'u', provider: 'p' }),
    });
    await client.exchangeCode({
      code: 'CODE',
      siteId: 'OVERRIDE_SITE',
      clientSecret: 'OVERRIDE_SECRET',
      apiOrigin: 'https://override.test/',
    });
    expect(captured.url).toBe('https://override.test/api/oauth/token');
    expect(captured.body).toEqual({
      site_id: 'OVERRIDE_SITE',
      code: 'CODE',
      client_secret: 'OVERRIDE_SECRET',
    });
  });

  it('per-call fetch override wins over the client-level fetch', async () => {
    const clientCalls: string[] = [];
    const callClientFetch = recordingFetch({ url: undefined }, {
      user_id: 'u',
      provider: 'p',
    });
    const clientFetch = (input: string | URL | Request, init?: RequestInit) => {
      clientCalls.push(String(input));
      return callClientFetch(input, init);
    };

    const overrideCalls: string[] = [];
    const overrideFetch = (input: string | URL | Request, init?: RequestInit) => {
      overrideCalls.push(String(input));
      return Promise.resolve(
        fakeRes({ code: 0, message: 'ok', data: { user_id: 'u', provider: 'p' } }, 200)
      );
    };

    const client = createAardwinClient({
      siteId: 'SITE',
      clientSecret: 'SECRET',
      fetch: clientFetch,
    });
    await client.exchangeCode({ code: 'CODE', fetch: overrideFetch });

    expect(clientCalls).toEqual([]);
    expect(overrideCalls).toEqual(['https://api.aard.win/api/oauth/token']);
  });
});

describe('createAardwinClient — timeoutMs', () => {
  it('client-level timeoutMs is inherited (hang → timeout)', async () => {
    const hangingFetch = (
      _input: string | URL | Request,
      init?: RequestInit
    ): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        const iv = setInterval(() => {
          if (signal.aborted) {
            clearInterval(iv);
            reject(signal.reason ?? new DOMException('aborted', 'AbortError'));
          }
        }, 5);
      });

    const client = createAardwinClient({
      siteId: 'SITE',
      clientSecret: 'SECRET',
      timeoutMs: 30,
      fetch: hangingFetch,
    });

    const start = Date.now();
    await expect(client.exchangeCode({ code: 'CODE' })).rejects.toThrow(
      'aardwin-auth exchange timed out'
    );
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('per-call timeoutMs overrides the client default (disable → resolves)', async () => {
    let resolved = false;
    const slowFetch = () =>
      new Promise<Response>(resolve => {
        setTimeout(() => {
          resolved = true;
          resolve(fakeRes({ code: 0, message: 'ok', data: { user_id: 'u', provider: 'p' } }, 200));
        }, 40);
      });

    const client = createAardwinClient({
      siteId: 'SITE',
      clientSecret: 'SECRET',
      timeoutMs: 10, // would time out the 40 ms fetch if inherited
      fetch: slowFetch,
    });
    const result = await client.exchangeCode({ code: 'CODE', timeoutMs: 0 });
    expect(resolved).toBe(true);
    expect(result).toEqual({ user_id: 'u', provider: 'p' });
  });
});

/* ============================================================================
 * PROOF (design stress-test, Plan §2.4 / §7) — adding client.getUser(id) does NOT change
 * any existing public signature. Uncomment to verify it type-checks against the spine; the
 * method is NOT implemented.
 * ==========================================================================*
 *
 * // type _FutureClient = AardwinClient & { getUser(userId: string): Promise<AuthUser> };
 * // const _c = createAardwinClient({ siteId: 's', clientSecret: 'x' }) as _FutureClient;
 * // void _c.getUser('u1');
 *
 * This is a comment-only guard — it documents that the spine is extension-safe and lets a
 * future Generator uncomment it as a starting point. Kept as a comment so the test suite
 * stays green without a hypothetical method existing on the runtime object.
 */
