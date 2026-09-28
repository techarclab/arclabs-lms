import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  AttemptResult,
  AttemptSession,
  DeliveredQuestion,
  ExamLobby,
  MyExamItem,
  ProctorEventResult,
  QuestionOption,
  ReviewItem,
} from '@arc/types';
import type { ProctorEventInput, SaveAnswerInput } from '@arc/validation';
import type { Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ExamEngine,
  examState,
  SAVE_GRACE_SEC,
  toGradable,
  type ExamRow,
} from './exam-engine.service';
import {
  breakdown,
  competitionRanks,
  percentileOf,
  round2,
  shuffle,
  type QuestionResult,
} from './grading';

/** Events that count towards the violation limit. The rest are logged only (they're blocked client-side). */
const COUNTED = new Set([
  'FULLSCREEN_EXIT',
  'TAB_HIDDEN',
  'WINDOW_BLUR',
  'DEVTOOLS',
  'SESSION_TAKEOVER',
]);
/** A blur and a tab-hide usually fire together; count at most one violation per this many ms. */
const VIOLATION_DEBOUNCE_MS = 2500;
/** A session seen this recently is considered "still open" when another device starts. */
const LIVE_SESSION_MS = 20_000;

type QuestionOrder = { questionId: string; optionOrder: string[] }[];

