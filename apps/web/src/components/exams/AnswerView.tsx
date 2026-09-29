'use client';

import { useState } from 'react';
import { Check, PencilLine, Sparkles, X } from 'lucide-react';
import type { CodeLanguageName, ReviewItem } from '@arc/types';
import { LANGUAGE_LABEL } from './code/CodeEditor';
import { Button, cn } from '@arc/ui';

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

export function ReviewCard({
  item,
  index,
  onSetMarks,
}: {
  item: ReviewItem;
  index: number;
  /** Staff only: change (or clear, with null) this question's marks. */
  onSetMarks?: (marks: number | null) => Promise<void>;
}) {
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
          {item.type === 'CODING'
            ? !item.answered
              ? 'Not answered'
              : item.override !== undefined
                ? 'Marked by faculty'
                : item.pending
                  ? 'Being evaluated'
                  : item.ai
                    ? 'Marked by AI'
                    : `${item.testsPassed ?? 0} of ${item.testsTotal ?? 0} tests passed`
            : item.correct
              ? 'Correct'
              : item.answered
                ? 'Incorrect'
                : 'Not answered'}
        </span>
        <span className="tabular ml-auto text-sm font-semibold text-ink-700">
          {item.marks > 0 ? '+' : ''}
          {item.marks} / {item.points}
        </span>
        {onSetMarks && <MarksEditor item={item} onSave={onSetMarks} />}
      </div>
      <PromptText text={item.prompt} />
      {item.type === 'CODING' ? (
        <CodingReview item={item} />
      ) : item.type === 'NUMERIC' ? (
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

function MarksEditor({
  item,
  onSave,
}: {
  item: ReviewItem;
  onSave: (marks: number | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(item.marks));
  const [busy, setBusy] = useState(false);
  const save = async (m: number | null) => {
    setBusy(true);
    try {
      await onSave(m);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };
  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          setValue(String(item.marks));
          setOpen(true);
        }}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
      >
        <PencilLine className="size-3.5" /> Change
      </button>
    );
  const n = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(n) && n <= item.points;
  return (
    <span className="flex items-center gap-1.5">
      <input
        autoFocus
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-16 rounded-md border border-ink-300 px-2 text-sm"
        aria-label="Marks"
      />
      <Button size="sm" disabled={!valid} loading={busy} onClick={() => save(n)}>
        Save
      </Button>
      {item.override !== undefined && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(null)}>
          Undo
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </span>
  );
}

function AiBreakdown({ ai }: { ai: NonNullable<ReviewItem['ai']> }) {
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-violet-900">
        <Sparkles className="size-4" /> AI marking · {ai.awarded} / {ai.max}
      </p>
      <p
        className={cn(
          'mt-2 rounded-lg px-3 py-1.5 text-[12.5px]',
          ai.compiled ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800',
        )}
      >
        {ai.compiled
          ? 'Compiled successfully.'
          : `Did not compile — ${ai.penaltyPct}% of the marks were taken off.`}
      </p>
      {!ai.compiled && ai.compileError && (
        <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-ink-950 px-3 py-2 font-mono text-[11.5px] whitespace-pre-wrap text-rose-200">
          {ai.compileError}
        </pre>
      )}
      <ul className="mt-3 space-y-2">
        {ai.criteria.map((c, i) => (
          <li key={i} className="flex gap-3 text-[13px]">
            <span
              className={cn(
                'tabular mt-0.5 w-14 shrink-0 rounded-md px-1.5 py-0.5 text-center text-xs font-semibold',
                c.awarded >= c.points
                  ? 'bg-emerald-100 text-emerald-800'
                  : c.awarded > 0
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-800',
              )}
            >
              {c.awarded}/{c.points}
            </span>
            <span>
              <span className="font-medium text-ink-800">{c.text}</span>
              {c.comment && <span className="block text-ink-500">{c.comment}</span>}
            </span>
          </li>
        ))}
      </ul>
      {ai.feedback && <p className="mt-3 text-[13px] text-ink-700">{ai.feedback}</p>}
    </div>
  );
}

function CodingReview({ item }: { item: ReviewItem }) {
  const a = item.yourAnswer as { language?: string; code?: string } | null;
  const total = item.testsTotal ?? 0;
  const passed = item.testsPassed ?? 0;
  return (
    <div className="mt-4 space-y-3">
      {item.ai && <AiBreakdown ai={item.ai} />}
      {!item.ai && item.answered && !item.pending && total > 0 && (
        <div>
          <div className="flex h-2 overflow-hidden rounded-full bg-ink-100">
            <div
              className="bg-emerald-500"
              style={{ width: `${Math.round((passed / total) * 100)}%` }}
            />
          </div>
        </div>
      )}
      {item.pending && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          This code is waiting to be marked. The score updates once it’s evaluated.
        </p>
      )}
      {a?.code ? (
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
            Your code · {LANGUAGE_LABEL[a.language as CodeLanguageName] ?? a.language}
          </p>
          <pre className="max-h-80 overflow-auto rounded-xl bg-ink-950 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-ink-100">
            {a.code}
          </pre>
        </div>
      ) : (
        <p className="text-sm text-ink-500">No code was submitted.</p>
      )}
    </div>
  );
}
