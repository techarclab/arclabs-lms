'use client';

import { Switch as S } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from './cn';

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <S.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-ink-200 transition outline-none focus-visible:ring-3 focus-visible:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-brand-600"
    >
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  );
}

/** A labelled setting row with a switch on the right. */
export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
  icon,
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 py-3',
        disabled && 'cursor-not-allowed',
        className,
      )}
    >
      {icon && <span className="mt-0.5 text-ink-400 [&_svg]:size-[18px]">{icon}</span>}
      <span className="flex-1">
        <span className="block text-sm font-medium text-ink-900">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[13px] text-ink-500">{description}</span>
        )}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </label>
  );
}
