'use client';

import { useEffect, useState } from 'react';
import { Check, CircleHelp, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { QuestionItem } from '@arc/types';
import { questionInputSchema } from '@arc/validation';
import { Button, cn, Dialog, DialogContent, Field, Input, Textarea } from '@arc/ui';
import { useApiMutation } from '@/lib/use-api';
import {
  blankCoding,
  codingFromQuestion,
  CodingSetup,
  codingToInput,
  type CodingDraft,
} from './code/CodingSetup';

type EditableType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'NUMERIC' | 'CODING';
type Opt = { id?: string; text: string; correct: boolean };

const TYPES: { value: EditableType; label: string }[] = [
  { value: 'SINGLE_CHOICE', label: 'Single choice' },
  { value: 'MULTIPLE_CHOICE', label: 'Multiple choice' },
  { value: 'TRUE_FALSE', label: 'True / False' },
  { value: 'NUMERIC', label: 'Numeric' },
  { value: 'CODING', label: 'Coding' },
];

const blankOptions = (): Opt[] => [
  { text: '', correct: true },
  { text: '', correct: false },
  { text: '', correct: false },
  { text: '', correct: false },
];

export function QuestionEditor({
  open,
  onOpenChange,
  orgId,
  question,
  topics,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orgId: string;
  question?: QuestionItem | null;
  topics: string[];
  onSaved: (q: QuestionItem) => void;
}) {
  const mutate = useApiMutation();
  const [type, setType] = useState<EditableType>('SINGLE_CHOICE');
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<Opt[]>(blankOptions());
  const [tfAnswer, setTfAnswer] = useState(true);
  const [value, setValue] = useState('');
  const [tolerance, setTolerance] = useState('0');
  const [explanation, setExplanation] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [points, setPoints] = useState('1');
  const [negativeMarks, setNegativeMarks] = useState('0');
  const [coding, setCoding] = useState<CodingDraft>(blankCoding);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (question) {
      const t = question.type as EditableType;
      setType(t);
      setPrompt(question.prompt);
      const key = Array.isArray(question.correctAnswer) ? (question.correctAnswer as string[]) : [];
      setOptions(
        t === 'SINGLE_CHOICE' || t === 'MULTIPLE_CHOICE'
          ? question.options.map((o) => ({ id: o.id, text: o.text, correct: key.includes(o.id) }))
          : blankOptions(),
      );
      setTfAnswer(key[0] !== 'false');
      const num = question.correctAnswer as { value?: number; tolerance?: number };
      setValue(t === 'NUMERIC' ? String(num.value ?? '') : '');
      setTolerance(t === 'NUMERIC' ? String(num.tolerance ?? 0) : '0');
      setExplanation(question.explanation ?? '');
      setTopic(question.topic ?? '');
      setDifficulty(question.difficulty);
      setPoints(String(question.points));
      setNegativeMarks(String(question.negativeMarks));
      setCoding(question.coding ? codingFromQuestion(question.coding) : blankCoding());
    } else {
      setCoding(blankCoding());
      setPrompt('');
      setOptions(blankOptions());
      setExplanation('');
      setValue('');
      setTolerance('0');
      setError(null);
    }
  }, [open, question]);

  function buildInput() {
    const base = {
      prompt,
      explanation: explanation || null,
      topic: topic || null,
      difficulty,
      points,
      negativeMarks,
    };
    if (type === 'TRUE_FALSE') return { type, ...base, answer: tfAnswer };
    if (type === 'NUMERIC') return { type, ...base, value, tolerance };
    if (type === 'CODING')
      return { type, ...base, negativeMarks: 0, coding: codingToInput(coding) };
    return { type, ...base, options: options.filter((o) => o.text.trim()) };
  }

  async function save(addAnother: boolean) {
    const parsed = questionInputSchema.safeParse(buildInput());
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the question');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const q = question
        ? await mutate<QuestionItem>(`/questions/${question.id}`, 'PUT', parsed.data, orgId)
        : await mutate<QuestionItem>('/questions', 'POST', parsed.data, orgId);
      toast.success(question ? 'Question updated' : 'Question added to the bank');
      onSaved(q);
      if (addAnother && !question) {
        setPrompt('');
        setOptions(blankOptions());
        setExplanation('');
        setValue('');
        setCoding(blankCoding());
      } else onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const setCorrect = (i: number) =>
    setOptions((os) =>
      os.map((o, j) =>
        type === 'SINGLE_CHOICE'
          ? { ...o, correct: i === j }
          : i === j
            ? { ...o, correct: !o.correct }
            : o,
      ),
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={question ? 'Edit question' : 'New question'}
        icon={<CircleHelp />}
        className={type === 'CODING' ? 'max-w-4xl' : 'max-w-2xl'}
      >
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 pt-4 pb-6">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-ink-100 p-1 sm:grid-cols-5">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                disabled={Boolean(question)}
                onClick={() => {
                  setType(t.value);
                  if (t.value === 'CODING' && points === '1') setPoints('10');
                  if (t.value === 'SINGLE_CHOICE')
                    setOptions((os) =>
                      os.map((o, i) => ({
                        ...o,
                        correct:
                          i ===
                          Math.max(
                            0,
                            os.findIndex((x) => x.correct),
                          ),
                      })),
                    );
                }}
                className={cn(
                  'rounded-lg px-3 py-2 text-[13px] font-medium transition disabled:cursor-not-allowed',
                  type === t.value
                    ? 'bg-white text-ink-900 shadow-sm'
                    : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <Field
            label="Question"
            htmlFor="q-prompt"
            hint="Tip: wrap code in ``` to show it in a monospace block."
          >
            <Textarea
              id="q-prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                type === 'CODING'
                  ? 'Describe the task, the input format and the expected output format…'
                  : 'e.g. Which ESP32 pin supports capacitive touch?'
              }
            />
          </Field>

          {(type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE') && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink-800">
                Options{' '}
                <span className="font-normal text-ink-500">
                  —{' '}
                  {type === 'SINGLE_CHOICE'
                    ? 'click the circle to mark the correct answer'
                    : 'tick every correct answer'}
                </span>
              </p>
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCorrect(i)}
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center border-2 transition',
                      type === 'SINGLE_CHOICE' ? 'rounded-full' : 'rounded-md',
                      o.correct
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-ink-300 hover:border-ink-400',
                    )}
                    aria-label={`Mark option ${i + 1} correct`}
                  >
                    {o.correct && <Check className="size-3.5" strokeWidth={3} />}
                  </button>
                  <span className="w-5 text-sm font-medium text-ink-400">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <Input
                    value={o.text}
                    onChange={(e) =>
                      setOptions((os) =>
                        os.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                      )
                    }
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    className={cn(o.correct && 'border-emerald-300 bg-emerald-50/40')}
                  />
                  <button
                    type="button"
                    disabled={options.length <= 2}
                    onClick={() => setOptions((os) => os.filter((_, j) => j !== i))}
                    className="rounded-md p-1.5 text-ink-300 hover:bg-ink-100 hover:text-rose-600 disabled:opacity-30"
                    aria-label="Remove option"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              {options.length < 8 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOptions((os) => [...os, { text: '', correct: false }])}
                >
                  <Plus /> Add option
                </Button>
              )}
            </div>
          )}

          {type === 'TRUE_FALSE' && (
            <div className="grid grid-cols-2 gap-3">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setTfAnswer(v)}
                  className={cn(
                    'rounded-xl border px-4 py-3 text-sm font-medium transition',
                    tfAnswer === v
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-3 ring-emerald-500/10'
                      : 'border-ink-200 text-ink-600 hover:bg-ink-50',
                  )}
                >
                  Correct answer: {v ? 'True' : 'False'}
                </button>
              ))}
            </div>
          )}

          {type === 'NUMERIC' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Correct value" htmlFor="q-val">
                <Input
                  id="q-val"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. 150"
                />
              </Field>
              <Field label="Accepted ± tolerance" htmlFor="q-tol" hint="0 = exact match">
                <Input
                  id="q-tol"
                  inputMode="decimal"
                  value={tolerance}
                  onChange={(e) => setTolerance(e.target.value)}
                />
              </Field>
            </div>
          )}

          {type === 'CODING' && (
            <CodingSetup value={coding} onChange={setCoding} orgId={orgId} prompt={prompt} />
          )}

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Topic" htmlFor="q-topic" className="sm:col-span-2">
              <Input
                id="q-topic"
                list="topic-list"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. GPIO, Sensors, C basics"
              />
              <datalist id="topic-list">
                {topics.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Marks" htmlFor="q-pts">
              <Input
                id="q-pts"
                inputMode="numeric"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
            </Field>
            {type === 'CODING' ? (
              <p className="self-end pb-2 text-xs text-ink-500">
                Split across test cases · no negative marks
              </p>
            ) : (
              <Field label="Negative" htmlFor="q-neg" hint="If enabled on the exam">
                <Input
                  id="q-neg"
                  inputMode="decimal"
                  value={negativeMarks}
                  onChange={(e) => setNegativeMarks(e.target.value)}
                />
              </Field>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-ink-800">Difficulty</p>
            <div className="flex gap-2">
              {(['EASY', 'MEDIUM', 'HARD'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={cn(
                    'rounded-lg border px-4 py-1.5 text-sm font-medium transition',
                    difficulty === d
                      ? {
                          EASY: 'border-emerald-400 bg-emerald-50 text-emerald-800',
                          MEDIUM: 'border-amber-400 bg-amber-50 text-amber-800',
                          HARD: 'border-rose-400 bg-rose-50 text-rose-800',
                        }[d]
                      : 'border-ink-200 text-ink-500 hover:bg-ink-50',
                  )}
                >
                  {d.charAt(0) + d.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <Field
            label="Explanation"
            htmlFor="q-exp"
            optional
            hint="Shown to students when answers are revealed."
          >
            <Textarea
              id="q-exp"
              rows={2}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </Field>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-ink-100 bg-ink-50/60 px-6 py-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!question && (
            <Button variant="secondary" loading={busy} onClick={() => save(true)}>
              Save & add another
            </Button>
          )}
          <Button loading={busy} onClick={() => save(false)}>
            {question ? 'Save changes' : 'Save question'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
