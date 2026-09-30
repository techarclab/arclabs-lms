'use client';

import { useEffect, useState } from 'react';
import { Copy, Link2, MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { DepartmentSummary } from '@arc/types';
import { Button, cn, Switch } from '@arc/ui';
import { useApiMutation } from '@/lib/use-api';

/**
 * A department's own registration link: students who register through it land in this
 * department automatically (no dropdown to get wrong).
 */
export function DeptLinkCard({
  dept,
  orgId,
  orgName,
  canManage,
  onChange,
  compact,
}: {
  dept: DepartmentSummary;
  orgId: string;
  orgName: string;
  canManage: boolean;
  onChange: (d: DepartmentSummary) => void;
  compact?: boolean;
}) {
  const mutate = useApiMutation();
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const open = dept.joinEnabled && Boolean(dept.joinCode);
  const link = dept.joinCode ? `${origin}/join/${dept.joinCode}` : '';
  const message = `${dept.name} students — register for ${orgName} on ARC LABS: ${link}  (join code: ${dept.joinCode ?? ''})`;

  async function run(path: string, body: unknown, ok: string) {
    setBusy(true);
    try {
      onChange(await mutate<DepartmentSummary>(path, 'POST', body, orgId));
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

  return (
    <div className={cn('space-y-3', !compact && 'rounded-2xl border border-ink-200 bg-white p-5')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink-900">{dept.name} registration link</p>
          <p className="text-[12.5px] text-ink-500">
            {open
              ? `Students who use it join ${dept.name} automatically.`
              : canManage
                ? 'Off. Turn it on to get a link just for this department.'
                : 'Off. Ask your college admin to open it.'}
          </p>
        </div>
        {canManage && (
          <Switch
            checked={open}
            disabled={busy}
            onCheckedChange={(v) =>
              run(
                `/departments/${dept.id}/join-link`,
                { enabled: v },
                v ? `${dept.name} link opened` : `${dept.name} link closed`,
              )
            }
          />
        )}
      </div>
      {open && (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2">
            <Link2 className="size-4 shrink-0 text-ink-400" />
            <span className="flex-1 truncate text-sm text-ink-700" title={link}>
              {link}
            </span>
            <button
              onClick={() => copy(link, 'Link')}
              className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              aria-label={`Copy ${dept.name} link`}
            >
              <Copy className="size-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto font-mono text-sm font-semibold tracking-wider text-ink-800">
              {dept.joinCode}
            </span>
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
            {canManage && (
              <button
                className="flex items-center gap-1 px-1 text-xs text-ink-500 hover:text-rose-600"
                disabled={busy}
                onClick={() =>
                  run(
                    `/departments/${dept.id}/join-link/regenerate`,
                    undefined,
                    'New code created — the old link no longer works',
                  )
                }
              >
                <RefreshCw className="size-3" /> New code
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
