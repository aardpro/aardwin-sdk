'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const SITE_ID = process.env.NEXT_PUBLIC_AARDWIN_SITE_ID ?? '';

// 示例页视觉：中性面 + 发丝边框 + 品牌深绿 —— 与 <aardwin-auth> 组件 token 同源。
const CARD: React.CSSProperties = {
  maxWidth: 400,
  margin: '10vh auto 0',
  padding: '36px 32px',
  fontFamily:
    "system-ui,-apple-system,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif",
  border: '1px solid #e3e6ea',
  borderRadius: 14,
  background: '#fff',
  boxShadow: '0 1px 2px rgba(16,24,40,.04), 0 12px 32px rgba(16,24,40,.06)',
};

const TITLE: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: 20,
  fontWeight: 700,
  letterSpacing: '-0.01em',
  color: '#16181d',
};

const SUB: React.CSSProperties = {
  margin: '0 0 24px',
  fontSize: 13,
  color: '#5b616e',
};

const ERROR: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 16,
  padding: '10px 12px',
  border: '1px solid #f1d5d3',
  borderRadius: 10,
  background: '#fdf3f2',
  color: '#b42318',
  fontSize: 13,
};

const RETRY: React.CSSProperties = {
  padding: '5px 12px',
  border: '1px solid #e3e6ea',
  borderRadius: 8,
  background: '#fff',
  color: '#16181d',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

function LoginPageInner() {
  const searchParams = useSearchParams();
  const lang = (searchParams.get('lang') ?? 'en') as 'zh' | 'en';
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void import('@aardwin/auth-browser');
    // 演示监听组件事件（错误态由组件自身在 shadow DOM 内渲染；此处同步宿主提示）。
    const onError = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      setError(detail?.message ?? 'Authentication error');
    };
    window.addEventListener('aardwin:error', onError);
    return () => {
      window.removeEventListener('aardwin:error', onError);
    };
  }, []);

  return (
    <main style={CARD}>
      <h1 style={TITLE}>Sign in</h1>
      <p style={SUB}>Continue with one of the providers below</p>
      {error && (
        <div style={ERROR} role="alert">
          <span>{error}</span>
          <button style={RETRY} onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}
      {/* 组件自带骨架屏 loading / 错误态，无需宿主额外指示 */}
      <aardwin-auth
        site-id={SITE_ID}
        i18n={lang}
        style={{ display: error ? 'none' : 'block' }}
      />
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 400, margin: '10vh auto 0', padding: 36, fontFamily: 'system-ui' }}>
          <div
            style={{
              height: 44,
              borderRadius: 12,
              background:
                'linear-gradient(90deg,#f1f2f4 25%,#f8f9fa 37%,#f1f2f4 63%)',
              backgroundSize: '400% 100%',
            }}
          />
        </main>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
