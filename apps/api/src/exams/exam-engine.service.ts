import { Injectable, Logger } from '@nestjs/common';
import type { ExamState, SubmitReasonName } from '@arc/types';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeOutput } from '@arc/validation';
import { CodeRunner, RunnerUnavailableError } from './code-runner';
import { gradeAttempt, type CodeOutcome, type GradableQuestion } from './grading';

/** Longest we spend running coding answers while submitting (serverless requests are capped). */
const CODE_EVAL_BUDGET_MS = 20_000;

type StoredCoding = {
  languages: string[];
  testCases: { input: string; output: string }[];
  timeLimitMs?: number;
};

/** Seconds of network grace after the deadline before an answer save is refused. */
export const SAVE_GRACE_SEC = 5;

export type ExamRow = Prisma.QuizGetPayload<{ include: { audiences: true } }>;

export function examState(
  exam: { status: string; startsAt: Date | null; endsAt: Date | null },
  now = new Date(),
): ExamState {
  if (exam.status !== 'PUBLISHED') return 'DRAFT';
  if (exam.startsAt && now < exam.startsAt) return 'SCHEDULED';
  if (exam.endsAt && now >= exam.endsAt) return 'ENDED';
  return 'LIVE';
}

export function toGradable(q: {
  id: string;
  type: string;
  correctAnswer: unknown;
  points: number;
  negativeMarks: Prisma.Decimal | number;
  topic: string | null;
  difficulty: string;
}): GradableQuestion {
  return {
    id: q.id,
    type: q.type,
    correctAnswer: q.correctAnswer,
    points: q.points,
    negativeMarks: Number(q.negativeMarks),
    topic: q.topic,
    difficulty: q.difficulty,
  };
}

@Injectable()
export class ExamEngine {
  private readonly logger = new Logger(ExamEngine.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: CodeRunner,
  ) {}

  /**
   * Runs every coding answer against all its test cases. Questions that can't be evaluated right
   * now (no runner, runner down, out of time) come back as 'pending' and can be re-evaluated later.
   */
  async evaluateCoding(
    questions: { id: string; type: string; coding: unknown }[],
    answers: Record<string, unknown>,
  ): Promise<Record<string, CodeOutcome>> {
    const out: Record<string, CodeOutcome> = {};
    const coding = questions.filter((q) => q.type === 'CODING');
    if (!coding.length) return out;
    const started = Date.now();
    for (const q of coding) {
      const a = answers[q.id] as { language?: string; code?: string } | undefined;
      const cfg = q.coding as StoredCoding | null;
      if (!a?.code?.trim() || !cfg) continue; // unanswered: graded as 0 without running
      if (!this.runner.configured || Date.now() - started > CODE_EVAL_BUDGET_MS) {
        out[q.id] = 'pending';
        continue;
      }
      if (!cfg.languages.includes(a.language ?? '')) {
        out[q.id] = { passed: 0, total: cfg.testCases.length };
        continue;
      }
      try {
        const runs = await Promise.race([
          this.runner.runMany(
            a.language as 'c' | 'python',
            a.code,
            cfg.testCases.map((t) => t.input),
            cfg.timeLimitMs ?? 2000,
          ),
          new Promise<null>((r) =>
            setTimeout(() => r(null), Math.max(1000, CODE_EVAL_BUDGET_MS - (Date.now() - started))),
          ),
        ]);
        if (!runs) {
          out[q.id] = 'pending';
          continue;
        }
        const passed = runs.filter(
          (r, i) =>
            r.status === 'OK' &&
            normalizeOutput(r.stdout) === normalizeOutput(cfg.testCases[i]!.output),
        ).length;
        out[q.id] = { passed, total: cfg.testCases.length };
      } catch (e) {
        if (!(e instanceof RunnerUnavailableError)) this.logger.error((e as Error).message);
        out[q.id] = 'pending';
      }
    }
    return out;
  }

  /** Active learners this exam is assigned to (userId → membership info). */
  async assignedCandidates(exam: ExamRow) {
    const deptIds = exam.audiences
      .map((a) => a.departmentId)
      .filter((x): x is string => Boolean(x));
    const userIds = exam.audiences.map((a) => a.userId).filter((x): x is string => Boolean(x));
    const or: Prisma.OrganizationMemberWhereInput[] = [];
    if (exam.assignToAll) or.push({ roles: { has: 'LEARNER' } });
    if (deptIds.length) or.push({ departmentId: { in: deptIds }, roles: { has: 'LEARNER' } });
    if (userIds.length) or.push({ userId: { in: userIds } });
    if (!or.length) return [];
    return this.prisma.organizationMember.findMany({
      where: {
        organizationId: exam.organizationId,
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
        OR: or,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        department: { select: { name: true } },
      },
      orderBy: { user: { fullName: 'asc' } },
    });
  }

