'use client';

import { cn } from '@arc/ui';
import type { FrameObservation, ProctorAiStatus } from './proctor-ai';
import { YAW_LIMIT } from './proctor-ai';

/** Opens the live-numbers view: add ?camcheck=1 to the exam URL. */
export function cameraCheckEnabled() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('camcheck') === '1';
}

/** One line under the camera preview so everyone can see the camera AI is actually working. */
export function CameraAiStatus({
  status,
  running,
}: {
  status: ProctorAiStatus;
  running: boolean;
}) {
  const [text, tone] =
    status === 'loading'
      ? ['Camera AI starting…', 'muted']
      : status === 'unavailable'
        ? ['Camera AI can’t run in this browser — use the latest Chrome or Edge.', 'warn']
        : running
          ? ['Camera AI watching (face, eyes, phone)', 'ok']
          : ['Camera AI waiting for the camera…', 'muted'];
  return (
    <p
      className={cn(
        'mt-2 flex items-center gap-2 px-1 text-[11.5px] font-medium',
        tone === 'ok' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-ink-500',
      )}
    >
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          tone === 'ok'
            ? 'animate-pulse bg-emerald-500'
            : tone === 'warn'
              ? 'bg-amber-500'
              : 'bg-ink-300',
        )}
      />
      {text}
    </p>
  );
}

/** Live numbers for testing (?camcheck=1): what the camera AI sees right now. */
export function CameraAiNumbers({ info }: { info: (FrameObservation & { at: number }) | null }) {
  if (!info) return <p className="mt-2 px-1 text-[11px] text-ink-500">No frames analysed yet.</p>;
  const n = (v: number | undefined, d = 0) => (v === undefined ? '–' : v.toFixed(d));
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-lg bg-ink-50 px-2.5 py-2 font-mono text-[11px] text-ink-700">
      <span>faces</span>
      <b>{info.faces}</b>
      <span>head left/right</span>
      <b className={Math.abs(info.yaw ?? 0) > YAW_LIMIT ? 'text-rose-600' : ''}>
        {n(info.yaw)}°
      </b>
      <span>head up/down</span>
      <b>{n(info.pitch)}°</b>
      <span>eyes sideways</span>
      <b>{n(info.gazeSide, 2)}</b>
      <span>eyes down</span>
      <b>{n(info.gazeDown, 2)}</b>
      <span>phone score</span>
      <b className={info.phone ? 'text-rose-600' : ''}>{n(info.phoneScore, 2)}</b>
    </div>
  );
}
