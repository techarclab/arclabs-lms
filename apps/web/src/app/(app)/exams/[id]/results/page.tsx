'use client';

import { Fragment, use, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronDown,
  Download,
  Gauge,
  Search,
  ShieldAlert,
  Target,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AttemptDetail, CandidateRow, ExamAnalytics } from '@arc/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Dialog,
  DialogContent,
  Input,
  Skeleton,
} from '@arc/ui';
import { StatCard } from '@/components/dashboard/StatCard';
import { PromptText, ReviewCard } from '@/components/exams/AnswerView';
import { DifficultyBadge, ExamStateBadge } from '@/components/exams/badges';
import { useAuth } from '@/components/providers/AuthProvider';
import { OrgRequired } from '@/components/shell/OrgRequired';
import { downloadFile } from '@/lib/api';
import {
  formatDateTime,
  formatDuration,
  SUBMIT_REASON_LABEL,
  timeUntil,
  plainPrompt,
} from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/use-api';

export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <OrgRequired title="Exam results" description="" permission="quiz.author">
      {(org) => <Results id={id} orgId={org.id} />}
    </OrgRequired>
  );
}

const EVENT_LABEL: Record<string, string> = {
  FULLSCREEN_EXIT: 'Left full screen',
  TAB_HIDDEN: 'Switched tab / minimised',
  WINDOW_BLUR: 'Switched window',
  COPY: 'Tried to copy',
  PASTE: 'Tried to paste',
  CONTEXT_MENU: 'Right-clicked',
  DEVTOOLS: 'Opened developer tools',
  SESSION_TAKEOVER: 'Opened on another device',
  RESUMED: 'Resumed',
};

