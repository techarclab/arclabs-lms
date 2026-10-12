'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Award,
  Bell,
  CalendarClock,
  ClipboardCheck,
  Megaphone,
  Radio,
  type LucideIcon,
} from 'lucide-react';
import type { NotificationFeed, NotificationKind } from '@arc/types';
import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@arc/ui';
import { useApi, useApiMutation } from '@/lib/use-api';

const ICON: Record<NotificationKind, { icon: LucideIcon; tone: string }> = {
  ANNOUNCEMENT: { icon: Megaphone, tone: 'bg-brand-50 text-brand-600' },
  EXAM_LIVE: { icon: Radio, tone: 'bg-rose-50 text-rose-600' },
  EXAM_SOON: { icon: CalendarClock, tone: 'bg-amber-50 text-amber-600' },
  RESULT: { icon: Award, tone: 'bg-emerald-50 text-emerald-600' },
  STAFF_EXAM_LIVE: { icon: Radio, tone: 'bg-rose-50 text-rose-600' },
  STAFF_MARKING: { icon: ClipboardCheck, tone: 'bg-violet-50 text-violet-600' },
};

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 0) return 'soon';
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/**
 * The bell in the top bar: live and upcoming exams, results, announcements, and (for faculty)
 * live exams and coding answers waiting to be marked. Opening it marks everything as seen.
 */
export function NotificationBell() {
  const mutate = useApiMutation();
  const { data, mutate: reload } = useApi<NotificationFeed>('/notifications', {
    refreshInterval: 120_000,
    revalidateOnFocus: true,
  });
  const unread = data?.unread ?? 0;
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o || !unread) return;
        // Keep the "new" dots while the list is open; clear the badge on the server.
        void mutate('/notifications/seen', 'POST').then(() =>
          reload((d) => (d ? { ...d, unread: 0 } : d), { revalidate: false }),
        );
      }}
    >
      <DropdownMenuTrigger
        className="relative rounded-lg p-2 text-ink-500 transition outline-none hover:bg-ink-100 hover:text-ink-800 focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
      >
        <Bell className="size-5" strokeWidth={1.8} />
        {unread > 0 && (
          <span className="tabular absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <p className="text-sm font-semibold text-ink-900">Notifications</p>
          {unread > 0 && <span className="text-xs text-ink-500">{unread} new</span>}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {!data ? (
            <p className="px-4 py-8 text-center text-sm text-ink-400">Loading…</p>
          ) : !data.items.length ? (
            <div className="px-4 py-10 text-center">
              <Bell className="mx-auto size-6 text-ink-300" />
              <p className="mt-2 text-sm text-ink-500">You’re all caught up.</p>
            </div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {data.items.map((n) => {
                const { icon: Icon, tone } = ICON[n.kind];
                const inner = (
                  <div className="flex gap-3 px-4 py-3">
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-lg',
                        tone,
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-[13px] leading-snug text-ink-900',
                          n.unread && 'font-semibold',
                        )}
                      >
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{n.body}</p>
                      )}
                      <p className="mt-1 text-[11px] text-ink-400">{ago(n.at)}</p>
                    </div>
                    {n.unread && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" />
                    )}
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={() => setOpen(false)}
                        className="block transition hover:bg-ink-50"
                      >
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
