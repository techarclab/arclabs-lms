'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraOff, EyeOff } from 'lucide-react';
import { cn } from '@arc/ui';

/**
 * Camera presence check for exams. The stream is shown only on the student's own screen:
 * it is never recorded, saved or sent anywhere (no MediaRecorder, no upload, no frames read).
 */
export type CameraState = 'idle' | 'requesting' | 'on' | 'denied' | 'unavailable' | 'off';

// One shared stream so the lobby's camera carries straight into the exam without a second prompt.
let shared: MediaStream | null = null;
const live = (s: MediaStream | null) =>
  Boolean(s?.getVideoTracks().some((t) => t.readyState === 'live'));

export function stopCamera() {
  shared?.getTracks().forEach((t) => t.stop());
  shared = null;
}

export function useCamera({ autoStart = false }: { autoStart?: boolean } = {}) {
  const [state, setState] = useState<CameraState>(() => (live(shared) ? 'on' : 'idle'));
  const [stream, setStream] = useState<MediaStream | null>(() => (live(shared) ? shared : null));

  const watch = useCallback((s: MediaStream) => {
    for (const t of s.getVideoTracks()) {
      t.onended = () => setState('off');
      t.onmute = () => setState('off');
      t.onunmute = () => setState('on');
    }
  }, []);

  const start = useCallback(async () => {
    if (live(shared)) {
      setStream(shared);
      setState('on');
      watch(shared!);
      return true;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unavailable');
      return false;
    }
    setState('requesting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      shared = s;
      watch(s);
      setStream(s);
      setState('on');
      return true;
    } catch (e) {
      const name = (e as DOMException)?.name;
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      return false;
    }
  }, [watch]);

  useEffect(() => {
    if (autoStart) void start();
    else if (shared) watch(shared);
  }, [autoStart, start, watch]);

  return { state, stream, start };
}

export function CameraView({
  stream,
  state,
  className,
  compact = false,
}: {
  stream: MediaStream | null;
  state: CameraState;
  className?: string;
  compact?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => {});
    }
  }, [stream, state]);

  const on = state === 'on' && stream;
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl bg-ink-950 ring-1 ring-ink-900/10',
        compact ? 'aspect-[4/3]' : 'aspect-video',
        className,
      )}
    >
      {on ? (
        <video
          ref={ref}
          muted
          playsInline
          autoPlay
          className="size-full -scale-x-100 object-cover"
          aria-label="Your camera (not recorded)"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-ink-400">
          <CameraOff className="size-6" />
          <span className="text-xs">
            {state === 'requesting' ? 'Waiting for permission…' : 'Camera is off'}
          </span>
        </div>
      )}
      {on && (
        <>
          <span className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase backdrop-blur">
            <span className="size-1.5 animate-pulse rounded-full bg-rose-500" /> Live
          </span>
          <span className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 text-[10px] font-medium text-white/90 backdrop-blur">
            <EyeOff className="size-3" /> Only on your screen · not recorded
          </span>
        </>
      )}
    </div>
  );
}
