import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { GradingService } from './grading.service';
import { GRADE_JOB_TIMEOUT_MS, GRADING_QUEUE, GradeSubmissionJob } from './grading.queue';

/**
 * Bao nhiêu bài chạy song song.
 *
 * Đọc từ env, mặc định giữ nguyên giá trị cũ. Lỗ thật là KHÔNG CHỈNH ĐƯỢC
 * mà không deploy lại, không phải giá trị cụ thể: giới hạn TPM của tài
 * khoản phụ thuộc tier, và chưa biết token đọc-từ-cache có tính vào TPM hay
 * không. Chỉnh sẵn một con số theo một giới hạn chưa biết là đoán — đo bằng
 * `GradingOutcome.usage` sau một lượt chấm thật rồi mới chỉnh.
 *
 * Đặt tường minh và đặt CẠNH `limiter`, vì hai con số này tương tác:
 * `limiter` giữ nhịp gọi API, còn `concurrency` giữ số bài đang bay.
 * Mặc định của BullMQ là 1 — nghĩa là 40 bài × 10s ≈ 7 phút tuần tự, tức
 * không dùng chút năng lực song song nào. Ngược lại đặt 20 thì 20 lời
 * gọi đồng thời sẽ đụng rate limit, rồi retry, rồi đụng lại.
 */
/**
 * Đọc một số nguyên dương từ env, hoặc NỔ NGAY LÚC KHỞI ĐỘNG.
 *
 * `Number(process.env.X ?? mặc_định)` là một cái bẫy im lặng: `??` chỉ bắt
 * `null`/`undefined`, nên `GRADE_CONCURRENCY=` (rỗng) đi qua và cho `0`,
 * còn `GRADE_CONCURRENCY=abc` cho `NaN`. Worker của BullMQ kiểm
 * `jobsInProgress.size < opts.concurrency`, và cả `0 < 0` lẫn `0 < NaN`
 * đều `false` — worker lặng lẽ ngừng nhận job. Không lỗi, không log, hàng
 * đợi trông khoẻ mạnh trên mọi bảng quản trị, và không bài nào được chấm.
 *
 * Ném lúc nạp module là kết cục ĐÚNG: nó lộ ra ngay khi khởi động, trước
 * khi có job nào được xếp hàng, thay vì lộ ra dưới dạng "sao chấm không
 * chạy" ba ngày sau.
 */
function envPositiveInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(
      `${key}="${raw}" không phải số nguyên dương — từ chối khởi động với một ` +
        'hàng đợi chấm điểm hỏng.',
    );
  }
  return Math.trunc(value);
}

const GRADE_CONCURRENCY = envPositiveInt('GRADE_CONCURRENCY', 5);

/**
 * Trần nhịp gọi. Chọn cùng lúc với `concurrency` ở trên — xem lý do ở đó.
 *
 * LƯU Ý QUAN TRỌNG: trong BullMQ, `limiter` là giới hạn **THÔNG LƯỢNG** (số
 * job trên một khoảng thời gian), **KHÔNG** phải giới hạn song song. Song
 * song là `concurrency` ở trên, một tuỳ chọn riêng. Đặt
 * `{ max: 3, duration: 10000 }` mà tưởng là "3 job chạy song song" sẽ bóp
 * một lượt 40 bài xuống tối thiểu 133 giây, bất kể model nhanh cỡ nào.
 */
const GRADE_RATE_LIMIT = {
  max: envPositiveInt('GRADE_RATE_MAX', 10),
  duration: envPositiveInt('GRADE_RATE_DURATION_MS', 1_000),
};

/**
 * Một job = một bài (CLAUDE.md §7.1.3).
 *
 * Vì sao không phải một job cho cả phiên: chấm 40+ bài bằng model thật
 * mất 3-15s/bài, tức 2-12 PHÚT — quá hạn mọi HTTP request, và nếu giảng
 * viên đóng tab giữa chừng thì một job nguyên khối mất sạch tiến độ.
 * Per-bài nghĩa là retry đúng bài lỗi, tiến độ đọc được từ DB, và chi
 * phí AI không bị tính hai lần cho cùng một bài.
 */
