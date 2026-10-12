import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ExamSessionService } from '../exam-session/exam-session.service';
import { StorageService } from '../storage/storage.service';
import { MSG } from './grade-export.messages';

export interface ExportListItem {
  id: string;
  exportedAt: string | null;
  sheetName: string | null;
  firstDataRow: number | null;
  mssvColumn: string;
  scoreColumn: string;
  reasonColumn: string | null;
  deliverableName: string | null;
  roundingStepHundredths: number;
  written: number;
  /** Ô trống + ô giữ nguyên. */
  blank: number;
  unmatched: number;
  overwritten: number;
  decreased: number;
  decreaseConfirmedBy: string | null;
  exportedByName: string;
  templateFileName: string | null;
  outputFileName: string | null;
}

/** Đọc lại các lượt xuất của một phiên và ký URL tải file của chúng. Quyền sở hữu phiên do người gọi kiểm trước. */
@Injectable()
export class GradeExportQueryService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly storage: StorageService,
    private readonly sessions: ExamSessionService,
  ) {}

  async list(sessionId: string): Promise<ExportListItem[]> {
    const rows: Record<string, unknown>[] = await this.ds.query(
      `SELECT e.id, e.exported_at, e.sheet_name, e.first_data_row, e.mssv_column, e.score_column, e.reason_column,
              d.required_filename AS deliverable_name, e.rounding_step_hundredths, e.written_count, e.blank_count,
              e.unmatched_mssv_count, e.overwrite_count, e.decrease_count, c.name AS confirmed_by_name,
              a.name AS exported_by_name, e.template_file_name, e.output_file_name
         FROM examcollect.grade_export e
         JOIN examcollect.account a ON a.id = e.exported_by
         LEFT JOIN examcollect.account c ON c.id = e.decrease_confirmed_by
         LEFT JOIN examcollect.required_deliverable d ON d.id = e.required_deliverable_id
        WHERE e.exam_session_id = $1
        ORDER BY e.exported_at DESC NULLS LAST, e.id DESC`,
      [sessionId],
    );
    return rows.map((r) => ({
      id: r.id as string,
      exportedAt: r.exported_at ? (r.exported_at as Date).toISOString() : null,
      sheetName: r.sheet_name as string | null,
      firstDataRow: r.first_data_row as number | null,
      mssvColumn: r.mssv_column as string,
      scoreColumn: r.score_column as string,
      reasonColumn: r.reason_column as string | null,
      deliverableName: r.deliverable_name as string | null,
      roundingStepHundredths: r.rounding_step_hundredths as number,
      written: r.written_count as number,
      blank: r.blank_count as number,
      unmatched: r.unmatched_mssv_count as number,
      overwritten: r.overwrite_count as number,
      decreased: r.decrease_count as number,
      decreaseConfirmedBy: r.confirmed_by_name as string | null,
      exportedByName: r.exported_by_name as string,
      templateFileName: r.template_file_name as string | null,
      outputFileName: r.output_file_name as string | null,
    }));
  }

  /** 404 khi không có lượt; 403 khi không phải chủ phiên (qua `findEntityForOwner`). */
  async download(exportId: string, teacherId: string): Promise<{ downloadUrl: string; fileName: string }> {
    const [row]: { exam_session_id: string; output_storage_key: string | null; output_file_name: string | null }[] = await this.ds.query(
      `SELECT exam_session_id, output_storage_key, output_file_name FROM examcollect.grade_export WHERE id = $1`,
      [exportId],
    );
    if (!row) throw new NotFoundException(MSG.exportNotFound);
    await this.sessions.findEntityForOwner(row.exam_session_id, teacherId);
    if (!row.output_storage_key) throw new NotFoundException(MSG.noOutput);
    const fileName = row.output_file_name ?? 'so-diem.xlsx';
    const { downloadUrl } = await this.storage.generateDownloadUrl(row.output_storage_key, { filename: fileName });
    return { downloadUrl, fileName };
  }
}
