/**
 * @aardwin/auth-browser — browser entry.
 *
 * Importing this module auto-registers the <aardwin-auth> and <aardwin-account>
 * custom elements.
 * For the backend code-exchange helper, use the separate `@aardwin/auth-server` package.
 */
// Force bundlers (bun build / webpack / rollup) to pull in component.ts and run
// its top-level customElements.define("aardwin-auth", ...). Without this, bun build
// tree-shakes the re-exported class and the iife is an empty stub. See batch 5 review.
// The `import "./component"` alone is insufficient: bun treats a module whose only
// exported binding is a class as side-effect-free and drops the registration call, so
// we also touch the class symbol in a preserved runtime expression below.
import { AardwinAuthElement } from "./component";
import { AardwinAccountElement } from "./account-element";

// Touch both classes so the module body (which contains customElements.define at the
// bottom of each file) is retained by bundlers' dead-code elimination.
export const __AARDWIN_AUTH_BUNDLE_ANCHOR: string = typeof AardwinAuthElement;
export const __AARDWIN_ACCOUNT_BUNDLE_ANCHOR: string = typeof AardwinAccountElement;

export { AardwinAuthElement } from "./component";
export { AardwinAccountElement } from "./account-element";
export { API_ORIGIN, PROVIDER_LABELS, STATE_COOKIE } from "./config";
export type { AuthUser, ProviderInfo } from "./types";
