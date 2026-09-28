'use client';

import { useEffect, useRef, useState } from 'react';
import { Info, Loader2, Play, RotateCcw } from 'lucide-react';
import type { CodeLanguageName, DeliveredQuestion, RunCodeResponse } from '@arc/types';
import { Button, cn } from '@arc/ui';
import { ApiError } from '@/lib/api';
import { CodeEditor, LANGUAGE_LABEL } from './CodeEditor';
import { TestResults } from './TestResults';

type CodeAnswer = { language: CodeLanguageName; code: string };

/** Student's coding workspace inside the exam: editor, sample tests, custom input, Run. */
export function CodingAnswer({
  question,
  answer,
  onChange,
  onRun,
}: {
  question: DeliveredQuestion;
  answer: CodeAnswer | null | undefined;
  onChange: (a: CodeAnswer) => void;
  onRun: (body: {
    language: CodeLanguageName;
    code: string;
    stdin?: string;
  }) => Promise<RunCodeResponse>;
}) {
  const c = question.coding!;
  const [language, setLanguage] = useState<CodeLanguageName>(answer?.language ?? c.languages[0]!);
  // Keep a draft per language so switching doesn't throw away work.
  const drafts = useRef<Partial<Record<CodeLanguageName, string>>>(
    answer ? { [answer.language]: answer.code } : {},
  );
  const [code, setCode] = useState(answer?.code ?? c.starter[language] ?? '');
  const [tab, setTab] = useState<'samples' | 'custom'>('samples');
  const [stdin, setStdin] = useState(c.samples[0]?.input ?? '');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunCodeResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setRunError(null);
  }, [question.id]);

  const edit = (v: string) => {
    setCode(v);
    drafts.current[language] = v;
    onChange({ language, code: v });
  };

  const switchLanguage = (l: CodeLanguageName) => {
    if (l === language) return;
    drafts.current[language] = code;
    const next = drafts.current[l] ?? c.starter[l] ?? '';
    setLanguage(l);
    setCode(next);
    setResult(null);
    onChange({ language: l, code: next });
  };

  async function run() {
    setRunning(true);
    setRunError(null);
    setResult(null);
    try {
      setResult(await onRun({ language, code, ...(tab === 'custom' ? { stdin } : {}) }));
    } catch (e) {
      const code = e instanceof ApiError ? e.body?.error.code : undefined;
      setRunError(
        code === 'RUNNER_UNAVAILABLE'
          ? 'Running code isn’t available right now. Your code is saved and will be checked when you submit.'
          : (e as Error).message,
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {c.languages.length > 1 ? (
          <div className="flex gap-1 rounded-lg bg-ink-100 p-0.5">
            {c.languages.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => switchLanguage(l)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-semibold transition',
                  language === l
                    ? 'bg-white text-ink-900 shadow-sm'
                    : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {LANGUAGE_LABEL[l]}
              </button>
            ))}
          </div>
        ) : (
          <span className="rounded-md bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">
            {LANGUAGE_LABEL[language]}
          </span>
        )}
        <button
          type="button"
          onClick={() => edit(c.starter[language] ?? '')}
          className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink-500 hover:bg-ink-100"
        >
          <RotateCcw className="size-3.5" /> Reset code
        </button>
      </div>

      <CodeEditor key={language} language={language} value={code} onChange={edit} height="380px" />

      <div className="rounded-2xl border border-ink-200">
        <div className="flex items-center gap-1 border-b border-ink-100 px-3 pt-2">
          {(
            [
              ['samples', `Sample tests (${c.samples.length})`],
              ['custom', 'Custom input'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
                tab === k ? 'border-brand-600 text-ink-900' : 'border-transparent text-ink-500',
              )}
            >
              {label}
            </button>
          ))}
          <Button
            size="sm"
            className="my-1 ml-auto"
            onClick={run}
            disabled={running || !code.trim()}
          >
            {running ? <Loader2 className="animate-spin" /> : <Play />} Run code
          </Button>
        </div>
        <div className="space-y-3 p-4">
          {tab === 'samples' ? (
            !result &&
            c.samples.map((s, i) => (
              <div key={i} className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                    Sample {i + 1} · input
                  </p>
                  <pre className="rounded-lg bg-ink-50 px-3 py-2 font-mono text-[12.5px] whitespace-pre-wrap">
                    {s.input || ' '}
                  </pre>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                    Expected output
                  </p>
                  <pre className="rounded-lg bg-ink-50 px-3 py-2 font-mono text-[12.5px] whitespace-pre-wrap">
                    {s.output || ' '}
                  </pre>
                </div>
              </div>
            ))
          ) : (
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                Input (stdin)
              </span>
              <textarea
                data-allow-typing
                rows={3}
                spellCheck={false}
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                className="w-full rounded-lg border border-ink-200 bg-ink-50/50 px-3 py-2 font-mono text-[13px] outline-none focus:border-brand-500"
              />
            </label>
          )}
          {runError && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              {runError}
            </p>
          )}
          {result && <TestResults results={result.results} />}
          <p className="flex items-start gap-2 text-xs text-ink-500">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {c.hiddenCount} hidden test{c.hiddenCount === 1 ? '' : 's'} will check your code after
            you submit. Marks are given for each test passed. Time limit {c.timeLimitMs / 1000}s per
            test.
          </p>
        </div>
      </div>
    </div>
  );
}
