'use client';

import { useEffect, useState } from 'react';
import { Merge } from 'lucide-react';
import { toast } from 'sonner';
import type { DuplicateGroup, MergeResult } from '@arc/types';
import { Avatar, Button, cn, Dialog, DialogContent } from '@arc/ui';
import { timeAgo } from '@/lib/format';
import { useApiMutation } from '@/lib/use-api';

/** Lists students registered more than once and merges each group into one account. */
export function DuplicatesDialog({
  open,
  onOpenChange,
  orgId,
  groups,
  onMerged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orgId: string;
  groups: DuplicateGroup[];
  onMerged: () => void;
}) {
  const mutate = useApiMutation();
  const [keep, setKeep] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | 'all' | null>(null);
  /** Rows unticked: not the same student, leave them alone. */
  const [skip, setSkip] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setKeep(Object.fromEntries(groups.map((g, i) => [i, g.keepId])));
      setSkip(new Set());
    }
  }, [open, groups]);

  const toMerge = (i: number) => {
    const g = groups[i]!;
    const keepId = keep[i] ?? g.keepId;
    return g.members.filter((m) => m.id !== keepId && !skip.has(m.id)).map((m) => m.id);
  };

  async function mergeOne(i: number) {
    const g = groups[i]!;
    const keepId = keep[i] ?? g.keepId;
    return mutate<MergeResult>('/members/merge', 'POST', { keepId, mergeIds: toMerge(i) }, orgId);
  }

  async function run(which: number | 'all') {
    setBusy(which);
    let done = 0;
    let attempts = 0;
    try {
      for (const i of which === 'all' ? groups.map((_, k) => k) : [which]) {
        if (!toMerge(i).length) continue;
        const r = await mergeOne(i);
        done += r.merged;
        attempts += r.moved.attempts;
      }
      toast.success(`${done} duplicate account${done === 1 ? '' : 's'} merged`, {
        description: attempts
          ? `${attempts} exam attempt${attempts === 1 ? '' : 's'} moved to the kept accounts.`
          : undefined,
      });
    } catch (e) {
      toast.error('Could not merge', { description: (e as Error).message });
    } finally {
      setBusy(null);
      onMerged();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => busy === null && onOpenChange(o)}>
      <DialogContent
        title={`${groups.length} student${groups.length === 1 ? '' : 's'} registered more than once`}
        icon={<Merge />}
        className="max-w-3xl"
        description="Same roll number or college email. Pick the account to keep — the ticked registrations are merged into it: their exam attempts, lab marks and announcements move over, and their extra logins stop working. Untick anyone who is a different student. The student signs in with the kept account's email (Forgot password works if needed)."
      >
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 pt-4 pb-6">
          {groups.map((g, i) => (
            <div key={g.members.map((m) => m.id).join()} className="rounded-xl ring-1 ring-ink-200">
              <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/70 px-4 py-2.5">
                {g.reasons.map((r) => (
                  <span
                    key={r}
                    className="rounded-md bg-amber-100 px-2 py-0.5 text-[12px] font-medium text-amber-900"
                  >
                    {r}
                  </span>
                ))}
                <span className="flex-1" />
                <Button
                  size="sm"
                  loading={busy === i}
                  disabled={busy !== null || !toMerge(i).length}
                  onClick={() => void run(i)}
                >
                  <Merge /> Merge
                </Button>
              </div>
              <div className="divide-y divide-ink-100">
                {g.members.map((m) => {
                  const on = (keep[i] ?? g.keepId) === m.id;
                  return (
                    <label
                      key={m.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 px-4 py-3 transition',
                        on ? 'bg-brand-50/60' : 'hover:bg-ink-50',
                      )}
                    >
                      <input
                        type="radio"
                        name={`keep-${i}`}
                        checked={on}
                        onChange={() => setKeep((k) => ({ ...k, [i]: m.id }))}
                        className="size-4 accent-brand-600"
                      />
                      <Avatar name={m.fullName} size="sm" round />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-900">
                          {m.fullName}
                          {on && (
                            <span className="ml-2 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white uppercase">
                              Keep
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-ink-500">
                          {m.email}
                          {m.collegeEmail && m.collegeEmail !== m.email && ` · ${m.collegeEmail}`}
                          {m.externalId && (
                            <span className="ml-2 font-mono text-ink-400">{m.externalId}</span>
                          )}
                        </p>
                      </div>
                      {!on && (
                        <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-600">
                          <input
                            type="checkbox"
                            aria-label={`Merge ${m.fullName}`}
                            checked={!skip.has(m.id)}
                            onChange={() =>
                              setSkip((s) => {
                                const n = new Set(s);
                                if (n.has(m.id)) n.delete(m.id);
                                else n.add(m.id);
                                return n;
                              })
                            }
                            className="size-4 accent-brand-600"
                          />
                          Merge
                        </span>
                      )}
                      <div className="shrink-0 text-right text-xs text-ink-500">
                        <p>
                          <b className="text-ink-800">{m.attempts}</b> exam attempt
                          {m.attempts === 1 ? '' : 's'} ·{' '}
                          <b className="text-ink-800">{m.labMarks}</b> lab mark
                          {m.labMarks === 1 ? '' : 's'}
                        </p>
                        <p>
                          {m.department?.name ?? 'No department'} ·{' '}
                          {m.lastLoginAt ? `active ${timeAgo(m.lastLoginAt)}` : 'never signed in'}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          {!groups.length && (
            <p className="py-8 text-center text-sm text-ink-500">No duplicates left.</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-ink-100 bg-ink-50/60 px-6 py-4">
          <Button variant="secondary" disabled={busy !== null} onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {groups.length > 1 && (
            <Button
              loading={busy === 'all'}
              disabled={busy !== null}
              onClick={() => void run('all')}
            >
              <Merge /> Merge all {groups.length}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
