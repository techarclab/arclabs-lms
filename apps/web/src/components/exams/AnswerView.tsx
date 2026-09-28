import { Check, X } from 'lucide-react';
import type { ReviewItem } from '@arc/types';
import { cn } from '@arc/ui';

/** Renders prompt text with ``` code blocks in monospace. */
export function PromptText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/```(?:[a-z]*\n)?/);
  return (
    <div
      className={cn(
        'space-y-2 text-[15px] leading-relaxed whitespace-pre-wrap text-ink-900',
        className,
      )}
    >
      {parts.map((p, i) =>
        i % 2 ? (
          <pre
            key={i}
            className="overflow-x-auto rounded-lg bg-ink-950 px-4 py-3 font-mono text-[13px] leading-relaxed text-ink-100"
          >
            {p.replace(/\n$/, '')}
          </pre>
        ) : (
          p && <p key={i}>{p}</p>
        ),
      )}
    </div>
  );
}

export function ReviewCard({ item, index }: { item: ReviewItem; index: number }) {
  const key = Array.isArray(item.correctAnswer) ? (item.correctAnswer as string[]) : [];
  const yours = Array.isArray(item.yourAnswer)
    ? (item.yourAnswer as string[])
    : typeof item.yourAnswer === 'string'
      ? [item.yourAnswer]
      : [];
  const num = item.correctAnswer as { value?: number; tolerance?: number };
  return (
    <div
      className={cn(
        'rounded-2xl border bg-white p-5',
        item.correct ? 'border-emerald-200' : item.answered ? 'border-rose-200' : 'border-ink-200',
      )}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-lg text-xs font-semibold',
            item.correct
              ? 'bg-emerald-100 text-emerald-700'
              : item.answered
                ? 'bg-rose-100 text-rose-700'
                : 'bg-ink-100 text-ink-600',
          )}
        >
          {index + 1}
        </span>
        <span
          className={cn(
            'text-xs font-semibold',
            item.correct ? 'text-emerald-700' : item.answered ? 'text-rose-700' : 'text-ink-500',
          )}
        >
          {item.correct ? 'Correct' : item.answered ? 'Incorrect' : 'Not answered'}
        </span>
        <span className="tabular ml-auto text-sm font-semibold text-ink-700">
          {item.marks > 0 ? '+' : ''}
          {item.marks} / {item.points}
        </span>
      </div>
      <PromptText text={item.prompt} />
      {item.type === 'NUMERIC' ? (
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <p className="rounded-lg bg-ink-50 px-3 py-2">
            Your answer:{' '}
            <b className={item.correct ? 'text-emerald-700' : 'text-rose-700'}>
              {item.yourAnswer === null ? '—' : String(item.yourAnswer)}
            </b>
          </p>
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
            Correct: <b>{num.value}</b>
            {num.tolerance ? ` (±${num.tolerance})` : ''}
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {item.options.map((o) => {
            const isKey = key.includes(o.id);
            const picked = yours.includes(o.id);
            return (
              <li
                key={o.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm',
                  isKey
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                    : picked
                      ? 'border-rose-300 bg-rose-50 text-rose-900'
                      : 'border-ink-200 text-ink-700',
                )}
              >
                <span className="flex-1">{o.text}</span>
                {picked && <span className="text-xs font-medium">Your answer</span>}
                {isKey ? (
                  <Check className="size-4 text-emerald-600" />
                ) : picked ? (
                  <X className="size-4 text-rose-600" />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {item.explanation && (
        <div className="mt-4 rounded-xl bg-brand-50/60 px-4 py-3 text-sm text-ink-700">
          <b className="font-medium text-brand-800">Explanation.</b> {item.explanation}
        </div>
      )}
    </div>
  );
}
