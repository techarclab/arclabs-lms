'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, cn } from '@arc/ui';

/** Splits a list into pages of `size` (default 10). `page` is 0-based and clamped. */
export function paginate<T>(items: T[], page: number, size = 10) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { rows: items.slice(p * size, p * size + size), page: p, pages, from: p * size };
}

/** "Showing 11–20 of 72   ‹ Previous  2 / 8  Next ›" — hidden when everything fits on one page. */
export function Pager({
  page,
  pages,
  total,
  size = 10,
  onChange,
  className,
}: {
  page: number;
  pages: number;
  total: number;
  size?: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  if (pages <= 1) return null;
  const from = page * size + 1;
  const to = Math.min(total, from + size - 1);
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-6 py-3 text-sm',
        className,
      )}
    >
      <span className="tabular text-ink-500">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 0}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft /> Previous
        </Button>
        <span className="tabular px-1 text-ink-700">
          {page + 1} / {pages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages - 1}
          onClick={() => onChange(page + 1)}
        >
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
