'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  hasPermission,
  type LabCriterion,
  type LabSheet,
  type LabStats,
  type OrgRole,
} from '@arc/types';
import {
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
  Input,
  Select,
  Skeleton,
} from '@arc/ui';
import { LabForm } from '@/components/labs/LabForm';
import { useAuth } from '@/components/providers/AuthProvider';
import { useOrg } from '@/components/providers/OrgProvider';
import { OrgRequired } from '@/components/shell/OrgRequired';
import { PageHeader } from '@/components/shell/PageHeader';
import { downloadFile } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/use-api';

export default function LabSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <OrgRequired title="Lab marks" description="" permission="lab.view">
      {(org) => <Sheet id={id} orgId={org.id} />}
    </OrgRequired>
  );
}

type Edit = { scores: Record<string, string>; absent: boolean; remarks: string };
type RowStatus = 'dirty' | 'saving' | 'saved' | 'error';

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseScore(v: string, max: number): number | null | 'bad' {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > max) return 'bad';
  return n;
}

function Sheet({ id, orgId }: { id: string; orgId: string }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const { current, isSuperAdmin } = useOrg();
  const canMark = isSuperAdmin || hasPermission((current?.roles ?? []) as OrgRole[], 'lab.marks');
  const mutate = useApiMutation();
  const { data, mutate: reload, error } = useApi<LabSheet>(`/labs/${id}`, { orgId });
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [stats, setStats] = useState<LabStats | null>(null);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const editsRef = useRef(edits);
  editsRef.current = edits;

  const criteria: LabCriterion[] = useMemo(() => data?.criteria ?? [], [data]);

  // Load server values into the sheet (without overwriting rows being edited).
  useEffect(() => {
    if (!data) return;
    setStats(data.stats);
    setEdits((prev) => {
      const next = { ...prev };
      for (const r of data.rows) {
        if (status[r.userId] === 'dirty' || status[r.userId] === 'saving') continue;
        next[r.userId] = {
          scores: Object.fromEntries(
            data.criteria.map((c) => [c.id, r.scores[c.id] == null ? '' : String(r.scores[c.id])]),
          ),
          absent: r.absent,
          remarks: r.remarks ?? '',
        };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const save = useCallback(
    async (userId: string) => {
      const e = editsRef.current[userId];
      if (!e) return;
      const scores: Record<string, number | null> = {};
      for (const c of criteria) {
        const v = parseScore(e.scores[c.id] ?? '', c.max);
        if (v === 'bad') {
          setStatus((s) => ({ ...s, [userId]: 'error' }));
          return;
        }
        scores[c.id] = v;
      }
      setStatus((s) => ({ ...s, [userId]: 'saving' }));
      try {
        const r = await mutate<{ stats: LabStats }>(
          `/labs/${id}/marks`,
          'PUT',
          { marks: [{ userId, scores, absent: e.absent, remarks: e.remarks || null }] },
          orgId,
        );
        setStats(r.stats);
        // Still the same values? Then it's saved; otherwise another save is queued.
        setStatus((s) => ({
          ...s,
          [userId]: editsRef.current[userId] === e ? 'saved' : (s[userId] ?? 'dirty'),
        }));
      } catch (err) {
        setStatus((s) => ({ ...s, [userId]: 'error' }));
        toast.error((err as Error).message);
      }
    },
    [criteria, id, orgId, mutate],
  );

  function change(userId: string, patch: Partial<Edit>, delay = 700) {
    setEdits((prev) => {
      const cur = prev[userId] ?? { scores: {}, absent: false, remarks: '' };
      return {
        ...prev,
        [userId]: { ...cur, ...patch, scores: { ...cur.scores, ...patch.scores } },
      };
    });
    setStatus((s) => ({ ...s, [userId]: 'dirty' }));
    clearTimeout(timers.current[userId]);
    timers.current[userId] = setTimeout(() => void save(userId), delay);
  }

  // Save anything pending when leaving the page.
  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);
  const pending = Object.values(status).some((s) => s === 'dirty' || s === 'saving');
  useEffect(() => {
    if (!pending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);

  const departments = useMemo(
    () => [...new Set((data?.rows ?? []).map((r) => r.department).filter(Boolean))] as string[],
    [data],
  );
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (r) =>
        (!dept || r.department === dept) &&
        (!q || `${r.fullName} ${r.externalId ?? ''}`.toLowerCase().includes(q)),
    );
  }, [data, search, dept]);

  function move(row: number, col: number, dRow: number) {
    const el = document.querySelector<HTMLInputElement>(`[data-cell="${row + dRow}:${col}"]`);
    if (el) {
      el.focus();
      el.select();
    }
  }

  async function exportCsv() {
    try {
      await downloadFile(`/labs/${id}/marks.csv`, {
        token: await getToken(),
        orgId,
        fallbackName: 'lab-marks.csv',
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove() {
    try {
      await mutate(`/labs/${id}`, 'DELETE', undefined, orgId);
      toast.success('Lab deleted');
      router.push('/labs');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (error)
    return (
      <Card className="p-8 text-center text-sm text-ink-600">
        This lab couldn’t be loaded. It may have been deleted.
      </Card>
    );
  if (!data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );

  const s = stats ?? data.stats;
  const pct = (v: number | null) =>
    v === null || !data.maxTotal ? '' : `${Math.round((v / data.maxTotal) * 100)}%`;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Lab marks', href: '/labs' }, { label: data.title }]}
        title={data.title}
        description={
          <>
            {data.heldOn && <>{formatDate(data.heldOn)} · </>}
            {data.assignToAll ? 'All students' : data.departments.map((d) => d.name).join(', ')} ·
            out of {data.maxTotal}
            {data.description && <span className="mt-1 block">{data.description}</span>}
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => void exportCsv()}>
              <Download /> Export CSV
            </Button>
            {canMark && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="icon" aria-label="More">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                    <Pencil /> Edit lab & criteria
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem danger onSelect={() => setConfirmDelete(true)}>
                    <Trash2 /> Delete lab
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Students" value={s.students} />
        <Stat label="Marked" value={s.marked} sub={s.students ? `of ${s.students}` : undefined} />
        <Stat label="Absent" value={s.absent} />
        <Stat
          label="Class average"
          value={s.average ?? '–'}
          sub={s.average !== null ? `/${data.maxTotal} · ${pct(s.average)}` : undefined}
          highlight
        />
        <Stat
          label="Highest"
          value={s.highest ?? '–'}
          sub={s.highest !== null ? pct(s.highest) : undefined}
        />
        <Stat
          label="Lowest"
          value={s.lowest ?? '–'}
          sub={s.lowest !== null ? pct(s.lowest) : undefined}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or roll no."
              className="pl-9"
            />
          </div>
          {departments.length > 1 && (
            <Select value={dept} onChange={(e) => setDept(e.target.value)} className="sm:w-48">
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          )}
          <p className="text-[12.5px] text-ink-500">
            {canMark ? 'Saves automatically · Enter ↓ moves down' : 'View only'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-ink-50/70 text-left text-[12px] text-ink-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Student</th>
                {criteria.map((c) => (
                  <th key={c.id} className="w-28 px-2 py-2.5 text-center font-medium">
                    <span className="block truncate text-ink-700" title={c.text}>
                      {c.text}
                    </span>
                    <span className="tabular">
                      /{c.max}
                      {s.criteriaAverage[c.id] != null && (
                        <span className="text-ink-400"> · avg {s.criteriaAverage[c.id]}</span>
                      )}
                    </span>
                  </th>
                ))}
                <th className="w-24 px-2 py-2.5 text-center font-medium text-ink-700">
                  Total{' '}
                  <span className="tabular block font-normal text-ink-500">/{data.maxTotal}</span>
                </th>
                <th className="w-20 px-2 py-2.5 text-center font-medium">Absent</th>
                <th className="min-w-44 px-2 py-2.5 font-medium">Remarks</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((r, ri) => {
                const e = edits[r.userId] ?? { scores: {}, absent: false, remarks: '' };
                const parsed = criteria.map((c) => parseScore(e.scores[c.id] ?? '', c.max));
                const nums = parsed.filter((v): v is number => typeof v === 'number');
                const total =
                  e.absent || !nums.length ? null : round2(nums.reduce((a, b) => a + b, 0));
                const st = status[r.userId];
                return (
                  <tr key={r.userId} className={cn(e.absent && 'bg-ink-50/60')}>
                    <td className="px-4 py-2">
                      <p className="font-medium text-ink-900">{r.fullName}</p>
                      <p className="text-[12px] text-ink-500">
                        {[r.externalId, r.department].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    {criteria.map((c, ci) => {
                      const bad = parsed[ci] === 'bad';
                      return (
                        <td key={c.id} className="px-2 py-2">
                          <input
                            data-cell={`${ri}:${ci}`}
                            type="text"
                            inputMode="decimal"
                            value={e.scores[c.id] ?? ''}
                            disabled={!canMark || e.absent}
                            onChange={(ev) =>
                              change(r.userId, {
                                scores: { [c.id]: ev.target.value.replace(',', '.') },
                              })
                            }
                            onFocus={(ev) => ev.target.select()}
                            onKeyDown={(ev) => {
                              if (ev.key === 'Enter' || ev.key === 'ArrowDown') {
                                ev.preventDefault();
                                move(ri, ci, 1);
                              } else if (ev.key === 'ArrowUp') {
                                ev.preventDefault();
                                move(ri, ci, -1);
                              }
                            }}
                            aria-label={`${c.text} for ${r.fullName}`}
                            title={bad ? `Enter 0 – ${c.max}` : undefined}
                            className={cn(
                              'tabular h-9 w-full rounded-lg border bg-white px-2 text-center outline-none transition focus:ring-3',
                              bad
                                ? 'border-rose-400 text-rose-700 focus:ring-rose-500/20'
                                : 'border-ink-200 focus:border-brand-500 focus:ring-brand-500/20',
                              'disabled:border-transparent disabled:bg-transparent disabled:text-ink-400',
                            )}
                          />
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-center">
                      {e.absent ? (
                        <span className="text-[12px] font-medium text-ink-500">AB</span>
                      ) : (
                        <span className="tabular font-semibold text-ink-900">{total ?? '–'}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={e.absent}
                        disabled={!canMark}
                        onChange={(ev) => change(r.userId, { absent: ev.target.checked }, 0)}
                        className="size-4 accent-brand-600"
                        aria-label={`${r.fullName} absent`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={e.remarks}
                        disabled={!canMark}
                        maxLength={500}
                        onChange={(ev) => change(r.userId, { remarks: ev.target.value }, 1200)}
                        placeholder={canMark ? 'Optional' : ''}
                        className="h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-[13px] outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/20 disabled:border-transparent disabled:bg-transparent"
                        aria-label={`Remarks for ${r.fullName}`}
                      />
                    </td>
                    <td className="pr-3">
                      {st === 'saving' || st === 'dirty' ? (
                        <Loader2 className="size-4 animate-spin text-ink-400" aria-label="Saving" />
                      ) : st === 'saved' ? (
                        <CheckCircle2 className="size-4 text-emerald-500" aria-label="Saved" />
                      ) : st === 'error' ? (
                        <button
                          onClick={() => void save(r.userId)}
                          title="Not saved — fix the marks or click to retry"
                        >
                          <AlertCircle className="size-4 text-rose-500" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="px-6 py-10 text-center text-sm text-ink-500">
              {data.rows.length ? 'No students match.' : 'No students in this lab yet.'}
            </p>
          )}
        </div>
      </Card>

      {canMark && (
        <LabForm
          open={editOpen}
          onOpenChange={setEditOpen}
          orgId={orgId}
          editing={data}
          onSaved={() => void reload()}
        />
      )}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title={`Delete “${data.title}”?`}
          description="All marks in this lab are deleted and students will no longer see them."
          icon={<Trash2 />}
        >
          <div className="flex justify-end gap-2.5 px-6 pt-2 pb-6">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void remove()}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: number | string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3 shadow-xs',
        highlight ? 'border-brand-200 bg-brand-50/60' : 'border-ink-200/80 bg-white',
      )}
    >
      <p className="text-[12px] text-ink-500">{label}</p>
      <p className="tabular mt-0.5 text-xl font-semibold text-ink-900">
        {value}
        {sub && <span className="ml-1 text-[13px] font-medium text-ink-400">{sub}</span>}
      </p>
    </div>
  );
}
