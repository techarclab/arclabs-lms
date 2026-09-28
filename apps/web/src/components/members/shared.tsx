import { Badge } from '@arc/ui';
import type { MemberState } from '@arc/types';
import { ROLE_LABEL } from '@/lib/format';

export const ROLE_OPTIONS = [
  { value: 'LEARNER', label: 'Learner', hint: 'Takes courses, attempts quizzes, submits projects' },
  { value: 'INSTRUCTOR', label: 'Instructor', hint: 'Runs batches, takes attendance, grades work' },
  { value: 'EVALUATOR', label: 'Evaluator', hint: 'Reviews and scores projects and assignments' },
  {
    value: 'CONTENT_MANAGER',
    label: 'Content Manager',
    hint: 'Builds courses, lessons and question banks',
  },
  { value: 'ORG_ADMIN', label: 'Org Admin', hint: 'Full control of this organization' },
] as const;

const ROLE_TONE = {
  ORG_ADMIN: 'brand',
  CONTENT_MANAGER: 'info',
  INSTRUCTOR: 'violet',
  EVALUATOR: 'warning',
  LEARNER: 'neutral',
} as const;

export function RoleBadges({ roles }: { roles: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((r) => (
        <Badge key={r} tone={ROLE_TONE[r as keyof typeof ROLE_TONE] ?? 'neutral'}>
          {ROLE_LABEL[r] ?? r}
        </Badge>
      ))}
    </div>
  );
}

export function MemberStateBadge({ state }: { state: MemberState }) {
  const map = {
    ACTIVE: { tone: 'success', label: 'Active' },
    INVITED: { tone: 'warning', label: 'Invited' },
    INACTIVE: { tone: 'neutral', label: 'Deactivated' },
  } as const;
  const s = map[state];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}
