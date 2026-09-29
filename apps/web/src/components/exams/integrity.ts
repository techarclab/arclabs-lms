'use client';

/**
 * Checks for common ways of getting AI help during an online exam that a web page can detect:
 *
 * - a second monitor (an AI chat open on the other screen)
 * - browser extensions that inject panels / buttons into the page (AI sidebars and "answer this"
 *   helpers such as Sider, Monica, MaxAI, Merlin, HARPA, Grammarly…)
 *
 * Switching to another window or app (desktop AI apps, the browser's own AI side panel) is caught
 * separately by the lockdown's focus checks. Nothing here reads the student's screen or files.
 */

/** True when the device is using more than one display (Chrome / Edge). */
export function hasExtraScreens(): boolean {
  try {
    return (window.screen as Screen & { isExtended?: boolean }).isExtended === true;
  } catch {
    return false;
  }
}

const SAFE_TAGS = new Set([
  'HEAD',
  'BODY',
  'SCRIPT',
  'STYLE',
  'LINK',
  'META',
  'NOSCRIPT',
  'TEMPLATE',
  'NEXT-ROUTE-ANNOUNCER',
  'NEXTJS-PORTAL', // Next.js dev overlay
]);

/**
 * Elements created by the app carry React's internal keys. Extension content scripts run in an
 * isolated world, so anything they insert has none — that's how we tell them apart.
 */
function isOurs(el: Element): boolean {
  if (SAFE_TAGS.has(el.tagName)) return true;
  for (const k in el) if (k.startsWith('__react')) return true;
  return false;
}

function describe(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const cls =
    typeof el.className === 'string' && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
      : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 120);
}

/** Top-level elements that something other than the exam page added (browser extensions). */
export function findInjectedElements(): string[] {
  const found: string[] = [];
  const scan = (parent: Element | null) => {
    if (!parent) return;
    for (const el of Array.from(parent.children)) {
      if (isOurs(el)) continue;
      // Hidden, empty helper nodes some extensions leave behind aren't a panel anyone can use.
      const r = el.getBoundingClientRect();
      const visible =
        el.shadowRoot !== null || (r.width > 0 && r.height > 0) || el.tagName.includes('-');
      if (visible) found.push(describe(el));
    }
  };
  scan(document.documentElement);
  scan(document.body);
  return found;
}

/** Calls `onFound` whenever an extension adds something to the page. Returns a stop function. */
export function watchInjections(onFound: (what: string) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const check = () => {
    timer = null;
    const f = findInjectedElements();
    if (f.length) onFound(f.join(', ').slice(0, 200));
  };
  const obs = new MutationObserver(() => {
    if (!timer) timer = setTimeout(check, 300);
  });
  obs.observe(document.documentElement, { childList: true });
  if (document.body) obs.observe(document.body, { childList: true });
  return () => {
    obs.disconnect();
    if (timer) clearTimeout(timer);
  };
}
