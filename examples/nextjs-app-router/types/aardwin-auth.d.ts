import 'react';
import type { CSSProperties } from 'react';

type AardwinAuthI18n = 'zh' | 'en';

interface AardwinAuthAttributes {
  'site-id': string;
  i18n?: AardwinAuthI18n;
  'api-origin'?: string;
  style?: string | CSSProperties;
}

interface AardwinAccountAttributes {
  /** Site id — drives which providers can be bound (GET /api/providers?site_id=). */
  'site-id': string;
  /** One-time handoff code from server-side createAccountHandoff(). */
  code: string;
  /** Optional api origin override (defaults to the SDK's API_ORIGIN). */
  'api-origin'?: string;
  i18n?: AardwinAuthI18n;
  style?: string | CSSProperties;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'aardwin-auth': AardwinAuthAttributes;
      'aardwin-account': AardwinAccountAttributes;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'aardwin-auth': AardwinAuthAttributes;
      'aardwin-account': AardwinAccountAttributes;
    }
  }
}
