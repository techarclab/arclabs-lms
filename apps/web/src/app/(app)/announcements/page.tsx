'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  BellRing,
  Building,
  CheckCircle2,
  ClipboardList,
  Eye,
  Mail,
  Megaphone,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  AnnouncementAudience,
  AnnouncementItem,
  AudiencePreview,
  DepartmentSummary,
  ExamSummary,
  Paginated,
} from '@arc/types';
import {
  Badge,
  Button,
  Card,
  cn,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
} from '@arc/ui';
import { OrgRequired } from '@/components/shell/OrgRequired';
import { PageHeader } from '@/components/shell/PageHeader';
import { formatDateTime, timeAgo } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/use-api';
import { useDepartmentScope } from '@/lib/use-department-scope';

export default function AnnouncementsPage() {
  return (
    <Suspense fallback={null}>
      <OrgRequired
        title="Announcements"
        description="Email students and post in their portal — exam reminders and notices."
        permission="announcement.send"
      >
        {(org) => <Announcements orgId={org.id} orgName={org.name} />}
      </OrgRequired>
    </Suspense>
  );
}

type AudType = 'all' | 'departments' | 'exam';

function examReminder(e: ExamSummary, orgName: string) {
  const when = e.startsAt
    ? new Date(e.startsAt).toLocaleString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;
  const until = e.endsAt ? formatDateTime(e.endsAt) : null;
  const lines = [
    'Dear students,',
    '',
    `This is a reminder about the exam "${e.title}"${when ? ` on ${when}` : ''}.`,
    '',
    [
      when && `• Opens: ${when}`,
      until && `• Closes: ${until}`,
      e.durationMinutes && `• Duration: ${e.durationMinutes} minutes`,
      e.questionCount && `• Questions: ${e.questionCount} (${e.totalMarks} marks)`,
    ]
      .filter(Boolean)
      .join('\n'),
    '',
    [
      'Before you start:',
      '• Use the latest Chrome or Edge on a laptop / desktop.',
      e.requireCamera ? '• Keep your webcam on — the camera AI is watching during the exam.' : null,
      e.requireFullscreen
        ? '• The exam runs in full screen; leaving it counts as a violation.'
        : null,
      '• Sign in a few minutes early and check your internet connection.',
    ]
      .filter(Boolean)
      .join('\n'),
    '',
    'All the best!',
  ];
  return {
    subject: `Reminder: ${e.title}${when ? ` — ${when}` : ''}`,
    body: lines.join('\n').replace(/\n{3,}/g, '\n\n'),
    linkUrl: `/exam/${e.id}`,
    linkLabel: 'Open the exam',
    orgName,
  };
}

