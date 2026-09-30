'use client';

import { useState } from 'react';
import { CheckCircle2, Mail, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Field, Input, Textarea } from '@arc/ui';
import { useApiMutation } from '@/lib/use-api';

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Subject and body are generated — the admin only adds the faculty email addresses. */
export function accessCodeMail(o: {
  orgName: string;
  code: string;
  loginLink: string;
  note?: string;
}) {
  const subject = `Faculty access to ${o.orgName} exam results — ARC LABS`;
  const body = [
    'Dear Faculty,',
    '',
    `You now have view-only access to ${o.orgName}'s exams, results and students on the ARC LABS Learning Platform. No account is needed.`,
    ...(o.note ? ['', o.note] : []),
    '',
    `Access code: ${o.code}`,
    '',
    'How to sign in:',
    `1. Open ${o.loginLink}`,
    '2. Click "College faculty? Use access code"',
    '3. Type the access code above',
    '',
    "Please keep this code private and don't share it with students.",
  ].join('\n');
  return { subject, body };
}

export function EmailCodePanel({
  orgId,
  orgName,
  code,
  loginLink,
}: {
  orgId: string;
  orgName: string;
  code: string;
  loginLink: string;
}) {
  const mutate = useApiMutation();
  const [raw, setRaw] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    sent: string[];
    failed: string[];
    mailConfigured: boolean;
  } | null>(null);

  const emails = raw
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  const bad = emails.filter((e) => !EMAIL.test(e));
  const mail = accessCodeMail({ orgName, code, loginLink, note: note.trim() || undefined });
  const mailto = `mailto:${emails.filter((e) => EMAIL.test(e)).join(',')}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;

  async function send() {
    if (!emails.length) return setError('Add at least one email address');
    if (bad.length) return setError(`Check: ${bad.join(', ')}`);
    setError(null);
    setBusy(true);
    try {
      const r = await mutate<{ sent: string[]; failed: string[]; mailConfigured: boolean }>(
        '/access-code/email',
        'POST',
        { code, emails, note: note.trim() || null },
        orgId,
      );
      setResult(r);
      if (!r.mailConfigured)
        toast.message('Email isn’t set up on the server — use your email app instead');
      else if (r.failed.length) toast.error(`Couldn’t send to ${r.failed.join(', ')}`);
      else
        toast.success(
          `Code emailed to ${r.sent.length} ${r.sent.length === 1 ? 'person' : 'people'}`,
        );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3.5 rounded-xl border border-ink-200 p-4">
      <Field
        label="Faculty emails"
        htmlFor="ac-emails"
        hint="Separate with commas or new lines."
        error={error ?? undefined}
      >
        <Textarea
          id="ac-emails"
          rows={2}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setResult(null);
          }}
          placeholder="hod.ece@college.edu, principal@college.edu"
        />
      </Field>
      <Field label="Personal note" htmlFor="ac-note" optional>
        <Input
          id="ac-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Please review the mid-term results"
          maxLength={500}
        />
      </Field>
      <div className="rounded-lg bg-ink-50 px-3 py-2.5 text-[12.5px] text-ink-600">
        <p>
          <span className="text-ink-400">Subject:</span>{' '}
          <span className="font-medium text-ink-800">{mail.subject}</span>
        </p>
        <p className="mt-1 text-ink-500">
          The email includes the code, the sign-in link and step-by-step instructions.
        </p>
      </div>
      {result?.mailConfigured && result.sent.length > 0 && (
        <p className="flex items-center gap-1.5 text-[13px] text-emerald-700">
          <CheckCircle2 className="size-4" /> Sent to {result.sent.join(', ')}
        </p>
      )}
      {result && !result.mailConfigured && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 ring-1 ring-amber-200">
          Automatic email isn’t set up yet (SMTP settings on the API). Click{' '}
          <b>Open in email app</b> — the subject and message are filled in for you.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="secondary" size="sm">
          <a href={mailto}>
            <Mail /> Open in email app
          </a>
        </Button>
        <Button size="sm" onClick={() => void send()} loading={busy}>
          <Send /> Send email
        </Button>
      </div>
    </div>
  );
}
