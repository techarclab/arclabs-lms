'use client';

import { Check } from 'lucide-react';
import { cn } from '@arc/ui';
import { ROLE_OPTIONS } from './shared';

export function RolePicker({
  value,
  onChange,
  canGrantAdmin,
  compact,
}: {
  value: string[];
  onChange: (roles: string[]) => void;
  canGrantAdmin: boolean;
  compact?: boolean;
}) {
  const toggle = (r: string) =>
    onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r]);
  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}>
      {ROLE_OPTIONS.filter((o) => canGrantAdmin || o.value !== 'ORG_ADMIN').map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={cn(
              'flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left transition',
              on
                ? 'border-brand-500 bg-brand-50/60 ring-3 ring-brand-500/10'
                : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition',
                on ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300 bg-white',
              )}
            >
              {on && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span>
              <span className="block text-sm font-medium text-ink-900">{o.label}</span>
              <span className="block text-xs text-ink-500">{o.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
