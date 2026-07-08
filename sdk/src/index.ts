/**
 * @aardwin/auth-browser — browser entry.
 *
 * Importing this module auto-registers the <aardwin-auth> custom element.
 * For the backend code-exchange helper, use the separate `@aardwin/auth-server` package.
 */
// Force bundlers (bun build / webpack / rollup) to pull in component.ts and run
// its top-level customElements.define("aardwin-auth", ...). Without this, bun build
// tree-shakes the re-exported class and the iife is an empty stub. See batch 5 review.
// The `import "./component"` alone is insufficient: bun treats a module whose only
// exported binding is a class as side-effect-free and drops the registration call, so
// we also touch the class symbol in a preserved runtime expression below.
import { AardwinAuthElement } from "./component";

// Touch the class so the module body (which contains customElements.define at the
// bottom of component.ts) is retained by bundlers' dead-code elimination.
// `typeof AardwinAuthElement` always yields "function" for a class — a cheap, pure
// expression that bundlers still refuse to drop because it references an imported
// binding.
export const __AARDWIN_AUTH_BUNDLE_ANCHOR: string = typeof AardwinAuthElement;

export { AardwinAuthElement } from "./component";
export { AARDWIN_API_ORIGIN, PROVIDER_LABELS, STATE_COOKIE } from "./config";
export type { AuthUser, ProviderInfo } from "./types";
