'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building, Check, Search, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import type {
  DepartmentSummary,
  ExamDetail,
  MemberCounts,
  MemberSummary,
  Paginated,
} from '@arc/types';
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
  Input,
} from '@arc/ui';
import { useApi, useApiMutation } from '@/lib/use-api';
import { useDepartmentScope } from '@/lib/use-department-scope';

export function AudiencePicker({
  exam,
  orgId,
  onSaved,
}: {
  exam: ExamDetail;
  orgId: string;
  onSaved: (e: ExamDetail) => void;
}) {
  const mutate = useApiMutation();
  const scope = useDepartmentScope();
  // Only admins can read member counts; for others this stays undefined and no hint is shown.
  const { data: counts } = useApi<MemberCounts>('/members/summary', {
    orgId,
    shouldRetryOnError: false,
  });
  const learnerCount = counts ? (counts.byRole.LEARNER ?? 0) : null;
  const [all, setAll] = useState(exam.audience.assignToAll);
  const [depts, setDepts] = useState<string[]>(exam.audience.departments.map((d) => d.id));
  const [people, setPeople] = useState(exam.audience.users);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQ(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const { data: departments = [] } = useApi<DepartmentSummary[]>('/departments', { orgId });
  const { data: found } = useApi<Paginated<MemberSummary>>(
    q ? `/members?search=${encodeURIComponent(q)}&pageSize=8` : null,
    { orgId },
  );

  async function save() {
    setBusy(true);
    try {
      const e = await mutate<ExamDetail>(
        `/exams/${exam.id}/audience`,
        'PUT',
        {
          assignToAll: all,
          departmentIds: all ? [] : depts,
          userIds: all ? [] : people.map((p) => p.id),
        },
        orgId,
      );
      toast.success(
        `Audience saved — ${e.assignedCount} candidate${e.assignedCount === 1 ? '' : 's'}`,
      );
      onSaved(e);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div>
          <CardTitle>Who takes this exam</CardTitle>
          <CardDescription>
            Only assigned learners can see and start it. You can add more people after publishing.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ...(scope
              ? []
              : [
                  {
                    v: true,
                    title: 'All learners',
                    text: 'Everyone with the Learner role in this organization',
                    icon: Users,
                  },
                ]),
            {
              v: false,
              title: scope ? `${scope.name} students` : 'Selected groups',
              text: scope
                ? 'Your department, or chosen students from it'
                : 'Specific departments and/or individual people',
              icon: Building,
            },
          ].map(({ v, title, text, icon: Icon }) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setAll(v)}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-4 text-left transition',
                all === v
                  ? 'border-brand-500 bg-brand-50/60 ring-3 ring-brand-500/10'
                  : 'border-ink-200 hover:bg-ink-50',
              )}
            >
              <Icon
                className={cn('mt-0.5 size-5', all === v ? 'text-brand-600' : 'text-ink-400')}
              />
              <span>
                <span className="block text-sm font-medium text-ink-900">{title}</span>
                <span className="block text-xs text-ink-500">{text}</span>
              </span>
            </button>
          ))}
        </div>

        {!all && (
          <>
            <div>
              <p className="mb-2 text-sm font-medium text-ink-800">Departments</p>
              {departments.length === 0 ? (
                <p className="text-sm text-ink-400">
                  No departments yet — add them on the People page.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {departments.map((d) => {
                    const on = depts.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() =>
                          setDepts(on ? depts.filter((x) => x !== d.id) : [...depts, d.id])
                        }
                        className={cn(
                          'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition',
                          on
                            ? 'border-brand-500 bg-brand-50 text-brand-800'
                            : 'border-ink-200 text-ink-600 hover:bg-ink-50',
                        )}
                      >
                        {on && <Check className="size-3.5" />}
                        {d.name}{' '}
                        <span className="tabular text-xs text-ink-400">{d.memberCount}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-ink-800">Individual people</p>
              <Input
                leading={<Search />}
                placeholder="Search by name, email or roll no."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {q && found && (
                <div className="mt-2 max-h-56 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-200">
                  {found.data.map((m) => {
                    const added = people.some((p) => p.id === m.userId);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={added}
                        onClick={() =>
                          setPeople([
                            ...people,
                            { id: m.userId, fullName: m.fullName, email: m.email },
                          ])
                        }
                        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-ink-50 disabled:opacity-50"
                      >
                        <Avatar name={m.fullName} size="xs" round />
                        <span className="flex-1 truncate">
                          {m.fullName} <span className="text-ink-400">{m.email}</span>
                        </span>
                        {added ? (
                          <Check className="size-4 text-brand-600" />
                        ) : (
                          <span className="text-xs text-brand-600">Add</span>
                        )}
                      </button>
                    );
                  })}
                  {!found.data.length && (
                    <p className="px-3 py-3 text-sm text-ink-400">No one found</p>
                  )}
                </div>
              )}
              {people.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {people.map((p) => (
                    <span
                      key={p.id}
                      className="flex items-center gap-1.5 rounded-full bg-ink-100 py-1 pr-1.5 pl-1 text-sm"
                    >
                      <Avatar name={p.fullName} size="xs" round className="size-5" />
                      {p.fullName}
                      <button
                        type="button"
                        onClick={() => setPeople(people.filter((x) => x.id !== p.id))}
                        className="rounded-full p-0.5 text-ink-400 hover:bg-ink-200 hover:text-ink-700"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        {learnerCount === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This organization has no learners yet.{' '}
            <Link href="/users" className="font-medium underline underline-offset-2">
              Invite students in People
            </Link>{' '}
            (role: Learner), then come back and save the audience.
          </div>
        )}
      </CardContent>
      <CardFooter>
        <span className="mr-auto text-sm text-ink-500">
          Currently assigned: <b className="font-semibold text-ink-900">{exam.assignedCount}</b>
        </span>
        <Button loading={busy} onClick={save}>
          Save audience
        </Button>
      </CardFooter>
    </Card>
  );
}
