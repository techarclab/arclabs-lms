'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FileSpreadsheet,
  MailPlus,
  Merge,
  MoreHorizontal,
  Pencil,
  Search,
  Send,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  DepartmentSummary,
  DuplicateGroup,
  MemberState,
  MemberSummary,
  Paginated,
} from '@arc/types';
import {
  Avatar,
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
  Input,
  Select,
  Skeleton,
} from '@arc/ui';
import { timeAgo } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/use-api';
import { BulkImportDialog } from './BulkImportDialog';
import { DuplicatesDialog } from './DuplicatesDialog';
import { MergeIntoDialog } from './MergeIntoDialog';
import { EditMemberDialog } from './EditMemberDialog';
import { InviteMemberDialog } from './InviteMemberDialog';
import { MemberStateBadge, RoleBadges, ROLE_OPTIONS } from './shared';

const PAGE_SIZE = 15;
const TABS: { value: MemberState | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INVITED', label: 'Invited' },
  { value: 'INACTIVE', label: 'Deactivated' },
];

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function MembersPanel({
  orgId,
  orgName,
  canGrantAdmin,
  readOnly = false,
  onChanged,
  inviteSignal,
  importSignal,
}: {
  orgId: string;
  orgName: string;
  canGrantAdmin: boolean;
  /** Viewers can browse and search members but not change them. */
  readOnly?: boolean;
  onChanged?: () => void;
  /** Increment to open the invite dialog from outside (e.g. page header button). */
  inviteSignal?: number;
  importSignal?: number;
}) {
  const mutate = useApiMutation();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<MemberState | 'ALL'>('ALL');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<MemberSummary | null>(null);
  const [mergeFrom, setMergeFrom] = useState<MemberSummary | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  /** Who the confirm dialog is about: some people, or everyone deactivated. */
  const [removing, setRemoving] = useState<
    { kind: 'some'; people: MemberSummary[] } | { kind: 'deactivated' } | null
  >(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const q = useDebounced(search);

  useEffect(() => {
    if (inviteSignal) setInviteOpen(true);
  }, [inviteSignal]);
  useEffect(() => {
    if (importSignal) setImportOpen(true);
  }, [importSignal]);
  useEffect(() => setPage(1), [q, tab, role, orgId]);
  useEffect(() => setSelected([]), [q, tab, role, orgId, page]);

  const query = useMemo(() => {
    const sp = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (q) sp.set('search', q);
    if (tab !== 'ALL') sp.set('status', tab);
    if (role) sp.set('role', role);
    return `/members?${sp}`;
  }, [page, q, tab, role]);

  const {
    data,
    isLoading,
    mutate: reload,
  } = useApi<Paginated<MemberSummary>>(query, { orgId, keepPreviousData: true });
  const { data: departments = [], mutate: reloadDepts } = useApi<DepartmentSummary[]>(
    '/departments',
    { orgId },
  );
  const { data: duplicates = [], mutate: reloadDups } = useApi<DuplicateGroup[]>(
    readOnly ? null : '/members/duplicates',
    { orgId },
  );
  const [dupOpen, setDupOpen] = useState(false);
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(q || tab !== 'ALL' || role);

  const refresh = () => {
    void reload();
    void reloadDepts();
    void reloadDups();
    onChanged?.();
  };

  async function setActive(m: MemberSummary, active: boolean) {
    try {
      await mutate(`/members/${m.id}`, 'PATCH', { status: active ? 'ACTIVE' : 'INACTIVE' }, orgId);
      toast.success(active ? `${m.fullName} reactivated` : `${m.fullName} deactivated`);
      refresh();
    } catch (e) {
      toast.error('Could not update', { description: (e as Error).message });
    }
  }

  const pageRows = (data?.data ?? []).filter((m) => !m.isSelf);
  const allOnPage = pageRows.length > 0 && pageRows.every((m) => selected.includes(m.id));
  const toggle = (id: string) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      const r = await mutate<{ removed: number; skipped: { name: string; reason: string }[] }>(
        '/members/remove',
        'POST',
        removing.kind === 'deactivated'
          ? { allDeactivated: true }
          : { ids: removing.people.map((m) => m.id) },
        orgId,
      );
      toast.success(`${r.removed} ${r.removed === 1 ? 'person' : 'people'} removed`, {
        description: r.skipped.length
          ? `Not removed: ${r.skipped.map((x) => `${x.name} (${x.reason})`).join(', ')}`
          : undefined,
      });
      setSelected([]);
      setRemoving(null);
      refresh();
    } catch (e) {
      toast.error('Could not remove', { description: (e as Error).message });
    } finally {
      setRemoveBusy(false);
    }
  }

  async function resend(m: MemberSummary) {
    try {
      const r = await mutate<{ emailQueued: boolean; inviteLink?: string }>(
        `/members/${m.id}/resend-invite`,
        'POST',
        undefined,
        orgId,
      );
      toast.success('Invitation re-sent', {
        description: r.inviteLink
          ? 'Development: link copied to clipboard.'
          : `A new link was emailed to ${m.email}.`,
      });
      if (r.inviteLink) void navigator.clipboard?.writeText(r.inviteLink).catch(() => {});
    } catch (e) {
      toast.error('Could not resend', { description: (e as Error).message });
    }
  }

  return (
    <>
      {!readOnly && duplicates.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3.5 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-amber-900">
            <b>{duplicates.length}</b> student{duplicates.length === 1 ? ' is' : 's are'} registered
            more than once (same roll number or college email).
          </p>
          <Button size="sm" onClick={() => setDupOpen(true)}>
            <Merge /> Review &amp; merge
          </Button>
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-ink-100 px-4 py-3.5 lg:flex-row lg:items-center">
          <div className="flex rounded-lg bg-ink-100/80 p-0.5">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[13px] font-medium transition',
                  tab === t.value
                    ? 'bg-white text-ink-900 shadow-xs'
                    : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-wrap gap-3 lg:justify-end">
            <div className="min-w-56 flex-1 lg:max-w-xs">
              <Input
                leading={<Search />}
                placeholder="Search name, email or roll no."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="w-44">
              <Select value={role} onChange={(e) => setRole(e.target.value)} className="h-9">
                <option value="">All roles</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {!readOnly && (selected.length > 0 || (tab === 'INACTIVE' && total > 0)) && (
          <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 bg-ink-50/70 px-6 py-2.5">
            <p className="flex-1 text-sm text-ink-700">
              {selected.length > 0 ? (
                <>
                  <b className="font-semibold text-ink-900">{selected.length}</b> selected
                </>
              ) : (
                <>
                  <b className="font-semibold text-ink-900">{total}</b> deactivated
                  {total === 1 ? ' person' : ' people'}
                </>
              )}
            </p>
            {selected.length > 0 ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    setRemoving({
                      kind: 'some',
                      people: (data?.data ?? []).filter((m) => selected.includes(m.id)),
                    })
                  }
                >
                  <Trash2 /> Remove {selected.length}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                  <X /> Clear
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setRemoving({ kind: 'deactivated' })}
              >
                <Trash2 /> Remove all {total} deactivated
              </Button>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs text-ink-500">
                <th className="py-2.5 pr-3 pl-6 font-medium">
                  <span className="flex items-center gap-3">
                    {!readOnly && (
                      <input
                        type="checkbox"
                        aria-label="Select everyone on this page"
                        checked={allOnPage}
                        disabled={!pageRows.length}
                        onChange={() =>
                          setSelected((p) =>
                            allOnPage
                              ? p.filter((id) => !pageRows.some((m) => m.id === id))
                              : [...new Set([...p, ...pageRows.map((m) => m.id)])],
                          )
                        }
                        className="size-4 accent-brand-600"
                      />
                    )}
                    Person
                  </span>
                </th>
                <th className="px-3 py-2.5 font-medium">Roles</th>
                <th className="px-3 py-2.5 font-medium">Department</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Last active</th>
                <th className="w-12 py-2.5 pr-4 pl-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {isLoading &&
                !data &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="py-3 pr-3 pl-6">
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-9 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-3.5 w-40" />
                          <Skeleton className="h-3 w-56" />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              {data?.data.map((m) => (
                <tr
                  key={m.id}
                  className={cn(
                    'group transition hover:bg-ink-50/70',
                    m.state === 'INACTIVE' && 'opacity-60',
                  )}
                >
                  <td className="py-3 pr-3 pl-6">
                    <div className="flex items-center gap-3">
                      {!readOnly && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${m.fullName}`}
                          checked={selected.includes(m.id)}
                          disabled={m.isSelf}
                          onChange={() => toggle(m.id)}
                          className="size-4 shrink-0 accent-brand-600 disabled:opacity-30"
                        />
                      )}
                      <Avatar name={m.fullName} size="md" round className="size-9 text-xs" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink-900">
                          {m.fullName}
                          {m.isSelf && (
                            <span className="ml-2 text-xs font-normal text-ink-400">(you)</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-ink-500">
                          {m.email}
                          {m.collegeEmail && m.collegeEmail !== m.email && (
                            <span className="ml-2 text-ink-400">· {m.collegeEmail}</span>
                          )}
                          {m.externalId && (
                            <span className="ml-2 font-mono text-ink-400">{m.externalId}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <RoleBadges roles={m.roles} />
                  </td>
                  <td className="px-3 py-3 text-ink-600">
                    {m.department?.name ?? <span className="text-ink-300">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <MemberStateBadge state={m.state} />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-ink-500">
                    {m.lastLoginAt ? (
                      timeAgo(m.lastLoginAt)
                    ) : (
                      <span className="text-ink-400">Never</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 pl-3">
                    {!readOnly && (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="rounded-lg p-1.5 text-ink-400 opacity-60 transition group-hover:opacity-100 hover:bg-ink-100 hover:text-ink-700 data-[state=open]:bg-ink-100 data-[state=open]:opacity-100">
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem icon={<Pencil />} onSelect={() => setEditing(m)}>
                            Edit name, email & roles
                          </DropdownMenuItem>
                          {m.state === 'INVITED' && (
                            <DropdownMenuItem icon={<Send />} onSelect={() => resend(m)}>
                              Resend invitation
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            icon={<Copy />}
                            onSelect={() => {
                              void navigator.clipboard.writeText(m.email);
                              toast.success('Email copied');
                            }}
                          >
                            Copy email
                          </DropdownMenuItem>
                          {!m.isSelf && (
                            <DropdownMenuItem icon={<Merge />} onSelect={() => setMergeFrom(m)}>
                              Merge into another account…
                            </DropdownMenuItem>
                          )}
                          {!m.isSelf && (
                            <>
                              <DropdownMenuSeparator />
                              {m.state === 'INACTIVE' ? (
                                <DropdownMenuItem
                                  icon={<UserCheck />}
                                  onSelect={() => setActive(m, true)}
                                >
                                  Reactivate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  danger
                                  icon={<UserMinus />}
                                  onSelect={() => setActive(m, false)}
                                >
                                  Deactivate
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                danger
                                icon={<Trash2 />}
                                onSelect={() => setRemoving({ kind: 'some', people: [m] })}
                              >
                                Remove from {orgName.length > 24 ? 'college' : orgName}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && data.data.length === 0 && (
          <EmptyState
            icon={<Users />}
            title={filtered ? 'No one matches these filters' : 'No members yet'}
            description={
              filtered
                ? 'Try a different search or clear the filters.'
                : `Invite learners, instructors and admins to ${orgName}.`
            }
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setTab('ALL');
                    setRole('');
                  }}
                >
                  Clear filters
                </Button>
              ) : readOnly ? null : (
                <div className="flex gap-2.5">
                  <Button variant="secondary" onClick={() => setImportOpen(true)}>
                    <FileSpreadsheet /> Import CSV
                  </Button>
                  <Button onClick={() => setInviteOpen(true)}>
                    <MailPlus /> Invite people
                  </Button>
                </div>
              )
            }
          />
        )}

        {total > 0 && (
          <div className="flex items-center justify-between border-t border-ink-100 px-6 py-3 text-sm text-ink-500">
            <span>
              Showing <b className="font-medium text-ink-800">{(page - 1) * PAGE_SIZE + 1}</b>–
              <b className="font-medium text-ink-800">{Math.min(page * PAGE_SIZE, total)}</b> of{' '}
              <b className="font-medium text-ink-800">{total}</b>
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

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        orgId={orgId}
        orgName={orgName}
        departments={departments}
        canGrantAdmin={canGrantAdmin}
        onInvited={refresh}
      />
      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        orgId={orgId}
        canGrantAdmin={canGrantAdmin}
        onImported={refresh}
      />
      <Dialog open={removing !== null} onOpenChange={(o) => !o && !removeBusy && setRemoving(null)}>
        <DialogContent
          icon={<Trash2 />}
          title={
            removing?.kind === 'deactivated'
              ? `Remove all ${total} deactivated people?`
              : removing?.people.length === 1
                ? `Remove ${removing.people[0]!.fullName}?`
                : `Remove ${removing?.kind === 'some' ? removing.people.length : 0} people?`
          }
          description={`They are taken out of ${orgName} and disappear from its lists. Their ARC LABS account and any exam results already given are kept. To bring someone back, invite them again or share a join code.`}
        >
          {removing?.kind === 'some' && removing.people.length > 1 && (
            <ul className="mx-6 mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-ink-50 px-4 py-3 text-[13px] text-ink-700">
              {removing.people.map((m) => (
                <li key={m.id} className="truncate">
                  {m.fullName} <span className="text-ink-400">· {m.email}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 flex justify-end gap-3 rounded-b-2xl border-t border-ink-100 bg-ink-50/60 px-6 py-4">
            <Button variant="secondary" disabled={removeBusy} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={removeBusy} onClick={() => void confirmRemove()}>
              <Trash2 /> Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <MergeIntoDialog
        source={mergeFrom}
        onOpenChange={(o) => !o && setMergeFrom(null)}
        orgId={orgId}
        onMerged={refresh}
      />
      <DuplicatesDialog
        open={dupOpen}
        onOpenChange={setDupOpen}
        orgId={orgId}
        groups={duplicates}
        onMerged={refresh}
      />
      <EditMemberDialog
        member={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        orgId={orgId}
        departments={departments}
        canGrantAdmin={canGrantAdmin}
        onSaved={refresh}
      />
    </>
  );
}
