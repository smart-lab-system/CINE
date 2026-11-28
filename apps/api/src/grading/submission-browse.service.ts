import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { renderFilename } from '../exam-session/filename-template';
import { StorageService } from '../storage/storage.service';
import {
  sanitizeExtractRelativePath,
  UnsafeExtractPathError,
} from '../ide-extensions/extract/ide-extension-extract-path';
import {
  SubmissionExtractFatalError,
  SubmissionExtractService,
} from '../submission/extract/submission-extract.service';
import type {
  ExtractTreeDocument,
  SubmissionExtractStatusView,
} from '../submission/extract/submission-extract.types';

const MESSAGES = {
  noFile: 'Bài này chưa có file trên kho lưu trữ.',
  notReady: 'Chưa giải nén xong - chưa thể xem file.',
  treeBroken: 'Không đọc được cây thư mục đã giải nén. Hãy thử giải nén lại.',
  badPath: 'Đường dẫn file không hợp lệ.',
  missingExtracted: 'Không tìm thấy file đã giải nén.',
} as const;

export interface SubmissionBrowseView {
  status: SubmissionExtractStatusView['status'];
  entryCount: number | null;
  error: string | null;
  fileName: string | null;
  tree: ExtractTreeDocument | null;
}

@Injectable()
export class SubmissionBrowseService {
  private readonly logger = new Logger(SubmissionBrowseService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly storage: StorageService,
    private readonly extract: SubmissionExtractService,
  ) {}

  async browse(resultId: string): Promise<SubmissionBrowseView> {
    const row = await this.loadSubmissionRow(resultId);
    if (!row.storage_key) throw new BadRequestException(MESSAGES.noFile);

    const base: SubmissionBrowseView = {
      status: row.extract_status,
      entryCount: row.extract_entry_count,
      error: row.extract_error,
      // Mẫu deliverable (`{MSSV}-{HOTEN}.java`) phải render giống submission-download.
      fileName: row.required_filename
        ? renderFilename(row.required_filename, {
            studentMssv: row.student_mssv,
            studentName: row.student_name_input ?? '',
            seatLabel: '',
            roomLabel: row.room_name ?? '',
          })
        : null,
      tree: null,
    };

    if (row.extract_status !== 'ready' || !row.extract_tree_key) {
      return base;
    }

    try {
      const raw = await this.storage.getObject(row.extract_tree_key);
      const tree = JSON.parse(raw.toString('utf8')) as ExtractTreeDocument;
      return { ...base, tree };
    } catch (error) {
      this.logger.warn(
        `browse result ${resultId}: không đọc được tree.json — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException(MESSAGES.treeBroken);
    }
  }

  async browseFile(
    resultId: string,
    rawPath: string,
  ): Promise<{ downloadUrl: string; expiresIn: number; path: string; size: number | null }> {
    const row = await this.loadSubmissionRow(resultId);
    if (!row.storage_key) throw new BadRequestException(MESSAGES.noFile);
    if (row.extract_status !== 'ready') throw new BadRequestException(MESSAGES.notReady);

    let relativePath: string;
    try {
      relativePath = sanitizeExtractRelativePath(rawPath);
    } catch (error) {
      if (error instanceof UnsafeExtractPathError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    let key: string;
    try {
      key = this.storage.buildSubmissionExtractedFileKey(
        row.exam_session_id,
        row.student_mssv,
        row.required_deliverable_id,
        relativePath,
      );
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw new BadRequestException(MESSAGES.badPath);
      }
      throw error;
    }

    if (!(await this.storage.objectExists(key))) {
      throw new NotFoundException(MESSAGES.missingExtracted);
    }

    const filename = relativePath.split('/').pop() || 'file';
    const { downloadUrl, expiresIn } = await this.storage.generateDownloadUrl(key, { filename });
    const size = await this.storage.getObjectSize(key);
    return { downloadUrl, expiresIn, path: relativePath, size };
  }

  async requestExtract(resultId: string): Promise<SubmissionExtractStatusView> {
    const row = await this.loadSubmissionRow(resultId);
    if (!row.storage_key) throw new BadRequestException(MESSAGES.noFile);
    try {
      return await this.extract.requestExtract(row.submission_id);
    } catch (error) {
      if (error instanceof SubmissionExtractFatalError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async loadSubmissionRow(resultId: string): Promise<{
    submission_id: string;
    storage_key: string | null;
    exam_session_id: string;
    student_mssv: string;
    student_name_input: string | null;
    room_name: string | null;
    required_deliverable_id: string;
    required_filename: string | null;
    extract_status: SubmissionBrowseView['status'];
    extract_tree_key: string | null;
    extract_error: string | null;
    extract_entry_count: number | null;
  }> {
    const [row] = await this.ds.query(
      `SELECT s.id AS submission_id,
              s.storage_key,
              s.exam_session_id,
              s.student_mssv,
              s.student_name_input,
              s.required_deliverable_id,
              s.extract_status,
              s.extract_tree_key,
              s.extract_error,
              s.extract_entry_count,
              rd.required_filename,
              es.room_name
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         JOIN examcollect.required_deliverable rd ON rd.id = s.required_deliverable_id
         JOIN examcollect.exam_session es ON es.id = s.exam_session_id
        WHERE g.id = $1`,
      [resultId],
    );
    if (!row) throw new NotFoundException('Không tìm thấy bài chấm.');
    return row;
  }
}
