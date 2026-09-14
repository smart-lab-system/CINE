import { Logger, Module } from '@nestjs/common';
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
import { GradingRunService } from './grading-run.service';
import { GradingReferenceService } from './grading-reference.service';
import { GradingReferenceEntity } from './entities/grading-reference.entity';
import { ExamMaterialEntity } from '../exam-session/entities/exam-material.entity';
import { ContentResolverRegistry } from './content-resolver/content-resolver.registry';
import { DocumentResolver } from './content-resolver/document-resolver';
import {
  SUBMISSION_CONTENT_RESOLVERS,
  SubmissionContentResolver,
} from './content-resolver/submission-content-resolver';
import { RubricService } from './rubric.service';
import { TeacherReviewService } from './teacher-review.service';
import { TeacherReviewEntity } from './entities/teacher-review.entity';
import { AdminModule } from '../admin/admin.module';
import { GradingController } from './grading.controller';
import { AI_GRADING_PROVIDER, AIGradingProvider } from './ai-provider/ai-grading-provider';
import { KeywordGradingProvider } from './ai-provider/keyword-grading.provider';
import { ClaudeGradingProvider } from './ai-provider/claude-grading.provider';

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
      GradingReferenceEntity,
      ExamMaterialEntity,
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
    GradingRunService,
    GradingReferenceService,
    DocumentResolver,
    ContentResolverRegistry,
    {
      // Danh sách resolver khai Ở ĐÂY và không ở đâu khác. Thêm nhánh ảnh
      // hay nhánh code sau này là thêm một phần tử vào mảng này — không
      // phải sửa GradingService.
      provide: SUBMISSION_CONTENT_RESOLVERS,
      useFactory: (doc: DocumentResolver): SubmissionContentResolver[] => [doc],
      inject: [DocumentResolver],
    },
    GradingProcessor,
    RubricService,
    TeacherReviewService,
    ClaudeGradingProvider,
    KeywordGradingProvider,
    {
      provide: AI_GRADING_PROVIDER,
      useFactory: (
        claude: ClaudeGradingProvider,
        keyword: KeywordGradingProvider,
      ): AIGradingProvider => {
        if (process.env.ANTHROPIC_API_KEY) {
          return claude;
        }
        // NÓI RA, không im lặng rơi về đếm từ.
        //
        // Không có key thì hệ thống vẫn chấm được — nhưng bằng đối sánh
        // từ khoá, thứ không bao giờ vượt ngưỡng auto-approve và không
        // phán đoán được gì về tính đúng đắn. Rơi về nó trong im lặng
        // nghĩa là mọi người tin hệ thống đang gọi model trong khi nó
        // đang đếm từ, và bảng điểm trông y hệt nhau ở cả hai ca.
        new Logger(GradingModule.name).warn(
          'ANTHROPIC_API_KEY chưa được đặt — chấm điểm chạy bằng ' +
            'KeywordGradingProvider (đối sánh từ khoá, KHÔNG gọi model). ' +
            'Điểm sinh ra chỉ dùng để thử luồng, không dùng để chấm thật.',
        );
        return keyword;
      },
      inject: [ClaudeGradingProvider, KeywordGradingProvider],
    },
  ],
  exports: [GradingService, GradingRunService, GradingReferenceService, RubricService],
})
export class GradingModule {}
