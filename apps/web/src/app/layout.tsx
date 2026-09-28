import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/components/providers/AuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ARC LABS Learning', template: '%s · ARC LABS' },
  description:
    'The ARC LABS training platform for IoT, embedded systems and AI — courses, batches, projects and certificates.',
};

export const viewport: Viewport = { themeColor: '#0a0d16' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans">
        <AuthProvider>{children}</AuthProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: 'rounded-xl border border-ink-200 shadow-lg font-sans',
              title: 'text-sm font-medium text-ink-900',
              description: 'text-[13px] text-ink-500',
            },
          }}
        />
      </body>
    </html>
  );
}
