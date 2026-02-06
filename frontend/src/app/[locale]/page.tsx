import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { HomeContent } from './HomeContent';

interface HomeProps {
  params: Promise<{ locale: string }>;
}

export default async function Home({ params }: HomeProps) {
  const { locale } = await params;
  const cookieStore = await cookies();
  const session = await getSession(cookieStore);
  if (session) redirect(`/${locale}/app`);

  return <HomeContent />;
}
