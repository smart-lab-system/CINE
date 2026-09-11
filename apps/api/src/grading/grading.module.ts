import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GRADING_QUEUE } from './grading.queue';
import { GradingProcessor } from './grading.processor';
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
import { TeacherReviewService } from './teacher-review.service';
import { TeacherReviewEntity } from './entities/teacher-review.entity';
import { AdminModule } from '../admin/admin.module';
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
      TeacherReviewEntity,
      SubmissionEntity,
      RequiredDeliverableEntity,
      ClassEntity,
    ]),
    StorageModule,
    ExamSessionModule,
    // Sửa điểm sau khi đã công bố phải để lại dấu vết — Security rule 4.
    AdminModule,
    // Chấm điểm chạy trên hàng đợi: một job một bài (CLAUDE.md §7.1.3).
    BullModule.registerQueue({ name: GRADING_QUEUE }),
  ],
  controllers: [GradingController],
  providers: [
    GradingService,
    GradingProcessor,
    RubricService,
    TeacherReviewService,
    { provide: AI_GRADING_PROVIDER, useClass: KeywordGradingProvider },
  ],
  exports: [GradingService, RubricService],
})
export class GradingModule {}
