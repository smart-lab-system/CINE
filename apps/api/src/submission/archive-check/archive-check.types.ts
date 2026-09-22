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
};
