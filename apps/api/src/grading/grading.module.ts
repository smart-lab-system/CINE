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
import { AI_GRADING_PROVIDER, AIGradingProvider } from './ai-provider/ai-grading-provider';
import { KeywordGradingProvider } from './ai-provider/keyword-grading.provider';
import { ClaudeGradingProvider } from './ai-provider/claude-grading.provider';
import { ClaudeAdvocateProvider } from './ai-provider/advocate.provider';
import { ADVOCATE_PROVIDER, AdvocateProvider } from './ai-provider/advocate-provider';
import { OpenAICompatibleAdvocateProvider } from './ai-provider/openai-compatible-advocate.provider';
import { FallbackAdvocateProvider } from './ai-provider/fallback-advocate.provider';
import {
  OpenAICompatibleConfig,
  OpenAICompatibleProvider,
} from './ai-provider/openai-compatible.provider';
import { FallbackGradingProvider } from './ai-provider/fallback-grading.provider';
import { AUTO_APPROVE_CONFIDENCE } from './grading.types';

/** Trần mặc định cho một bậc dự phòng chưa được calibration đo. */
const DEFAULT_FALLBACK_CEILING = 0.5;

/** Trần số bậc quét từ env — một biến gõ nhầm không được biến vòng lặp thành vô hạn. */
const MAX_TIERS = 5;

/**
 * Đọc cấu hình một bậc tương thích OpenAI từ env.
 *
 * Bật CHỈ KHI cả ba biến có giá trị. Thiếu một biến thì bỏ qua bậc đó và
 * NÓI RA — đoán một `baseUrl` hay một tên model là cách chắc chắn nhất để
 * có một bậc luôn trả 404 mà không ai hiểu vì sao.
 */
export function readTier(index: number): OpenAICompatibleConfig | null {
  const prefix = `GRADING_TIER${index}_`;
  const baseUrl = process.env[`${prefix}BASE_URL`]?.trim();
  const model = process.env[`${prefix}MODEL`]?.trim();
  const apiKey = process.env[`${prefix}API_KEY`]?.trim();

  if (!baseUrl || !model || !apiKey) {
    if (baseUrl || model || apiKey) {
      new Logger('GradingModule').warn(
        `${prefix}* khai thiếu (cần đủ BASE_URL + MODEL + API_KEY) — bỏ qua bậc ${index}.`,
      );
    }
    return null;
  }

  const rawCeiling = process.env[`${prefix}CEILING`]?.trim();
  const parsed = rawCeiling ? Number(rawCeiling) : NaN;
  // `Number('')` là 0 và `Number('abc')` là NaN — cả hai đều đi qua một
  // phép kiểm hời hợt và cho ra một trần vô nghĩa. Plan 1 đã mất một buổi
  // vì đúng họ lỗi này (`GRADE_CONCURRENCY` rỗng → 0 → hàng đợi đứng im).
  const ceiling =
    Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : DEFAULT_FALLBACK_CEILING;

  return { tier: `tầng ${index} (${model})`, baseUrl, model, apiKey, ceiling };
}

/**
 * Dựng CHUỖI provider theo thứ tự ưu tiên, thay vì chọn đúng một cái.
 *
 * Model nào chấm được quyết định Ở ĐÂY và không ở đâu khác —
 * `GradingService` chỉ nhận một interface, nên thêm hay bỏ một nhà cung
 * cấp là sửa đúng một binding. Đó là lý do CLAUDE.md cấm business logic
 * chạm vào một SDK cụ thể.
 *
 * Hàm RIÊNG, export ra, chứ không phải arrow function ẩn trong
 * `useFactory`: đây là quyết định nghiệp vụ và phải test được mà không
 * phải dựng cả một app Nest. Từ 2026-09-15 càng phải vậy, vì nhánh gọi
 * model thật KHÔNG CÒN chạy trong e2e nữa (xem guard `NODE_ENV` bên dưới).
 *
 * Thứ tự (2026-09-15, quyết định của chủ đồ án sau khi đo thật):
 *
 *   tầng 1-2  các endpoint tương thích OpenAI khai trong `.env`
 *   tầng 3    Claude, nếu có `ANTHROPIC_API_KEY`
 *   sàn       KeywordGradingProvider — luôn có, không cần cấu hình
 *
 * Sàn không bao giờ vắng mặt, và đó là lý do `FallbackGradingProvider`
 * không cần xử lý ca "hết bậc" như một trạng thái bình thường.
 */
