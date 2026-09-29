import { randomBytes } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AiReview, CodingConfig, Paginated, QuestionItem, RunCodeResponse } from '@arc/types';
import {
  outputsMatch,
  type AiCheckInput,
  type CheckCodingInput,
  type ListQuestionsQuery,
  type QuestionInputParsed,
} from '@arc/validation';
import { AuditService } from '../audit/audit.service';
import type { Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiGrader, AiGraderUnavailableError } from './ai-grader';
import { ExpectedOutputs } from './expected-outputs';
import { CodeRunner, RunnerUnavailableError } from './code-runner';

const optionId = () => randomBytes(4).toString('hex');

type QuestionRow = Prisma.QuestionGetPayload<{
  include: { quizzes: { select: { quiz: { select: { status: true } } } } };
}>;

export function toQuestionItem(q: QuestionRow): QuestionItem {
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    options: q.options as unknown as QuestionItem['options'],
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
    points: q.points,
    negativeMarks: Number(q.negativeMarks),
    difficulty: q.difficulty,
    topic: q.topic,
    tags: q.tags,
    coding: (q.coding ?? null) as QuestionItem['coding'],
    archived: q.archived,
    usedInExams: q.quizzes.length,
    locked: q.quizzes.some((x) => x.quiz.status === 'PUBLISHED'),
    createdAt: q.createdAt.toISOString(),
  };
}

export const questionInclude = {
  quizzes: { select: { quiz: { select: { status: true } } } },
} satisfies Prisma.QuestionInclude;

