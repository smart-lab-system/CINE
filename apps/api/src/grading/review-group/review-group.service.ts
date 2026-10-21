import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ExamSessionService } from '../../exam-session/exam-session.service';
import { groupRows, loadGroupedRows } from './review-group.query';
import type { ReviewGroup } from './review-group.types';

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
   * Bài được gom và hai lớp bị để ngoài (chưa có lượt tính, dưới sàn): xem `loadGroupedRows`, câu đọc dùng chung với
   * xác nhận hàng loạt. Các bài bị để ngoài vẫn hiện trong danh sách kết quả của phiên và được duyệt từng bài.
   */
  async listGroups(sessionId: string, teacherId: string): Promise<ReviewGroup[]> {
    const session = await this.examSessions.findEntityForOwner(sessionId, teacherId);

    const stored = await loadGroupedRows(this.ds, session.id);
    const groups = groupRows(stored);

    // Không trùng: một luật ở hai phiên bản rubric là hai nhóm nhưng một dòng luật.
    const ruleIds = [...new Set(groups.flatMap((g) => (g.ruleId === null ? [] : [g.ruleId])))];
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
    const ruleKeys = new Map(stored.flatMap((r) => r.errors.map((e) => [e.ruleId, e.ruleKey] as const)));

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
