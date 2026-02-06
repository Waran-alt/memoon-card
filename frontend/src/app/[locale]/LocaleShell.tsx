'use client';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export function LocaleShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="fixed top-0 right-0 z-50 p-2">
        <LanguageSwitcher />
      </div>
      <div className="min-h-screen">{children}</div>
    </>
  );
}
