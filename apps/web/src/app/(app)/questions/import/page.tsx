'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  FileText,
  FileUp,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ImportedQuestion, ImportParseResult, ImportableType } from '@arc/types';
import { splitForImport } from '@arc/validation';
import { Badge, Button, Card, cn, Field, Input, Select, Textarea } from '@arc/ui';
import { extractText } from '@/components/exams/import/extract-text';
import { OrgRequired } from '@/components/shell/OrgRequired';
import { PageHeader } from '@/components/shell/PageHeader';
import { useApiMutation } from '@/lib/use-api';

export default function ImportQuestionsPage() {
  return (
    <OrgRequired
      title="Import questions"
      description="Add many questions at once from a PDF or Word file."
      permission="quiz.author"
    >
      {(org) => <Importer orgId={org.id} />}
    </OrgRequired>
  );
}

type Draft = ImportedQuestion & { key: string; include: boolean };
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

const TYPE_LABEL: Record<ImportableType, string> = {
  SINGLE_CHOICE: 'Single choice',
  MULTIPLE_CHOICE: 'Multiple choice',
  TRUE_FALSE: 'True / False',
  NUMERIC: 'Numeric',
};

let seq = 0;
const newKey = () => `d${++seq}`;

/** What's missing before this draft can be saved (null = ready). */
function problem(d: Draft): string | null {
  if (d.type === 'UNSUPPORTED') return 'Descriptive question — can’t be auto-marked';
  if (d.prompt.trim().length < 3) return 'Write the question';
  if (d.type === 'SINGLE_CHOICE' || d.type === 'MULTIPLE_CHOICE') {
    const opts = d.options.filter((o) => o.text.trim());
    if (opts.length < 2) return 'Needs at least two options';
    const c = opts.filter((o) => o.correct).length;
    if (d.type === 'SINGLE_CHOICE' && c !== 1)
      return c ? 'Mark only one correct option' : 'Mark the correct option';
    if (d.type === 'MULTIPLE_CHOICE' && c < 1) return 'Mark the correct options';
  }
  if (d.type === 'TRUE_FALSE' && d.answer === null) return 'Choose True or False';
  if (d.type === 'NUMERIC' && (d.value === null || !Number.isFinite(d.value)))
    return 'Enter the correct number';
  return null;
}

function toInput(
  d: Draft,
  defaults: { topic: string; difficulty: Difficulty; points: number; negative: number },
) {
  const base = {
    prompt: d.prompt.trim(),
    explanation: d.explanation?.trim() || null,
    points: d.points ?? defaults.points,
    negativeMarks: defaults.negative,
    difficulty: d.difficulty ?? defaults.difficulty,
    topic: defaults.topic.trim() || d.topic || null,
    tags: [],
  };
  switch (d.type) {
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE':
      return {
        ...base,
        type: d.type,
        options: d.options
          .filter((o) => o.text.trim())
          .map((o) => ({ text: o.text.trim(), correct: o.correct })),
      };
    case 'TRUE_FALSE':
      return { ...base, type: d.type, answer: d.answer };
    case 'NUMERIC':
      return { ...base, type: d.type, value: d.value, tolerance: 0 };
    default:
      return null;
  }
}

