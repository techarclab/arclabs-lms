'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Eraser,
  Loader2,
  Maximize,
  Send,
  ShieldAlert,
  Timer,
} from 'lucide-react';
import type { AttemptSession, ProctorEventResult } from '@arc/types';
import { Button, cn, Dialog, DialogContent } from '@arc/ui';
import { LogoMark } from '@/components/brand/Logo';
import { useAuth } from '@/components/providers/AuthProvider';
import { ApiError } from '@/lib/api';
import { PromptText } from './AnswerView';
import { enterFullscreen, exitFullscreen, useLockdown, type LockdownEvent } from './useLockdown';

type SaveState = 'saved' | 'saving' | 'offline';
const CLOSED_CODES = new Set(['ATTEMPT_CLOSED', 'TIME_UP', 'AUTO_SUBMITTED']);

function fmtClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function readSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function ExamRunner({
  session: initial,
  onSessionReplaced,
}: {
  session: AttemptSession;
  onSessionReplaced: () => void;
}) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [session] = useState(initial);
  const qs = session.questions;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>(initial.answers);
  const [marked, setMarked] = useState<Set<string>>(() =>
    readSet(`arc.marked.${initial.attemptId}`),
  );
  const [visited, setVisited] = useState<Set<string>>(() => new Set([qs[0]?.id ?? '']));
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [violations, setViolations] = useState(initial.violationCount);
  const [warning, setWarning] = useState<{ type: LockdownEvent; remaining: number | null } | null>(
    null,
  );
  const [inFullscreen, setInFullscreen] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finishing, setFinishing] = useState<string | null>(null);
  const offset = useRef(new Date(initial.serverNow).getTime() - Date.now());
  const deadline = useRef(new Date(initial.deadlineAt).getTime());
  const [now, setNow] = useState(() => Date.now() + offset.current);
  const pending = useRef(new Map<string, unknown>());
  const flushing = useRef<Promise<void> | null>(null);
  const done = useRef(false);

  const headers = useCallback(async () => ({ token: await getToken() }), [getToken]);
  const call = useCallback(
    async <T,>(path: string, body?: unknown) => {
      const { token } = await headers();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001/api/v1'}${path}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Attempt-Session': session.sessionId,
          },
          body: JSON.stringify(body ?? {}),
        },
      );
      const data = await res.json().catch(() => undefined);
      if (!res.ok) throw new ApiError(res.status, data);
      return data as T;
    },
    [headers, session.sessionId],
  );

  // ───────── Finishing ─────────
  const finish = useCallback(
    async (reason: string) => {
      if (done.current) return;
      done.current = true;
      setFinishing(reason);
      try {
        await flushing.current;
        await call(`/my/attempts/${session.attemptId}/submit`);
      } catch {
        /* already closed server-side — the result page will show why */
      }
      try {
        localStorage.removeItem(`arc.marked.${session.attemptId}`);
      } catch {
        /* ignore */
      }
      await exitFullscreen();
      router.replace(`/my-exams/result/${session.attemptId}`);
    },
    [call, router, session.attemptId],
  );

  const handleError = useCallback(
    (e: unknown) => {
      if (!(e instanceof ApiError)) return false;
      const code = e.body?.error.code;
      if (code === 'SESSION_REPLACED') {
        done.current = true;
        onSessionReplaced();
        return true;
      }
      if (code && CLOSED_CODES.has(code)) {
        void finish('closed');
        return true;
      }
      return false;
    },
    [finish, onSessionReplaced],
  );

  // ───────── Autosave ─────────
  const flush = useCallback(async () => {
    if (flushing.current) return flushing.current;
    flushing.current = (async () => {
      while (pending.current.size && !done.current) {
        const [questionId, answer] = pending.current.entries().next().value as [string, unknown];
        pending.current.delete(questionId);
        setSaveState('saving');
        try {
          await call(`/my/attempts/${session.attemptId}/answers`, {
            questionId,
            answer: answer ?? null,
          });
        } catch (e) {
          if (handleError(e)) return;
          if (!pending.current.has(questionId)) pending.current.set(questionId, answer);
          setSaveState('offline');
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
      setSaveState('saved');
    })().finally(() => {
      flushing.current = null;
    });
    return flushing.current;
  }, [call, handleError, session.attemptId]);

  const setAnswer = (questionId: string, answer: unknown, debounceMs = 0) => {
    setAnswers((a) => ({ ...a, [questionId]: answer }));
    pending.current.set(questionId, answer);
    setSaveState('saving');
    if (debounceMs) {
      window.clearTimeout((setAnswer as unknown as { t?: number }).t);
      (setAnswer as unknown as { t?: number }).t = window.setTimeout(
        () => void flush(),
        debounceMs,
      );
    } else void flush();
  };

  // ───────── Clock & heartbeat ─────────
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now() + offset.current;
      setNow(n);
      if (n >= deadline.current && !done.current) void finish('time');
    }, 250);
    return () => clearInterval(t);
  }, [finish]);

  useEffect(() => {
    const beat = async () => {
      try {
        const r = await call<{ serverNow: string; deadlineAt: string; violationCount: number }>(
          `/my/attempts/${session.attemptId}/heartbeat`,
        );
        offset.current = new Date(r.serverNow).getTime() - Date.now();
        deadline.current = new Date(r.deadlineAt).getTime();
        setViolations(r.violationCount);
      } catch (e) {
        handleError(e);
      }
    };
    const t = setInterval(beat, 15_000);
    return () => clearInterval(t);
  }, [call, handleError, session.attemptId]);

  // ───────── Lockdown ─────────
  const onEvent = useCallback(
    async (type: LockdownEvent) => {
      if (done.current) return;
      try {
        const r = await call<ProctorEventResult>(`/my/attempts/${session.attemptId}/events`, {
          type,
        });
        if (r.autoSubmitted) {
          void finish('violations');
          return;
        }
        setViolations((prev) => {
          if (r.violationCount > prev && type !== 'FULLSCREEN_EXIT')
            setWarning({ type, remaining: r.remaining });
          return r.violationCount;
        });
      } catch (e) {
        handleError(e);
      }
    },
    [call, finish, handleError, session.attemptId],
  );

  useLockdown({
    active: !finishing,
    requireFullscreen: session.requireFullscreen,
    blockCopyPaste: session.blockCopyPaste,
    onEvent,
    onFullscreenChange: setInFullscreen,
  });

  useEffect(() => {
    if (session.requireFullscreen) setInFullscreen(Boolean(document.fullscreenElement));
  }, [session.requireFullscreen]);

  // ───────── Navigation state ─────────
  const q = qs[index]!;
  const go = (i: number) => {
    const next = Math.max(0, Math.min(qs.length - 1, i));
    setIndex(next);
    setVisited((v) => new Set(v).add(qs[next]!.id));
  };
  const toggleMark = () =>
    setMarked((m) => {
      const n = new Set(m);
      if (n.has(q.id)) n.delete(q.id);
      else n.add(q.id);
      try {
        localStorage.setItem(`arc.marked.${session.attemptId}`, JSON.stringify([...n]));
      } catch {
        /* ignore */
      }
      return n;
    });

  const isAnswered = (id: string) => {
    const a = answers[id];
    return !(a === undefined || a === null || a === '' || (Array.isArray(a) && a.length === 0));
  };
  const answeredCount = useMemo(() => qs.filter((x) => isAnswered(x.id)).length, [answers, qs]); // eslint-disable-line react-hooks/exhaustive-deps
  const remainingMs = deadline.current - now;
  const urgent = remainingMs < 5 * 60_000;
  const critical = remainingMs < 60_000;

  if (finishing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-50">
        <Loader2 className="size-6 animate-spin text-brand-600" />
        <p className="text-lg font-semibold">
          {finishing === 'time'
            ? 'Time is up — submitting your exam…'
            : finishing === 'violations'
              ? 'Submitting your exam (violation limit reached)…'
              : 'Submitting your exam…'}
        </p>
        <p className="text-sm text-ink-500">Please don’t close this window.</p>
      </div>
    );
  }

  const answer = answers[q.id];
  const multi = q.type === 'MULTIPLE_CHOICE';

  return (
    <div className="flex min-h-screen flex-col bg-ink-50 select-none">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
          <LogoMark className="size-8 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900">{session.title}</p>
            <p className="text-xs text-ink-500">
              {answeredCount} of {qs.length} answered
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span
              className={cn(
                'hidden items-center gap-1.5 text-xs sm:flex',
                saveState === 'offline' ? 'text-rose-600' : 'text-ink-500',
              )}
            >
              {saveState === 'saving' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : saveState === 'offline' ? (
                <CloudOff className="size-3.5" />
              ) : (
                <Check className="size-3.5 text-emerald-600" />
              )}
              {saveState === 'saving'
                ? 'Saving…'
                : saveState === 'offline'
                  ? 'Connection lost — retrying'
                  : 'All answers saved'}
            </span>
            {session.maxViolations > 0 && (
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold',
                  violations === 0
                    ? 'bg-ink-100 text-ink-600'
                    : violations >= session.maxViolations - 1
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-amber-100 text-amber-800',
                )}
                title="Violations recorded"
              >
                <ShieldAlert className="size-3.5" /> {violations}/{session.maxViolations}
              </span>
            )}
            <span
              className={cn(
                'tabular flex items-center gap-2 rounded-xl px-3.5 py-2 font-mono text-lg font-semibold',
                critical
                  ? 'animate-pulse bg-rose-600 text-white'
                  : urgent
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-ink-900 text-white',
              )}
            >
              <Timer className="size-4" /> {fmtClock(remainingMs)}
            </span>
            <Button onClick={() => setConfirmOpen(true)} className="hidden sm:inline-flex">
              <Send /> Submit
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1400px] flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Question */}
        <section className="flex flex-col rounded-2xl border border-ink-200 bg-white shadow-xs">
          <div className="flex items-center gap-3 border-b border-ink-100 px-6 py-4">
            <span className="text-sm font-semibold text-ink-900">
              Question {index + 1} <span className="font-normal text-ink-400">of {qs.length}</span>
            </span>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              +{q.points}
            </span>
            {q.negativeMarks > 0 && (
              <span className="rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                −{q.negativeMarks}
              </span>
            )}
            <button
              onClick={toggleMark}
              className={cn(
                'ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
                marked.has(q.id) ? 'bg-amber-100 text-amber-800' : 'text-ink-500 hover:bg-ink-100',
              )}
            >
              {marked.has(q.id) ? (
                <BookmarkCheck className="size-4" />
              ) : (
                <Bookmark className="size-4" />
              )}
              {marked.has(q.id) ? 'Marked for review' : 'Mark for review'}
            </button>
          </div>

          <div className="flex-1 px-6 py-6">
            <PromptText text={q.prompt} className="text-[16px]" />
            {multi && (
              <p className="mt-3 text-xs font-medium tracking-wide text-brand-700 uppercase">
                Select all that apply
              </p>
            )}

            {q.type === 'NUMERIC' ? (
              <div className="mt-6 max-w-sm">
                <label className="text-sm font-medium text-ink-700" htmlFor="num-answer">
                  Your answer
                </label>
                <input
                  id="num-answer"
                  data-allow-clipboard
                  inputMode="decimal"
                  autoComplete="off"
                  className="mt-1.5 h-12 w-full rounded-xl border border-ink-300 px-4 font-mono text-lg outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
                  value={answer === undefined || answer === null ? '' : String(answer)}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.\-eE]/g, '');
                    setAnswers((a) => ({ ...a, [q.id]: v }));
                    const n = v === '' ? null : Number(v);
                    if (v === '' || Number.isFinite(n)) setAnswer(q.id, n, 600);
                  }}
                  placeholder="Enter a number"
                />
              </div>
            ) : (
              <ul className="mt-6 space-y-3">
                {q.options.map((o, i) => {
                  const selected = multi
                    ? Array.isArray(answer) && (answer as string[]).includes(o.id)
                    : answer === o.id;
                  return (
                    <li key={o.id}>
                      <button
                        onClick={() => {
                          if (multi) {
                            const cur = Array.isArray(answer) ? (answer as string[]) : [];
                            setAnswer(
                              q.id,
                              selected ? cur.filter((x) => x !== o.id) : [...cur, o.id],
                            );
                          } else setAnswer(q.id, o.id);
                        }}
                        className={cn(
                          'flex w-full items-center gap-4 rounded-xl border-2 px-4 py-3.5 text-left text-[15px] transition',
                          selected
                            ? 'border-brand-500 bg-brand-50/70 text-ink-900'
                            : 'border-ink-200 text-ink-800 hover:border-ink-300 hover:bg-ink-50',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center text-sm font-semibold transition',
                            multi ? 'rounded-lg' : 'rounded-full',
                            selected ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600',
                          )}
                        >
                          {selected && multi ? (
                            <Check className="size-4" strokeWidth={3} />
                          ) : (
                            String.fromCharCode(65 + i)
                          )}
                        </span>
                        <span className="flex-1 whitespace-pre-wrap">{o.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-ink-100 px-6 py-4">
            <Button variant="secondary" disabled={index === 0} onClick={() => go(index - 1)}>
              <ChevronLeft /> Previous
            </Button>
            <Button
              variant="ghost"
              disabled={!isAnswered(q.id)}
              onClick={() => setAnswer(q.id, null)}
            >
              <Eraser /> Clear
            </Button>
            <div className="ml-auto flex gap-2">
              {index < qs.length - 1 ? (
                <Button onClick={() => go(index + 1)}>
                  Next <ChevronRight />
                </Button>
              ) : (
                <Button onClick={() => setConfirmOpen(true)}>
                  <Send /> Finish & submit
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* Palette */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-xs">
            <p className="text-sm font-semibold text-ink-900">Question palette</p>
            <div className="mt-4 grid grid-cols-6 gap-2 lg:grid-cols-5">
              {qs.map((x, i) => {
                const ans = isAnswered(x.id);
                const mk = marked.has(x.id);
                return (
                  <button
                    key={x.id}
                    onClick={() => go(i)}
                    className={cn(
                      'tabular relative flex h-10 items-center justify-center rounded-lg text-sm font-semibold transition',
                      i === index && 'ring-2 ring-brand-500 ring-offset-2',
                      mk
                        ? 'bg-amber-400 text-amber-950'
                        : ans
                          ? 'bg-emerald-500 text-white'
                          : visited.has(x.id)
                            ? 'bg-white text-rose-600 ring-1 ring-rose-300 ring-inset'
                            : 'bg-ink-100 text-ink-600',
                    )}
                  >
                    {i + 1}
                    {mk && ans && (
                      <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                    )}
                  </button>
                );
              })}
            </div>
            <ul className="mt-5 grid grid-cols-2 gap-2 text-xs text-ink-600">
              <li className="flex items-center gap-2">
                <span className="size-3 rounded bg-emerald-500" /> Answered ({answeredCount})
              </li>
              <li className="flex items-center gap-2">
                <span className="size-3 rounded bg-amber-400" /> For review ({marked.size})
              </li>
              <li className="flex items-center gap-2">
                <span className="size-3 rounded bg-white ring-1 ring-rose-300" /> Skipped
              </li>
              <li className="flex items-center gap-2">
                <span className="size-3 rounded bg-ink-100" /> Not visited
              </li>
            </ul>
            <Button className="mt-5 w-full" onClick={() => setConfirmOpen(true)}>
              <Send /> Submit exam
            </Button>
          </div>
          <p className="px-1 text-xs leading-relaxed text-ink-500">
            Answers save automatically. The exam submits itself when the timer reaches zero
            {session.maxViolations > 0 ? ` or after ${session.maxViolations} violations` : ''}.
          </p>
        </aside>
      </div>

      {/* Full-screen gate */}
      {session.requireFullscreen && !inFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/95 p-6 backdrop-blur-xl">
          <div className="max-w-md text-center text-white">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-300">
              <Maximize className="size-6" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold">You left full-screen mode</h2>
            <p className="mt-2 text-ink-300">
              This has been recorded as a violation
              {session.maxViolations > 0 ? ` (${violations} of ${session.maxViolations})` : ''}.
              Your timer is still running — return to full screen to continue.
            </p>
            <Button size="lg" className="mt-6" onClick={() => void enterFullscreen()}>
              <Maximize /> Return to full screen
            </Button>
          </div>
        </div>
      )}

      {/* Violation warning */}
      <Dialog open={Boolean(warning)} onOpenChange={(o) => !o && setWarning(null)}>
        <DialogContent title="Warning: exam rule broken" icon={<AlertTriangle />}>
          <div className="px-6 pt-2 pb-6">
            <p className="text-[15px] text-ink-700">
              {warning?.type === 'TAB_HIDDEN' || warning?.type === 'WINDOW_BLUR'
                ? 'You switched away from the exam window.'
                : warning?.type === 'DEVTOOLS'
                  ? 'Developer tools are not allowed during the exam.'
                  : 'An exam rule was broken.'}{' '}
              This has been recorded and is visible to your instructor.
            </p>
            {warning?.remaining !== null && warning?.remaining !== undefined && (
              <p
                className={cn(
                  'mt-3 rounded-xl px-4 py-3 text-sm font-semibold',
                  warning.remaining <= 1
                    ? 'bg-rose-50 text-rose-700'
                    : 'bg-amber-50 text-amber-800',
                )}
              >
                {warning.remaining === 1
                  ? 'One more violation will submit your exam automatically.'
                  : `${warning.remaining} more violations will submit your exam automatically.`}
              </p>
            )}
            <Button className="mt-5 w-full" onClick={() => setWarning(null)}>
              I understand — continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Submit confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          title="Submit your exam?"
          description="You won’t be able to change your answers after submitting."
          icon={<Send />}
        >
          <div className="px-6 pt-2 pb-6">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="tabular text-2xl font-semibold text-emerald-700">{answeredCount}</p>
                <p className="text-xs text-emerald-800">Answered</p>
              </div>
              <div className="rounded-xl bg-ink-100 p-3">
                <p className="tabular text-2xl font-semibold text-ink-700">
                  {qs.length - answeredCount}
                </p>
                <p className="text-xs text-ink-600">Unanswered</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="tabular text-2xl font-semibold text-amber-700">{marked.size}</p>
                <p className="text-xs text-amber-800">For review</p>
              </div>
            </div>
            <p className="mt-4 text-center text-sm text-ink-500">
              Time remaining: {fmtClock(remainingMs)}
            </p>
            <div className="mt-5 flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmOpen(false)}>
                Keep working
              </Button>
              <Button className="flex-1" onClick={() => void finish('manual')}>
                Submit now
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
