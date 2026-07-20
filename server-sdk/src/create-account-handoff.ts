import type { AccountHandoffResult } from './types';
import { postJson } from './http-client';
import { normalizeOrigin } from './config';

export { AardwinError } from './aardwin-error';
export type { AardwinErrorOptions } from './aardwin-error';

export interface CreateAccountHandoffInput {
  userId: string;
  siteId?: string;
  clientSecret?: string;
  apiOrigin?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

export interface AccountHandoffOutput {
  code: string;
  expiresIn: number;
  manageUrl: string;
}

export async function createAccountHandoff(
  input: CreateAccountHandoffInput & { siteId: string; clientSecret: string },
): Promise<AccountHandoffOutput> {
  const fetchImpl = input.fetch ?? fetch;
  const origin = normalizeOrigin(input.apiOrigin);

  const { data } = await postJson<AccountHandoffResult>({
    apiOrigin: origin,
    path: '/api/account/handoff',
    body: { site_id: input.siteId, user_id: input.userId },
    clientSecret: input.clientSecret,
    timeoutMs: input.timeoutMs,
    signal: input.signal,
    fetchImpl,
  });

  return {
    code: data.code,
    expiresIn: data.expires_in,
    manageUrl: data.manage_url,
  };
}