function Importer({ orgId }: { orgId: string }) {
  const router = useRouter();
  const mutate = useApiMutation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [pasted, setPasted] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [useAi, setUseAi] = useState(true);
  const [fillAnswers, setFillAnswers] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; step: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [method, setMethod] = useState<'ai' | 'rules' | 'mixed' | null>(null);
  const [filter, setFilter] = useState<'all' | 'fix' | 'dup' | 'ai'>('all');
  const [defaults, setDefaults] = useState({
    topic: '',
    difficulty: 'MEDIUM' as Difficulty,
    points: 1,
    negative: 0,
  });
  const [saving, setSaving] = useState(false);

  async function read(text: string) {
    setError(null);
    setDrafts(null);
    const parts = splitForImport(text);
    const all: Draft[] = [];
    const msgs = new Set<string>();
    const methods = new Set<string>();
    try {
      for (let i = 0; i < parts.length; i++) {
        setProgress({
          done: i,
          total: parts.length,
          step: useAi ? 'AI is reading the questions' : 'Reading the questions',
        });
        const r = await mutate<ImportParseResult>(
          '/questions/import/parse',
          'POST',
          { text: parts[i], useAi, fillAnswers: useAi && fillAnswers },
          orgId,
        );
        methods.add(r.method);
        if (r.note) msgs.add(r.note);
        for (const q of r.questions)
          all.push({ ...q, key: newKey(), include: q.type !== 'UNSUPPORTED' && !q.duplicate });
      }
      if (!all.length) {
        setError(
          'No questions were found. Make sure each question starts with a number (1. / Q1) and options with A) B) C) D) — or turn on AI reading.',
        );
        return;
      }
      setDrafts(all);
      setNotes([...msgs]);
      setMethod(methods.size > 1 ? 'mixed' : (([...methods][0] as 'ai' | 'rules') ?? null));
      setFilter('all');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setProgress({ done: 0, total: 1, step: 'Opening the file' });
    try {
      const text = await extractText(file);
      await read(text);
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
    }
  }

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((ds) => ds && ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const stats = useMemo(() => {
    const ds = drafts ?? [];
    const sel = ds.filter((d) => d.include);
    return {
      total: ds.length,
      selected: sel.length,
      fix: ds.filter((d) => d.type !== 'UNSUPPORTED' && problem(d)).length,
      selectedBad: sel.filter((d) => problem(d)).length,
      dup: ds.filter((d) => d.duplicate).length,
      ai: ds.filter((d) => d.answerByAi).length,
      unsupported: ds.filter((d) => d.type === 'UNSUPPORTED').length,
    };
  }, [drafts]);

  const shown = (drafts ?? []).filter((d) =>
    filter === 'fix'
      ? d.type !== 'UNSUPPORTED' && problem(d)
      : filter === 'dup'
        ? d.duplicate
        : filter === 'ai'
          ? d.answerByAi
          : true,
  );

  async function save() {
    if (!drafts) return;
    const sel = drafts.filter((d) => d.include);
    const bad = sel.find((d) => problem(d));
    if (bad) {
      setFilter('all');
      document.getElementById(bad.key)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast.error(`Fix question ${drafts.indexOf(bad) + 1}: ${problem(bad)}`);
      return;
    }
    setSaving(true);
    try {
      let created = 0;
      let skipped = 0;
      // Up to 300 per request
      for (let i = 0; i < sel.length; i += 300) {
        const r = await mutate<{ created: number; skipped: number }>(
          '/questions/bulk',
          'POST',
          {
            questions: sel.slice(i, i + 300).map((d) => toInput(d, defaults)),
            skipDuplicates: true,
          },
          orgId,
        );
        created += r.created;
        skipped += r.skipped;
      }
      toast.success(
        `${created} question${created === 1 ? '' : 's'} added to the bank${skipped ? ` · ${skipped} already there` : ''}`,
      );
      router.push('/questions');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Question bank', href: '/questions' }, { label: 'Import' }]}
        title="Import questions"
        description="Upload a question paper (PDF or Word). The questions, options and answers are read for you — check them, then add them all to the bank at once."
      />

      {!drafts && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card className="p-6">
            <div className="mb-5 grid max-w-sm grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1 text-sm font-medium">
              {(
                [
                  ['file', 'Upload file', FileUp],
                  ['paste', 'Paste text', ClipboardPaste],
                ] as const
              ).map(([k, label, Icon]) => (
                <button
                  key={k}
                  onClick={() => setMode(k)}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg py-2 transition',
                    mode === k
                      ? 'bg-white text-ink-900 shadow-sm'
                      : 'text-ink-500 hover:text-ink-800',
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>

            {progress ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Loader2 className="size-7 animate-spin text-brand-600" />
                <p className="font-medium text-ink-900">{progress.step}…</p>
                {progress.total > 1 && (
                  <p className="text-sm text-ink-500">
                    Part {progress.done + 1} of {progress.total}
                  </p>
                )}
                {fileName && <p className="text-[13px] text-ink-400">{fileName}</p>}
              </div>
            ) : mode === 'file' ? (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.txt,application/pdf"
                  onChange={(e) => {
                    void pick(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    void pick(e.dataTransfer.files?.[0]);
                  }}
                  className={cn(
                    'flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition',
                    dragging
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-ink-200 hover:border-brand-400 hover:bg-ink-50',
                  )}
                >
                  <Upload className="size-8 text-ink-400" />
                  <span className="text-[15px] font-medium text-ink-800">
                    Drop the question paper here or <span className="text-brand-600">browse</span>
                  </span>
                  <span className="text-[13px] text-ink-500">
                    PDF or Word (.docx) · read in your browser
                  </span>
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <Textarea
                  rows={14}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder={
                    '1. Which pin of DHT11 is used for data?\nA) Pin 1\nB) Pin 2\nC) Pin 3\nD) Pin 4\nAnswer: B\n\n2. I2C uses two wires. (True/False)\nAnswer: True'
                  }
                  className="font-mono text-[13px]"
                />
                <div className="flex justify-end">
                  <Button onClick={() => void read(pasted)} disabled={pasted.trim().length < 10}>
                    <Sparkles /> Read questions
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <p className="mt-4 flex gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}
          </Card>

          <div className="space-y-4">
            <Card className="space-y-4 p-5">
              <p className="text-sm font-semibold text-ink-900">Reading</p>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={useAi}
                  onChange={(e) => setUseAi(e.target.checked)}
                  className="mt-0.5 size-4 accent-brand-600"
                />
                <span className="text-[13px] text-ink-700">
                  <b className="font-medium text-ink-900">Use AI to read the paper</b>
                  <span className="block text-ink-500">
                    Handles any layout. Off: questions must look like “1. …”, options “A) …”, and
                    “Answer: B”.
                  </span>
                </span>
              </label>
              <label
                className={cn('flex cursor-pointer items-start gap-3', !useAi && 'opacity-50')}
              >
                <input
                  type="checkbox"
                  checked={fillAnswers}
                  disabled={!useAi}
                  onChange={(e) => setFillAnswers(e.target.checked)}
                  className="mt-0.5 size-4 accent-brand-600"
                />
                <span className="text-[13px] text-ink-700">
                  <b className="font-medium text-ink-900">Suggest missing answers</b>
                  <span className="block text-ink-500">
                    If the paper has no answer key, AI picks the answer. These are flagged for you
                    to check.
                  </span>
                </span>
              </label>
            </Card>
            <Card className="space-y-3 p-5">
              <p className="text-sm font-semibold text-ink-900">Apply to every question</p>
              <Field
                label="Topic"
                htmlFor="d-topic"
                optional
                hint="Leave empty to use the topic AI suggests."
              >
                <Input
                  id="d-topic"
                  value={defaults.topic}
                  onChange={(e) => setDefaults({ ...defaults, topic: e.target.value })}
                  placeholder="e.g. Embedded Systems"
                  maxLength={80}
                />
              </Field>
              <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
                <Field label="Level" htmlFor="d-diff">
                  <Select
                    id="d-diff"
                    value={defaults.difficulty}
                    onChange={(e) =>
                      setDefaults({ ...defaults, difficulty: e.target.value as Difficulty })
                    }
                  >
                    <option value="EASY">Easy</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HARD">Hard</option>
                  </Select>
                </Field>
                <Field label="Marks" htmlFor="d-pts">
                  <Input
                    id="d-pts"
                    type="number"
                    min={1}
                    max={100}
                    value={defaults.points}
                    onChange={(e) =>
                      setDefaults({
                        ...defaults,
                        points: Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1))),
                      })
                    }
                  />
                </Field>
                <Field label="Negative" htmlFor="d-neg">
                  <Input
                    id="d-neg"
                    type="number"
                    min={0}
                    step={0.25}
                    value={defaults.negative}
                    onChange={(e) =>
                      setDefaults({
                        ...defaults,
                        negative: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </Field>
              </div>
            </Card>
            <p className="px-1 text-[12.5px] leading-relaxed text-ink-500">
              Works with text PDFs made from Word / Google Docs. Scanned papers (photos) have no
              text — paste the questions instead. Diagrams and images aren’t copied.
            </p>
          </div>
        </div>
      )}

      {drafts && (
        <>
          <Card className="mb-5 flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink-900">
                  {stats.total} question{stats.total === 1 ? '' : 's'} found
                  {fileName ? ` in ${fileName}` : ''}
                </p>
                <p className="text-[13px] text-ink-500">
                  {method === 'ai'
                    ? 'Read by AI'
                    : method === 'mixed'
                      ? 'Read by AI and layout rules'
                      : 'Read from the layout'}{' '}
                  · check each one, then import
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['all', `All ${stats.total}`],
                  ['fix', `Needs answer ${stats.fix}`],
                  ['ai', `AI answers ${stats.ai}`],
                  ['dup', `Already in bank ${stats.dup}`],
                ] as const
              )
                .filter(
                  ([k]) =>
                    k === 'all' || (k === 'fix' ? stats.fix : k === 'ai' ? stats.ai : stats.dup),
                )
                .map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setFilter(k)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[13px] font-medium transition',
                      filter === k
                        ? 'border-ink-900 bg-ink-900 text-white'
                        : k === 'fix'
                          ? 'border-amber-300 bg-amber-50 text-amber-900'
                          : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
                    )}
                  >
                    {label}
                  </button>
                ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDrafts(null);
                  setFileName(null);
                }}
              >
                <X /> Start over
              </Button>
            </div>
          </Card>

          {notes.map((n) => (
            <p
              key={n}
              className="mb-4 flex gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900 ring-1 ring-amber-200"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {n}
            </p>
          ))}

          <div className="space-y-3 pb-28">
            {shown.map((d) => (
              <DraftCard
                key={d.key}
                d={d}
                n={drafts.indexOf(d) + 1}
                onChange={(p) => update(d.key, p)}
                onRemove={() => setDrafts(drafts.filter((x) => x.key !== d.key))}
              />
            ))}
            {shown.length === 0 && (
              <p className="py-10 text-center text-sm text-ink-500">Nothing here.</p>
            )}
          </div>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur lg:left-[264px]">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 py-3.5">
              <p className="flex-1 text-sm text-ink-600">
                <b className="text-ink-900">{stats.selected}</b> selected
                {stats.selectedBad > 0 && (
                  <span className="ml-2 text-amber-700">· {stats.selectedBad} need an answer</span>
                )}
                {stats.unsupported > 0 && (
                  <span className="ml-2 text-ink-400">
                    · {stats.unsupported} descriptive skipped
                  </span>
                )}
              </p>
              <Button variant="secondary" asChild>
                <Link href="/questions">Cancel</Link>
              </Button>
              <Button onClick={() => void save()} loading={saving} disabled={!stats.selected}>
                <CheckCircle2 /> Import {stats.selected} question{stats.selected === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function DraftCard({
  d,
  n,
  onChange,
  onRemove,
}: {
  d: Draft;
  n: number;
  onChange: (p: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const issue = problem(d);
  const unsupported = d.type === 'UNSUPPORTED';
  const choice = d.type === 'SINGLE_CHOICE' || d.type === 'MULTIPLE_CHOICE';
  const setType = (t: ImportableType) => {
    const patch: Partial<Draft> = { type: t };
    if ((t === 'SINGLE_CHOICE' || t === 'MULTIPLE_CHOICE') && d.options.length < 2)
      patch.options = [
        ...d.options,
        { text: '', correct: false },
        { text: '', correct: false },
      ].slice(0, Math.max(2, d.options.length));
    if (t === 'SINGLE_CHOICE' && d.options.filter((o) => o.correct).length > 1)
      patch.options = d.options.map((o) => ({ ...o, correct: false }));
    onChange(patch);
  };
  return (
    <Card
      id={d.key}
      className={cn(
        'p-4 transition',
        !d.include && 'bg-ink-50/70 opacity-70',
        d.include && issue && 'border-amber-300 ring-1 ring-amber-200',
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={d.include}
          disabled={unsupported}
          onChange={(e) => onChange({ include: e.target.checked })}
          className="mt-2.5 size-4 accent-brand-600"
          aria-label={`Include question ${n}`}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular text-sm font-semibold text-ink-400">Q{n}</span>
            {unsupported ? (
              <Badge tone="neutral">Descriptive — can’t be auto-marked</Badge>
            ) : (
              <Select
                value={d.type}
                onChange={(e) => setType(e.target.value as ImportableType)}
                className="h-8 w-40 text-[13px]"
                aria-label="Question type"
              >
                {(Object.keys(TYPE_LABEL) as ImportableType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            )}
            {d.duplicate && (
              <Badge tone="info">
                <Copy className="size-3" /> Already in bank
              </Badge>
            )}
            {d.answerByAi && (
              <Badge tone="violet">
                <Sparkles className="size-3" /> AI answer — check
              </Badge>
            )}
            {d.include && issue && !unsupported && <Badge tone="warning">{issue}</Badge>}
            {d.topic && <span className="text-[12px] text-ink-400">{d.topic}</span>}
            <button
              onClick={onRemove}
              className="ml-auto rounded-md p-1 text-ink-400 transition hover:bg-ink-100 hover:text-rose-600"
              aria-label="Remove"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <Textarea
            value={d.prompt}
            onChange={(e) => onChange({ prompt: e.target.value })}
            rows={Math.min(6, Math.max(2, Math.ceil(d.prompt.length / 90)))}
            className="text-[14px]"
            aria-label={`Question ${n}`}
          />
          {choice && (
            <div className="space-y-1.5">
              {d.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        options: d.options.map((x, j) =>
                          d.type === 'SINGLE_CHOICE'
                            ? { ...x, correct: j === i }
                            : j === i
                              ? { ...x, correct: !x.correct }
                              : x,
                        ),
                        answerByAi: false,
                      })
                    }
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center border text-[12px] font-semibold transition',
                      d.type === 'SINGLE_CHOICE' ? 'rounded-full' : 'rounded-md',
                      o.correct
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-ink-300 text-ink-500 hover:border-emerald-400',
                    )}
                    title="Mark as correct"
                  >
                    {String.fromCharCode(65 + i)}
                  </button>
                  <Input
                    value={o.text}
                    onChange={(e) =>
                      onChange({
                        options: d.options.map((x, j) =>
                          j === i ? { ...x, text: e.target.value } : x,
                        ),
                      })
                    }
                    className={cn(
                      'h-8 text-[13.5px]',
                      o.correct && 'border-emerald-300 bg-emerald-50/50',
                    )}
                  />
                  <button
                    onClick={() => onChange({ options: d.options.filter((_, j) => j !== i) })}
                    className="rounded-md p-1 text-ink-300 hover:text-ink-600"
                    aria-label="Remove option"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              {d.options.length < 8 && (
                <button
                  onClick={() =>
                    onChange({ options: [...d.options, { text: '', correct: false }] })
                  }
                  className="ml-9 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-600 hover:underline"
                >
                  <Plus className="size-3.5" /> Option
                </button>
              )}
            </div>
          )}
          {d.type === 'TRUE_FALSE' && (
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  onClick={() => onChange({ answer: v, answerByAi: false })}
                  className={cn(
                    'rounded-lg border px-4 py-1.5 text-sm font-medium transition',
                    d.answer === v
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-ink-200 text-ink-700 hover:border-emerald-400',
                  )}
                >
                  {v ? 'True' : 'False'}
                </button>
              ))}
            </div>
          )}
          {d.type === 'NUMERIC' && (
            <div className="flex items-center gap-2 text-sm text-ink-600">
              Correct answer
              <Input
                type="number"
                value={d.value ?? ''}
                onChange={(e) =>
                  onChange({
                    value: e.target.value === '' ? null : Number(e.target.value),
                    answerByAi: false,
                  })
                }
                className="h-8 w-40"
              />
            </div>
          )}
          {d.explanation && (
            <p className="text-[12.5px] text-ink-500">
              <b className="font-medium text-ink-600">Explanation:</b> {d.explanation}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
