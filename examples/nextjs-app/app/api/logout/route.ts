import { type NextRequest, NextResponse } from 'next/server';
import { destroySession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const sid = req.cookies.get('sid')?.value;

  if (sid) destroySession(sid);

  const url = new URL('/login', req.url);
  const res = NextResponse.redirect(url);
  res.headers.append('set-cookie', 'sid=; Max-Age=0; Path=/; SameSite=Lax');
  return res;
}
