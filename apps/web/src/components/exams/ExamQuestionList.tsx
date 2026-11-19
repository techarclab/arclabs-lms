'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, FolderInput, Layers, Pencil, X } from 'lucide-react';
import type { ExamDetail, QuestionItem } from '@arc/types';
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from '@arc/ui';
import { plainPrompt } from '@/lib/format';
import { DifficultyBadge, QuestionTypeBadge } from './badges';

/** One question of the exam and the section it is in (null = no section). */
export type ExamEntry = { id: string; section: string | null };

/** Name shown for questions left out of every section (matches the API). */
export const UNSECTIONED = 'General';

export const entriesOf = (exam: ExamDetail): ExamEntry[] =>
  exam.questions.map((q) => ({ id: q.id, section: q.section ?? null }));

export const sectionNames = (list: ExamEntry[]) =>
  list.some((e) => e.section) ? [...new Set(list.map((e) => e.section || UNSECTIONED))] : [];

/** Sections in order with their questions (one unnamed group when the exam has no sections). */
function groupsOf(questions: QuestionItem[]) {
  const sectioned = questions.some((q) => q.section);
  const groups: { name: string | null; items: { q: QuestionItem; n: number }[] }[] = [];
  questions.forEach((q, n) => {
    const name = sectioned ? q.section || UNSECTIONED : null;
    const g = groups.find((x) => x.name === name);
    if (g) g.items.push({ q, n });
    else groups.push({ name, items: [{ q, n }] });
  });
  return groups;
}

/** The exam's questions, grouped into sections when it has them. */
export function ExamQuestionList({
  exam,
  onSave,
}: {
  exam: ExamDetail;
  onSave: (list: ExamEntry[]) => Promise<void>;
}) {
  const list = entriesOf(exam);
  const groups = groupsOf(exam.questions);
  const sectioned = groups.length > 0 && groups[0]!.name !== null;
  const names = groups.map((g) => g.name ?? '');
  const editable = exam.editable;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const flatten = (gs: typeof groups) =>
    gs.flatMap((g) => g.items.map(({ q }) => ({ id: q.id, section: q.section ?? null })));

  const moveQuestion = (n: number, d: -1 | 1) => {
    const next = [...list];
    [next[n], next[n + d]] = [next[n + d]!, next[n]!];
    void onSave(next);
  };
  const moveSection = (i: number, d: -1 | 1) => {
    const gs = [...groups];
    [gs[i], gs[i + d]] = [gs[i + d]!, gs[i]!];
    void onSave(flatten(gs));
  };
  const rename = (from: string, to: string) => {
    const name = to.trim();
    setRenaming(null);
    if (!name || name === from) return;
    void onSave(
      list.map((e) => ((e.section || UNSECTIONED) === from ? { ...e, section: name } : e)),
    );
  };
  const putIn = (id: string, section: string) =>
    void onSave(list.map((e) => (e.id === id ? { ...e, section } : e)));

  return (
    <div>
      {sectioned && (
        <p className="border-b border-ink-100 bg-brand-50/50 px-5 py-2.5 text-[13px] text-ink-600">
          <Layers className="mr-1.5 inline size-4 text-brand-600" />
          {groups.length} sections. Students see them in this order; with shuffle on, questions are
          shuffled only inside their own section.
        </p>
      )}
      {groups.map((g, gi) => {
        const marks = g.items.reduce((s, { q }) => s + q.points, 0);
        return (
          <section key={g.name ?? 'all'}>
            {g.name !== null && (
              <div className="group/sec flex items-center gap-3 border-b border-ink-100 bg-ink-50 px-5 py-2.5">
                <span className="rounded-md bg-ink-900 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white uppercase">
                  Section {gi + 1}
                </span>
                {renaming === g.name ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename(g.name!, draft);
                    }}
                  >
                    <Input
                      autoFocus
                      value={draft}
                      maxLength={60}
                      onChange={(e) => setDraft(e.target.value)}
                      className="h-8 max-w-xs"
                      aria-label="Section name"
                    />
                    <Button size="sm" type="submit">
                      <Check /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={() => setRenaming(null)}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <h3 className="truncate text-sm font-semibold text-ink-900">{g.name}</h3>
                    <span className="text-xs text-ink-500">
                      {g.items.length} question{g.items.length === 1 ? '' : 's'} · {marks} marks
                    </span>
                    {editable && (
                      <div className="ml-auto flex items-center gap-0.5 opacity-60 transition group-hover/sec:opacity-100">
                        <button
                          onClick={() => {
                            setDraft(g.name!);
                            setRenaming(g.name);
                          }}
                          className="rounded p-1 text-ink-400 hover:bg-ink-200 hover:text-ink-700"
                          aria-label={`Rename section ${g.name}`}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          disabled={gi === 0}
                          onClick={() => moveSection(gi, -1)}
                          className="rounded p-1 text-ink-400 hover:bg-ink-200 hover:text-ink-700 disabled:opacity-30"
                          aria-label="Move section up"
                        >
                          <ArrowUp className="size-4" />
                        </button>
                        <button
                          disabled={gi === groups.length - 1}
                          onClick={() => moveSection(gi, 1)}
                          className="rounded p-1 text-ink-400 hover:bg-ink-200 hover:text-ink-700 disabled:opacity-30"
                          aria-label="Move section down"
                        >
                          <ArrowDown className="size-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <ol className="divide-y divide-ink-100 border-b border-ink-100 last:border-b-0">
              {g.items.map(({ q, n }, i) => (
                <li key={q.id} className="group flex items-start gap-4 px-5 py-4">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-xs font-semibold text-ink-600">
                    {n + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm leading-relaxed text-ink-900">
                      {plainPrompt(q.prompt)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <QuestionTypeBadge type={q.type} />
                      <DifficultyBadge difficulty={q.difficulty} />
                      {q.topic && <span className="text-xs text-ink-500">{q.topic}</span>}
                    </div>
                  </div>
                  <span className="tabular shrink-0 text-sm font-medium text-ink-700">
                    {q.points}
                    {exam.negativeMarking && q.negativeMarks > 0 && (
                      <span className="ml-1 text-xs text-rose-600">/−{q.negativeMarks}</span>
                    )}
                  </span>
                  {editable && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-50 transition group-hover:opacity-100">
                      {sectioned && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                              aria-label="Move to another section"
                            >
                              <FolderInput className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Move to section</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {names
                              .filter((s) => s !== g.name)
                              .map((s) => (
                                <DropdownMenuItem key={s} onSelect={() => putIn(q.id, s)}>
                                  {s}
                                </DropdownMenuItem>
                              ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <button
                        disabled={i === 0}
                        onClick={() => moveQuestion(n, -1)}
                        className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <ArrowUp className="size-4" />
                      </button>
                      <button
                        disabled={i === g.items.length - 1}
                        onClick={() => moveQuestion(n, 1)}
                        className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30"
                        aria-label="Move down"
                      >
                        <ArrowDown className="size-4" />
                      </button>
                      <button
                        onClick={() => void onSave(list.filter((e) => e.id !== q.id))}
                        className={cn(
                          'rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600',
                        )}
                        aria-label="Remove"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
