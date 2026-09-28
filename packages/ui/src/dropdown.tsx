'use client';

import { DropdownMenu as M } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn';

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuGroup = M.Group;

export function DropdownMenuContent({
  className,
  align = 'end',
  sideOffset = 6,
  ...props
}: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-48 overflow-hidden rounded-xl border border-ink-200/80 bg-white p-1 shadow-xl shadow-ink-950/10 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownMenuItem({
  className,
  icon,
  danger,
  children,
  ...props
}: ComponentProps<typeof M.Item> & { icon?: ReactNode; danger?: boolean }) {
  return (
    <M.Item
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-700 outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-ink-100 data-[highlighted]:text-ink-900 [&_svg]:size-4 [&_svg]:text-ink-400',
        danger &&
          'text-rose-600 data-[highlighted]:bg-rose-50 data-[highlighted]:text-rose-700 [&_svg]:text-rose-500',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </M.Item>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof M.Label>) {
  return (
    <M.Label
      className={cn('px-2.5 pt-2 pb-1 text-xs font-medium text-ink-400', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn('my-1 h-px bg-ink-100', className)} {...props} />;
}
