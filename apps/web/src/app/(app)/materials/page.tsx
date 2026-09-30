'use client';

import { useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  FolderPlus,
  Inbox,
  Library,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { MaterialAdminItem, MaterialFolderItem, MaterialLibrary } from '@arc/types';
import {
  Badge,
  Button,
  Card,
  cn,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  Input,
  Skeleton,
} from '@arc/ui';
import { ActivityDialog } from '@/components/materials/ActivityDialog';
import { MaterialForm } from '@/components/materials/MaterialForm';
import { MaterialViewer, type ViewerItem } from '@/components/materials/MaterialViewer';
import { folderPath, folderTree, PROVIDER_LABEL, TypeIcon } from '@/components/materials/shared';
import { OrgRequired } from '@/components/shell/OrgRequired';
import { PageHeader } from '@/components/shell/PageHeader';
import { formatDate } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/use-api';

export default function MaterialsPage() {
  return (
    <OrgRequired
      title="Study materials"
      description="Share notes, slides and videos with your students."
      permission="material.manage"
    >
      {(org) => <Materials orgId={org.id} />}
    </OrgRequired>
  );
}

/** '' = all, 'none' = not in a folder, otherwise a folder id */
type Filter = string;

function Materials({ orgId }: { orgId: string }) {
  const mutate = useApiMutation();
  const {
    data,
    isLoading,
    mutate: reload,
  } = useApi<MaterialLibrary<MaterialAdminItem>>('/materials', { orgId });
  const folders = data?.folders ?? [];
  const materials = data?.materials ?? [];
  const [filter, setFilter] = useState<Filter>('');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialAdminItem | null>(null);
  const [preview, setPreview] = useState<ViewerItem | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [folderDialog, setFolderDialog] = useState<
    { mode: 'new'; parentId: string | null } | { mode: 'rename'; folder: MaterialFolderItem } | null
  >(null);
  const [confirm, setConfirm] = useState<
    | { kind: 'material'; item: MaterialAdminItem }
    | { kind: 'folder'; folder: MaterialFolderItem }
    | null
  >(null);

  const tree = folderTree(folders);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of materials) {
      const key = m.folderId ?? 'none';
      c.set(key, (c.get(key) ?? 0) + 1);
      const parent = folders.find((f) => f.id === m.folderId)?.parentId;
      if (parent) c.set(parent, (c.get(parent) ?? 0) + 1);
    }
    return c;
  }, [materials, folders]);

  const shown = useMemo(() => {
    let list = materials;
    if (filter === 'none') list = list.filter((m) => !m.folderId);
    else if (filter) {
      const ids = new Set([
        filter,
        ...folders.filter((f) => f.parentId === filter).map((f) => f.id),
      ]);
      list = list.filter((m) => m.folderId && ids.has(m.folderId));
    }
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter((m) =>
        `${m.title} ${m.description ?? ''} ${folderPath(folders, m.folderId) ?? ''}`
          .toLowerCase()
          .includes(q),
      );
    return list;
  }, [materials, folders, filter, search]);

  const currentFolder = filter && filter !== 'none' ? folders.find((f) => f.id === filter) : null;

  async function togglePublished(m: MaterialAdminItem) {
    try {
      await mutate(`/materials/${m.id}`, 'PATCH', { published: !m.published }, orgId);
      toast.success(m.published ? 'Hidden from students' : 'Visible to students');
      void reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doDelete() {
    if (!confirm) return;
    try {
      if (confirm.kind === 'material') {
        await mutate(`/materials/${confirm.item.id}`, 'DELETE', undefined, orgId);
        toast.success('Material deleted');
      } else {
        await mutate(`/materials/folders/${confirm.folder.id}`, 'DELETE', undefined, orgId);
        if (filter === confirm.folder.id) setFilter('');
        toast.success('Folder deleted — its materials are kept');
      }
      setConfirm(null);
      void reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const totals = useMemo(
    () => ({
      shared: materials.filter((m) => m.published).length,
      viewers: materials.reduce((s, m) => s + m.stats.viewers, 0),
      downloads: materials.reduce((s, m) => s + m.stats.downloads, 0),
    }),
    [materials],
  );

  return (
    <>
      <PageHeader
        title="Study materials"
        description="Share notes, slides, videos and links. Students see them in their portal and can view or download."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> Share material
          </Button>
        }
      />

      {materials.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-3 sm:max-w-xl">
          <MiniStat icon={<Library />} label="Shared" value={totals.shared} />
          <MiniStat icon={<Eye />} label="Student opens" value={totals.viewers} />
          <MiniStat icon={<Download />} label="Downloads" value={totals.downloads} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Subjects */}
        <aside className="space-y-1 lg:sticky lg:top-24 lg:self-start">
          <FolderButton
            active={filter === ''}
            onClick={() => setFilter('')}
            icon={<Library />}
            label="All materials"
            count={materials.length}
          />
          {(counts.get('none') ?? 0) > 0 && (
            <FolderButton
              active={filter === 'none'}
              onClick={() => setFilter('none')}
              icon={<Inbox />}
              label="Not in a folder"
              count={counts.get('none') ?? 0}
            />
          )}
          <div className="flex items-center justify-between px-3 pt-4 pb-1">
            <p className="text-[11px] font-semibold tracking-wider text-ink-400 uppercase">
              Subjects
            </p>
            <button
              onClick={() => setFolderDialog({ mode: 'new', parentId: null })}
              className="rounded-md p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
              title="New subject"
            >
              <FolderPlus className="size-4" />
            </button>
          </div>
          {tree.length === 0 && (
            <button
              onClick={() => setFolderDialog({ mode: 'new', parentId: null })}
              className="w-full rounded-xl border border-dashed border-ink-300 px-3 py-3 text-left text-[13px] text-ink-500 transition hover:border-brand-400 hover:text-brand-700"
            >
              + Add a subject, e.g. “Embedded Systems”
            </button>
          )}
          {tree.map((s) => (
            <div key={s.id}>
              <FolderButton
                active={filter === s.id}
                onClick={() => setFilter(s.id)}
                icon={<BookOpen />}
                label={s.name}
                count={counts.get(s.id) ?? 0}
                menu={
                  <FolderMenu
                    onAddUnit={() => setFolderDialog({ mode: 'new', parentId: s.id })}
                    onRename={() => setFolderDialog({ mode: 'rename', folder: s })}
                    onDelete={() => setConfirm({ kind: 'folder', folder: s })}
                  />
                }
              />
              {s.units.map((u) => (
                <FolderButton
                  key={u.id}
                  indent
                  active={filter === u.id}
                  onClick={() => setFilter(u.id)}
                  icon={<FolderOpen />}
                  label={u.name}
                  count={counts.get(u.id) ?? 0}
                  menu={
                    <FolderMenu
                      onRename={() => setFolderDialog({ mode: 'rename', folder: u })}
                      onDelete={() => setConfirm({ kind: 'folder', folder: u })}
                    />
                  }
                />
              ))}
            </div>
          ))}
        </aside>

        {/* Materials */}
        <section className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search materials"
                className="pl-9"
              />
            </div>
            {currentFolder && !currentFolder.parentId && (
              <Button
                variant="secondary"
                onClick={() => setFolderDialog({ mode: 'new', parentId: currentFolder.id })}
              >
                <FolderPlus /> Add unit
              </Button>
            )}
          </div>

          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
            </div>
          )}

          {data && shown.length === 0 && (
            <Card>
              <EmptyState
                icon={<Library />}
                title={materials.length ? 'Nothing here' : 'No materials yet'}
                description={
                  materials.length
                    ? 'Nothing in this folder matches.'
                    : 'Share a Google Drive file, Google Slides, a YouTube video or any link. Students will see it right away.'
                }
                action={
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    <Plus /> Share material
                  </Button>
                }
              />
            </Card>
          )}

          <div className="space-y-3">
            {shown.map((m) => (
              <Card
                key={m.id}
                className={cn('flex items-center gap-4 p-4', !m.published && 'bg-ink-50/60')}
              >
                <button
                  onClick={() => setPreview({ ...m, subtitle: folderPath(folders, m.folderId) })}
                  className="shrink-0"
                  title="Preview"
                >
                  <TypeIcon type={m.type} className={cn(!m.published && 'opacity-50')} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() =>
                        setPreview({ ...m, subtitle: folderPath(folders, m.folderId) })
                      }
                      className="truncate text-left font-semibold text-ink-900 hover:text-brand-700"
                    >
                      {m.title}
                    </button>
                    {!m.published && (
                      <Badge tone="neutral">
                        <EyeOff className="size-3" /> Hidden
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[13px] text-ink-500">
                    {[
                      folderPath(folders, m.folderId),
                      PROVIDER_LABEL[m.link.provider],
                      formatDate(m.createdAt),
                      m.createdBy,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {m.assignToAll ? (
                      <Badge tone="brand">
                        <Users className="size-3" /> All students
                      </Badge>
                    ) : (
                      m.departments.map((d) => (
                        <Badge key={d.id} tone="violet">
                          {d.name}
                        </Badge>
                      ))
                    )}
                    {!m.allowDownload && <Badge tone="warning">View only</Badge>}
                  </div>
                </div>
                <button
                  onClick={() => setActivityId(m.id)}
                  className="hidden shrink-0 rounded-xl px-3 py-2 text-right transition hover:bg-ink-50 sm:block"
                  title="See who opened it"
                >
                  <p className="tabular text-sm font-semibold text-ink-900">
                    {m.stats.viewers}{' '}
                    <span className="font-normal text-ink-500">
                      student{m.stats.viewers === 1 ? '' : 's'}
                    </span>
                  </p>
                  <p className="tabular text-[12px] text-ink-500">
                    {m.stats.downloads} download{m.stats.downloads === 1 ? '' : 's'}
                  </p>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Actions">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() =>
                        setPreview({ ...m, subtitle: folderPath(folders, m.folderId) })
                      }
                    >
                      <Eye /> Preview
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditing(m);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void togglePublished(m)}>
                      {m.published ? <EyeOff /> : <Eye />}
                      {m.published ? 'Hide from students' : 'Show to students'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setActivityId(m.id)}>
                      <BarChart3 /> Who opened it
                    </DropdownMenuItem>
                    {m.url ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          void navigator.clipboard.writeText(m.url!);
                          toast.success('Link copied');
                        }}
                      >
                        <Copy /> Copy link
                      </DropdownMenuItem>
                    ) : m.link.downloadUrl ? (
                      <DropdownMenuItem asChild>
                        <a href={m.link.downloadUrl} target="_blank" rel="noopener noreferrer">
                          <Download /> Download file
                        </a>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      danger
                      onSelect={() => setConfirm({ kind: 'material', item: m })}
                    >
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Card>
            ))}
          </div>
        </section>
      </div>

      <MaterialForm
        open={formOpen}
        onOpenChange={setFormOpen}
        orgId={orgId}
        folders={folders}
        editing={editing}
        defaultFolderId={filter && filter !== 'none' ? filter : null}
        onSaved={() => void reload()}
      />
      <MaterialViewer item={preview} onClose={() => setPreview(null)} />
      <ActivityDialog materialId={activityId} orgId={orgId} onClose={() => setActivityId(null)} />
      <FolderDialog
        state={folderDialog}
        folders={folders}
        orgId={orgId}
        onClose={() => setFolderDialog(null)}
        onSaved={(f) => {
          void reload();
          if (f) setFilter(f.id);
        }}
      />
      <Dialog open={Boolean(confirm)} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent
          title={
            confirm?.kind === 'folder'
              ? `Delete “${confirm.folder.name}”?`
              : `Delete “${confirm?.kind === 'material' ? confirm.item.title : ''}”?`
          }
          description={
            confirm?.kind === 'folder'
              ? 'The folder (and its units) is removed. Materials inside are kept and move to “Not in a folder”.'
              : 'Students will no longer see it. Its view history is deleted too.'
          }
          icon={<Trash2 />}
        >
          <div className="flex justify-end gap-2.5 px-6 pt-2 pb-6">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void doDelete()}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-ink-200/80 bg-white px-4 py-3 shadow-xs">
      <p className="flex items-center gap-1.5 text-[12px] text-ink-500 [&_svg]:size-3.5">
        {icon} {label}
      </p>
      <p className="tabular mt-0.5 text-xl font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function FolderButton({
  active,
  onClick,
  icon,
  label,
  count,
  indent,
  menu,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  indent?: boolean;
  menu?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'group flex items-center rounded-xl transition',
        indent && 'ml-5',
        active
          ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-100'
          : 'text-ink-700 hover:bg-ink-100',
      )}
    >
      <button
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-sm font-medium [&_svg]:size-4 [&_svg]:shrink-0"
      >
        <span className={active ? 'text-brand-600' : 'text-ink-400'}>{icon}</span>
        <span className="truncate">{label}</span>
        <span className="tabular ml-auto text-[12px] text-ink-400">{count}</span>
      </button>
      {menu}
    </div>
  );
}

