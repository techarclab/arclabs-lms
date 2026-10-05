import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  AiReview,
  CodingConfig,
  ImportParseResult,
  Paginated,
  QuestionFolders,
  QuestionItem,
  RunCodeResponse,
} from '@arc/types';
import {
  NO_FOLDER,
  outputsMatch,
  questionInputSchema,
  questionKey,
  type BulkQuestionsInput,
  type ImportParseInput,
  type AiCheckInput,
  type CheckCodingInput,
  type ListQuestionsQuery,
  type MoveQuestionsInput,
  type QuestionInputParsed,
  type RenameFolderInput,
} from '@arc/validation';
import { AuditService } from '../audit/audit.service';
import type { Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiGrader, AiGraderUnavailableError } from './ai-grader';
import { ExpectedOutputs } from './expected-outputs';
import { CodeRunner, RunnerUnavailableError } from './code-runner';
import { QuestionImporter } from './question-import';

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
    folder: q.folder,
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
    ...(input.folder !== undefined ? { folder: input.folder } : {}),
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
    private readonly importer: QuestionImporter,
  ) {}

  // ───────── Import from PDF / Word ─────────

  /** Question texts already in the bank — only inside `folder` when one is given. */
  private async existingKeys(orgId: string, folder?: string | null) {
    const rows = await this.prisma.question.findMany({
      where: {
        organizationId: orgId,
        ...(folder ? { folder: { equals: folder, mode: 'insensitive' } } : {}),
      },
      select: { prompt: true },
    });
    return new Set(rows.map((r) => questionKey(r.prompt)));
  }

  /** Reads one part of an uploaded file into draft questions (nothing is saved). */
  async parseImport(orgId: string, input: ImportParseInput): Promise<ImportParseResult> {
    const [r, keys] = await Promise.all([
      this.importer.parse(input),
      this.existingKeys(orgId, input.folder),
    ]);
    return {
      ...r,
      questions: r.questions.map((q) => ({ ...q, duplicate: keys.has(questionKey(q.prompt)) })),
    };
  }

  /** Saves reviewed questions in one go. Questions already in the bank are skipped. */
  async bulkCreate(actor: User, orgId: string, input: BulkQuestionsInput) {
    const parsed: QuestionInputParsed[] = [];
    const errors: { index: number; message: string }[] = [];
    input.questions.forEach((q, index) => {
      const r = questionInputSchema.safeParse(q);
      if (r.success) parsed.push(r.data);
      else errors.push({ index, message: r.error.issues[0]?.message ?? 'Invalid question' });
    });
    if (errors.length)
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: `${errors.length} question${errors.length === 1 ? '' : 's'} need fixing`,
        details: errors.map((e) => ({ path: String(e.index), message: e.message })),
      });
    const folder = input.folder ? await this.canonicalFolder(orgId, input.folder) : null;
    const keys = input.skipDuplicates ? await this.existingKeys(orgId, folder) : new Set<string>();
    const toCreate: QuestionInputParsed[] = [];
    let skipped = 0;
    for (const q of parsed) {
      const k = questionKey(q.prompt);
      if (input.skipDuplicates && keys.has(k)) {
        skipped++;
        continue;
      }
      keys.add(k);
      toCreate.push(q);
    }
    // 1 ms apart, so a folder lists the questions in the paper's order
    const base = Date.now();
    if (toCreate.length)
      await this.prisma.question.createMany({
        data: toCreate.map((q, i) => ({
          organizationId: orgId,
          createdById: actor.id,
          createdAt: new Date(base + i),
          ...toColumns(q),
          ...(folder ? { folder } : {}),
        })) as Prisma.QuestionCreateManyInput[],
      });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'question.imported',
      entityType: 'question',
      entityId: orgId,
      meta: { created: toCreate.length, skipped, folder },
    });
    return { created: toCreate.length, skipped, folder };
  }

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
      ...(q.folder
        ? { folder: q.folder === NO_FOLDER ? null : { equals: q.folder, mode: 'insensitive' } }
        : {}),
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
        // inside a folder: paper order (oldest first); otherwise newest first
        orderBy: [
          { createdAt: q.folder && q.folder !== NO_FOLDER ? 'asc' : 'desc' },
          { id: 'asc' },
        ],
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

  // ───────── Folders ─────────

  /** Folders with their active question counts, plus how many questions are in no folder. */
  async folders(orgId: string): Promise<QuestionFolders> {
    const rows = await this.prisma.question.groupBy({
      by: ['folder'],
      where: { organizationId: orgId, archived: false, type: { not: 'SHORT_ANSWER' } },
      _count: { _all: true },
    });
    const folders = rows
      .filter((r) => r.folder)
      .map((r) => ({ name: r.folder!, count: r._count._all }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { folders, unfiled: rows.find((r) => !r.folder)?._count._all ?? 0 };
  }

  /** Re-uses an existing folder's spelling ("unit 3" → "Unit 3") so folders don't split by case. */
  private async canonicalFolder(orgId: string, name: string) {
    const hit = await this.prisma.question.findFirst({
      where: { organizationId: orgId, folder: { equals: name, mode: 'insensitive' } },
      select: { folder: true },
    });
    return hit?.folder ?? name;
  }

  /** Puts questions into a folder (or takes them out). Allowed for locked questions too. */
  async move(actor: User, orgId: string, input: MoveQuestionsInput) {
    const folder = input.folder ? await this.canonicalFolder(orgId, input.folder) : null;
    const r = await this.prisma.question.updateMany({
      where: { organizationId: orgId, id: { in: input.ids } },
      data: { folder },
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'question.moved',
      entityType: 'question',
      entityId: orgId,
      meta: { count: r.count, folder },
    });
    return { moved: r.count, folder };
  }

  /** Renames a folder; renaming onto an existing folder's name merges the two. */
  async renameFolder(actor: User, orgId: string, input: RenameFolderInput) {
    const to = await this.canonicalFolder(orgId, input.to);
    const r = await this.prisma.question.updateMany({
      where: { organizationId: orgId, folder: { equals: input.from, mode: 'insensitive' } },
      data: { folder: to },
    });
    if (!r.count) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Folder not found' });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'question.folder_renamed',
      entityType: 'question',
      entityId: orgId,
      meta: { from: input.from, to, count: r.count },
    });
    return { renamed: r.count, folder: to };
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
        folder: src.folder,
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
