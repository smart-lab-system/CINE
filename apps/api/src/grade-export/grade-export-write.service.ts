import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditLogService } from '../admin/audit-log.service';
import { formatHundredths } from '../grading/scoring/hundredths';
import { lockTeacherScoring } from '../grading/scoring/score-inputs';
import { StorageService } from '../storage/storage.service';
import { BLANK_LABELS } from './blank-reason';
import type { WriteDto } from './dto/write.dto';
import { GradeExportFileStore } from './grade-export-file-store';
import { GradeExportPlanService } from './grade-export-plan.service';
import { buildOutputKey, buildTemplateKey } from './grade-export.keys';
import { MSG } from './grade-export.messages';
import { outputFileName } from './grade-export.names';
import type { BlankReason } from './grade-export.types';
import { PatchError, patchWorkbook, type CellEdit } from './xlsx/sheet-patch';
import { writeZip } from './xlsx/zip-io';

export interface WriteResponse {
  exportId: string;
  fileName: string;
  downloadUrl: string;
  summary: { written: number; blank: number; kept: number; unmatched: number; skipped: number; overwritten: number; decreased: number };
  blank: { row: number; mssv: string; name: string; reason: BlankReason; label: string; kept: boolean }[];
}

/**
 * Ghi điểm vào file CỦA GIẢNG VIÊN (spec `2026-09-29-gradebook-export-design.md` §4.5-4.6). Một transaction dưới
 * `lockTeacherScoring` — cùng khoá mọi lượt tính lại điểm — nên không có lần sửa giá nào chen giữa lúc đọc điểm và
 * lúc ghi lại điều đã ghi. Kế hoạch là CHÍNH `computePlan` của xem trước.
 */
@Injectable()
export class GradeExportWriteService {
  private readonly logger = new Logger(GradeExportWriteService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly plans: GradeExportPlanService,
    private readonly files: GradeExportFileStore,
    private readonly storage: StorageService,
    private readonly audit: AuditLogService,
  ) {}

  async write(sessionId: string, teacherId: string, dto: WriteDto): Promise<WriteResponse> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      const { plan, deliverableId, entries, sheetPath } = await this.plans.computePlan(m, sessionId, dto);

      // Thứ tự từ chối (spec §4.6): chặn cứng → digest → ghi đè → điểm giảm.
      if (plan.blockers.length > 0) throw new ConflictException(plan.blockers[0]);
      if (dto.expectedDigest !== plan.digest) throw new ConflictException(MSG.digestChanged);
      const overwritten = plan.overwrite.score + plan.overwrite.reason;
      if (overwritten > 0 && dto.overwriteExisting !== true) throw new ConflictException(MSG.overwrite(overwritten));
      const decreased = plan.rows.filter((r) => r.action === 'write' && r.direction === 'down');
      if (decreased.length > 0 && dto.confirmDecreases !== true) throw new ConflictException(MSG.decreases(decreased.length));

      const edits: CellEdit[] = [];
      for (const r of plan.rows) {
        if (r.action === 'write') {
          edits.push({ ref: `${dto.scoreColumn}${r.row}`, kind: 'number', hundredths: r.writtenHundredths! });
          if (r.clearsReason && dto.reasonColumn) edits.push({ ref: `${dto.reasonColumn}${r.row}`, kind: 'clear' });
        } else if ((r.action === 'blank' || r.action === 'kept') && r.writesReason && dto.reasonColumn) {
          edits.push({ ref: `${dto.reasonColumn}${r.row}`, kind: 'text', text: BLANK_LABELS[r.blankReason!] });
        }
      }
      let bytes: Buffer;
      try {
        bytes = await writeZip(patchWorkbook(entries, sheetPath, edits));
      } catch (error) {
        if (error instanceof PatchError) throw new BadRequestException(MSG.unsupported(error.message));
        throw error;
      }

