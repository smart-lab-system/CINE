import { Injectable } from '@nestjs/common';
import {
  AuthoringOutcome,
  AuthoringRequest,
  ExamAuthoringProvider,
  GeneratedQuestion,
} from './exam-authoring-provider';

/**
 * Bộ ba tất định, không gọi mạng.
 *
 * Tồn tại vì đúng một lý do, và lý do đó đã trả giá thật trong repo này:
 * `selectGradingProvider` (grading.module.ts) trả provider keyword khi
 * `NODE_ENV === 'test'`, sau khi khoá API thật xuất hiện trong `.env` và cả
 * bộ e2e bắt đầu gọi API tính tiền. Hôm đó nó lộ ra vì tài khoản chưa có
 * credit; nếu đã có credit thì nó KHÔNG lộ ra — test vẫn xanh, chỉ là mỗi
 * lần chạy lại tiêu một ít tiền, chậm hơn, và phụ thuộc một dịch vụ ngoài
 * mạng. Đó mới là ca đắt.
 *
 * "Có một khoá trong .env" không phải lời xin phép tiêu tiền.
 *
 * Nó cũng là đường chạy khi máy chưa cấu hình khoá — đề sinh ra là mẫu cố
 * định, nhưng cả luồng (sửa, xuất Word, gắn phiên) vẫn đi thử được đầu-cuối.
 */
@Injectable()
export class StubAuthoringProvider implements ExamAuthoringProvider {
  readonly name = 'stub-authoring';

  async generate(request: AuthoringRequest): Promise<AuthoringOutcome> {
    const questions: GeneratedQuestion[] = Array.from(
      { length: request.questionCount },
      (_, i): GeneratedQuestion => ({
        statement:
          `Câu ${i + 1}: cài đặt hàm solve(xs) trả về mảng số nguyên đã sắp xếp ` +
          `tăng dần. Không dùng hàm sắp xếp có sẵn của thư viện chuẩn.`,
        // Chia đều cho đủ 10: tổng điểm là thứ giảng viên nhìn đầu tiên, và
        // một bộ đề mẫu cộng ra 9,99 trông như lỗi làm tròn của hệ thống.
        points: 10 / request.questionCount,
        topic: 'sorting',
        requiredComplexity: 'O(n log n)',
        modelAnswer: 'def solve(xs):\n    return sorted(xs)\n',
        testBundle: [
          { name: 'rong', group: 'bien', input: '[]', expectedOutput: '[]' },
          { name: 'mot-phan-tu', group: 'bien', input: '[7]', expectedOutput: '[7]' },
          { name: 'co-ban', group: 'co-ban', input: '[3,1,2]', expectedOutput: '[1,2,3]' },
        ],
        resemblesKnownProblem: null,
      }),
    );

    return {
      exam: {
        title: `Đề mẫu (${request.language}) — provider stub`,
        language: request.language,
        questions,
        // Cứng, không suy từ gì cả: stub chưa chạy dòng mã nào, nên mọi trạng
        // thái khác `unverified` đều là nói dối.
        verification: { status: 'unverified', reason: 'sandbox_unavailable' },
      },
      usage: { modelUsed: this.name, inputTokens: 0, outputTokens: 0 },
    };
  }
}
