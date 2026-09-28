'use client';

import { useState } from 'react';
import {
  ArrowRight,
  FileSpreadsheet,
  Lock,
  MailPlus,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import { hasPermission, type MemberCounts, type OrgRole } from '@arc/types';
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
} from '@arc/ui';
import { StatCard } from '@/components/dashboard/StatCard';
import { JoinLinkCard } from '@/components/join/JoinLinkCard';
import { DepartmentsCard } from '@/components/members/DepartmentsCard';
import { MembersPanel } from '@/components/members/MembersPanel';
import { ROLE_OPTIONS } from '@/components/members/shared';
import { useOrg } from '@/components/providers/OrgProvider';
import { PageHeader } from '@/components/shell/PageHeader';
import { formatNumber, ORG_TYPE_LABEL } from '@/lib/format';
import { useApi } from '@/lib/use-api';

const ROLE_COLOR: Record<string, string> = {
  ORG_ADMIN: 'bg-brand-600',
  CONTENT_MANAGER: 'bg-sky-500',
  INSTRUCTOR: 'bg-violet-500',
  EVALUATOR: 'bg-amber-500',
  LEARNER: 'bg-emerald-500',
};

export default function UsersPage() {
  const { current, options, select, isSuperAdmin } = useOrg();
  const [inviteSignal, setInviteSignal] = useState(0);
  const [importSignal, setImportSignal] = useState(0);
  const roles = (current?.roles ?? []) as OrgRole[];
  const canManage = isSuperAdmin || hasPermission(roles, 'user.manage');
  const canGrantAdmin = isSuperAdmin || hasPermission(roles, 'user.role.assign');
  const canManageDepts = isSuperAdmin || hasPermission(roles, 'department.manage');
  const {
    data: counts,
    isLoading,
    mutate: reloadCounts,
  } = useApi<MemberCounts>(current && canManage ? '/members/summary' : null, {
    orgId: current?.id,
  });

  if (!current) {
    return (
      <>
        <PageHeader
          title="People"
          description="Choose an organization to manage its learners, instructors and admins."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => select(o.id)}
              className="group flex items-center gap-4 rounded-2xl border border-ink-200/80 bg-white p-5 text-left shadow-xs transition hover:border-brand-300 hover:shadow-md hover:shadow-ink-900/[0.04]"
            >
              <Avatar name={o.name} color={o.primaryColor} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink-900">{o.name}</p>
                <p className="text-sm text-ink-500">
                  {ORG_TYPE_LABEL[o.type ?? ''] ?? 'Organization'}
                </p>
              </div>
              <ArrowRight className="size-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
            </button>
          ))}
        </div>
      </>
    );
  }

  if (!canManage) {
    return (
      <Card className="mx-auto mt-10 max-w-lg">
        <EmptyState
          icon={<Lock />}
          title="You don’t have access to People"
          description="Only organization admins can manage members."
        />
      </Card>
    );
  }

  const roleTotal = Object.values(counts?.byRole ?? {}).reduce((a, b) => a + b, 0) || 1;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2 text-[13px] font-medium text-ink-500">
            <Avatar name={current.name} color={current.primaryColor} size="xs" /> {current.name}
          </span>
        }
        title="People"
        description="Invite and manage learners, instructors, evaluators and admins."
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportSignal((n) => n + 1)}>
              <FileSpreadsheet /> Import CSV
            </Button>
            <Button onClick={() => setInviteSignal((n) => n + 1)}>
              <UserPlus /> Invite people
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Total members"
          value={formatNumber(counts?.total ?? 0)}
          icon={Users}
          loading={isLoading}
        />
        <StatCard
          label="Active"
          value={formatNumber(counts?.active ?? 0)}
          icon={UserCheck}
          tone="emerald"
          loading={isLoading}
          footer="Signed in at least once"
        />
        <StatCard
          label="Invited"
          value={formatNumber(counts?.invited ?? 0)}
          icon={MailPlus}
          tone="amber"
          loading={isLoading}
          footer="Waiting to accept"
        />
        <StatCard
          label="Deactivated"
          value={formatNumber(counts?.inactive ?? 0)}
          icon={UserX}
          tone="rose"
          loading={isLoading}
          footer="No access"
        />
      </div>

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <MembersPanel
          orgId={current.id}
          orgName={current.name}
          canGrantAdmin={canGrantAdmin}
          onChanged={() => void reloadCounts()}
          inviteSignal={inviteSignal}
          importSignal={importSignal}
        />
        <div className="grid items-start gap-6 md:grid-cols-2 2xl:grid-cols-1">
          <JoinLinkCard orgId={current.id} orgName={current.name} />
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Roles</CardTitle>
                <CardDescription>Active members by role</CardDescription>
              </div>
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <ShieldCheck className="size-[18px]" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-ink-100">
                {ROLE_OPTIONS.map((r) => (
                  <div
                    key={r.value}
                    className={ROLE_COLOR[r.value]}
                    style={{ width: `${((counts?.byRole[r.value] ?? 0) / roleTotal) * 100}%` }}
                  />
                ))}
              </div>
              <ul className="space-y-2.5 text-sm">
                {[...ROLE_OPTIONS].reverse().map((r) => (
                  <li key={r.value} className="flex items-center gap-2.5">
                    <span className={cn('size-2 rounded-full', ROLE_COLOR[r.value])} />
                    <span className="flex-1 text-ink-600">{r.label}</span>
                    <span className="tabular font-medium">
                      {formatNumber(counts?.byRole[r.value] ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <DepartmentsCard orgId={current.id} canManage={canManageDepts} />
        </div>
      </div>
    </>
  );
}
