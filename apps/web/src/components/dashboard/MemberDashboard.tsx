'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Compass,
  FileQuestion,
  Gauge,
  PlayCircle,
  Radio,
} from 'lucide-react';
import {
  hasPermission,
  type ExamSummary,
  type MyExamItem,
  type OrgRole,
  type Paginated,
} from '@arc/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@arc/ui';
import { ExamStateBadge } from '@/components/exams/badges';
import { PageHeader } from '@/components/shell/PageHeader';
import { useAuth } from '@/components/providers/AuthProvider';
import { useOrg } from '@/components/providers/OrgProvider';
import { formatDateTime, greeting, ROLE_LABEL, timeUntil } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { JoinCodeForm } from '@/components/join/JoinCodeForm';
import { StatCard } from './StatCard';

export function MemberDashboard() {
  const { me } = useAuth();
  const { current, isSuperAdmin } = useOrg();
  // Skip honorifics so "Dr. Suresh Rao" is greeted as Suresh.
  const firstName = me?.accessCode
    ? ''
    : (me?.fullName.split(' ').find((w) => !/^(dr|prof|mr|mrs|ms|sri|smt)\.?$/i.test(w)) ?? '');

  if (!current) {
    return (
      <Card className="mx-auto mt-10 max-w-xl">
        <EmptyState
          icon={<Compass />}
          title="You’re not part of an organization yet"
          description="Have a join code from your college? Enter it below to register. Otherwise ask your institution’s admin to add you."
          action={<JoinCodeForm className="w-full max-w-sm" />}
        />
      </Card>
    );
  }

  const roles = current.roles as OrgRole[];
  const isStaff = isSuperAdmin || hasPermission(roles, 'exam.results.view');
  const viewOnly = !isSuperAdmin && !hasPermission(roles, 'quiz.author');
  const isLearner = roles.includes('LEARNER');

  return (
    <>
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2">
            <Avatar name={current.name} color={current.primaryColor} size="xs" />
            <span className="text-[13px] font-medium text-ink-500">{current.name}</span>
            {current.roles.map((r) => (
              <Badge key={r} tone="brand">
                {ROLE_LABEL[r] ?? r}
              </Badge>
            ))}
          </div>
        }
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        description={
          me?.accessCode
            ? 'Faculty view — exam results and student lists for your college. View only.'
            : isStaff
              ? 'Here’s what’s happening with your exams.'
              : 'Your exams and results in one place.'
        }
        actions={
          isStaff && (
            <Button asChild>
              <Link href="/exams">
                <ClipboardList /> {viewOnly ? 'View exams & results' : 'Manage exams'}
              </Link>
            </Button>
          )
        }
      />
      {isStaff && isLearner && (
        <h2 className="mb-4 text-sm font-semibold tracking-wide text-ink-500 uppercase">
          Exams you manage
        </h2>
      )}
      {isStaff && <StaffPanel orgId={current.id} viewOnly={viewOnly} />}
      {isStaff && isLearner && (
        <h2 className="mt-10 mb-4 text-sm font-semibold tracking-wide text-ink-500 uppercase">
          Exams you take
        </h2>
      )}
      {isLearner && <LearnerPanel />}
    </>
  );
}

