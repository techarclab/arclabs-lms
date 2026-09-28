'use client';

import { useEffect, useState } from 'react';
import { UserCog } from 'lucide-react';
import { toast } from 'sonner';
import type { DepartmentSummary, MemberSummary } from '@arc/types';
import { Avatar, Button, Dialog, DialogContent, Field, Input, Select } from '@arc/ui';
import { useApiMutation } from '@/lib/use-api';
import { RolePicker } from './RolePicker';
import { MemberStateBadge } from './shared';

export function EditMemberDialog({
  member,
  onOpenChange,
  orgId,
  departments,
  canGrantAdmin,
  onSaved,
}: {
  member: MemberSummary | null;
  onOpenChange: (o: boolean) => void;
  orgId: string;
  departments: DepartmentSummary[];
  canGrantAdmin: boolean;
  onSaved: () => void;
}) {
  const mutate = useApiMutation();
  const [roles, setRoles] = useState<string[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [externalId, setExternalId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (member) {
      setRoles(member.roles);
      setDepartmentId(member.department?.id ?? '');
      setExternalId(member.externalId ?? '');
    }
  }, [member]);

  if (!member) return null;
  const adminLocked = member.roles.includes('ORG_ADMIN') && !canGrantAdmin;

  async function save() {
    if (!member) return;
    if (!roles.length) {
      toast.error('Pick at least one role');
      return;
    }
    setBusy(true);
    try {
      await mutate(
        `/members/${member.id}`,
        'PATCH',
        { roles, departmentId: departmentId || null, externalId: externalId || null },
        orgId,
      );
      toast.success(`${member.fullName} updated`);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(member)} onOpenChange={onOpenChange}>
      <DialogContent title="Edit member" icon={<UserCog />} className="max-w-xl">
        <div className="max-h-[65vh] space-y-5 overflow-y-auto px-6 pt-4 pb-6">
          <div className="flex items-center gap-3 rounded-xl bg-ink-50 p-3">
            <Avatar name={member.fullName} size="md" round />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink-900">{member.fullName}</p>
              <p className="truncate text-sm text-ink-500">{member.email}</p>
            </div>
            <MemberStateBadge state={member.state} />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-ink-800">Roles</p>
            {adminLocked ? (
              <p className="text-sm text-ink-500">
                Only Org Admins can change another admin’s roles.
              </p>
            ) : (
              <RolePicker value={roles} onChange={setRoles} canGrantAdmin={canGrantAdmin} />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department" htmlFor="ed-dept" optional>
              <Select
                id="ed-dept"
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
            <Field label="Roll / employee no." htmlFor="ed-ext" optional>
              <Input
                id="ed-ext"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-ink-100 bg-ink-50/60 px-6 py-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save}>
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
