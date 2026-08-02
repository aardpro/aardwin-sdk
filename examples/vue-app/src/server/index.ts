import type { Plugin, ViteDevServer } from 'vite';
import { createAardwinClient, AardwinError } from '@aardwin/auth-server';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface AardwinDevServerOptions {
  /** Public site id from the aardwin console. */
  siteId: string;
  /** Server-only clientSecret. NEVER sent to the browser. */
  clientSecret: string;
  /** Override the api origin (default: https://api.aard.win). */
  apiOrigin?: string;
}

interface SessionUser {
  user_id: string;
  provider: string;
  email?: string | null;
  nickname?: string;
  avatar?: string;
}

interface Account {
  user_id: string;
  nickname?: string;
  avatar?: string;
  providers: string[];
  is_new: boolean;
}

// In-memory stores — demo only. Data is lost when the dev server restarts.
const sessions = new Map<string, SessionUser>();
const accounts = new Map<string, Account>();

const STATE_COOKIE = 'aard_win_auth_state';
const SID_COOKIE = 'sid';

/**
 * Create a new session id and persist the user identity. If this is the first time
 * we see the user_id, create a new account; otherwise merge the provider into the
 * existing account. Mirrors the Next.js example's lib/session.ts behavior.
 */
function createSession(user: SessionUser): string {
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

function getSession(sid: string): SessionUser | undefined {
  return sessions.get(sid);
}

function destroySession(sid: string): void {
  sessions.delete(sid);
}

/**
 * Constant-time string comparison. timingSafeEqual requires equal-length buffers to
 * avoid leaking which string is shorter via timing, so we compare lengths first.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function getCookie(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  const match = raw.split(';').find((c: string) => c.trim().startsWith(`${name}=`));
  if (!match) return undefined;
  return match.split('=')[1]?.trim();
}

function setCookie(
  res: ServerResponse,
  name: string,
  value: string,
  opts: { maxAge?: number; httpOnly?: boolean; sameSite?: string; path?: string } = {},
): void {
  const parts: string[] = [`${name}=${value}`];
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  const header = parts.join('; ');
  const existing = res.getHeader('set-cookie') as string[] | string | undefined;
  if (Array.isArray(existing)) {
    res.setHeader('set-cookie', [...existing, header]);
  } else if (existing) {
    res.setHeader('set-cookie', [existing, header]);
  } else {
    res.setHeader('set-cookie', header);
  }
}

function redirect(res: ServerResponse, status: number, location: string): void {
  res.writeHead(status, { Location: location });
  res.end();
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function badRequest(res: ServerResponse, message: string): void {
  res.writeHead(400, { 'Content-Type': 'text/plain' });
  res.end(message);
}

function unauthorized(res: ServerResponse): void {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'no session' }));
}

class PayloadError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function sendBodyError(res: ServerResponse, err: unknown): void {
  if (err instanceof PayloadError) {
    res.writeHead(err.status, { 'Content-Type': 'text/plain' });
    res.end(err.message);
  } else {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('bad request');
  }
}

/**
 * Read a small JSON body from a Node.js IncomingMessage. The callback + handoff routes
 * send at most a few KB, so a single chunk read is sufficient. We keep this helper
 * self-contained (no Express/Hono) to match the example's constraint of using only
 * Vite's built-in dev-server middleware.
 */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const max = 64 * 1024; // 64 KB ceiling
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) {
        reject(new PayloadError('request body too large', 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve(undefined);
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new PayloadError('invalid JSON body', 400));
      }
    });
    req.on('error', (e) => reject(new PayloadError(e.message, 400)));
  });
}

