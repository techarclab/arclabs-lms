'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { ExamDetail, ExamSummary, Paginated } from '@arc/types';
import { Button, cn, Dialog, DialogContent, Select } from '@arc/ui';
import { useApi, useApiMutation } from '@/lib/use-api';

/**
 * Gives another exam (e.g. the next round) to a chosen list of students — usually the ones who
 * passed this exam.
 */
export function NextRoundDialog({
  open,
  onOpenChange,
  orgId,
  fromExamId,
  userIds,
  label,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orgId: string;
  fromExamId: string;
  userIds: string[];
  /** e.g. "who scored 70% or more" */
  label: string;
}) {
  const mutate = useApiMutation();
  const { data } = useApi<Paginated<ExamSummary>>(open ? '/exams?pageSize=100' : null, { orgId });
  const exams = (data?.data ?? []).filter((e) => e.id !== fromExamId && e.state !== 'ENDED');
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState<'only' | 'add'>('only');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; title: string; count: number } | null>(null);

  useEffect(() => {
    if (open) {
      setDone(null);
      setMode('only');
    }
  }, [open]);
  useEffect(() => {
    if (!target && exams.length) setTarget(exams[0]!.id);
  }, [exams, target]);

  async function apply() {
    if (!target) return;
    setBusy(true);
    try {
      let ids = userIds;
      let departmentIds: string[] = [];
      if (mode === 'add') {
        const cur = await mutate<ExamDetail>(`/exams/${target}`, 'GET', undefined, orgId);
        ids = [...new Set([...cur.audience.users.map((u) => u.id), ...userIds])];
        departmentIds = cur.audience.departments.map((d) => d.id);
      }
      const saved = await mutate<ExamDetail>(
        `/exams/${target}/audience`,
        'PUT',
        { assignToAll: false, departmentIds, userIds: ids },
        orgId,
      );
      setDone({ id: saved.id, title: saved.title, count: saved.assignedCount });
      toast.success(`${saved.title} now has ${saved.assignedCount} candidates`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        title="Give the next round to these students"
        icon={<Send />}
        description={`${userIds.length} student${userIds.length === 1 ? '' : 's'} ${label}.`}
      >
        {done ? (
          <div className="space-y-4 px-6 pt-2 pb-6">
            <p className="text-sm text-ink-700">
              <b>{done.title}</b> is now assigned to <b>{done.count}</b> candidate
              {done.count === 1 ? '' : 's'}. Check its questions and window, then publish it — only
              these students will see it.
            </p>
            <Button asChild className="w-full">
              <Link href={`/exams/${done.id}`}>
                Open {done.title} <ArrowRight />
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 px-6 pt-2">
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-ink-800">Exam</span>
                {data && !exams.length ? (
                  <span className="block rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                    Create the next-round exam first (Exams → New exam), then come back here.
                  </span>
                ) : (
                  <Select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    aria-label="Exam to give"
                  >
                    {exams.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title} ({e.state.toLowerCase()})
                      </option>
                    ))}
                  </Select>
                )}
              </label>
              <div className="space-y-2 text-sm">
                {(
                  [
                    [
                      'only',
                      'Only these students',
                      'Replaces the exam’s current audience. Everyone else will not see it.',
                    ],
                    [
                      'add',
                      'Add them to the current audience',
                      'Keeps the students and departments already chosen for that exam.',
                    ],
                  ] as const
                ).map(([v, t, d]) => (
                  <label
                    key={v}
                    className={cn(
                      'flex cursor-pointer gap-3 rounded-xl border px-3.5 py-3 transition',
                      mode === v ? 'border-brand-500 bg-brand-50/50' : 'border-ink-200',
                    )}
                  >
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === v}
                      onChange={() => setMode(v)}
                      className="mt-0.5 accent-brand-600"
                    />
                    <span>
                      <b className="font-medium text-ink-900">{t}</b>
                      <span className="block text-[13px] text-ink-500">{d}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3 rounded-b-2xl border-t border-ink-100 bg-ink-50/60 px-6 py-4">
              <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                loading={busy}
                disabled={!target || !userIds.length}
                onClick={() => void apply()}
              >
                <Send /> Give to {userIds.length} student{userIds.length === 1 ? '' : 's'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