      const exportId = randomUUID();
      const outputKey = buildOutputKey(sessionId, exportId);
      const fileName = outputFileName(dto.templateFileName);
      await this.files.put(outputKey, bytes);
      try {
        await m.query(
          `INSERT INTO examcollect.grade_export
             (id, exam_session_id, exported_by, template_storage_key, output_storage_key, mssv_column, score_column, reason_column,
              sheet_name, first_data_row, required_deliverable_id, rounding_step_hundredths, rounding_mode, unmatched_mssv_count,
              written_count, blank_count, overwrite_count, decrease_count, decrease_confirmed_by, template_file_name, output_file_name, exported_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'half_up', $13, $14, $15, $16, $17, $18, $19, $20, now())`,
          [
            exportId, sessionId, teacherId, buildTemplateKey(sessionId, dto.templateId), outputKey, dto.mssvColumn, dto.scoreColumn,
            dto.reasonColumn ?? null, dto.sheetName, dto.firstDataRow, deliverableId, dto.roundingStepHundredths, plan.summary.unmatched,
            plan.summary.write, plan.summary.blank + plan.summary.kept, overwritten, decreased.length,
            decreased.length > 0 ? teacherId : null, dto.templateFileName.slice(0, 255), fileName,
          ],
        );

        // Bản chụp từng sinh viên — hoặc đã ghi điểm, hoặc để trống kèm lý do (`ck_grade_export_row_one_of`).
        const snapshot = plan.rows.filter((r) => r.action === 'write' || r.action === 'blank' || r.action === 'kept');
        if (snapshot.length > 0) {
          const written = (r: (typeof snapshot)[number]) => r.action === 'write';
          await m.query(
            `INSERT INTO examcollect.grade_export_row (grade_export_id, file_row, mssv, written_hundredths, blank_reason, score_computation_id)
             SELECT $1::uuid, t.file_row, t.mssv, t.written, t.reason::examcollect.grade_export_blank_reason, t.computation
               FROM unnest($2::int[], $3::text[], $4::int[], $5::text[], $6::uuid[]) AS t(file_row, mssv, written, reason, computation)`,
            [
              exportId,
              snapshot.map((r) => r.row),
              snapshot.map((r) => r.studentMssv),
              snapshot.map((r) => (written(r) ? r.writtenHundredths : null)),
              snapshot.map((r) => (written(r) ? null : r.blankReason)),
              snapshot.map((r) => (written(r) ? r.computationId : null)),
            ],
          );
        }

        // Điểm giảm sau khi đã công bố nặng hơn điểm tăng: người xác nhận ghi ở cột trên VÀ ở cuốn sổ chung (D16).
        if (decreased.length > 0) {
          await this.audit.recordUserAction(
            {
              actorId: teacherId,
              action: 'grade_export.score_decreased_confirmed',
              targetType: 'grade_export',
              targetId: exportId,
              oldValue: {},
              newValue: {
                decreased: decreased.map((r) => ({
                  mssv: r.studentMssv,
                  before: formatHundredths(r.previousHundredths!),
                  after: formatHundredths(r.writtenHundredths!),
                  causes: r.causes,
                })),
              },
            },
            m,
          );
        }
      } catch (error) {
        // Không có dòng nào trỏ vào object không tồn tại, và không có object mồ côi (D19).
        await this.storage.deleteObject(outputKey).catch((cleanup: unknown) => {
          this.logger.error(`Không xoá được object ${outputKey} sau khi ghi DB hỏng`, cleanup instanceof Error ? cleanup.stack : String(cleanup));
        });
        throw error;
      }

      const { downloadUrl } = await this.storage.generateDownloadUrl(outputKey, { filename: fileName });
      const blanks = plan.rows.filter((r) => r.action === 'blank' || r.action === 'kept');
      return {
        exportId,
        fileName,
        downloadUrl,
        summary: {
          written: plan.summary.write, blank: plan.summary.blank, kept: plan.summary.kept, unmatched: plan.summary.unmatched,
          skipped: plan.summary.skipped, overwritten, decreased: decreased.length,
        },
        blank: blanks.map((r) => ({
          row: r.row, mssv: r.studentMssv!, name: r.studentName!, reason: r.blankReason!, label: BLANK_LABELS[r.blankReason!], kept: r.action === 'kept',
        })),
      };
    });
  }
}
