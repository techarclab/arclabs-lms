'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@arc/ui';
import { LogoMark } from '@/components/brand/Logo';
import { useAuth } from '@/components/providers/AuthProvider';
import { OrgProvider } from '@/components/providers/OrgProvider';
import { CollegeEmailBanner } from '@/components/announcements/CollegeEmailBanner';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, signedIn, me, error, signOut } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !signedIn) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, signedIn, router, pathname]);

  if (loading || !signedIn || (!me && !error)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <LogoMark className="size-10 animate-pulse" />
        <Loader2 className="size-4 animate-spin text-ink-400" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <AlertTriangle className="size-5" />
          </div>
          <h1 className="text-lg font-semibold">We couldn’t load your account</h1>
          <p className="mt-2 text-sm text-ink-500">{error}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="secondary" onClick={() => signOut()}>
              Sign out
            </Button>
            <Button onClick={() => window.location.reload()}>Try again</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <OrgProvider>
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="lg:pl-[264px]">
        <Topbar onMenu={() => setNavOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-10">
          <CollegeEmailBanner />
          {children}
        </main>
      </div>
    </OrgProvider>
  );
}
