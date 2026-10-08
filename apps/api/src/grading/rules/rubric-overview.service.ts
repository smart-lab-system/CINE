import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface RubricOverview {
  rubricName: string;
  /** Phiên bản mới nhất — dùng cho đánh dấu tiêu chí và hộp thoại sửa. */
  rubricId: string;
  totalPoints: number;
  criteria: { key: string; description: string; maxPoints: number; errorCount: number; waiverId: string | null }[];
  errorCount: number;
  unpricedCount: number;
  /** Dòng áp dụng gắn tiêu chí không còn ở bản mới nhất (spec §2.3.4). */
  danglingCount: number;
  /** Lỗi AI đề xuất thấy ở rubric này + lỗi cũ chưa rõ nơi thấy. */
  proposalCount: number;
  sessions: { id: string; name: string; semesterName: string; state: 'not_started' | 'grading' | 'finalized'; resultCount: number }[];
  semesters: string[];
}

/** Một phần tử cho MỖI rubric (theo tên): nuôi ô chọn, trạng thái và dải việc cần làm (spec §4.1). */
@Injectable()
export class RubricOverviewService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async overview(teacherId: string): Promise<RubricOverview[]> {
    const versions: { id: string; name: string; version: number; created_at: Date }[] = await this.ds.query(
      `SELECT id, name, version, created_at FROM examcollect.rubric WHERE teacher_id = $1 ORDER BY name, version DESC`,
      [teacherId],
    );
    const latest = new Map<string, { id: string; created_at: Date }>();
    for (const v of versions) {
      const cur = latest.get(v.name);
      if (!cur || v.created_at > cur.created_at) latest.set(v.name, { id: v.id, created_at: v.created_at });
    }
    if (latest.size === 0) return [];
    const latestIds = [...latest.values()].map((l) => l.id);

    const criteria: { rubric_id: string; key: string; description: string; max_points: string }[] = await this.ds.query(
      `SELECT rubric_id, key, description, max_points FROM examcollect.rubric_criterion
        WHERE rubric_id = ANY($1::uuid[]) ORDER BY sort_order, created_at, key`,
      [latestIds],
    );
    const waivers: { id: string; rubric_id: string; criterion_key: string }[] = await this.ds.query(
      `SELECT id, rubric_id, criterion_key FROM examcollect.criterion_waiver WHERE rubric_id = ANY($1::uuid[]) AND revoked_at IS NULL`,
      [latestIds],
    );
    const apps: { rubric_name: string; criterion_key: string; deduction: string | null }[] = await this.ds.query(
      `SELECT re.rubric_name, re.criterion_key, p.deduction
         FROM examcollect.rubric_error re
         JOIN examcollect.error_rule r ON r.id = re.error_rule_id AND r.state = 'active'
         LEFT JOIN examcollect.rubric_error_price p ON p.rubric_error_id = re.id
          AND p.price_table_version_id = (SELECT id FROM examcollect.price_table_version WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1)
        WHERE re.teacher_id = $1 AND re.removed_at IS NULL`,
      [teacherId],
    );
    const sightingRows: { rubric_name: string; n: number }[] = await this.ds.query(
      `SELECT s.rubric_name, count(DISTINCT s.error_rule_id)::int AS n
         FROM examcollect.error_rule_sighting s
         JOIN examcollect.error_rule r ON r.id = s.error_rule_id AND r.state = 'proposed'
        WHERE s.teacher_id = $1 GROUP BY s.rubric_name`,
      [teacherId],
    );
    const [{ legacy }] = await this.ds.query(
      `SELECT count(*)::int AS legacy FROM examcollect.error_rule r
        WHERE r.teacher_id = $1 AND r.state = 'proposed'
          AND NOT EXISTS (SELECT 1 FROM examcollect.error_rule_sighting x WHERE x.error_rule_id = r.id)`,
      [teacherId],
    );
    const sessions: { id: string; name: string; semester_name: string; rubric_name: string; total: number; published: number }[] =
      await this.ds.query(
        `SELECT es.id, es.name, es.semester_name, rb.name AS rubric_name,
              count(g.id)::int AS total,
              count(g.id) FILTER (WHERE g.status IN ('finalized', 'exported'))::int AS published
         FROM examcollect.exam_session es
         JOIN examcollect.rubric rb ON rb.id = es.rubric_id
         LEFT JOIN examcollect.submission s ON s.exam_session_id = es.id
         LEFT JOIN examcollect.grading_result g ON g.submission_id = s.id
        WHERE es.teacher_id = $1
        GROUP BY es.id, es.name, es.semester_name, rb.name, es.start_time
        ORDER BY es.start_time DESC`,
        [teacherId],
      );

    const out: (RubricOverview & { _at: Date })[] = [];
    for (const [rubricName, { id, created_at }] of latest) {
      const crit = criteria.filter((c) => c.rubric_id === id);
      const keys = new Set(crit.map((c) => c.key));
      const mine = apps.filter((a) => a.rubric_name === rubricName);
      const rubricSessions = sessions
        .filter((s) => s.rubric_name === rubricName)
        .map((s) => ({
          id: s.id,
          name: s.name,
          semesterName: s.semester_name,
          state: (s.total === 0 ? 'not_started' : s.published === s.total ? 'finalized' : 'grading') as
            | 'not_started'
            | 'grading'
            | 'finalized',
          resultCount: s.total,
        }));
      out.push({
        _at: created_at,
        rubricName,
        rubricId: id,
        totalPoints: Math.round(crit.reduce((sum, c) => sum + Number(c.max_points), 0) * 100) / 100,
        criteria: crit.map((c) => ({
          key: c.key,
          description: c.description,
          maxPoints: Number(c.max_points),
          errorCount: mine.filter((a) => a.criterion_key === c.key).length,
          waiverId: waivers.find((w) => w.rubric_id === id && w.criterion_key === c.key)?.id ?? null,
        })),
        errorCount: mine.length,
        unpricedCount: mine.filter((a) => a.deduction === null).length,
        danglingCount: mine.filter((a) => !keys.has(a.criterion_key)).length,
        proposalCount: (sightingRows.find((s) => s.rubric_name === rubricName)?.n ?? 0) + legacy,
        sessions: rubricSessions,
        semesters: [...new Set(rubricSessions.map((s) => s.semesterName))],
      });
    }
    return out.sort((a, b) => b._at.getTime() - a._at.getTime()).map(({ _at, ...o }) => o);
  }
}
