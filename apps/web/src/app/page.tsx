import Link from 'next/link';
import {
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  FlaskConical,
  GraduationCap,
  QrCode,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { Logo, LogoMark } from '@/components/brand/Logo';

const JOURNEY = [
  'Learn',
  'Practice',
  'Simulate',
  'Build',
  'Connect hardware',
  'Evaluate',
  'Certify',
  'Career',
];

const FEATURES = [
  {
    icon: BookOpen,
    title: 'Structured courses',
    text: 'Modules, video and PDF lessons, resources and prerequisites — built for technical content.',
  },
  {
    icon: CalendarCheck,
    title: 'Batches & attendance',
    text: 'Run workshops and semester programs with sessions, instructors and one-tap attendance.',
  },
  {
    icon: ClipboardCheck,
    title: 'Assessments that matter',
    text: 'Quizzes, assignments and rubric-based project evaluation with instructor feedback.',
  },
  {
    icon: Award,
    title: 'Verifiable certificates',
    text: 'Branded certificates with unique IDs and QR codes that anyone can verify in seconds.',
  },
  {
    icon: Building2,
    title: 'Built for institutions',
    text: 'Every college or company gets its own isolated workspace, branding and admins.',
  },
  {
    icon: BarChart3,
    title: 'Outcome analytics',
    text: 'Completion, attendance and assessment performance by batch, course and organization.',
  },
];

function ProductPreview() {
  const bars = [38, 52, 44, 68, 60, 78, 72, 88, 84, 92];
  return (
    <div className="relative mx-auto mt-16 max-w-5xl">
      <div className="absolute -inset-x-10 -top-10 -bottom-20 bg-gradient-to-b from-brand-500/25 via-cyan-400/10 to-transparent blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ink-900/80 shadow-2xl shadow-black/50 backdrop-blur">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="ml-3 rounded-md bg-white/[0.06] px-3 py-1 text-[11px] text-ink-400">
            learn.arclabs.in/dashboard
          </span>
        </div>
        <div className="grid grid-cols-[180px_1fr] text-left">
          <div className="hidden border-r border-white/[0.06] p-4 sm:block">
            <div className="mb-6 flex items-center gap-2">
              <LogoMark className="size-6" />
              <span className="text-xs font-semibold text-white">ARC LABS</span>
            </div>
            {['Dashboard', 'Courses', 'Batches', 'Assessments', 'Certificates', 'Analytics'].map(
              (l, i) => (
                <div
                  key={l}
                  className={`mb-1 rounded-md px-2.5 py-1.5 text-[11px] ${i === 0 ? 'bg-white/[0.08] text-white' : 'text-ink-400'}`}
                >
                  {l}
                </div>
              ),
            )}
          </div>
          <div className="col-span-2 p-5 sm:col-span-1">
            <p className="text-[11px] text-ink-400">Good morning, Deepak</p>
            <p className="text-sm font-semibold text-white">Training overview</p>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ['Active learners', '1,284', 'text-violet-300'],
                ['Running batches', '18', 'text-amber-300'],
                ['Completion', '87%', 'text-emerald-300'],
                ['Certificates', '642', 'text-cyan-300'],
              ].map(([k, v, c]) => (
                <div key={k} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                  <p className="text-[10px] text-ink-400">{k}</p>
                  <p className={`mt-1 text-lg font-semibold ${c}`}>{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 md:col-span-2">
                <p className="text-[10px] text-ink-400">Weekly lesson completions</p>
                <div className="mt-3 flex h-24 items-end gap-1.5">
                  {bars.map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-gradient-to-t from-brand-600 to-cyan-400"
                      style={{ height: `${h}%`, opacity: 0.45 + i * 0.055 }}
                    />
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-[10px] text-ink-400">Next session</p>
                <p className="mt-2 text-xs font-medium text-white">ESP32 + MQTT Lab</p>
                <p className="text-[10px] text-ink-400">Batch IOT-24 · 2:00 PM</p>
                <div className="mt-3 flex -space-x-1.5">
                  {['bg-violet-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500'].map((c) => (
                    <span key={c} className={`size-5 rounded-full ring-2 ring-ink-900 ${c}`} />
                  ))}
                  <span className="flex size-5 items-center justify-center rounded-full bg-white/10 text-[8px] text-white ring-2 ring-ink-900">
                    +32
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink-950 pb-24">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_40%,transparent_75%)]" />
        <div className="absolute top-[-280px] left-1/2 size-[900px] -translate-x-1/2 rounded-full bg-brand-600/25 blur-[140px]" />

        <header className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Logo inverted />
          <nav className="hidden items-center gap-8 text-sm text-ink-300 md:flex">
            <a href="#platform" className="transition hover:text-white">
              Platform
            </a>
            <a href="#institutions" className="transition hover:text-white">
              For institutions
            </a>
            <a href="#verify" className="transition hover:text-white">
              Verify a certificate
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-ink-200 transition hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/login?mode=signup"
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-ink-950 shadow-sm transition hover:bg-ink-100"
            >
              Get started
            </Link>
          </div>
        </header>

        <div className="relative mx-auto max-w-7xl px-6 pt-20 text-center">
          <p className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-cyan-300 backdrop-blur">
            <Sparkles className="size-3.5" /> The ARC LABS AIoT learning platform
          </p>
          <h1 className="mx-auto max-w-4xl text-5xl leading-[1.05] font-semibold tracking-tight text-white md:text-[64px]">
            Where learners become{' '}
            <span className="bg-gradient-to-r from-brand-300 via-sky-300 to-cyan-300 bg-clip-text text-transparent">
              builders of connected things
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-300">
            Courses, live batches, hands-on IoT projects and verifiable certificates — one platform
            for every ARC LABS program, college partnership and corporate training.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login?mode=signup"
              className="group inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-[15px] font-medium text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-500"
            >
              Start learning{' '}
              <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#institutions"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-[15px] font-medium text-white backdrop-blur transition hover:bg-white/10"
            >
              <Building2 className="size-4" /> For institutions
            </a>
          </div>

          <ProductPreview />
        </div>
      </section>

      {/* Journey */}
      <section className="border-b border-ink-100 bg-ink-50">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-3 px-6 py-8">
          {JOURNEY.map((step, i) => (
            <span key={step} className="flex items-center gap-3">
              <span className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-ink-700 shadow-xs">
                {step}
              </span>
              {i < JOURNEY.length - 1 && <ArrowRight className="size-3.5 text-ink-300" />}
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="platform" className="mx-auto max-w-7xl px-6 py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-brand-600">One platform</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
            Everything a technical training program needs
          </h2>
          <p className="mt-4 text-lg text-ink-500">
            Replace spreadsheets, WhatsApp groups and paper attendance with a system designed around
            how ARC LABS actually trains.
          </p>
        </div>
        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="group bg-white p-7 transition hover:bg-ink-50/60">
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 transition group-hover:bg-brand-600 group-hover:text-white">
                <Icon className="size-5" strokeWidth={1.8} />
              </span>
              <h3 className="mt-5 text-[17px] font-semibold text-ink-900">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-500">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Institutions */}
      <section id="institutions" className="bg-ink-50">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-6 py-24 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-brand-600">
              For colleges, schools & companies
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
              Your own branded training workspace
            </h2>
            <p className="mt-4 text-lg text-ink-500">
              Partner institutions get an isolated workspace with their own admins, departments,
              batches and reports — while ARC LABS delivers the curriculum.
            </p>
            <ul className="mt-8 space-y-3.5">
              {[
                'Strict data isolation between organizations',
                'Role-based access for admins, instructors, evaluators and learners',
                'Batch-level attendance, assessment and completion reports',
                'Every admin action recorded in an audit log',
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 text-[15px] text-ink-700">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-600" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Users, k: 'Roles', v: '6', d: 'from Super Admin to Learner' },
              { icon: ShieldCheck, k: 'Isolation', v: '100%', d: 'tenant-scoped data access' },
              { icon: Cpu, k: 'Hardware', v: 'ESP32', d: 'Arduino, sensors & MQTT' },
              { icon: FlaskConical, k: 'Coming next', v: 'Labs', d: 'virtual labs & AI tutor' },
            ].map(({ icon: Icon, k, v, d }) => (
              <div key={k} className="rounded-2xl border border-ink-200 bg-white p-6 shadow-xs">
                <Icon className="size-5 text-brand-600" strokeWidth={1.8} />
                <p className="mt-4 text-3xl font-semibold tracking-tight text-ink-900">{v}</p>
                <p className="mt-1 text-sm font-medium text-ink-800">{k}</p>
                <p className="text-[13px] text-ink-500">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Verify */}
      <section id="verify" className="mx-auto max-w-7xl px-6 py-24">
        <div className="relative overflow-hidden rounded-3xl bg-ink-950 px-8 py-14 md:px-14">
          <div className="bg-grid absolute inset-0 opacity-70" />
          <div className="absolute -right-20 -bottom-32 size-96 rounded-full bg-cyan-500/20 blur-[100px]" />
          <div className="relative flex flex-col gap-10 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-white/10 text-cyan-300">
                <QrCode className="size-6" />
              </span>
              <h2 className="mt-6 text-3xl font-semibold tracking-tight text-white">
                Verify an ARC LABS certificate
              </h2>
              <p className="mt-3 text-ink-300">
                Employers and colleges can confirm any certificate instantly by scanning its QR code
                or entering the certificate number.
              </p>
            </div>
            <div className="flex w-full max-w-md gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur">
              <input
                disabled
                placeholder="ARC-2026-XXXXXX"
                className="min-w-0 flex-1 bg-transparent px-3 text-white outline-none placeholder:text-ink-500"
              />
              <span className="rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-ink-950 opacity-70">
                Coming soon
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA + footer */}
      <footer className="border-t border-ink-100">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 py-10 md:flex-row">
          <Logo />
          <div className="flex items-center gap-6 text-sm text-ink-500">
            <span className="flex items-center gap-1.5">
              <GraduationCap className="size-4" /> Learn
            </span>
            <span className="flex items-center gap-1.5">
              <Radio className="size-4" /> Build
            </span>
            <span className="flex items-center gap-1.5">
              <Award className="size-4" /> Certify
            </span>
          </div>
          <p className="text-sm text-ink-400">© {new Date().getFullYear()} ARC LABS</p>
        </div>
      </footer>
    </div>
  );
}
