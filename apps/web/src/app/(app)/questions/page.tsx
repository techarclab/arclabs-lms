'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FileUp,
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  Copy,
  Library,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Paginated, QuestionItem } from '@arc/types';
import {
  Button,
  Card,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Select,
  Skeleton,
} from '@arc/ui';
import { DifficultyBadge, QuestionTypeBadge } from '@/components/exams/badges';
import { QuestionEditor } from '@/components/exams/QuestionEditor';
import { OrgRequired } from '@/components/shell/OrgRequired';
import { PageHeader } from '@/components/shell/PageHeader';
import { formatNumber, plainPrompt } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/use-api';

const PAGE_SIZE = 20;

export default function QuestionBankPage() {
  return (
    <OrgRequired
      title="Question bank"
      description="Questions are reusable across all exams in an organization."
      permission="quiz.author"
    >
      {(org) => <Bank orgId={org.id} />}
    </OrgRequired>
  );
}

function Bank({ orgId }: { orgId: string }) {
  const mutate = useApiMutation();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [topic, setTopic] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<QuestionItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [q, type, difficulty, topic, archived]);

  const query = useMemo(() => {
    const sp = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      archived: String(archived),
    });
    if (q) sp.set('search', q);
    if (type) sp.set('type', type);
    if (difficulty) sp.set('difficulty', difficulty);
    if (topic) sp.set('topic', topic);
    return `/questions?${sp}`;
  }, [page, q, type, difficulty, topic, archived]);

  const {
    data,
    isLoading,
    mutate: reload,
  } = useApi<Paginated<QuestionItem>>(query, { orgId, keepPreviousData: true });
  const { data: topics = [], mutate: reloadTopics } = useApi<{ topic: string; count: number }[]>(
    '/questions/topics',
    { orgId },
  );
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const refresh = () => {
    void reload();
    void reloadTopics();
  };

  async function act(path: string, method: 'POST' | 'DELETE', ok: string) {
    try {
      await mutate(path, method, undefined, orgId);
      toast.success(ok);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Question bank"
        description="Build a reusable pool of auto-graded questions. Questions used in a published exam are locked so scores can never change afterwards."
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href="/questions/import">
                <FileUp /> Import from PDF / Word
              </Link>
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              <Plus /> New question
            </Button>
          </>
        }
      />

      {topics.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <button
            onClick={() => setTopic('')}
            className={cn(
              'rounded-full border px-3 py-1 text-[13px] transition',
              !topic
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300',
            )}
          >
            All topics
          </button>
          {topics.map((t) => (
            <button
              key={t.topic}
              onClick={() => setTopic(topic === t.topic ? '' : t.topic)}
              className={cn(
                'rounded-full border px-3 py-1 text-[13px] transition',
                topic === t.topic
                  ? 'border-ink-900 bg-ink-900 text-white'
                  : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300',
              )}
            >
              {t.topic}{' '}
              <span
                className={cn('ml-1 tabular', topic === t.topic ? 'text-white/60' : 'text-ink-400')}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-ink-100 px-4 py-3.5 lg:flex-row lg:items-center">
          <div className="flex rounded-lg bg-ink-100/80 p-0.5">
            {[false, true].map((a) => (
              <button
                key={String(a)}
                onClick={() => setArchived(a)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[13px] font-medium transition',
                  archived === a
                    ? 'bg-white text-ink-900 shadow-xs'
                    : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {a ? 'Archived' : 'Active'}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-wrap gap-3 lg:justify-end">
            <div className="min-w-56 flex-1 lg:max-w-xs">
              <Input
                leading={<Search />}
                placeholder="Search questions or topics"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="w-40">
              <Select value={type} onChange={(e) => setType(e.target.value)} className="h-9">
                <option value="">All types</option>
                <option value="SINGLE_CHOICE">Single choice</option>
                <option value="MULTIPLE_CHOICE">Multiple choice</option>
                <option value="TRUE_FALSE">True / False</option>
                <option value="NUMERIC">Numeric</option>
                <option value="CODING">Coding</option>
              </Select>
            </div>
            <div className="w-36">
              <Select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="h-9"
              >
                <option value="">Any difficulty</option>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </Select>
            </div>
          </div>
        </div>

        <div className="divide-y divide-ink-100">
          {isLoading &&
            !data &&
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2 px-6 py-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          {data?.data.map((qi, i) => (
            <div
              key={qi.id}
              className="group flex items-start gap-4 px-6 py-4 transition hover:bg-ink-50/60"
            >
              <span className="tabular mt-0.5 w-7 shrink-0 text-sm text-ink-400">
                {(page - 1) * PAGE_SIZE + i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[14.5px] leading-relaxed text-ink-900">
                  {plainPrompt(qi.prompt)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <QuestionTypeBadge type={qi.type} />
                  <DifficultyBadge difficulty={qi.difficulty} />
                  {qi.topic && <span className="text-xs text-ink-500">{qi.topic}</span>}
                  {qi.options.length > 0 && qi.type !== 'TRUE_FALSE' && (
                    <span className="text-xs text-ink-400">· {qi.options.length} options</span>
                  )}
                  {qi.coding && (
                    <span className="text-xs text-ink-400">
                      · {qi.coding.languages.map((l) => (l === 'c' ? 'C' : 'Python')).join(', ')} ·{' '}
                      {qi.coding.testCases.length} tests
                    </span>
                  )}
                  {qi.usedInExams > 0 && (
                    <span className="flex items-center gap-1 text-xs text-ink-400">
                      · {qi.locked && <Lock className="size-3" />} used in {qi.usedInExams} exam
                      {qi.usedInExams > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular text-sm font-semibold text-ink-900">
                  {qi.points} mark{qi.points > 1 ? 's' : ''}
                </p>
                {qi.negativeMarks > 0 && (
                  <p className="tabular text-xs text-rose-600">−{qi.negativeMarks}</p>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger className="rounded-lg p-1.5 text-ink-400 opacity-60 transition group-hover:opacity-100 hover:bg-ink-100 hover:text-ink-700 data-[state=open]:bg-ink-100 data-[state=open]:opacity-100">
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    icon={qi.locked ? <Lock /> : <Pencil />}
                    disabled={qi.locked}
                    onSelect={() => {
                      setEditing(qi);
                      setEditorOpen(true);
                    }}
                  >
                    {qi.locked ? 'Locked (in a published exam)' : 'Edit'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    icon={<Copy />}
                    onSelect={() =>
                      act(`/questions/${qi.id}/duplicate`, 'POST', 'Question duplicated')
                    }
                  >
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {qi.archived ? (
                    <DropdownMenuItem
                      icon={<ArchiveRestore />}
                      onSelect={() =>
                        act(`/questions/${qi.id}/restore`, 'POST', 'Question restored')
                      }
                    >
                      Restore
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      icon={<Archive />}
                      onSelect={() =>
                        act(`/questions/${qi.id}/archive`, 'POST', 'Question archived')
                      }
                    >
                      Archive
                    </DropdownMenuItem>
                  )}
                  {qi.usedInExams === 0 && (
                    <DropdownMenuItem
                      danger
                      icon={<Trash2 />}
                      onSelect={() => act(`/questions/${qi.id}`, 'DELETE', 'Question deleted')}
                    >
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>

        {data && data.data.length === 0 && (
          <EmptyState
            icon={<Library />}
            title={
              q || type || difficulty || topic
                ? 'No questions match'
                : archived
                  ? 'Nothing archived'
                  : 'Your question bank is empty'
            }
            description={
              !q && !archived
                ? 'Add single-choice, multiple-choice, true/false and numeric questions.'
                : undefined
            }
            action={
              !archived && (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setEditorOpen(true);
                  }}
                >
                  <Plus /> New question
                </Button>
              )
            }
          />
        )}

        {total > 0 && (
          <div className="flex items-center justify-between border-t border-ink-100 px-6 py-3 text-sm text-ink-500">
            <span>
              <b className="font-medium text-ink-800">{formatNumber(total)}</b> question
              {total === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="icon-sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft />
              </Button>
              <span className="tabular px-1 text-ink-700">
                {page} / {pages}
              </span>
              <Button
                variant="secondary"
                size="icon-sm"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <QuestionEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        orgId={orgId}
        question={editing}
        topics={topics.map((t) => t.topic)}
        onSaved={refresh}
      />
    </>
  );
}
