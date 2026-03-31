/** Product shell (nav) for `/app/*`. Parent `(protected)/layout.tsx` already enforced session + login redirect. */
import { AppLayoutShell } from '@/components/AppLayoutShell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppLayoutShell>{children}</AppLayoutShell>;
}
