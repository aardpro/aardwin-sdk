/**
 * @aardwin/auth-server — framework-agnostic aardwin API client (server-side).
 *
 * Public surface:
 *   - `createAardwinClient(opts)` / `AardwinClient` — preferred for multi-call processes.
 *   - `exchangeCode(input)` — standalone convenience for one-off / serverless handlers.
 *   - `createAccountHandoff(input)` — create an account-management handoff code.
 *   - `AardwinError` — structured error thrown on every failure path.
 *   - `AuthUser` — end-user identity returned by `exchangeCode`.
 *
 * This package is SELF-CONTAINED: zero runtime dependencies. See `README.md` for the
 * full integration guide (quickstart, error matrix, timeouts, retry policy, and the
 * state-verification reference snippet).
 */
export { createAardwinClient } from './client';
export type { AardwinClient, CreateAardwinClientOptions } from './client';
export { exchangeCode } from './exchange-code';
export type { ExchangeCodeInput } from './exchange-code';
export { createAccountHandoff } from './create-account-handoff';
export type { CreateAccountHandoffInput, AccountHandoffOutput } from './create-account-handoff';
export { AardwinError } from './aardwin-error';
export type { AardwinErrorOptions } from './aardwin-error';
export { EXCHANGE_CODES } from './codes';
export type { ExchangeCodeValue } from './codes';
export type { AuthUser, AccountHandoffResult } from './types';