@Processor(GRADING_QUEUE, {
  concurrency: GRADE_CONCURRENCY,
  limiter: GRADE_RATE_LIMIT,
})
export class GradingProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(GradingProcessor.name);

  constructor(private readonly grading: GradingService) {
    super();
  }

  async process(job: Job<GradeSubmissionJob>): Promise<void> {
    const started = Date.now();
    try {
      await this.withTimeout(this.grading.gradeOneById(job.data), job.data.submissionId);
    } catch (error) {
      // PHÂN LOẠI trước khi để BullMQ retry.
      //
      // `attempts: 3` + backoff là đúng cho rate limit, 5xx và timeout —
      // những thứ tự hết. Nó SAI cho 4xx: sai shape `thinking`, schema
      // hỏng, model id không tồn tại. Một lỗi như thế retry 5s→10s→20s
      // rồi mới chết, và trong lúc đó chiếm slot. Deploy nhầm một model
      // id là 40 bài × 3 lần = 120 lời gọi chắc chắn thất bại trước khi
      // ai kịp biết.
      //
      // `UnrecoverableError` bảo BullMQ dừng ngay, không thử lại.
      if (isPermanentFailure(error)) {
        this.logger.error(
          `submission ${job.data.submissionId}: lỗi KHÔNG retry được — ${describeError(error)}`,
        );
        // Thông điệp của `UnrecoverableError` đi vào `job.failedReason`,
        // tức nằm trong Redis và hiện ra ở mọi bảng quản trị hàng đợi.
        // Cùng lý do như log: không đưa văn bản lỗi thô vào đó.
        throw new UnrecoverableError(describeError(error));
      }
      // Lỗi RETRY ĐƯỢC cũng phải sạch trước khi ra khỏi đây.
      //
      // Đã đọc bullmq 6.3.4 `Job.moveToFailed`: nó gán
      // `failedReason = err.message` NGAY, trước khi hỏi `shouldRetry`,
      // rồi truyền cả `failedReason` lẫn `stacktrace` vào `moveToDelayed`
      // / `retryJob`. Nên một lần thử hỏng ở giữa chừng vẫn ghi message
      // thô vào Redis — không chỉ lần cuối. `removeOnFail: false` nghĩa
      // là nó nằm đó cho tới khi có người dọn.
      //
      // 5xx ÍT khi dội lại request body hơn 4xx, nên đây là bịt một lỗ
      // hẹp. Nhưng nó hẹp vì xác suất, không vì cơ chế — và chi phí bịt
      // là ba dòng.
      throw redactIfFromApi(error);
    }
    // Không log nội dung bài làm hay output model — chỉ id và thời gian.
    this.logger.log(`graded submission ${job.data.submissionId} in ${Date.now() - started}ms`);
  }

  /**
   * Trần thời gian cho một bài — xem `GRADE_JOB_TIMEOUT_MS` để biết vì
   * sao nó phải nằm ở đây chứ không ở job options.
   *
   * `Promise.race` chứ không `AbortSignal`: `AIGradingProvider` là một
   * seam đã có, và bắt mọi implementation phải nhận signal là đổi hợp
   * đồng của seam đó vì một lo ngại ở tầng hạ tầng. Đánh đổi phải nói
   * ra: lời gọi bị bỏ rơi vẫn chạy tiếp ở nền cho tới khi SDK tự bỏ
   * cuộc — ta giải phóng SLOT, không giải phóng kết nối. Với mục đích ở
   * đây (không để 5 bài treo dừng cả hàng đợi) thì đúng cái cần.
   */
  private async withTimeout<T>(work: Promise<T>, submissionId: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `chấm bài ${submissionId} quá ${GRADE_JOB_TIMEOUT_MS}ms — bỏ để không giữ slot`,
                ),
              ),
            GRADE_JOB_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      // Không clear thì timer giữ event loop sống thêm 2 phút sau MỌI bài
      // chấm nhanh, và `app.close()` trong e2e treo vì đúng lý do đó.
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Lỗi biến mất vào trong BullMQ nếu không có listener này — và với một
   * đường ống chạy nền, tốn tiền, "vì sao bài này không có điểm" là câu
   * hỏi đầu tiên khi có sự cố.
   *
   * Ghi số lần thử: một bài chết ở lần 1 và một bài chết ở lần 3 là hai
   * câu chuyện khác nhau.
   */
  @OnWorkerEvent('failed')
  onFailed(job: Job<GradeSubmissionJob> | undefined, error: Error): void {
    this.logger.error(
      `job ${job?.id ?? '(không rõ)'} submission ${job?.data?.submissionId ?? '(không rõ)'} ` +
        `thất bại lần ${job?.attemptsMade ?? 0}: ${describeError(error)}`,
    );
  }

  /**
   * Đóng worker khi module tắt.
   *
   * Không có nó, Ctrl-C giữa lượt chấm để job ở trạng thái `active` cho
   * tới hết stall timeout (mặc định 30 giây) — trong dev thì gây nhầm
   * lẫn ("sao chấm lại không chạy"), trong demo thì tệ hơn.
   */
  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}

