import type { ApiErrorBody } from '@arc/types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001/api/v1';

/** Fired when a faculty access-code session is no longer valid (expired, code changed). */
export const ACCESS_EXPIRED_EVENT = 'arc:access-expired';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody | undefined,
  ) {
    super(friendlyMessage(status, body));
  }
}

/** "Request validation failed" alone doesn't help: name the first field that is wrong. */
function friendlyMessage(status: number, body: ApiErrorBody | undefined) {
  const msg = body?.error.message ?? `Request failed (${status})`;
  const details = body?.error.details;
  if (body?.error.code !== 'VALIDATION_FAILED' || !Array.isArray(details) || !details.length)
    return msg;
  const d = details[0] as { path?: string; message?: string };
  const parts = String(d.path ?? '').split('.');
  const rowOf = (key: string) => {
    const i = parts.indexOf(key);
    return i >= 0 && /^\d+$/.test(parts[i + 1] ?? '') ? Number(parts[i + 1]) + 1 : 0;
  };
  const where = rowOf('rubric')
    ? `Marking scheme row ${rowOf('rubric')}`
    : rowOf('testCases')
      ? `Test case ${rowOf('testCases')}`
      : '';
  return [where, d.message].filter(Boolean).join(': ') || msg;
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
  if (!res.ok) {
    const err = new ApiError(res.status, data as ApiErrorBody | undefined);
    if (
      res.status === 401 &&
      opts.token?.startsWith('acc_') &&
      typeof window !== 'undefined' &&
      path !== '/access/me'
    )
      window.dispatchEvent(new Event(ACCESS_EXPIRED_EVENT));
    throw err;
  }
  return data as T;
}

/** Downloads an authenticated file (e.g. CSV export). */
export async function downloadFile(
  path: string,
  opts: { token?: string; orgId?: string; fallbackName: string },
) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.orgId ? { 'X-Org-Id': opts.orgId } : {}),
    },
  });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => undefined));
  const name =
    /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ??
    opts.fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
