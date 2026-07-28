'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const SITE_ID = process.env.NEXT_PUBLIC_AARDWIN_SITE_ID ?? '';
const API_ORIGIN = process.env.NEXT_PUBLIC_AARDWIN_API_ORIGIN ?? undefined;

function LoginPageInner() {
  const searchParams = useSearchParams();
  const lang = (searchParams.get('lang') ?? 'en') as 'zh' | 'en';
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void import('@aardwin/auth-browser');
    const onError = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      setError(detail?.message ?? 'Authentication error');
      setLoading(false);
    };
    const onReady = () => setLoading(false);
    window.addEventListener('aardwin:error', onError);
    window.addEventListener('aardwin:ready', onReady);
    return () => {
      window.removeEventListener('aardwin:error', onError);
      window.removeEventListener('aardwin:ready', onReady);
    };
  }, []);

  return (
    <main style={{ maxWidth: 480, margin: '80px auto', padding: 24, fontFamily: 'system-ui' }}>
      <h1>Sign in</h1>
      {error && (
        <div style={{ color: 'crimson', marginBottom: 16 }}>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}
      {loading && !error && <p>Loading providers…</p>}
      <aardwin-auth
        site-id={SITE_ID}
        i18n={lang}
        api-origin={API_ORIGIN}
        style={{ display: error ? 'none' : 'block' }}
      />
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 480, margin: '80px auto', padding: 24, fontFamily: 'system-ui' }}>
          <p>Loading…</p>
        </main>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
