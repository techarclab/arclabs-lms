import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-8">
      {breadcrumbs && (
        <nav className="mb-3 flex items-center gap-1.5 text-[13px] text-ink-500">
          {breadcrumbs.map((b, i) => (
            <span key={b.label} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="size-3.5 text-ink-300" />}
              {b.href ? (
                <Link href={b.href} className="transition hover:text-ink-900">
                  {b.label}
                </Link>
              ) : (
                <span className="text-ink-700">{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="mb-2">{eyebrow}</div>}
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink-900">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-[15px] text-ink-500">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}
