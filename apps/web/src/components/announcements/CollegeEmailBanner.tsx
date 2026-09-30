'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { emailOnDomains } from '@arc/validation';
import { Button, Input } from '@arc/ui';
import { useAuth } from '@/components/providers/AuthProvider';
import { useApiMutation } from '@/lib/use-api';

/** Students who registered without a college email are asked for it (exam reminders go there). */
export function CollegeEmailBanner() {
  const { me, refresh } = useAuth();
  const mutate = useApiMutation();
  const missing = (me?.memberships ?? []).find(
    (m) => m.roles.includes('LEARNER') && !m.collegeEmail,
  );
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  if (!missing || me?.accessCode) return null;
  const domains = missing.collegeEmailDomains ?? [];

  async function save() {
    const v = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return toast.error('Enter a valid email');
    if (!emailOnDomains(v, domains))
      return toast.error(`Use your college email (ending in @${domains.join(' or @')})`);
    setBusy(true);
    try {
      await mutate('/my/college-email', 'PUT', {
        organizationId: missing!.organizationId,
        collegeEmail: v,
      });
      toast.success('College email saved');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50/70 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Mail className="mt-0.5 size-5 shrink-0 text-brand-600" />
        <div>
          <p className="text-sm font-semibold text-ink-900">Add your college email</p>
          <p className="text-[13px] text-ink-600">
            {missing.organizationName} sends exam reminders and announcements to your college email
            {domains.length ? ` (…@${domains.join(' or …@')})` : ''}.
          </p>
        </div>
      </div>
      <form
        className="flex gap-2 sm:w-96"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={domains[0] ? `rollno@${domains[0]}` : 'you@college.edu'}
          aria-label="College email"
        />
        <Button type="submit" loading={busy}>
          Save
        </Button>
      </form>
    </div>
  );
}
