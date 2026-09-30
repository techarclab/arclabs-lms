'use client';

import { useEffect, useState } from 'react';
import { AtSign, Copy, Link2, MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { JoinSettings } from '@arc/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Switch,
} from '@arc/ui';
import { useApi, useApiMutation } from '@/lib/use-api';

/** Admin card to open/close student self-registration and share the college's join link. */
export function JoinLinkCard({ orgId, orgName }: { orgId: string; orgName: string }) {
  const mutate = useApiMutation();
  const { data, mutate: set } = useApi<JoinSettings>('/join-settings', { orgId });
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState('');
  const [domains, setDomains] = useState<string | null>(null);
  const domainText = domains ?? (data?.collegeEmailDomains ?? []).join(', ');
  const domainsChanged =
    domains !== null && domains.trim() !== (data?.collegeEmailDomains ?? []).join(', ');
  useEffect(() => setOrigin(window.location.origin), []);
  const link = data?.code ? `${origin}/join/${data.code}` : '';

  async function run(fn: () => Promise<JoinSettings>, ok: string) {
    setBusy(true);
    try {
      void set(await fn(), { revalidate: false });
      toast.success(ok);
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
  const message = `Register for ${orgName} exams on ARC LABS: ${link}  (join code: ${data?.code ?? ''})`;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Student registration link</CardTitle>
          <CardDescription>Students register themselves and join as Learners.</CardDescription>
        </div>
        <Switch
          checked={Boolean(data?.enabled)}
          disabled={!data || busy}
          onCheckedChange={(v) =>
            run(
              () => mutate<JoinSettings>('/join-settings', 'PUT', { enabled: v }, orgId),
              v ? 'Registration opened' : 'Registration closed',
            )
          }
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.enabled && data.code ? (
          <>
            <div className="rounded-xl bg-ink-50 p-4 text-center">
              <p className="text-xs font-medium text-ink-500">Join code</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.15em] text-ink-900">
                {data.code}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2">
              <Link2 className="size-4 shrink-0 text-ink-400" />
              <span className="flex-1 truncate text-sm text-ink-700">{link}</span>
              <button
                onClick={() => copy(link, 'Link')}
                className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                aria-label="Copy link"
              >
                <Copy className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={() => copy(message, 'Message')}>
                <Copy /> Copy message
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
            <div className="flex items-center justify-between text-xs text-ink-500">
              <span>
                <b className="font-semibold text-ink-800">{data.learnerCount}</b> learners
                registered
              </span>
              <button
                className="flex items-center gap-1 text-ink-500 hover:text-rose-600"
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      mutate<JoinSettings>('/join-settings/regenerate', 'POST', undefined, orgId),
                    'New code created — the old link no longer works',
                  )
                }
              >
                <RefreshCw className="size-3" /> New code
              </button>
            </div>
          </>
        ) : null}
        <div className="border-t border-ink-100 pt-4">
          <label
            htmlFor="jl-domains"
            className="flex items-center gap-1.5 text-sm font-medium text-ink-800"
          >
            <AtSign className="size-3.5 text-ink-400" /> College email domain
          </label>
          <p className="mt-0.5 text-[12.5px] text-ink-500">
            Students must register with their institution email (e.g. rollno@college.edu.in).
            Announcements and exam reminders go there. Separate several with commas.
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              id="jl-domains"
              value={domainText}
              onChange={(e) => setDomains(e.target.value)}
              placeholder="college.edu.in"
            />
            <Button
              variant="secondary"
              disabled={!data || busy || !domainsChanged}
              onClick={() =>
                run(
                  () =>
                    mutate<JoinSettings>(
                      '/join-settings',
                      'PUT',
                      {
                        collegeEmailDomains: domainText
                          .split(/[\s,;]+/)
                          .map((d) => d.trim())
                          .filter(Boolean),
                      },
                      orgId,
                    ),
                  'College email domain saved',
                ).then(() => setDomains(null))
              }
            >
              Save
            </Button>
          </div>
        </div>
        {!(data?.enabled && data.code) && (
          <p className="text-sm text-ink-500">
            Turn this on to get a link and code for {orgName}. Share it with students before the
            exam; turn it off when registration is over.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
