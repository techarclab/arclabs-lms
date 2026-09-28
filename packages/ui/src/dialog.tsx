'use client';

import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  icon,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-ink-950/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in" />
      <D.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl shadow-ink-950/20 outline-none data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95',
          className,
        )}
      >
        <div className="flex items-start gap-4 px-6 pt-6 pb-2">
          {icon && (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 [&_svg]:size-5">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <D.Title className="text-lg font-semibold text-ink-900">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-sm text-ink-500">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close className="-mt-1 -mr-2 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
