'use client';

import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  CalendarRange,
  CheckCircle2,
  Circle,
  GraduationCap,
  Plus,
  Presentation,
  Target,
  Users,
} from 'lucide-react';
import type { PlatformOverview } from '@arc/types';
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Progress,
  Skeleton,
} from '@arc/ui';
import { PageHeader } from '@/components/shell/PageHeader';
import { useAuth } from '@/components/providers/AuthProvider';
import { useOrg } from '@/components/providers/OrgProvider';
import { StatusBadge, TypeBadge } from '@/components/organizations/OrgBadges';
import { formatNumber, greeting, ORG_TYPE_LABEL, timeAgo } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { ActivityFeed } from './ActivityFeed';
import { StatCard } from './StatCard';

const TYPE_COLORS: Record<string, string> = {
  PLATFORM: 'bg-brand-600',
  COLLEGE: 'bg-violet-500',
  SCHOOL: 'bg-sky-500',
  COMPANY: 'bg-amber-500',
  OTHER: 'bg-ink-400',
};

export function PlatformDashboard() {
  const { me } = useAuth();
  const { select } = useOrg();
  const { data, isLoading } = useApi<PlatformOverview>('/analytics/platform');
  const t = data?.totals;
  // Skip honorifics so "Dr. Suresh Rao" is greeted as Suresh.
  const firstName =
    me?.fullName.split(' ').find((w) => !/^(dr|prof|mr|mrs|ms|sri|smt)\.?$/i.test(w)) ?? '';
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const checklist = [
    {
      label: 'Create your first client organization',
      done: (t?.organizations ?? 0) > 1,
      href: '/organizations?new=1',
    },
    { label: 'Invite instructors and learners', done: (t?.learners ?? 0) > 0, soon: true },
    { label: 'Publish a course', done: (t?.publishedCourses ?? 0) > 0, soon: true },
    { label: 'Launch a batch', done: (t?.runningBatches ?? 0) > 0, soon: true },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  const workspaceTarget = data?.recentOrganizations.find(
    (o) => o.status === 'ACTIVE' && o.type !== 'PLATFORM',
  );
  const typeEntries = Object.entries(data?.organizationsByType ?? {}).sort((a, b) => b[1] - a[1]);
  const typeTotal = typeEntries.reduce((s, [, n]) => s + n, 0) || 1;

  return (
    <>
      <PageHeader
        eyebrow={<span className="text-[13px] font-medium text-ink-500">{today}</span>}
        title={`${greeting()}, ${firstName}`}
        description="Here’s what’s happening across ARC LABS training today."
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href="/organizations">
                <Building2 /> Organizations
              </Link>
            </Button>
            <Button asChild>
              <Link href="/organizations?new=1">
                <Plus /> New organization
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Organizations"
          value={formatNumber(t?.organizations ?? 0)}
          icon={Building2}
          loading={isLoading}
          footer={
            <span>
              <b className="font-medium text-emerald-600">{t?.activeOrganizations ?? 0} active</b> ·{' '}
              {(t?.organizations ?? 0) - (t?.activeOrganizations ?? 0)} inactive
            </span>
          }
        />
        <StatCard
          label="Active learners"
          value={formatNumber(t?.learners ?? 0)}
          icon={GraduationCap}
          tone="violet"
          loading={isLoading}
          footer={<span>{formatNumber(t?.instructors ?? 0)} instructors</span>}
        />
        <StatCard
          label="Published courses"
          value={formatNumber(t?.publishedCourses ?? 0)}
          icon={BookOpen}
          tone="sky"
          loading={isLoading}
          footer={<span>Across all organizations</span>}
        />
        <StatCard
          label="Running batches"
          value={formatNumber(t?.runningBatches ?? 0)}
          icon={CalendarRange}
          tone="amber"
          loading={isLoading}
          footer={<span>{formatNumber(t?.enrollments ?? 0)} total enrollments</span>}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {/* Recent organizations */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Recent organizations</CardTitle>
              <CardDescription>Newest institutions and companies on the platform</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/organizations">
                View all <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <div className="border-t border-ink-100">
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-6 py-3.5">
                  <Skeleton className="size-9 rounded-xl" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ))}
            {data?.recentOrganizations.map((o) => (
              <Link
                key={o.id}
                href={`/organizations/${o.id}`}
                className="group flex items-center gap-3.5 border-b border-ink-100 px-6 py-3.5 transition last:border-0 hover:bg-ink-50/70"
              >
                <Avatar name={o.name} color={o.primaryColor} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{o.name}</p>
                  <p className="truncate text-xs text-ink-500">
                    {o.counts.members} members · {o.counts.courses} courses · added{' '}
                    {timeAgo(o.createdAt)}
                  </p>
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                  <TypeBadge type={o.type} />
                  <StatusBadge status={o.status} />
                </div>
                <ArrowUpRight className="size-4 text-ink-300 transition group-hover:text-ink-600" />
              </Link>
            ))}
          </div>
        </Card>

        {/* Setup checklist */}
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-24 -right-24 size-56 rounded-full bg-brand-500/10 blur-3xl" />
          <CardHeader>
            <div>
              <CardTitle>Launch checklist</CardTitle>
              <CardDescription>
                {doneCount} of {checklist.length} steps complete
              </CardDescription>
            </div>
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
              <Target className="size-[18px]" />
            </span>
          </CardHeader>
          <CardContent>
            <Progress value={(doneCount / checklist.length) * 100} className="mb-5" />
            <ul className="space-y-1">
              {checklist.map((c) => (
                <li key={c.label}>
                  <Link
                    href={c.href ?? '#'}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition',
                      c.href ? 'hover:bg-ink-50' : 'pointer-events-none',
                    )}
                  >
                    {c.done ? (
                      <CheckCircle2 className="size-[18px] text-emerald-500" />
                    ) : (
                      <Circle className="size-[18px] text-ink-300" />
                    )}
                    <span
                      className={cn(
                        'flex-1',
                        c.done ? 'text-ink-400 line-through' : 'text-ink-700',
                      )}
                    >
                      {c.label}
                    </span>
                    {c.soon && !c.done && (
                      <span className="text-[10px] font-medium text-ink-400 uppercase">Soon</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-3">
        {/* Organizations by type */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Organizations by type</CardTitle>
              <CardDescription>Who you train</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-5 flex h-2.5 overflow-hidden rounded-full bg-ink-100">
              {typeEntries.map(([type, n]) => (
                <div
                  key={type}
                  className={TYPE_COLORS[type]}
                  style={{ width: `${(n / typeTotal) * 100}%` }}
                />
              ))}
            </div>
            <ul className="space-y-3">
              {typeEntries.map(([type, n]) => (
                <li key={type} className="flex items-center gap-3 text-sm">
                  <span className={cn('size-2.5 rounded-full', TYPE_COLORS[type])} />
                  <span className="flex-1 text-ink-600">{ORG_TYPE_LABEL[type]}</span>
                  <span className="tabular font-medium text-ink-900">{n}</span>
                  <span className="tabular w-10 text-right text-xs text-ink-400">
                    {Math.round((n / typeTotal) * 100)}%
                  </span>
                </li>
              ))}
              {!typeEntries.length && !isLoading && (
                <li className="text-sm text-ink-400">No data yet</li>
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Learning outcomes */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Learning outcomes</CardTitle>
              <CardDescription>Completion across all enrollments</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            <CompletionRing value={t?.completionRate ?? 0} />
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-ink-500">Enrollments</p>
                <p className="tabular text-lg font-semibold">{formatNumber(t?.enrollments ?? 0)}</p>
              </div>
              <div>
                <p className="text-ink-500">Instructors</p>
                <p className="tabular text-lg font-semibold">{formatNumber(t?.instructors ?? 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Activity */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Audit trail of admin actions</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <ActivityFeed items={(data?.recentActivity ?? []).slice(0, 5)} />
            )}
          </CardContent>
        </Card>
      </div>

      {workspaceTarget && (
        <Card className="mt-6 flex flex-col items-start gap-4 overflow-hidden bg-ink-950 p-6 text-white sm:flex-row sm:items-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-white/10">
            <Presentation className="size-5 text-cyan-300" />
          </span>
          <div className="flex-1">
            <p className="font-semibold">Open an organization workspace</p>
            <p className="text-sm text-ink-300">
              Switch into any organization to manage its users, courses and batches as its admin.
            </p>
          </div>
          <Button
            variant="secondary"
            className="border-white/10 bg-white/10 text-white hover:bg-white/15"
            onClick={() => select(workspaceTarget.id)}
          >
            <Users /> Switch to {workspaceTarget.name}
          </Button>
        </Card>
      )}
    </>
  );
}

function CompletionRing({ value }: { value: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-ink-100" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          className="stroke-emerald-500 transition-all duration-700"
          strokeDasharray={c}
          strokeDashoffset={c - (c * Math.min(100, value)) / 100}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-xl font-semibold">{value}%</span>
        <span className="text-[11px] text-ink-500">completed</span>
      </div>
    </div>
  );
}