function LearnerPanel() {
  const { data = [] } = useApi<MyExamItem[]>('/my/exams', { refreshInterval: 30_000 });
  const live = data.filter((e) => e.state === 'LIVE' && e.canStart);
  const upcoming = data.filter((e) => e.state === 'SCHEDULED');
  const done = data.filter((e) => e.lastAttempt);
  const scored = done.filter(
    (e) => e.lastAttempt?.percentage !== null && e.lastAttempt?.resultVisible,
  );
  const avg = scored.length
    ? Math.round(scored.reduce((s, e) => s + (e.lastAttempt!.percentage ?? 0), 0) / scored.length)
    : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Live now" value={live.length} icon={Radio} tone="rose" />
        <StatCard label="Upcoming" value={upcoming.length} icon={CalendarClock} tone="sky" />
        <StatCard label="Completed" value={done.length} icon={CheckCircle2} tone="emerald" />
        <StatCard
          label="Average score"
          value={avg !== null ? `${avg}%` : '—'}
          icon={Gauge}
          tone="violet"
        />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Live & upcoming</CardTitle>
              <CardDescription>Start as soon as an exam opens</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...live, ...upcoming].slice(0, 5).map((e) => (
              <Link
                key={e.id}
                href={`/exam/${e.id}`}
                className="flex items-center gap-4 rounded-xl border border-ink-200 p-4 transition hover:border-ink-300 hover:bg-ink-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <ExamStateBadge state={e.state} />
                    <span className="text-xs text-ink-500">
                      {e.state === 'LIVE'
                        ? `closes in ${timeUntil(e.endsAt!)}`
                        : `opens in ${timeUntil(e.startsAt!)}`}
                    </span>
                  </div>
                  <p className="truncate font-medium">{e.title}</p>
                  <p className="text-xs text-ink-500">
                    {e.durationMinutes} min · {e.questionCount} questions
                  </p>
                </div>
                {e.state === 'LIVE' ? (
                  <PlayCircle className="size-6 text-brand-600" />
                ) : (
                  <ArrowRight className="size-4 text-ink-300" />
                )}
              </Link>
            ))}
            {!live.length && !upcoming.length && (
              <p className="py-6 text-center text-sm text-ink-400">No exams scheduled right now.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent results</CardTitle>
              <CardDescription>Instant scores from your latest exams</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/my-exams">
                All <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {done.slice(0, 5).map((e) => (
              <Link
                key={e.id}
                href={`/my-exams/result/${e.lastAttempt!.id}`}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-ink-50"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.title}</span>
                {e.lastAttempt!.resultVisible && e.lastAttempt!.percentage !== null ? (
                  <Badge tone={e.lastAttempt!.passed ? 'success' : 'danger'}>
                    {Math.round(e.lastAttempt!.percentage)}%
                  </Badge>
                ) : (
                  <Badge tone="neutral">Pending</Badge>
                )}
              </Link>
            ))}
            {!done.length && (
              <p className="py-6 text-center text-sm text-ink-400">
                Your results will appear here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StaffPanel({ orgId, viewOnly = false }: { orgId: string; viewOnly?: boolean }) {
  const { data } = useApi<Paginated<ExamSummary>>('/exams?pageSize=50', {
    orgId,
    refreshInterval: 20_000,
  });
  const exams = data?.data ?? [];
  const live = exams.filter((e) => e.state === 'LIVE');
  const scheduled = exams.filter((e) => e.state === 'SCHEDULED');
  const ended = exams.filter((e) => e.state === 'ENDED');
  const writing = live.reduce((s, e) => s + e.inProgressCount, 0);
  const avgs = ended.filter((e) => e.avgPct !== null);
  const avg = avgs.length
    ? Math.round(avgs.reduce((s, e) => s + (e.avgPct ?? 0), 0) / avgs.length)
    : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Live exams"
          value={live.length}
          icon={Radio}
          tone="rose"
          footer={<span>{writing} students writing now</span>}
        />
        <StatCard label="Scheduled" value={scheduled.length} icon={CalendarClock} tone="sky" />
        <StatCard label="Completed" value={ended.length} icon={CheckCircle2} tone="emerald" />
        <StatCard
          label="Average score"
          value={avg !== null ? `${avg}%` : '—'}
          icon={Gauge}
          tone="violet"
          footer={<span>Across completed exams</span>}
        />
      </div>
      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle>Exams</CardTitle>
            <CardDescription>Live first, then upcoming and recent</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/exams">
              View all <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <div className="border-t border-ink-100">
          {[...live, ...scheduled, ...ended].slice(0, 6).map((e) => (
            <Link
              key={e.id}
              href={e.state === 'DRAFT' && !viewOnly ? `/exams/${e.id}` : `/exams/${e.id}/results`}
              className="flex items-center gap-4 border-b border-ink-100 px-6 py-3.5 transition last:border-0 hover:bg-ink-50/70"
            >
              <ExamStateBadge state={e.state} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.title}</p>
                <p className="text-xs text-ink-500">
                  {formatDateTime(e.startsAt)} · {e.questionCount} questions
                </p>
              </div>
              <span className="text-right text-xs text-ink-500">
                <b className="tabular text-sm font-semibold text-ink-900">{e.submittedCount}</b>/
                {e.assignedCount} submitted
                {e.avgPct !== null && <span className="block">avg {e.avgPct}%</span>}
              </span>
              <BarChart3 className="size-4 text-ink-300" />
            </Link>
          ))}
          {!exams.length && (
            <EmptyState
              icon={<FileQuestion />}
              title="No exams yet"
              description="Build a question bank, create an exam and publish it to your students."
              action={
                <Button asChild>
                  <Link href="/exams">Create an exam</Link>
                </Button>
              }
            />
          )}
        </div>
      </Card>
    </>
  );
}
