import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ExamDetail, ExamState, ExamSummary, Paginated } from '@arc/types';
import type {
  CreateExamParsed,
  ListExamsQuery,
  SetExamAudienceInput,
  UpdateExamInput,
} from '@arc/validation';
import { AuditService } from '../audit/audit.service';
import type { OrgContextInfo } from '../auth/auth.types';
import type { Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExamEngine, examState, type ExamRow } from './exam-engine.service';
import { questionInclude, toQuestionItem } from './questions.service';

type ExamWithCounts = ExamRow & { questions: { question: { points: number } }[] };

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly engine: ExamEngine,
  ) {}

  // ───────── Department scope (faculty assigned to one department) ─────────

  /** Exams a department's faculty can see: theirs, college-wide ones, and ones for their dept. */
  scopeWhere(org: OrgContextInfo, userId: string): Prisma.QuizWhereInput {
    if (!org.departmentId) return {};
    return {
      OR: [
        { createdById: userId },
        { assignToAll: true },
        { audiences: { some: { departmentId: org.departmentId } } },
        {
          audiences: {
            some: {
              user: {
                memberships: {
                  some: { organizationId: org.organizationId, departmentId: org.departmentId },
                },
              },
            },
          },
        },
      ],
    };
  }

  /**
   * 404 when a department's faculty can't see the exam; 403 when they may see but not change it
   * (they can change exams they created or that are only for their department).
   */
  async assertAccess(org: OrgContextInfo, userId: string, id: string, write = false) {
    if (!org.departmentId) return;
    const exam = await this.prisma.quiz.findFirst({
      where: { id, organizationId: org.organizationId, ...this.scopeWhere(org, userId) },
      include: { audiences: { include: { user: { select: { memberships: true } } } } },
    });
    if (!exam) throw new NotFoundException();
    if (!write || exam.createdById === userId) return;
    const onlyMine =
      !exam.assignToAll &&
      exam.audiences.length > 0 &&
      exam.audiences.every((a) =>
        a.departmentId
          ? a.departmentId === org.departmentId
          : a.user?.memberships.some(
              (m) => m.organizationId === org.organizationId && m.departmentId === org.departmentId,
            ),
      );
    if (!onlyMine)
      throw new ForbiddenException({
        code: 'OTHER_DEPARTMENTS',
        message: 'This exam is shared with other departments — ask the college admin to change it.',
      });
  }

  // ───────── Read ─────────

  async list(
    orgId: string,
    q: ListExamsQuery,
    scope: Prisma.QuizWhereInput = {},
  ): Promise<Paginated<ExamSummary>> {
    const now = new Date();
    const stateWhere: Record<ExamState, Prisma.QuizWhereInput> = {
      DRAFT: { status: 'DRAFT' },
      SCHEDULED: { status: 'PUBLISHED', startsAt: { gt: now } },
      LIVE: { status: 'PUBLISHED', startsAt: { lte: now }, endsAt: { gt: now } },
      ENDED: { status: 'PUBLISHED', endsAt: { lte: now } },
    };
    const where: Prisma.QuizWhereInput = {
      organizationId: orgId,
      courseId: null,
      status: { not: 'ARCHIVED' },
      ...(q.state ? stateWhere[q.state] : {}),
      ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}),
      ...scope,
      ...(q.departmentId
        ? {
            AND: [
              {
                OR: [
                  { assignToAll: true },
                  { audiences: { some: { departmentId: q.departmentId } } },
                ],
              },
            ],
          }
        : {}),
    };
    await this.engine.finalizeExpired({ organizationId: orgId });
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.quiz.count({ where }),
      this.prisma.quiz.findMany({
        where,
        include: {
          audiences: true,
          questions: { select: { question: { select: { points: true } } } },
        },
        orderBy: [{ startsAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    const data = await Promise.all(rows.map((r) => this.summarize(r)));
    return { data, meta: { page: q.page, pageSize: q.pageSize, total } };
  }

  async get(orgId: string, id: string): Promise<ExamDetail> {
    const exam = await this.prisma.quiz.findFirst({
      where: { id, organizationId: orgId },
      include: {
        audiences: {
          include: {
            department: { select: { id: true, name: true } },
            user: { select: { id: true, fullName: true, email: true } },
          },
        },
        questions: {
          orderBy: { position: 'asc' },
          include: { question: { include: questionInclude } },
        },
      },
    });
    if (!exam) throw new NotFoundException();
    const summary = await this.summarize(exam);
    const questions = exam.questions.map((qq) => toQuestionItem(qq.question));
    const attempts = await this.prisma.quizAttempt.count({ where: { quizId: id } });
    return {
      ...summary,
      questions,
      audience: {
        assignToAll: exam.assignToAll,
        departments: exam.audiences.flatMap((a) => (a.department ? [a.department] : [])),
        users: exam.audiences.flatMap((a) => (a.user ? [a.user] : [])),
      },
      publishIssues: this.publishIssues(exam, summary),
      editable: exam.status === 'DRAFT' && attempts === 0,
    };
  }

  private async summarize(exam: ExamWithCounts): Promise<ExamSummary> {
    const [agg, inProgress, candidates] = await Promise.all([
      this.prisma.quizAttempt.aggregate({
        where: { quizId: exam.id, status: 'GRADED', voidedAt: null },
        _count: { _all: true },
        _avg: { percentage: true },
      }),
      this.prisma.quizAttempt.count({ where: { quizId: exam.id, status: 'IN_PROGRESS' } }),
      this.engine.assignedCandidates(exam),
    ]);
    return {
      id: exam.id,
      title: exam.title,
      instructions: exam.instructions,
      durationMinutes: exam.timeLimitMinutes,
      startsAt: exam.startsAt?.toISOString() ?? null,
      endsAt: exam.endsAt?.toISOString() ?? null,
      passPct: exam.passPct,
      maxAttempts: exam.maxAttempts ?? 1,
      shuffleQuestions: exam.shuffleQuestions,
      shuffleOptions: exam.shuffleOptions,
      negativeMarking: exam.negativeMarking,
      resultVisibility: exam.resultVisibility,
      requireFullscreen: exam.requireFullscreen,
      blockCopyPaste: exam.blockCopyPaste,
      maxViolations: exam.maxViolations,
      requireCamera: exam.requireCamera,
      state: examState(exam),
      questionCount: exam.questions.length,
      totalMarks: exam.questions.reduce((s, q) => s + q.question.points, 0),
      assignedCount: candidates.length,
      submittedCount: agg._count._all,
      inProgressCount: inProgress,
      avgPct:
        agg._avg.percentage !== null ? Math.round(Number(agg._avg.percentage) * 10) / 10 : null,
      publishedAt: exam.publishedAt?.toISOString() ?? null,
      resultsReleasedAt: exam.resultsReleasedAt?.toISOString() ?? null,
      createdAt: exam.createdAt.toISOString(),
    };
  }

  private publishIssues(exam: ExamRow, s: ExamSummary): string[] {
    const issues: string[] = [];
    if (s.questionCount === 0) issues.push('Add at least one question');
    if (!exam.timeLimitMinutes) issues.push('Set the exam duration');
    if (!exam.startsAt || !exam.endsAt) issues.push('Set when the exam window opens and closes');
    else {
      if (exam.endsAt <= exam.startsAt)
        issues.push('The window must close after it opens (check AM / PM)');
      if (exam.endsAt <= new Date()) issues.push('The closing time is in the past');
      if (
        exam.timeLimitMinutes &&
        exam.endsAt.getTime() - exam.startsAt.getTime() < exam.timeLimitMinutes * 60_000
      ) {
        issues.push('The window is shorter than the exam duration');
      }
    }
    if (!exam.assignToAll && exam.audiences.length === 0) issues.push('Choose who takes the exam');
    else if (s.assignedCount === 0) issues.push('No active learners match the chosen audience');
    return issues;
  }

  // ───────── Write ─────────

  async create(actor: User, orgId: string, input: CreateExamParsed, departmentId?: string | null) {
    const exam = await this.prisma.quiz.create({
      data: {
        organizationId: orgId,
        // A department's faculty create exams for their department.
        ...(departmentId ? { assignToAll: false, audiences: { create: [{ departmentId }] } } : {}),
        createdById: actor.id,
        title: input.title,
        instructions: input.instructions ?? DEFAULT_INSTRUCTIONS,
        timeLimitMinutes: input.durationMinutes ?? 60,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        passPct: input.passPct ?? 40,
        maxAttempts: input.maxAttempts ?? 1,
        shuffleQuestions: input.shuffleQuestions ?? true,
        shuffleOptions: input.shuffleOptions ?? true,
        negativeMarking: input.negativeMarking ?? false,
        resultVisibility: input.resultVisibility ?? 'SCORE_NOW_ANSWERS_AFTER_CLOSE',
        requireFullscreen: input.requireFullscreen ?? true,
        blockCopyPaste: input.blockCopyPaste ?? true,
        // Strict by default: leaving the exam (full screen, tab, window) submits it.
        maxViolations: input.maxViolations ?? 1,
        requireCamera: input.requireCamera ?? true,
      },
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'exam.created',
      entityType: 'exam',
      entityId: exam.id,
      meta: { title: exam.title },
    });
    return this.get(orgId, exam.id);
  }

  async update(actor: User, orgId: string, id: string, input: UpdateExamInput) {
    const exam = await this.row(orgId, id);
    const attempts = await this.prisma.quizAttempt.count({ where: { quizId: id } });
    const locked = exam.status === 'PUBLISHED' || attempts > 0;
    if (locked) {
      // Once published only wording, results policy and extending the close time are allowed.
      const allowed = new Set(['title', 'instructions', 'resultVisibility', 'endsAt']);
      const blocked = Object.keys(input).filter((k) => !allowed.has(k));
      if (blocked.length) {
        throw new ConflictException({
          code: 'EXAM_LOCKED',
          message:
            'This exam is published. Unpublish it (only possible before anyone starts) to change these settings.',
          details: { fields: blocked },
        });
      }
      if (input.endsAt && exam.endsAt && input.endsAt < exam.endsAt) {
        throw new ConflictException({
          code: 'EXAM_LOCKED',
          message: 'A published exam’s closing time can only be extended.',
        });
      }
    }
    const { durationMinutes, ...rest } = input;
    await this.prisma.quiz.update({
      where: { id },
      data: {
        ...rest,
        ...(durationMinutes !== undefined ? { timeLimitMinutes: durationMinutes } : {}),
      },
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'exam.updated',
      entityType: 'exam',
      entityId: id,
      meta: { fields: Object.keys(input) },
    });
    return this.get(orgId, id);
  }

  async setQuestions(actor: User, orgId: string, id: string, questionIds: string[]) {
    await this.assertEditable(orgId, id);
    const unique = [...new Set(questionIds)];
    const found = await this.prisma.question.findMany({
      where: {
        id: { in: unique },
        organizationId: orgId,
        archived: false,
        type: { in: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'NUMERIC', 'CODING'] },
      },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException({
        code: 'INVALID_QUESTIONS',
        message: 'Some questions are missing, archived or not supported yet',
      });
    }
    await this.prisma.$transaction([
      this.prisma.quizQuestion.deleteMany({ where: { quizId: id } }),
      this.prisma.quizQuestion.createMany({
        data: unique.map((questionId, position) => ({ quizId: id, questionId, position })),
      }),
    ]);
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'exam.questions_set',
      entityType: 'exam',
      entityId: id,
      meta: { count: unique.length },
    });
    return this.get(orgId, id);
  }

  async setAudience(
    actor: User,
    orgId: string,
    id: string,
    input: SetExamAudienceInput,
    departmentId?: string | null,
  ) {
    await this.row(orgId, id); // audience may be widened after publishing (e.g. late admissions)
    const deptIds = [...new Set(input.departmentIds ?? [])];
    const userIds = [...new Set(input.userIds ?? [])];
    if (departmentId) {
      const outside =
        input.assignToAll ||
        deptIds.some((d) => d !== departmentId) ||
        (userIds.length &&
          (await this.prisma.organizationMember.count({
            where: { organizationId: orgId, userId: { in: userIds }, departmentId },
          })) !== userIds.length);
      if (outside)
        throw new ForbiddenException({
          code: 'OTHER_DEPARTMENTS',
          message: 'You can assign exams only to students of your department.',
        });
    }
    const [depts, members] = await Promise.all([
      this.prisma.department.count({ where: { id: { in: deptIds }, organizationId: orgId } }),
      this.prisma.organizationMember.count({
        where: { userId: { in: userIds }, organizationId: orgId },
      }),
    ]);
    if (depts !== deptIds.length || members !== userIds.length) {
      throw new BadRequestException({
        code: 'INVALID_AUDIENCE',
        message: 'Departments and people must belong to this organization',
      });
    }
    await this.prisma.$transaction([
      this.prisma.quiz.update({ where: { id }, data: { assignToAll: input.assignToAll } }),
      this.prisma.examAudience.deleteMany({ where: { quizId: id } }),
      this.prisma.examAudience.createMany({
        data: [
          ...deptIds.map((departmentId) => ({ quizId: id, departmentId })),
          ...userIds.map((userId) => ({ quizId: id, userId })),
        ],
      }),
    ]);
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'exam.audience_set',
      entityType: 'exam',
      entityId: id,
      meta: { assignToAll: input.assignToAll, departments: deptIds.length, users: userIds.length },
    });
    return this.get(orgId, id);
  }

  async publish(actor: User, orgId: string, id: string) {
    const detail = await this.get(orgId, id);
    if (detail.state !== 'DRAFT')
      throw new ConflictException({
        code: 'ALREADY_PUBLISHED',
        message: 'This exam is already published',
      });
    if (detail.publishIssues.length) {
      throw new BadRequestException({
        code: 'NOT_READY',
        message: 'The exam isn’t ready to publish',
        details: detail.publishIssues,
      });
    }
    await this.prisma.quiz.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'exam.published',
      entityType: 'exam',
      entityId: id,
      meta: { title: detail.title },
    });
    return this.get(orgId, id);
  }

  async unpublish(actor: User, orgId: string, id: string) {
    const exam = await this.row(orgId, id);
    if (exam.status !== 'PUBLISHED')
      throw new ConflictException({ code: 'NOT_PUBLISHED', message: 'This exam is not published' });
    if (await this.prisma.quizAttempt.count({ where: { quizId: id } })) {
      throw new ConflictException({
        code: 'HAS_ATTEMPTS',
        message: 'Candidates have already started this exam; it can’t be unpublished',
      });
    }
    await this.prisma.quiz.update({ where: { id }, data: { status: 'DRAFT', publishedAt: null } });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'exam.unpublished',
      entityType: 'exam',
      entityId: id,
    });
    return this.get(orgId, id);
  }

  async releaseResults(actor: User, orgId: string, id: string) {
    await this.row(orgId, id);
    await this.prisma.quiz.update({ where: { id }, data: { resultsReleasedAt: new Date() } });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'exam.results_released',
      entityType: 'exam',
      entityId: id,
    });
    return this.get(orgId, id);
  }

  async remove(actor: User, orgId: string, id: string) {
    const exam = await this.row(orgId, id);
    if (await this.prisma.quizAttempt.count({ where: { quizId: id } })) {
      await this.prisma.quiz.update({ where: { id }, data: { status: 'ARCHIVED' } });
    } else {
      await this.prisma.quiz.delete({ where: { id } });
    }
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'exam.deleted',
      entityType: 'exam',
      entityId: id,
      meta: { title: exam.title },
    });
  }

  private async row(orgId: string, id: string) {
    const exam = await this.prisma.quiz.findFirst({
      where: { id, organizationId: orgId, courseId: null },
      include: { audiences: true },
    });
    if (!exam) throw new NotFoundException();
    return exam;
  }

  private async assertEditable(orgId: string, id: string) {
    const exam = await this.row(orgId, id);
    if (
      exam.status !== 'DRAFT' ||
      (await this.prisma.quizAttempt.count({ where: { quizId: id } }))
    ) {
      throw new ConflictException({
        code: 'EXAM_LOCKED',
        message: 'Questions can’t be changed after the exam is published',
      });
    }
    return exam;
  }
}

export const DEFAULT_INSTRUCTIONS = [
  'Read every question carefully before answering.',
  'The timer starts when you begin and cannot be paused. The exam submits automatically when time runs out.',
  'Stay in full-screen mode. Do not switch tabs, windows or apps.',
  'Keyboard shortcuts, copying, pasting and right-clicking are disabled.',
  'Your answers are saved automatically after every change.',
].join('\n');
