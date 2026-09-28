'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  CalendarRange,
  Copy,
  LayoutGrid,
  Mail,
  PauseCircle,
  PlayCircle,
  Settings2,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { OrganizationDetail, OrgType } from '@arc/types';
import { updateOrganizationSchema } from '@arc/validation';
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@arc/ui';
import { StatCard } from '@/components/dashboard/StatCard';
import { BRAND_SWATCHES } from '@/components/organizations/CreateOrganizationDialog';
import { StatusBadge, TypeBadge } from '@/components/organizations/OrgBadges';
import { useAuth } from '@/components/providers/AuthProvider';
import { useOrg } from '@/components/providers/OrgProvider';
import { formatDate, formatNumber, ROLE_LABEL } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { useApi, useApiMutation } from '@/lib/use-api';

const ROLE_ORDER = ['ORG_ADMIN', 'CONTENT_MANAGER', 'INSTRUCTOR', 'EVALUATOR', 'LEARNER'];
const ROLE_COLOR: Record<string, string> = {
  ORG_ADMIN: 'bg-brand-600',
  CONTENT_MANAGER: 'bg-sky-500',
  INSTRUCTOR: 'bg-violet-500',
  EVALUATOR: 'bg-amber-500',
  LEARNER: 'bg-emerald-500',
};

