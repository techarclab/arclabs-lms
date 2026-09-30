'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, ClipboardCheck, Plus, Users } from 'lucide-react';
import { hasPermission, type LabSummary, type OrgRole } from '@arc/types';
import { Badge, Button, Card, EmptyState, Progress, Skeleton } from '@arc/ui';
import { LabForm } from '@/components/labs/LabForm';
import { useOrg } from '@/components/providers/OrgProvider';
import { OrgRequired } from '@/components/shell/OrgRequired';
import { PageHeader } from '@/components/shell/PageHeader';
import { formatDate } from '@/lib/format';
import { useApi } from '@/lib/use-api';

export default function LabsPage() {
  return (
    <OrgRequired
      title="Lab marks"
      description="Give marks for offline labs and project reviews."
      permission="lab.view"
    >
      {(org) => <Labs orgId={org.id} />}
    </OrgRequired>
  );
}

function Labs({ orgId }: { orgId: string }) {
  const router = useRouter();
  const { current, isSuperAdmin } = useOrg();
  const canMark = isSuperAdmin || hasPermission((current?.roles ?? []) as OrgRole[], 'lab.marks');
  const { data, isLoading } = useApi<LabSummary[]>('/labs', { orgId });
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Lab marks"
        description="Offline labs and project reviews: set criteria like Presentation /5 and Contribution /5, then mark every student on one sheet. Students see their marks right away."
        actions={
          canMark && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> New lab
            </Button>
          )
        }
      />

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      )}

      {data && data.length === 0 && (
        <Card>
          <EmptyState
            icon={<ClipboardCheck />}
            title="No labs yet"
            description="Create a lab or project review with its marking criteria, then enter marks for each student."
            action={
              canMark && (
                <Button onClick={() => setOpen(true)}>
                  <Plus /> New lab
                </Button>
              )
            }
          />
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.map((l) => {
          const pct = l.stats.students
            ? Math.round(((l.stats.marked + l.stats.absent) / l.stats.students) * 100)
            : 0;
          return (
            <Link key={l.id} href={`/labs/${l.id}`} className="group">
              <Card className="flex h-full flex-col p-5 transition group-hover:border-ink-300 group-hover:shadow-md group-hover:shadow-ink-900/[0.04]">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-ink-900 group-hover:text-brand-700">
                    {l.title}
                  </h3>
                  <ArrowRight className="mt-1 size-4 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-500">
                  {l.heldOn && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3.5" /> {formatDate(l.heldOn)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3.5" />
                    {l.assignToAll ? 'All students' : l.departments.map((d) => d.name).join(', ')}
                  </span>
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {l.criteria.map((c) => (
                    <Badge key={c.id} tone="neutral">
                      {c.text} /{c.max}
                    </Badge>
                  ))}
                </div>
                <div className="mt-auto pt-5">
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="text-ink-500">
                      {l.stats.marked + l.stats.absent}/{l.stats.students} marked
                    </span>
                    <span className="text-ink-500">
                      Class avg{' '}
                      <b className="tabular text-ink-900">
                        {l.stats.average ?? '–'}/{l.maxTotal}
                      </b>
                    </span>
                  </div>
                  <Progress value={pct} className="mt-2" tone={pct === 100 ? 'emerald' : 'brand'} />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <LabForm
        open={open}
        onOpenChange={setOpen}
        orgId={orgId}
        editing={null}
        onSaved={(id) => router.push(`/labs/${id}`)}
      />
    </>
  );
}
