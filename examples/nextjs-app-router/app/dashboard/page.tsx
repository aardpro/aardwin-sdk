import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAardwinClient } from '@aardwin/auth-server';
import { getSession, getAccount } from '@/lib/session';
import AardwinAccount from './aardwin-account';

export const dynamic = 'force-dynamic';

// 示例页视觉 token（与 SDK 组件同源）：中性面 + 发丝边框 + 品牌深绿。
const FONT =
  "system-ui,-apple-system,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif";
const MAIN: React.CSSProperties = {
  maxWidth: 680,
  margin: '56px auto 72px',
  padding: '0 24px',
  fontFamily: FONT,
  color: '#16181d',
};
const H1: React.CSSProperties = { margin: '0 0 24px', fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em' };
const SECTION: React.CSSProperties = {
  marginBottom: 20,
  padding: '20px 22px',
  border: '1px solid #e3e6ea',
  borderRadius: 14,
  background: '#fff',
  boxShadow: '0 1px 2px rgba(16,24,40,.03)',
};
const H2: React.CSSProperties = { margin: '0 0 14px', fontSize: 14, fontWeight: 600, color: '#16181d' };
const KV_LABEL: React.CSSProperties = { padding: '4px 16px 4px 0', fontWeight: 600, fontSize: 13, color: '#5b616e', whiteSpace: 'nowrap' };
const KV_VALUE: React.CSSProperties = { padding: '4px 0', fontSize: 13, color: '#16181d', wordBreak: 'break-all' };
const MUTED: React.CSSProperties = { color: '#8a919e', fontSize: 12, lineHeight: 1.6 };
const SIGNOUT: React.CSSProperties = {
  padding: '9px 18px',
  border: '1px solid #e3e6ea',
  borderRadius: 10,
  background: '#fff',
  color: '#16181d',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const sid = cookieStore.get('sid')?.value;

  if (!sid) redirect('/login');

  const user = getSession(sid);
  if (!user) redirect('/login');

  const account = getAccount(user.user_id);

  // Mint a one-time handoff code for the <aardwin-account> inline component.
  // Server-to-server; failures are logged but non-fatal so a transient api issue
  // doesn't blank the whole dashboard — the account manager simply won't render.
  // Track A 后端已去掉 manage_url：handoff 只返回 {code, expiresIn}（组件自包含渲染）。
  let accountHandoff: { code: string; expiresIn: number } | null = null;
  try {
    const client = createAardwinClient({
      siteId: process.env.NEXT_PUBLIC_AARDWIN_SITE_ID!,
      clientSecret: process.env.AARDWIN_CLIENT_SECRET!,
    });
    accountHandoff = await client.createAccountHandoff({ userId: user.user_id });
  } catch (err) {
    console.error('createAccountHandoff failed:', err);
    accountHandoff = null;
  }

  return (
    <main style={MAIN}>
      <h1 style={H1}>Dashboard</h1>

      <section style={SECTION}>
        <h2 style={H2}>User Info</h2>
        <table style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={KV_LABEL}>user_id</td>
              <td style={KV_VALUE}>{user.user_id}</td>
            </tr>
            <tr>
              <td style={KV_LABEL}>provider</td>
              <td style={KV_VALUE}>{user.provider}</td>
            </tr>
            {user.email && (
              <tr>
                <td style={KV_LABEL}>email</td>
                <td style={KV_VALUE}>{user.email}</td>
              </tr>
            )}
            {user.nickname && (
              <tr>
                <td style={KV_LABEL}>nickname</td>
                <td style={KV_VALUE}>{user.nickname}</td>
              </tr>
            )}
            {user.avatar && (
              <tr>
                <td style={KV_LABEL}>avatar</td>
                <td style={KV_VALUE}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={user.avatar}
                    alt="avatar"
                    width={32}
                    height={32}
                    style={{ borderRadius: 8, border: '1px solid #e3e6ea' }}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {accountHandoff && (
        <section style={SECTION}>
          <h2 style={H2}>Account Management</h2>
          <p style={{ color: '#5b616e', fontSize: 13, margin: '0 0 14px' }}>
            Bind or unbind identity providers — managed by aardwin.
          </p>
          <AardwinAccount
            siteId={process.env.NEXT_PUBLIC_AARDWIN_SITE_ID!}
            code={accountHandoff.code}
          />
        </section>
      )}

      {account && (
        <section style={SECTION}>
          <h2 style={H2}>Account Status</h2>
          <p style={{ margin: '0 0 6px', fontSize: 13 }}>
            <strong>{account.is_new ? 'Registered (first login)' : 'Logged in (returning)'}</strong>
          </p>
          <p style={{ margin: '0 0 6px', fontSize: 13 }}>
            Bound providers: {account.providers.join(', ')}
          </p>
          <p style={MUTED}>
            Same user_id logging in via different providers is treated as &quot;bind&quot; —
            all providers accumulate under one account. There is no separate bind API in this demo.
          </p>
        </section>
      )}

      <section>
        <form action="/api/logout" method="POST">
          <button type="submit" style={SIGNOUT}>
            Sign out
          </button>
        </form>
      </section>

      <p style={{ marginTop: 28, ...MUTED }}>
        Sessions are stored in an in-memory Map. Restarting the server clears all sessions.
      </p>
    </main>
  );
}