export default function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { me } = useAuth();
  const { select } = useOrg();
  const mutate = useApiMutation();
  const {
    data: org,
    error,
    isLoading,
    mutate: reload,
  } = useApi<OrganizationDetail>(`/organizations/${id}`);
  const [statusBusy, setStatusBusy] = useState(false);

  if (error instanceof ApiError && error.status === 404) {
    return (
      <Card className="mx-auto mt-10 max-w-lg">
        <EmptyState
          icon={<ShieldAlert />}
          title="Organization not found"
          description="It may not exist, or you don’t have access to it."
          action={
            <Button variant="secondary" asChild>
              <Link href="/organizations">Back to organizations</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  if (isLoading || !org) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      </div>
    );
  }

  const color = org.primaryColor ?? '#2F45EF';
  const totalRoles = Object.values(org.roleBreakdown).reduce((a, b) => a + b, 0);

  async function setStatus(next: 'ACTIVE' | 'SUSPENDED') {
    setStatusBusy(true);
    try {
      await mutate(`/organizations/${id}/status`, 'POST', { status: next });
      toast.success(next === 'SUSPENDED' ? 'Organization suspended' : 'Organization reactivated');
      await reload();
    } catch (e) {
      toast.error('Could not change status', { description: (e as Error).message });
    } finally {
      setStatusBusy(false);
    }
  }

  return (
    <>
      <nav className="mb-4 flex items-center gap-1.5 text-[13px] text-ink-500">
        <Link href="/organizations" className="hover:text-ink-900">
          Organizations
        </Link>
        <span className="text-ink-300">/</span>
        <span className="text-ink-700">{org.name}</span>
      </nav>

      {/* Hero */}
      <Card className="relative mb-6 overflow-hidden">
        <div
          className="h-24 w-full"
          style={{
            background: `linear-gradient(120deg, ${color} 0%, ${color}cc 45%, #0a0d16 130%)`,
          }}
        >
          <div className="bg-grid h-full w-full opacity-60" />
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end">
          <Avatar
            name={org.name}
            color={color}
            size="lg"
            className="-mt-8 size-16 border-4 border-white text-xl shadow-md"
          />
          <div className="min-w-0 flex-1 sm:pt-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{org.name}</h1>
              <TypeBadge type={org.type} />
              <StatusBadge status={org.status} />
            </div>
            <p className="mt-1 text-sm text-ink-500">
              learn.arclabs.in/{org.slug}
              {org.contactEmail && (
                <>
                  <span className="mx-2 text-ink-300">·</span>
                  <Mail className="mr-1 inline size-3.5 -translate-y-px" />
                  {org.contactEmail}
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2.5">
            {me?.isSuperAdmin &&
              org.type !== 'PLATFORM' &&
              (org.status === 'SUSPENDED' ? (
                <Button
                  variant="secondary"
                  loading={statusBusy}
                  onClick={() => setStatus('ACTIVE')}
                >
                  <PlayCircle /> Reactivate
                </Button>
              ) : (
                <Button
                  variant="destructive-outline"
                  loading={statusBusy}
                  onClick={() => setStatus('SUSPENDED')}
                >
                  <PauseCircle /> Suspend
                </Button>
              ))}
            <Button
              onClick={() => {
                select(org.id);
                router.push('/dashboard');
              }}
            >
              Open workspace <ArrowRight />
            </Button>
          </div>
        </div>
      </Card>

      {org.status === 'SUSPENDED' && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            <b className="font-medium">This organization is suspended.</b> Its members can’t use
            permission-protected features until it is reactivated.
          </p>
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">
            <LayoutGrid /> Overview
          </TabsTrigger>
          <TabsTrigger value="members" disabled className="disabled:opacity-50">
            <Users /> Members <span className="text-[10px] text-ink-400 uppercase">Soon</span>
          </TabsTrigger>
          {org.canManage && (
            <TabsTrigger value="settings">
              <Settings2 /> Settings
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Members"
              value={formatNumber(org.counts.members)}
              icon={Users}
              tone="violet"
            />
            <StatCard
              label="Courses"
              value={formatNumber(org.counts.courses)}
              icon={BookOpen}
              tone="sky"
            />
            <StatCard
              label="Batches"
              value={formatNumber(org.counts.batches)}
              icon={CalendarRange}
              tone="amber"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <div>
                  <CardTitle>People by role</CardTitle>
                  <CardDescription>Active members of this organization</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {totalRoles === 0 ? (
                  <EmptyState
                    icon={<Users />}
                    title="No members yet"
                    description="User invitations are the next feature in Phase 1."
                    className="py-8"
                  />
                ) : (
                  <ul className="space-y-4">
                    {ROLE_ORDER.filter((r) => org.roleBreakdown[r]).map((r) => {
                      const n = org.roleBreakdown[r] ?? 0;
                      return (
                        <li key={r}>
                          <div className="mb-1.5 flex justify-between text-sm">
                            <span className="text-ink-700">{ROLE_LABEL[r]}</span>
                            <span className="tabular font-medium">{n}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                            <div
                              className={cn('h-full rounded-full', ROLE_COLOR[r])}
                              style={{ width: `${(n / totalRoles) * 100}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-ink-100 text-sm">
                  {[
                    ['Type', <TypeBadge key="t" type={org.type} />],
                    ['Status', <StatusBadge key="s" status={org.status} />],
                    ['Contact', org.contactEmail ?? '—'],
                    ['Created', formatDate(org.createdAt)],
                    ['Last updated', formatDate(org.updatedAt)],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex items-center justify-between py-2.5">
                      <dt className="text-ink-500">{k}</dt>
                      <dd className="text-ink-900">{v}</dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-ink-500">Organization ID</dt>
                    <dd>
                      <button
                        className="flex items-center gap-1.5 rounded-md bg-ink-50 px-2 py-1 font-mono text-xs text-ink-600 hover:bg-ink-100"
                        onClick={() => {
                          void navigator.clipboard.writeText(org.id);
                          toast.success('Copied organization ID');
                        }}
                      >
                        {org.id.slice(0, 8)}… <Copy className="size-3" />
                      </button>
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {org.canManage && (
          <TabsContent value="settings">
            <SettingsForm org={org} onSaved={() => reload()} />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}

function SettingsForm({ org, onSaved }: { org: OrganizationDetail; onSaved: () => void }) {
  const mutate = useApiMutation();
  const [name, setName] = useState(org.name);
  const [type, setType] = useState<OrgType>(org.type);
  const [contactEmail, setContactEmail] = useState(org.contactEmail ?? '');
  const [color, setColor] = useState(org.primaryColor ?? BRAND_SWATCHES[0]!);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(org.name);
    setType(org.type);
    setContactEmail(org.contactEmail ?? '');
    setColor(org.primaryColor ?? BRAND_SWATCHES[0]!);
  }, [org]);

  const dirty =
    name !== org.name ||
    type !== org.type ||
    contactEmail !== (org.contactEmail ?? '') ||
    color !== (org.primaryColor ?? BRAND_SWATCHES[0]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = updateOrganizationSchema.safeParse({
      name,
      type,
      contactEmail: contactEmail || null,
      primaryColor: color,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await mutate(`/organizations/${org.id}`, 'PATCH', parsed.data);
      toast.success('Settings saved');
      onSaved();
    } catch (err) {
      toast.error('Could not save', { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <Card className="max-w-3xl">
        <CardHeader>
          <div>
            <CardTitle>General</CardTitle>
            <CardDescription>
              Name, type and branding shown to this organization’s members.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Organization name" htmlFor="s-name" error={error ?? undefined}>
              <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Type" htmlFor="s-type">
              <Select
                id="s-type"
                value={type}
                onChange={(e) => setType(e.target.value as OrgType)}
                disabled={org.type === 'PLATFORM'}
              >
                {org.type === 'PLATFORM' && <option value="PLATFORM">Platform</option>}
                <option value="COLLEGE">College</option>
                <option value="SCHOOL">School</option>
                <option value="COMPANY">Company</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
          </div>
          <Field label="Contact email" htmlFor="s-email" optional>
            <Input
              id="s-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="training@college.edu"
            />
          </Field>
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink-800">Brand colour</p>
            <div className="flex items-center gap-4">
              <div className="flex gap-2">
                {BRAND_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      'size-7 rounded-full ring-offset-2 transition',
                      color === c ? 'ring-2 ring-ink-900' : 'hover:scale-110',
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={`Colour ${c}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-ink-200 px-2.5 py-1.5">
                <Avatar name={name || org.name} color={color} size="xs" />
                <span className="font-mono text-xs text-ink-600">{color}</span>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={!dirty || busy}
            onClick={() => {
              setName(org.name);
              setType(org.type);
              setContactEmail(org.contactEmail ?? '');
              setColor(org.primaryColor ?? BRAND_SWATCHES[0]!);
            }}
          >
            Discard
          </Button>
          <Button type="submit" disabled={!dirty} loading={busy}>
            Save changes
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
