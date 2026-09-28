'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  Loader2,
  AlertTriangle,
  ArrowLeft,
  Award,
  CheckCircle2,
  Clock,
  Hourglass,
  Lock,
  MinusCircle,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import type { AttemptResult } from '@arc/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  Skeleton,
} from '@arc/ui';
import { ReviewCard } from '@/components/exams/AnswerView';
import { formatDateTime, formatDuration } from '@/lib/format';
import { useApi } from '@/lib/use-api';

const REASON_NOTE: Record<string, { tone: string; text: string }> = {
  TIME_UP: { tone: 'amber', text: 'Your exam was submitted automatically when the timer ran out.' },
  WINDOW_CLOSED: {
    tone: 'amber',
    text: 'Your exam was submitted automatically when the exam window closed.',
  },
  VIOLATIONS: {
    tone: 'rose',
    text: 'Your exam was submitted automatically because you left the exam screen (full screen, tab or window).',
  },
  INSTRUCTOR: { tone: 'amber', text: 'Your exam was ended by the instructor.' },
};

export default function ResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const { data: r, error } = useApi<AttemptResult>(`/my/attempts/${attemptId}/result`);

  if (error) {
    return (
      <Card className="mx-auto mt-10 max-w-lg">
        <EmptyState
          icon={<Hourglass />}
          title="Result not available"
          description={(error as Error).message}
        />
      </Card>
    );
  }
  if (!r) return <Skeleton className="h-96 rounded-3xl" />;

  const note = r.submitReason ? REASON_NOTE[r.submitReason] : undefined;
  const pct = r.percentage ?? 0;
  const R = 70;
  const C = 2 * Math.PI * R;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/my-exams"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft className="size-4" /> My exams
      </Link>

      <div className="overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-ink-950 px-8 py-10 text-white">
          <div className="bg-grid absolute inset-0 opacity-60" />
          <div
            className={cn(
              'absolute -top-24 -right-24 size-96 rounded-full blur-3xl',
              r.passed
                ? 'bg-emerald-500/25'
                : r.scoreVisible
                  ? 'bg-rose-500/20'
                  : 'bg-brand-600/30',
            )}
          />
          <div className="relative flex flex-col items-center gap-8 md:flex-row">
            {r.scoreVisible ? (
              <div className="relative size-44 shrink-0">
                <svg viewBox="0 0 160 160" className="size-full -rotate-90">
                  <circle
                    cx="80"
                    cy="80"
                    r={R}
                    fill="none"
                    strokeWidth="12"
                    className="stroke-white/10"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r={R}
                    fill="none"
                    strokeWidth="12"
                    strokeLinecap="round"
                    className={r.passed ? 'stroke-emerald-400' : 'stroke-rose-400'}
                    strokeDasharray={C}
                    strokeDashoffset={C - (C * pct) / 100}
                    style={{ transition: 'stroke-dashoffset 1s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="tabular text-4xl font-semibold">
                    {Math.round(pct * 10) / 10}%
                  </span>
                  <span className="tabular text-sm text-ink-300">
                    {r.score} / {r.maxScore}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex size-44 shrink-0 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
                <Hourglass className="size-12 text-cyan-300" />
              </div>
            )}
            <div className="text-center md:text-left">
              <p className="text-sm text-cyan-300">{r.organizationName}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{r.title}</h1>
              {r.scoreVisible ? (
                <>
                  <p
                    className={cn(
                      'mt-3 inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-sm font-semibold',
                      r.passed
                        ? 'bg-emerald-400/15 text-emerald-300'
                        : 'bg-rose-400/15 text-rose-300',
                    )}
                  >
                    {r.passed ? (
                      <CheckCircle2 className="size-4" />
                    ) : (
                      <XCircle className="size-4" />
                    )}
                    {r.passed ? 'Passed' : 'Not passed'} · pass mark {r.passPct}%
                  </p>
                  {r.rank && (
                    <p className="mt-4 text-ink-300">
                      Rank <b className="text-2xl font-semibold text-white">#{r.rank}</b> of{' '}
                      {r.candidates}
                      {r.percentile !== null && (
                        <>
                          {' '}
                          · better than <b className="text-white">{Math.round(r.percentile)}%</b> of
                          candidates
                        </>
                      )}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-3 max-w-md text-ink-300">{r.releaseNote}</p>
              )}
              <p className="mt-3 text-xs text-ink-400">
                Submitted {formatDateTime(r.submittedAt)} · time taken{' '}
                {formatDuration(r.timeTakenSec)}
              </p>
            </div>
          </div>
        </div>

        {note && (
          <div
            className={cn(
              'flex items-center gap-3 border-b px-8 py-3 text-sm',
              note.tone === 'rose'
                ? 'border-rose-100 bg-rose-50 text-rose-800'
                : 'border-amber-100 bg-amber-50 text-amber-900',
            )}
          >
            <AlertTriangle className="size-4 shrink-0" /> {note.text}
          </div>
        )}

        {r.codingPending && (
          <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50 px-8 py-3 text-sm text-amber-900">
            <Loader2 className="size-4 shrink-0 animate-spin" /> Your coding answers are waiting to
            be run against the test cases. Your score will update once they’re evaluated.
          </div>
        )}

        {r.scoreVisible && (
          <div className="grid grid-cols-2 divide-x divide-y divide-ink-100 border-b border-ink-100 md:grid-cols-4 md:divide-y-0">
            {[
              { icon: CheckCircle2, k: 'Correct', v: r.correctCount, c: 'text-emerald-600' },
              { icon: XCircle, k: 'Wrong', v: r.wrongCount, c: 'text-rose-600' },
              { icon: MinusCircle, k: 'Skipped', v: r.unansweredCount, c: 'text-ink-500' },
              {
                icon: Clock,
                k: 'Time taken',
                v: formatDuration(r.timeTakenSec),
                c: 'text-brand-600',
              },
            ].map(({ icon: Icon, k, v, c }) => (
              <div key={k} className="px-6 py-5">
                <Icon className={cn('size-5', c)} />
                <p className="tabular mt-2 text-2xl font-semibold">{v}</p>
                <p className="text-sm text-ink-500">{k}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {r.scoreVisible && (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>By topic</CardTitle>
                <CardDescription>Where to focus next</CardDescription>
              </div>
              <Target className="size-5 text-amber-500" />
            </CardHeader>
            <CardContent>
              <Bars rows={r.byTopic} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>By difficulty</CardTitle>
                <CardDescription>Correct answers per level</CardDescription>
              </div>
              <TrendingUp className="size-5 text-brand-500" />
            </CardHeader>
            <CardContent>
              <Bars
                rows={r.byDifficulty.map((d) => ({
                  ...d,
                  key: d.key.charAt(0) + d.key.slice(1).toLowerCase(),
                }))}
              />
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Award className="size-5 text-brand-600" /> Answer review
        </h2>
        {r.review ? (
          <div className="space-y-4">
            {r.review.map((item, i) => (
              <ReviewCard key={item.questionId} item={item} index={i} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              icon={<Lock />}
              title="Answers are locked for now"
              description={
                r.reviewAvailableAt
                  ? `Correct answers and explanations unlock after the exam closes on ${formatDateTime(r.reviewAvailableAt)}, so they can’t be shared with others still writing.`
                  : 'Answers will be available when your institution releases results.'
              }
            />
          </Card>
        )}
      </div>
    </div>
  );
}

function Bars({ rows }: { rows: { key: string; correct: number; total: number; pct: number }[] }) {
  return (
    <ul className="space-y-3.5">
      {rows.map((t) => (
        <li key={t.key}>
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="text-ink-700">{t.key}</span>
            <span className="tabular text-ink-500">
              {t.correct}/{t.total} ·{' '}
              <b className="font-semibold text-ink-900">{Math.round(t.pct)}%</b>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100">
            <div
              className={cn(
                'h-full rounded-full',
                t.pct < 40 ? 'bg-rose-500' : t.pct < 70 ? 'bg-amber-500' : 'bg-emerald-500',
              )}
              style={{ width: `${t.pct}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
