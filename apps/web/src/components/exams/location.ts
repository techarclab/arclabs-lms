'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type LocationState = 'idle' | 'requesting' | 'on' | 'denied' | 'unavailable' | 'timeout';
export interface LivePosition {
  lat: number;
  lng: number;
  accuracy: number;
  at: number;
}

/**
 * Follows the device's location (on-campus exams). `start()` must run from a click the first
 * time on some browsers; after permission is granted it starts by itself (`autoStart`).
 */
export function useLocation({ autoStart }: { autoStart: boolean }) {
  const [state, setState] = useState<LocationState>('idle');
  const [position, setPosition] = useState<LivePosition | null>(null);
  const latest = useRef<LivePosition | null>(null);
  const watch = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);
    watch.current = null;
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('unavailable');
      return;
    }
    stop();
    setState((s) => (s === 'on' ? s : 'requesting'));
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        const pos = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          at: Date.now(),
        };
        latest.current = pos;
        setPosition(pos);
        setState('on');
      },
      (err) => {
        // Keep a position we already have through short GPS / Wi-Fi gaps.
        if (err.code === err.PERMISSION_DENIED) {
          latest.current = null;
          setState('denied');
        } else if (!latest.current) setState(err.code === err.TIMEOUT ? 'timeout' : 'unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    );
  }, [stop]);

  useEffect(() => {
    if (!autoStart) return;
    start();
    return stop;
  }, [autoStart, start, stop]);

  /** The latest position, if it is fresh enough to send (two minutes). */
  const fresh = useCallback(() => {
    const p = latest.current;
    return p && Date.now() - p.at < 120_000 ? p : null;
  }, []);

  return { state, position, start, fresh };
}

/** "±25 m" / "±1.2 km" */
export function accuracyText(m: number) {
  return m < 1000 ? `±${Math.round(m)} m` : `±${(m / 1000).toFixed(1)} km`;
}