/**
 * Mô tả một lỗi ĐỦ để điều tra, KHÔNG đủ để rò bài làm của sinh viên.
 *
 * Vì sao không log `error.message` thô: ở một số shape lỗi 400, SDK dựng
 * message từ phần body mà server trả về, và body đó là request của
 * chính ta — tức chứa lại nội dung bài. Một nhánh catch ở tầng đã cầm
 * dữ liệu bài làm không được phép in nguyên văn lời của tầng dưới.
 *
 * Cái thật sự cần để sửa là `status` và `type` — "400 invalid_request"
 * đủ để biết đi đọc chỗ nào, còn 4KB bài luận của một em thì không.
 * `AIGradingProvider` là nơi biết cụ thể sai gì; nó có trách nhiệm ném
 * ra một message đã tự làm sạch nếu muốn message đó hiện ở đây.
 *
 * Lỗi KHÔNG phải từ API (timeout của ta, `GradingInputTooLargeError`,
 * lỗi lập trình) không có `status` — chúng do chính repo này dựng nên
 * message an toàn, và giữ nguyên message là thứ duy nhất có ích.
 */
function describeError(error: unknown): string {
  const api = error as { status?: unknown; type?: unknown; name?: unknown };
  if (typeof api?.status === 'number') {
    const type = typeof api.type === 'string' ? api.type : String(api.name ?? 'lỗi API');
    return `HTTP ${api.status} ${type} (nội dung lỗi bị cắt — có thể chứa bài làm)`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Thay một lỗi ĐẾN TỪ API bằng một lỗi mang đúng thông tin an toàn, giữ
 * nguyên `status` để `isPermanentFailure` và mọi thứ đọc nó vẫn đúng.
 *
 * Lỗi KHÔNG có `status` trả về NGUYÊN BẢN — cả message lẫn stack. Đó là
 * lỗi do chính repo này dựng, message đã sạch, và stack của nó chỉ ra
 * đúng dòng cần sửa. Thay nó bằng một Error mới sẽ đổi một lỗ rò tưởng
 * tượng lấy một stack vô dụng.
 */
function redactIfFromApi(error: unknown): unknown {
  if (typeof (error as { status?: unknown })?.status !== 'number') {
    return error;
  }
  const redacted = new Error(describeError(error));
  redacted.name = 'RedactedApiError';
  (redacted as { status?: number }).status = (error as { status: number }).status;
  return redacted;
}

/**
 * Lỗi sẽ KHÔNG khác đi nếu thử lại.
 *
 * 4xx trừ 408 (timeout) và 429 (rate limit): sai cấu hình hoặc sai
 * request, và cả hai đều cần người sửa chứ không cần chờ.
 */
function isPermanentFailure(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  if (typeof status !== 'number') {
    return false;
  }
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}
