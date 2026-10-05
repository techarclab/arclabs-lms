'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FileUp,
  Folder,
  FolderInput,
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
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Paginated, QuestionFolders, QuestionItem } from '@arc/types';
import { NO_FOLDER } from '@arc/validation';
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
import { FolderBar, FolderDialog } from '@/components/exams/QuestionFolders';
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
  const [folder, setFolder] = useState('');
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<QuestionItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [q, type, difficulty, topic, folder, archived]);
  useEffect(() => setSelected([]), [q, type, difficulty, topic, folder, archived]);
  // Opened from an import ("/questions?folder=Unit 3"): show that folder.
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get('folder');
    if (f) setFolder(f);
  }, []);

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
    if (folder) sp.set('folder', folder);
    return `/questions?${sp}`;
  }, [page, q, type, difficulty, topic, folder, archived]);

  const {
    data,
    isLoading,
    mutate: reload,
  } = useApi<Paginated<QuestionItem>>(query, { orgId, keepPreviousData: true });
  const { data: topics = [], mutate: reloadTopics } = useApi<{ topic: string; count: number }[]>(
    '/questions/topics',
    { orgId },
  );
  const { data: folderData, mutate: reloadFolders } = useApi<QuestionFolders>(
    '/questions/folders',
    { orgId },
  );
  const folderNames = (folderData?.folders ?? []).map((f) => f.name);
  const namedFolder = folder && folder !== NO_FOLDER ? folder : '';
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const refresh = () => {
    void reload();
    void reloadTopics();
    void reloadFolders();
  };
  const pageIds = (data?.data ?? []).map((x) => x.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const toggle = (id: string) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function moveSelected(name: string) {
    try {
      const r = await mutate<{ moved: number; folder: string | null }>(
        '/questions/move',
        'POST',
        { ids: selected, folder: name || null },
        orgId,
      );
      toast.success(
        r.folder
          ? `${r.moved} question${r.moved === 1 ? '' : 's'} moved to “${r.folder}”`
          : `${r.moved} question${r.moved === 1 ? '' : 's'} taken out of the folder`,
      );
      setSelected([]);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  }

  async function renameFolder(name: string) {
    try {
      const r = await mutate<{ renamed: number; folder: string }>(
        '/questions/folders/rename',
        'POST',
        { from: namedFolder, to: name },
        orgId,
      );
      toast.success(`Folder renamed to “${r.folder}”`);
      setFolder(r.folder);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  }

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

      <FolderBar data={folderData} value={folder} onChange={setFolder} />

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
        {namedFolder && (
          <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 bg-brand-50/40 px-6 py-3">
            <Folder className="size-4 text-brand-600" />
            <p className="min-w-0 flex-1 truncate text-sm text-ink-700">
              Folder <b className="font-semibold text-ink-900">{namedFolder}</b>
              {data && (
                <span className="text-ink-500">
                  {' '}
                  · {formatNumber(total)} question{total === 1 ? '' : 's'}
                </span>
              )}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setRenameOpen(true)}>
              <Pencil /> Rename
            </Button>
          </div>
        )}
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-brand-100 bg-brand-50 px-6 py-2.5">
            <p className="flex-1 text-sm text-ink-700">
              <b className="font-semibold text-ink-900">{selected.length}</b> selected
            </p>
            <Button size="sm" onClick={() => setMoveOpen(true)}>
              <FolderInput /> Move to folder
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              <X /> Clear
            </Button>
          </div>
        )}
        <div className="flex flex-col gap-3 border-b border-ink-100 px-4 py-3.5 lg:flex-row lg:items-center">
          {pageIds.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2 px-2 text-[13px] text-ink-600">
              <input
                type="checkbox"
                checked={allOnPage}
                onChange={() =>
                  setSelected((p) =>
                    allOnPage
                      ? p.filter((id) => !pageIds.includes(id))
                      : [...new Set([...p, ...pageIds])],
                  )
                }
                className="size-4 accent-brand-600"
              />
              Select page
            </label>
          )}
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
              <label className="mt-0.5 flex w-12 shrink-0 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(qi.id)}
                  onChange={() => toggle(qi.id)}
                  aria-label="Select question"
                  className="size-4 accent-brand-600"
                />
                <span className="tabular text-sm text-ink-400">
                  {(page - 1) * PAGE_SIZE + i + 1}
                </span>
              </label>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[14.5px] leading-relaxed text-ink-900">
                  {plainPrompt(qi.prompt)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <QuestionTypeBadge type={qi.type} />
                  <DifficultyBadge difficulty={qi.difficulty} />
                  {qi.topic && <span className="text-xs text-ink-500">{qi.topic}</span>}
                  {qi.folder && !namedFolder && (
                    <span className="flex items-center gap-1 rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600">
                      <Folder className="size-3" /> {qi.folder}
                    </span>
                  )}
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
                    icon={<FolderInput />}
                    onSelect={() => {
                      setSelected([qi.id]);
                      setMoveOpen(true);
                    }}
                  >
                    Move to folder
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
              q || type || difficulty || topic || folder
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
        folders={folderNames}
        defaultFolder={namedFolder}
        onSaved={refresh}
      />
      <FolderDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        title={`Move ${selected.length} question${selected.length === 1 ? '' : 's'}`}
        description="Pick a folder or type a new name."
        initial={namedFolder}
        folders={folderNames}
        confirmLabel="Move"
        allowEmpty
        onSubmit={moveSelected}
      />
      <FolderDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename folder"
        description="Renaming to another folder’s name joins the two folders."
        initial={namedFolder}
        folders={folderNames.filter((f) => f !== namedFolder)}
        confirmLabel="Rename"
        onSubmit={renameFolder}
      />
    </>
  );
}
