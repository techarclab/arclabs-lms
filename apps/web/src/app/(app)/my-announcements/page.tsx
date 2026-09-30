'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, BellRing, Megaphone } from 'lucide-react';
import type { MyAnnouncement } from '@arc/types';
import { Badge, Button, Card, cn, EmptyState, Skeleton } from '@arc/ui';
import { PageHeader } from '@/components/shell/PageHeader';
import { formatDateTime } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/use-api';

export default function MyAnnouncementsPage() {
  const mutate = useApiMutation();
  const { data, isLoading } = useApi<MyAnnouncement[]>('/my/announcements', {
    refreshInterval: 60_000,
  });
  const unread = (data ?? []).some((a) => !a.read);
  // Opening the page marks everything as read (the "New" labels stay until the next visit).
  useEffect(() => {
    if (unread) void mutate('/my/announcements/read', 'POST').catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Exam reminders and notices from your college. They are also sent to your college email."
      />
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      )}
      {data && data.length === 0 && (
        <Card>
          <EmptyState
            icon={<Megaphone />}
            title="No announcements yet"
            description="Exam reminders and notices from your college will appear here."
          />
        </Card>
      )}
      <div className="max-w-3xl space-y-3">
        {data?.map((a) => (
          <Card
            key={a.id}
            className={cn('p-5', !a.read && 'border-brand-200 ring-1 ring-brand-100')}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 [&_svg]:size-5',
                  a.kind === 'EXAM_REMINDER'
                    ? 'bg-brand-50 text-brand-600 ring-brand-100'
                    : 'bg-ink-50 text-ink-500 ring-ink-200',
                )}
              >
                {a.kind === 'EXAM_REMINDER' ? <BellRing /> : <Megaphone />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink-900">{a.subject}</h3>
                  {!a.read && <Badge tone="brand">New</Badge>}
                </div>
                <p className="text-[12.5px] text-ink-500">
                  {a.sentBy ? `${a.sentBy} · ` : ''}
                  {a.organizationName} · {formatDateTime(a.createdAt)}
                </p>
                <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink-700">
                  {a.body}
                </p>
                {a.linkUrl && (
                  <Button asChild size="sm" className="mt-4">
                    {a.linkUrl.startsWith('/') ? (
                      <Link href={a.linkUrl}>
                        {a.linkLabel ?? 'Open'} <ArrowRight />
                      </Link>
                    ) : (
                      <a href={a.linkUrl} target="_blank" rel="noopener noreferrer">
                        {a.linkLabel ?? 'Open'} <ArrowRight />
                      </a>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
