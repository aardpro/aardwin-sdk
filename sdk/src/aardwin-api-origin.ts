import { AARDWIN_API_ORIGIN } from "./config";

/**
 * Resolve the effective aardwin api origin from the raw `aardwin-api-origin` attribute value.
 *
 * Rules (mirrors `<aardwin-auth>` render + startAuth behavior):
 *   - attribute absent / whitespace-only / empty string → fall back to AARDWIN_API_ORIGIN.
 *   - otherwise → trimmed attribute value.
 *
 * Lives in a DOM-free module so unit tests can cover origin resolution without a DOM
 * (bun test does not ship document/HTMLElement by default).
 */
export function resolveAardwinApiOrigin(attr: string | null): string {
  const trimmed = attr?.trim();
  return trimmed ? trimmed : AARDWIN_API_ORIGIN;
}
