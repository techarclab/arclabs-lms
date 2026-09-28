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
