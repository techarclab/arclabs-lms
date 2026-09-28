'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@arc/ui';
import { useAuth } from '@/components/AuthProvider';

export default function DashboardPage() {
  const router = useRouter();
  const { loading, firebaseUser, me, error, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !firebaseUser) router.replace('/login');
  }, [loading, firebaseUser, router]);

  if (loading || !firebaseUser) return <p className="p-8 text-slate-500">Loading…</p>;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Button variant="secondary" onClick={() => signOut()}>
          Sign out
        </Button>
      </header>

      {error && <Card className="border-red-200 text-red-700">{error}</Card>}

      {me && (
        <Card className="space-y-2">
          <p className="text-lg font-medium">Welcome, {me.fullName}</p>
          <p className="text-sm text-slate-600">{me.email}</p>
          {me.isSuperAdmin && (
            <span className="inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700">
              Super Admin
            </span>
          )}
          <div className="pt-2 text-sm">
            <p className="font-medium">Organizations</p>
            {me.memberships.length === 0 ? (
              <p className="text-slate-500">No organization yet — an admin will add you.</p>
            ) : (
              <ul className="list-disc pl-5">
                {me.memberships.map((m) => (
                  <li key={m.organizationId}>
                    {m.organizationName} — {m.roles.join(', ')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}
    </main>
  );
}
