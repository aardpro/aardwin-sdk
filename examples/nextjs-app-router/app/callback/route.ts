import { type NextRequest, NextResponse } from 'next/server';
import { createAardwinClient, AardwinError } from '@aardwin/auth-server';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STATE_COOKIE = 'aard_win_auth_state';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state') ?? '';
  const stateCookie = req.cookies.get(STATE_COOKIE)?.value ?? '';

  if (!code || !stateCookie || !safeEqual(stateCookie, stateParam)) {
    return new NextResponse('state mismatch', { status: 400 });
  }

  const client = createAardwinClient({
    siteId: process.env.AARDWIN_SITE_ID!,
    clientSecret: process.env.AARDWIN_CLIENT_SECRET!,
    apiOrigin: process.env.AARDWIN_API_ORIGIN,
  });

  try {
    const user = await client.exchangeCode({ code });
    const res = NextResponse.redirect(new URL('/dashboard', url));
    res.headers.append(
      'set-cookie',
      `${STATE_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`,
    );
    // TODO: set your own session cookie here, e.g.
    // res.headers.append('set-cookie', 'sid=...; HttpOnly; Secure; SameSite=Lax; Path=/');
    return res;
  } catch (e) {
    if (e instanceof AardwinError) {
      return new NextResponse(`auth failed: ${e.message}`, { status: 400 });
    }
    throw e;
  }
}
