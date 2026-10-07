'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, Merge, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { MemberSummary, MergeResult, Paginated } from '@arc/types';
import { Avatar, Button, cn, Dialog, DialogContent, Input } from '@arc/ui';
import { useApi, useApiMutation } from '@/lib/use-api';

function Person({ m }: { m: MemberSummary }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={m.fullName} size="sm" round />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink-900">{m.fullName}</p>
        <p className="truncate text-xs text-ink-500">
          {m.email}
          {m.collegeEmail && m.collegeEmail !== m.email && ` · ${m.collegeEmail}`}
          {m.externalId && <span className="ml-2 font-mono text-ink-400">{m.externalId}</span>}
        </p>
      </div>
    </div>
  );
}

/**
 * Merge one person into another chosen by hand — for duplicates the automatic check can't see
 * (e.g. a typo in the roll number or college email).
 */
export function MergeIntoDialog({
  source,
  onOpenChange,
  orgId,
  onMerged,
}: {
  source: MemberSummary | null;
  onOpenChange: (o: boolean) => void;
  orgId: string;
  onMerged: () => void;
}) {
  const mutate = useApiMutation();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<MemberSummary | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (source) {
      setSearch(source.fullName.split(' ').slice(-1)[0] ?? '');
      setTarget(null);
    }
  }, [source]);
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data } = useApi<Paginated<MemberSummary>>(
    source && q.length >= 2 ? `/members?pageSize=8&search=${encodeURIComponent(q)}` : null,
    { orgId, keepPreviousData: true },
  );
  const options = (data?.data ?? []).filter((m) => m.id !== source?.id && !m.isSelf);

  async function merge() {
    if (!source || !target) return;
    setBusy(true);
    try {
      const r = await mutate<MergeResult>(
        '/members/merge',
        'POST',
        { keepId: target.id, mergeIds: [source.id] },
        orgId,
      );
      toast.success(`${source.fullName} merged into ${target.fullName}`, {
        description: r.moved.attempts
          ? `${r.moved.attempts} exam attempt${r.moved.attempts === 1 ? '' : 's'} moved.`
          : undefined,
      });
      onMerged();
      onOpenChange(false);
    } catch (e) {
      toast.error('Could not merge', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(source)} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        title="Merge into another account"
        icon={<Merge />}
        className="max-w-xl"
        description="For a student who registered twice with a mistake in the roll number or email. This account's exam attempts, lab marks and announcements move to the account you pick, and this login stops working."
      >
        {source && (
          <div className="space-y-3 px-6 pt-4 pb-6">
            <div className="rounded-xl bg-rose-50/70 p-3 ring-1 ring-rose-100">
              <p className="mb-2 text-[11px] font-semibold tracking-wide text-rose-700 uppercase">
                Merge this (it will be closed)
              </p>
              <Person m={source} />
            </div>
            <div className="flex justify-center text-ink-400">
              <ArrowDown className="size-4" />
            </div>
            {target ? (
              <div className="rounded-xl bg-emerald-50/70 p-3 ring-1 ring-emerald-100">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold tracking-wide text-emerald-700 uppercase">
                    Into this (kept)
                  </p>
                  <button
                    className="text-xs font-medium text-brand-600 hover:text-brand-700"
                    onClick={() => setTarget(null)}
                  >
                    Change
                  </button>
                </div>
                <Person m={target} />
              </div>
            ) : (
              <div className="rounded-xl ring-1 ring-ink-200">
                <div className="border-b border-ink-100 p-2">
                  <Input
                    leading={<Search />}
                    autoFocus
                    placeholder="Search the correct account by name, email or roll no."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="max-h-64 divide-y divide-ink-100 overflow-y-auto">
                  {options.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setTarget(m)}
                      className={cn('w-full px-3 py-2.5 text-left transition hover:bg-brand-50/60')}
                    >
                      <Person m={m} />
                    </button>
                  ))}
                  {q.length >= 2 && data && !options.length && (
                    <p className="px-3 py-6 text-center text-sm text-ink-500">No one found.</p>
                  )}
                  {q.length < 2 && (
                    <p className="px-3 py-6 text-center text-sm text-ink-500">
                      Type at least 2 letters.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-3 rounded-b-2xl border-t border-ink-100 bg-ink-50/60 px-6 py-4">
          <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!target} onClick={() => void merge()}>
            <Merge /> Merge
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
