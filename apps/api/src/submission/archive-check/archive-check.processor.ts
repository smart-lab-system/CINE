import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ArchiveCheckService } from './archive-check.service';
import { ARCHIVE_CHECK_CONCURRENCY, ARCHIVE_CHECK_QUEUE } from './archive-check.constants';
import { ArchiveCheckJob } from './archive-check.types';

/**
 * Queue RIÊNG, không dùng chung `GRADING_QUEUE` — spec §5.1. Nhịp bên kia
 * là hạn mức token của API AI; ràng buộc ở đây là RAM container. Trộn
 * chung là để cấu hình nhịp của một bên đổi ngầm hành vi của bên kia.
 *
 * `concurrency` đọc từ cùng một chỗ với trần kích thước
 * (`ARCHIVE_CHECK_MAX_BYTES`) vì hai số này là MỘT CẶP — xem
 * `archive-check.constants.ts` §6.2.1.
 */
@Processor(ARCHIVE_CHECK_QUEUE, { concurrency: ARCHIVE_CHECK_CONCURRENCY })
export class ArchiveCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(ArchiveCheckProcessor.name);

  constructor(private readonly archiveCheck: ArchiveCheckService) {
    super();
  }

  // Ba lần thử với backoff (ARCHIVE_CHECK_JOB_OPTIONS): lỗi ở đây gần như
  // luôn là storage chập chờn, loại tự hết. Không có lớp phân loại lỗi
  // vĩnh viễn kiểu GradingProcessor vì không có lời gọi API bên ngoài nào
  // để hỏng theo kiểu 4xx — mọi lỗi ở đây là hạ tầng cục bộ hoặc file
  // người dùng thật sự hỏng, và cả hai loại đều đáng thử lại.
  async process(job: Job<ArchiveCheckJob>): Promise<void> {
    await this.archiveCheck.checkOne(job.data.submissionId);
  }

  /**
   * Trạng thái cuối phải luôn là một KẾT LUẬN — spec §12.3. Hết lần thử mà
   * vẫn `pending` thì bài đó trông như "đang chạy" mãi mãi, và giảng viên
   * tin là hệ thống còn đang làm việc trong khi nó đã bỏ cuộc từ lâu.
   *
   * Lý do KHÔNG đưa `error` thẳng vào lý do ghi xuống DB (khác
   * `GradingProcessor.onFailed`, vốn ghi `describeError(error)`): một
   * `unreadable` ở đây có thể là storage chập chờn (lỗi phía server) hoặc
   * file em nộp thật sự hỏng, và hai nguyên nhân đó cần hai hành động khác
   * nhau của giảng viên (spec §12.3 + đường "Kiểm lại" ở Task 7). Thông
   * điệp CHUNG hướng họ tới hành động đúng — thử lại trước khi kết luận
   * lỗi ở phía sinh viên; chi tiết lỗi vẫn vào log server để điều tra.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<ArchiveCheckJob> | undefined, error: Error): Promise<void> {
    if (!job) {
      return;
    }
    const attempts = job.opts.attempts ?? 1;
    this.logger.warn(
      `submission ${job.data.submissionId}: lần thử ${job.attemptsMade}/${attempts} thất bại — ` +
        `${error.message}`,
    );
    if (job.attemptsMade < attempts) {
      return;
    }
    await this.archiveCheck.markUnreadable(
      job.data.submissionId,
      'Không kiểm được sau nhiều lần thử. Bấm "Kiểm lại" để chạy lại.',
    );
  }
}
