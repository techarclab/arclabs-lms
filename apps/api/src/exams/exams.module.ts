import { Module } from '@nestjs/common';
import { AttemptsService } from './attempts.service';
import { ExamAnalyticsService } from './exam-analytics.service';
import { ExamEngine } from './exam-engine.service';
import { ExamsController, MyExamsController, QuestionsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { QuestionsService } from './questions.service';

@Module({
  controllers: [QuestionsController, ExamsController, MyExamsController],
  providers: [ExamEngine, QuestionsService, ExamsService, AttemptsService, ExamAnalyticsService],
})
export class ExamsModule {}
