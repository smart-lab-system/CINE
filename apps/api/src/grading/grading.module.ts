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
import { SubmissionTextService } from './submission-text.service';
import { GradingReferenceEntity } from './entities/grading-reference.entity';
import { GradingAnchorSnapshotEntity } from './entities/grading-anchor-snapshot.entity';
import { AnchorService } from './anchor.service';
import { ExamMaterialEntity } from '../exam-session/entities/exam-material.entity';
import { ContentResolverRegistry } from './content-resolver/content-resolver.registry';
import { DocumentResolver } from './content-resolver/document-resolver';
import {
  SUBMISSION_CONTENT_RESOLVERS,
  SubmissionContentResolver,
} from './content-resolver/submission-content-resolver';
import { RubricService } from './rubric.service';
import { TeacherReviewService } from './teacher-review.service';
import { BulkReviewService } from './bulk-review.service';
import { TeacherReviewEntity } from './entities/teacher-review.entity';
import { AdminModule } from '../admin/admin.module';
import { GradingController } from './grading.controller';
import { AI_GRADING_PROVIDER } from './ai-provider/ai-grading-provider';
import { KeywordGradingProvider } from './ai-provider/keyword-grading.provider';
import { ClaudeGradingProvider } from './ai-provider/claude-grading.provider';
import { ClaudeAdvocateProvider } from './ai-provider/advocate.provider';
import { ADVOCATE_PROVIDER, AdvocateProvider } from './ai-provider/advocate-provider';
import { OpenAICompatibleAdvocateProvider } from './ai-provider/openai-compatible-advocate.provider';
import { FallbackAdvocateProvider } from './ai-provider/fallback-advocate.provider';
import {
  MAX_TIERS,
  readTier,
  selectGradingProvider,
} from './ai-provider/select-grading-provider';

// Chuyển ra file riêng 2026-09-24 để runner eval (không có Nest, không có
// DB) dựng đúng chuỗi mà worker chấm dùng. Re-export để mọi chỗ đang
// import từ module này không phải đổi.
export { readTier, selectGradingProvider };

/**
 * Chuỗi Advocate — CÙNG các bậc với chuỗi chấm, cùng thứ tự.
 *
 * Quyết định của chủ đồ án 2026-09-15. Không dùng chung chuỗi thì Advocate
 * gắn cứng Claude, mà Claude đang hết credit, nên cơ chế công bằng của cả
 * thiết kế sẽ tồn tại trên giấy và không chạy một lần nào.
 *
 * KHÔNG có bậc sàn. Khác biệt có chủ ý với chuỗi chấm: sàn tồn tại vì một
 * bài PHẢI có kết cục, còn Advocate là ý kiến THÊM — và không có ý kiến
 * nào tốt hơn một lập luận bênh vực dựng bằng đếm từ, thứ giảng viên sẽ
 * đọc và có thể tin. Mọi bậc chết thì chuỗi ném, `GradingService` bắt,
 * ghi log, và bài đi tiếp KHÔNG có ý kiến phản biện.
 *
 * Trả `null` khi không có bậc nào: `GradingService` đọc `null` là "tính
 * năng này chưa bật", khác hẳn với "đã chạy và không có gì để nói".
 */
export function selectAdvocateProvider(claude: ClaudeAdvocateProvider): AdvocateProvider | null {
  // Cùng lý do với chuỗi chấm: một bộ test không được tiêu tiền thật.
  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  const tiers: { provider: AdvocateProvider; label: string }[] = [];
  for (let index = 1; index <= MAX_TIERS; index++) {
    const config = readTier(index);
    if (config) {
      tiers.push({
        provider: new OpenAICompatibleAdvocateProvider(config),
        label: config.tier,
      });
    }
  }
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    tiers.push({ provider: claude, label: `tầng Claude (${claude.name})` });
  }

  if (tiers.length === 0) {
    new Logger('GradingModule').warn(
      'Không có bậc model nào — lượt phản biện (Advocate) sẽ KHÔNG chạy. ' +
        'Bài lệch rubric vẫn được chấm và vẫn chuyển giảng viên, nhưng không ' +
        'có ý kiến thứ hai nào đi kèm.',
    );
    return null;
  }

  return new FallbackAdvocateProvider(tiers);
}

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
      GradingAnchorSnapshotEntity,
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
    SubmissionTextService,
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
    BulkReviewService,
    AnchorService,
    ClaudeGradingProvider,
    KeywordGradingProvider,
    // Token RIÊNG, không đi qua `AI_GRADING_PROVIDER`: Advocate không phải
    // một implementation thay thế của việc chấm theo rubric — nó là một
    // vai KHÁC, hỏi một câu khác. Gộp hai token sẽ biến "chọn model nào"
    // và "có chạy lượt phản biện không" thành một quyết định, trong khi
    // chúng là hai.
    ClaudeAdvocateProvider,
    {
      provide: ADVOCATE_PROVIDER,
      useFactory: selectAdvocateProvider,
      inject: [ClaudeAdvocateProvider],
    },
    {
      provide: AI_GRADING_PROVIDER,
      useFactory: selectGradingProvider,
      inject: [ClaudeGradingProvider, KeywordGradingProvider],
    },
  ],
  exports: [GradingService, GradingRunService, GradingReferenceService, RubricService],
})
export class GradingModule {}
