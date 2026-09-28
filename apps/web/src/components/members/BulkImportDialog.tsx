'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  MinusCircle,
  Upload,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { BulkInviteResult } from '@arc/types';
import { MAX_BULK_INVITES, orgRoleSchema, parseMembersCsv } from '@arc/validation';
import { Badge, Button, cn, Dialog, DialogContent, Select } from '@arc/ui';
import { useApiMutation } from '@/lib/use-api';
import { ROLE_LABEL } from '@/lib/format';

const TEMPLATE = `email,full name,role,department,roll no
priya.sharma@college.edu,Priya Sharma,Learner,ECE,21A91A0401
ravi.kumar@college.edu,Ravi Kumar,Learner,ECE,21A91A0402
anita.rao@college.edu,Anita Rao,Instructor;Evaluator,,
`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Row = ReturnType<typeof parseMembersCsv>[number] & { problem?: string };

function check(rows: Row[]): Row[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    const email = r.email.toLowerCase();
    let problem: string | undefined;
    if (!EMAIL_RE.test(email)) problem = 'Invalid email';
    else if (seen.has(email)) problem = 'Duplicate in file';
    else if (r.roles?.some((x) => !orgRoleSchema.safeParse(x).success))
      problem = `Unknown role: ${r.roles.find((x) => !orgRoleSchema.safeParse(x).success)}`;
    seen.add(email);
    return { ...r, email, problem };
  });
}

