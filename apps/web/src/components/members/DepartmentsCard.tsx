'use client';

import { useState } from 'react';
import { Building, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DepartmentSummary } from '@arc/types';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '@arc/ui';
import { ApiError } from '@/lib/api';
import { useApi, useApiMutation } from '@/lib/use-api';

export function DepartmentsCard({ orgId, canManage }: { orgId: string; canManage: boolean }) {
  const mutate = useApiMutation();
  const { data = [], mutate: reload } = useApi<DepartmentSummary[]>('/departments', { orgId });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setBusy(true);
    try {
      await mutate('/departments', 'POST', { name: name.trim() }, orgId);
      setName('');
      await reload();
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 409
          ? 'That department already exists'
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: DepartmentSummary) {
    try {
      await mutate(`/departments/${d.id}`, 'DELETE', undefined, orgId);
      toast.success(`${d.name} removed`, {
        description: d.memberCount
          ? `${d.memberCount} members kept, now without a department.`
          : undefined,
      });
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const max = Math.max(1, ...data.map((d) => d.memberCount));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Departments</CardTitle>
          <CardDescription>Branches, classes or teams</CardDescription>
        </div>
        <span className="flex size-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
          <Building className="size-[18px]" />
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <form onSubmit={add} className="flex gap-2">
            <Input
              placeholder="e.g. ECE, 3rd year, Batch A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9"
            />
            <Button
              type="submit"
              size="icon"
              variant="secondary"
              loading={busy}
              aria-label="Add department"
            >
              {!busy && <Plus />}
            </Button>
          </form>
        )}
        {data.length === 0 ? (
          <p className="py-2 text-sm text-ink-400">No departments yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.map((d) => (
              <li key={d.id} className="group">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="truncate text-ink-700">{d.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular text-ink-500">{d.memberCount}</span>
                    {canManage && (
                      <button
                        onClick={() => remove(d)}
                        className="rounded p-0.5 text-ink-300 opacity-0 transition group-hover:opacity-100 hover:text-rose-600"
                        aria-label={`Delete ${d.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-sky-500"
                    style={{ width: `${(d.memberCount / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
