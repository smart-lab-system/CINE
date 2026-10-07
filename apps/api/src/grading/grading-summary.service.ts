import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Một phiên trong bảng tóm tắt chấm điểm — nguồn của trang danh sách phiên chấm.
 * Mirror ở apps/web/src/lib/api/grading.ts.
 */
export interface GradingSessionSummary {
  examSessionId: string;
  /** Số `grading_result` theo `status`; chỉ chứa trạng thái có ít nhất một dòng. */
  byStatus: Record<string, number>;
  /**
   * Trong `flagged_for_review`: số bài có `ungradable_reason` (không chấm được).
   * Phần còn lại của `flagged_for_review` là "cần bạn xem" — cùng phép chia của `stateOf` ở web.
   */
  ungradable: number;
  /** Đã chỉ định đề bài — điều kiện bắt buộc để bắt đầu chấm (spec UI §3.7). */
  hasQuestion: boolean;
}

/** Hàng thô: mọi COUNT về đây dưới dạng string ở một số kiểu, nên `n`/`ungradable` nhận cả hai. */
export interface SummaryRawRow {
  exam_session_id: string;
  status: string | null;
  n: number | string | null;
  ungradable: number | string | null;
  has_question: boolean;
}

/**
 * Gộp các hàng (phiên × trạng thái) thành một mục cho mỗi phiên. Hàm thuần: bài test của nó
 * không cần DB, và phép gộp là chỗ dễ sai nhất (phiên chưa có kết quả nào vẫn phải có mục).
 */
export function foldSummaryRows(rows: SummaryRawRow[]): GradingSessionSummary[] {
  const bySession = new Map<string, GradingSessionSummary>();
  for (const row of rows) {
    let item = bySession.get(row.exam_session_id);
    if (!item) {
      item = { examSessionId: row.exam_session_id, byStatus: {}, ungradable: 0, hasQuestion: row.has_question };
      bySession.set(row.exam_session_id, item);
    }
    if (row.status === null) {
      continue;
    }
    const n = Number(row.n ?? 0);
    if (n > 0) {
      item.byStatus[row.status] = (item.byStatus[row.status] ?? 0) + n;
    }
    item.ungradable += Number(row.ungradable ?? 0);
  }
  return [...bySession.values()];
}

/**
 * Tóm tắt chấm điểm của MỌI phiên của một giảng viên trong MỘT truy vấn.
 *
 * Tách khỏi `SubmissionOverviewService` có chủ đích: overview là một CTE lớn của luồng THU BÀI
 * và phục vụ cả trang Bài thu; số liệu chấm thuộc module chấm điểm (CLAUDE.md: hai luồng, hai
 * module). Không có route này, 20 phiên là 20 lần gọi `grading-progress`.
 */
@Injectable()
export class GradingSummaryService {
  constructor(private readonly dataSource: DataSource) {}

  async summarizeForTeacher(teacherId: string): Promise<GradingSessionSummary[]> {
    // Tên schema đến từ cấu hình (DATABASE_SCHEMA), không phải từ caller — nội suy là an toàn.
    const schema = (this.dataSource.options as { schema?: string }).schema ?? 'examcollect';
    const rows: SummaryRawRow[] = await this.dataSource.query(
      `
      WITH res AS (
        SELECT sub.exam_session_id,
               g.status::text AS status,
               COUNT(*)::int AS n,
               -- Cùng phép phân loại với stateOf ở web: chỉ dòng flagged_for_review MANG lý do mới là
               -- "không chấm được"; ungradable_reason ở trạng thái khác không được tính.
               COUNT(*) FILTER (
                 WHERE g.status = 'flagged_for_review' AND g.ungradable_reason IS NOT NULL
               )::int AS ungradable
        FROM ${schema}.grading_result g
        JOIN ${schema}.submission sub ON sub.id = g.submission_id
        JOIN ${schema}.exam_session s ON s.id = sub.exam_session_id
        WHERE s.teacher_id = $1
        GROUP BY sub.exam_session_id, g.status
      )
      SELECT s.id AS exam_session_id,
             r.status, r.n, r.ungradable,
             (ref.question_material_id IS NOT NULL) AS has_question
      FROM ${schema}.exam_session s
      -- LEFT: phiên chưa có kết quả nào (và chưa có tài liệu chấm) vẫn phải có mặt trong kết quả.
      LEFT JOIN res r ON r.exam_session_id = s.id
      LEFT JOIN ${schema}.grading_reference ref ON ref.exam_session_id = s.id
      WHERE s.teacher_id = $1
      `,
      [teacherId],
    );
    return foldSummaryRows(rows);
  }
}
