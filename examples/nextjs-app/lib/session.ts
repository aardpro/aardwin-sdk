import { randomBytes } from 'node:crypto';

export interface SessionUser {
  user_id: string;
  provider: string;
  email?: string | null;
  nickname?: string;
  avatar?: string;
}

export interface Account {
  user_id: string;
  nickname?: string;
  avatar?: string;
  providers: string[];
  is_new: boolean;
}

// In-memory stores — process restart loses all data (demo only, no DB).
//
// Pinned on `globalThis` (not a plain module-level `const`) because Next.js dev
// compiles each route on-demand: the first login compiles /callback
// (createSession) and /dashboard (getSession) as separate compilations, and a
// plain `new Map()` gets re-evaluated between them — getSession returns
// undefined and the user silently bounces back to /login. The second attempt
// works because both routes are already compiled. globalThis survives that
// re-evaluation (same pattern Next.js docs recommend for DB clients).
// Production (npm run build && start) is unaffected — no on-demand compilation.
declare global {
  // eslint-disable-next-line no-var
  var __aardwinExampleSessions: Map<string, SessionUser> | undefined;
  // eslint-disable-next-line no-var
  var __aardwinExampleAccounts: Map<string, Account> | undefined;
}

const sessions: Map<string, SessionUser> =
  globalThis.__aardwinExampleSessions ?? (globalThis.__aardwinExampleSessions = new Map());
const accounts: Map<string, Account> =
  globalThis.__aardwinExampleAccounts ?? (globalThis.__aardwinExampleAccounts = new Map());

export function createSession(user: SessionUser): string {
  const sid = randomBytes(32).toString('hex');
  sessions.set(sid, user);

  const existing = accounts.get(user.user_id);
  if (existing) {
    if (!existing.providers.includes(user.provider)) {
      existing.providers.push(user.provider);
    }
    if (user.nickname) existing.nickname = user.nickname;
    if (user.avatar) existing.avatar = user.avatar;
    existing.is_new = false;
  } else {
    accounts.set(user.user_id, {
      user_id: user.user_id,
      nickname: user.nickname,
      avatar: user.avatar,
      providers: [user.provider],
      is_new: true,
    });
  }

  return sid;
}

export function getSession(sid: string): SessionUser | undefined {
  return sessions.get(sid);
}

export function getAccount(user_id: string): Account | undefined {
  return accounts.get(user_id);
}

export function destroySession(sid: string): void {
  sessions.delete(sid);
}
