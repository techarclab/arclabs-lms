'use client';

import {
  Award,
  BookOpen,
  CalendarRange,
  ClipboardCheck,
  Compass,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@arc/ui';
import { PageHeader } from '@/components/shell/PageHeader';
import { useAuth } from '@/components/providers/AuthProvider';
import { useOrg } from '@/components/providers/OrgProvider';
import { greeting, ROLE_LABEL } from '@/lib/format';
import { StatCard } from './StatCard';

export function MemberDashboard() {
  const { me } = useAuth();
  const { current } = useOrg();
  const firstName = me?.fullName.split(' ')[0] ?? '';

  if (!current) {
    return (
      <Card className="mx-auto mt-10 max-w-xl">
        <EmptyState
          icon={<Compass />}
          title="You’re not part of an organization yet"
          description="Ask your institution’s admin or ARC LABS to add you. Once added, your courses and batches will show up here."
        />
      </Card>
    );
  }

  const isLearner = current.roles.includes('LEARNER');

  return (
    <>
      <PageHeader
        eyebrow={
          <div className="flex items-center gap-2">
            <Avatar name={current.name} color={current.primaryColor} size="xs" />
            <span className="text-[13px] font-medium text-ink-500">{current.name}</span>
            {current.roles.map((r) => (
              <Badge key={r} tone="brand">
                {ROLE_LABEL[r] ?? r}
              </Badge>
            ))}
          </div>
        }
        title={`${greeting()}, ${firstName}`}
        description={
          isLearner
            ? 'Pick up where you left off and keep building.'
            : 'Here’s an overview of your organization.'
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {isLearner ? (
          <>
            <StatCard label="Active courses" value="0" icon={BookOpen} />
            <StatCard label="Upcoming deadlines" value="0" icon={ClipboardCheck} tone="amber" />
            <StatCard label="Attendance" value="—" icon={CalendarRange} tone="emerald" />
            <StatCard label="Certificates" value="0" icon={Award} tone="violet" />
          </>
        ) : (
          <>
            <StatCard label="Learners" value="0" icon={GraduationCap} tone="violet" />
            <StatCard label="Courses" value="0" icon={BookOpen} tone="sky" />
            <StatCard label="Running batches" value="0" icon={CalendarRange} tone="amber" />
            <StatCard label="Pending reviews" value="0" icon={ClipboardCheck} />
          </>
        )}
      </div>
      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle>{isLearner ? 'Continue learning' : 'Getting started'}</CardTitle>
            <CardDescription>
              Courses, batches and assessments arrive in the next releases.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<Sparkles />}
            title={isLearner ? 'No courses yet' : 'Your workspace is ready'}
            description={
              isLearner
                ? 'When you’re enrolled in a course or batch, it will appear here with your next lesson.'
                : 'Course building, batches and user invitations are coming next in Phase 1.'
            }
            className="py-8"
          />
        </CardContent>
      </Card>
    </>
  );
}
