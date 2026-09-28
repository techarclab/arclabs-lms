'use client';

import { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, Lock, Maximize, ShieldAlert, Shuffle, TimerReset } from 'lucide-react';
import { toast } from 'sonner';
import type { ExamDetail, ResultVisibilityName } from '@arc/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  Field,
  Input,
  SwitchRow,
  Textarea,
} from '@arc/ui';
import { toLocalInput } from '@/lib/format';
import { useApiMutation } from '@/lib/use-api';

const RESULT_OPTIONS: {
  value: ResultVisibilityName;
  title: string;
  text: string;
  icon: typeof Eye;
}[] = [
  {
    value: 'SCORE_NOW_ANSWERS_AFTER_CLOSE',
    title: 'Score now, answers after close',
    text: 'Instant score & rank; answers unlock when the window closes',
    icon: Eye,
  },
  {
    value: 'IMMEDIATE',
    title: 'Everything immediately',
    text: 'Score, answers and explanations right after submit',
    icon: Eye,
  },
  {
    value: 'MANUAL_RELEASE',
    title: 'Release manually',
    text: 'Nothing is shown until you publish results',
    icon: EyeOff,
  },
];

export function ExamSettingsForm({
  exam,
  orgId,
  onSaved,
}: {
  exam: ExamDetail;
  orgId: string;
  onSaved: (e: ExamDetail) => void;
}) {
  const mutate = useApiMutation();
  const locked = exam.state !== 'DRAFT';
  const [s, setS] = useState(() => fromExam(exam));
  const [busy, setBusy] = useState(false);
  useEffect(() => setS(fromExam(exam)), [exam]);
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((p) => ({ ...p, [k]: v }));

  async function save() {
    const body: Record<string, unknown> = locked
      ? {
          title: s.title,
          instructions: s.instructions,
          resultVisibility: s.resultVisibility,
          endsAt: s.endsAt ? new Date(s.endsAt).toISOString() : null,
        }
      : {
          title: s.title,
          instructions: s.instructions,
          durationMinutes: Number(s.durationMinutes),
          startsAt: s.startsAt ? new Date(s.startsAt).toISOString() : null,
          endsAt: s.endsAt ? new Date(s.endsAt).toISOString() : null,
          passPct: Number(s.passPct),
          maxAttempts: Number(s.maxAttempts),
          shuffleQuestions: s.shuffleQuestions,
          shuffleOptions: s.shuffleOptions,
          negativeMarking: s.negativeMarking,
          resultVisibility: s.resultVisibility,
          requireFullscreen: s.requireFullscreen,
          blockCopyPaste: s.blockCopyPaste,
          maxViolations: Number(s.maxViolations),
        };
    setBusy(true);
    try {
      const e = await mutate<ExamDetail>(`/exams/${exam.id}`, 'PATCH', body, orgId);
      toast.success('Settings saved');
      onSaved(e);
    } catch (err) {
      toast.error('Could not save', { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {locked && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <p>
            This exam is published, so timing, scoring and lockdown rules are locked. You can still
            edit the title and instructions, extend the closing time, and change how results are
            shown.
          </p>
        </div>
      )}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Basics & schedule</CardTitle>
            <CardDescription>
              Students can start any time inside the window. Attempts that run past the closing time
              are submitted automatically.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label="Title" htmlFor="s-title">
            <Input id="s-title" value={s.title} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Window opens" htmlFor="s-start">
              <Input
                id="s-start"
                type="datetime-local"
                disabled={locked}
                value={s.startsAt}
                onChange={(e) => set('startsAt', e.target.value)}
              />
            </Field>
            <Field
              label="Window closes"
              htmlFor="s-end"
              hint={locked ? 'Can only be extended' : undefined}
            >
              <Input
                id="s-end"
                type="datetime-local"
                value={s.endsAt}
                onChange={(e) => set('endsAt', e.target.value)}
              />
            </Field>
            <Field label="Duration (minutes)" htmlFor="s-dur">
              <Input
                id="s-dur"
                inputMode="numeric"
                disabled={locked}
                value={s.durationMinutes}
                onChange={(e) => set('durationMinutes', e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Pass mark (%)" htmlFor="s-pass">
              <Input
                id="s-pass"
                inputMode="numeric"
                disabled={locked}
                value={s.passPct}
                onChange={(e) => set('passPct', e.target.value)}
              />
            </Field>
            <Field label="Attempts allowed" htmlFor="s-att">
              <Input
                id="s-att"
                inputMode="numeric"
                disabled={locked}
                value={s.maxAttempts}
                onChange={(e) => set('maxAttempts', e.target.value)}
              />
            </Field>
          </div>
          <Field
            label="Instructions for students"
            htmlFor="s-ins"
            hint="One rule per line — shown on the start screen."
          >
            <Textarea
              id="s-ins"
              rows={6}
              value={s.instructions}
              onChange={(e) => set('instructions', e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Scoring</CardTitle>
            <CardDescription>
              Every question is auto-graded the moment a student submits.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-ink-100 pt-0">
          <SwitchRow
            icon={<Shuffle />}
            label="Shuffle question order"
            description="Each student gets a different order."
            checked={s.shuffleQuestions}
            onCheckedChange={(v) => set('shuffleQuestions', v)}
            disabled={locked}
          />
          <SwitchRow
            icon={<Shuffle />}
            label="Shuffle answer options"
            description="Options of choice questions are reordered per student."
            checked={s.shuffleOptions}
            onCheckedChange={(v) => set('shuffleOptions', v)}
            disabled={locked}
          />
          <SwitchRow
            icon={<TimerReset />}
            label="Negative marking"
            description="Wrong answers deduct each question’s negative marks. Unanswered questions score 0."
            checked={s.negativeMarking}
            onCheckedChange={(v) => set('negativeMarking', v)}
            disabled={locked}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Lockdown</CardTitle>
            <CardDescription>
              Keep the exam fair. Every violation is logged with a timestamp for review.
            </CardDescription>
          </div>
          <span className="flex size-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
            <ShieldAlert className="size-[18px]" />
          </span>
        </CardHeader>
        <CardContent className="divide-y divide-ink-100 pt-0">
          <SwitchRow
            icon={<Maximize />}
            label="Require full screen"
            description="Leaving full screen, switching tabs or windows counts as a violation."
            checked={s.requireFullscreen}
            onCheckedChange={(v) => set('requireFullscreen', v)}
            disabled={locked}
          />
          <SwitchRow
            icon={<Copy />}
            label="Block copy, paste & right-click"
            description="Also blocks printing and common shortcuts."
            checked={s.blockCopyPaste}
            onCheckedChange={(v) => set('blockCopyPaste', v)}
            disabled={locked}
          />
          <div className="flex items-center gap-3 py-3">
            <ShieldAlert className="size-[18px] text-ink-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-ink-900">Auto-submit after violations</p>
              <p className="text-[13px] text-ink-500">
                The exam is submitted automatically when this many violations are recorded. 0 =
                never.
              </p>
            </div>
            <Input
              className="w-20 text-center"
              inputMode="numeric"
              disabled={locked}
              value={s.maxViolations}
              onChange={(e) => set('maxViolations', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Results</CardTitle>
            <CardDescription>What students see after they submit.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {RESULT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => set('resultVisibility', o.value)}
              className={cn(
                'rounded-xl border p-3.5 text-left transition',
                s.resultVisibility === o.value
                  ? 'border-brand-500 bg-brand-50/60 ring-3 ring-brand-500/10'
                  : 'border-ink-200 hover:bg-ink-50',
              )}
            >
              <o.icon
                className={cn(
                  'mb-2 size-4',
                  s.resultVisibility === o.value ? 'text-brand-600' : 'text-ink-400',
                )}
              />
              <p className="text-sm font-medium text-ink-900">{o.title}</p>
              <p className="mt-0.5 text-xs text-ink-500">{o.text}</p>
            </button>
          ))}
        </CardContent>
        <CardFooter>
          <Button variant="ghost" onClick={() => setS(fromExam(exam))}>
            Discard
          </Button>
          <Button loading={busy} onClick={save}>
            Save settings
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function fromExam(e: ExamDetail) {
  return {
    title: e.title,
    instructions: e.instructions ?? '',
    durationMinutes: String(e.durationMinutes ?? 60),
    startsAt: toLocalInput(e.startsAt),
    endsAt: toLocalInput(e.endsAt),
    passPct: String(e.passPct),
    maxAttempts: String(e.maxAttempts),
    shuffleQuestions: e.shuffleQuestions,
    shuffleOptions: e.shuffleOptions,
    negativeMarking: e.negativeMarking,
    resultVisibility: e.resultVisibility,
    requireFullscreen: e.requireFullscreen,
    blockCopyPaste: e.blockCopyPaste,
    maxViolations: String(e.maxViolations),
  };
}
