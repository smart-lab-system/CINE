import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RubricEntity } from './entities/rubric.entity';
import { RubricCriterionEntity } from './entities/rubric-criterion.entity';
import { GradingResultEntity } from './entities/grading-result.entity';
import { SubmissionEntity } from '../submission/entities/submission.entity';
import { RequiredDeliverableEntity } from '../exam-session/entities/required-deliverable.entity';
import { ClassEntity } from '../course/entities/class.entity';
import { StorageModule } from '../storage/storage.module';
import { ExamSessionModule } from '../exam-session/exam-session.module';
import { GradingService } from './grading.service';
import { RubricService } from './rubric.service';
import { GradingController } from './grading.controller';
import { AI_GRADING_PROVIDER } from './ai-provider/ai-grading-provider';
import { KeywordGradingProvider } from './ai-provider/keyword-grading.provider';

/**
 * Which model grades is decided HERE and nowhere else.
 *
 * GradingService is injected with an interface, so adding a Claude or a
 * Codex provider is a change to this one binding — that is the whole reason
 * CLAUDE.md forbids business logic from touching a specific SDK. Until one
 * is configured, the local keyword provider runs, names itself honestly in
 * every result, and never reaches the auto-approval threshold.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      RubricEntity,
      RubricCriterionEntity,
      GradingResultEntity,
      SubmissionEntity,
      RequiredDeliverableEntity,
      ClassEntity,
    ]),
    StorageModule,
    ExamSessionModule,
  ],
  controllers: [GradingController],
  providers: [
    GradingService,
    RubricService,
    { provide: AI_GRADING_PROVIDER, useClass: KeywordGradingProvider },
  ],
  exports: [GradingService, RubricService],
})
export class GradingModule {}
