'use client';

import { useEffect, useRef } from 'react';

export type LockdownEvent =
  | 'FULLSCREEN_EXIT'
  | 'TAB_HIDDEN'
  | 'WINDOW_BLUR'
  | 'COPY'
  | 'PASTE'
  | 'CONTEXT_MENU'
  | 'DEVTOOLS'
  | 'SHORTCUT'
  | 'CAMERA_OFF';

/** Keys a student may press anywhere on the exam page (answering and moving around only). */
const PLAIN_ALLOWED = new Set([
  'Tab',
  'Enter',
  ' ',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Shift',
  'CapsLock',
]);
/** Extra keys allowed while typing in an answer box (numeric answers). */
const TYPING_ALLOWED = new Set(['Backspace', 'Delete', 'Home', 'End']);

type KeyboardLock = { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void };
const keyboard = () =>
  (typeof navigator !== 'undefined'
    ? (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard
    : undefined) ?? undefined;

/** In full screen, Chrome/Edge let the page capture Esc, Alt+Tab, the Windows key, Ctrl+W, etc. */
export function lockKeyboard() {
  try {
    void keyboard()
      ?.lock?.()
      .catch(() => {});
  } catch {
    /* not supported (Firefox/Safari) — the keydown blocker below still applies */
  }
}
export function unlockKeyboard() {
  try {
    keyboard()?.unlock?.();
  } catch {
    /* ignore */
  }
}

/**
 * Browser lockdown for a running exam:
 * - every keyboard shortcut is swallowed (Ctrl/Alt/⌘ combos, F-keys, Esc, context-menu key), with
 *   the Keyboard Lock API capturing system shortcuts in full screen where the browser supports it
 * - copy/cut/paste, right-click, text selection, dragging, zoom and back-navigation are blocked
 * - leaving full screen, switching tab/window, devtools attempts are reported via `onEvent`
 *   (client-side throttled; the server applies its own debounce and is the source of truth)
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
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const inTypingBox = (t: EventTarget | null) =>
      Boolean((t as HTMLElement | null)?.closest?.('[data-allow-typing]'));

    if (document.fullscreenElement) lockKeyboard();

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') report('TAB_HIDDEN');
    };
    const onBlur = () => {
      // Only count when the document really lost focus (not our own dialogs).
      setTimeout(() => {
        if (!document.hasFocus() && document.visibilityState === 'visible') report('WINDOW_BLUR');
      }, 150);
    };
    const onFs = () => {
      const inFs = Boolean(document.fullscreenElement);
      onFsRef.current(inFs);
      if (inFs) lockKeyboard();
      else {
        unlockKeyboard();
        if (requireFullscreen) report('FULLSCREEN_EXIT', 500);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const lower = k.toLowerCase();
      const mod = e.ctrlKey || e.metaKey || e.altKey;
      if (!mod) {
        if (PLAIN_ALLOWED.has(k)) return;
        if (inTypingBox(e.target) && (k.length === 1 || TYPING_ALLOWED.has(k))) return;
        if (k.length === 1) return; // plain letters outside inputs do nothing — harmless
      }
      // Anything else is a shortcut: Ctrl/Alt/⌘ combos, F1–F12, Esc, Backspace-navigation, etc.
      stop(e);
      const devtools =
        lower === 'f12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c', 'k'].includes(lower)) ||
        (e.metaKey && e.altKey && ['i', 'j', 'c'].includes(lower)) ||
        ((e.ctrlKey || e.metaKey) && lower === 'u');
      if (devtools) return report('DEVTOOLS');
      if ((e.ctrlKey || e.metaKey) && (lower === 'c' || lower === 'x')) return report('COPY', 3000);
      if ((e.ctrlKey || e.metaKey) && lower === 'v') return report('PASTE', 3000);
      if (!['Escape', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown'].includes(k))
        report('SHORTCUT', 5000);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        report('SHORTCUT', 3000);
        void navigator.clipboard?.writeText?.('').catch(() => {});
      }
    };

    const onClipboard = (type: LockdownEvent) => (e: Event) => {
      if (!blockCopyPaste) return;
      stop(e);
      report(type, 3000);
    };
    const onCopy = onClipboard('COPY');
    const onPaste = onClipboard('PASTE');
    const onMenu = (e: Event) => {
      stop(e);
      report('CONTEXT_MENU', 3000);
    };
    const noDefault = (e: Event) => {
      if (!inTypingBox(e.target)) e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault(); // pinch / Ctrl+scroll zoom
    };
    const onMouseNav = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) stop(e); // mouse back / forward buttons
    };
    // Trap the browser's back button: keep a history entry to bounce back onto.
    // Keep the router's own state so Next.js treats the entry as one of its own.
    const trap = () =>
      history.pushState({ ...(history.state ?? {}), examLock: true }, '', location.href);
    trap();
    const onPop = () => {
      trap();
      report('SHORTCUT', 3000);
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    const opts = { capture: true } as const;
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('keydown', onKey, opts);
    window.addEventListener('keyup', onKeyUp, opts);
    document.addEventListener('copy', onCopy, opts);
    document.addEventListener('cut', onCopy, opts);
    document.addEventListener('paste', onPaste, opts);
    document.addEventListener('contextmenu', onMenu, opts);
    document.addEventListener('selectstart', noDefault, opts);
    document.addEventListener('dragstart', noDefault, opts);
    document.addEventListener('drop', noDefault, opts);
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    window.addEventListener('mouseup', onMouseNav, opts);
    window.addEventListener('auxclick', onMouseNav, opts);
    window.addEventListener('popstate', onPop);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      unlockKeyboard();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('keydown', onKey, opts);
      window.removeEventListener('keyup', onKeyUp, opts);
      document.removeEventListener('copy', onCopy, opts);
      document.removeEventListener('cut', onCopy, opts);
      document.removeEventListener('paste', onPaste, opts);
      document.removeEventListener('contextmenu', onMenu, opts);
      document.removeEventListener('selectstart', noDefault, opts);
      document.removeEventListener('dragstart', noDefault, opts);
      document.removeEventListener('drop', noDefault, opts);
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('mouseup', onMouseNav, opts);
      window.removeEventListener('auxclick', onMouseNav, opts);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [active, requireFullscreen, blockCopyPaste]);
}

export async function enterFullscreen() {
  try {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    lockKeyboard();
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen() {
  unlockKeyboard();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* ignore */
  }
}
