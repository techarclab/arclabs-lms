'use client';

import { useEffect, useRef } from 'react';

export type LockdownEvent =
  'FULLSCREEN_EXIT' | 'TAB_HIDDEN' | 'WINDOW_BLUR' | 'COPY' | 'PASTE' | 'CONTEXT_MENU' | 'DEVTOOLS';

/**
 * Browser lockdown for a running exam: detects leaving full screen, tab/window switches and devtools
 * shortcuts; blocks copy/paste/right-click/print shortcuts. Reports each event through `onEvent`
 * (client-side throttled; the server applies its own debounce and is the source of truth).
 */
export function useLockdown({
  active,
  requireFullscreen,
  blockCopyPaste,
  onEvent,
  onFullscreenChange,
}: {
  active: boolean;
  requireFullscreen: boolean;
  blockCopyPaste: boolean;
  onEvent: (type: LockdownEvent) => void;
  onFullscreenChange: (inFullscreen: boolean) => void;
}) {
  const onEventRef = useRef(onEvent);
  const onFsRef = useRef(onFullscreenChange);
  onEventRef.current = onEvent;
  onFsRef.current = onFullscreenChange;

  useEffect(() => {
    if (!active) return;
    const last = new Map<string, number>();
    const report = (type: LockdownEvent, gapMs = 1500) => {
      const now = Date.now();
      if (now - (last.get(type) ?? 0) < gapMs) return;
      last.set(type, now);
      onEventRef.current(type);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') report('TAB_HIDDEN');
    };
    const onBlur = () => {
      // Ignore blurs caused by our own dialogs/iframes; only count when the document really lost focus.
      setTimeout(() => {
        if (!document.hasFocus() && document.visibilityState === 'visible') report('WINDOW_BLUR');
      }, 150);
    };
    const onFs = () => {
      const inFs = Boolean(document.fullscreenElement);
      onFsRef.current(inFs);
      if (!inFs && requireFullscreen) report('FULLSCREEN_EXIT', 500);
    };
    const block = (type: LockdownEvent) => (e: Event) => {
      if (!blockCopyPaste) return;
      const target = e.target as HTMLElement | null;
      // Allow typing numbers in our own numeric input, but never clipboard.
      if (type === 'CONTEXT_MENU' || !target?.closest?.('[data-allow-clipboard]')) {
        e.preventDefault();
        report(type, 3000);
      }
    };
    const onCopy = block('COPY');
    const onPaste = block('PASTE');
    const onMenu = block('CONTEXT_MENU');
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const devtools =
        k === 'f12' ||
        (mod && e.shiftKey && ['i', 'j', 'c'].includes(k)) ||
        (mod && e.altKey && ['i', 'j'].includes(k));
      if (devtools) {
        e.preventDefault();
        report('DEVTOOLS');
        return;
      }
      if (blockCopyPaste && mod && ['c', 'v', 'x', 'a', 'p', 's', 'u'].includes(k)) {
        e.preventDefault();
        if (k === 'c' || k === 'x') report('COPY', 3000);
        if (k === 'v') report('PASTE', 3000);
      }
      if (k === 'printscreen') report('COPY', 3000);
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onMenu);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onMenu);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [active, requireFullscreen, blockCopyPaste]);
}

export async function enterFullscreen() {
  try {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* ignore */
  }
}
