import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ExamSessionService } from '../../exam-session/exam-session.service';
import { advanceStatus } from '../lifecycle/advance';
import { latestComputationRow, lockTeacherScoring } from '../scoring/score-inputs';
import { confirmVerdict, type ConfirmOutcome } from './review-group-confirm';
import { groupRows, loadGroupedRows } from './review-group.query';

export type { ConfirmOutcome, ConfirmSkipReason } from './review-group-confirm';

interface LockedRow {
  id: string;
  status: string;
  pipeline: string;
  ungradable_class: string | null;
}

/**
 * Xác nhận hàng loạt bài điều tra theo nhóm lỗi (spec duyệt nhanh 2026-10-21 §5.4): với mỗi bài đủ điều kiện, một dòng
 * `teacher_review` kind `system_confirm` — "giảng viên chấp nhận điểm của lượt tính này" — và bước chuyển
 * `flagged_for_review → teacher_reviewed`. `system_confirm` KHÔNG khoá bài khỏi lượt tính lại; chỉ `manual_score` khoá.
 */
@Injectable()
export class ReviewGroupConfirmService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly examSessions: ExamSessionService,
  ) {}

  /**
   * Cả lô trong MỘT giao dịch: một bài hỏng giữa chừng thì không bài nào được ghi.
   *
   * - Sở hữu: `findEntityForOwner`, như mọi route `exam-sessions/:id/*` (không có phiên → 404, phiên người khác → 403).
   * - Khoá: khoá lượt tính của giảng viên TRƯỚC mọi khoá dòng (luật thứ tự khoá, `teacher-lock.ts`), rồi mới dựng lại
   *   nhóm. Mọi đường ghi bài điều tra (lượt tính, chấm tay, kiểm mẫu, chấm lại) xếp hàng qua khoá này, nên nhóm dựng
   *   lại, trạng thái bài và lượt tính mới nhất mà dòng xác nhận trỏ tới là cùng một ảnh.
   * - Khoá nhóm phân giải bằng cách dựng lại nhóm của phiên bằng ĐÚNG câu đọc và hàm gom của danh sách nhóm
   *   (`loadGroupedRows` + `groupRows`), rồi so khoá — không tách chuỗi khoá. Không nhóm nào khớp → 404.
   * - `resultIds` (nếu có) lọc trong phạm vi đó: bài không thuộc phiên → 400 cả lô; bài đủ điều kiện nhưng nằm ở nhóm
   *   khác → 409 cả lô (giảng viên đang nhìn một nhóm đã đổi); bài không đủ điều kiện → `skipped` kèm lý do.
   */
  async confirmGroup(
    sessionId: string,
    teacherId: string,
    dto: { key: string; resultIds?: string[] },
  ): Promise<ConfirmOutcome> {
    const session = await this.examSessions.findEntityForOwner(sessionId, teacherId);

    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, session.teacherId);

      const group = groupRows(await loadGroupedRows(m, session.id)).find((g) => g.key === dto.key);
      if (!group) {
        throw new NotFoundException('Nhóm này không còn bài nào gắn cờ trong phiên — hãy tải lại danh sách nhóm.');
      }
      const members = new Set(group.resultIds);
      const requested = dto.resultIds ? [...new Set(dto.resultIds)] : group.resultIds;

      const rows = await this.lockRows(m, session.id, requested);
      if (rows.length !== requested.length) {
        throw new BadRequestException('Có bài không thuộc phiên thi này — không xác nhận gì cả.');
      }
      const manual = await this.withManualScore(m, requested);

      // Phân loại HẾT trước khi ghi: lô bị từ chối (409) thì không có câu ghi nào đã chạy.
      const toConfirm: { resultId: string; computationId: string }[] = [];
      const skipped: ConfirmOutcome['skipped'] = [];
      for (const row of rows) {
        const latest = await latestComputationRow(m, row.id);
        const verdict = confirmVerdict({
          status: row.status,
          pipeline: row.pipeline,
          ungradableClass: row.ungradable_class,
          hasManualScore: manual.has(row.id),
          latestComputation: latest ? { id: latest.id, score: latest.score } : null,
          inGroup: members.has(row.id),
        });
        if (verdict.kind === 'skip') skipped.push({ resultId: row.id, reason: verdict.reason });
        else if (verdict.kind === 'other_group') {
          throw new ConflictException('Có bài không còn thuộc nhóm này — hãy tải lại danh sách nhóm rồi xác nhận lại.');
        } else toConfirm.push({ resultId: row.id, computationId: verdict.computationId });
      }

      for (const { resultId, computationId } of toConfirm) {
        await this.writeConfirm(m, resultId, computationId, teacherId);
        // `false` = dòng không ở `flagged_for_review` dù đã khoá và vừa kiểm — ném để cả lô lùi, không ghi nửa chừng.
        if (!(await advanceStatus(m, resultId, ['flagged_for_review'], 'teacher_reviewed', { flagForReview: false }))) {
          throw new ConflictException('Một bài vừa đổi trạng thái — hãy tải lại và xác nhận lại.');
        }
      }

      return { confirmed: toConfirm.length, skipped };
    });
  }

  /** Khoá các dòng của ĐÚNG phiên, theo thứ tự id — cùng thứ tự `finalizeGrades` và duyệt hàng loạt khoá, không ôm chết. */
  private lockRows(m: EntityManager, sessionId: string, ids: string[]): Promise<LockedRow[]> {
    return m.query(
      `SELECT g.id, g.status, g.pipeline, g.ungradable_class
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
        WHERE s.exam_session_id = $1 AND g.id = ANY($2::uuid[])
        ORDER BY g.id
          FOR UPDATE OF g`,
      [sessionId, ids],
    );
  }

  private async withManualScore(m: EntityManager, ids: string[]): Promise<Set<string>> {
    const rows: { id: string }[] = await m.query(
      `SELECT DISTINCT grading_result_id AS id FROM examcollect.teacher_review
        WHERE grading_result_id = ANY($1::uuid[]) AND kind = 'manual_score'`,
      [ids],
    );
    return new Set(rows.map((r) => r.id));
  }

  /**
   * Dòng `system_confirm`. `final_score` chép từ CHÍNH dòng lượt tính trong cùng câu lệnh, nên bằng điểm của lượt tính
   * được trỏ tới theo cấu tạo (CHECK không so được hai bảng, migration `1789710000000`). `reviewed_at =
   * clock_timestamp()` như mọi dòng ghi sau khoá giảng viên (`ErrorExceptionService.writeReview`).
   */
  private async writeConfirm(m: EntityManager, resultId: string, computationId: string, teacherId: string): Promise<void> {
    const inserted: { id: string }[] = await m.query(
      `INSERT INTO examcollect.teacher_review
         (grading_result_id, teacher_id, final_score, kind, confirmed_computation_id, edited_criteria, reviewed_at)
       SELECT c.grading_result_id, $3, c.score, 'system_confirm', c.id, '[]'::jsonb, clock_timestamp()
         FROM examcollect.score_computation c
        WHERE c.id = $1 AND c.grading_result_id = $2 AND c.score IS NOT NULL
       RETURNING id`,
      [computationId, resultId, teacherId],
    );
    if (inserted.length !== 1) {
      throw new ConflictException('Lượt tính của một bài vừa đổi — hãy tải lại và xác nhận lại.');
    }
  }
}
