import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { SubmissionEntity } from '../entities/submission.entity';
import { ExamSessionService } from '../../exam-session/exam-session.service';
import { ARCHIVE_CHECK_QUEUE } from './archive-check.constants';
import { ARCHIVE_CHECK_JOB_OPTIONS, ArchiveCheckJob } from './archive-check.types';

/**
 * Đường kiểm lại file nén thủ công — spec
 * `docs/superpowers/specs/2026-09-21-archive-content-validation-design.md`
 * §5.3.2.
 *
 * Làm hai việc cùng lúc: vớt các dòng `pending` mồ côi (job hỏng ở khe
 * enqueue-sau-commit của Task 5), và cho giảng viên thử lại một
 * `failed`/`unreadable` trước khi kết luận lỗi thuộc về sinh viên — vì
 * `unreadable` có thể là storage chập chờn ở phía server, không phải file
 * em nộp thật sự hỏng.
 */
@Injectable()
export class ArchiveRecheckService {
  constructor(
    @InjectRepository(SubmissionEntity)
    private readonly submissions: Repository<SubmissionEntity>,
    private readonly examSessions: ExamSessionService,
    @InjectQueue(ARCHIVE_CHECK_QUEUE)
    private readonly queue: Queue<ArchiveCheckJob>,
  ) {}

  /**
   * ĐỌC-RỒI-XẾP-HÀNG, không đổi một byte nào của bài nộp: `storage_key`,
   * `checksum`, `submitted_at`, `status` đều không đụng tới. Bấm bao nhiêu
   * lần cũng được — cùng tính chất ĐỌC-RỒI-GỬI như "Thu lại"
   * (`RecollectService`).
   *
   * Bản chụp GIỮ NGUYÊN, không render lại. Nó là sự thật tại thời điểm em
   * nộp, và render lại bây giờ sẽ cho ra 'UNKNOWN' ở `{SOMAY}` vì socket
   * đã đóng từ lâu (spec §5.2) — nếu muốn một bản chụp mới, đường đúng là
   * em nộp lại (spec §5.4), không phải nút này.
   */
  async requeue(examSessionId: string, teacherId: string): Promise<{ requeued: number }> {
    await this.examSessions.findEntityForOwner(examSessionId, teacherId);

    const targets = await this.submissions.find({
      where: {
        examSessionId,
        archiveCheckStatus: In(['failed', 'unreadable', 'pending']),
        // Loại `not_applicable` khỏi vòng lặp `In(...)` phía trên là đủ để
        // không đụng nó, nhưng giữ điều kiện này tường minh: một dòng
        // `pending` phải có bản chụp mới xếp hàng lại được — trùng đúng
        // ràng buộc `ck_submission_archive_snapshot` ở tầng DB (Task 1),
        // không dựa vào việc DB sẽ tự chặn nếu code ở đây quên.
        archiveExpectedEntries: Not(IsNull()),
      },
      select: { id: true },
    });
    if (targets.length === 0) {
      return { requeued: 0 };
    }

    await this.submissions.update(
      { id: In(targets.map((t) => t.id)) },
      { archiveCheckStatus: 'pending', archiveMissingEntries: null, archiveCheckError: null },
    );
    await this.queue.addBulk(
      targets.map((t) => ({ name: 'check', data: { submissionId: t.id }, opts: ARCHIVE_CHECK_JOB_OPTIONS })),
    );
    return { requeued: targets.length };
  }
}
