import type { ApiErrorBody } from '@arc/types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody | undefined,
  ) {
    super(body?.error.message ?? `Request failed (${status})`);
  }
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string; orgId?: string } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.orgId ? { 'X-Org-Id': opts.orgId } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  const data = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, data as ApiErrorBody | undefined);
  return data as T;
}
