import { JobsOptions } from 'bullmq';
import { DeliverableType } from '../exam-session/entities/required-deliverable.entity';
import { envPositiveInt } from './env';

export const GRADING_QUEUE = 'grading';

export interface GradeSubmissionJob {
  /**
   * Loại bài nộp ĐÃ KHAI lúc tạo phiên. Bộ định tuyến tất định đọc trường
   * này để chọn resolver — không đoán từ tên file, không hỏi model.
   */
  deliverableType: DeliverableType;
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
 * ⚠️ 120 GIÂY KHÔNG CÒN ĐỦ, và con số này là ĐO ĐƯỢC chứ không phải ước
 * lượng (2026-09-15, tầng 1 = qwen3.8-flash):
 *
 *   chấm 3 tiêu chí           45,8 giây
 *   lượt phản biện, bài NGẮN  61,4 giây   (893/1073 token là reasoning)
 *   ───────────────────────────────────
 *   một bài cần Advocate     ~107 giây+   → sát hoặc vượt trần 120s cũ
 *
 * Trần cũ chọn khi chỉ có Claude ("15-30s, 120s là rộng gấp bốn"). Với một
 * model free chậm làm bậc đầu thì nó không còn là bốn lần dư mà là thiếu.
 *
 * Mặc định 300s, KHÔNG phải 240s. 240 là đúng bằng 90 (trần HTTP lượt
 * chấm) + 150 (trần HTTP lượt phản biện), tức BIÊN BẰNG KHÔNG: một lượt
 * chấm trả lời chậm ở giây thứ 89 rồi một lượt phản biện dùng hết 150s sẽ
 * bị trần job cắt đúng lúc đang ghi, và ý kiến phản biện mất trắng. 300s
 * để lại 60s cho phần còn lại của hàm (đọc file, ghi DB).
 *
 * ĐỌC ĐƯỢC TỪ ENV: giới hạn thật phụ thuộc bậc nào đang
 * chạy, mà bậc thì đổi bằng `.env` chứ không bằng deploy. Cùng lập luận
 * §9.1a — lỗ thật là KHÔNG CHỈNH ĐƯỢC, không phải giá trị cụ thể.
 *
 * Cái giá phải biết: một job treo giữ chỗ lâu hơn hẳn. Với `concurrency`
 * 5 thì tệ nhất là 5 chỗ bị giữ 5 phút, chấp nhận được ở quy mô này.
 */
export const GRADE_JOB_TIMEOUT_MS = envPositiveInt('GRADE_JOB_TIMEOUT_MS', 300_000);

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
