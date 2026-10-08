import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface ProposalItem {
  id: string;
  ruleKey: string;
  name: string;
  description: string;
  /** Số liệu CỦA RUBRIC được hỏi (hoặc của mọi rubric khi không lọc). */
  sightings: { sessions: { id: string; name: string }[]; results: number };
  /** Báo trước khi có bảng ghi nhận nơi thấy: không biết thấy ở đâu, hiện ở mọi rubric (spec §4.3). */
  legacy: boolean;
}

/** Lỗi AI đề xuất (`proposed`) kèm nơi thấy. Chưa duyệt thì chưa vào điểm — bị loại khỏi điểm (§2.1, T-RULE-1). */
@Injectable()
export class ProposalService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async list(teacherId: string, rubricName?: string): Promise<ProposalItem[]> {
    const rows: {
      id: string;
      rule_key: string;
      name: string;
      description: string;
      has_any: boolean;
      grading_result_id: string | null;
      session_id: string | null;
      session_name: string | null;
    }[] = await this.ds.query(
      `SELECT r.id, r.rule_key, v.name, v.description,
              EXISTS (SELECT 1 FROM examcollect.error_rule_sighting x WHERE x.error_rule_id = r.id) AS has_any,
              s.grading_result_id, s.exam_session_id AS session_id, es.name AS session_name
         FROM examcollect.error_rule r
         JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
         LEFT JOIN examcollect.error_rule_sighting s ON s.error_rule_id = r.id AND ($2::text IS NULL OR s.rubric_name = $2)
         LEFT JOIN examcollect.exam_session es ON es.id = s.exam_session_id
        WHERE r.teacher_id = $1 AND r.state = 'proposed'
          AND ($2::text IS NULL
               OR NOT EXISTS (SELECT 1 FROM examcollect.error_rule_sighting x WHERE x.error_rule_id = r.id)
               OR EXISTS (SELECT 1 FROM examcollect.error_rule_sighting x WHERE x.error_rule_id = r.id AND x.rubric_name = $2))
        ORDER BY r.created_at, r.rule_key, es.name`,
      [teacherId, rubricName ?? null],
    );
    const byRule = new Map<string, ProposalItem & { _results: Set<string>; _sessions: Map<string, string> }>();
    for (const r of rows) {
      let item = byRule.get(r.id);
      if (!item) {
        item = {
          id: r.id,
          ruleKey: r.rule_key,
          name: r.name,
          description: r.description,
          legacy: !r.has_any,
          sightings: { sessions: [], results: 0 },
          _results: new Set(),
          _sessions: new Map(),
        };
        byRule.set(r.id, item);
      }
      if (r.grading_result_id) item._results.add(r.grading_result_id);
      if (r.session_id) item._sessions.set(r.session_id, r.session_name ?? '');
    }
    return [...byRule.values()].map(({ _results, _sessions, ...item }) => ({
      ...item,
      sightings: { results: _results.size, sessions: [..._sessions].map(([id, name]) => ({ id, name })) },
    }));
  }
}
