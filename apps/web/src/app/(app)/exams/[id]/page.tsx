'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  Circle,
  FileQuestion,
  Library,
  ListChecks,
  MoreHorizontal,
  Plus,
  Rocket,
  Settings2,
  ShieldCheck,
  Trash2,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ExamDetail, QuestionItem } from '@arc/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@arc/ui';
import { AddQuestionsDialog } from '@/components/exams/AddQuestionsDialog';
import { AudiencePicker } from '@/components/exams/AudiencePicker';
import { DifficultyBadge, ExamStateBadge, QuestionTypeBadge } from '@/components/exams/badges';
import { ExamSettingsForm } from '@/components/exams/ExamSettingsForm';
import { QuestionEditor } from '@/components/exams/QuestionEditor';
import { OrgRequired } from '@/components/shell/OrgRequired';
import { formatDateTime, timeUntil, plainPrompt } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/use-api';

export default function ExamBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <OrgRequired title="Exams" description="" permission="quiz.author">
      {(org) => <Builder id={id} orgId={org.id} />}
    </OrgRequired>
  );
}

function Builder({ id, orgId }: { id: string; orgId: string }) {
  const router = useRouter();
  const mutate = useApiMutation();
  const { data: exam, mutate: setExam, error } = useApi<ExamDetail>(`/exams/${id}`, { orgId });
  const { data: topics = [] } = useApi<{ topic: string }[]>('/questions/topics', { orgId });
  const [addOpen, setAddOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (error) {
    return (
      <Card className="mx-auto mt-10 max-w-lg">
        <EmptyState
          icon={<FileQuestion />}
          title="Exam not found"
          action={
            <Button variant="secondary" asChild>
              <Link href="/exams">Back to exams</Link>
            </Button>
          }
        />
      </Card>
    );
  }
  if (!exam) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const update = (e: ExamDetail) => void setExam(e, { revalidate: false });
  const ids = exam.questions.map((q) => q.id);

  async function setQuestions(next: string[]) {
    try {
      update(
        await mutate<ExamDetail>(`/exams/${id}/questions`, 'PUT', { questionIds: next }, orgId),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function action(path: string, ok: string) {
    setBusy(true);
    try {
      update(await mutate<ExamDetail>(`/exams/${id}/${path}`, 'POST', undefined, orgId));
      toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const move = (i: number, d: -1 | 1) => {
    const next = [...ids];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    void setQuestions(next);
  };

  const checklist = [
    { label: 'Questions added', done: exam.questionCount > 0 },
    { label: 'Duration set', done: Boolean(exam.durationMinutes) },
    {
      label: 'Window scheduled',
      done:
        Boolean(exam.startsAt && exam.endsAt) &&
        !exam.publishIssues.some((i) => i.includes('window') || i.includes('past')),
    },
    { label: 'Audience chosen', done: exam.assignedCount > 0 },
  ];

  return (
    <>
      <nav className="mb-4 flex items-center gap-1.5 text-[13px] text-ink-500">
        <Link href="/exams" className="hover:text-ink-900">
          Exams
        </Link>
        <span className="text-ink-300">/</span>
        <span className="truncate text-ink-700">{exam.title}</span>
      </nav>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2.5">
            <ExamStateBadge state={exam.state} />
            {exam.state === 'SCHEDULED' && exam.startsAt && (
              <span className="text-sm text-ink-500">opens in {timeUntil(exam.startsAt)}</span>
            )}
            {exam.state === 'LIVE' && exam.endsAt && (
              <span className="text-sm text-ink-500">closes in {timeUntil(exam.endsAt)}</span>
            )}
          </div>
          <h1 className="truncate text-[26px] font-semibold tracking-tight text-ink-900">
            {exam.title}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {exam.questionCount} questions · {exam.totalMarks} marks · {exam.durationMinutes} min ·{' '}
            {exam.assignedCount} candidates
            {exam.startsAt && (
              <>
                {' '}
                · {formatDateTime(exam.startsAt)} → {formatDateTime(exam.endsAt)}
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2.5">
          {exam.state !== 'DRAFT' && (
            <Button variant="secondary" asChild>
              <Link href={`/exams/${id}/results`}>
                <BarChart3 /> {exam.state === 'LIVE' ? 'Live monitor' : 'Results'}
              </Link>
            </Button>
          )}
          {exam.state === 'DRAFT' ? (
            <Button
              disabled={exam.publishIssues.length > 0}
              loading={busy}
              onClick={() => action('publish', 'Exam published — candidates can see it now')}
            >
              <Rocket /> Publish
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" aria-label="More">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {exam.state !== 'DRAFT' && exam.submittedCount + exam.inProgressCount === 0 && (
                <DropdownMenuItem
                  icon={<Undo2 />}
                  onSelect={() => action('unpublish', 'Moved back to draft')}
                >
                  Unpublish
                </DropdownMenuItem>
              )}
              {exam.resultVisibility === 'MANUAL_RELEASE' &&
                !exam.resultsReleasedAt &&
                exam.state !== 'DRAFT' && (
                  <DropdownMenuItem
                    icon={<CheckCircle2 />}
                    onSelect={() => action('release-results', 'Results released to students')}
                  >
                    Release results
                  </DropdownMenuItem>
                )}
              <DropdownMenuItem
                danger
                icon={<Trash2 />}
                onSelect={async () => {
                  try {
                    await mutate(`/exams/${id}`, 'DELETE', undefined, orgId);
                    toast.success('Exam deleted');
                    router.push('/exams');
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Delete exam
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Tabs defaultValue="questions">
          <TabsList className="mb-6">
            <TabsTrigger value="questions">
              <ListChecks /> Questions{' '}
              <span className="tabular rounded-full bg-ink-100 px-1.5 text-[11px] text-ink-600">
                {exam.questionCount}
              </span>
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings2 /> Settings
            </TabsTrigger>
            <TabsTrigger value="audience">
              <Users /> Audience{' '}
              <span className="tabular rounded-full bg-ink-100 px-1.5 text-[11px] text-ink-600">
                {exam.assignedCount}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="questions">
            <Card className="overflow-hidden">
              {exam.editable && (
                <div className="flex flex-wrap items-center gap-2.5 border-b border-ink-100 px-5 py-3.5">
                  <Button size="sm" onClick={() => setAddOpen(true)}>
                    <Library /> Add from bank
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditorOpen(true)}>
                    <Plus /> Write new question
                  </Button>
                  <span className="ml-auto text-sm text-ink-500">
                    Total <b className="font-semibold text-ink-900">{exam.totalMarks}</b> marks
                  </span>
                </div>
              )}
              {!exam.questions.length ? (
                <EmptyState
                  icon={<FileQuestion />}
                  title="No questions yet"
                  description="Pick questions from your bank or write new ones. Order can be shuffled per student."
                  action={
                    exam.editable && (
                      <Button onClick={() => setAddOpen(true)}>
                        <Library /> Add from bank
                      </Button>
                    )
                  }
                />
              ) : (
                <ol className="divide-y divide-ink-100">
                  {exam.questions.map((q: QuestionItem, i) => (
                    <li key={q.id} className="group flex items-start gap-4 px-5 py-4">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-xs font-semibold text-ink-600">
                        {i + 1}
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
                      {exam.editable && (
                        <div className="flex shrink-0 items-center gap-0.5 opacity-50 transition group-hover:opacity-100">
                          <button
                            disabled={i === 0}
                            onClick={() => move(i, -1)}
                            className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30"
                            aria-label="Move up"
                          >
                            <ArrowUp className="size-4" />
                          </button>
                          <button
                            disabled={i === exam.questions.length - 1}
                            onClick={() => move(i, 1)}
                            className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30"
                            aria-label="Move down"
                          >
                            <ArrowDown className="size-4" />
                          </button>
                          <button
                            onClick={() => setQuestions(ids.filter((x) => x !== q.id))}
                            className="rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label="Remove"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <ExamSettingsForm exam={exam} orgId={orgId} onSaved={update} />
          </TabsContent>

          <TabsContent value="audience">
            <AudiencePicker exam={exam} orgId={orgId} onSaved={update} />
          </TabsContent>
        </Tabs>

        <div className="space-y-6">
          {exam.state === 'DRAFT' ? (
            <Card>
              <CardHeader>
                <CardTitle>Ready to publish?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2.5">
                  {checklist.map((c) => (
                    <li key={c.label} className="flex items-center gap-2.5 text-sm">
                      {c.done ? (
                        <CheckCircle2 className="size-[18px] text-emerald-500" />
                      ) : (
                        <Circle className="size-[18px] text-ink-300" />
                      )}
                      <span className={c.done ? 'text-ink-700' : 'text-ink-500'}>{c.label}</span>
                    </li>
                  ))}
                </ul>
                {exam.publishIssues.length > 0 && (
                  <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
                    {exam.publishIssues.map((i) => (
                      <li key={i}>• {i}</li>
                    ))}
                  </ul>
                )}
                <Button
                  className="w-full"
                  disabled={exam.publishIssues.length > 0}
                  loading={busy}
                  onClick={() => action('publish', 'Exam published')}
                >
                  <Rocket /> Publish exam
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  ['Candidates', exam.assignedCount],
                  ['Writing now', exam.inProgressCount],
                  ['Submitted', exam.submittedCount],
                  ['Average', exam.avgPct !== null ? `${exam.avgPct}%` : '—'],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between">
                    <span className="text-ink-500">{k}</span>
                    <span className="tabular font-semibold text-ink-900">{v}</span>
                  </div>
                ))}
                <Button className="mt-2 w-full" variant="secondary" asChild>
                  <Link href={`/exams/${id}/results`}>
                    <BarChart3 /> Open analytics
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Exam rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-[13px] text-ink-600">
              <p className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand-600" />{' '}
                {exam.requireFullscreen ? 'Full-screen lockdown' : 'No full-screen requirement'}
              </p>
              <p className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand-600" />{' '}
                {exam.maxViolations
                  ? `Auto-submit after ${exam.maxViolations} violations`
                  : 'Violations logged only'}
              </p>
              <p className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand-600" />{' '}
                {exam.blockCopyPaste ? 'Copy / paste blocked' : 'Copy / paste allowed'}
              </p>
              <p className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand-600" /> {exam.maxAttempts} attempt
                {exam.maxAttempts > 1 ? 's' : ''} · pass at {exam.passPct}%
              </p>
              <p className={cn('flex items-center gap-2')}>
                <ShieldCheck className="size-4 text-brand-600" />{' '}
                {exam.negativeMarking ? 'Negative marking on' : 'No negative marking'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <AddQuestionsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        orgId={orgId}
        existing={ids}
        onAdd={(add) => setQuestions([...ids, ...add])}
      />
      <QuestionEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        orgId={orgId}
        topics={topics.map((t) => t.topic)}
        onSaved={(q) => void setQuestions([...ids, q.id])}
      />
    </>
  );
}
