'use client';

import Link from 'next/link';
import { useLocale } from 'i18n';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/store/auth.store';

export default function AdminPage() {
  const { locale } = useLocale();
  const { t: ta } = useTranslation('app', locale);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  if (user != null && !isAdmin) {
    return (
      <div className="mc-study-page mx-auto max-w-2xl space-y-4">
        <div className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-6 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-(--mc-text-primary)">{ta('adminAccessDeniedTitle')}</h2>
          <p className="mt-2 text-sm text-(--mc-text-secondary)">{ta('adminAccessDeniedMessage')}</p>
          <Link
            href={`/${locale}/app`}
            className="mt-4 inline-block rounded bg-(--mc-accent-success) px-4 pt-1.5 pb-2 text-sm font-medium text-white hover:opacity-90"
          >
            {ta('adminBackToApp')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-study-page mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-(--mc-text-primary)">{ta('adminTitle')}</h2>
        <p className="mt-1 text-sm text-(--mc-text-secondary)">{ta('adminIntro')}</p>
      </div>
      <div className="rounded-xl border border-(--mc-border-subtle) bg-(--mc-bg-surface) p-6 text-center shadow-sm">
        <p className="text-sm text-(--mc-text-secondary)">{ta('adminUserManagementComingSoon')}</p>
      </div>
    </div>
  );
}
