import { Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiUsageEntity } from './entities/ai-usage.entity';
import { RubricEntity } from '../grading/entities/rubric.entity';
import { RubricCriterionEntity } from '../grading/entities/rubric-criterion.entity';
import { ExamAuthoringService } from './exam-authoring.service';
import { ExamAuthoringController } from './exam-authoring.controller';
import { AttachExamService } from './attach-exam.service';
import { GenerateQuotaService } from './generate-quota.service';
import { RulerGenerateController } from './ruler-generate.controller';
import { RulerGenerateService } from './ruler-generate.service';
import { ExamSessionModule } from '../exam-session/exam-session.module';
import { GradingModule } from '../grading/grading.module';
import { StorageModule } from '../storage/storage.module';
import {
  EXAM_AUTHORING_PROVIDER,
  ExamAuthoringProvider,
} from './ai-provider/exam-authoring-provider';
import { ClaudeAuthoringProvider } from './ai-provider/claude-authoring.provider';
import { StubAuthoringProvider } from './ai-provider/stub-authoring.provider';
import { ClaudeRulerProvider } from './ruler/claude-ruler.provider';
import { RULER_PROVIDER, RulerProvider } from './ruler/ruler-provider';
import { StubRulerProvider } from './ruler/stub-ruler.provider';

/**
 * TEST KHÔNG BAO GIỜ ĐƯỢC GỌI API TÍNH TIỀN.
 *
 * Soi gương `selectGradingProvider` (grading.module.ts), và cùng cái giá đã
 * trả ở đó: khoá API thật trong `.env` từng làm cả bộ e2e gọi API thật, và nó
 * chỉ lộ ra vì tài khoản chưa có credit. Nếu đã có credit thì test vẫn xanh,
 * chỉ là mỗi lần chạy lại tiêu một ít tiền, chậm hơn, và phụ thuộc một dịch
 * vụ ngoài mạng — đó mới là ca đắt.
 *
 * "Có một khoá trong .env" không phải lời xin phép tiêu tiền. Một lượt soạn
 * đề thật do giảng viên bấm nút; một bộ test thì không.
 */
export function selectAuthoringProvider(
  claude: ClaudeAuthoringProvider,
  stub: StubAuthoringProvider,
): ExamAuthoringProvider {
  if (process.env.NODE_ENV === 'test') {
    return stub;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    new Logger('ExamAuthoringModule').warn(
      'Không có ANTHROPIC_API_KEY — soạn đề chạy bằng stub, đề sinh ra là mẫu cố định.',
    );
    return stub;
  }
  return claude;
}

/**
 * Cùng luật với `selectAuthoringProvider`: test không bao giờ gọi API tính tiền, và máy không có khoá thì dùng stub. Khác ở
 * chỗ stub của sinh thước TỪ CHỐI (503) thay vì trả thước mẫu — một gói test cố định cho đề không liên quan nguy hiểm hơn
 * một lỗi rõ ràng.
 */
export function selectRulerProvider(claude: ClaudeRulerProvider, stub: StubRulerProvider): RulerProvider {
  if (process.env.NODE_ENV === 'test') {
    return stub;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    new Logger('ExamAuthoringModule').warn('Không có ANTHROPIC_API_KEY — sinh gói test sẽ trả 503.');
    return stub;
  }
  return claude;
}

@Module({
  imports: [
    TypeOrmModule.forFeature([AiUsageEntity, RubricEntity, RubricCriterionEntity]),
    // Không sinh vòng: GradingModule đã import ExamSessionModule từ trước, và
    // không module nào trong hai cái đó biết tới ExamAuthoringModule.
    ExamSessionModule,
    GradingModule,
    StorageModule,
  ],
  controllers: [ExamAuthoringController, RulerGenerateController],
  providers: [
    ExamAuthoringService,
    AttachExamService,
    GenerateQuotaService,
    RulerGenerateService,
    ClaudeRulerProvider,
    StubRulerProvider,
    {
      provide: RULER_PROVIDER,
      useFactory: selectRulerProvider,
      inject: [ClaudeRulerProvider, StubRulerProvider],
    },
    ClaudeAuthoringProvider,
    StubAuthoringProvider,
    {
      provide: EXAM_AUTHORING_PROVIDER,
      useFactory: selectAuthoringProvider,
      inject: [ClaudeAuthoringProvider, StubAuthoringProvider],
    },
  ],
  exports: [ExamAuthoringService],
})
export class ExamAuthoringModule {}
