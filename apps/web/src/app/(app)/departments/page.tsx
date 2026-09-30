'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building, GraduationCap, Info, Plus, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { hasPermission, type DepartmentSummary, type OrgRole } from '@arc/types';
import { Button, Card, EmptyState, Input, Skeleton } from '@arc/ui';
import { DeptLinkCard } from '@/components/departments/DeptLinkCard';
import { useOrg } from '@/components/providers/OrgProvider';
import { OrgRequired } from '@/components/shell/OrgRequired';
import { PageHeader } from '@/components/shell/PageHeader';
import { ApiError } from '@/lib/api';
import { useApi, useApiMutation } from '@/lib/use-api';
import { useDepartmentScope } from '@/lib/use-department-scope';

export default function DepartmentsPage() {
  return (
    <OrgRequired
      title="Departments"
      description="A page and a registration link for every department."
      permission="department.view"
    >
      {(org) => <Departments orgId={org.id} orgName={org.name} />}
    </OrgRequired>
  );
}

function Departments({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { current, isSuperAdmin } = useOrg();
  const scope = useDepartmentScope();
  const canManage =
    !scope &&
    (isSuperAdmin || hasPermission((current?.roles ?? []) as OrgRole[], 'department.manage'));
  const mutate = useApiMutation();
  const {
    data,
    isLoading,
    mutate: reload,
  } = useApi<DepartmentSummary[]>('/departments', {
    orgId,
  });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setBusy(true);
    try {
      await mutate('/departments', 'POST', { name: name.trim() }, orgId);
      setName('');
      toast.success(`${name.trim()} added`);
      await reload();
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 409
          ? 'That department already exists'
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  const replace = (d: DepartmentSummary) =>
    void reload((list) => list?.map((x) => (x.id === d.id ? d : x)), { revalidate: false });

  return (
    <>
      <PageHeader
        title={scope ? `${scope.name} department` : 'Departments'}
        description={
          scope
            ? 'You work with this department: its students, exams, study materials, lab marks and announcements.'
            : 'Every department has its own page and its own registration link. Students who register through a department link land in that department automatically.'
        }
      />

      {!scope && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-[13.5px] text-sky-900">
          <Info className="mt-0.5 size-4 shrink-0 text-sky-600" />
          <div className="space-y-1">
            <p>
              <b>How it fits together:</b> {orgName} is one college with one admin panel. Inside it,
              each department (ECE, CSE…) has its own students, faculty and link.
            </p>
            <p>
              <b>College link</b> (People page): students pick their department from a list.{' '}
              <b>Department link</b> (below): the department is fixed, so students can&apos;t pick
              the wrong one. Faculty set to a department on the People page only see and manage that
              department.
            </p>
          </div>
        </div>
      )}

      {canManage && (
        <form onSubmit={add} className="mb-6 flex max-w-md gap-2">
          <Input
            placeholder="Add a department, e.g. ECE"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
          <Button type="submit" loading={busy}>
            {!busy && <Plus />} Add
          </Button>
        </form>
      )}

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      )}

      {data && data.length === 0 && (
        <Card>
          <EmptyState
            icon={<Building />}
            title="No departments yet"
            description={
              canManage
                ? 'Add your departments above (ECE, CSE, MECH…). Each one gets its own page and registration link.'
                : 'Your college admin has not added departments yet.'
            }
          />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {data?.map((d) => (
          <Card key={d.id} className="flex flex-col p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                  <Building className="size-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-ink-900">{d.name}</h2>
                  <p className="flex items-center gap-3 text-[13px] text-ink-500">
                    <span className="flex items-center gap-1">
                      <GraduationCap className="size-3.5" />
                      <b className="tabular font-semibold text-ink-800">{d.learnerCount}</b>{' '}
                      students
                    </span>
                    <span className="flex items-center gap-1">
                      <UserRound className="size-3.5" />
                      <b className="tabular font-semibold text-ink-800">{d.staffCount}</b> faculty
                    </span>
                  </p>
                </div>
              </div>
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/departments/${d.id}`}>
                  Open <ArrowRight />
                </Link>
              </Button>
            </div>
            <div className="mt-auto border-t border-ink-100 pt-4">
              <DeptLinkCard
                dept={d}
                orgId={orgId}
                orgName={orgName}
                canManage={canManage}
                onChange={replace}
                compact
              />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
