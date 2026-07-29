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
  /** One-time handoff code from server-side createAccountHandoff(). */
  code: string;
  /** Hosted account-management URL returned alongside the code. */
  'manage-url': string;
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
