'use client';

import { useEffect, useState } from 'react';
import { Copy, KeyRound, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { AccessCodeGenerated, AccessCodeStatus } from '@arc/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
} from '@arc/ui';
import { useApi, useApiMutation } from '@/lib/use-api';

/**
 * Admin card for the college's faculty access code: one shared, high-entropy code that gives
 * view-only access to this college's exam results and students. The code is shown once.
 */
export function AccessCodeCard({ orgId, orgName }: { orgId: string; orgName: string }) {
  const mutate = useApiMutation();
  const { data, mutate: set } = useApi<AccessCodeStatus>('/access-code', { orgId });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'regenerate' | 'disable' | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const loginLink = `${origin}/login?mode=faculty`;

  async function generate() {
    setBusy(true);
    try {
      const r = await mutate<AccessCodeGenerated>('/access-code', 'POST', undefined, orgId);
      const { code, ...status } = r;
      void set(status, { revalidate: false });
      setShown(code);
      setConfirm(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      void set(await mutate<AccessCodeStatus>('/access-code', 'DELETE', undefined, orgId), {
        revalidate: false,
      });
      setConfirm(null);
      toast.success('Faculty access turned off — everyone using the code was signed out');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const copy = (text: string, what: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  };
  const message = shown
    ? `ARC LABS faculty access for ${orgName} (view-only exam results).\nSign in: ${loginLink}\nAccess code: ${shown}\nPlease don't share this code with students.`
    : '';

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Faculty access code</CardTitle>
          <CardDescription>
            One code for all faculty — view-only results and students, no accounts needed.
          </CardDescription>
        </div>
        <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <KeyRound className="size-[18px]" />
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.enabled ? (
          <>
            <div className="rounded-xl bg-ink-50 p-4">
              <p className="text-xs font-medium text-ink-500">Active code</p>
              <p className="mt-1 font-mono text-lg font-semibold tracking-[0.12em] text-ink-900">
                ARC-••••-••••-••••-••••-{data.hint}
              </p>
              <p className="mt-1 text-xs text-ink-500">
                Created{' '}
                {data.createdAt
                  ? new Date(data.createdAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : '—'}{' '}
                · <b className="font-semibold text-ink-800">{data.activeSessions}</b> signed in
              </p>
            </div>
            <p className="text-xs text-ink-500">
              For security the full code is shown only once. Lost it? Create a new one — the old
              code stops working and everyone using it is signed out.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => setConfirm('regenerate')}
              >
                <RefreshCw /> New code
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                className="text-rose-600 hover:bg-rose-50"
                onClick={() => setConfirm('disable')}
              >
                Turn off
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-500">
              Create a code and share it with {orgName}’s faculty. They sign in from the login page
              with “College faculty?” and can only view — nothing can be changed.
            </p>
            <Button size="sm" loading={busy} disabled={!data} onClick={generate}>
              <KeyRound /> Create access code
            </Button>
          </>
        )}
      </CardContent>

      {/* Confirm replace / turn off */}
      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent
          title={confirm === 'disable' ? 'Turn off faculty access?' : 'Create a new code?'}
          description={
            confirm === 'disable'
              ? 'The code stops working and everyone signed in with it is signed out.'
              : 'The current code stops working and everyone signed in with it is signed out. Share the new code with faculty again.'
          }
          icon={confirm === 'disable' ? <ShieldCheck /> : <RefreshCw />}
        >
          <div className="flex justify-end gap-2 px-6 pt-4 pb-6">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={confirm === 'disable' ? 'destructive' : 'primary'}
              loading={busy}
              onClick={confirm === 'disable' ? disable : generate}
            >
              {confirm === 'disable' ? 'Turn off' : 'Create new code'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Show the new code once */}
      <Dialog open={Boolean(shown)} onOpenChange={(o) => !o && setShown(null)}>
        <DialogContent
          title="Faculty access code"
          description="Copy it now — for security it won’t be shown again."
          icon={<KeyRound />}
        >
          <div className="space-y-4 px-6 pt-4 pb-6">
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-center">
              <p className="font-mono text-[19px] font-semibold tracking-[0.08em] break-all text-ink-900 select-all">
                {shown}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" size="sm" onClick={() => copy(shown ?? '', 'Code')}>
                <Copy /> Code
              </Button>
              <Button variant="secondary" size="sm" onClick={() => copy(message, 'Message')}>
                <Copy /> Message
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle /> WhatsApp
                </a>
              </Button>
            </div>
            <p className="text-xs text-ink-500">
              Faculty open <b className="font-medium text-ink-700">{loginLink}</b>, choose “College
              faculty?”, and type the code (it stays hidden while typing).
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setShown(null)}>Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
