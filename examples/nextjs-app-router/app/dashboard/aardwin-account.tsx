'use client';

import { useEffect } from 'react';

interface AardwinAccountProps {
  /** One-time handoff code from server-side createAccountHandoff(). */
  code: string;
  /** Hosted account-management URL returned alongside the code. */
  manageUrl: string;
  /** UI language. Defaults to English. */
  i18n?: 'zh' | 'en';
}

/**
 * Client wrapper around the <aardwin-account> Web Component (registered by
 * `@aardwin/auth-browser`). The dashboard is a server component and the custom
 * element must register on the client, so this thin client component imports the
 * browser package in an effect and renders the element. The element renders aardwin's
 * hosted account-management UI (bind/unbind providers, edit profile) in an iframe.
 */
export default function AardwinAccount({ code, manageUrl, i18n = 'en' }: AardwinAccountProps) {
  useEffect(() => {
    // Side-effect import registers <aardwin-account> (and <aardwin-auth>) on the client.
    void import('@aardwin/auth-browser');
  }, []);

  return <aardwin-account code={code} manage-url={manageUrl} i18n={i18n} />;
}
