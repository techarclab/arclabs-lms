'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Hammer,
  Eye,
  EyeOff,
  FlaskConical,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import type {
  AiReview,
  CodeLanguageName,
  CodingMode,
  CodeRunnerStatus,
  CodingConfig,
  CompileCheckResponse,
  OutputCompare,
  RunCodeResponse,
} from '@arc/types';
import { Button, cn, Field, Input } from '@arc/ui';
import { useApi, useApiMutation } from '@/lib/use-api';
import { CodeEditor, LANGUAGE_LABEL } from './CodeEditor';
import { TestResults } from './TestResults';

export interface CodingDraft {
  languages: CodeLanguageName[];
  starter: Partial<Record<CodeLanguageName, string>>;
  tests: { id?: string; input: string; output: string; sample: boolean }[];
  timeLimitMs: string;
  solution: { language: CodeLanguageName; code: string };
  compare: OutputCompare;
  mode: CodingMode;
  rubric: { text: string; points: string }[];
  compilePenaltyPct: string;
}

export const C_STARTER = '#include <stdio.h>\n\nint main(void) {\n    \n    return 0;\n}\n';
export const ARDUINO_STARTER =
  'void setup() {\n  Serial.begin(9600);\n  \n}\n\nvoid loop() {\n  \n}\n';
const STARTERS: Record<CodeLanguageName, string> = {
  c: C_STARTER,
  python: '',
  arduino: ARDUINO_STARTER,
};

export function blankCoding(): CodingDraft {
  return {
    languages: ['c', 'python'],
    starter: { c: C_STARTER, python: '' },
    tests: [
      { input: '', output: '', sample: true },
      { input: '', output: '', sample: false },
    ],
    timeLimitMs: '2000',
    solution: { language: 'c', code: '' },
    compare: 'flexible',
    mode: 'tests',
    rubric: [],
    compilePenaltyPct: '25',
  };
}

export function codingFromQuestion(c: CodingConfig): CodingDraft {
  return {
    languages: c.languages,
    starter: {
      c: c.starter.c ?? '',
      python: c.starter.python ?? '',
      arduino: c.starter.arduino ?? '',
    },
    tests: c.testCases.length
      ? c.testCases.map((t) => ({ ...t }))
      : [
          { input: '', output: '', sample: true },
          { input: '', output: '', sample: false },
        ],
    timeLimitMs: String(c.timeLimitMs ?? 2000),
    solution: c.solution ?? { language: c.languages[0] ?? 'c', code: '' },
    compare: c.compare ?? 'exact',
    mode: c.mode ?? 'tests',
    rubric: (c.rubric ?? []).map((x) => ({ text: x.text, points: String(x.points) })),
    compilePenaltyPct: String(c.compilePenaltyPct ?? 25),
  };
}

export function codingToInput(d: CodingDraft) {
  return {
    languages: d.languages,
    starter: Object.fromEntries(d.languages.map((l) => [l, d.starter[l] ?? ''])),
    testCases: d.mode === 'ai' ? [] : d.tests,
    timeLimitMs: d.timeLimitMs,
    compare: d.compare,
    mode: d.mode,
    rubric: d.mode === 'ai' ? d.rubric.filter((x) => x.text.trim()) : [],
    compilePenaltyPct: d.compilePenaltyPct,
    solution: d.solution.code.trim() ? d.solution : null,
  };
}

const LANGS: CodeLanguageName[] = ['c', 'python', 'arduino'];

