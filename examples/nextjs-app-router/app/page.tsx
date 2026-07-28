import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const cookieStore = await cookies();
  const sid = cookieStore.get('sid')?.value;

  if (sid && getSession(sid)) {
    redirect('/dashboard');
  }
  redirect('/login');
}
