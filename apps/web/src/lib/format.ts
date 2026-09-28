const nf = new Intl.NumberFormat('en-IN');

export const formatNumber = (n: number) => nf.format(n);

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return formatDate(iso);
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export const ORG_TYPE_LABEL: Record<string, string> = {
  PLATFORM: 'Platform',
  SCHOOL: 'School',
  COLLEGE: 'College',
  COMPANY: 'Company',
  OTHER: 'Other',
};

export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ORG_ADMIN: 'Org Admin',
  CONTENT_MANAGER: 'Content Manager',
  INSTRUCTOR: 'Instructor',
  EVALUATOR: 'Evaluator',
  LEARNER: 'Learner',
};

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDuration(totalSec: number | null | undefined) {
  if (totalSec === null || totalSec === undefined) return '—';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

/** "in 2h 5m" / "3d" style relative time until a future instant. */
export function timeUntil(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));
  const d = Math.floor(s / 86400);
  if (d) return `${d}d ${Math.floor((s % 86400) / 3600)}h`;
  const h = Math.floor(s / 3600);
  if (h) return `${h}h ${Math.floor((s % 3600) / 60)}m`;
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}

/** ISO → value for <input type="datetime-local"> in the browser's timezone. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const QUESTION_TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: 'Single choice',
  MULTIPLE_CHOICE: 'Multiple choice',
  TRUE_FALSE: 'True / False',
  NUMERIC: 'Numeric',
  CODING: 'Coding',
  SHORT_ANSWER: 'Short answer',
};

export const SUBMIT_REASON_LABEL: Record<string, string> = {
  MANUAL: 'Submitted',
  TIME_UP: 'Time up',
  VIOLATIONS: 'Violations',
  WINDOW_CLOSED: 'Window closed',
  INSTRUCTOR: 'Ended by instructor',
};

/** One-line preview of a question prompt: drops ``` fences and collapses whitespace. */
export function plainPrompt(text: string) {
  return text
    .replace(/```[a-z]*\n?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
