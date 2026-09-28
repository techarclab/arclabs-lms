import { Badge, cn } from '@arc/ui';
import type { DifficultyName, ExamState } from '@arc/types';
import { QUESTION_TYPE_LABEL } from '@/lib/format';

export function ExamStateBadge({ state, className }: { state: ExamState; className?: string }) {
  if (state === 'LIVE') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 ring-inset',
          className,
        )}
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
        </span>
        Live
      </span>
    );
  }
  const map = {
    DRAFT: { tone: 'neutral', label: 'Draft' },
    SCHEDULED: { tone: 'info', label: 'Scheduled' },
    ENDED: { tone: 'violet', label: 'Ended' },
  } as const;
  return (
    <Badge tone={map[state].tone} className={className}>
      {map[state].label}
    </Badge>
  );
}

export function DifficultyBadge({ difficulty }: { difficulty: DifficultyName }) {
  const tone = ({ EASY: 'success', MEDIUM: 'warning', HARD: 'danger' } as const)[difficulty];
  return <Badge tone={tone}>{difficulty.charAt(0) + difficulty.slice(1).toLowerCase()}</Badge>;
}

export function QuestionTypeBadge({ type }: { type: string }) {
  return <Badge tone="neutral">{QUESTION_TYPE_LABEL[type] ?? type}</Badge>;
}
