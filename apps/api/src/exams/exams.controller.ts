import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  aiCheckSchema,
  setMarksSchema,
  checkCodingSchema,
  createExamSchema,
  runCodeSchema,
  type AiCheckInput,
  type SetMarksInput,
  type CheckCodingInput,
  type RunCodeInput,
  listExamsQuery,
  listQuestionsQuery,
  proctorEventSchema,
  questionInputSchema,
  saveAnswerSchema,
  setExamAudienceSchema,
  setExamQuestionsSchema,
  updateExamSchema,
  type CreateExamParsed,
  type ListExamsQuery,
  type ListQuestionsQuery,
  type ProctorEventInput,
  type QuestionInputParsed,
  type SaveAnswerInput,
  type SetExamAudienceInput,
  type UpdateExamInput,
} from '@arc/validation';
import { hasPermission } from '@arc/types';
import type { OrgContextInfo } from '../auth/auth.types';
import { CurrentUser, OrgContext, Public, RequirePermission } from '../auth/decorators';
import { UuidPipe } from '../common/uuid.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { User } from '../generated/prisma/client';
import { AiGrader } from './ai-grader';
import { CodeRunner } from './code-runner';
import { AttemptsService } from './attempts.service';
import { ExamAnalyticsService } from './exam-analytics.service';
import { ExamsService } from './exams.service';
import { QuestionsService } from './questions.service';

/** Read-only roles (e.g. a college coordinator) can't author exams. */
const viewOnly = (org: OrgContextInfo) => !hasPermission(org.roles, 'quiz.author');

// ───────────── Staff: question bank ─────────────

@ApiTags('question bank')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('questions')
@RequirePermission('quiz.author')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  list(
    @OrgContext() org: OrgContextInfo,
    @Query(new ZodValidationPipe(listQuestionsQuery)) q: ListQuestionsQuery,
  ) {
    return this.questions.list(org.organizationId, q);
  }

  @Get('topics')
  topics(@OrgContext() org: OrgContextInfo) {
    return this.questions.topics(org.organizationId);
  }

  /** Try AI marking on some code against a rubric (nothing is saved). */
  @Post('ai-check')
  @HttpCode(200)
  aiCheck(@Body(new ZodValidationPipe(aiCheckSchema)) body: AiCheckInput) {
    return this.questions.aiCheck(body);
  }

  /** Try a reference solution against test cases (nothing is saved). */
  @Post('check-code')
  @HttpCode(200)
  checkCode(@Body(new ZodValidationPipe(checkCodingSchema)) body: CheckCodingInput) {
    return this.questions.checkCoding(body);
  }

  @Post()
  create(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Body(new ZodValidationPipe(questionInputSchema)) body: QuestionInputParsed,
  ) {
    return this.questions.create(u, org.organizationId, body);
  }

  @Put(':id')
  update(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(questionInputSchema)) body: QuestionInputParsed,
  ) {
    return this.questions.update(u, org.organizationId, id, body);
  }

  @Post(':id/duplicate')
  duplicate(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    return this.questions.duplicate(u, org.organizationId, id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    return this.questions.setArchived(u, org.organizationId, id, true);
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    return this.questions.setArchived(u, org.organizationId, id, false);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    await this.questions.remove(u, org.organizationId, id);
  }
}

// ───────────── Staff: exams ─────────────

@ApiTags('exams')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('exams')
@RequirePermission('quiz.author')
export class ExamsController {
  constructor(
    private readonly exams: ExamsService,
    private readonly analytics: ExamAnalyticsService,
  ) {}

  @Get()
  @RequirePermission('exam.results.view')
  list(
    @OrgContext() org: OrgContextInfo,
    @Query(new ZodValidationPipe(listExamsQuery)) q: ListExamsQuery,
  ) {
    return this.exams.list(org.organizationId, q);
  }

  @Post()
  create(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Body(new ZodValidationPipe(createExamSchema)) body: CreateExamParsed,
  ) {
    return this.exams.create(u, org.organizationId, body);
  }

  @Get(':id')
  get(@OrgContext() org: OrgContextInfo, @Param('id', UuidPipe) id: string) {
    return this.exams.get(org.organizationId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(updateExamSchema)) body: UpdateExamInput,
  ) {
    return this.exams.update(u, org.organizationId, id, body);
  }

