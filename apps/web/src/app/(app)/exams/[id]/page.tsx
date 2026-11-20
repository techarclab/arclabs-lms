'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  Circle,
  FileQuestion,
  Layers,
  Library,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Rocket,
  Settings2,
  ShieldCheck,
  Trash2,
  Undo2,
  BellRing,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { hasPermission, type ExamDetail, type OrgRole, type QuestionItem } from '@arc/types';
import { useOrg } from '@/components/providers/OrgProvider';
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
import {
  entriesOf,
  ExamQuestionList,
  sectionNames,
  UNSECTIONED,
  type ExamEntry,
} from '@/components/exams/ExamQuestionList';
import { DifficultyBadge, ExamStateBadge, QuestionTypeBadge } from '@/components/exams/badges';
import { StopExamButton } from '@/components/exams/StopExamButton';
import { RenameExamDialog } from '@/components/exams/RenameExamDialog';
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
  const { current, isSuperAdmin } = useOrg();
  const canRemind =
    isSuperAdmin || hasPermission((current?.roles ?? []) as OrgRole[], 'announcement.send');
  const router = useRouter();
  const mutate = useApiMutation();
  const { data: exam, mutate: setExam, error } = useApi<ExamDetail>(`/exams/${id}`, { orgId });
  const { data: topics = [] } = useApi<{ topic: string }[]>('/questions/topics', { orgId });
  const [addOpen, setAddOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [tab, setTab] = useState('questions');
  // Highlights the publish card after the last setup step.
  const [pulse, setPulse] = useState(false);
  /** Setup is a sequence: Questions → Settings → Audience → Publish. */
  const goStep = (next: string) => {
    setTab(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  const entries = entriesOf(exam);
  const sections = sectionNames(entries);

  async function save(list: ExamEntry[]) {
    try {
      update(
        await mutate<ExamDetail>(
          `/exams/${id}/questions`,
          'PUT',
          { questionIds: list.map((e) => e.id), sections: list.map((e) => e.section) },
          orgId,
        ),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  /** Adds questions at the end; in an exam with sections they go into `section` (default: the last one). */
  async function addQuestions(add: string[], section?: string | null) {
    const into = section?.trim() || (sections.length ? sections[sections.length - 1]! : null);
    await save([...entries, ...add.map((qid) => ({ id: qid, section: into }))]);
  }

  /** Puts every question into a section named after its question-bank folder. */
  async function sectionsFromFolders() {
    const folderOf = new Map(exam!.questions.map((q) => [q.id, q.folder]));
    await save(entries.map((e) => ({ ...e, section: folderOf.get(e.id) || UNSECTIONED })));
    toast.success('Sections made from the question folders');
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

  const checklist = [
    { label: 'Questions added', done: exam.questionCount > 0, tab: 'questions' },
    { label: 'Duration set', done: Boolean(exam.durationMinutes), tab: 'settings' },
    {
      label: 'Window scheduled',
      done:
        Boolean(exam.startsAt && exam.endsAt) &&
        !exam.publishIssues.some((i) => /window|past|closing/i.test(i)),
      tab: 'settings',
    },
    {
      label: 'Audience chosen',
      done:
        exam.audience.assignToAll ||
        exam.audience.departments.length > 0 ||
        exam.audience.users.length > 0,
      tab: 'audience',
    },
  ];
  const firstMissing = checklist.find((c) => !c.done);
  /** Publish when ready; otherwise explain what's missing and jump to the right tab. */
  const tryPublish = () => {
    if (exam.publishIssues.length) {
      toast.error('Not ready to publish yet', { description: exam.publishIssues.join(' · ') });
      if (firstMissing) setTab(firstMissing.tab);
      return;
    }
    void action('publish', 'Exam published — candidates can see it now');
  };

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
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-[26px] font-semibold tracking-tight text-ink-900">
              {exam.title}
            </h1>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-ink-500 hover:text-ink-900"
              onClick={() => setRenameOpen(true)}
              aria-label="Rename exam"
            >
              <Pencil /> Rename
            </Button>
          </div>
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
          {(exam.state === 'SCHEDULED' || exam.state === 'LIVE') && canRemind && (
            <Button variant="secondary" asChild>
              <Link href={`/announcements?exam=${id}`}>
                <BellRing /> Send reminder
              </Link>
            </Button>
          )}
          {exam.state === 'LIVE' && (
            <StopExamButton
              examId={id}
              orgId={orgId}
              onStopped={() => router.push(`/exams/${id}/results`)}
            />
          )}
          {exam.state === 'DRAFT' ? (
            <Button
              className={exam.publishIssues.length ? 'opacity-60' : undefined}
              loading={busy}
              onClick={tryPublish}
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
              <DropdownMenuItem icon={<Pencil />} onSelect={() => setRenameOpen(true)}>
                Rename exam
              </DropdownMenuItem>
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
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="questions">
              <ListChecks /> 1. Questions{' '}
              <span className="tabular rounded-full bg-ink-100 px-1.5 text-[11px] text-ink-600">
                {exam.questionCount}
              </span>
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings2 /> 2. Settings
            </TabsTrigger>
            <TabsTrigger value="audience">
              <Users /> 3. Audience{' '}
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
                  {exam.questions.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="secondary">
                          <Layers /> Sections
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-w-72">
                        <DropdownMenuItem onSelect={() => void sectionsFromFolders()}>
                          <div>
                            <p>{sections.length ? 'Remake' : 'Make'} sections from folders</p>
                            <p className="text-xs text-ink-500">
                              One section per question-bank folder, e.g. Aptitude, Technical
                            </p>
                          </div>
                        </DropdownMenuItem>
                        {sections.length > 0 && (
                          <DropdownMenuItem
                            onSelect={() =>
                              void save(entries.map((e) => ({ ...e, section: null })))
                            }
                          >
                            Remove sections
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
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
                <ExamQuestionList exam={exam} onSave={save} />
              )}
              {exam.state === 'DRAFT' && exam.questions.length > 0 && (
                <div className="flex items-center justify-end gap-3 border-t border-ink-100 bg-ink-50/60 px-5 py-3.5">
                  <span className="mr-auto text-sm text-ink-500">
                    {exam.questionCount} questions · {exam.totalMarks} marks
                  </span>
                  <Button onClick={() => goStep('settings')}>
                    Next: Settings <ArrowRight />
                  </Button>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <ExamSettingsForm
              exam={exam}
              orgId={orgId}
              saveLabel={exam.state === 'DRAFT' ? 'Save & continue →' : 'Save settings'}
              onSaved={(e) => {
                update(e);
                if (e.state === 'DRAFT') goStep('audience');
              }}
            />
          </TabsContent>

          <TabsContent value="audience">
            <AudiencePicker
              exam={exam}
              orgId={orgId}
              saveLabel={exam.state === 'DRAFT' ? 'Save & continue →' : 'Save audience'}
              onSaved={(e) => {
                update(e);
                if (e.state === 'DRAFT') {
                  setPulse(true);
                  setTimeout(() => setPulse(false), 4000);
                  document
                    .getElementById('publish-card')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  if (!e.publishIssues.length)
                    toast.success('All set — click “Publish exam” to make it live');
                }
              }}
            />
          </TabsContent>
        </Tabs>

        <div className="space-y-6">
          {exam.state === 'DRAFT' ? (
            <Card
              id="publish-card"
              className={cn(
                'transition-shadow duration-500',
                pulse && 'shadow-lg ring-2 shadow-brand-500/20 ring-brand-500',
              )}
            >
              <CardHeader>
                <CardTitle>4. Publish</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2.5">
                  {checklist.map((c) => (
                    <li key={c.label}>
                      <button
                        onClick={() => setTab(c.tab)}
                        className="group flex w-full items-center gap-2.5 rounded-lg px-1 py-0.5 text-left text-sm transition hover:bg-ink-50"
                      >
                        {c.done ? (
                          <CheckCircle2 className="size-[18px] text-emerald-500" />
                        ) : (
                          <Circle className="size-[18px] text-ink-300" />
                        )}
                        <span
                          className={
                            c.done ? 'text-ink-700' : 'text-ink-500 group-hover:text-brand-700'
                          }
                        >
                          {c.label}
                        </span>
                        {!c.done && (
                          <span className="ml-auto text-xs text-brand-600 opacity-0 transition group-hover:opacity-100">
                            Set up →
                          </span>
                        )}
                      </button>
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
                  className={cn('w-full', exam.publishIssues.length > 0 && 'opacity-60')}
                  loading={busy}
                  onClick={tryPublish}
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
                {exam.maxViolations === 1
                  ? 'Leaving the exam submits it'
                  : exam.maxViolations
                    ? `Auto-submit after ${exam.maxViolations} violations`
                    : 'Violations logged only'}
              </p>
              <p className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand-600" />{' '}
                {exam.requireCamera ? 'Camera on (not recorded)' : 'No camera'}
              </p>
              {exam.requireOnCampus && (
                <p className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-brand-600" /> On campus only (location
                  checked)
                </p>
              )}
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

      <RenameExamDialog
        examId={id}
        orgId={orgId}
        title={exam.title}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        onRenamed={update}
      />
      <AddQuestionsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        orgId={orgId}
        existing={ids}
        sections={sections}
        onAdd={addQuestions}
      />
      <QuestionEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        orgId={orgId}
        topics={topics.map((t) => t.topic)}
        onSaved={(q) => void addQuestions([q.id])}
      />
    </>
  );
}