function Announcements({ orgId, orgName }: { orgId: string; orgName: string }) {
  const params = useSearchParams();
  const scope = useDepartmentScope();
  const scopeId = scope?.id ?? null;
  const mutate = useApiMutation();
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const { data: history, mutate: reloadHistory } = useApi<AnnouncementItem[]>('/announcements', {
    orgId,
  });
  const { data: departments = [] } = useApi<DepartmentSummary[]>('/departments', { orgId });
  const { data: exams } = useApi<Paginated<ExamSummary>>('/exams?pageSize=100', { orgId });
  const upcoming = useMemo(
    () => (exams?.data ?? []).filter((e) => e.state === 'SCHEDULED' || e.state === 'LIVE'),
    [exams],
  );

  const [kind, setKind] = useState<'GENERAL' | 'EXAM_REMINDER'>('GENERAL');
  const [audType, setAudType] = useState<AudType>('all');
  const [depts, setDepts] = useState<string[]>([]);
  const [examId, setExamId] = useState('');
  const [pendingOnly, setPendingOnly] = useState(true);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [linkLabel, setLinkLabel] = useState<string | null>(null);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Department faculty send to their department; /announcements?dept=ID preselects one (from a department page).
  const deptParam = params.get('dept');
  useEffect(() => {
    const d = scopeId ?? deptParam;
    if (!d) return;
    setAudType('departments');
    setDepts([d]);
  }, [scopeId, deptParam]);

  // /announcements?exam=ID opens an exam reminder (from the exam page).
  const examParam = params.get('exam');
  useEffect(() => {
    if (!examParam || !exams) return;
    const e = exams.data.find((x) => x.id === examParam);
    if (e) applyExamTemplate(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examParam, exams]);

  function applyExamTemplate(e: ExamSummary) {
    const t = examReminder(e, orgName);
    setKind('EXAM_REMINDER');
    setAudType('exam');
    setExamId(e.id);
    setSubject(t.subject);
    setBody(t.body);
    setLinkUrl(t.linkUrl);
    setLinkLabel(t.linkLabel);
  }

  const audience: AnnouncementAudience | null =
    audType === 'all'
      ? { type: 'all' }
      : audType === 'departments'
        ? depts.length
          ? { type: 'departments', departmentIds: depts }
          : null
        : examId
          ? { type: 'exam', examId, pendingOnly }
          : null;
  const audKey = JSON.stringify(audience);

  // Live count of who it will reach.
  useEffect(() => {
    if (!audience) {
      setPreview(null);
      return;
    }
    let stale = false;
    setPreviewing(true);
    const t = setTimeout(async () => {
      try {
        const r = await mutateRef.current<AudiencePreview>(
          '/announcements/preview',
          'POST',
          { audience },
          orgId,
        );
        if (!stale) setPreview(r);
      } catch {
        if (!stale) setPreview(null);
      } finally {
        if (!stale) setPreviewing(false);
      }
    }, 300);
    return () => {
      stale = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audKey, orgId]);

  function reset() {
    setKind('GENERAL');
    setSubject('');
    setBody('');
    setLinkUrl(null);
    setLinkLabel(null);
    setAudType(scopeId ? 'departments' : 'all');
    if (scopeId) setDepts([scopeId]);
    setExamId('');
  }

  function check() {
    if (!audience)
      return setError(audType === 'exam' ? 'Choose the exam' : 'Choose at least one department');
    if (subject.trim().length < 3) return setError('Write a subject');
    if (body.trim().length < 3) return setError('Write the message');
    if (!preview?.recipients) return setError('No students to send to');
    setError(null);
    setConfirm(true);
  }

  async function send() {
    if (!audience) return;
    setSending(true);
    try {
      const r = await mutate<AnnouncementItem>(
        '/announcements',
        'POST',
        { subject, body, linkUrl, linkLabel, kind, audience, sendEmail: true },
        orgId,
      );
      if (r.emailStatus === 'sent')
        toast.success(`Sent to ${r.recipients} student${r.recipients === 1 ? '' : 's'}`);
      else if (r.emailStatus === 'not_configured')
        toast.warning(
          'Posted in the student portal. Email isn’t set up yet, so no emails were sent.',
          {
            duration: 9000,
          },
        );
      else
        toast.warning(
          `Posted. ${r.emailed} of ${r.recipients} emails went out — check the email settings.`,
        );
      setConfirm(false);
      reset();
      void reloadHistory();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Send exam reminders and notices to students with one click — by email (college email first) and in their portal."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="p-6">
          <div className="mb-5 flex flex-wrap gap-2">
            <TemplateChip
              active={kind === 'GENERAL'}
              icon={<Megaphone />}
              onClick={() => {
                reset();
              }}
            >
              General message
            </TemplateChip>
            <TemplateChip
              active={kind === 'EXAM_REMINDER'}
              icon={<BellRing />}
              onClick={() => {
                setKind('EXAM_REMINDER');
                setAudType('exam');
                const e = upcoming[0];
                if (e) applyExamTemplate(e);
              }}
            >
              Exam reminder
            </TemplateChip>
          </div>

          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium text-ink-800">Send to</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ['all', 'All students', Users],
                    ['departments', scope ? `${scope.name} students` : 'Departments', Building],
                    ['exam', 'Students of an exam', ClipboardList],
                  ] as const
                )
                  .filter(([k]) => !(scope && k === 'all'))
                  .map(([k, label, Icon]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setAudType(k)}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition',
                        audType === k
                          ? 'border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500'
                          : 'border-ink-200 text-ink-700 hover:border-ink-300',
                      )}
                    >
                      <Icon className="size-4" /> {label}
                    </button>
                  ))}
              </div>
              {audType === 'departments' && (
                <div className="mt-3 flex flex-wrap gap-2">
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
                          'rounded-full border px-3 py-1.5 text-[13px] font-medium transition',
                          on
                            ? 'border-brand-500 bg-brand-600 text-white'
                            : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
                        )}
                      >
                        {d.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {audType === 'exam' && (
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <Select
                    value={examId}
                    onChange={(ev) => {
                      const e = exams?.data.find((x) => x.id === ev.target.value);
                      if (e && kind === 'EXAM_REMINDER') applyExamTemplate(e);
                      else setExamId(ev.target.value);
                    }}
                    aria-label="Exam"
                  >
                    <option value="">Choose the exam…</option>
                    {(exams?.data ?? [])
                      .filter((e) => e.state !== 'DRAFT')
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title}
                          {e.startsAt ? ` — ${formatDateTime(e.startsAt)}` : ''}
                        </option>
                      ))}
                  </Select>
                  <label className="flex items-center gap-2 text-[13px] text-ink-700">
                    <input
                      type="checkbox"
                      checked={pendingOnly}
                      onChange={(e) => setPendingOnly(e.target.checked)}
                      className="size-4 accent-brand-600"
                    />
                    Only students who haven’t taken it
                  </label>
                </div>
              )}
            </div>

            <Field label="Subject" htmlFor="a-subject" required>
              <Input
                id="a-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Lab internal exam on Monday"
                maxLength={200}
              />
            </Field>
            <Field label="Message" htmlFor="a-body" required>
              <Textarea
                id="a-body"
                rows={12}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message…"
                maxLength={10000}
              />
            </Field>
            {linkUrl && (
              <p className="flex items-center gap-2 text-[13px] text-ink-600">
                <CheckCircle2 className="size-4 text-emerald-500" /> The email has a button:{' '}
                <b className="font-medium text-ink-800">{linkLabel ?? 'Open'}</b>
                <button
                  className="text-ink-400 underline hover:text-ink-700"
                  onClick={() => {
                    setLinkUrl(null);
                    setLinkLabel(null);
                  }}
                >
                  remove
                </button>
              </p>
            )}
            {error && (
              <p className="flex gap-2 text-[13px] text-rose-600">
                <AlertTriangle className="mt-0.5 size-3.5" /> {error}
              </p>
            )}
          </div>
        </Card>

        <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card className="p-5">
            <p className="text-sm font-semibold text-ink-900">Reach</p>
            {!audience ? (
              <p className="mt-2 text-[13px] text-ink-500">Choose who to send to.</p>
            ) : previewing && !preview ? (
              <Skeleton className="mt-3 h-20 rounded-xl" />
            ) : preview ? (
              <div className="mt-3 space-y-3">
                <p className="tabular text-3xl font-semibold text-ink-900">
                  {preview.recipients}
                  <span className="ml-1.5 text-base font-medium text-ink-500">
                    student{preview.recipients === 1 ? '' : 's'}
                  </span>
                </p>
                <div className="space-y-1.5 text-[13px]">
                  <p className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-ink-600">
                      <Mail className="size-3.5 text-emerald-500" /> College email
                    </span>
                    <b className="tabular text-ink-900">{preview.collegeEmails}</b>
                  </p>
                  <p className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-ink-600">
                      <Mail className="size-3.5 text-amber-500" /> Personal email (no college email)
                    </span>
                    <button
                      className="tabular font-semibold text-ink-900 underline decoration-dotted"
                      onClick={() => setMissingOpen(true)}
                      disabled={!preview.personalEmails}
                    >
                      {preview.personalEmails}
                    </button>
                  </p>
                </div>
                {!preview.emailConfigured && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 ring-1 ring-amber-200">
                    Email isn’t set up on the server yet — it will only be posted in the student
                    portal. See “Emailing” in the deployment guide.
                  </p>
                )}
              </div>
            ) : null}
            <Button
              className="mt-5 w-full"
              size="lg"
              onClick={check}
              disabled={!preview?.recipients}
            >
              <Send /> Send to {preview?.recipients ?? 0} student
              {preview?.recipients === 1 ? '' : 's'}
            </Button>
            <p className="mt-2 text-center text-[12px] text-ink-500">
              Email + student portal · replies come to you
            </p>
          </Card>

          <Card className="p-5">
            <p className="mb-3 text-sm font-semibold text-ink-900">Sent</p>
            {!history ? (
              <Skeleton className="h-24 rounded-xl" />
            ) : history.length === 0 ? (
              <p className="text-[13px] text-ink-500">Nothing sent yet.</p>
            ) : (
              <div className="-mx-2 max-h-[520px] space-y-1 overflow-y-auto">
                {history.map((a) => (
                  <HistoryRow
                    key={a.id}
                    a={a}
                    onDelete={async () => {
                      try {
                        await mutate(`/announcements/${a.id}`, 'DELETE', undefined, orgId);
                        void reloadHistory();
                        toast.success('Removed from the student portal');
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent
          title={`Send to ${preview?.recipients ?? 0} students?`}
          description={
            preview?.emailConfigured
              ? 'Everyone gets the email at once (Bcc, so no one sees others’ addresses) and it appears in their portal.'
              : 'It will be posted in the student portal (email isn’t set up yet).'
          }
          icon={<Send />}
        >
          <div className="space-y-4 px-6 pt-2 pb-6">
            <div className="rounded-xl border border-ink-200 p-4">
              <p className="font-semibold text-ink-900">{subject}</p>
              <p className="mt-2 line-clamp-6 text-[13px] whitespace-pre-line text-ink-600">
                {body}
              </p>
            </div>
            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
              <Button onClick={() => void send()} loading={sending}>
                <Send /> Send now
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={missingOpen} onOpenChange={setMissingOpen}>
        <DialogContent
          title="Students without a college email"
          description="Their login email is used instead. They see a banner in the portal asking them to add their college email."
          icon={<Mail />}
        >
          <div className="max-h-[60vh] divide-y divide-ink-100 overflow-y-auto px-6 pt-2 pb-6">
            {preview?.missingCollegeEmail.map((m) => (
              <div key={m.email} className="flex items-center justify-between py-2 text-[13px]">
                <span>
                  <b className="font-medium text-ink-900">{m.name}</b>
                  {m.externalId && <span className="ml-1.5 text-ink-400">{m.externalId}</span>}
                </span>
                <span className="text-ink-500">{m.email}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TemplateChip({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition [&_svg]:size-4',
        active
          ? 'border-ink-900 bg-ink-900 text-white'
          : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
      )}
    >
      {icon} {children}
    </button>
  );
}

function HistoryRow({ a, onDelete }: { a: AnnouncementItem; onDelete: () => void }) {
  const tone =
    a.emailStatus === 'sent'
      ? 'success'
      : a.emailStatus === 'not_configured' || a.emailStatus === 'skipped'
        ? 'neutral'
        : 'warning';
  const label =
    a.emailStatus === 'sent'
      ? `Emailed ${a.emailed}`
      : a.emailStatus === 'not_configured'
        ? 'Portal only'
        : a.emailStatus === 'skipped'
          ? 'Portal only'
          : `Emailed ${a.emailed}/${a.recipients}`;
  return (
    <div className="group rounded-xl px-2 py-2.5 hover:bg-ink-50">
      <div className="flex items-start gap-2">
        {a.kind === 'EXAM_REMINDER' ? (
          <BellRing className="mt-0.5 size-4 shrink-0 text-brand-500" />
        ) : (
          <Megaphone className="mt-0.5 size-4 shrink-0 text-ink-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-ink-900">{a.subject}</p>
          <p className="truncate text-[12px] text-ink-500">
            {a.audienceLabel} · {timeAgo(a.createdAt)}
            {a.sentBy ? ` · ${a.sentBy}` : ''}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={tone}>{label}</Badge>
            <Badge tone="neutral">
              <Eye className="size-3" /> {a.readCount}/{a.recipients} read
            </Badge>
          </div>
        </div>
        <button
          onClick={onDelete}
          className="rounded-md p-1 text-ink-300 opacity-0 transition group-hover:opacity-100 hover:text-rose-600"
          title="Remove from the student portal"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}
