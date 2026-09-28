'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, MailPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { DepartmentSummary, InviteResult } from '@arc/types';
import { inviteMemberSchema } from '@arc/validation';
import { Button, Dialog, DialogContent, Field, Input, Select } from '@arc/ui';
import { ApiError } from '@/lib/api';
import { useApiMutation } from '@/lib/use-api';
import { RolePicker } from './RolePicker';

type Errors = Partial<Record<'email' | 'fullName' | 'roles', string>>;

export function InviteMemberDialog({
  open,
  onOpenChange,
  orgId,
  orgName,
  departments,
  canGrantAdmin,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orgId: string;
  orgName: string;
  departments: DepartmentSummary[];
  canGrantAdmin: boolean;
  onInvited: () => void;
}) {
  const mutate = useApiMutation();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [roles, setRoles] = useState<string[]>(['LEARNER']);
  const [departmentId, setDepartmentId] = useState('');
  const [externalId, setExternalId] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);

  useEffect(() => {
    if (!open) {
      setEmail('');
      setFullName('');
      setRoles(['LEARNER']);
      setDepartmentId('');
      setExternalId('');
      setErrors({});
      setResult(null);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = inviteMemberSchema.safeParse({
      email,
      fullName,
      roles,
      departmentId: departmentId || null,
      externalId,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const i of parsed.error.issues) next[i.path[0] as keyof Errors] ??= i.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const r = await mutate<InviteResult>('/members', 'POST', parsed.data, orgId);
      setResult(r);
      onInvited();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrors({ email: err.message });
      else toast.error('Could not send invitation', { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={result ? 'Invitation sent' : 'Invite people'}
        description={
          result
            ? undefined
            : `Add someone to ${orgName}. They’ll get an email to set up their account.`
        }
        icon={result ? <CheckCircle2 /> : <MailPlus />}
        className="max-w-xl"
      >
        {result ? (
          <div className="px-6 pt-3 pb-6">
            <p className="text-sm text-ink-600">
              <b className="font-medium text-ink-900">{result.member.fullName}</b> (
              {result.member.email}){' '}
              {result.created
                ? 'has been invited'
                : 'already had an ARC LABS account and was added'}{' '}
              to {orgName}.
              {result.emailQueued
                ? ' An email is on its way.'
                : ' Email could not be queued — share the link below.'}
            </p>
            {result.inviteLink && (
              <div className="mt-4 rounded-xl border border-dashed border-ink-300 bg-ink-50 p-3.5">
                <p className="mb-2 text-xs font-medium text-ink-500">
                  Invite link <span className="text-ink-400">(shown in development only)</span>
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md bg-white px-2.5 py-1.5 font-mono text-xs text-ink-700 ring-1 ring-ink-200">
                    {result.inviteLink}
                  </code>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard.writeText(result.inviteLink!);
                      toast.success('Link copied');
                    }}
                  >
                    <Copy /> Copy
                  </Button>
                </div>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setResult(null)}>
                Invite another
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="max-h-[65vh] space-y-5 overflow-y-auto px-6 pt-4 pb-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" htmlFor="inv-email" error={errors.email}>
                  <Input
                    id="inv-email"
                    type="email"
                    autoFocus
                    placeholder="priya@college.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={Boolean(errors.email)}
                  />
                </Field>
                <Field label="Full name" htmlFor="inv-name" error={errors.fullName}>
                  <Input
                    id="inv-name"
                    placeholder="Priya Sharma"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    aria-invalid={Boolean(errors.fullName)}
                  />
                </Field>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-ink-800">Roles</p>
                <RolePicker value={roles} onChange={setRoles} canGrantAdmin={canGrantAdmin} />
                {errors.roles && <p className="text-[13px] text-rose-600">{errors.roles}</p>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Department" htmlFor="inv-dept" optional>
                  <Select
                    id="inv-dept"
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                  >
                    <option value="">No department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Roll / employee no." htmlFor="inv-ext" optional>
                  <Input
                    id="inv-ext"
                    placeholder="21A91A0401"
                    value={externalId}
                    onChange={(e) => setExternalId(e.target.value)}
                  />
                </Field>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-ink-100 bg-ink-50/60 px-6 py-4">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Send invitation
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
