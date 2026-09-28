'use client';

import { CheckCircle2, Clock, TerminalSquare, XCircle } from 'lucide-react';
import type { TestRunResult } from '@arc/types';
import { cn } from '@arc/ui';

const STATUS_LABEL: Record<string, string> = {
  OK: 'Ran successfully',
  COMPILE_ERROR: 'Compilation error',
  RUNTIME_ERROR: 'Runtime error',
  TIME_LIMIT: 'Time limit exceeded',
  MEMORY_LIMIT: 'Memory limit exceeded',
  INTERNAL_ERROR: 'Runner error',
};

function Block({ label, text, tone }: { label: string; text: string; tone?: 'error' }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">{label}</p>
      <pre
        className={cn(
          'max-h-40 overflow-auto rounded-lg px-3 py-2 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap',
          tone === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-ink-50 text-ink-800',
        )}
      >
        {text === '' ? <span className="text-ink-400 italic">(empty)</span> : text}
      </pre>
    </div>
  );
}

/** Results of running code against sample tests or custom input. */
export function TestResults({ results }: { results: TestRunResult[] }) {
  const compile = results.find((r) => r.status === 'COMPILE_ERROR');
  if (compile) {
    return (
      <div className="rounded-xl border border-rose-200 bg-white p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-rose-700">
          <XCircle className="size-4" /> Compilation error
        </p>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-rose-50 px-3 py-2 font-mono text-[12.5px] whitespace-pre-wrap text-rose-800">
          {compile.error}
        </pre>
      </div>
    );
  }
  const graded = results.filter((r) => r.passed !== null);
  const passed = graded.filter((r) => r.passed).length;
  return (
    <div className="space-y-3">
      {graded.length > 0 && (
        <p
          className={cn(
            'text-sm font-semibold',
            passed === graded.length ? 'text-emerald-700' : 'text-rose-700',
          )}
        >
          {passed} of {graded.length} test{graded.length === 1 ? '' : 's'} passed
        </p>
      )}
      {results.map((r, i) => (
        <div
          key={i}
          className={cn(
            'rounded-xl border bg-white p-4',
            r.passed === null
              ? 'border-ink-200'
              : r.passed
                ? 'border-emerald-200'
                : 'border-rose-200',
          )}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            {r.passed === null ? (
              <TerminalSquare className="size-4 text-ink-500" />
            ) : r.passed ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : (
              <XCircle className="size-4 text-rose-600" />
            )}
            <span className="font-semibold text-ink-900">
              {r.passed === null ? 'Your input' : `Test ${i + 1}`}
            </span>
            <span className="text-ink-500">· {STATUS_LABEL[r.status] ?? r.status}</span>
            {r.timeMs !== null && (
              <span className="ml-auto flex items-center gap-1 text-xs text-ink-400">
                <Clock className="size-3" /> {r.timeMs} ms
              </span>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Block label="Input" text={r.input} />
            {r.expected !== null && <Block label="Expected output" text={r.expected} />}
            <Block label="Your output" text={r.output} />
          </div>
          {r.error && r.status !== 'OK' && (
            <div className="mt-3">
              <Block label="Error" text={r.error} tone="error" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