  @Put(':id/questions')
  setQuestions(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(setExamQuestionsSchema)) body: { questionIds: string[] },
  ) {
    return this.exams.setQuestions(u, org.organizationId, id, body.questionIds);
  }

  @Put(':id/audience')
  setAudience(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(setExamAudienceSchema)) body: SetExamAudienceInput,
  ) {
    return this.exams.setAudience(u, org.organizationId, id, body);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    return this.exams.publish(u, org.organizationId, id);
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    return this.exams.unpublish(u, org.organizationId, id);
  }

  @Post(':id/release-results')
  @HttpCode(200)
  release(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    return this.exams.releaseResults(u, org.organizationId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    await this.exams.remove(u, org.organizationId, id);
  }

  @Get(':id/analytics')
  @RequirePermission('exam.results.view')
  examAnalytics(@OrgContext() org: OrgContextInfo, @Param('id', UuidPipe) id: string) {
    return this.analytics.analytics(org.organizationId, id, { viewOnly: viewOnly(org) });
  }

  @Get(':id/results.csv')
  @RequirePermission('exam.results.view')
  async csv(
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Res() res: Response,
  ) {
    const { filename, body } = await this.analytics.csv(org.organizationId, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  }

  @Get(':id/attempts/:attemptId')
  @RequirePermission('exam.results.view')
  attempt(
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Param('attemptId', UuidPipe) attemptId: string,
  ) {
    return this.analytics.attemptDetail(org.organizationId, id, attemptId, {
      viewOnly: viewOnly(org),
    });
  }

  @Post(':id/evaluate-coding')
  @HttpCode(200)
  evaluateCoding(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    return this.analytics.evaluateCoding(u, org.organizationId, id);
  }

  /** Stop a live exam now: everyone still writing is submitted. */
  @Post(':id/end')
  @HttpCode(200)
  endNow(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    return this.analytics.endNow(u, org.organizationId, id);
  }

  /** Faculty changes (or clears) the marks for one question of a submitted attempt. */
  @Put(':id/attempts/:attemptId/marks')
  setMarks(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Param('attemptId', UuidPipe) attemptId: string,
    @Body(new ZodValidationPipe(setMarksSchema)) body: SetMarksInput,
  ) {
    return this.analytics.setMarks(u, org.organizationId, id, attemptId, body);
  }

  @Post(':id/attempts/:attemptId/force-submit')
  @HttpCode(200)
  forceSubmit(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Param('attemptId', UuidPipe) attemptId: string,
  ) {
    return this.analytics.forceSubmit(u, org.organizationId, id, attemptId);
  }
}

// ───────────── Students: taking exams ─────────────

/** Student endpoints are authorised per exam (assignment), so no X-Org-Id is needed. */
@ApiTags('my exams')
@ApiBearerAuth()
@Controller('my')
export class MyExamsController {
  constructor(
    private readonly attempts: AttemptsService,
    private readonly runner: CodeRunner,
  ) {}

  @Get('exams')
  list(@CurrentUser() u: User) {
    return this.attempts.listMine(u);
  }

  @Get('exams/:id')
  lobby(@CurrentUser() u: User, @Param('id', UuidPipe) id: string) {
    // A free runner may be asleep; students spend a minute in the lobby, so wake it now.
    this.runner.wake();
    return this.attempts.lobby(u, id);
  }

  @Post('exams/:id/start')
  @HttpCode(200)
  start(@CurrentUser() u: User, @Param('id', UuidPipe) id: string, @Req() req: Request) {
    return this.attempts.start(u, id, {
      ip: req.ip,
      userAgent: req.header('user-agent')?.slice(0, 300),
    });
  }

  @ApiHeader({ name: 'X-Attempt-Session', required: true })
  @Post('attempts/:id/answers')
  @HttpCode(200)
  save(
    @CurrentUser() u: User,
    @Param('id', UuidPipe) id: string,
    @Headers('x-attempt-session') session: string | undefined,
    @Body(new ZodValidationPipe(saveAnswerSchema)) body: SaveAnswerInput,
  ) {
    return this.attempts.saveAnswer(u, id, session, body);
  }

  @Post('attempts/:id/heartbeat')
  @HttpCode(200)
  heartbeat(
    @CurrentUser() u: User,
    @Param('id', UuidPipe) id: string,
    @Headers('x-attempt-session') session: string | undefined,
  ) {
    return this.attempts.heartbeat(u, id, session);
  }

  @Post('attempts/:id/events')
  @HttpCode(200)
  event(
    @CurrentUser() u: User,
    @Param('id', UuidPipe) id: string,
    @Headers('x-attempt-session') session: string | undefined,
    @Body(new ZodValidationPipe(proctorEventSchema)) body: ProctorEventInput,
  ) {
    return this.attempts.recordEvent(u, id, session, body);
  }

  @Post('attempts/:id/submit')
  @HttpCode(200)
  submit(
    @CurrentUser() u: User,
    @Param('id', UuidPipe) id: string,
    @Headers('x-attempt-session') session: string | undefined,
  ) {
    return this.attempts.submit(u, id, session);
  }

  @Get('attempts/:id/result')
  result(@CurrentUser() u: User, @Param('id', UuidPipe) id: string) {
    return this.attempts.result(u, id);
  }

  /** Run code during the exam: against the sample test cases, or with the student's own input. */
  @ApiHeader({ name: 'X-Attempt-Session', required: true })
  @Post('attempts/:id/run')
  @HttpCode(200)
  run(
    @CurrentUser() u: User,
    @Param('id', UuidPipe) id: string,
    @Headers('x-attempt-session') session: string | undefined,
    @Body(new ZodValidationPipe(runCodeSchema)) body: RunCodeInput,
  ) {
    return this.attempts.runCode(u, id, session, body);
  }
}

// ───────────── Code runner status ─────────────

@ApiTags('exams')
@ApiBearerAuth()
@Controller('code-runner')
export class CodeRunnerController {
  constructor(
    private readonly runner: CodeRunner,
    private readonly ai: AiGrader,
  ) {}

  /** Whether coding answers can be run right now (any signed-in user). */
  @Get('status')
  async status() {
    return { ...(await this.runner.status()), aiGrader: this.ai.configured };
  }

  /** Wakes a sleeping free-tier runner (also called daily by the Vercel cron in vercel.json). */
  @Get('ping')
  @Public()
  async ping() {
    const s = await this.runner.status();
    return { ready: s.ready ?? s.configured };
  }
}
