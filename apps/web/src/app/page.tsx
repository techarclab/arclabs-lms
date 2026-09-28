import Link from 'next/link';
import { Card } from '@arc/ui';
import { ApiStatus } from '@/components/ApiStatus';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-10 px-6 py-16">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold text-brand-900">ARC LABS</span>
        <Link
          href="/login"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Sign in
        </Link>
      </header>

      <section className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          Learn → Build → Connect hardware → Get certified
        </h1>
        <p className="max-w-2xl text-lg text-slate-600">
          The ARC LABS learning platform for IoT, embedded systems and AI training programs.
        </p>
      </section>

      <Card>
        <h2 className="mb-3 font-semibold">Developer status</h2>
        <ApiStatus />
      </Card>
    </main>
  );
}