export function BulkImportDialog({
  open,
  onOpenChange,
  orgId,
  canGrantAdmin,
  onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orgId: string;
  canGrantAdmin: boolean;
  onImported: () => void;
}) {
  const mutate = useApiMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [defaultRole, setDefaultRole] = useState('LEARNER');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkInviteResult | null>(null);

  useEffect(() => {
    if (!open) {
      setFileName(null);
      setRows([]);
      setResult(null);
      setDefaultRole('LEARNER');
    }
  }, [open]);

  const valid = useMemo(() => rows.filter((r) => !r.problem), [rows]);
  const invalid = rows.length - valid.length;

  async function load(file: File) {
    if (!/\.(csv|txt)$/i.test(file.name)) {
      toast.error('Please choose a .csv file', {
        description: 'In Excel: File → Save As → CSV (Comma delimited).',
      });
      return;
    }
    const parsed = check(parseMembersCsv(await file.text()));
    if (!parsed.length) {
      toast.error('No rows found', {
        description: 'The file needs a header row with at least an “email” column.',
      });
      return;
    }
    if (parsed.length > MAX_BULK_INVITES) {
      toast.error(`Too many rows (${parsed.length})`, {
        description: `Import up to ${MAX_BULK_INVITES} people at a time.`,
      });
      return;
    }
    setFileName(file.name);
    setRows(parsed);
  }

  async function runImport() {
    setBusy(true);
    try {
      const r = await mutate<BulkInviteResult>(
        '/members/bulk',
        'POST',
        {
          defaultRoles: [defaultRole],
          rows: valid.map(({ problem: _p, ...row }) => row),
        },
        orgId,
      );
      setResult(r);
      onImported();
    } catch (e) {
      toast.error('Import failed', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const statusIcon = {
    invited: <CheckCircle2 className="size-4 text-emerald-500" />,
    added: <CheckCircle2 className="size-4 text-sky-500" />,
    skipped: <MinusCircle className="size-4 text-ink-400" />,
    error: <XCircle className="size-4 text-rose-500" />,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={result ? 'Import complete' : 'Import from CSV'}
        description={
          result
            ? undefined
            : 'Invite a whole class or team at once. Everyone gets an email to set up their account.'
        }
        icon={<FileSpreadsheet />}
        className="max-w-2xl"
      >
        {result ? (
          <div className="px-6 pt-3 pb-6">
            <div className="grid grid-cols-4 gap-3">
              {[
                ['Invited', result.invited, 'text-emerald-600'],
                ['Added', result.added, 'text-sky-600'],
                ['Skipped', result.skipped, 'text-ink-600'],
                ['Errors', result.errors, 'text-rose-600'],
              ].map(([k, v, c]) => (
                <div key={k as string} className="rounded-xl border border-ink-200 p-3 text-center">
                  <p className={cn('tabular text-2xl font-semibold', c as string)}>{v}</p>
                  <p className="text-xs text-ink-500">{k}</p>
                </div>
              ))}
            </div>
            {result.results.some((r) => r.status !== 'invited') && (
              <div className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-ink-200">
                {result.results
                  .filter((r) => r.status !== 'invited')
                  .map((r) => (
                    <div
                      key={r.row}
                      className="flex items-center gap-3 border-b border-ink-100 px-3.5 py-2 text-sm last:border-0"
                    >
                      {statusIcon[r.status]}
                      <span className="w-12 text-xs text-ink-400">Row {r.row}</span>
                      <span className="flex-1 truncate text-ink-800">{r.email || '—'}</span>
                      <span className="text-xs text-ink-500">
                        {r.status === 'added' ? 'Existing account added' : r.message}
                      </span>
                    </div>
                  ))}
              </div>
            )}
            <div className="mt-6 flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="max-h-[65vh] space-y-5 overflow-y-auto px-6 pt-4 pb-6">
              {!rows.length ? (
                <>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      const f = e.dataTransfer.files[0];
                      if (f) void load(f);
                    }}
                    className={cn(
                      'flex w-full flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
                      dragging
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50',
                    )}
                  >
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                      <Upload className="size-5" />
                    </span>
                    <p className="mt-4 text-sm font-medium text-ink-900">
                      Drop a CSV file here, or click to browse
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      Columns: email (required), full name, role, department, roll no · up to{' '}
                      {MAX_BULK_INVITES} rows
                    </p>
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void load(f);
                      e.target.value = '';
                    }}
                  />
                  <div className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-3 text-sm">
                    <span className="text-ink-600">Not sure about the format?</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'arc-labs-members-template.csv';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download /> Download template
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-1.5 text-sm">
                      <FileSpreadsheet className="size-4 text-emerald-600" /> {fileName}
                    </span>
                    <Badge tone="success">{valid.length} ready</Badge>
                    {invalid > 0 && <Badge tone="danger">{invalid} with problems</Badge>}
                    <button
                      className="ml-auto text-sm text-brand-600 hover:underline"
                      onClick={() => setRows([])}
                    >
                      Choose another file
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-ink-600">Role for rows without one</span>
                    <div className="w-44">
                      <Select
                        value={defaultRole}
                        onChange={(e) => setDefaultRole(e.target.value)}
                        className="h-9"
                      >
                        {[
                          'LEARNER',
                          'INSTRUCTOR',
                          'EVALUATOR',
                          'CONTENT_MANAGER',
                          ...(canGrantAdmin ? ['ORG_ADMIN'] : []),
                        ].map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-auto rounded-xl border border-ink-200">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-ink-50 text-left text-xs text-ink-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">#</th>
                          <th className="px-3 py-2 font-medium">Email</th>
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 font-medium">Role</th>
                          <th className="px-3 py-2 font-medium">Dept.</th>
                          <th className="px-3 py-2 font-medium">Roll no.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {rows.map((r, i) => (
                          <tr key={i} className={cn(r.problem && 'bg-rose-50/60')}>
                            <td className="px-3 py-2 text-xs text-ink-400">{i + 2}</td>
                            <td className="px-3 py-2">
                              <span className={cn(r.problem ? 'text-rose-700' : 'text-ink-800')}>
                                {r.email || '—'}
                              </span>
                              {r.problem && (
                                <span className="mt-0.5 flex items-center gap-1 text-xs text-rose-600">
                                  <AlertCircle className="size-3" /> {r.problem}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-ink-700">
                              {r.fullName ?? <span className="text-ink-400">—</span>}
                            </td>
                            <td className="px-3 py-2 text-ink-600">
                              {(r.roles ?? [defaultRole]).map((x) => ROLE_LABEL[x] ?? x).join(', ')}
                            </td>
                            <td className="px-3 py-2 text-ink-600">{r.department ?? '—'}</td>
                            <td className="px-3 py-2 font-mono text-xs text-ink-600">
                              {r.externalId ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-ink-500">
                    New departments in the file are created automatically. People who are already
                    members are skipped.
                  </p>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-ink-100 bg-ink-50/60 px-6 py-4">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={!valid.length} loading={busy} onClick={runImport}>
                Invite {valid.length || ''} {valid.length === 1 ? 'person' : 'people'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