@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ExamEngine,
  ) {}

  // ───────── Listing & lobby ─────────

  async listMine(user: User): Promise<MyExamItem[]> {
    await this.engine.finalizeExpired({ userId: user.id });
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId: user.id, status: 'ACTIVE', organization: { status: 'ACTIVE' } },
      select: { organizationId: true },
    });
    const exams = await this.prisma.quiz.findMany({
      where: {
        organizationId: { in: memberships.map((m) => m.organizationId) },
        status: 'PUBLISHED',
        courseId: null,
      },
      include: { audiences: true },
      orderBy: { startsAt: 'desc' },
    });
    const items: MyExamItem[] = [];
    for (const exam of exams) {
      if (await this.engine.isAssigned(exam, user.id)) items.push(await this.myItem(exam, user));
    }
    return items;
  }

  async lobby(user: User, examId: string): Promise<ExamLobby> {
    const exam = await this.assignedExam(user, examId);
    await this.engine.finalizeExpired({ userId: user.id, quizId: examId });
    return {
      ...(await this.myItem(exam, user)),
      instructions: exam.instructions,
      negativeMarking: exam.negativeMarking,
      passPct: exam.passPct,
      requireFullscreen: exam.requireFullscreen,
      blockCopyPaste: exam.blockCopyPaste,
      maxViolations: exam.maxViolations,
      resultVisibility: exam.resultVisibility,
      serverNow: new Date().toISOString(),
    };
  }

  private async myItem(exam: ExamRow, user: User): Promise<MyExamItem> {
    const [org, qs, attempts] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: exam.organizationId },
        select: { name: true },
      }),
      this.prisma.quizQuestion.findMany({
        where: { quizId: exam.id },
        select: { question: { select: { points: true } } },
      }),
      this.prisma.quizAttempt.findMany({
        where: { quizId: exam.id, userId: user.id },
        orderBy: { attemptNo: 'desc' },
      }),
    ]);
    const state = examState(exam);
    const graded = attempts.filter((a) => a.status !== 'IN_PROGRESS');
    const inProgress = attempts.find((a) => a.status === 'IN_PROGRESS') ?? null;
    const last = graded[0] ?? null;
    const maxAttempts = exam.maxAttempts ?? 1;
    const visible = this.scoreVisible(exam);
    return {
      id: exam.id,
      organizationId: exam.organizationId,
      organizationName: org?.name ?? '',
      title: exam.title,
      state,
      startsAt: exam.startsAt?.toISOString() ?? null,
      endsAt: exam.endsAt?.toISOString() ?? null,
      durationMinutes: exam.timeLimitMinutes,
      questionCount: qs.length,
      totalMarks: qs.reduce((s, q) => s + q.question.points, 0),
      attemptsUsed: graded.length,
      maxAttempts,
      inProgressAttemptId: inProgress?.id ?? null,
      lastAttempt: last
        ? {
            id: last.id,
            percentage: visible && last.percentage !== null ? Number(last.percentage) : null,
            score: visible && last.score !== null ? Number(last.score) : null,
            passed: visible ? last.passed : null,
            submittedAt: last.submittedAt?.toISOString() ?? null,
            resultVisible: visible,
          }
        : null,
      canStart: state === 'LIVE' && (Boolean(inProgress) || graded.length < maxAttempts),
    };
  }

  // ───────── Start / resume ─────────

  async start(
    user: User,
    examId: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<AttemptSession> {
    const exam = await this.assignedExam(user, examId);
    const state = examState(exam);
    if (state === 'SCHEDULED')
      throw new ForbiddenException({
        code: 'EXAM_NOT_OPEN',
        message: 'This exam hasn’t opened yet',
      });
    if (state === 'ENDED')
      throw new ForbiddenException({ code: 'EXAM_CLOSED', message: 'This exam has closed' });
    await this.engine.finalizeExpired({ userId: user.id, quizId: examId });

    const now = new Date();
    const sessionId = randomUUID();
    const existing = await this.prisma.quizAttempt.findFirst({
      where: { quizId: examId, userId: user.id, status: 'IN_PROGRESS' },
    });

    if (existing) {
      const takeover =
        existing.lastSeenAt && now.getTime() - existing.lastSeenAt.getTime() < LIVE_SESSION_MS;
      await this.prisma.quizAttempt.update({
        where: { id: existing.id },
        data: {
          sessionId,
          lastSeenAt: now,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          ...(takeover ? { violationCount: { increment: 1 } } : {}),
          events: {
            create: {
              type: takeover ? 'SESSION_TAKEOVER' : 'RESUMED',
              counted: Boolean(takeover),
              meta: { ip: meta.ip ?? '' },
            },
          },
        },
      });
      if (takeover && exam.maxViolations > 0 && existing.violationCount + 1 >= exam.maxViolations) {
        await this.engine.finalize(existing.id, 'VIOLATIONS');
        throw new ConflictException({
          code: 'AUTO_SUBMITTED',
          message: 'Your exam was submitted automatically after repeated violations',
          details: { attemptId: existing.id },
        });
      }
      return this.session(exam, existing.id, sessionId, true);
    }

    const used = await this.prisma.quizAttempt.count({
      where: { quizId: examId, userId: user.id },
    });
    if (used >= (exam.maxAttempts ?? 1)) {
      throw new ConflictException({
        code: 'NO_ATTEMPTS_LEFT',
        message: 'You have used all your attempts for this exam',
      });
    }

    const questions = await this.engine.gradableQuestions(examId);
    if (!questions.length)
      throw new ConflictException({ code: 'EXAM_EMPTY', message: 'This exam has no questions' });
    const ordered = exam.shuffleQuestions ? shuffle(questions) : questions;
    const order: QuestionOrder = ordered.map((q) => {
      const ids = (q.options as unknown as QuestionOption[]).map((o) => o.id);
      const shuffleable =
        exam.shuffleOptions && (q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE');
      return { questionId: q.id, optionOrder: shuffleable ? shuffle(ids) : ids };
    });
    const byDuration = new Date(now.getTime() + (exam.timeLimitMinutes ?? 60) * 60_000);
    const deadlineAt = exam.endsAt && exam.endsAt < byDuration ? exam.endsAt : byDuration;

    try {
      const attempt = await this.prisma.quizAttempt.create({
        data: {
          organizationId: exam.organizationId,
          quizId: examId,
          userId: user.id,
          attemptNo: used + 1,
          questionOrder: order as unknown as Prisma.InputJsonValue,
          deadlineAt,
          sessionId,
          lastSeenAt: now,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        },
      });
      return this.session(exam, attempt.id, sessionId, false);
    } catch (e) {
      // Two tabs pressing Start at the same instant: the unique (quiz, user, attemptNo) wins once.
      if ((e as { code?: string }).code === 'P2002') return this.start(user, examId, meta);
      throw e;
    }
  }

  private async session(
    exam: ExamRow,
    attemptId: string,
    sessionId: string,
    resumed: boolean,
  ): Promise<AttemptSession> {
    const attempt = await this.prisma.quizAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    const order = attempt.questionOrder as unknown as QuestionOrder;
    const qs = await this.prisma.question.findMany({
      where: { id: { in: order.map((o) => o.questionId) } },
    });
    const byId = new Map(qs.map((q) => [q.id, q]));
    const questions: DeliveredQuestion[] = order.map(({ questionId, optionOrder }) => {
      const q = byId.get(questionId)!;
      const opts = new Map((q.options as unknown as QuestionOption[]).map((o) => [o.id, o]));
      return {
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        options: optionOrder.map((id) => opts.get(id)!).filter(Boolean),
        points: q.points,
        negativeMarks: exam.negativeMarking ? Number(q.negativeMarks) : 0,
      };
    });
    return {
      attemptId,
      sessionId,
      examId: exam.id,
      title: exam.title,
      deadlineAt: attempt.deadlineAt!.toISOString(),
      serverNow: new Date().toISOString(),
      questions,
      answers: (attempt.answers ?? {}) as Record<string, unknown>,
      violationCount: attempt.violationCount,
      maxViolations: exam.maxViolations,
      requireFullscreen: exam.requireFullscreen,
      blockCopyPaste: exam.blockCopyPaste,
      negativeMarking: exam.negativeMarking,
      resumed,
    };
  }

  // ───────── During the attempt ─────────

  async saveAnswer(
    user: User,
    attemptId: string,
    sessionId: string | undefined,
    input: SaveAnswerInput,
  ) {
    const attempt = await this.liveAttempt(user, attemptId, sessionId);
    const order = attempt.questionOrder as unknown as QuestionOrder;
    const entry = order.find((o) => o.questionId === input.questionId);
    if (!entry)
      throw new UnprocessableEntityException({
        code: 'INVALID_QUESTION',
        message: 'Question is not part of this exam',
      });
    const q = await this.prisma.question.findUniqueOrThrow({
      where: { id: input.questionId },
      select: { type: true },
    });
    const answer = normalizeAnswer(q.type, input.answer, entry.optionOrder);

    const now = new Date();
    const count =
      answer === null
        ? await this.prisma
            .$executeRaw`UPDATE "quiz_attempts" SET "answers" = "answers" - ${input.questionId}, "lastSeenAt" = ${now}
            WHERE "id" = ${attemptId}::uuid AND "status" = 'IN_PROGRESS' AND "sessionId" = ${sessionId}`
        : await this.prisma
            .$executeRaw`UPDATE "quiz_attempts" SET "answers" = jsonb_set("answers", ARRAY[${input.questionId}], ${JSON.stringify(answer)}::jsonb, true), "lastSeenAt" = ${now}
            WHERE "id" = ${attemptId}::uuid AND "status" = 'IN_PROGRESS' AND "sessionId" = ${sessionId}`;
    if (count !== 1)
      throw new ConflictException({
        code: 'ATTEMPT_CLOSED',
        message: 'This attempt is no longer active',
      });
    return {
      savedAt: now.toISOString(),
      serverNow: now.toISOString(),
      deadlineAt: attempt.deadlineAt!.toISOString(),
    };
  }

  async heartbeat(user: User, attemptId: string, sessionId: string | undefined) {
    const attempt = await this.liveAttempt(user, attemptId, sessionId);
    const now = new Date();
    await this.prisma.quizAttempt.update({ where: { id: attemptId }, data: { lastSeenAt: now } });
    return {
      serverNow: now.toISOString(),
      deadlineAt: attempt.deadlineAt!.toISOString(),
      violationCount: attempt.violationCount,
    };
  }

  async recordEvent(
    user: User,
    attemptId: string,
    sessionId: string | undefined,
    input: ProctorEventInput,
  ): Promise<ProctorEventResult> {
    const attempt = await this.liveAttempt(user, attemptId, sessionId);
    const exam = await this.prisma.quiz.findUniqueOrThrow({
      where: { id: attempt.quizId },
      select: { maxViolations: true },
    });
    let counted = COUNTED.has(input.type);
    if (counted) {
      const recent = await this.prisma.proctorEvent.findFirst({
        where: {
          attemptId,
          counted: true,
          occurredAt: { gt: new Date(Date.now() - VIOLATION_DEBOUNCE_MS) },
        },
      });
      if (recent) counted = false;
    }
    const updated = await this.prisma.quizAttempt.update({
      where: { id: attemptId },
      data: {
        ...(counted ? { violationCount: { increment: 1 } } : {}),
        lastSeenAt: new Date(),
        events: {
          create: { type: input.type, counted, meta: (input.meta ?? {}) as Prisma.InputJsonValue },
        },
      },
      select: { violationCount: true },
    });
    const limit = exam.maxViolations;
    let autoSubmitted = false;
    if (counted && limit > 0 && updated.violationCount >= limit) {
      autoSubmitted = await this.engine.finalize(attemptId, 'VIOLATIONS');
    }
    return {
      violationCount: updated.violationCount,
      remaining: limit > 0 ? Math.max(0, limit - updated.violationCount) : null,
      autoSubmitted,
    };
  }

  async submit(
    user: User,
    attemptId: string,
    sessionId: string | undefined,
  ): Promise<AttemptResult> {
    const attempt = await this.ownAttempt(user, attemptId);
    if (attempt.status === 'IN_PROGRESS') {
      if (attempt.sessionId !== sessionId) {
        throw new ConflictException({
          code: 'SESSION_REPLACED',
          message: 'This exam is open in another window',
        });
      }
      await this.engine.finalize(attemptId, 'MANUAL');
    }
    return this.result(user, attemptId);
  }

  // ───────── Results ─────────

  async result(user: User, attemptId: string): Promise<AttemptResult> {
    let attempt = await this.ownAttempt(user, attemptId);
    if (attempt.status === 'IN_PROGRESS') {
      await this.engine.finalizeExpired({ id: attemptId });
      attempt = await this.ownAttempt(user, attemptId);
      if (attempt.status === 'IN_PROGRESS') {
        throw new ConflictException({
          code: 'IN_PROGRESS',
          message: 'This attempt is still in progress',
        });
      }
    }
    const exam = await this.prisma.quiz.findUniqueOrThrow({
      where: { id: attempt.quizId },
      include: { organization: { select: { name: true } } },
    });
    const scoreVisible = this.scoreVisible(exam);
    const reviewVisible = this.reviewVisible(exam);
    const questions = await this.engine.gradableQuestions(exam.id);
    const gradable = questions.map(toGradable);
    const results = (attempt.results ?? {}) as unknown as Record<string, QuestionResult>;

    let rank: number | null = null;
    let candidates: number | null = null;
    let percentile: number | null = null;
    if (scoreVisible) {
      const best = await this.bestPercentages(exam.id);
      const ranks = competitionRanks([...best.entries()].map(([id, value]) => ({ id, value })));
      rank = ranks.get(user.id) ?? null;
      candidates = best.size;
      const mine = best.get(user.id);
      percentile = mine !== undefined ? percentileOf(mine, [...best.values()]) : null;
    }

    const order = attempt.questionOrder as unknown as QuestionOrder;
    const qById = new Map(questions.map((q) => [q.id, q]));
    const answers = (attempt.answers ?? {}) as Record<string, unknown>;
    const review: ReviewItem[] | null = reviewVisible
      ? order.map(({ questionId }) => {
          const q = qById.get(questionId)!;
          const r = results[questionId] ?? { answered: false, correct: false, marks: 0 };
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
          };
        })
      : null;

    const num = (d: unknown) => (d === null || d === undefined ? null : Number(d));
    return {
      attemptId,
      examId: exam.id,
      title: exam.title,
      organizationName: exam.organization.name,
      scoreVisible,
      releaseNote: !scoreVisible
        ? 'Your answers were submitted. Results will be published by your institution.'
        : !reviewVisible
          ? exam.resultVisibility === 'SCORE_NOW_ANSWERS_AFTER_CLOSE'
            ? 'Correct answers and explanations unlock when the exam window closes.'
            : 'Detailed answers will be available when results are released.'
          : null,
      score: scoreVisible ? num(attempt.score) : null,
      maxScore: scoreVisible ? num(attempt.maxScore) : null,
      percentage: scoreVisible ? num(attempt.percentage) : null,
      passed: scoreVisible ? attempt.passed : null,
      passPct: exam.passPct,
      correctCount: scoreVisible ? attempt.correctCount : null,
      wrongCount: scoreVisible ? attempt.wrongCount : null,
      unansweredCount: scoreVisible ? attempt.unansweredCount : null,
      timeTakenSec: attempt.timeTakenSec,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      submitReason: attempt.submitReason,
      violationCount: attempt.violationCount,
      rank,
      candidates,
      percentile,
      byTopic: scoreVisible
        ? breakdown(gradable, results, (q) => q.topic ?? 'General').map(toRow)
        : [],
      byDifficulty: scoreVisible
        ? breakdown(gradable, results, (q) => q.difficulty).map(toRow)
        : [],
      review,
      reviewAvailableAt:
        !reviewVisible && exam.resultVisibility === 'SCORE_NOW_ANSWERS_AFTER_CLOSE'
          ? (exam.endsAt?.toISOString() ?? null)
          : null,
    };
  }

  /** Best graded percentage per candidate. */
  async bestPercentages(quizId: string) {
    const rows = await this.prisma.quizAttempt.groupBy({
      by: ['userId'],
      where: { quizId, status: 'GRADED' },
      _max: { percentage: true },
    });
    return new Map(rows.map((r) => [r.userId, Number(r._max.percentage ?? 0)]));
  }

  private scoreVisible(exam: { resultVisibility: string; resultsReleasedAt: Date | null }) {
    return exam.resultVisibility !== 'MANUAL_RELEASE' || Boolean(exam.resultsReleasedAt);
  }

  private reviewVisible(exam: {
    resultVisibility: string;
    resultsReleasedAt: Date | null;
    endsAt: Date | null;
  }) {
    if (exam.resultsReleasedAt) return true;
    if (exam.resultVisibility === 'IMMEDIATE') return true;
    if (exam.resultVisibility === 'SCORE_NOW_ANSWERS_AFTER_CLOSE')
      return Boolean(exam.endsAt && new Date() >= exam.endsAt);
    return false;
  }

  // ───────── Guards ─────────

  private async assignedExam(user: User, examId: string) {
    const exam = await this.prisma.quiz.findFirst({
      where: { id: examId, status: 'PUBLISHED', courseId: null },
      include: { audiences: true },
    });
    if (!exam || !(await this.engine.isAssigned(exam, user.id))) throw new NotFoundException();
    return exam;
  }

  private async ownAttempt(user: User, attemptId: string) {
    const a = await this.prisma.quizAttempt.findFirst({
      where: { id: attemptId, userId: user.id },
    });
    if (!a) throw new NotFoundException();
    return a;
  }

  /** An attempt the caller may still write to: own, in progress, same session, before the deadline. */
  private async liveAttempt(user: User, attemptId: string, sessionId: string | undefined) {
    const a = await this.ownAttempt(user, attemptId);
    if (a.status !== 'IN_PROGRESS') {
      throw new ConflictException({
        code: 'ATTEMPT_CLOSED',
        message: 'This exam has already been submitted',
        details: { submitReason: a.submitReason },
      });
    }
    if (!sessionId || a.sessionId !== sessionId) {
      throw new ConflictException({
        code: 'SESSION_REPLACED',
        message:
          'This exam was opened in another window. Only the most recent window can continue.',
      });
    }
    if (a.deadlineAt && Date.now() > a.deadlineAt.getTime() + SAVE_GRACE_SEC * 1000) {
      await this.engine.finalizeExpired({ id: a.id });
      throw new ConflictException({
        code: 'TIME_UP',
        message: 'Time is up — your exam has been submitted',
      });
    }
    return a;
  }
}

function toRow(r: { key: string; correct: number; total: number; pct: number }) {
  return { key: r.key, correct: r.correct, total: r.total, pct: round2(r.pct) };
}

/** Validates an answer against the question type and the options actually shown. null = clear. */
function normalizeAnswer(type: string, answer: unknown, optionIds: string[]): unknown {
  if (answer === null || answer === '' || (Array.isArray(answer) && answer.length === 0))
    return null;
  const bad = () =>
    new UnprocessableEntityException({
      code: 'INVALID_ANSWER',
      message: 'Answer does not match the question type',
    });
  switch (type) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE':
      if (typeof answer !== 'string' || !optionIds.includes(answer)) throw bad();
      return answer;
    case 'MULTIPLE_CHOICE':
      if (
        !Array.isArray(answer) ||
        !answer.every((a) => typeof a === 'string' && optionIds.includes(a))
      )
        throw bad();
      return [...new Set(answer as string[])];
    case 'NUMERIC': {
      const n = typeof answer === 'number' ? answer : Number(answer);
      if (!Number.isFinite(n)) throw bad();
      return n;
    }
    default:
      throw bad();
  }
}
