'use client';

import { useEffect, useState } from 'react';
import { Building, Check, ClipboardCheck, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { DepartmentSummary, LabCriterion, LabSummary } from '@arc/types';
import { Button, cn, Dialog, DialogContent, Field, Input, Textarea } from '@arc/ui';
import type { ApiError } from '@/lib/api';
import { useApi, useApiMutation } from '@/lib/use-api';
import { useDepartmentScope } from '@/lib/use-department-scope';

const PRESETS: { text: string; max: number }[] = [
  { text: 'Presentation', max: 5 },
  { text: 'Contribution in project', max: 5 },
  { text: 'Viva', max: 5 },
  { text: 'Working model / output', max: 10 },
  { text: 'Record / report', max: 5 },
  { text: 'Teamwork', max: 5 },
];

const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Row = { id: string; text: string; max: string };

/** Date input value (yyyy-mm-dd) ⇄ ISO at local noon (so the day never shifts across time zones). */
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const fromDateInput = (v: string) => (v ? new Date(`${v}T12:00:00`).toISOString() : null);

export function LabForm({
  open,
  onOpenChange,
  orgId,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  editing: LabSummary | null;
  onSaved: (id: string) => void;
}) {
  const mutate = useApiMutation();
  const scope = useDepartmentScope();
  const scopeId = scope?.id ?? null;
  const { data: departments = [] } = useApi<DepartmentSummary[]>(open ? '/departments' : null, {
    orgId,
  });
  const [title, setTitle] = useState('');
  const [heldOn, setHeldOn] = useState('');
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [all, setAll] = useState(true);
  const [depts, setDepts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? '');
    setHeldOn(editing ? toDateInput(editing.heldOn) : new Date().toISOString().slice(0, 10));
    setDescription(editing?.description ?? '');
    setRows(
      editing
        ? editing.criteria.map((c) => ({ id: c.id, text: c.text, max: String(c.max) }))
        : [
            { id: newId(), text: 'Presentation', max: '5' },
            { id: newId(), text: 'Contribution in project', max: '5' },
          ],
    );
    setAll(editing?.assignToAll ?? !scopeId);
    setDepts(editing?.departments.map((d) => d.id) ?? (scopeId ? [scopeId] : []));
    setError(null);
  }, [open, editing, scopeId]);

  const total = rows.reduce((s, r) => s + (Number(r.max) || 0), 0);
  const unused = PRESETS.filter(
    (p) => !rows.some((r) => r.text.toLowerCase() === p.text.toLowerCase()),
  );

  async function save() {
    const criteria: LabCriterion[] = rows
      .filter((r) => r.text.trim() || r.max)
      .map((r) => ({ id: r.id, text: r.text.trim(), max: Number(r.max) }));
    if (title.trim().length < 2) return setError('Enter a title');
    if (!criteria.length) return setError('Add at least one criterion');
    if (criteria.some((c) => !c.text)) return setError('Name each criterion');
    if (criteria.some((c) => !(c.max > 0)))
      return setError('Each criterion needs max marks above 0');
    if (!all && !depts.length) return setError('Choose at least one department');
    if (editing) {
      const removed = editing.criteria.filter((c) => !criteria.some((x) => x.id === c.id));
      if (
        removed.length &&
        editing.stats.marked > 0 &&
        !window.confirm(
          `Remove ${removed.map((c) => c.text).join(', ')}? Marks already given for it are dropped from the totals.`,
        )
      )
        return;
    }
    setError(null);
    setBusy(true);
    try {
      const body = {
        title,
        description: description || null,
        heldOn: fromDateInput(heldOn),
        criteria,
        assignToAll: all,
        departmentIds: all ? [] : depts,
      };
      const r = await mutate<{ id: string }>(
        editing ? `/labs/${editing.id}` : '/labs',
        editing ? 'PATCH' : 'POST',
        body,
        orgId,
      );
      toast.success(editing ? 'Lab updated' : 'Lab created — enter marks now');
      onSaved(r.id);
      onOpenChange(false);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? 'Edit lab' : 'New lab / project review'}
        description="Set the criteria once — then give every student marks on one sheet."
        icon={<ClipboardCheck />}
        className="max-w-2xl"
      >
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 pt-3 pb-2">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <Field label="Title" htmlFor="l-title" required>
              <Input
                id="l-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. IoT mini project review — Lab 3"
                autoFocus
                maxLength={200}
              />
            </Field>
            <Field label="Date" htmlFor="l-date">
              <Input
                id="l-date"
                type="date"
                value={heldOn}
                onChange={(e) => setHeldOn(e.target.value)}
              />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-sm font-medium text-ink-800">Criteria</p>
              <p className="text-[13px] text-ink-500">
                Total <b className="tabular text-ink-900">{Math.round(total * 100) / 100}</b> marks
              </p>
            </div>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="tabular w-5 text-right text-xs text-ink-400">{i + 1}.</span>
                  <Input
                    value={r.text}
                    onChange={(e) =>
                      setRows(rows.map((x) => (x.id === r.id ? { ...x, text: e.target.value } : x)))
                    }
                    placeholder="e.g. Presentation"
                    maxLength={120}
                    aria-label={`Criterion ${i + 1}`}
                  />
                  <div className="relative w-28 shrink-0">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0.5}
                      step={0.5}
                      value={r.max}
                      onChange={(e) =>
                        setRows(
                          rows.map((x) => (x.id === r.id ? { ...x, max: e.target.value } : x)),
                        )
                      }
                      className="pr-10 text-right"
                      aria-label={`Max marks for criterion ${i + 1}`}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-400">
                      marks
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
                    disabled={rows.length === 1}
                    aria-label="Remove criterion"
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setRows([...rows, { id: newId(), text: '', max: '5' }])}
              >
                <Plus /> Add criterion
              </Button>
              {unused.slice(0, 4).map((p) => (
                <button
                  key={p.text}
                  type="button"
                  onClick={() =>
                    setRows([...rows, { id: newId(), text: p.text, max: String(p.max) }])
                  }
                  className="rounded-full border border-dashed border-ink-300 px-3 py-1 text-[12.5px] text-ink-600 transition hover:border-brand-400 hover:text-brand-700"
                >
                  + {p.text} /{p.max}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <p className="text-sm font-medium text-ink-800">Students</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(scope
                ? [{ v: false, label: `${scope.name} students`, icon: Building }]
                : [
                    { v: true, label: 'All students', icon: Users },
                    { v: false, label: 'Chosen departments', icon: Building },
                  ]
              ).map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setAll(o.v)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition',
                    all === o.v
                      ? 'border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500'
                      : 'border-ink-200 text-ink-700 hover:border-ink-300',
                  )}
                >
                  <o.icon className="size-4" />
                  {o.label}
                </button>
              ))}
            </div>
            {!all && (
              <div className="flex flex-wrap gap-2">
                {departments.map((d) => {
                  const on = depts.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() =>
                        setDepts(on ? depts.filter((x) => x !== d.id) : [...depts, d.id])
                      }
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition',
                        on
                          ? 'border-brand-500 bg-brand-600 text-white'
                          : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
                      )}
                    >
                      {on && <Check className="size-3.5" />}
                      {d.name}
                      <span className={on ? 'text-brand-100' : 'text-ink-400'}>
                        {d.memberCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Field label="Notes" htmlFor="l-desc" optional>
            <Textarea
              id="l-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What the lab / project was about (students see this)"
              maxLength={2000}
            />
          </Field>
          {error && <p className="text-[13px] text-rose-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2.5 border-t border-ink-100 px-6 py-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            {editing ? 'Save changes' : 'Create & enter marks'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
