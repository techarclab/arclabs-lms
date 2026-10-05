'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Library, Search } from 'lucide-react';
import type { Paginated, QuestionFolders, QuestionItem } from '@arc/types';
import { NO_FOLDER } from '@arc/validation';
import { Button, cn, Dialog, DialogContent, Input, Select, Skeleton } from '@arc/ui';
import { plainPrompt } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { DifficultyBadge, QuestionTypeBadge } from './badges';

export function AddQuestionsDialog({
  open,
  onOpenChange,
  orgId,
  existing,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orgId: string;
  existing: string[];
  onAdd: (ids: string[]) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('');
  const [folder, setFolder] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQ(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (!open) setPicked([]);
  }, [open]);

  const query = useMemo(() => {
    const sp = new URLSearchParams({ pageSize: '100' });
    if (q) sp.set('search', q);
    if (topic) sp.set('topic', topic);
    if (folder) sp.set('folder', folder);
    if (difficulty) sp.set('difficulty', difficulty);
    return `/questions?${sp}`;
  }, [q, topic, folder, difficulty]);
  const { data, isLoading } = useApi<Paginated<QuestionItem>>(open ? query : null, {
    orgId,
    keepPreviousData: true,
  });
  const { data: topics = [] } = useApi<{ topic: string; count: number }[]>(
    open ? '/questions/topics' : null,
    { orgId },
  );
  const { data: folders } = useApi<QuestionFolders>(open ? '/questions/folders' : null, {
    orgId,
  });
  const available = (data?.data ?? []).filter((x) => !existing.includes(x.id));
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const marks = (data?.data ?? [])
    .filter((x) => picked.includes(x.id))
    .reduce((s, x) => s + x.points, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add questions from the bank" icon={<Library />} className="max-w-3xl">
        <div className="flex flex-wrap gap-3 border-b border-ink-100 px-6 pt-3 pb-4">
          <div className="min-w-56 flex-1">
            <Input
              leading={<Search />}
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
          </div>
          {folders && (folders.folders.length > 0 || folder) && (
            <div className="w-full">
              <Select
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                className="h-9"
                aria-label="Folder"
              >
                <option value="">All folders</option>
                {folders.folders.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name} ({f.count})
                  </option>
                ))}
                {folders.unfiled > 0 && (
                  <option value={NO_FOLDER}>Not in a folder ({folders.unfiled})</option>
                )}
              </Select>
            </div>
          )}
          <div className="w-44">
            <Select value={topic} onChange={(e) => setTopic(e.target.value)} className="h-9">
              <option value="">All topics</option>
              {topics.map((t) => (
                <option key={t.topic} value={t.topic}>
                  {t.topic} ({t.count})
                </option>
              ))}
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
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => setPicked(available.map((a) => a.id))}
            disabled={!available.length}
          >
            Select all {available.length ? `(${available.length})` : ''}
          </Button>
        </div>
        <div className="max-h-[50vh] divide-y divide-ink-100 overflow-y-auto">
          {isLoading &&
            !data &&
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="m-4 h-10" />)}
          {available.map((x) => {
            const on = picked.includes(x.id);
            return (
              <button
                key={x.id}
                onClick={() => toggle(x.id)}
                className={cn(
                  'flex w-full items-start gap-3 px-6 py-3 text-left transition',
                  on ? 'bg-brand-50/60' : 'hover:bg-ink-50',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition',
                    on ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300 bg-white',
                  )}
                >
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm text-ink-900">{plainPrompt(x.prompt)}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <QuestionTypeBadge type={x.type} />
                    <DifficultyBadge difficulty={x.difficulty} />
                    {x.topic && <span className="text-xs text-ink-500">{x.topic}</span>}
                    {x.folder && !folder && (
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600">
                        {x.folder}
                      </span>
                    )}
                  </span>
                </span>
                <span className="tabular shrink-0 text-sm font-medium text-ink-700">
                  {x.points}
                </span>
              </button>
            );
          })}
          {data && !available.length && (
            <p className="px-6 py-10 text-center text-sm text-ink-500">
              No more questions match. Create new ones in the question bank.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between rounded-b-2xl border-t border-ink-100 bg-ink-50/60 px-6 py-4">
          <span className="text-sm text-ink-600">
            <b className="font-semibold text-ink-900">{picked.length}</b> selected · {marks} marks
          </span>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={!picked.length}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onAdd(picked);
                  onOpenChange(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Add {picked.length || ''} question{picked.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
