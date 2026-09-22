import { JobsOptions } from 'bullmq';

/** Payload của một job kiểm nội dung file nén. Một job = một bài nộp. */
export interface ArchiveCheckJob {
  submissionId: string;
}

/**
 * Ba lần thử với backoff: lỗi ở đây gần như luôn là storage chập chờn
 * (Supabase Storage/MinIO timeout), loại tự hết. Không có lớp phân loại
 * lỗi vĩnh viễn như `GradingProcessor` vì không có lời gọi API bên ngoài
 * nào để hỏng theo kiểu 4xx (không gọi model, không gọi provider trả phí) —
 * mọi lỗi ở đây là lỗi hạ tầng cục bộ hoặc file người dùng thật sự hỏng, và
 * cả hai loại đều xứng đáng thử lại vài lần trước khi kết luận.
 */
export const ARCHIVE_CHECK_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  /**
   * Cùng lý lẽ `GRADING_JOB_OPTIONS` (grading.queue.ts) đã viết cho chính
   * nó — thiếu hai dòng này là một chỗ sót, không phải một quyết định.
   * Giữ theo TUỔI, không theo số trần, vì việc dọn là best-effort chạy
   * khi job kế tiếp kết thúc, không phải một timer nền. `count` thấp hơn
   * hàng chấm điểm (5 000) vì một job kiểm file nén rẻ hơn để suy lại —
   * không tốn token, dữ liệu cũng nhỏ hơn nhiều.
   */
  removeOnComplete: { age: 24 * 3600, count: 1_000 },
  /** Job lỗi ở lại để điều tra — "biến mất" là câu trả lời tệ nhất cho
   *  vì sao một bài nén không có kết luận kiểm. */
  removeOnFail: false,
};
