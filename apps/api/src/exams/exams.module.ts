import { Module } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { AiGrader } from './ai-grader';
import { AttemptsService } from './attempts.service';
import { CODE_RUNNER_IMPL, CodeRunner, codeRunnerFactory } from './code-runner';
import { ExamAnalyticsService } from './exam-analytics.service';
import { ExamEngine } from './exam-engine.service';
import {
  CodeRunnerController,
  ExamsController,
  MyExamsController,
  QuestionsController,
} from './exams.controller';
import { ExamsService } from './exams.service';
import { ExpectedOutputs } from './expected-outputs';
import { QuestionImporter } from './question-import';
import { QuestionsService } from './questions.service';

@Module({
  controllers: [QuestionsController, ExamsController, MyExamsController, CodeRunnerController],
  providers: [
    { provide: CODE_RUNNER_IMPL, inject: [ENV], useFactory: (env: Env) => codeRunnerFactory(env) },
    CodeRunner,
    AiGrader,
    ExpectedOutputs,
    ExamEngine,
    QuestionImporter,
    QuestionsService,
    ExamsService,
    AttemptsService,
    ExamAnalyticsService,
  ],
})
export class ExamsModule {}
