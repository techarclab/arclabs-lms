import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AiReview,
  AttemptDetail,
  CandidateRow,
  ReexamInfo,
  ExamAnalytics,
  QuestionOption,
  QuestionStat,
} from '@arc/types';
import { AuditService } from '../audit/audit.service';
import type { Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExamEngine, examState } from './exam-engine.service';
import { ExamsService } from './exams.service';
import {
  competitionRanks,
  discriminationIndex,
  distribution,
  median,
  round2,
  type QuestionResult,
} from './grading';

@Injectable()
export class ExamAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ExamEngine,
    private readonly exams: ExamsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Full results for an exam. `viewOnly` callers (read-only coordinators) don't get question texts,
   * options or answer keys until the exam has ended, so nothing can leak while students write.
   */
  async analytics(
    orgId: string,
    examId: string,
    opts: { viewOnly?: boolean; departmentId?: string | null } = {},
  ): Promise<ExamAnalytics> {
    await this.engine.finalizeExpired({ quizId: examId });
    const exam = await this.prisma.quiz.findFirst({
      where: { id: examId, organizationId: orgId },
      include: { audiences: true },
    });
    if (!exam) throw new NotFoundException();
    const [summary, assigned, attempts, questions] = await Promise.all([
      this.exams.get(orgId, examId),
      this.engine
        .assignedCandidates(exam)
        // A department's faculty see only their department's students.
        .then((list) =>
          opts.departmentId ? list.filter((m) => m.departmentId === opts.departmentId) : list,
        ),
      this.prisma.quizAttempt.findMany({
        where: {
          quizId: examId,
          ...(opts.departmentId
            ? {
                user: {
                  memberships: {
                    some: { organizationId: orgId, departmentId: opts.departmentId },
                  },
                },
              }
            : {}),
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              memberships: {
                where: { organizationId: orgId },
                select: { externalId: true, department: { select: { name: true } } },
              },
            },
          },
          events: { where: { counted: true }, select: { type: true } },
        },
        orderBy: { attemptNo: 'desc' },
      }),
      this.engine.gradableQuestions(examId),
    ]);

    // One row per candidate: their best graded attempt, else their in-progress one.
    // Attempts set aside for a re-exam are kept as a record but don't count.
    const byUser = new Map<string, (typeof attempts)[number]>();
    const reexams = new Map<string, ReexamInfo>();
    for (const a of attempts) {
      if (!a.voidedAt) continue;
      if (reexams.has(a.userId)) continue; // newest first
      reexams.set(a.userId, {
        attemptId: a.id,
        grantedAt: a.voidedAt.toISOString(),
        reason: a.voidReason ?? '',
        until: a.reexamUntil?.toISOString() ?? null,
        used: attempts.some(
          (b) => b.userId === a.userId && !b.voidedAt && b.attemptNo > a.attemptNo,
        ),
      });
    }
    for (const a of attempts) {
      if (a.voidedAt) continue;
      const cur = byUser.get(a.userId);
      const better =
        !cur ||
        (cur.status === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS') ||
        (a.status !== 'IN_PROGRESS' &&
          cur.status !== 'IN_PROGRESS' &&
          Number(a.percentage) > Number(cur.percentage));
      if (better) byUser.set(a.userId, a);
    }
    const graded = [...byUser.values()].filter((a) => a.status !== 'IN_PROGRESS');
    const ranks = competitionRanks(
      graded.map((a) => ({ id: a.userId, value: Number(a.percentage) })),
    );

    const rowFor = (a: (typeof attempts)[number]): CandidateRow => ({
      userId: a.userId,
      fullName: a.user.fullName,
      email: a.user.email,
      department: a.user.memberships[0]?.department?.name ?? null,
      externalId: a.user.memberships[0]?.externalId ?? null,
      status: a.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'SUBMITTED',
      attemptId: a.id,
      score: a.score !== null ? Number(a.score) : null,
      percentage: a.percentage !== null ? Number(a.percentage) : null,
      passed: a.passed,
      rank: ranks.get(a.userId) ?? null,
      timeTakenSec: a.timeTakenSec,
      violationCount: a.violationCount,
      submitReason: a.submitReason,
      submittedAt: a.submittedAt?.toISOString() ?? null,
      reexam: reexams.get(a.userId) ?? null,
    });
    const candidates: CandidateRow[] = [...byUser.values()].map(rowFor);
    for (const m of assigned) {
      if (byUser.has(m.userId)) continue;
      candidates.push({
        userId: m.userId,
        fullName: m.user.fullName,
        email: m.user.email,
        department: m.department?.name ?? null,
        externalId: m.externalId,
        status: 'NOT_STARTED',
        attemptId: null,
        score: null,
        percentage: null,
        passed: null,
        rank: null,
        timeTakenSec: null,
        violationCount: 0,
        submitReason: null,
        submittedAt: null,
        reexam: reexams.get(m.userId) ?? null,
      });
    }
    candidates.sort(
      (a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.fullName.localeCompare(b.fullName),
    );

    const pcts = graded.map((a) => Number(a.percentage));
    const times = graded.map((a) => a.timeTakenSec ?? 0);
    const avg = (xs: number[]) =>
      xs.length ? round2(xs.reduce((s, x) => s + x, 0) / xs.length) : null;

    // Question analysis
    const questionStats: QuestionStat[] = questions.map((q, i) => {
      let attempted = 0;
      let correct = 0;
      const optionCounts = new Map<string, number>();
      const disc: { total: number; correct: boolean }[] = [];
      for (const a of graded) {
        const res = ((a.results ?? {}) as unknown as Record<string, QuestionResult>)[q.id];
        const ans = ((a.answers ?? {}) as Record<string, unknown>)[q.id];
        if (res?.answered) attempted++;
        if (res?.correct) correct++;
        disc.push({ total: Number(a.percentage), correct: Boolean(res?.correct) });
        const picked = Array.isArray(ans) ? ans : typeof ans === 'string' ? [ans] : [];
        for (const p of picked)
          optionCounts.set(p as string, (optionCounts.get(p as string) ?? 0) + 1);
      }
      const key = Array.isArray(q.correctAnswer) ? (q.correctAnswer as string[]) : [];
      return {
        questionId: q.id,
        position: i + 1,
        prompt: q.prompt,
        type: q.type,
        topic: q.topic,
        difficulty: q.difficulty,
        points: q.points,
        attempted,
        correct,
        correctPct: graded.length ? round2((correct / graded.length) * 100) : 0,
        discrimination: discriminationIndex(disc),
        options: (q.options as unknown as QuestionOption[]).map((o) => ({
          id: o.id,
          text: o.text,
          count: optionCounts.get(o.id) ?? 0,
          isCorrect: key.includes(o.id),
        })),
      };
    });

    const topicMap = new Map<string, { sum: number; n: number }>();
    for (const s of questionStats) {
      const t = s.topic ?? 'General';
      const cur = topicMap.get(t) ?? { sum: 0, n: 0 };
      cur.sum += s.correctPct;
      cur.n++;
      topicMap.set(t, cur);
    }

    const deptMap = new Map<string, number[]>();
    const deptPass = new Map<string, number>();
    for (const c of candidates) {
      if (c.status !== 'SUBMITTED') continue;
      const d = c.department ?? 'No department';
      deptMap.set(d, [...(deptMap.get(d) ?? []), c.percentage ?? 0]);
      if (c.passed) deptPass.set(d, (deptPass.get(d) ?? 0) + 1);
    }

    const violationsByType: Record<string, number> = {};
    for (const a of attempts)
      for (const e of a.events) violationsByType[e.type] = (violationsByType[e.type] ?? 0) + 1;

    const assignedIds = new Set(assigned.map((m) => m.userId));
    const passedCount = graded.filter((a) => a.passed).length;
    return {
      exam: summary,
      stats: {
        assigned: new Set([...assignedIds, ...byUser.keys()]).size,
        notStarted: candidates.filter((c) => c.status === 'NOT_STARTED').length,
        inProgress: candidates.filter((c) => c.status === 'IN_PROGRESS').length,
        submitted: graded.length,
        passed: passedCount,
        passRate: graded.length ? round2((passedCount / graded.length) * 100) : null,
        avgPct: avg(pcts),
        medianPct: median(pcts),
        highestPct: pcts.length ? Math.max(...pcts) : null,
        lowestPct: pcts.length ? Math.min(...pcts) : null,
        avgTimeSec: avg(times),
        autoSubmitted: graded.filter((a) => a.submitReason && a.submitReason !== 'MANUAL').length,
        withViolations: [...byUser.values()].filter((a) => a.violationCount > 0).length,
        codingPending: graded.filter((a) => a.codingPending).length,
      },
      distribution: distribution(pcts),
      questions: opts.viewOnly && summary.state !== 'ENDED' ? [] : questionStats,
      questionsHidden: Boolean(opts.viewOnly && summary.state !== 'ENDED'),
      topics: [...topicMap.entries()]
        .map(([topic, v]) => ({ topic, avgPct: round2(v.sum / v.n), questions: v.n }))
        .sort((a, b) => a.avgPct - b.avgPct),
      departments: [...deptMap.entries()]
        .map(([department, xs]) => ({
          department,
          submitted: xs.length,
          avgPct: avg(xs) ?? 0,
          passRate: round2(((deptPass.get(department) ?? 0) / xs.length) * 100),
        }))
        .sort((a, b) => b.avgPct - a.avgPct),
      violationsByType,
      candidates,
    };
  }

  /** Camera evidence photos for one attempt (taken when the camera AI reported a violation). */
  /** A department's faculty may only open attempts of their department's students. */
  async assertAttemptInDepartment(orgId: string, attemptId: string, departmentId?: string | null) {
    if (!departmentId) return;
    const ok = await this.prisma.quizAttempt.count({
      where: {
        id: attemptId,
        organizationId: orgId,
        user: { memberships: { some: { organizationId: orgId, departmentId } } },
      },
    });
    if (!ok) throw new NotFoundException();
  }

  async snapshots(orgId: string, examId: string, attemptId: string) {
    const a = await this.prisma.quizAttempt.findFirst({
      where: { id: attemptId, quizId: examId, organizationId: orgId },
      select: { id: true },
    });
    if (!a) throw new NotFoundException();
    const rows = await this.prisma.proctorSnapshot.findMany({
      where: { attemptId },
      orderBy: { takenAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      takenAt: r.takenAt.toISOString(),
      image: `data:image/jpeg;base64,${Buffer.from(r.image).toString('base64')}`,
    }));
  }

  async attemptDetail(
    orgId: string,
    examId: string,
    attemptId: string,
    opts: { viewOnly?: boolean } = {},
  ): Promise<AttemptDetail> {
    const a = await this.prisma.quizAttempt.findFirst({
      where: { id: attemptId, quizId: examId, organizationId: orgId },
      include: {
        events: { orderBy: { occurredAt: 'asc' } },
        user: {
          select: {
            fullName: true,
            email: true,
            memberships: {
              where: { organizationId: orgId },
              select: { externalId: true, department: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!a) throw new NotFoundException();
    const quiz = await this.prisma.quiz.findUniqueOrThrow({
      where: { id: examId },
      select: { status: true, startsAt: true, endsAt: true },
    });
    const reviewHidden = Boolean(opts.viewOnly && examState(quiz) !== 'ENDED');
    const questions = await this.engine.gradableQuestions(examId);
    const byId = new Map(questions.map((q) => [q.id, q]));
    const order = a.questionOrder as unknown as { questionId: string }[];
    const results = (a.results ?? {}) as unknown as Record<string, QuestionResult>;
    const answers = (a.answers ?? {}) as Record<string, unknown>;
    return {
      candidate: {
        userId: a.userId,
        fullName: a.user.fullName,
        email: a.user.email,
        department: a.user.memberships[0]?.department?.name ?? null,
        externalId: a.user.memberships[0]?.externalId ?? null,
        status: a.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'SUBMITTED',
        attemptId: a.id,
        score: a.score !== null ? Number(a.score) : null,
        percentage: a.percentage !== null ? Number(a.percentage) : null,
        passed: a.passed,
        rank: null,
        timeTakenSec: a.timeTakenSec,
        violationCount: a.violationCount,
        submitReason: a.submitReason,
        submittedAt: a.submittedAt?.toISOString() ?? null,
      },
      reviewHidden,
      review: (reviewHidden ? [] : order).map(({ questionId }) => {
        const q = byId.get(questionId)!;
        const r: {
          answered: boolean;
          correct: boolean;
          marks: number;
          testsPassed?: number;
          testsTotal?: number;
          pending?: boolean;
          ai?: AiReview;
          override?: number;
        } = results[questionId] ?? {
          answered: answers[questionId] !== undefined,
          correct: false,
          marks: 0,
        };
        return {
          questionId,
          type: q.type,
          prompt: q.prompt,
          options: q.options as unknown as QuestionOption[],
          yourAnswer: answers[questionId] ?? null,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          correct: r.correct,
          answered: r.answered,
          marks: r.marks,
          points: q.points,
          ...(q.type === 'CODING'
            ? {
                testsPassed: r.testsPassed ?? 0,
                testsTotal: r.testsTotal ?? 0,
                pending: r.pending,
                ai: r.ai,
                override: r.override,
              }
            : {}),
        };
      }),
      events: a.events.map((e) => ({
        type: e.type,
        counted: e.counted,
        occurredAt: e.occurredAt.toISOString(),
      })),
      ipAddress: a.ipAddress,
      userAgent: a.userAgent,
      startedAt: a.startedAt.toISOString(),
      deadlineAt: a.deadlineAt?.toISOString() ?? null,
      voided: a.voidedAt
        ? {
            at: a.voidedAt.toISOString(),
            reason: a.voidReason ?? '',
            until: a.reexamUntil?.toISOString() ?? null,
          }
        : null,
      attempts: (
        await this.prisma.quizAttempt.findMany({
          where: { quizId: examId, userId: a.userId },
          orderBy: { attemptNo: 'desc' },
          select: {
            id: true,
            attemptNo: true,
            percentage: true,
            status: true,
            voidedAt: true,
            submittedAt: true,
          },
        })
      ).map((x) => ({
        id: x.id,
        attemptNo: x.attemptNo,
        percentage: x.percentage !== null ? Number(x.percentage) : null,
        status: x.status === 'IN_PROGRESS' ? ('IN_PROGRESS' as const) : ('SUBMITTED' as const),
        voided: Boolean(x.voidedAt),
        submittedAt: x.submittedAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Re-exam: sets a submitted attempt aside (kept, with its log and photos, but it no longer
   * counts) so the student can write the exam again. If the exam has closed, the fresh attempt
   * can start until `until` (default: 24 hours from now).
   */
  async grantReexam(
    actor: User,
    orgId: string,
    examId: string,
    attemptId: string,
    input: { reason: string; until?: Date | null },
  ) {
    const a = await this.prisma.quizAttempt.findFirst({
      where: { id: attemptId, quizId: examId, organizationId: orgId },
      include: { quiz: { select: { status: true, startsAt: true, endsAt: true } } },
    });
    if (!a) throw new NotFoundException();
    if (a.status === 'IN_PROGRESS')
      throw new ConflictException({
        code: 'ATTEMPT_IN_PROGRESS',
        message: 'The student is still writing this attempt — they can simply continue it',
      });
    if (a.voidedAt)
      throw new ConflictException({
        code: 'ALREADY_REEXAM',
        message: 'A re-exam was already given for this attempt',
      });
    const now = new Date();
    const closed = examState(a.quiz, now) === 'ENDED';
    let until: Date | null = input.until ?? null;
    if (until && until <= now)
      throw new ConflictException({
        code: 'BAD_UNTIL',
        message: 'Choose a time in the future for the re-exam',
      });
    if (!until && closed) until = new Date(now.getTime() + 24 * 3_600_000);
    await this.prisma.quizAttempt.update({
      where: { id: attemptId },
      data: { voidedAt: now, voidReason: input.reason, voidedById: actor.id, reexamUntil: until },
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'exam.reexam_granted',
      entityType: 'quiz_attempt',
      entityId: attemptId,
      meta: { examId, userId: a.userId, reason: input.reason, until: until?.toISOString() ?? null },
    });
    return this.attemptDetail(orgId, examId, attemptId);
  }

  async forceSubmit(actor: User, orgId: string, examId: string, attemptId: string) {
    const a = await this.prisma.quizAttempt.findFirst({
      where: { id: attemptId, quizId: examId, organizationId: orgId },
    });
    if (!a) throw new NotFoundException();
    await this.engine.finalize(attemptId, 'INSTRUCTOR');
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'exam.attempt_force_submitted',
      entityType: 'quiz_attempt',
      entityId: attemptId,
    });
    return this.attemptDetail(orgId, examId, attemptId);
  }

  /**
   * Faculty sets (or clears, with null) the marks for one question of a submitted attempt —
   * e.g. to correct an AI mark. Kept through later re-grades.
   */
  async setMarks(
    actor: User,
    orgId: string,
    examId: string,
    attemptId: string,
    input: { questionId: string; marks: number | null },
  ) {
    const a = await this.prisma.quizAttempt.findFirst({
      where: { id: attemptId, quizId: examId, organizationId: orgId },
    });
    if (!a) throw new NotFoundException();
    if (a.status !== 'GRADED')
      throw new ConflictException({
        code: 'NOT_SUBMITTED',
        message: 'Marks can be changed after the attempt is submitted',
      });
    const results = { ...((a.results ?? {}) as Record<string, Record<string, unknown>>) };
    const prev = results[input.questionId];
    if (!prev) throw new NotFoundException({ message: 'Question is not part of this attempt' });
    const next = { ...prev };
    if (input.marks === null) delete next.override;
    else next.override = input.marks;
    results[input.questionId] = next;
    await this.prisma.quizAttempt.update({
      where: { id: attemptId },
      data: { results: results as unknown as Prisma.InputJsonValue },
    });
    await this.engine.regrade(attemptId, Date.now() + 15_000);
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'exam.marks_changed',
      entityType: 'quiz_attempt',
      entityId: attemptId,
      meta: { questionId: input.questionId, marks: input.marks, before: Number(prev.marks ?? 0) },
    });
    return this.attemptDetail(orgId, examId, attemptId);
  }

  /**
   * Stops a live exam now: closes the window and submits everyone still writing. Coding answers
   * of those attempts are marked afterwards with "Evaluate coding answers".
   */
  async endNow(actor: User, orgId: string, examId: string) {
    const exam = await this.prisma.quiz.findFirst({ where: { id: examId, organizationId: orgId } });
    if (!exam) throw new NotFoundException();
    const now = new Date();
    if (examState(exam, now) !== 'LIVE')
      throw new ConflictException({
        code: 'EXAM_NOT_LIVE',
        message: 'Only a live exam can be stopped',
      });
    await this.prisma.quiz.update({ where: { id: examId }, data: { endsAt: now } });
    const open = await this.prisma.quizAttempt.findMany({
      where: { quizId: examId, status: 'IN_PROGRESS' },
      select: { id: true },
    });
    let closed = 0;
    for (const a of open)
      if (await this.engine.finalize(a.id, 'INSTRUCTOR', now, { deferCoding: true })) closed++;
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'exam.stopped',
      entityType: 'quiz',
      entityId: examId,
      meta: { submitted: closed },
    });
    const codingPending = await this.prisma.quizAttempt.count({
      where: { quizId: examId, status: 'GRADED', codingPending: true },
    });
    return { submitted: closed, codingPending };
  }

  /** Re-runs coding answers that were waiting for the code runner (e.g. after it's connected). */
  async evaluateCoding(actor: User, orgId: string, examId: string) {
    const exam = await this.prisma.quiz.findFirst({ where: { id: examId, organizationId: orgId } });
    if (!exam) throw new NotFoundException();
    const pending = await this.prisma.quizAttempt.findMany({
      where: { quizId: examId, status: 'GRADED', codingPending: true },
      select: { id: true },
      take: 50, // one request stays within serverless time limits; call again for more
    });
    // Stay inside one serverless request (~30 s); the page calls again while some remain.
    const deadline = Date.now() + 22_000;
    let evaluated = 0;
    for (const a of pending) {
      if (Date.now() > deadline - 3000) break;
      if (await this.engine.regrade(a.id, deadline)) evaluated++;
    }
    const remaining = await this.prisma.quizAttempt.count({
      where: { quizId: examId, status: 'GRADED', codingPending: true },
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'exam.coding_evaluated',
      entityType: 'quiz',
      entityId: examId,
      meta: { evaluated, remaining },
    });
    return { evaluated, remaining };
  }

  async csv(orgId: string, examId: string, departmentId?: string | null) {
    const a = await this.analytics(orgId, examId, { departmentId });
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'Rank',
      'Name',
      'Email',
      'Roll no.',
      'Department',
      'Status',
      'Score',
      'Max score',
      'Percentage',
      'Result',
      'Time taken (min)',
      'Violations',
      'Submitted by',
      'Submitted at',
    ];
    const lines = a.candidates.map((c) =>
      [
        c.rank,
        c.fullName,
        c.email,
        c.externalId,
        c.department,
        c.status.replace('_', ' ').toLowerCase(),
        c.score,
        c.status === 'SUBMITTED' ? a.exam.totalMarks : '',
        c.percentage,
        c.passed === null ? '' : c.passed ? 'Pass' : 'Fail',
        c.timeTakenSec !== null ? round2(c.timeTakenSec / 60) : '',
        c.violationCount,
        c.submitReason ? c.submitReason.replace('_', ' ').toLowerCase() : '',
        c.submittedAt,
      ]
        .map(esc)
        .join(','),
    );
    return {
      filename: `${a.exam.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-results.csv`,
      body: '﻿' + [header.join(','), ...lines].join('\r\n'),
    };
  }
}
