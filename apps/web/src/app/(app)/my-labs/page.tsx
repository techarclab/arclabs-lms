'use client';

import { CalendarDays, ClipboardCheck, MessageSquareQuote } from 'lucide-react';
import type { MyLabResult } from '@arc/types';
import { Badge, Card, cn, EmptyState, Skeleton } from '@arc/ui';
import { PageHeader } from '@/components/shell/PageHeader';
import { formatDate } from '@/lib/format';
import { useApi } from '@/lib/use-api';

export default function MyLabsPage() {
  const { data, isLoading } = useApi<MyLabResult[]>('/my/labs', { refreshInterval: 60_000 });

  return (
    <>
      <PageHeader
        title="Lab marks"
        description="Marks from your offline labs and project reviews, criterion by criterion."
      />
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      )}
      {data && data.length === 0 && (
        <Card>
          <EmptyState
            icon={<ClipboardCheck />}
            title="No lab marks yet"
            description="When your faculty enter marks for a lab or project review, they appear here."
          />
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.map((l) => (
          <LabCard key={l.id} l={l} />
        ))}
      </div>
    </>
  );
}

function LabCard({ l }: { l: MyLabResult }) {
  const pct = l.total !== null && l.maxTotal ? Math.round((l.total / l.maxTotal) * 100) : null;
  const avgPct =
    l.classAverage !== null && l.maxTotal ? Math.round((l.classAverage / l.maxTotal) * 100) : null;
  const tone =
    pct === null
      ? 'text-ink-400'
      : pct >= 75
        ? 'text-emerald-600'
        : pct >= 50
          ? 'text-amber-600'
          : 'text-rose-600';
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-ink-900">{l.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-ink-500">
            {l.heldOn && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" /> {formatDate(l.heldOn)}
              </span>
            )}
            <span>{l.organizationName}</span>
          </p>
        </div>
        <div className="text-right">
          {l.absent ? (
            <Badge tone="warning">Absent</Badge>
          ) : (
            <>
              <p className={cn('tabular text-2xl font-semibold', tone)}>
                {l.total ?? '–'}
                <span className="text-sm font-medium text-ink-400">/{l.maxTotal}</span>
              </p>
              {pct !== null && <p className="tabular text-[12px] text-ink-500">{pct}%</p>}
            </>
          )}
        </div>
      </div>

      {l.description && <p className="mt-3 text-[13px] text-ink-600">{l.description}</p>}

      {!l.absent && (
        <div className="mt-4 space-y-2.5">
          {l.criteria.map((c) => {
            const v = l.scores[c.id];
            const w = typeof v === 'number' && c.max ? (v / c.max) * 100 : 0;
            return (
              <div key={c.id}>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="text-ink-700">{c.text}</span>
                  <span className="tabular font-medium text-ink-900">
                    {v ?? '–'}
                    <span className="text-ink-400">/{c.max}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${w}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {l.remarks && (
        <p className="mt-4 flex gap-2 rounded-xl bg-ink-50 px-3 py-2.5 text-[13px] text-ink-700">
          <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-ink-400" />
          {l.remarks}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 text-[12.5px] text-ink-500">
        <span>
          Class average{' '}
          <b className="tabular text-ink-800">
            {l.classAverage ?? '–'}/{l.maxTotal}
          </b>
          {avgPct !== null && <> ({avgPct}%)</>}
        </span>
        {l.highest !== null && (
          <span>
            Highest <b className="tabular text-ink-800">{l.highest}</b>
          </span>
        )}
      </div>
    </Card>
  );
}
