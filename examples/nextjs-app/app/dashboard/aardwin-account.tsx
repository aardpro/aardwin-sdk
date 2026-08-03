'use client';

import { useEffect } from 'react';

interface AardwinAccountProps {
  /** Site id — drives which providers can be bound (GET /api/providers?site_id=). */
  siteId: string;
  /** One-time handoff code from server-side createAccountHandoff(). */
  code: string;
  /** UI language. Defaults to English. */
  i18n?: 'zh' | 'en';
}

/**
 * Client wrapper around the <aardwin-account> Web Component (registered by
 * `@aardwin/auth-browser`). The dashboard is a server component and the custom
 * element must register on the client, so this thin client component imports the
 * browser package in an effect and renders the element. The element is self-contained
 * (mirrors <aardwin-auth>): it builds a session from the handoff code, lists bound
 * identities (with unbind), and renders bind buttons for the remaining providers.
 */
export default function AardwinAccount({ siteId, code, i18n = 'en' }: AardwinAccountProps) {
  useEffect(() => {
    // Side-effect import registers <aardwin-account> (and <aardwin-auth>) on the client.
    void import('@aardwin/auth-browser');
  }, []);

  return <aardwin-account site-id={siteId} code={code} i18n={i18n} />;
}