/** Converts validated input into stored columns (options with ids + answer key). */
export function toColumns(
  input: QuestionInputParsed,
  existingOptions: { id: string; text: string }[] = [],
) {
  const base = {
    type: input.type,
    prompt: input.prompt,
    explanation: input.explanation ?? null,
    points: input.points,
    negativeMarks: input.negativeMarks,
    difficulty: input.difficulty,
    topic: input.topic,
    tags: input.tags,
  };
  switch (input.type) {
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE': {
      const known = new Set(existingOptions.map((o) => o.id));
      const opts = input.options.map((o) => ({
        id: o.id && known.has(o.id) ? o.id : optionId(),
        text: o.text,
        correct: o.correct,
      }));
      return {
        ...base,
        options: opts.map(({ id, text }) => ({ id, text })),
        correctAnswer: opts.filter((o) => o.correct).map((o) => o.id),
      };
    }
    case 'TRUE_FALSE':
      return {
        ...base,
        options: [
          { id: 'true', text: 'True' },
          { id: 'false', text: 'False' },
        ],
        correctAnswer: [input.answer ? 'true' : 'false'],
      };
    case 'NUMERIC':
      return {
        ...base,
        options: [],
        correctAnswer: { value: input.value, tolerance: input.tolerance },
      };
    case 'CODING': {
      const c = input.coding;
      const starter = Object.fromEntries(
        Object.entries(c.starter).filter(([lang]) => c.languages.includes(lang as 'c')),
      );
      return {
        ...base,
        negativeMarks: 0,
        options: [],
        correctAnswer: {},
        coding: {
          languages: c.languages,
          starter,
          testCases: (c.mode === 'ai' ? [] : c.testCases).map((t) => ({
            id: t.id || optionId(),
            input: t.input,
            output: t.output,
            sample: t.sample,
          })),
          timeLimitMs: c.timeLimitMs,
          compare: c.compare,
          mode: c.mode,
          rubric: c.mode === 'ai' ? c.rubric : [],
          compilePenaltyPct: c.compilePenaltyPct,
          solution: c.solution ?? null,
        },
      };
    }
  }
}

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly runner: CodeRunner,
    private readonly expected: ExpectedOutputs,
    private readonly ai: AiGrader,
  ) {}

  /** Coding questions: fill empty expected outputs from the reference solution right away. */
  private async fillExpected<T extends { id: string; coding: unknown }>(q: T): Promise<T> {
    const c = q.coding as CodingConfig | null;
    if (!c || !this.expected.needsFill(c)) return q;
    return { ...q, coding: await this.expected.ensure(q.id, c) };
  }

  /** Compiles and AI-marks a piece of code against a rubric (authors trying out a question). */
  async aiCheck(input: AiCheckInput): Promise<AiReview> {
    if (!this.ai.configured)
      throw new ConflictException({
        code: 'AI_NOT_CONFIGURED',
        message: 'AI marking isn’t set up yet (AI_GRADER_API_KEY on the API).',
      });
    let compiled = true;
    let compileError: string | null = null;
    if (this.runner.configured) {
      try {
        const c = await this.runner.compile(input.language, input.code);
        compiled = c.ok;
        compileError = c.error;
      } catch (e) {
        if (e instanceof RunnerUnavailableError)
          throw new ConflictException({ code: 'RUNNER_UNAVAILABLE', message: e.message });
        throw e;
      }
    }
    try {
      return await this.ai.grade({
        question: input.prompt,
        language: input.language,
        rubric: input.rubric,
        solution: input.solution ?? null,
        code: input.code,
        compiled,
        compileError,
        penaltyPct: input.compilePenaltyPct,
      });
    } catch (e) {
      if (e instanceof AiGraderUnavailableError)
        throw new ConflictException({ code: 'AI_UNAVAILABLE', message: e.message });
      throw e;
    }
  }

  /** Runs a reference solution against test cases so authors can verify expected outputs. */
  async checkCoding(input: CheckCodingInput): Promise<RunCodeResponse> {
    try {
      const runs = await this.runner.runMany(
        input.language,
        input.code,
        input.coding.testCases.map((t) => t.input),
        input.coding.timeLimitMs,
      );
      return {
        results: runs.map((r, i) => {
          const t = input.coding.testCases[i]!;
          return {
            input: t.input,
            expected: t.output,
            output: r.stdout,
            passed:
              r.status === 'OK' &&
              outputsMatch(r.stdout, t.output, input.coding.compare ?? 'exact'),
            status: r.status,
            error: r.error,
            timeMs: r.timeMs,
          };
        }),
      };
    } catch (e) {
      if (e instanceof RunnerUnavailableError)
        throw new ConflictException({ code: 'RUNNER_UNAVAILABLE', message: e.message });
      throw e;
    }
  }

  async list(orgId: string, q: ListQuestionsQuery): Promise<Paginated<QuestionItem>> {
    const where: Prisma.QuestionWhereInput = {
      organizationId: orgId,
      archived: q.archived,
      type: q.type ? q.type : { not: 'SHORT_ANSWER' },
      ...(q.difficulty ? { difficulty: q.difficulty } : {}),
      ...(q.topic ? { topic: { equals: q.topic, mode: 'insensitive' } } : {}),
      ...(q.search
        ? {
            OR: [
              { prompt: { contains: q.search, mode: 'insensitive' } },
              { topic: { contains: q.search, mode: 'insensitive' } },
              { tags: { has: q.search.toLowerCase() } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.question.count({ where }),
      this.prisma.question.findMany({
        where,
        include: questionInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { data: rows.map(toQuestionItem), meta: { page: q.page, pageSize: q.pageSize, total } };
  }

  async topics(orgId: string) {
    const rows = await this.prisma.question.groupBy({
      by: ['topic'],
      where: { organizationId: orgId, archived: false, topic: { not: null } },
      _count: { _all: true },
      orderBy: { topic: 'asc' },
    });
    return rows.map((r) => ({ topic: r.topic!, count: r._count._all }));
  }

  async create(actor: User, orgId: string, input: QuestionInputParsed): Promise<QuestionItem> {
    const q = await this.prisma.question
      .create({
        data: { organizationId: orgId, createdById: actor.id, ...toColumns(input) },
        include: questionInclude,
      })
      .then((row) => this.fillExpected(row));
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'question.created',
      entityType: 'question',
      entityId: q.id,
    });
    return toQuestionItem(q);
  }

  async update(
    actor: User,
    orgId: string,
    id: string,
    input: QuestionInputParsed,
  ): Promise<QuestionItem> {
    const existing = await this.getRow(orgId, id);
    if (toQuestionItem(existing).locked) {
      throw new ConflictException({
        code: 'QUESTION_LOCKED',
        message:
          'This question is used in a published exam and can’t be changed. Duplicate it instead.',
      });
    }
    const q = await this.prisma.question
      .update({
        where: { id },
        data: toColumns(input, existing.options as unknown as { id: string; text: string }[]),
        include: questionInclude,
      })
      .then((row) => this.fillExpected(row));
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'question.updated',
      entityType: 'question',
      entityId: id,
    });
    return toQuestionItem(q);
  }

  async setArchived(actor: User, orgId: string, id: string, archived: boolean) {
    await this.getRow(orgId, id);
    const q = await this.prisma.question.update({
      where: { id },
      data: { archived },
      include: questionInclude,
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: archived ? 'question.archived' : 'question.restored',
      entityType: 'question',
      entityId: id,
    });
    return toQuestionItem(q);
  }

  async duplicate(actor: User, orgId: string, id: string) {
    const src = await this.getRow(orgId, id);
    const q = await this.prisma.question.create({
      data: {
        organizationId: orgId,
        createdById: actor.id,
        type: src.type,
        prompt: `${src.prompt}`,
        options: src.options as Prisma.InputJsonValue,
        correctAnswer: src.correctAnswer as Prisma.InputJsonValue,
        explanation: src.explanation,
        points: src.points,
        negativeMarks: src.negativeMarks,
        difficulty: src.difficulty,
        topic: src.topic,
        tags: src.tags,
        coding: (src.coding ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      include: questionInclude,
    });
    return toQuestionItem(q);
  }

  async remove(actor: User, orgId: string, id: string) {
    const q = await this.getRow(orgId, id);
    if (q.quizzes.length) {
      throw new ConflictException({
        code: 'QUESTION_IN_USE',
        message: 'This question is used in an exam. Archive it instead.',
      });
    }
    await this.prisma.question.delete({ where: { id } });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'question.deleted',
      entityType: 'question',
      entityId: id,
    });
  }

  private async getRow(orgId: string, id: string) {
    const q = await this.prisma.question.findFirst({
      where: { id, organizationId: orgId },
      include: questionInclude,
    });
    if (!q) throw new NotFoundException();
    return q;
  }
}
