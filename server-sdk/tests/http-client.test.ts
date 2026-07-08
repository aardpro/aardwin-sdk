import { describe, it, expect } from 'bun:test';
import { postJson } from '../src/http-client';
import { AardwinError } from '../src/aardwin-error';

/**
 * Direct unit tests for the internal `postJson`. Some behavior is covered transitively by
 * `exchange-code.test.ts`, but these tests lock the contract directly so future methods
 * (getUser / etc.) that reuse `postJson` inherit a known-good baseline.
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

function jsonFetch(body: unknown, status = 200) {
  return async () => fakeRes(body, status);
}

function hangingFetch(): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return (_input, init) =>
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
}

const BASE = {
  apiOrigin: 'https://example.test',
  path: '/api/oauth/token',
  body: { site_id: 'SITE', code: 'CODE' },
  clientSecret: 'SECRET',
};

describe('postJson — success', () => {
  it('returns { data, status } on envelope code === 0 with data', async () => {
    const data = { user_id: 'u1', provider: 'github' };
    const result = await postJson<typeof data>({
      ...BASE,
      fetchImpl: jsonFetch({ code: 0, message: 'ok', data }, 200),
    });
    expect(result.status).toBe(200);
    expect(result.data).toEqual(data);
  });

  it('sends the body as JSON and includes client_secret when provided', async () => {
    let sentBody: Record<string, unknown> | undefined;
    let sentUrl: string | undefined;
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      sentUrl = String(input);
      sentBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      return fakeRes({ code: 0, message: 'ok', data: { ok: true } }, 200);
    };
    await postJson({ ...BASE, fetchImpl });
    expect(sentUrl).toBe('https://example.test/api/oauth/token');
    expect(sentBody).toEqual({
      site_id: 'SITE',
      code: 'CODE',
      client_secret: 'SECRET',
    });
  });

  it('omits client_secret from the body when not provided', async () => {
    let sentBody: Record<string, unknown> | undefined;
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
      sentBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      return fakeRes({ code: 0, message: 'ok', data: { ok: true } }, 200);
    };
    await postJson({
      apiOrigin: 'https://example.test',
      path: '/some/other',
      body: { foo: 'bar' },
      fetchImpl,
    });
    expect(sentBody).toEqual({ foo: 'bar' });
  });
});

describe('postJson — failure mapping', () => {
  it('envelope code !== 0 → AardwinError with code + status', async () => {
    await expect(
      postJson({
        ...BASE,
        fetchImpl: jsonFetch({ code: 40002, message: 'invalid client_secret' }, 401),
      })
    ).rejects.toMatchObject({
      name: 'AardwinError',
      code: 40002,
      status: 401,
      message: 'invalid client_secret',
    });
  });

  it('missing envelope code → AardwinError with undefined code', async () => {
    await expect(
      postJson({
        ...BASE,
        fetchImpl: jsonFetch({ message: 'unauthorized' }, 401),
      })
    ).rejects.toMatchObject({
      code: undefined,
      status: 401,
      message: 'unauthorized',
    });
  });

  it('envelope code === 0 but missing data → throws (treated as malformed)', async () => {
    await expect(
      postJson({
        ...BASE,
        fetchImpl: jsonFetch({ code: 0, message: 'ok' }, 200),
      })
    ).rejects.toBeInstanceOf(AardwinError);
  });

  it('non-JSON body → AardwinError with status + non-JSON marker', async () => {
    const fetchImpl = async () =>
      ({
        status: 502,
        ok: false,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      } as unknown as Response);
    await expect(
      postJson({ ...BASE, fetchImpl })
    ).rejects.toMatchObject({
      status: 502,
      code: undefined,
    });
    try {
      await postJson({ ...BASE, fetchImpl });
      throw new Error('expected throw');
    } catch (e) {
      expect((e as AardwinError).message).toMatch(/non-JSON/);
      expect((e as AardwinError).message).toMatch(/502/);
    }
  });

  it('bare network error → AardwinError with cause + failed prefix', async () => {
    const original = new TypeError('failed to fetch');
    const fetchImpl = async () => {
      throw original;
    };
    try {
      await postJson({ ...BASE, fetchImpl });
      throw new Error('expected throw');
    } catch (e) {
      const ae = e as AardwinError;
      expect(ae).toBeInstanceOf(AardwinError);
      expect(ae.cause).toBe(original);
      expect(ae.code).toBeUndefined();
      expect(ae.status).toBeUndefined();
      expect(ae.message).toMatch(/aardwin-auth exchange failed/);
      expect(ae.message).toMatch(/failed to fetch/);
    }
  });
});

describe('postJson — abort composition', () => {
  it('internal timeout fires → reason: "timeout"', async () => {
    const start = Date.now();
    try {
      await postJson({ ...BASE, fetchImpl: hangingFetch(), timeoutMs: 30 });
      throw new Error('expected throw');
    } catch (e) {
      expect(Date.now() - start).toBeLessThan(2000);
      const ae = e as AardwinError;
      expect(ae).toBeInstanceOf(AardwinError);
      expect(ae.reason).toBe('timeout');
      expect(ae.message).toBe('aardwin-auth exchange timed out');
    }
  });

  it('caller signal aborts → reason: "aborted"', async () => {
    const ac = new AbortController();
    const p = postJson({
      ...BASE,
      fetchImpl: hangingFetch(),
      signal: ac.signal,
      timeoutMs: 0,
    });
    queueMicrotask(() => ac.abort());
    try {
      await p;
      throw new Error('expected throw');
    } catch (e) {
      const ae = e as AardwinError;
      expect(ae.reason).toBe('aborted');
      expect(ae.message).toBe('aardwin-auth exchange aborted');
      expect(ae.cause).toBeDefined();
    }
  });
});
