'use client';

import { Tabs as T } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof T.List>) {
  return (
    <T.List
      className={cn('flex items-center gap-6 border-b border-ink-200', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        '-mb-px inline-flex items-center gap-2 border-b-2 border-transparent pb-3 text-sm font-medium text-ink-500 transition outline-none hover:text-ink-800 data-[state=active]:border-brand-600 data-[state=active]:text-ink-900 [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  );
}
