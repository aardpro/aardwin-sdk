import type { DefineComponent } from 'vue';

type AardwinAuthI18n = 'zh' | 'en';

// Note: Vue template compiler converts kebab-case bindings (e.g. :site-id) to
// camelCase prop names (e.g. siteId). The runtime still writes the kebab-case DOM
// attribute on the custom element, so these camelCase prop names are only for
// vue-tsc / Volar type checking.
interface AardwinAuthProps {
  /** Site id — drives which provider buttons are rendered. */
  siteId: string;
  /** UI language. Defaults to auto-detect from navigator.language. */
  i18n?: AardwinAuthI18n;
  /** Override the SDK api origin (default: https://api.aard.win). */
  apiOrigin?: string;
  /** Optional callback path. Non-empty values append return_url to the redirect URL. */
  callbackPath?: string;
}

interface AardwinAccountProps {
  /** Site id — drives which providers can be bound. */
  siteId: string;
  /** One-time handoff code minted server-side via createAccountHandoff(). */
  code: string;
  /** UI language. Defaults to auto-detect from navigator.language. */
  i18n?: AardwinAuthI18n;
  /** Override the SDK api origin (default: https://api.aard.win). */
  apiOrigin?: string;
}

declare module 'vue' {
  export interface GlobalComponents {
    'aardwin-auth': DefineComponent<AardwinAuthProps>;
    'aardwin-account': DefineComponent<AardwinAccountProps>;
  }
}

export {};