  async isAssigned(exam: ExamRow, userId: string): Promise<boolean> {
    const m = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: exam.organizationId, userId } },
      include: { organization: { select: { status: true } }, user: { select: { status: true } } },
    });
    if (
      !m ||
      m.status !== 'ACTIVE' ||
      m.organization.status !== 'ACTIVE' ||
      m.user.status !== 'ACTIVE'
    )
      return false;
    if (exam.assignToAll && m.roles.includes('LEARNER')) return true;
    // Individually picked people are always assigned; departments only include their learners.
    return exam.audiences.some(
      (a) =>
        a.userId === userId ||
        (a.departmentId && a.departmentId === m.departmentId && m.roles.includes('LEARNER')),
    );
  }

  /** Exam questions in exam order, with the answer key (server-side only). */
  async gradableQuestions(quizId: string) {
    const rows = await this.prisma.quizQuestion.findMany({
      where: { quizId },
      orderBy: { position: 'asc' },
      include: { question: true },
    });
    return rows.map((r) => r.question);
  }

  /**
   * Grades and closes an in-progress attempt. Idempotent: returns false if it was already closed
   * (guards against double submit / races via a conditional update).
   */
  async finalize(attemptId: string, reason: SubmitReasonName, now = new Date()): Promise<boolean> {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: { quiz: true },
    });
    if (!attempt || attempt.status !== 'IN_PROGRESS') return false;
    const rows = await this.gradableQuestions(attempt.quizId);
    const answers = (attempt.answers ?? {}) as Record<string, unknown>;
    const code = await this.evaluateCoding(rows, answers);
    const g = gradeAttempt(
      rows.map(toGradable),
      answers,
      { negativeMarking: attempt.quiz.negativeMarking, passPct: attempt.quiz.passPct },
      code,
    );
    const end = attempt.deadlineAt && attempt.deadlineAt < now ? attempt.deadlineAt : now;
    const updated = await this.prisma.quizAttempt.updateMany({
      where: { id: attemptId, status: 'IN_PROGRESS' },
      data: {
        status: 'GRADED',
        results: g.results as unknown as Prisma.InputJsonValue,
        score: g.score,
        maxScore: g.maxScore,
        percentage: g.percentage,
        passed: g.passed,
        correctCount: g.correctCount,
        wrongCount: g.wrongCount,
        unansweredCount: g.unansweredCount,
        codingPending: g.codingPending,
        submittedAt: end,
        submitReason: reason,
        timeTakenSec: Math.max(0, Math.round((end.getTime() - attempt.startedAt.getTime()) / 1000)),
        sessionId: null,
      },
    });
    return updated.count === 1;
  }

  /**
   * Re-grades a submitted attempt (used when coding answers were waiting for the code runner).
   * Returns true if the grade changed state (e.g. no longer pending).
   */
  async regrade(attemptId: string): Promise<boolean> {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: { quiz: true },
    });
    if (!attempt || attempt.status !== 'GRADED') return false;
    const rows = await this.gradableQuestions(attempt.quizId);
    const answers = (attempt.answers ?? {}) as Record<string, unknown>;
    const code = await this.evaluateCoding(rows, answers);
    const g = gradeAttempt(
      rows.map(toGradable),
      answers,
      { negativeMarking: attempt.quiz.negativeMarking, passPct: attempt.quiz.passPct },
      code,
    );
    await this.prisma.quizAttempt.update({
      where: { id: attemptId },
      data: {
        results: g.results as unknown as Prisma.InputJsonValue,
        score: g.score,
        maxScore: g.maxScore,
        percentage: g.percentage,
        passed: g.passed,
        correctCount: g.correctCount,
        wrongCount: g.wrongCount,
        unansweredCount: g.unansweredCount,
        codingPending: g.codingPending,
      },
    });
    return !g.codingPending;
  }

  /** Closes every in-progress attempt whose deadline has passed (lazy, called on read paths). */
  async finalizeExpired(where: Prisma.QuizAttemptWhereInput = {}) {
    const now = new Date();
    const expired = await this.prisma.quizAttempt.findMany({
      where: {
        ...where,
        status: 'IN_PROGRESS',
        deadlineAt: { lt: new Date(now.getTime() - SAVE_GRACE_SEC * 1000) },
      },
      select: { id: true, deadlineAt: true, quiz: { select: { endsAt: true } } },
    });
    for (const a of expired) {
      const reason: SubmitReasonName =
        a.quiz.endsAt && a.deadlineAt && a.deadlineAt.getTime() >= a.quiz.endsAt.getTime()
          ? 'WINDOW_CLOSED'
          : 'TIME_UP';
      try {
        await this.finalize(a.id, reason, now);
      } catch (e) {
        this.logger.error(`Failed to finalize attempt ${a.id}: ${(e as Error).message}`);
      }
    }
    return expired.length;
  }
}