function createHandler(opts: AardwinDevServerOptions) {
  const client = createAardwinClient({
    siteId: opts.siteId,
    clientSecret: opts.clientSecret,
    apiOrigin: opts.apiOrigin,
  });

  return async (req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    // GET /callback — OAuth/email callback from the aardwin bff.
    // Verify the state cookie matches the query state, then exchange the one-time code
    // for the user identity and mint an HttpOnly session cookie.
    if (pathname === '/callback' && req.method === 'GET') {
      const code = url.searchParams.get('code');
      const stateParam = url.searchParams.get('state') ?? '';
      const stateCookie = getCookie(req, STATE_COOKIE) ?? '';

      if (!code || !stateCookie || !safeEqual(stateCookie, stateParam)) {
        badRequest(res, 'state mismatch');
        return;
      }

      try {
        const user = await client.exchangeCode({ code });
        const sid = createSession(user);

        // Clear the one-time state cookie (CSRF nonce is no longer needed) and set
        // the session id. HttpOnly prevents XSS from stealing the session token;
        // SameSite=Lax mitigates CSRF on cross-site POST requests; Max-Age=86400 matches
        // the Next.js example. No Domain attribute makes it host-only.
        setCookie(res, STATE_COOKIE, '', { maxAge: 0, path: '/', sameSite: 'Lax' });
        setCookie(res, SID_COOKIE, sid, {
          maxAge: 86400,
          path: '/',
          sameSite: 'Lax',
          httpOnly: true,
        });
        redirect(res, 302, '/dashboard');
        return;
      } catch (e) {
        if (e instanceof AardwinError) {
          badRequest(res, `auth failed: ${e.message}`);
          return;
        }
        console.error('/callback error:', e);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('internal server error');
        return;
      }
    }

    // GET /api/me — returns the current session user or 401.
    if (pathname === '/api/me' && req.method === 'GET') {
      const sid = getCookie(req, SID_COOKIE);
      if (!sid) {
        unauthorized(res);
        return;
      }
      const user = getSession(sid);
      if (!user) {
        unauthorized(res);
        return;
      }
      json(res, 200, { user });
      return;
    }

    // POST /api/account-handoff — mints a one-time code for <aardwin-account>.
    // The userId must be taken from the server session, never from the request body,
    // so a browser cannot obtain a handoff for another user.
    if (pathname === '/api/account-handoff' && req.method === 'POST') {
      // Read and discard any body (keeps the connection clean) even though we do not use it.
      try {
        await readJsonBody(req);
      } catch (err) {
        sendBodyError(res, err);
        req.destroy();
        return;
      }

      const sid = getCookie(req, SID_COOKIE);
      if (!sid) {
        unauthorized(res);
        return;
      }
      const user = getSession(sid);
      if (!user) {
        unauthorized(res);
        return;
      }

      try {
        const handoff = await client.createAccountHandoff({ userId: user.user_id });
        json(res, 200, handoff);
        return;
      } catch (err) {
        console.error('createAccountHandoff failed:', err);
        json(res, 500, { error: 'handoff failed' });
        return;
      }
    }

    // POST /api/logout — destroy the server session and clear the sid cookie.
    if (pathname === '/api/logout' && req.method === 'POST') {
      try {
        await readJsonBody(req);
      } catch (err) {
        sendBodyError(res, err);
        req.destroy();
        return;
      }
      const sid = getCookie(req, SID_COOKIE);
      if (sid) destroySession(sid);
      setCookie(res, SID_COOKIE, '', { maxAge: 0, path: '/', sameSite: 'Lax', httpOnly: true });
      json(res, 200, { ok: true });
      return;
    }

    // All other routes are handled by Vite's SPA fallback (static assets + index.html).
    next();
  };
}

/**
 * Vite plugin that installs the aardwin OAuth callback + session API middleware
 * during development. The plugin is only used in the dev config (vite.config.ts), so
 * production build / preview does not include these routes — this example relies on
 * an external reverse proxy or edge config for production, unlike the Next.js example
 * where the server is part of the framework.
 */
export function aardwinDevServer(opts: AardwinDevServerOptions): Plugin {
  return {
    name: 'aardwin-dev-server',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(createHandler(opts));
    },
  };
}

export type { SessionUser, Account };
