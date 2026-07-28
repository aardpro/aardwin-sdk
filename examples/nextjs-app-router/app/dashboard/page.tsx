import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, getAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const sid = cookieStore.get('sid')?.value;

  if (!sid) redirect('/login');

  const user = getSession(sid);
  if (!user) redirect('/login');

  const account = getAccount(user.user_id);

  return (
    <main style={{ maxWidth: 720, margin: '80px auto', padding: 24, fontFamily: 'system-ui' }}>
      <h1>Dashboard</h1>

      <section style={{ marginBottom: 24 }}>
        <h2>User Info</h2>
        <table style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: '4px 12px 4px 0', fontWeight: 600 }}>user_id</td>
              <td>{user.user_id}</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 12px 4px 0', fontWeight: 600 }}>provider</td>
              <td>{user.provider}</td>
            </tr>
            {user.nickname && (
              <tr>
                <td style={{ padding: '4px 12px 4px 0', fontWeight: 600 }}>nickname</td>
                <td>{user.nickname}</td>
              </tr>
            )}
            {user.avatar && (
              <tr>
                <td style={{ padding: '4px 12px 4px 0', fontWeight: 600 }}>avatar</td>
                <td>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={user.avatar} alt="avatar" width={32} height={32} style={{ borderRadius: 4 }} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {account && (
        <section style={{ marginBottom: 24 }}>
          <h2>Account Status</h2>
          <p>
            <strong>{account.is_new ? 'Registered (first login)' : 'Logged in (returning)'}</strong>
          </p>
          <p>
            Bound providers: {account.providers.join(', ')}
          </p>
          <p style={{ color: '#666', fontSize: 13 }}>
            Same user_id logging in via different providers is treated as &quot;bind&quot; —
            all providers accumulate under one account. There is no separate bind API in this demo.
          </p>
        </section>
      )}

      <section>
        <form action="/api/logout" method="POST">
          <button type="submit" style={{ padding: '8px 16px', cursor: 'pointer' }}>
            Sign out
          </button>
        </form>
      </section>

      <p style={{ marginTop: 32, color: '#999', fontSize: 12 }}>
        Sessions are stored in an in-memory Map. Restarting the server clears all sessions.
      </p>
    </main>
  );
}
