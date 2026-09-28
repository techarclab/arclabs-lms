import { notFound } from 'next/navigation';
import {
  Award,
  BarChart3,
  BookOpen,
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Layers,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Badge, Card } from '@arc/ui';
import { PageHeader } from '@/components/shell/PageHeader';

const SECTIONS: Record<
  string,
  { title: string; icon: LucideIcon; phase: string; blurb: string; features: string[] }
> = {
  courses: {
    title: 'Courses',
    icon: BookOpen,
    phase: 'Phase 1',
    blurb: 'Build courses with modules, lessons, videos, PDFs and resources.',
    features: [
      'Drag-and-drop module & lesson builder',
      'Video, PDF, text & link lessons',
      'Draft → Published → Archived',
      'Prerequisites & completion rules',
    ],
  },
  programs: {
    title: 'Programs',
    icon: Layers,
    phase: 'Phase 2',
    blurb: 'Group courses into structured training programs.',
    features: [
      'Ordered course pathways',
      'Required vs optional courses',
      'Program-level completion',
      'Program certificates',
    ],
  },
  batches: {
    title: 'Batches',
    icon: CalendarRange,
    phase: 'Phase 2',
    blurb: 'Run real deliveries with dates, instructors, learners and sessions.',
    features: [
      'Schedules & sessions',
      'Instructor assignment',
      'Enrollment management',
      'Session attendance',
    ],
  },
  assessments: {
    title: 'Assessments',
    icon: ClipboardCheck,
    phase: 'Phase 3',
    blurb: 'Quizzes, question banks, assignments and project evaluation.',
    features: [
      'Question bank with tags',
      'Timed quizzes & attempts',
      'Assignment grading & feedback',
      'Rubric-based project evaluation',
    ],
  },
  certificates: {
    title: 'Certificates',
    icon: Award,
    phase: 'Phase 4',
    blurb: 'Issue verifiable certificates with QR codes.',
    features: [
      'Branded templates',
      'Unique certificate numbers',
      'Public QR verification page',
      'Revocation & audit',
    ],
  },
  analytics: {
    title: 'Analytics',
    icon: BarChart3,
    phase: 'Phase 4',
    blurb: 'Enrollment, completion, attendance and assessment reporting.',
    features: ['Batch performance', 'Attendance trends', 'Assessment insights', 'CSV exports'],
  },
  audit: {
    title: 'Audit log',
    icon: ScrollText,
    phase: 'Phase 1',
    blurb: 'A searchable record of every important administrative action.',
    features: [
      'Who did what, when',
      'Filter by user, organization and action',
      'Already recording in the background',
      'Export for compliance',
    ],
  },
  settings: {
    title: 'Settings',
    icon: Settings,
    phase: 'Phase 1',
    blurb: 'Organization preferences, branding and notification settings.',
    features: ['Branding & logo', 'Notification preferences', 'Default roles', 'Integrations'],
  },
  learn: {
    title: 'My courses',
    icon: GraduationCap,
    phase: 'Phase 2',
    blurb: 'Your enrolled courses, progress and next lessons.',
    features: [
      'Course player',
      'Progress tracking',
      'Resume where you left off',
      'Downloadable resources',
    ],
  },
  'my-certificates': {
    title: 'My certificates',
    icon: Award,
    phase: 'Phase 4',
    blurb: 'Download and share the certificates you’ve earned.',
    features: ['PDF download', 'Shareable verification link', 'LinkedIn-ready', 'QR verification'],
  },
};

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const s = SECTIONS[section];
  if (!s) notFound();
  const Icon = s.icon;

  return (
    <>
      <PageHeader title={s.title} description={s.blurb} />
      <Card className="relative overflow-hidden">
        <div className="bg-grid-ink pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="relative mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-3xl bg-brand-500/20 blur-2xl" />
            <div className="relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-lg shadow-brand-900/20">
              <Icon className="size-7" strokeWidth={1.8} />
            </div>
          </div>
          <Badge tone="brand" className="mb-3">
            Coming in {s.phase}
          </Badge>
          <h2 className="text-xl font-semibold tracking-tight">{s.title} is on the roadmap</h2>
          <p className="mt-2 text-[15px] text-ink-500">{s.blurb}</p>
          <ul className="mt-8 grid w-full gap-2.5 text-left sm:grid-cols-2">
            {s.features.map((f) => (
              <li
                key={f}
                className="flex items-center gap-2.5 rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-700"
              >
                <CheckCircle2 className="size-4 shrink-0 text-brand-500" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </>
  );
}
