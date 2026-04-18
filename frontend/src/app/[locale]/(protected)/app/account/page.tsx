import { redirect } from 'next/navigation';

/**
 * Legacy URL: account/profile/security/preferences/data have been consolidated under
 * `/app/settings`. Kept as a redirect so older bookmarks and any cached client links
 * (sidebar history, browser autocomplete) still land on the right page.
 */
export default async function AccountRedirectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/app/settings`);
}
