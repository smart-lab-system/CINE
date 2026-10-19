import { HttpException } from '@nestjs/common';
import { AuthoringUsage } from '../ai-provider/exam-authoring-provider';
import { RulerProposal } from './ruler-core';
import { RulerLanguage } from './ruler-prompt';

/**
 * Seam của model đề xuất THƯỚC (đáp án + ca test) từ một đề cố định. Tách khỏi `ExamAuthoringProvider`: soạn đề
 * sinh ra CẢ đề, còn đây nhận đề sẵn có và không bao giờ sinh lại nó; hai việc khác nhau, và dùng chung interface buộc
 * mọi bản giả của soạn đề phải khai thêm một method không liên quan.
 */
export interface RulerRequest {
  /** Đề của câu, đã trích thành văn bản. */
  statement: string;
  language: RulerLanguage;
  /** Có thì là mã đáp án của giảng viên: model chỉ đề xuất ca, không viết đáp án. */
  teacherAnswer?: string;
}

export interface RulerOutcome {
  proposal: RulerProposal;
  usage: AuthoringUsage;
  /** Phiên bản khuôn prompt, ghi cùng lượt sinh. */
  promptVersion: string;
}

export interface RulerProvider {
  readonly name: string;
  propose(request: RulerRequest): Promise<RulerOutcome>;
}

export const RULER_PROVIDER = Symbol('RULER_PROVIDER');

/**
 * Lỗi của provider KÈM token đã tiêu. Một lượt hỏng SAU khi có response (từ chối, hết trần, JSON hỏng) vẫn tốn tiền
 * thật, nên người gọi phải ghi usage trước khi trả lỗi; lỗi TRƯỚC khi có response thì `usage` là null.
 */
export class RulerProviderFailure extends Error {
  constructor(
    readonly httpError: HttpException,
    readonly usage: AuthoringUsage | null,
  ) {
    super(httpError.message);
    this.name = 'RulerProviderFailure';
  }
}
