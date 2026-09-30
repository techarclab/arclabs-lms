'use client';

import { useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import type { MaterialActivityReport, MaterialActivityRow } from '@arc/types';
import { Avatar, cn, Dialog, DialogContent, Progress, Skeleton } from '@arc/ui';
import { timeAgo } from '@/lib/format';
import { useApi } from '@/lib/use-api';

export function ActivityDialog({
  materialId,
  orgId,
  onClose,
}: {
  materialId: string | null;
  orgId: string;
  onClose: () => void;
}) {
  const { data } = useApi<MaterialActivityReport>(
    materialId ? `/materials/${materialId}/activity` : null,
    { orgId },
  );
  const [tab, setTab] = useState<'opened' | 'not'>('opened');
  const r = data && data.materialId === materialId ? data : null;
  const pct = r && r.assigned ? Math.round((r.opened.length / r.assigned) * 100) : 0;
  const downloads = r?.opened.filter((x) => x.downloads > 0).length ?? 0;
  const rows = r ? (tab === 'opened' ? r.opened : r.notOpened) : [];

  function csv() {
    if (!r) return;
    const all = [...r.opened, ...r.notOpened];
    const q = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['Name', 'Roll no.', 'Department', 'Email', 'Views', 'Downloads', 'Last opened']
        .map(q)
        .join(','),
      ...all.map((x) =>
        [x.fullName, x.externalId, x.department, x.email, x.views, x.downloads, x.lastAt ?? '']
          .map(q)
          .join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${r.title.replace(/[^\w-]+/g, '_')}_activity.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Dialog open={Boolean(materialId)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={r?.title ?? 'Activity'}
        description="Who opened and downloaded this material."
        icon={<BarChart3 />}
        className="max-w-2xl"
      >
        <div className="px-6 pt-3 pb-6">
          {!r ? (
            <Skeleton className="h-48 rounded-xl" />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Shared with" value={r.assigned} />
                <Stat label="Opened" value={r.opened.length} sub={`${pct}%`} />
                <Stat label="Downloaded" value={downloads} />
              </div>
              <Progress value={pct} className="mt-4" tone="emerald" />
              <div className="mt-5 flex items-center justify-between">
                <div className="flex gap-1 rounded-lg bg-ink-100 p-1 text-[13px] font-medium">
                  {(
                    [
                      ['opened', `Opened (${r.opened.length})`],
                      ['not', `Not yet (${r.notOpened.length})`],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setTab(k)}
                      className={cn(
                        'rounded-md px-3 py-1.5 transition',
                        tab === k
                          ? 'bg-white text-ink-900 shadow-sm'
                          : 'text-ink-500 hover:text-ink-800',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={csv}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-600 hover:underline"
                >
                  <Download className="size-3.5" /> CSV
                </button>
              </div>
              <div className="mt-3 max-h-[45vh] divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-200">
                {rows.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-ink-500">
                    {tab === 'opened' ? 'Nobody has opened it yet.' : 'Everyone has opened it.'}
                  </p>
                ) : (
                  rows.map((x) => <Row key={x.userId} x={x} />)
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-ink-200 px-4 py-3">
      <p className="text-[12px] text-ink-500">{label}</p>
      <p className="tabular mt-0.5 text-xl font-semibold text-ink-900">
        {value}
        {sub && <span className="ml-1.5 text-sm font-medium text-ink-400">{sub}</span>}
      </p>
    </div>
  );
}

function Row({ x }: { x: MaterialActivityRow }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Avatar name={x.fullName} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-900">{x.fullName}</p>
        <p className="truncate text-[12px] text-ink-500">
          {[x.externalId, x.department].filter(Boolean).join(' · ') || x.email}
        </p>
      </div>
      {x.lastAt && (
        <div className="text-right text-[12px] text-ink-500">
          <p>
            {x.views} view{x.views === 1 ? '' : 's'} · {x.downloads} download
            {x.downloads === 1 ? '' : 's'}
          </p>
          <p>{timeAgo(x.lastAt)}</p>
        </div>
      )}
    </div>
  );
}
