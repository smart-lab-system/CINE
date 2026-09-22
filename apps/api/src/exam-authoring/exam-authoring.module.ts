import { Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiUsageEntity } from './entities/ai-usage.entity';
import { RubricEntity } from '../grading/entities/rubric.entity';
import { RubricCriterionEntity } from '../grading/entities/rubric-criterion.entity';
import { ExamAuthoringService } from './exam-authoring.service';
import { ExamAuthoringController } from './exam-authoring.controller';
import {
  EXAM_AUTHORING_PROVIDER,
  ExamAuthoringProvider,
} from './ai-provider/exam-authoring-provider';
import { ClaudeAuthoringProvider } from './ai-provider/claude-authoring.provider';
import { StubAuthoringProvider } from './ai-provider/stub-authoring.provider';

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

@Module({
  imports: [TypeOrmModule.forFeature([AiUsageEntity, RubricEntity, RubricCriterionEntity])],
  controllers: [ExamAuthoringController],
  providers: [
    ExamAuthoringService,
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
