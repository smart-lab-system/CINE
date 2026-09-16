import { AdvocateOpinion } from './advocate.types';

/**
 * Seam cho lượt hỏi thứ hai, đồng dạng với `AIGradingProvider`.
 *
 * Tồn tại vì chủ đồ án chốt (2026-09-15) rằng Advocate DÙNG CHUNG chuỗi
 * dự phòng với Grader. Không có seam này thì Advocate gắn cứng Claude —
 * mà Claude đang hết credit — nên cơ chế công bằng của cả thiết kế sẽ tồn
 * tại trên giấy và không bao giờ chạy một lần nào.
 */
export interface AdvocateRequest {
  /** Chỉ để ghi log — KHÔNG đi vào prompt. */
  studentMssv: string;
  content: string;
  /**
   * KHÔNG có `criteria`, và đó là toàn bộ điểm của thiết kế (spec §2.1):
   * Advocate MÙ RUBRIC. Nhận rubric thì nó lặp lại lượt Grader với nhiều
   * token hơn, và ý kiến thứ hai không còn độc lập.
   */
  questionPdf?: Buffer;
  modelAnswerPdf?: Buffer;
  modelAnswerNote?: string;
}

export interface AdvocateProvider {
  readonly name: string;
  advocate(request: AdvocateRequest): Promise<AdvocateOpinion>;
}

/** Nest injection token — một interface không có định danh lúc chạy. */
export const ADVOCATE_PROVIDER = Symbol('ADVOCATE_PROVIDER');
