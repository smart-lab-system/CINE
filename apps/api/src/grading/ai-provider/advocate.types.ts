/**
 * Hình dạng ý kiến của Advocate.
 *
 * File LEAF — không import gì. `AdvocateOpinion` được một `@Column` đọc ở
 * `grading-result.entity.ts`, và CLAUDE.md có nguyên tắc riêng về việc này:
 * tham số của decorator được đọc NGAY lúc class được định nghĩa, nên dưới
 * CommonJS một vòng import sẽ trao `undefined` cho decorator mà không ném
 * lỗi nào. Repo này đã dính đúng một lần (`@Matches(undefined)`,
 * 2026-09-11) và triệu chứng là validation lặng lẽ chấp nhận mọi giá trị.
 */

/** Advocate phán đoán em ấy có đúng không — KHÔNG phải em ấy được mấy điểm. */
export type AdvocateCorrectness = 'yes' | 'partially' | 'no';

export interface AdvocateSuggestion {
  criterionId: string;
  suggestedVerdict: 'met' | 'partially_met' | 'not_met';
  /** Vì sao — câu này giảng viên đọc, nên viết cho người. */
  why: string;
}

/**
 * CHỈ KIẾN NGHỊ (spec §2.2, quyết định của chủ đồ án 2026-09-14).
 *
 * `ai_total_score` mãi mãi là con số của Grader, ghi một lần, bất biến —
 * Security rule 6 không cần ngoại lệ nào. Advocate đẩy bài sang
 * `flagged_for_review` và đặt ý kiến của mình cạnh ý kiến Grader; giảng
 * viên đọc cả hai rồi tự quyết.
 *
 * Không có `points`, không có `totalScore`, không có `confidence` ở đây —
 * cùng ranh giới với Grader: model phán đoán, code đếm.
 */
export interface AdvocateOpinion {
  isCorrect: AdvocateCorrectness;
  /**
   * Lập luận bênh vực, viết cho GIẢNG VIÊN đọc chứ không phải cho máy
   * parse. Đây là thứ duy nhất trong cả hệ thống được phép là văn xuôi tự
   * do: nó tồn tại để thuyết phục một con người, và một con người có
   * quyền không bị thuyết phục.
   */
  reasoning: string;
  /** Trích nguyên văn từ bài làm. Bị kiểm bằng `verifyEvidence` như Grader. */
  evidence: string[];
  suggestedVerdicts: AdvocateSuggestion[];
  /**
   * Dẫn chứng KHÔNG định vị được trong bài.
   *
   * Advocate bịa dẫn chứng nguy hiểm hơn Grader bịa: nó đang lập luận để
   * NÂNG điểm, và một giảng viên đang chấm bài thứ 35 sẽ có xu hướng đồng
   * ý. Nên những mẩu không kiểm được phải hiện ra — nhưng KHÔNG tự động
   * loại bỏ kiến nghị, vì loại bỏ là thay giảng viên quyết.
   *
   * `null` = CHƯA kiểm, `[]` = đã kiểm và không mẩu nào trượt. Hai thứ đó
   * phải phân biệt được: provider trả về `null` vì `verifyEvidence` cần
   * bài làm nguyên văn, thứ chỉ `GradingService` cầm. Nếu cả hai cùng là
   * `[]` thì một người đọc sau — hoặc một màn hình — sẽ đọc "chưa ai kiểm"
   * thành "đã kiểm, sạch", đúng ở chỗ nguy hiểm nhất.
   */
  unverifiedEvidence: string[] | null;
  /** Của riêng lượt Advocate. Lượt Grader có usage riêng, không cộng vào đây. */
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
}
