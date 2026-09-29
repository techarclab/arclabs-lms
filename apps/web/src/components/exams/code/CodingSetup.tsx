'use client';

import { useState } from 'react';
import { AlertTriangle, Cpu, Eye, EyeOff, FlaskConical, Plus, Trash2, Wand2 } from 'lucide-react';
import type { CodeLanguageName, CodeRunnerStatus, CodingConfig, RunCodeResponse } from '@arc/types';
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
    tests: c.testCases.map((t) => ({ ...t })),
    timeLimitMs: String(c.timeLimitMs ?? 2000),
    solution: c.solution ?? { language: c.languages[0] ?? 'c', code: '' },
  };
}

export function codingToInput(d: CodingDraft) {
  return {
    languages: d.languages,
    starter: Object.fromEntries(d.languages.map((l) => [l, d.starter[l] ?? ''])),
    testCases: d.tests,
    timeLimitMs: d.timeLimitMs,
    solution: d.solution.code.trim() ? d.solution : null,
  };
}

const LANGS: CodeLanguageName[] = ['c', 'python', 'arduino'];

/** Author-side setup for a coding question: languages, starter code, test cases, solution check. */
export function CodingSetup({
  value,
  onChange,
  orgId,
}: {
  value: CodingDraft;
  onChange: (d: CodingDraft) => void;
  orgId: string;
}) {
  const mutate = useApiMutation();
  const { data: runner } = useApi<CodeRunnerStatus>('/code-runner/status');
  const [starterTab, setStarterTab] = useState<CodeLanguageName>(value.languages[0] ?? 'c');
  const [check, setCheck] = useState<RunCodeResponse | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const set = (patch: Partial<CodingDraft>) => onChange({ ...value, ...patch });
  const tab = value.languages.includes(starterTab) ? starterTab : (value.languages[0] ?? 'c');

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
            coding: { testCases: value.tests, timeLimitMs: value.timeLimitMs },
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
        <Field label="Time limit per test (ms)" htmlFor="q-tl" className="w-48">
          <Input
            id="q-tl"
            inputMode="numeric"
            value={value.timeLimitMs}
            onChange={(e) => set({ timeLimitMs: e.target.value })}
          />
        </Field>
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

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-ink-800">Test cases</p>
          <p className="text-xs text-ink-500">
            Sample tests are shown to students and can be run during the exam. Hidden tests are only
            used for grading — marks are split equally across all tests.
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
                      k === 'input' && value.languages.includes('arduino')
                        ? 'temp=31\nhumidity=70\ntime=5000'
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

      <div className="rounded-xl border border-ink-200 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-ink-800">Reference solution</p>
          <span className="text-xs text-ink-400">Optional · never shown to students</span>
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
                  Is the solution right and the expected outputs wrong (common for Arduino tests)?
                  Use what the solution printed as the expected output.
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
      </div>
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
    ['trace=D8', 'Also check pin D8 (LED/relay/buzzer/servo) — shown as “[1000 ms] D8 HIGH”'],
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
        Tip: write the reference solution, press “Check test cases”, then “Use solution output as
        expected”.
      </p>
    </div>
  );
}
