import { JobsOptions } from 'bullmq';

export const GRADING_QUEUE = 'grading';

export interface GradeSubmissionJob {
  submissionId: string;
  /** Tên file đã khai báo — chỉ ĐUÔI của nó được dùng để chọn extractor. */
  requiredFilename: string;
  rubricId: string;
  /** Ai bấm "Bắt đầu chấm" — ghi vào `grading_result.grading_triggered_by`. */
  teacherId: string;
}

/**
 * Trần thời gian cho MỘT bài.
 *
 * BullMQ 6 **không có** trường `timeout` ở cấp job — nó bị bỏ sau Bull v3
 * (đã kiểm `base-job-options.d.ts`: chỉ `attempts`, `backoff`,
 * `removeOnComplete`, `removeOnFail`, `delay`, `priority`, `jobId`). Nên
 * trần này phải do processor tự dựng, và nó dựng ở đó chứ không ở trong
 * provider: mọi provider — kể cả provider thêm sau này — đều đi qua
 * processor, đúng cùng lập luận đã đặt giới hạn kích thước ở
 * `extractText` thay vì ở chỗ gọi model.
 *
 * Vì sao cần: một lời gọi treo ở tầng mạng chiếm slot vô hạn. Với
 * `concurrency` 5 thì 5 bài treo là dừng cả hàng đợi, và không có gì
 * trong BullMQ tự gỡ ra.
 *
 * 120 giây: một bài tự luận dài qua model mạnh mất 15-30s; 120s là rộng
 * gấp bốn mà vẫn cắt được ca treo thật.
 */
export const GRADE_JOB_TIMEOUT_MS = 120_000;

/**
 * Tuỳ chọn cho mỗi job. Khai ở đây, không rải trong `startGrading`, vì
 * `attempts`/`backoff`/`limiter` TƯƠNG TÁC với nhau — đọc rời ra thì
 * không thấy được tổng thời gian xấu nhất của một bài.
 */
export const GRADE_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  /**
   * Giữ theo TUỔI, không theo số trần.
   *
   * `removeOnComplete: 1000` nghe có vẻ đủ, nhưng một lượt chấm là 40-150
   * job: job của phiên trước bị dọn trước khi ai kịp nhìn lại.
   *
   * Lưu ý từ chính doc BullMQ: việc dọn là **best-effort, chạy khi job kế
   * tiếp kết thúc**, không có timer nền. Job quá tuổi vẫn nằm đó nếu
   * không còn job nào chạy — một lý do nữa để tiến độ đọc từ DB chứ
   * không từ hàng đợi.
   */
  removeOnComplete: { age: 24 * 3600, count: 5_000 },
  /** Job lỗi ở lại để điều tra. Với một đường ống tốn tiền, "biến mất"
   *  là câu trả lời tệ nhất cho "vì sao bài này không có điểm". */
  removeOnFail: false,
};
