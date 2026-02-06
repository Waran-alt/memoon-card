import { AppLayoutShell } from '@/components/AppLayoutShell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppLayoutShell>{children}</AppLayoutShell>;
}