function Results({ id, orgId }: { id: string; orgId: string }) {
  const { getToken } = useAuth();
  const { data, isLoading } = useApi<ExamAnalytics>(`/exams/${id}/analytics`, {
    orgId,
    refreshInterval: (d) => (d?.exam.state === 'LIVE' ? 10_000 : 0),
  });
  const [filter, setFilter] = useState<
    'ALL' | 'SUBMITTED' | 'IN_PROGRESS' | 'NOT_STARTED' | 'FLAGGED'
  >('ALL');
  const [search, setSearch] = useState('');
  const [openQ, setOpenQ] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const candidates = useMemo(() => {
    let c = data?.candidates ?? [];
    if (filter === 'FLAGGED') c = c.filter((x) => x.violationCount > 0);
    else if (filter !== 'ALL') c = c.filter((x) => x.status === filter);
    if (search) {
      const s = search.toLowerCase();
      c = c.filter(
        (x) =>
          x.fullName.toLowerCase().includes(s) ||
          x.email.toLowerCase().includes(s) ||
          (x.externalId ?? '').toLowerCase().includes(s),
      );
    }
    return c;
  }, [data, filter, search]);

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  const { exam, stats } = data;
  const maxBucket = Math.max(1, ...data.distribution.map((b) => b.count));

  return (
    <>
      <nav className="mb-4 flex items-center gap-1.5 text-[13px] text-ink-500">
        <Link href="/exams" className="hover:text-ink-900">
          Exams
        </Link>
        <span className="text-ink-300">/</span>
        <Link href={`/exams/${id}`} className="truncate hover:text-ink-900">
          {exam.title}
        </Link>
        <span className="text-ink-300">/</span>
        <span className="text-ink-700">Results</span>
      </nav>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2.5">
            <ExamStateBadge state={exam.state} />
            {exam.state === 'LIVE' && exam.endsAt && (
              <span className="text-sm text-ink-500">
                closes in {timeUntil(exam.endsAt)} · updating live
              </span>
            )}
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight">{exam.title}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {exam.questionCount} questions · {exam.totalMarks} marks · pass at {exam.passPct}% ·{' '}
            {formatDateTime(exam.startsAt)} → {formatDateTime(exam.endsAt)}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await downloadFile(`/exams/${id}/results.csv`, {
                token: await getToken(),
                orgId,
                fallbackName: 'results.csv',
              });
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          <Download /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Submitted"
          value={`${stats.submitted}/${stats.assigned}`}
          icon={Users}
          footer={
            <span>
              {stats.inProgress > 0 && (
                <b className="font-medium text-rose-600">{stats.inProgress} writing · </b>
              )}
              {stats.notStarted} not started
            </span>
          }
        />
        <StatCard
          label="Average score"
          value={stats.avgPct !== null ? `${stats.avgPct}%` : '—'}
          icon={Gauge}
          tone="violet"
          footer={<span>Median {stats.medianPct ?? '—'}%</span>}
        />
        <StatCard
          label="Pass rate"
          value={stats.passRate !== null ? `${stats.passRate}%` : '—'}
          icon={CheckCircle2}
          tone="emerald"
          footer={<span>{stats.passed} passed</span>}
        />
        <StatCard
          label="Integrity flags"
          value={stats.withViolations}
          icon={ShieldAlert}
          tone="rose"
          footer={<span>{stats.autoSubmitted} auto-submitted</span>}
        />
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Score distribution</CardTitle>
              <CardDescription>
                Highest {stats.highestPct ?? '—'}% · lowest {stats.lowestPct ?? '—'}% · avg time{' '}
                {formatDuration(stats.avgTimeSec)}
              </CardDescription>
            </div>
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
              <TrendingUp className="size-[18px]" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="relative flex h-48 items-end gap-2 border-b border-ink-200 pb-0">
              <div
                className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-amber-400"
                style={{ left: `${exam.passPct}%` }}
              >
                <span className="absolute -top-1 left-1.5 text-[11px] font-medium whitespace-nowrap text-amber-700">
                  Pass {exam.passPct}%
                </span>
              </div>
              {data.distribution.map((b) => (
                <div
                  key={b.from}
                  className="group relative flex h-full flex-1 flex-col justify-end"
                >
                  {b.count > 0 && (
                    <span className="tabular mb-1 text-center text-xs font-medium text-ink-700">
                      {b.count}
                    </span>
                  )}
                  <div
                    className={cn(
                      'w-full rounded-t-md transition',
                      b.to <= exam.passPct
                        ? 'bg-rose-300 group-hover:bg-rose-400'
                        : 'bg-brand-500 group-hover:bg-brand-600',
                    )}
                    style={{ height: `${(b.count / maxBucket) * 85}%`, minHeight: b.count ? 4 : 0 }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              {data.distribution.map((b) => (
                <span key={b.from} className="tabular flex-1 text-center text-[11px] text-ink-400">
                  {b.from}–{b.to}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Topic performance</CardTitle>
              <CardDescription>Weakest first — plan revision here</CardDescription>
            </div>
            <span className="flex size-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
              <Target className="size-[18px]" />
            </span>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3.5">
              {data.topics.map((t) => (
                <li key={t.topic}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="truncate text-ink-700">{t.topic}</span>
                    <span className="tabular font-medium">{t.avgPct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        t.avgPct < 40
                          ? 'bg-rose-500'
                          : t.avgPct < 70
                            ? 'bg-amber-500'
                            : 'bg-emerald-500',
                      )}
                      style={{ width: `${t.avgPct}%` }}
                    />
                  </div>
                </li>
              ))}
              {!data.topics.length && <li className="text-sm text-ink-400">No data yet</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Question analysis</CardTitle>
            <CardDescription>
              Correct rate and discrimination (how well each question separates strong and weak
              candidates). Click a row to see answer choices.
            </CardDescription>
          </div>
        </CardHeader>
        <div className="overflow-x-auto border-t border-ink-100">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-ink-50/60 text-left text-xs text-ink-500">
                <th className="py-2.5 pr-3 pl-6 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Question</th>
                <th className="px-3 py-2.5 font-medium">Difficulty</th>
                <th className="w-56 px-3 py-2.5 font-medium">Correct</th>
                <th className="px-3 py-2.5 font-medium">Quality</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {data.questions.map((q) => {
                const d = q.discrimination;
                const quality =
                  d === null
                    ? { tone: 'neutral', label: 'Too few' }
                    : d < 0
                      ? { tone: 'danger', label: 'Check key' }
                      : d < 0.2
                        ? { tone: 'warning', label: 'Weak' }
                        : d < 0.4
                          ? { tone: 'info', label: 'Good' }
                          : { tone: 'success', label: 'Excellent' };
                const open = openQ === q.questionId;
                return (
                  <Fragment key={q.questionId}>
                    <tr
                      className="cursor-pointer hover:bg-ink-50/70"
                      onClick={() => setOpenQ(open ? null : q.questionId)}
                    >
                      <td className="py-3 pr-3 pl-6 text-ink-400">{q.position}</td>
                      <td className="max-w-md px-3 py-3">
                        <p className="line-clamp-1 text-ink-900">{plainPrompt(q.prompt)}</p>
                        <p className="text-xs text-ink-500">
                          {q.topic ?? 'General'} · {q.points} mark{q.points > 1 ? 's' : ''}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <DifficultyBadge difficulty={q.difficulty} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                q.correctPct < 40
                                  ? 'bg-rose-500'
                                  : q.correctPct < 70
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500',
                              )}
                              style={{ width: `${q.correctPct}%` }}
                            />
                          </div>
                          <span className="tabular w-12 text-right font-medium">
                            {q.correctPct}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={quality.tone as 'neutral'}>{quality.label}</Badge>
                      </td>
                      <td className="pr-4">
                        <ChevronDown
                          className={cn('size-4 text-ink-400 transition', open && 'rotate-180')}
                        />
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-ink-50/50">
                        <td />
                        <td colSpan={5} className="px-3 pt-1 pb-4">
                          <PromptText text={q.prompt} className="mb-3 text-sm text-ink-700" />
                          {q.options.length ? (
                            <ul className="space-y-1.5">
                              {q.options.map((o) => {
                                const pct = stats.submitted
                                  ? Math.round((o.count / stats.submitted) * 100)
                                  : 0;
                                return (
                                  <li key={o.id} className="flex items-center gap-3 text-sm">
                                    <span
                                      className={cn(
                                        'w-64 truncate',
                                        o.isCorrect
                                          ? 'font-medium text-emerald-700'
                                          : 'text-ink-600',
                                      )}
                                    >
                                      {o.isCorrect && '✓ '}
                                      {o.text}
                                    </span>
                                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-200/70">
                                      <div
                                        className={cn(
                                          'h-full rounded-full',
                                          o.isCorrect ? 'bg-emerald-500' : 'bg-ink-400',
                                        )}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="tabular w-20 text-right text-xs text-ink-500">
                                      {o.count} · {pct}%
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="text-sm text-ink-500">
                              {q.attempted} answered · {q.correct} correct
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {data.departments.length > 1 && (
        <Card className="mt-6">
          <CardHeader>
            <div>
              <CardTitle>By department</CardTitle>
              <CardDescription>Average score and pass rate of submitted candidates</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.departments.map((d) => (
              <div key={d.department} className="rounded-xl border border-ink-200 p-4">
                <p className="text-sm font-medium text-ink-900">{d.department}</p>
                <p className="tabular mt-2 text-2xl font-semibold">{d.avgPct}%</p>
                <p className="text-xs text-ink-500">
                  {d.submitted} submitted · {d.passRate}% passed
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-ink-100 px-4 py-3.5 lg:flex-row lg:items-center">
          <div className="flex flex-wrap rounded-lg bg-ink-100/80 p-0.5">
            {(
              [
                ['ALL', `All ${data.candidates.length}`],
                ['SUBMITTED', `Submitted ${stats.submitted}`],
                ['IN_PROGRESS', `Writing ${stats.inProgress}`],
                ['NOT_STARTED', `Absent ${stats.notStarted}`],
                ['FLAGGED', `Flagged ${stats.withViolations}`],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[13px] font-medium transition',
                  filter === v
                    ? 'bg-white text-ink-900 shadow-xs'
                    : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="lg:ml-auto lg:w-72">
            <Input
              leading={<Search />}
              placeholder="Search candidates"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs text-ink-500">
                <th className="py-2.5 pr-3 pl-6 font-medium">Rank</th>
                <th className="px-3 py-2.5 font-medium">Candidate</th>
                <th className="px-3 py-2.5 font-medium">Department</th>
                <th className="px-3 py-2.5 text-right font-medium">Score</th>
                <th className="px-3 py-2.5 font-medium">Result</th>
                <th className="px-3 py-2.5 font-medium">Time</th>
                <th className="px-3 py-2.5 font-medium">Integrity</th>
                <th className="py-2.5 pr-6 pl-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {candidates.map((c) => (
                <CandidateTr
                  key={c.userId}
                  c={c}
                  maxViolations={exam.maxViolations}
                  onOpen={() => c.attemptId && setDetailId(c.attemptId)}
                />
              ))}
            </tbody>
          </table>
          {!candidates.length && (
            <p className="px-6 py-10 text-center text-sm text-ink-500">No candidates here.</p>
          )}
        </div>
      </Card>

      <AttemptDialog
        examId={id}
        orgId={orgId}
        attemptId={detailId}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}

function CandidateTr({
  c,
  maxViolations,
  onOpen,
}: {
  c: CandidateRow;
  maxViolations: number;
  onOpen: () => void;
}) {
  return (
    <tr
      className={cn('transition', c.attemptId && 'cursor-pointer hover:bg-ink-50/70')}
      onClick={onOpen}
    >
      <td className="py-3 pr-3 pl-6">
        {c.rank ? (
          <span
            className={cn(
              'tabular inline-flex size-7 items-center justify-center rounded-lg text-xs font-semibold',
              c.rank === 1
                ? 'bg-amber-100 text-amber-800'
                : c.rank <= 3
                  ? 'bg-ink-100 text-ink-700'
                  : 'text-ink-500',
            )}
          >
            {c.rank <= 3 ? <Award className="size-3.5" /> : c.rank}
          </span>
        ) : (
          <span className="text-ink-300">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={c.fullName} size="sm" round />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{c.fullName}</p>
            <p className="truncate text-xs text-ink-500">{c.externalId ?? c.email}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-ink-600">{c.department ?? '—'}</td>
      <td className="tabular px-3 py-3 text-right">
        {c.percentage !== null ? (
          <>
            <b className="font-semibold text-ink-900">{c.percentage}%</b>
            <span className="ml-1.5 text-xs text-ink-400">{c.score}</span>
          </>
        ) : (
          <span className="text-ink-300">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        {c.passed === null ? (
          <span className="text-ink-300">—</span>
        ) : c.passed ? (
          <Badge tone="success">Pass</Badge>
        ) : (
          <Badge tone="danger">Fail</Badge>
        )}
      </td>
      <td className="px-3 py-3 text-ink-600">{formatDuration(c.timeTakenSec)}</td>
      <td className="px-3 py-3">
        {c.violationCount > 0 ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-medium',
              maxViolations && c.violationCount >= maxViolations
                ? 'text-rose-700'
                : 'text-amber-700',
            )}
          >
            <AlertTriangle className="size-3.5" /> {c.violationCount} flag
            {c.violationCount > 1 ? 's' : ''}
          </span>
        ) : c.status !== 'NOT_STARTED' ? (
          <span className="text-xs text-emerald-600">Clean</span>
        ) : (
          <span className="text-ink-300">—</span>
        )}
      </td>
      <td className="py-3 pr-6 pl-3">
        {c.status === 'NOT_STARTED' ? (
          <Badge tone="neutral">Not started</Badge>
        ) : c.status === 'IN_PROGRESS' ? (
          <Badge tone="info" dot>
            Writing
          </Badge>
        ) : c.submitReason && c.submitReason !== 'MANUAL' ? (
          <Badge tone="warning">{SUBMIT_REASON_LABEL[c.submitReason]}</Badge>
        ) : (
          <span className="text-xs text-ink-500">{formatDateTime(c.submittedAt)}</span>
        )}
      </td>
    </tr>
  );
}

function AttemptDialog({
  examId,
  orgId,
  attemptId,
  onClose,
}: {
  examId: string;
  orgId: string;
  attemptId: string | null;
  onClose: () => void;
}) {
  const mutate = useApiMutation();
  const { data, mutate: reload } = useApi<AttemptDetail>(
    attemptId ? `/exams/${examId}/attempts/${attemptId}` : null,
    { orgId },
  );
  return (
    <Dialog open={Boolean(attemptId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={data?.candidate.fullName ?? 'Attempt'}
        description={
          data
            ? `${data.candidate.email}${data.candidate.externalId ? ` · ${data.candidate.externalId}` : ''}`
            : undefined
        }
        className="max-w-3xl"
        icon={<Timer />}
      >
        {!data ? (
          <Skeleton className="m-6 h-64" />
        ) : (
          <div className="max-h-[75vh] space-y-6 overflow-y-auto px-6 pt-3 pb-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                [
                  'Score',
                  data.candidate.percentage !== null ? `${data.candidate.percentage}%` : '—',
                ],
                ['Time', formatDuration(data.candidate.timeTakenSec)],
                ['Violations', data.candidate.violationCount],
                [
                  'Ended by',
                  data.candidate.submitReason
                    ? SUBMIT_REASON_LABEL[data.candidate.submitReason]
                    : 'In progress',
                ],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-xl border border-ink-200 p-3">
                  <p className="text-xs text-ink-500">{k}</p>
                  <p className="tabular mt-1 font-semibold">{v}</p>
                </div>
              ))}
            </div>
            {data.candidate.status === 'IN_PROGRESS' && (
              <Button
                variant="destructive-outline"
                onClick={async () => {
                  await mutate(
                    `/exams/${examId}/attempts/${attemptId}/force-submit`,
                    'POST',
                    undefined,
                    orgId,
                  );
                  toast.success('Attempt submitted');
                  void reload();
                }}
              >
                End this attempt now
              </Button>
            )}
            <div>
              <p className="mb-3 text-sm font-semibold">Integrity log</p>
              {data.events.length ? (
                <ol className="space-y-2">
                  {data.events.map((e, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm">
                      <span
                        className={cn(
                          'size-2 rounded-full',
                          e.counted ? 'bg-rose-500' : 'bg-ink-300',
                        )}
                      />
                      <span className={e.counted ? 'font-medium text-rose-700' : 'text-ink-600'}>
                        {EVENT_LABEL[e.type] ?? e.type}
                      </span>
                      <span className="ml-auto text-xs text-ink-400">
                        {new Date(e.occurredAt).toLocaleTimeString('en-IN')}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-emerald-600">No violations recorded.</p>
              )}
              <p className="mt-3 text-xs text-ink-400">
                Started {formatDateTime(data.startedAt)} · IP {data.ipAddress ?? '—'} ·{' '}
                {data.userAgent?.slice(0, 80)}
              </p>
            </div>
            <div>
              <p className="mb-3 text-sm font-semibold">Answers</p>
              <div className="space-y-3">
                {data.review.map((r, i) => (
                  <ReviewCard key={r.questionId} item={r} index={i} />
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
