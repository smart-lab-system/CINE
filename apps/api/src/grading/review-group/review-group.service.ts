import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ExamSessionService } from '../../exam-session/exam-session.service';
import type { BreakdownError } from '../scoring/score-core';
import { groupResults } from './review-group';
import type { ReviewGroup } from './review-group.types';

type StoredError = Pick<BreakdownError, 'ruleId' | 'ruleKey' | 'source'>;

/**
 * Đọc nhóm bài để duyệt nhanh theo lỗi (spec 2026-10-21 §5.4): chỉ đọc, không ghi gì. Xác nhận hàng loạt là một
 * đường riêng, và nó tự kiểm lại từng bài dưới khoá; danh sách nhóm ở đây chỉ là thứ giảng viên nhìn thấy.
 */
@Injectable()
export class ReviewGroupService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly examSessions: ExamSessionService,
  ) {}

  /**
   * Nhóm bài của MỘT phiên của người gọi. Kiểm sở hữu bằng đúng hàm các route `exam-sessions/:id/*` khác dùng
   * (`findEntityForOwner`: không có phiên → 404, phiên người khác → 403), TRƯỚC mọi câu đọc bài.
   *
   * Bài được gom: `flagged_for_review`, pipeline `investigator`, và lượt tính MỚI NHẤT (`created_at DESC, id DESC`,
   * cùng luật với `latestComputationRow`) có điểm. Hai lớp bị để ngoài, vì nhóm `none` nghĩa là "hệ thống không tìm thấy
   * lỗi", không phải "hệ thống không chấm được":
   * - bài chưa có lượt tính nào (bài dưới sàn ngay từ lượt đầu không có dòng `score_computation`);
   * - bài dưới sàn: `ungradable_class` khác null, hoặc lượt tính mới nhất có điểm null (`breakdown.errors` của nó rỗng).
   * Các bài này vẫn hiện trong danh sách kết quả của phiên và được duyệt từng bài.
   */
  async listGroups(sessionId: string, teacherId: string): Promise<ReviewGroup[]> {
    const session = await this.examSessions.findEntityForOwner(sessionId, teacherId);

    const rows: { resultId: string; errors: StoredError[] }[] = await this.ds.query(
      `SELECT g.id AS "resultId", last.breakdown -> 'errors' AS errors
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
        CROSS JOIN LATERAL (
              SELECT c.score, c.breakdown
                FROM examcollect.score_computation c
               WHERE c.grading_result_id = g.id
               ORDER BY c.created_at DESC, c.id DESC
               LIMIT 1) last
        WHERE s.exam_session_id = $1
          AND g.status = 'flagged_for_review'
          AND g.pipeline = 'investigator'
          AND g.ungradable_class IS NULL
          AND last.score IS NOT NULL
        ORDER BY g.id`,
      [session.id],
    );

    const groups = groupResults(
      rows.map((r) => ({ resultId: r.resultId, errors: r.errors.map((e) => ({ ruleId: e.ruleId, source: e.source })) })),
    );

    const ruleIds = groups.flatMap((g) => (g.ruleId === null ? [] : [g.ruleId]));
    if (ruleIds.length === 0) return groups;

    // Tên và mô tả từ bản sửa HIỆN HÀNH của luật — cùng phép nối mà hồ sơ một bài dùng cho `ruleName`
    // (`scoring/result-detail.ts`). Thiếu dòng luật thì rơi về `ruleKey` đã lưu trong lượt tính, như ở đó.
    const ruleRows: { id: string; name: string; description: string }[] = await this.ds.query(
      `SELECT r.id, v.name, v.description
         FROM examcollect.error_rule r
         JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
        WHERE r.id = ANY($1::uuid[])`,
      [ruleIds],
    );
    const rules = new Map(ruleRows.map((r) => [r.id, r]));
    const ruleKeys = new Map(rows.flatMap((r) => r.errors.map((e) => [e.ruleId, e.ruleKey] as const)));

    return groups.map((g) => {
      if (g.ruleId === null) return g;
      const rule = rules.get(g.ruleId);
      return {
        ...g,
        label: rule?.name ?? ruleKeys.get(g.ruleId) ?? g.ruleId,
        description: rule?.description ?? null,
      };
    });
  }
}
