'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  Download,
  GraduationCap,
  Library,
  Megaphone,
  NotebookPen,
  Search,
  UserRound,
} from 'lucide-react';
import {
  hasPermission,
  type DepartmentDetail,
  type DepartmentStudent,
  type ExamSummary,
  type LabSummary,
  type MaterialAdminItem,
  type MaterialLibrary,
  type OrgRole,
  type Paginated,
  type Permission,
} from '@arc/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@arc/ui';
import { DeptLinkCard } from '@/components/departments/DeptLinkCard';
import { ExamStateBadge } from '@/components/exams/badges';
import { useOrg } from '@/components/providers/OrgProvider';
import { OrgRequired } from '@/components/shell/OrgRequired';
import { PageHeader } from '@/components/shell/PageHeader';
import { formatDate } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { useDepartmentScope } from '@/lib/use-department-scope';

export default function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <OrgRequired title="Department" description="Open a department." permission="department.view">
      {(org) => <Department id={id} orgId={org.id} orgName={org.name} />}
    </OrgRequired>
  );
}

const forDept = (id: string) => (x: { assignToAll: boolean; departments: { id: string }[] }) =>
  x.assignToAll || x.departments.some((d) => d.id === id);

function Department({ id, orgId, orgName }: { id: string; orgId: string; orgName: string }) {
  const { current, isSuperAdmin } = useOrg();
  const scope = useDepartmentScope();
  const can = (p: Permission) =>
    isSuperAdmin || hasPermission((current?.roles ?? []) as OrgRole[], p);
  const canManage = !scope && can('department.manage');

  const { data: d, error, mutate } = useApi<DepartmentDetail>(`/departments/${id}`, { orgId });
  const { data: students } = useApi<DepartmentStudent[]>(`/departments/${id}/students`, {
    orgId,
  });
  const { data: exams } = useApi<Paginated<ExamSummary>>(
    can('exam.results.view') ? `/exams?departmentId=${id}&pageSize=100` : null,
    { orgId },
  );
  const { data: lib } = useApi<MaterialLibrary<MaterialAdminItem>>(
    can('material.manage') ? '/materials' : null,
    { orgId },
  );
  const { data: labs } = useApi<LabSummary[]>(can('lab.view') ? '/labs' : null, { orgId });
  const materials = useMemo(() => lib?.materials.filter(forDept(id)), [lib, id]);
  const deptLabs = useMemo(() => labs?.filter(forDept(id)), [labs, id]);

  if (error) {
    return (
      <Card>
        <EmptyState
          icon={<GraduationCap />}
          title="Department not found"
          description="It may have been removed, or it's not your department."
          action={
            <Button variant="secondary" asChild>
              <Link href="/departments">All departments</Link>
            </Button>
          }
        />
      </Card>
    );
  }
  if (!d) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-72 rounded-xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  const stats: { label: string; value: number; icon: typeof GraduationCap; href?: string }[] = [
    { label: 'Students', value: d.learnerCount, icon: GraduationCap },
    { label: 'Faculty', value: d.staffCount, icon: UserRound },
    { label: 'Exams', value: d.counts.exams, icon: ClipboardList },
    { label: 'Study materials', value: d.counts.materials, icon: Library },
    { label: 'Labs', value: d.counts.labs, icon: NotebookPen },
    { label: 'Announcements', value: d.counts.announcements, icon: Megaphone },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={
          scope ? undefined : [{ label: 'Departments', href: '/departments' }, { label: d.name }]
        }
        title={`${d.name} department`}
        description={`Everything for ${d.name} students in one place. Counts include items shared with the whole college.`}
        actions={
          <>
            {can('announcement.send') && (
              <Button variant="secondary" asChild>
                <Link href={`/announcements?dept=${d.id}`}>
                  <Megaphone /> Message {d.name}
                </Link>
              </Button>
            )}
            {can('exam.results.view') && (
              <Button asChild>
                <Link href="/exams">
                  <ClipboardList /> Exams
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <s.icon className="mb-2 size-4 text-ink-400" />
            <p className="tabular text-2xl font-semibold text-ink-900">{s.value}</p>
            <p className="text-[13px] text-ink-500">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="mb-6">
        <DeptLinkCard
          dept={d}
          orgId={orgId}
          orgName={orgName}
          canManage={canManage}
          onChange={(s) => void mutate({ ...d, ...s }, { revalidate: false })}
        />
      </div>

      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">Students ({d.learnerCount})</TabsTrigger>
          <TabsTrigger value="faculty">Faculty ({d.staffCount})</TabsTrigger>
          {exams && <TabsTrigger value="exams">Exams</TabsTrigger>}
          {materials && <TabsTrigger value="materials">Materials</TabsTrigger>}
          {deptLabs && <TabsTrigger value="labs">Labs</TabsTrigger>}
        </TabsList>

        <TabsContent value="students" className="mt-4">
          <StudentsTab name={d.name} students={students} />
        </TabsContent>

        <TabsContent value="faculty" className="mt-4">
          <Card className="divide-y divide-ink-100">
            {d.staff.length === 0 && (
              <p className="p-5 text-sm text-ink-500">
                No faculty set to {d.name} yet. On the People page, edit a faculty member and choose
                this department — they&apos;ll then only see {d.name}.
              </p>
            )}
            {d.staff.map((s) => (
              <div key={s.userId} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={s.fullName} size="sm" round />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{s.fullName}</p>
                  <p className="truncate text-xs text-ink-500">{s.email}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {s.roles.map((r) => (
                    <Badge key={r} tone={r === 'ORG_ADMIN' ? 'brand' : 'neutral'}>
                      {r.replace('ORG_', '').replace('_', ' ').toLowerCase()}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>

        {exams && (
          <TabsContent value="exams" className="mt-4">
            <ItemList
              empty="No exams for this department yet."
              items={exams.data.map((e) => ({
                id: e.id,
                href: `/exams/${e.id}`,
                title: e.title,
                meta: `${e.submittedCount}/${e.assignedCount} submitted${e.startsAt ? ` · ${formatDate(e.startsAt)}` : ''}`,
                badge: <ExamStateBadge state={e.state} />,
              }))}
            />
          </TabsContent>
        )}
        {materials && (
          <TabsContent value="materials" className="mt-4">
            <ItemList
              empty="No study materials shared with this department yet."
              items={materials.map((m) => ({
                id: m.id,
                href: '/materials',
                title: m.title,
                meta: `${m.stats.viewers} opened · ${m.stats.downloads} downloads`,
                badge: (
                  <Badge tone={m.assignToAll ? 'neutral' : 'info'}>
                    {m.assignToAll ? 'Whole college' : 'Department'}
                  </Badge>
                ),
              }))}
            />
          </TabsContent>
        )}
        {deptLabs && (
          <TabsContent value="labs" className="mt-4">
            <ItemList
              empty="No labs for this department yet."
              items={deptLabs.map((l) => ({
                id: l.id,
                href: `/labs/${l.id}`,
                title: l.title,
                meta: `${l.heldOn ? `${formatDate(l.heldOn)} · ` : ''}out of ${l.maxTotal}`,
                badge: (
                  <Badge tone={l.assignToAll ? 'neutral' : 'info'}>
                    {l.assignToAll ? 'Whole college' : 'Department'}
                  </Badge>
                ),
              }))}
            />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}

function StudentsTab({ name, students }: { name: string; students?: DepartmentStudent[] }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!students || !s) return students;
    return students.filter((x) =>
      [x.fullName, x.email, x.collegeEmail, x.externalId].some((v) => v?.toLowerCase().includes(s)),
    );
  }, [students, q]);

  function csv() {
    if (!students) return;
    const esc = (v: string | null) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      'Roll no,Name,College email,Login email,Joined',
      ...students.map((s) =>
        [s.externalId, s.fullName, s.collegeEmail, s.email, s.joinedAt.slice(0, 10)]
          .map(esc)
          .join(','),
      ),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}-students.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!students) return <Skeleton className="h-60 rounded-2xl" />;
  return (
    <Card>
      <div className="flex flex-col gap-2 border-b border-ink-100 p-4 sm:flex-row">
        <Input
          leading={<Search />}
          placeholder="Search name, roll no. or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button variant="secondary" onClick={csv} disabled={!students.length}>
          <Download /> CSV
        </Button>
      </div>
      {rows && rows.length === 0 ? (
        <p className="p-5 text-sm text-ink-500">
          {students.length
            ? 'No one matches.'
            : `No ${name} students yet. Share the ${name} registration link above.`}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50/70 text-left text-xs text-ink-500">
              <tr>
                <th className="px-4 py-2 font-medium">Roll no.</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">College email</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows?.map((s) => (
                <tr key={s.userId}>
                  <td className="tabular px-4 py-2.5 text-ink-700">{s.externalId ?? '—'}</td>
                  <td className="px-4 py-2.5 font-medium text-ink-900">{s.fullName}</td>
                  <td className="px-4 py-2.5 text-ink-600">
                    {s.collegeEmail ?? <span className="text-amber-700">not added</span>}
                  </td>
                  <td className="hidden px-4 py-2.5 text-ink-500 md:table-cell">
                    {formatDate(s.joinedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ItemList({
  items,
  empty,
}: {
  items: { id: string; href: string; title: string; meta: string; badge: React.ReactNode }[];
  empty: string;
}) {
  if (!items.length) return <Card className="p-5 text-sm text-ink-500">{empty}</Card>;
  return (
    <Card className="divide-y divide-ink-100">
      {items.map((i) => (
        <Link
          key={i.id}
          href={i.href}
          className="flex items-center gap-3 px-5 py-3 transition hover:bg-ink-50"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-900">{i.title}</p>
            <p className="text-xs text-ink-500">{i.meta}</p>
          </div>
          {i.badge}
        </Link>
      ))}
    </Card>
  );
}
