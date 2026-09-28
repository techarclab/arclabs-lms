import { Building2, PauseCircle, PencilLine, PlayCircle, Sparkles } from 'lucide-react';
import type { ActivityItem } from '@arc/types';
import { EmptyState } from '@arc/ui';
import { timeAgo } from '@/lib/format';

function describe(a: ActivityItem) {
  const name = (a.meta.name as string) ?? a.organizationName ?? 'an organization';
  switch (a.action) {
    case 'organization.created':
      return {
        icon: Building2,
        tone: 'bg-brand-50 text-brand-600',
        text: (
          <>
            created <b className="font-medium text-ink-900">{name}</b>
          </>
        ),
      };
    case 'organization.updated':
      return {
        icon: PencilLine,
        tone: 'bg-sky-50 text-sky-600',
        text: (
          <>
            updated <b className="font-medium text-ink-900">{a.organizationName}</b>
          </>
        ),
      };
    case 'organization.status.suspended':
      return {
        icon: PauseCircle,
        tone: 'bg-rose-50 text-rose-600',
        text: (
          <>
            suspended <b className="font-medium text-ink-900">{a.organizationName}</b>
          </>
        ),
      };
    case 'organization.status.active':
      return {
        icon: PlayCircle,
        tone: 'bg-emerald-50 text-emerald-600',
        text: (
          <>
            reactivated <b className="font-medium text-ink-900">{a.organizationName}</b>
          </>
        ),
      };
    default:
      return {
        icon: Sparkles,
        tone: 'bg-ink-100 text-ink-600',
        text: <>{a.action.replaceAll('.', ' ')}</>,
      };
  }
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (!items.length) {
    return (
      <EmptyState
        icon={<Sparkles />}
        title="No activity yet"
        description="Actions like creating organizations and publishing courses will appear here."
        className="py-10"
      />
    );
  }
  return (
    <ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-ink-100">
      {items.map((a) => {
        const d = describe(a);
        const Icon = d.icon;
        return (
          <li key={a.id} className="relative flex gap-3.5">
            <span
              className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${d.tone}`}
            >
              <Icon className="size-4" strokeWidth={1.9} />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-[13.5px] leading-snug text-ink-600">
                <span className="font-medium text-ink-900">{a.actorName ?? 'System'}</span> {d.text}
              </p>
              <p className="mt-0.5 text-xs text-ink-400">{timeAgo(a.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