/** Author-side setup for a coding question: languages, starter code, test cases, solution check. */
export function CodingSetup({
  value,
  onChange,
  orgId,
  prompt = '',
}: {
  value: CodingDraft;
  onChange: (d: CodingDraft) => void;
  orgId: string;
  /** The question text (used when trying out AI marking). */
  prompt?: string;
}) {
  const mutate = useApiMutation();
  const { data: runner } = useApi<CodeRunnerStatus>('/code-runner/status');
  const [starterTab, setStarterTab] = useState<CodeLanguageName>(value.languages[0] ?? 'c');
  const [check, setCheck] = useState<RunCodeResponse | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const set = (patch: Partial<CodingDraft>) => onChange({ ...value, ...patch });
  const tab = value.languages.includes(starterTab) ? starterTab : (value.languages[0] ?? 'c');
  const ai = value.mode === 'ai';

  async function runCheck() {
    setChecking(true);
    setCheck(null);
    setCheckError(null);
    try {
      setCheck(
        await mutate<RunCodeResponse>(
          '/questions/check-code',
          'POST',
          {
            coding: {
              testCases: value.tests,
              timeLimitMs: value.timeLimitMs,
              compare: value.compare,
            },
            language: value.solution.language,
            code: value.solution.code,
          },
          orgId,
        ),
      );
    } catch (e) {
      setCheckError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-5">
      {runner && !runner.configured && (
        <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            No code runner is connected yet. You can create coding questions and run exams —
            students’ code is saved and graded automatically once a runner is connected (Exam
            results → “Evaluate coding answers”).
          </span>
        </div>
      )}

      {runner?.configured && runner.ready === false && (
        <div className="flex gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            The code runner is waking up — this takes about a minute after a quiet period. “Check
            test cases” will work once it’s ready.
          </span>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-sm font-medium text-ink-800">How is it marked?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ['tests', 'Test cases', 'Marks for each test the program passes (exact outputs).'],
              [
                'ai',
                'AI marking — no test cases',
                'Code is compiled, then AI marks it against your marking scheme. Any correct approach gets marks; partial work gets partial marks.',
              ],
            ] as const
          ).map(([m, title, desc]) => (
            <button
              key={m}
              type="button"
              onClick={() => set({ mode: m })}
              className={cn(
                'rounded-xl border p-3 text-left transition',
                value.mode === m
                  ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/15'
                  : 'border-ink-200 hover:bg-ink-50',
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                {m === 'ai' ? (
                  <Sparkles className="size-4 text-violet-600" />
                ) : (
                  <FlaskConical className="size-4 text-brand-600" />
                )}
                {title}
              </span>
              <span className="mt-1 block text-xs text-ink-500">{desc}</span>
            </button>
          ))}
        </div>
        {ai && runner && !runner.aiGrader && (
          <p className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            AI marking isn’t set up yet (AI_GRADER_API_KEY on the API). You can still create the
            question; answers are marked once it’s connected (Results → “Evaluate coding answers”).
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-800">Languages allowed</p>
          <div className="flex gap-2">
            {LANGS.map((l) => {
              const on = value.languages.includes(l);
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => {
                    const next = on
                      ? value.languages.filter((x) => x !== l)
                      : [...value.languages, l];
                    if (!next.length) return;
                    const starter = { ...value.starter };
                    if (!on && !starter[l]?.trim()) starter[l] = STARTERS[l];
                    const languages = LANGS.filter((x) => next.includes(x));
                    set({
                      languages,
                      starter,
                      solution: languages.includes(value.solution.language)
                        ? value.solution
                        : { language: languages[0]!, code: '' },
                    });
                  }}
                  className={cn(
                    'rounded-lg border px-4 py-1.5 text-sm font-medium transition',
                    on
                      ? 'border-brand-500 bg-brand-50 text-brand-800'
                      : 'border-ink-200 text-ink-500 hover:bg-ink-50',
                  )}
                >
                  {LANGUAGE_LABEL[l]}
                </button>
              );
            })}
          </div>
        </div>
        {!ai && (
          <Field label="Output check" htmlFor="q-cmp" className="w-72">
            <select
              id="q-cmp"
              value={value.compare}
              onChange={(e) => set({ compare: e.target.value as OutputCompare })}
              className="h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm"
            >
              <option value="flexible">Flexible — ignore spaces, case, 31 = 31.00</option>
              <option value="exact">Exact — character for character</option>
            </select>
          </Field>
        )}
        {!ai && (
          <Field label="Time limit per test (ms)" htmlFor="q-tl" className="w-48">
            <Input
              id="q-tl"
              inputMode="numeric"
              value={value.timeLimitMs}
              onChange={(e) => set({ timeLimitMs: e.target.value })}
            />
          </Field>
        )}
        {ai && (
          <Field label="If it doesn’t compile, take off (%)" htmlFor="q-pen" className="w-56">
            <Input
              id="q-pen"
              inputMode="numeric"
              value={value.compilePenaltyPct}
              onChange={(e) => set({ compilePenaltyPct: e.target.value })}
            />
          </Field>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center gap-3">
          <p className="text-sm font-medium text-ink-800">Starter code</p>
          <div className="flex gap-1 rounded-lg bg-ink-100 p-0.5">
            {value.languages.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setStarterTab(l)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium',
                  tab === l ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500',
                )}
              >
                {LANGUAGE_LABEL[l]}
              </button>
            ))}
          </div>
          <span className="text-xs text-ink-400">
            What students see when they open the question
          </span>
        </div>
        <CodeEditor
          key={tab}
          language={tab}
          height="170px"
          value={value.starter[tab] ?? ''}
          onChange={(v) => set({ starter: { ...value.starter, [tab]: v } })}
        />
      </div>

      {ai ? (
        <RubricEditor rubric={value.rubric} onChange={(rubric) => set({ rubric })} />
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-ink-800">Test cases</p>
            <p className="text-xs text-ink-500">
              Sample tests are shown to students and can be run during the exam. Hidden tests are
              only used for grading — marks are split equally across all tests.
            </p>
          </div>
          {value.languages.includes('arduino') && <ArduinoHelp />}
          {value.tests.map((t, i) => (
            <div key={i} className="rounded-xl border border-ink-200 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-semibold text-ink-800">Test {i + 1}</span>
                <button
                  type="button"
                  onClick={() =>
                    set({
                      tests: value.tests.map((x, j) => (j === i ? { ...x, sample: !x.sample } : x)),
                    })
                  }
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                    t.sample ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-600',
                  )}
                >
                  {t.sample ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                  {t.sample ? 'Sample (visible)' : 'Hidden'}
                </button>
                <button
                  type="button"
                  disabled={value.tests.length <= 2}
                  onClick={() => set({ tests: value.tests.filter((_, j) => j !== i) })}
                  className="ml-auto rounded-md p-1.5 text-ink-300 hover:bg-ink-100 hover:text-rose-600 disabled:opacity-30"
                  aria-label="Remove test"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['input', 'output'] as const).map((k) => (
                  <label key={k} className="block">
                    <span className="mb-1 block text-xs text-ink-500">
                      {k === 'input'
                        ? value.languages.includes('arduino')
                          ? 'Board setup (sensors, pins, time) / input'
                          : 'Input (stdin)'
                        : 'Expected output'}
                    </span>
                    <textarea
                      rows={value.languages.includes('arduino') ? 4 : 3}
                      spellCheck={false}
                      placeholder={
                        k === 'input'
                          ? value.languages.includes('arduino')
                            ? 'temp=31\nhumidity=70\ntime=5000'
                            : undefined
                          : value.solution.code.trim()
                            ? 'Leave empty — filled from the reference solution when you save'
                            : undefined
                      }
                      value={t[k]}
                      onChange={(e) =>
                        set({
                          tests: value.tests.map((x, j) =>
                            j === i ? { ...x, [k]: e.target.value } : x,
                          ),
                        })
                      }
                      className="w-full rounded-lg border border-ink-200 bg-ink-50/50 px-3 py-2 font-mono text-[13px] outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          {value.tests.length < 30 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                set({ tests: [...value.tests, { input: '', output: '', sample: false }] })
              }
            >
              <Plus /> Add test case
            </Button>
          )}
        </div>
      )}

      <div className="rounded-xl border border-ink-200 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-ink-800">Reference solution</p>
          <span className="text-xs text-ink-400">
            {ai
              ? 'Recommended — helps the AI mark fairly · never shown to students'
              : 'Optional · never shown to students'}
          </span>
          <select
            value={value.solution.language}
            onChange={(e) =>
              set({ solution: { ...value.solution, language: e.target.value as CodeLanguageName } })
            }
            className="ml-auto h-8 rounded-lg border border-ink-200 bg-white px-2 text-sm"
          >
            {value.languages.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABEL[l]}
              </option>
            ))}
          </select>
        </div>
        <CodeEditor
          key={`sol-${value.solution.language}`}
          language={value.solution.language}
          height="170px"
          value={value.solution.code}
          onChange={(v) => set({ solution: { ...value.solution, code: v } })}
        />
        <CompileCheck
          orgId={orgId}
          language={value.solution.language}
          code={value.solution.code}
          runnerReady={Boolean(runner?.configured)}
        />
        {ai ? (
          <AiTry orgId={orgId} prompt={prompt} value={value} aiReady={Boolean(runner?.aiGrader)} />
        ) : (
          <>
            <div className="mt-3 flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={checking}
                disabled={!value.solution.code.trim() || !runner?.configured}
                onClick={runCheck}
              >
                <FlaskConical /> Check test cases
              </Button>
              <span className="text-xs text-ink-500">
                {runner?.configured
                  ? 'Runs the solution against every test to confirm the expected outputs.'
                  : 'Available once a code runner is connected.'}
              </span>
            </div>
            {checkError && <p className="mt-3 text-[13px] text-rose-700">{checkError}</p>}
            {check && (
              <div className="mt-4 space-y-3">
                <TestResults results={check.results} />
                {check.results.some((r) => r.status === 'OK' && !r.passed) && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl bg-ink-50 px-4 py-3">
                    <p className="flex-1 text-[13px] text-ink-600">
                      Is the solution right and the expected outputs wrong (common for Arduino
                      tests)? Use what the solution printed as the expected output.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        set({
                          tests: value.tests.map((t, i) => {
                            const r = check.results[i];
                            return r && r.status === 'OK' ? { ...t, output: r.output } : t;
                          }),
                        });
                        setCheck(null);
                      }}
                    >
                      <Wand2 /> Use solution output as expected
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The marking scheme for AI-marked questions: what earns marks, and how many. */
function RubricEditor({
  rubric,
  onChange,
}: {
  rubric: { text: string; points: string }[];
  onChange: (r: { text: string; points: string }[]) => void;
}) {
  const rows = rubric.length ? rubric : [{ text: '', points: '' }];
  const total = rows.reduce((s, r) => s + (Number(r.points) || 0), 0);
  const put = (i: number, patch: Partial<{ text: string; points: string }>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-ink-800">Marking scheme</p>
        <p className="text-xs text-ink-500">
          What the code must do, and the marks for each part. The AI awards full, partial or zero
          marks per line; the question’s marks are scaled from this total.
        </p>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2.5 w-5 text-right text-xs font-semibold text-ink-400">{i + 1}.</span>
          <textarea
            rows={2}
            value={r.text}
            placeholder={
              i === 0
                ? 'e.g. Reads temperature and humidity from the DHT11 on pin 2 using the DHT library'
                : 'e.g. Turns the fan on pin 8 ON above 30 °C and OFF otherwise'
            }
            onChange={(e) => put(i, { text: e.target.value })}
            className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <Input
            aria-label="Marks"
            inputMode="decimal"
            value={r.points}
            placeholder="Marks"
            onChange={(e) => put(i, { points: e.target.value })}
            className="w-20"
          />
          <button
            type="button"
            disabled={rows.length <= 1}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="mt-1.5 rounded-md p-1.5 text-ink-300 hover:bg-ink-100 hover:text-rose-600 disabled:opacity-30"
            aria-label="Remove"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        {rows.length < 12 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange([...rows, { text: '', points: '' }])}
          >
            <Plus /> Add a marking point
          </Button>
        )}
        <span className="text-xs text-ink-500">
          Scheme total: <b className="text-ink-800">{total}</b>
        </span>
      </div>
    </div>
  );
}

/** Lets the author see how the AI would mark some code (the solution, or a weak answer). */
function AiTry({
  orgId,
  prompt,
  value,
  aiReady,
}: {
  orgId: string;
  prompt: string;
  value: CodingDraft;
  aiReady: boolean;
}) {
  const mutate = useApiMutation();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<AiReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const language = value.solution.language;
  const rubric = value.rubric
    .filter((r) => r.text.trim())
    .map((r) => ({ text: r.text, points: Number(r.points) || 0 }));

  async function tryIt(src: string) {
    setBusy(true);
    setError(null);
    setReview(null);
    try {
      setReview(
        await mutate<AiReview>(
          '/questions/ai-check',
          'POST',
          {
            prompt,
            rubric,
            compilePenaltyPct: value.compilePenaltyPct,
            solution: value.solution.code,
            language,
            code: src,
          },
          orgId,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl bg-violet-50/50 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-violet-900">
        <Sparkles className="size-4" /> Try the AI marking
      </p>
      <p className="text-xs text-ink-600">
        Paste a sample student answer (for example a half-finished one) to see the marks it would
        get. Nothing is saved.
      </p>
      <CodeEditor
        key={`try-${language}`}
        language={language}
        height="140px"
        value={code}
        onChange={setCode}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={busy}
          disabled={!aiReady || !rubric.length || !code.trim() || prompt.trim().length < 3}
          onClick={() => tryIt(code)}
        >
          <Sparkles /> Mark this code
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={
            busy ||
            !aiReady ||
            !rubric.length ||
            !value.solution.code.trim() ||
            prompt.trim().length < 3
          }
          onClick={() => tryIt(value.solution.code)}
        >
          Mark the reference solution
        </Button>
      </div>
      {!aiReady && (
        <p className="text-xs text-ink-500">Available once AI marking is set up on the API.</p>
      )}
      {error && <p className="text-[13px] text-rose-700">{error}</p>}
      {review && (
        <div className="rounded-lg border border-violet-200 bg-white p-3 text-[13px]">
          <p className="font-semibold text-ink-900">
            {review.awarded} / {review.max}
            {!review.compiled && (
              <span className="ml-2 font-normal text-rose-700">
                (doesn’t compile — {review.penaltyPct}% off)
              </span>
            )}
          </p>
          <ul className="mt-2 space-y-1">
            {review.criteria.map((c, i) => (
              <li key={i}>
                <b className="tabular">
                  {c.awarded}/{c.points}
                </b>{' '}
                {c.text}
                {c.comment && <span className="block pl-8 text-ink-500">{c.comment}</span>}
              </li>
            ))}
          </ul>
          {review.feedback && <p className="mt-2 text-ink-600">{review.feedback}</p>}
        </div>
      )}
    </div>
  );
}

/** "Check it compiles" — compiles the code on the code runner (nothing is run or saved). */
function CompileCheck({
  orgId,
  language,
  code,
  runnerReady,
}: {
  orgId: string;
  language: CodeLanguageName;
  code: string;
  runnerReady: boolean;
}) {
  const mutate = useApiMutation();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(CompileCheckResponse & { code: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stale = result && result.code !== code;

  async function check() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await mutate<CompileCheckResponse>(
        '/questions/compile-check',
        'POST',
        { language, code },
        orgId,
      );
      setResult({ ...r, code });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={busy}
          disabled={!code.trim() || !runnerReady}
          onClick={() => void check()}
        >
          <Hammer /> Check it compiles
        </Button>
        <span className="text-xs text-ink-500">
          {runnerReady
            ? `Compiles the reference solution on the code runner (${LANGUAGE_LABEL[language]}) — the same compiler students’ answers use.`
            : 'Available once a code runner is connected.'}
        </span>
      </div>
      {error && <p className="text-[13px] text-rose-700">{error}</p>}
      {result && (
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-[13px] ring-1',
            result.ok
              ? 'bg-emerald-50 text-emerald-800 ring-emerald-100'
              : 'bg-rose-50 text-rose-800 ring-rose-100',
            stale && 'opacity-60',
          )}
        >
          <p className="flex items-center gap-2 font-medium">
            {result.ok ? (
              <>
                <CheckCircle2 className="size-4" /> Compiles — no errors
              </>
            ) : (
              <>
                <AlertTriangle className="size-4" /> Does not compile
              </>
            )}
            <span className="font-normal text-ink-500">
              · {(result.timeMs / 1000).toFixed(1)} s
              {stale ? ' · code changed since — check again' : ''}
            </span>
          </p>
          {!result.ok && result.error && (
            <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-white/70 p-2 font-mono text-[12px] whitespace-pre-wrap text-rose-900">
              {result.error}
            </pre>
          )}
          {!result.ok && /No such file or directory/.test(result.error ?? '') && (
            <p className="mt-2 text-ink-600">
              A library header is missing on the code runner. If it is one the simulator supports
              (e.g. WiFi.h, ThingSpeak.h, PubSubClient.h), update the runner with{' '}
              <code className="font-mono">sudo arc-runner-setup</code> and check again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Cheat-sheet for the virtual Arduino board's test-case settings. */
function ArduinoHelp() {
  const rows: [string, string][] = [
    ['temp=31  humidity=70', 'DHT11 / DHT22 readings (dht=error → sensor fails)'],
    ['D2=LOW', 'Digital input on pin 2 (button, PIR, IR…); INPUT_PULLUP pins default HIGH'],
    ['A0=512', 'Analog input 0–1023 (LDR, LM35, potentiometer, soil, gas…)'],
    ['distance=25', 'HC-SR04 distance in cm (pulseIn returns the echo time)'],
    ['serial=5\\n', 'Text typed into the Serial Monitor'],
    ['@2000 D2=LOW', 'Change something at 2000 ms (button press, new temperature…)'],
    ['time=5000', 'How long the sketch runs (ms, default 3000) — delay() is simulated'],
    ['trace=D8', 'Also check pin D8 (LED/relay/buzzer/servo) — shown as “D8 HIGH” / “D8 LOW”'],
    [
      'trace_time=on',
      'Add the time to pin lines (“[2004 ms] D8 HIGH”) — only for timing questions',
    ],
    ['dht_pin=2', 'Only when students read the DHT by hand (bit-banging) on pin 2'],
  ];
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3 text-[13px]">
      <p className="flex items-center gap-2 font-semibold text-ink-900">
        <Cpu className="size-4 text-brand-600" /> Virtual Arduino board
      </p>
      <p className="mt-1 text-ink-600">
        Students write a normal sketch (setup/loop, DHT, Servo, LiquidCrystal / LiquidCrystal_I2C,
        Wire). Each test describes the board: one setting per line. Tests compare what the sketch
        prints on Serial, plus traced pins and the final LCD screen.
      </p>
      <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-[12px] text-brand-800">{k}</dt>
            <dd className="text-ink-600">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-ink-500">
        Easiest: leave “Expected output” empty and paste a reference solution — expected outputs are
        filled in from it automatically when you save.
      </p>
    </div>
  );
}
