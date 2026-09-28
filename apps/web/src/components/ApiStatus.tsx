'use client';

import { useEffect, useState } from 'react';
import type { HealthStatus } from '@arc/types';
import { api } from '@/lib/api';

export function ApiStatus() {
  const [health, setHealth] = useState<HealthStatus | 'down' | null>(null);

  useEffect(() => {
    api<HealthStatus>('/health')
      .then(setHealth)
      .catch(() => setHealth('down'));
  }, []);

  if (health === null) return <p className="text-sm text-slate-500">Checking API…</p>;
  if (health === 'down')
    return (
      <p className="text-sm text-red-600">
        API not reachable — is <code>pnpm dev</code> running?
      </p>
    );
  return (
    <ul className="flex flex-wrap gap-2 text-sm">
      {Object.entries(health.checks).map(([name, state]) => (
        <li
          key={name}
          className={`rounded-full px-3 py-1 ${state === 'up' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}
        >
          {name}: {state}
        </li>
      ))}
    </ul>
  );
}
