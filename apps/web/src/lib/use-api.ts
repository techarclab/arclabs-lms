'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import { useAuth } from '@/components/providers/AuthProvider';
import { api } from './api';

/** Authenticated GET with caching/revalidation. Pass null to skip. */
export function useApi<T>(path: string | null, opts: { orgId?: string } & SWRConfiguration = {}) {
  const { firebaseUser, getToken } = useAuth();
  const { orgId, ...swr } = opts;
  return useSWR<T>(
    firebaseUser && path ? [path, orgId ?? null] : null,
    async ([p, o]: [string, string | null]) =>
      api<T>(p, { token: await getToken(), orgId: o ?? undefined }),
    { revalidateOnFocus: false, ...swr },
  );
}

/** Authenticated mutation helper. */
export function useApiMutation() {
  const { getToken } = useAuth();
  return async <T>(
    path: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body?: unknown,
    orgId?: string,
  ) => api<T>(path, { method, body, token: await getToken(), orgId });
}
