'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileQuestion,
  Hourglass,
  PlayCircle,
  Timer,
} from 'lucide-react';
import type { MyExamItem } from '@arc/types';
import { Badge, Button, Card, cn, EmptyState, Skeleton } from '@arc/ui';
import { ExamStateBadge } from '@/components/exams/badges';
import { PageHeader } from '@/components/shell/PageHeader';
import { formatDateTime, timeUntil } from '@/lib/format';
import { useApi } from '@/lib/use-api';

export default function MyExamsPage() {
  const { data, isLoading } = useApi<MyExamItem[]>('/my/exams', { refreshInterval: 30_000 });
  const live = (data ?? []).filter(
    (e) => e.state === 'LIVE' && (e.canStart || e.inProgressAttemptId),
  );
  const upcoming = (data ?? [])
    .filter((e) => e.state === 'SCHEDULED')
    .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));
  const done = (data ?? []).filter((e) => e.lastAttempt && !live.includes(e));
  const missed = (data ?? []).filter((e) => e.state === 'ENDED' && !e.lastAttempt);

  return (
    <>
      <PageHeader
        title="My exams"
        description="Exams assigned to you. Results appear the moment you submit."
      />
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      )}
      {data && data.length === 0 && (
        <Card>
          <EmptyState
            icon={<ClipboardList />}
            title="No exams yet"
            description="When your institution assigns you an exam, it will appear here."
          />
        </Card>
      )}

      {live.length > 0 && (
        <Section title="Live now" count={live.length}>
          {live.map((e) => (
            <Card
              key={e.id}
              className="relative overflow-hidden border-rose-200 p-6 ring-1 ring-rose-100"
            >
              <div className="absolute -top-16 -right-16 size-48 rounded-full bg-rose-500/10 blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-2">
                  <ExamStateBadge state="LIVE" />
                  <span className="text-xs text-ink-500">
                    closes in {e.endsAt ? timeUntil(e.endsAt) : '—'}
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-semibold">{e.title}</h3>
                <p className="text-sm text-ink-500">{e.organizationName}</p>
                <Meta e={e} />
                <Button asChild size="lg" className="mt-5 w-full sm:w-auto">
                  <Link href={`/exam/${e.id}`}>
                    <PlayCircle /> {e.inProgressAttemptId ? 'Resume exam' : 'Start exam'}
                  </Link>
                </Button>
              </div>
            </Card>
          ))}
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title="Upcoming" count={upcoming.length}>
          {upcoming.map((e) => (
            <Card key={e.id} className="p-6">
              <div className="flex items-center gap-2">
                <ExamStateBadge state="SCHEDULED" />
                <span className="text-xs text-ink-500">
                  opens in {e.startsAt ? timeUntil(e.startsAt) : '—'}
                </span>
              </div>
              <h3 className="mt-3 text-lg font-semibold">{e.title}</h3>
              <p className="text-sm text-ink-500">{e.organizationName}</p>
              <Meta e={e} />
              <Button asChild variant="secondary" className="mt-5">
                <Link href={`/exam/${e.id}`}>
                  View instructions <ArrowRight />
                </Link>
              </Button>
            </Card>
          ))}
        </Section>
      )}

      {done.length > 0 && (
        <Section title="Completed" count={done.length}>
          {done.map((e) => {
            const a = e.lastAttempt!;
            return (
              <Link key={e.id} href={`/my-exams/result/${a.id}`} className="group">
                <Card className="flex items-center gap-5 p-5 transition group-hover:border-ink-300 group-hover:shadow-md group-hover:shadow-ink-900/[0.04]">
                  <ScoreBubble pct={a.percentage} passed={a.passed} visible={a.resultVisible} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-ink-900 group-hover:text-brand-700">
                      {e.title}
                    </h3>
                    <p className="text-sm text-ink-500">
                      {e.organizationName} · submitted {formatDateTime(a.submittedAt)}
                    </p>
                    <div className="mt-2">
                      {!a.resultVisible ? (
                        <Badge tone="neutral">
                          <Hourglass className="size-3" /> Result pending
                        </Badge>
                      ) : a.passed ? (
                        <Badge tone="success">
                          <CheckCircle2 className="size-3" /> Passed
                        </Badge>
                      ) : (
                        <Badge tone="danger">Not passed</Badge>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                </Card>
              </Link>
            );
          })}
        </Section>
      )}

      {missed.length > 0 && (
        <Section title="Missed" count={missed.length}>
          {missed.map((e) => (
            <Card key={e.id} className="p-5 opacity-70">
              <h3 className="font-semibold">{e.title}</h3>
              <p className="text-sm text-ink-500">
                Closed {formatDateTime(e.endsAt)} · not attempted
              </p>
            </Card>
          ))}
        </Section>
      )}
    </>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-wide text-ink-500 uppercase">
        {title}{' '}
        <span className="rounded-full bg-ink-200/70 px-2 text-xs text-ink-600">{count}</span>
      </h2>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Meta({ e }: { e: MyExamItem }) {
  return (
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink-600">
      <span className="flex items-center gap-1.5">
        <Timer className="size-4 text-ink-400" /> {e.durationMinutes} min
      </span>
      <span className="flex items-center gap-1.5">
        <FileQuestion className="size-4 text-ink-400" /> {e.questionCount} questions ·{' '}
        {e.totalMarks} marks
      </span>
      <span className="flex items-center gap-1.5">
        <CalendarClock className="size-4 text-ink-400" /> {formatDateTime(e.startsAt)} →{' '}
        {formatDateTime(e.endsAt)}
      </span>
    </div>
  );
}

export function ScoreBubble({
  pct,
  passed,
  visible,
  size = 64,
}: {
  pct: number | null;
  passed: boolean | null;
  visible: boolean;
  size?: number;
}) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const v = visible && pct !== null ? pct : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-ink-100" />
        {visible && pct !== null && (
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            className={cn(passed ? 'stroke-emerald-500' : 'stroke-rose-500')}
            strokeDasharray={c}
            strokeDashoffset={c - (c * v) / 100}
          />
        )}
      </svg>
      <span className="tabular absolute inset-0 flex items-center justify-center text-sm font-semibold">
        {visible && pct !== null ? `${Math.round(pct)}%` : '—'}
      </span>
    </div>
  );
}