function FolderMenu({
  onAddUnit,
  onRename,
  onDelete,
}: {
  onAddUnit?: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="mr-1 rounded-md p-1 text-ink-400 opacity-60 transition group-hover:opacity-100 hover:bg-white hover:text-ink-700"
          aria-label="Folder actions"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onAddUnit && (
          <DropdownMenuItem onSelect={onAddUnit}>
            <FolderPlus /> Add unit
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onRename}>
          <Pencil /> Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem danger onSelect={onDelete}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FolderDialog({
  state,
  folders,
  orgId,
  onClose,
  onSaved,
}: {
  state:
    | { mode: 'new'; parentId: string | null }
    | { mode: 'rename'; folder: MaterialFolderItem }
    | null;
  folders: MaterialFolderItem[];
  orgId: string;
  onClose: () => void;
  onSaved: (f: MaterialFolderItem | null) => void;
}) {
  const mutate = useApiMutation();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [openFor, setOpenFor] = useState<typeof state>(null);
  if (state !== openFor) {
    setOpenFor(state);
    setName(state?.mode === 'rename' ? state.folder.name : '');
  }
  const parent =
    state?.mode === 'new' && state.parentId ? folders.find((f) => f.id === state.parentId) : null;
  const isUnit = state?.mode === 'new' ? Boolean(state.parentId) : Boolean(state?.folder.parentId);

  async function save() {
    if (!state || !name.trim()) return;
    setBusy(true);
    try {
      if (state.mode === 'new') {
        const f = await mutate<MaterialFolderItem>(
          '/materials/folders',
          'POST',
          { name, parentId: state.parentId },
          orgId,
        );
        toast.success(isUnit ? 'Unit added' : 'Subject added');
        onSaved(f);
      } else {
        await mutate(`/materials/folders/${state.folder.id}`, 'PATCH', { name }, orgId);
        toast.success('Renamed');
        onSaved(null);
      }
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(state)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={
          state?.mode === 'rename'
            ? 'Rename'
            : isUnit
              ? `New unit in ${parent?.name ?? ''}`
              : 'New subject'
        }
        description={
          isUnit ? 'e.g. “Unit 1 — Microcontrollers”' : 'e.g. “Embedded Systems” or “Python Lab”'
        }
        icon={<FolderPlus />}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="space-y-5 px-6 pt-3 pb-6"
        >
          <Field label="Name" htmlFor="f-name">
            <Input
              id="f-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={120}
            />
          </Field>
          <div className="flex justify-end gap-2.5">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
