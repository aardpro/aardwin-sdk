import 'react';
import type { CSSProperties } from 'react';

type AardwinAuthI18n = 'zh' | 'en';

interface AardwinAuthAttributes {
  'site-id': string;
  i18n?: AardwinAuthI18n;
  'api-origin'?: string;
  style?: string | CSSProperties;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'aardwin-auth': AardwinAuthAttributes;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'aardwin-auth': AardwinAuthAttributes;
    }
  }
}
