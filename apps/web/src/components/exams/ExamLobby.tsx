'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Camera,
  DoorOpen,
  Keyboard,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FileQuestion,
  Maximize,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Trophy,
} from 'lucide-react';
import type { ExamLobby as Lobby } from '@arc/types';
import { Button, cn } from '@arc/ui';
import { LogoMark } from '@/components/brand/Logo';
import { formatDateTime, timeUntil } from '@/lib/format';
import { CameraView, useCamera } from './camera';

export function ExamLobby({
  lobby,
  onStart,
  starting,
  error,
}: {
  lobby: Lobby;
  onStart: () => void;
  starting: boolean;
  error: string | null;
}) {
  const [agree, setAgree] = useState(false);
  const canTake = lobby.state === 'LIVE' && lobby.canStart;
  const camera = useCamera();
  const cameraReady = !lobby.requireCamera || camera.state === 'on';
  const strict = lobby.maxViolations === 1;
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const rules = (lobby.instructions ?? '')
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
  const resuming = Boolean(lobby.inProgressAttemptId);
  const leftStrict = canTake && strict && resuming;
  const attemptsLeft = lobby.maxAttempts - lobby.attemptsUsed;

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-6">
          <Link
            href="/my-exams"
            className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"
          >
            <ArrowLeft className="size-4" /> My exams
          </Link>
          <span className="ml-auto flex items-center gap-2 text-sm font-medium text-ink-700">
            <LogoMark className="size-6" /> {lobby.organizationName}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-sm">
          <div className="relative bg-ink-950 px-8 py-9 text-white">
            <div className="bg-grid absolute inset-0 opacity-60" />
            <div className="absolute -top-20 -right-20 size-72 rounded-full bg-brand-600/30 blur-3xl" />
            <div className="relative">
              <p className="text-sm font-medium text-cyan-300">Examination</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">{lobby.title}</h1>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { icon: Timer, k: 'Duration', v: `${lobby.durationMinutes} min` },
                  { icon: FileQuestion, k: 'Questions', v: lobby.questionCount },
                  { icon: Trophy, k: 'Total marks', v: lobby.totalMarks },
                  { icon: ClipboardCheck, k: 'Pass mark', v: `${lobby.passPct}%` },
                ].map(({ icon: Icon, k, v }) => (
                  <div
                    key={k}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur"
                  >
                    <Icon className="size-4 text-cyan-300" />
                    <p className="mt-2 text-xl font-semibold">{v}</p>
                    <p className="text-xs text-ink-300">{k}</p>
                  </div>
                ))}
              </div>
              <p className="mt-5 flex items-center gap-2 text-sm text-ink-300">
                <CalendarClock className="size-4" /> Window: {formatDateTime(lobby.startsAt)} →{' '}
                {formatDateTime(lobby.endsAt)}
              </p>
            </div>
          </div>

          <div className="grid gap-8 p-8 lg:grid-cols-[1fr_300px]">
            <div>
              <h2 className="text-lg font-semibold">Instructions</h2>
              <ol className="mt-4 space-y-3">
                {rules.map((r, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink-700">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
                      {i + 1}
                    </span>
                    {r}
                  </li>
                ))}
                {lobby.negativeMarking && (
                  <li className="flex gap-3 text-[15px] leading-relaxed font-medium text-rose-700">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-semibold">
                      !
                    </span>
                    Negative marking applies: wrong answers reduce your score. Leave a question
                    blank if you’re unsure.
                  </li>
                )}
              </ol>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-rose-800">
                  <ShieldAlert className="size-4" /> Proctoring rules
                </p>
                <ul className="mt-3 space-y-2 text-[13px] text-rose-900/80">
                  {lobby.requireFullscreen && (
                    <li className="flex gap-2">
                      <Maximize className="mt-0.5 size-3.5 shrink-0" /> The exam runs in full
                      screen.
                    </li>
                  )}
                  <li className="flex gap-2">
                    <Keyboard className="mt-0.5 size-3.5 shrink-0" /> Keyboard shortcuts, copy,
                    paste and right-click are disabled.
                  </li>
                  {strict ? (
                    <li className="flex gap-2 font-semibold text-rose-800">
                      <DoorOpen className="mt-0.5 size-3.5 shrink-0" /> Leaving full screen,
                      switching tab/window or closing the page submits your exam immediately.
                    </li>
                  ) : (
                    <>
                      <li className="flex gap-2">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Switching tabs,
                        windows or apps is recorded.
                      </li>
                      {lobby.maxViolations > 0 && (
                        <li className="flex gap-2 font-semibold">
                          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" /> After{' '}
                          {lobby.maxViolations} violations your exam is submitted automatically.
                        </li>
                      )}
                    </>
                  )}
                  {lobby.requireCamera && (
                    <li className="flex gap-2">
                      <Camera className="mt-0.5 size-3.5 shrink-0" /> Your camera stays on during
                      the exam. It is not recorded.
                    </li>
                  )}
                </ul>
              </div>

              {canTake && !leftStrict && lobby.requireCamera && (
                <div className="rounded-2xl border border-ink-200 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                    <Camera className="size-4 text-brand-600" /> Camera check
                  </p>
                  <CameraView
                    stream={camera.stream}
                    state={camera.state}
                    compact
                    className="mt-3"
                  />
                  {camera.state !== 'on' && (
                    <Button
                      variant="secondary"
                      className="mt-3 w-full"
                      loading={camera.state === 'requesting'}
                      onClick={() => void camera.start()}
                    >
                      <Camera /> Turn on camera
                    </Button>
                  )}
                  {(camera.state === 'denied' || camera.state === 'unavailable') && (
                    <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                      {camera.state === 'denied'
                        ? 'Camera permission was blocked. Click the camera icon in the address bar, choose Allow, then try again.'
                        : 'No camera found. Connect a webcam, or ask your instructor for help.'}
                    </p>
                  )}
                  <p className="mt-3 flex gap-2 text-[12px] leading-relaxed text-ink-500">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                    Your video stays on your own screen only. Nothing is recorded, saved or sent to
                    anyone.
                  </p>
                </div>
              )}

              {leftStrict ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-rose-800">
                    <DoorOpen className="size-4" /> You left this exam
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-rose-900/80">
                    The exam window was closed or left while it was running. Under this exam’s rules
                    it is submitted with the answers you had saved.
                  </p>
                  {error && <p className="mt-2 text-[13px] text-rose-700">{error}</p>}
                  <Button className="mt-4 w-full" loading={starting} onClick={onStart}>
                    See my result
                  </Button>
                </div>
              ) : canTake ? (
                <>
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-brand-600"
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
                    />
                    I have read the instructions and agree to follow the exam rules.
                  </label>
                  {error && (
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
                      {error}
                    </p>
                  )}
                  <Button
                    size="lg"
                    className="w-full"
                    disabled={!agree || !cameraReady}
                    loading={starting}
                    onClick={onStart}
                  >
                    {resuming ? 'Resume exam' : 'Start exam'}
                  </Button>
                  <p className="text-center text-xs text-ink-500">
                    {!cameraReady
                      ? 'Turn on your camera to start.'
                      : resuming
                        ? 'Your timer kept running while you were away.'
                        : `The timer starts immediately · ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left`}
                  </p>
                </>
              ) : (
                <div
                  className={cn(
                    'rounded-2xl p-4 text-center',
                    lobby.state === 'SCHEDULED' ? 'bg-brand-50' : 'bg-ink-100',
                  )}
                >
                  {lobby.state === 'SCHEDULED' && lobby.startsAt ? (
                    <>
                      <p className="text-sm text-ink-600">Opens in</p>
                      <p className="tabular mt-1 text-2xl font-semibold text-brand-700">
                        {timeUntil(lobby.startsAt)}
                      </p>
                      <p className="mt-1 text-xs text-ink-500">This page unlocks automatically.</p>
                    </>
                  ) : lobby.lastAttempt ? (
                    <>
                      <CheckCircle2 className="mx-auto size-6 text-emerald-600" />
                      <p className="mt-2 text-sm font-medium">You’ve completed this exam</p>
                      <Button asChild className="mt-3 w-full" variant="secondary">
                        <Link href={`/my-exams/result/${lobby.lastAttempt.id}`}>View result</Link>
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-ink-600">This exam has closed.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
