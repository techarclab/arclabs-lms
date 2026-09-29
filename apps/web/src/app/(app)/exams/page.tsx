'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  Clock,
  FileQuestion,
  Plus,
  Search,
  Timer,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ExamDetail, ExamState, ExamSummary, Paginated } from '@arc/types';
import {
  Button,
  Card,
  cn,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  Progress,
  Skeleton,
} from '@arc/ui';
import { hasPermission, type OrgRole } from '@arc/types';
import { ExamStateBadge } from '@/components/exams/badges';
import { useOrg } from '@/components/providers/OrgProvider';
import { OrgRequired } from '@/components/shell/OrgRequired';
import { PageHeader } from '@/components/shell/PageHeader';
import { formatDateTime, timeUntil } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/use-api';

const TABS: { value: ExamState | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'LIVE', label: 'Live' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'ENDED', label: 'Ended' },
];

export default function ExamsPage() {
  return (
    <OrgRequired
      title="Exams"
      description="Create, schedule and monitor exams."
      permission="exam.results.view"
    >
      {(org) => <ExamList orgId={org.id} />}
    </OrgRequired>
  );
}

function ExamList({ orgId }: { orgId: string }) {
  const router = useRouter();
  const { current, isSuperAdmin } = useOrg();
  // Read-only viewers (e.g. college coordinators) only see results.
  const viewOnly =
    !isSuperAdmin && !hasPermission((current?.roles ?? []) as OrgRole[], 'quiz.author');
  const [tab, setTab] = useState<ExamState | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQ(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo(() => {
    const sp = new URLSearchParams({ pageSize: '50' });
    if (tab !== 'ALL') sp.set('state', tab);
    if (q) sp.set('search', q);
    return `/exams?${sp}`;
  }, [tab, q]);
  const { data, isLoading } = useApi<Paginated<ExamSummary>>(query, {
    orgId,
    keepPreviousData: true,
    refreshInterval: 30_000,
  });

  return (
    <>
      <PageHeader
        title="Exams"
        description={
          viewOnly
            ? 'Results and analytics for your organization’s exams.'
            : 'Schedule strict, auto-graded exams and see results the moment students submit.'
        }
        actions={
          !viewOnly && (
            <>
              <Button variant="secondary" asChild>
                <Link href="/questions">
                  <FileQuestion /> Question bank
                </Link>
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus /> New exam
              </Button>
            </>
          )
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex rounded-lg bg-ink-100/80 p-0.5">
          {TABS.filter((t) => !viewOnly || t.value !== 'DRAFT').map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-[13px] font-medium transition',
                tab === t.value
                  ? 'bg-white text-ink-900 shadow-xs'
                  : 'text-ink-500 hover:text-ink-800',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="sm:ml-auto sm:w-72">
          <Input
            leading={<Search />}
            placeholder="Search exams"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      {isLoading && !data && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      )}

      {data && data.data.length === 0 && (
        <Card>
          <EmptyState
            icon={<ClipboardList />}
            title={q || tab !== 'ALL' ? 'No exams here' : 'No exams yet'}
            description={
              viewOnly
                ? 'Exams scheduled for your organization will appear here.'
                : 'Create an exam, add questions from the bank, choose who takes it and publish.'
            }
            action={
              !viewOnly && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus /> New exam
                </Button>
              )
            }
          />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {data?.data
          .filter((e) => !viewOnly || e.state !== 'DRAFT')
          .map((e) => {
            const progress = e.assignedCount
              ? Math.round((e.submittedCount / e.assignedCount) * 100)
              : 0;
            return (
              <Link
                key={e.id}
                href={viewOnly ? `/exams/${e.id}/results` : `/exams/${e.id}`}
                className="group"
              >
                <Card
                  className={cn(
                    'h-full p-5 transition group-hover:border-ink-300 group-hover:shadow-md group-hover:shadow-ink-900/[0.04]',
                    e.state === 'LIVE' && 'border-rose-200 ring-1 ring-rose-100',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-2 flex items-center gap-2">
                        <ExamStateBadge state={e.state} />
                        {e.state === 'LIVE' && e.endsAt && (
                          <span className="text-xs text-ink-500">
                            closes in {timeUntil(e.endsAt)}
                          </span>
                        )}
                        {e.state === 'SCHEDULED' && e.startsAt && (
                          <span className="text-xs text-ink-500">
                            opens in {timeUntil(e.startsAt)}
                          </span>
                        )}
                      </div>
                      <h3 className="truncate text-[16px] font-semibold text-ink-900 group-hover:text-brand-700">
                        {e.title}
                      </h3>
                    </div>
                    {e.state !== 'DRAFT' && (
                      <span className="flex items-center gap-1 rounded-lg bg-ink-50 px-2 py-1 text-xs font-medium text-ink-600">
                        <BarChart3 className="size-3.5" /> Results
                      </span>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
                    <span className="flex items-center gap-1.5 text-ink-600">
                      <FileQuestion className="size-4 text-ink-400" /> {e.questionCount} Qs ·{' '}
                      {e.totalMarks} marks
                    </span>
                    <span className="flex items-center gap-1.5 text-ink-600">
                      <Timer className="size-4 text-ink-400" /> {e.durationMinutes ?? '—'} min
                    </span>
                    <span className="flex items-center gap-1.5 text-ink-600">
                      <Users className="size-4 text-ink-400" /> {e.assignedCount} assigned
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-500">
                    <CalendarClock className="size-4 text-ink-400" />
                    {e.startsAt
                      ? `${formatDateTime(e.startsAt)} → ${formatDateTime(e.endsAt)}`
                      : 'Not scheduled yet'}
                  </div>
                  {e.state !== 'DRAFT' && (
                    <div className="mt-4 border-t border-ink-100 pt-4">
                      <div className="mb-1.5 flex justify-between text-xs">
                        <span className="text-ink-500">
                          <b className="font-semibold text-ink-900">{e.submittedCount}</b> of{' '}
                          {e.assignedCount} submitted
                          {e.inProgressCount > 0 && (
                            <span className="ml-1.5 text-rose-600">
                              · {e.inProgressCount} writing now
                            </span>
                          )}
                        </span>
                        {e.avgPct !== null && (
                          <span className="text-ink-500">
                            avg <b className="font-semibold text-ink-900">{e.avgPct}%</b>
                          </span>
                        )}
                      </div>
                      <Progress value={progress} tone={e.state === 'ENDED' ? 'emerald' : 'brand'} />
                    </div>
                  )}
                  {e.state === 'DRAFT' && (
                    <p className="mt-4 flex items-center gap-1.5 border-t border-ink-100 pt-4 text-xs text-ink-400">
                      <Clock className="size-3.5" />{' '}
                      {viewOnly ? 'Being prepared' : 'Draft — finish setup and publish'}
                    </p>
                  )}
                </Card>
              </Link>
            );
          })}
      </div>

      <CreateExamDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
        onCreated={(id) => router.push(`/exams/${id}`)}
      />
    </>
  );
}

function CreateExamDialog({
  open,
  onOpenChange,
  orgId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orgId: string;
  onCreated: (id: string) => void;
}) {
  const mutate = useApiMutation();
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('60');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) {
      setTitle('');
      setDuration('60');
    }
  }, [open]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3) {
      toast.error('Give the exam a title');
      return;
    }
    setBusy(true);
    try {
      const exam = await mutate<ExamDetail>(
        '/exams',
        'POST',
        { title, durationMinutes: Number(duration) || 60 },
        orgId,
      );
      onCreated(exam.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New exam"
        description="You’ll add questions, schedule and audience next."
        icon={<ClipboardList />}
      >
        <form onSubmit={create}>
          <div className="grid gap-4 px-6 pt-4 pb-6 sm:grid-cols-[1fr_140px]">
            <Field label="Title" htmlFor="ex-title">
              <Input
                id="ex-title"
                autoFocus
                placeholder="e.g. Embedded Systems — Mid-term"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="Duration (min)" htmlFor="ex-dur">
              <Input
                id="ex-dur"
                inputMode="numeric"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-3 rounded-b-2xl border-t border-ink-100 bg-ink-50/60 px-6 py-4">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Create & continue
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
