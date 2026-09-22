import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubmissionEntity } from '../entities/submission.entity';
import { StorageService } from '../../storage/storage.service';
import { matchEntries } from './entry-matcher';
import {
  ArchiveTooManyEntriesError,
  ArchiveUnreadableError,
  detectArchiveFormat,
  listArchiveEntries,
} from './archive-reader';
import { ARCHIVE_CHECK_MAX_BYTES } from './archive-check.constants';

/**
 * Chạy phép kiểm nội dung file nén cho MỘT bài nộp — spec
 * `docs/superpowers/specs/2026-09-21-archive-content-validation-design.md`
 * §5.3.
 *
 * Gọi từ `ArchiveCheckProcessor` (một job) và từ đường kiểm lại thủ công
 * (Task 7) — cả hai chỉ cần đưa `submissionId`, mọi quyết định (đọc bao
 * nhiêu, chặn ở đâu, kết luận gì) nằm hết ở đây.
 */
@Injectable()
export class ArchiveCheckService {
  private readonly logger = new Logger(ArchiveCheckService.name);

  constructor(
    @InjectRepository(SubmissionEntity)
    private readonly submissions: Repository<SubmissionEntity>,
    private readonly storage: StorageService,
  ) {}

  async checkOne(submissionId: string): Promise<void> {
    const row = await this.submissions.findOneBy({ id: submissionId });
    if (!row || row.archiveCheckStatus === 'not_applicable' || !row.archiveExpectedEntries) {
      // Không có gì để kiểm — hoặc dòng đã biến mất, hoặc deliverable
      // không khai file bên trong. Job vẫn có thể tới đây nếu nó xếp hàng
      // trước khi bản chụp bị xoá bởi một lượt nộp khác; im lặng thoát là
      // đúng, không phải lỗi.
      return;
    }
    if (!row.storageKey) {
      await this.markUnreadable(submissionId, 'Bài nộp không có file trên kho lưu trữ.');
      return;
    }

    const size = await this.storage.getObjectSize(row.storageKey);
    if (size === null) {
      await this.markUnreadable(submissionId, 'Không tìm thấy file trên kho lưu trữ.');
      return;
    }
    if (size > ARCHIVE_CHECK_MAX_BYTES) {
      await this.markUnreadable(
        submissionId,
        `File quá lớn để mở ra kiểm (${size} byte, trần ${ARCHIVE_CHECK_MAX_BYTES} byte).`,
      );
      return;
    }

    const buffer = await this.storage.getObject(row.storageKey);
    const format = detectArchiveFormat(buffer);
    if (format === 'unknown') {
      await this.markUnreadable(
        submissionId,
        'File không phải định dạng .zip hay .rar đọc được.',
      );
      return;
    }

    let actual: string[];
    try {
      actual = await listArchiveEntries(buffer, format);
    } catch (error) {
      await this.markUnreadable(submissionId, describeError(error));
      return;
    }

    const missing = matchEntries(row.archiveExpectedEntries, actual);
    await this.submissions.update(submissionId, {
      archiveCheckStatus: missing.length === 0 ? 'passed' : 'failed',
      archiveMissingEntries: missing.length === 0 ? [] : missing,
      archiveCheckError: null,
    });
  }

  /**
   * `public` chứ không `private`: `ArchiveCheckProcessor` gọi nó ở nhánh
   * hết-lần-thử để đảm bảo trạng thái cuối luôn là một KẾT LUẬN (spec
   * §12.3) — một bài `pending` mãi mãi trông giống "đang chạy" chứ không
   * giống "đã hỏng".
   */
  async markUnreadable(submissionId: string, reason: string): Promise<void> {
    this.logger.warn(`submission ${submissionId}: archive-check unreadable — ${reason}`);
    await this.submissions.update(submissionId, {
      archiveCheckStatus: 'unreadable',
      archiveMissingEntries: null,
      archiveCheckError: reason,
    });
  }
}

/**
 * Chuỗi ĐÃ XỬ LÝ, không phải message thô của thư viện — cùng luật
 * `describeError()` mà `grading_result.ungradable_reason` đang theo.
 */
function describeError(error: unknown): string {
  if (error instanceof ArchiveTooManyEntriesError) {
    return error.message;
  }
  if (error instanceof ArchiveUnreadableError) {
    return `Không mở được file nén: ${error.message}`;
  }
  return 'Không mở được file nén.';
}
