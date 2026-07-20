import { describe, it, expect } from 'bun:test';
import { createAccountHandoff, AardwinError } from '../src/create-account-handoff';
import { createAardwinClient } from '../src/client';
import type { AccountHandoffResult } from '../src/types';

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

function makeJsonFetch(body: unknown, status = 200) {
  return async () => fakeRes(body, status);
}

function recordingFetch(
  captured: { url?: string; body?: Record<string, unknown> },
  data: unknown,
) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    captured.url = String(input);
    captured.body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    return fakeRes({ code: 0, message: 'ok', data }, 200);
  };
}

const BASE_INPUT = {
  siteId: 'SITE',
  userId: 'USER',
  clientSecret: 'SECRET',
};

const SUCCESS_DATA: AccountHandoffResult = {
  code: 'handoff_code_xyz',
  expires_in: 60,
  manage_url: 'https://auth.aard.win/account/manage',
};

describe('createAccountHandoff — success', () => {
  it('success: code 0 returns camelCase output', async () => {
    const fetchImpl = makeJsonFetch({ code: 0, message: 'ok', data: SUCCESS_DATA }, 200);
    const result = await createAccountHandoff({ ...BASE_INPUT, fetch: fetchImpl });
    expect(result).toEqual({
      code: 'handoff_code_xyz',
      expiresIn: 60,
      manageUrl: 'https://auth.aard.win/account/manage',
    });
  });

  it('sends correct body to /api/account/handoff', async () => {
    const captured: { url?: string; body?: Record<string, unknown> } = {};
    const fetchImpl = recordingFetch(captured, SUCCESS_DATA);
    await createAccountHandoff({ ...BASE_INPUT, fetch: fetchImpl });
    expect(captured.url).toBe('https://api.aard.win/api/account/handoff');
    expect(captured.body).toEqual({
      site_id: 'SITE',
      user_id: 'USER',
      client_secret: 'SECRET',
    });
  });

  it('accepts custom apiOrigin', async () => {
    const captured: { url?: string; body?: Record<string, unknown> } = {};
    const fetchImpl = recordingFetch(captured, SUCCESS_DATA);
    await createAccountHandoff({ ...BASE_INPUT, apiOrigin: 'https://custom.test', fetch: fetchImpl });
    expect(captured.url).toBe('https://custom.test/api/account/handoff');
  });
});

describe('createAccountHandoff — failure modes', () => {
  it('401 throws AardwinError', async () => {
    const fetchImpl = makeJsonFetch({ message: 'unauthorized' }, 401);
    try {
      await createAccountHandoff({ ...BASE_INPUT, fetch: fetchImpl });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AardwinError);
      const ae = e as AardwinError;
      expect(ae.status).toBe(401);
      expect(ae.code).toBeUndefined();
    }
  });

  it('429 throws AardwinError with status', async () => {
    const fetchImpl = makeJsonFetch({ code: 429, message: 'too many requests' }, 429);
    try {
      await createAccountHandoff({ ...BASE_INPUT, fetch: fetchImpl });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AardwinError);
      const ae = e as AardwinError;
      expect(ae.status).toBe(429);
      expect(ae.code).toBe(429);
    }
  });
});

describe('createAccountHandoff via client', () => {
  it('client.createAccountHandoff uses defaults and returns camelCase', async () => {
    const captured: { url?: string; body?: Record<string, unknown> } = {};
    const client = createAardwinClient({
      siteId: 'CLIENT_SITE',
      clientSecret: 'CLIENT_SECRET',
      fetch: recordingFetch(captured, SUCCESS_DATA),
    });
    const result = await client.createAccountHandoff({ userId: 'USER' });
    expect(result).toEqual({
      code: 'handoff_code_xyz',
      expiresIn: 60,
      manageUrl: 'https://auth.aard.win/account/manage',
    });
    expect(captured.body).toEqual({
      site_id: 'CLIENT_SITE',
      user_id: 'USER',
      client_secret: 'CLIENT_SECRET',
    });
  });

  it('per-call siteId overrides client default', async () => {
    const captured: { url?: string; body?: Record<string, unknown> } = {};
    const client = createAardwinClient({
      siteId: 'DEFAULT',
      clientSecret: 'SECRET',
      fetch: recordingFetch(captured, SUCCESS_DATA),
    });
    await client.createAccountHandoff({ siteId: 'OVERRIDE', userId: 'USER' });
    expect(captured.body?.site_id).toBe('OVERRIDE');
  });
});