export function selectGradingProvider(
  claude: ClaudeGradingProvider,
  keyword: KeywordGradingProvider,
): AIGradingProvider {
  // TEST KHÔNG BAO GIỜ ĐƯỢC GỌI API TÍNH TIỀN.
  //
  // Guard này được thêm ngày 2026-09-15, sau khi khoá API thật xuất hiện
  // trong `.env` và 5 test e2e đỏ ngay lập tức: binding ở dưới đọc "có
  // khoá" là "dùng Claude", nên cả bộ e2e bắt đầu gọi API thật. Hôm đó
  // nó lộ ra vì tài khoản chưa có credit. Nếu đã có credit thì nó sẽ
  // KHÔNG lộ ra — test vẫn xanh, chỉ là mỗi lần chạy `pnpm test:e2e`
  // lại tiêu một ít tiền, chậm hơn, và phụ thuộc vào một dịch vụ ngoài
  // mạng. Đó mới là ca đắt.
  //
  // "Có một khoá trong .env" không phải lời xin phép tiêu tiền. Lượt
  // chấm thật do một giảng viên bấm nút; một bộ test thì không.
  if (process.env.NODE_ENV === 'test') {
    return keyword;
  }

  const logger = new Logger('GradingModule');
  const tiers: { provider: AIGradingProvider; label: string }[] = [];
  let topCeiling: number | undefined;

  // Quét tới MAX_TIERS chứ không cố định [1, 2]: thêm một bậc phải đúng là
  // thêm ba dòng `.env`, không phải sửa mảng này rồi deploy lại.
  for (let index = 1; index <= MAX_TIERS; index++) {
    const config = readTier(index);
    if (config) {
      topCeiling ??= config.ceiling;
      tiers.push({ provider: new OpenAICompatibleProvider(config), label: config.tier });
    }
  }

  // `.trim()` như `readTier`: `ANTHROPIC_API_KEY=  ` (có khoảng trắng) là
  // truthy trong JavaScript, nên nếu không cắt thì Claude được xếp vào
  // chuỗi với một khoá rỗng, nhận 401, và ăn mất một lời gọi cùng một chu
  // kỳ breaker 60 giây của bài đầu tiên.
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    topCeiling ??= 1;
    tiers.push({ provider: claude, label: `tầng Claude (${claude.name})` });
  }

  // Sàn, LUÔN có mặt: không có nó thì một ngày mọi nhà cung cấp cùng hỏng
  // sẽ thành một lượt chấm không có kết cục nào.
  tiers.push({ provider: keyword, label: `sàn (${keyword.name})` });

  if (tiers.length === 1) {
    // NÓI RA, không im lặng rơi về đếm từ. Không có bậc thật nào thì hệ
    // thống vẫn chấm được — nhưng bằng đối sánh từ khoá, thứ không bao giờ
    // vượt ngưỡng auto-approve và không phán đoán được gì về tính đúng
    // đắn. Rơi về nó trong im lặng nghĩa là mọi người tin hệ thống đang
    // gọi model trong khi nó đang đếm từ, và bảng điểm trông y hệt nhau ở
    // cả hai ca.
    logger.warn(
      'Không có bậc model nào được cấu hình (GRADING_TIER*_ / ANTHROPIC_API_KEY) — ' +
        'chấm điểm chạy bằng KeywordGradingProvider (đối sánh từ khoá, KHÔNG gọi model). ' +
        'Điểm sinh ra chỉ dùng để thử luồng, không dùng để chấm thật.',
    );
    return keyword;
  }

  logger.log(`Chuỗi chấm: ${tiers.map((t) => t.label).join(' → ')}`);

  // Trần của bậc đầu tiên quyết định CÓ BÀI NÀO TỰ DUYỆT ĐƯỢC KHÔNG, và
  // đây là chỗ duy nhất biết điều đó lúc khởi động.
  //
  // Phải nói ra vì triệu chứng của nó — 40/40 bài đều sang giảng viên —
  // đọc y hệt một lỗi, và người vận hành sẽ đi tìm lỗi trong khi hệ thống
  // đang chạy đúng như cấu hình.
  if (topCeiling !== undefined && topCeiling < AUTO_APPROVE_CONFIDENCE) {
    logger.warn(
      `Trần tin cậy của bậc đầu là ${topCeiling}, dưới ngưỡng tự duyệt ` +
        `${AUTO_APPROVE_CONFIDENCE} — sẽ KHÔNG có bài nào được tự duyệt, mọi bài đều ` +
        'chuyển giảng viên. Đây là cấu hình có chủ đích, không phải lỗi; nâng trần là ' +
        'việc của calibration (spec §11), đặt qua GRADING_TIERn_CEILING.',
    );
  }

  return new FallbackGradingProvider(tiers);
}

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
