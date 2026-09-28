import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, cn, Skeleton } from '@arc/ui';

const tones = {
  brand: 'bg-brand-50 text-brand-600 ring-brand-100',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100',
  sky: 'bg-sky-50 text-sky-600 ring-sky-100',
  rose: 'bg-rose-50 text-rose-600 ring-rose-100',
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'brand',
  footer,
  loading,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: keyof typeof tones;
  footer?: ReactNode;
  loading?: boolean;
}) {
  return (
    <Card className="group relative overflow-hidden p-5 transition hover:shadow-md hover:shadow-ink-900/[0.04]">
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-medium text-ink-500">{label}</p>
        <span
          className={cn('flex size-9 items-center justify-center rounded-xl ring-1', tones[tone])}
        >
          <Icon className="size-[18px]" strokeWidth={1.9} />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <p className="tabular mt-2 text-2xl leading-none sm:text-[28px] font-semibold tracking-tight text-ink-900">
          {value}
        </p>
      )}
      {footer && <div className="mt-3 text-[12.5px] text-ink-500">{footer}</div>}
    </Card>
  );
}
