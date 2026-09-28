'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUpRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { OrganizationSummary, Paginated, RecordStatus } from '@arc/types';
import {
  Avatar,
  Button,
  Card,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Select,
  Skeleton,
} from '@arc/ui';
import { CreateOrganizationDialog } from '@/components/organizations/CreateOrganizationDialog';
import { StatusBadge, TypeBadge } from '@/components/organizations/OrgBadges';
import { useAuth } from '@/components/providers/AuthProvider';
import { useOrg } from '@/components/providers/OrgProvider';
import { PageHeader } from '@/components/shell/PageHeader';
import { formatDate, formatNumber } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/use-api';

const PAGE_SIZE = 10;
const STATUS_TABS: { value: RecordStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function OrganizationsPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { me } = useAuth();
  const { select } = useOrg();
  const mutate = useApiMutation();
  const isSuperAdmin = Boolean(me?.isSuperAdmin);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<RecordStatus | 'ALL'>('ALL');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const q = useDebounced(search);

  useEffect(() => {
    if (params.get('new') === '1' && isSuperAdmin) {
      setCreateOpen(true);
      router.replace('/organizations');
    }
  }, [params, isSuperAdmin, router]);

  useEffect(() => setPage(1), [q, status, type]);

  const query = useMemo(() => {
    const sp = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (q) sp.set('search', q);
    if (status !== 'ALL') sp.set('status', status);
    if (type) sp.set('type', type);
    return `/organizations?${sp}`;
  }, [page, q, status, type]);

  const {
    data,
    isLoading,
    mutate: reload,
  } = useApi<Paginated<OrganizationSummary>>(query, {
    keepPreviousData: true,
  });
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(q || status !== 'ALL' || type);

  async function changeStatus(org: OrganizationSummary, next: RecordStatus) {
    try {
      await mutate(`/organizations/${org.id}/status`, 'POST', { status: next });
      toast.success(next === 'SUSPENDED' ? `${org.name} suspended` : `${org.name} reactivated`);
      void reload();
    } catch (e) {
      toast.error('Could not change status', { description: (e as Error).message });
    }
  }

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Institutions and companies that run training on ARC LABS. Each has its own users, courses and batches."
        actions={
          isSuperAdmin && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> New organization
            </Button>
          )
        }
      />

      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-ink-100 px-4 py-3.5 md:flex-row md:items-center">
          <div className="flex rounded-lg bg-ink-100/80 p-0.5">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setStatus(t.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[13px] font-medium transition',
                  status === t.value
                    ? 'bg-white text-ink-900 shadow-xs'
                    : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-1 gap-3 md:justify-end">
            <div className="w-full md:max-w-xs">
              <Input
                leading={<Search />}
                placeholder="Search by name or URL"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="w-40 shrink-0">
              <Select value={type} onChange={(e) => setType(e.target.value)} className="h-9">
                <option value="">All types</option>
                <option value="PLATFORM">Platform</option>
                <option value="COLLEGE">College</option>
                <option value="SCHOOL">School</option>
                <option value="COMPANY">Company</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs font-medium text-ink-500">
                <th className="py-2.5 pr-3 pl-6 font-medium">Organization</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 text-right font-medium">Members</th>
                <th className="px-3 py-2.5 text-right font-medium">Courses</th>
                <th className="px-3 py-2.5 text-right font-medium">Batches</th>
                <th className="px-3 py-2.5 font-medium">Created</th>
                <th className="w-12 py-2.5 pr-4 pl-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {isLoading &&
                !data &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="py-3.5 pr-3 pl-6" colSpan={8}>
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-9 rounded-xl" />
                        <Skeleton className="h-4 w-56" />
                      </div>
                    </td>
                  </tr>
                ))}
              {data?.data.map((o) => (
                <tr
                  key={o.id}
                  className="group cursor-pointer transition hover:bg-ink-50/70"
                  onClick={() => router.push(`/organizations/${o.id}`)}
                >
                  <td className="py-3 pr-3 pl-6">
                    <div className="flex items-center gap-3">
                      <Avatar name={o.name} color={o.primaryColor} size="md" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink-900 group-hover:text-brand-700">
                          {o.name}
                        </p>
                        <p className="truncate text-xs text-ink-500">learn.arclabs.in/{o.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <TypeBadge type={o.type} />
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="tabular px-3 py-3 text-right text-ink-700">
                    {formatNumber(o.counts.members)}
                  </td>
                  <td className="tabular px-3 py-3 text-right text-ink-700">
                    {formatNumber(o.counts.courses)}
                  </td>
                  <td className="tabular px-3 py-3 text-right text-ink-700">
                    {formatNumber(o.counts.batches)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-ink-500">
                    {formatDate(o.createdAt)}
                  </td>
                  <td className="py-3 pr-4 pl-3" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="rounded-lg p-1.5 text-ink-400 opacity-60 transition group-hover:opacity-100 hover:bg-ink-100 hover:text-ink-700 data-[state=open]:bg-ink-100 data-[state=open]:opacity-100">
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          icon={<ArrowUpRight />}
                          onSelect={() => router.push(`/organizations/${o.id}`)}
                        >
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          icon={<Users />}
                          onSelect={() => {
                            select(o.id);
                            router.push('/dashboard');
                          }}
                        >
                          Open workspace
                        </DropdownMenuItem>
                        {isSuperAdmin && o.type !== 'PLATFORM' && (
                          <>
                            <DropdownMenuSeparator />
                            {o.status === 'SUSPENDED' ? (
                              <DropdownMenuItem
                                icon={<PlayCircle />}
                                onSelect={() => changeStatus(o, 'ACTIVE')}
                              >
                                Reactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                danger
                                icon={<PauseCircle />}
                                onSelect={() => changeStatus(o, 'SUSPENDED')}
                              >
                                Suspend
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && data.data.length === 0 && (
          <EmptyState
            icon={<Building2 />}
            title={filtered ? 'No organizations match your filters' : 'No organizations yet'}
            description={
              filtered
                ? 'Try a different search term or clear the filters.'
                : 'Create your first client organization to start onboarding users.'
            }
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setStatus('ALL');
                    setType('');
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                isSuperAdmin && (
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus /> New organization
                  </Button>
                )
              )
            }
          />
        )}

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between border-t border-ink-100 px-6 py-3 text-sm text-ink-500">
            <span>
              Showing <b className="font-medium text-ink-800">{(page - 1) * PAGE_SIZE + 1}</b>–
              <b className="font-medium text-ink-800">{Math.min(page * PAGE_SIZE, total)}</b> of{' '}
              <b className="font-medium text-ink-800">{total}</b>
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="icon-sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft />
              </Button>
              <span className="tabular px-1 text-ink-700">
                {page} / {pages}
              </span>
              <Button
                variant="secondary"
                size="icon-sm"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <CreateOrganizationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(org) => {
          void reload();
          router.push(`/organizations/${org.id}`);
        }}
      />
    </>
  );
}

export default function OrganizationsPage() {
  return (
    <Suspense>
      <OrganizationsPageInner />
    </Suspense>
  );
}
