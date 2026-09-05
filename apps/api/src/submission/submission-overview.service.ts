import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { SessionOverviewItem } from './submission-overview.types';

/** Hàng thô từ Postgres: mọi COUNT/SUM về đây dưới dạng string. */
interface OverviewRawRow {
  id: string;
  name: string;
  code: string;
  course_id: string;
  course_name: string;
  class_id: string | null;
  class_name: string | null;
  room_name: string;
  exam_type: string;
  start_time: Date;
  end_time: Date;
  status: string;
  required_count: string | null;
  roster_size: string | null;
  expected_count: string | null;
  fully_submitted: string | null;
  partial: string | null;
  attended_no_submission: string | null;
  never_attended: string | null;
  invalid_file_count: string | null;
  semester_id: string;
  semester_name: string;
  archived_at: Date | null;
  rubric_id: string | null;
  rubric_version: number | string | null;
  attention_closed_at: Date | null;
}

/**
 * "Quản lý bài thu" — roll-up mọi phiên của một giảng viên trong MỘT truy vấn.
 *
 * Tách khỏi SubmissionService có chủ đích: file đó lo vòng đời upload/confirm/
 * storage, còn đây là một câu đọc thuần. Xem spec §3.3 để hiểu vì sao truy vấn
 * BẮT BUỘC pre-aggregate bằng CTE thay vì join thô rồi GROUP BY.
 */
@Injectable()
export class SubmissionOverviewService {
  constructor(private readonly dataSource: DataSource) {}

  async overviewForTeacher(teacherId: string): Promise<SessionOverviewItem[]> {
    // Tên schema đến từ cấu hình (DATABASE_SCHEMA), không phải từ caller —
    // nội suy thẳng là an toàn, và cần thiết vì identifier không tham số hoá được.
    const schema = (this.dataSource.options as { schema?: string }).schema ?? 'examcollect';

    const rows: OverviewRawRow[] = await this.dataSource.query(
      `
      WITH deliv AS (
        SELECT exam_session_id, COUNT(*) AS required_count
        FROM ${schema}.required_deliverable
        GROUP BY exam_session_id
      ),
      roster_students AS (
        -- Khớp AttendanceService.buildView: enrollment khoá theo
        -- (course_id, home_class_id). class_id IS NULL -> roster rỗng.
        SELECT s.id AS exam_session_id, e.student_mssv
        FROM ${schema}.exam_session s
        JOIN ${schema}.enrollment e
          ON e.course_id = s.course_id
         AND e.home_class_id = s.class_id
        WHERE s.teacher_id = $1
      ),
      attended AS (
        -- Một dòng mỗi (phiên, SV từng kết nối). DISTINCT ở đây là thứ chặn
        -- fan-out: một sinh viên có hàng chục event connect/disconnect trong
        -- một phiên, và agent_connection_event là quan hệ một-nhiều THỨ TƯ
        -- của exam_session.
        SELECT DISTINCT a.exam_session_id, a.student_mssv
        FROM ${schema}.agent_connection_event a
        JOIN ${schema}.exam_session s ON s.id = a.exam_session_id
        WHERE s.teacher_id = $1
      ),
      per_student AS (
        -- TẦNG 1: một dòng mỗi (phiên, SV đã nộp gì đó).
        SELECT sub.exam_session_id,
               sub.student_mssv,
               COUNT(DISTINCT sub.required_deliverable_id)
                 FILTER (WHERE sub.status = 'collected') AS collected_files,
               COUNT(DISTINCT sub.id)
                 FILTER (WHERE sub.status = 'invalid')   AS invalid_files
        FROM ${schema}.submission sub
        JOIN ${schema}.exam_session s ON s.id = sub.exam_session_id
        WHERE s.teacher_id = $1
        GROUP BY sub.exam_session_id, sub.student_mssv
      ),
      universe AS (
        -- roster ∪ người đã nộp — bản SQL của buildSubmissionRows (§3.2).
        SELECT COALESCE(r.exam_session_id, p.exam_session_id) AS exam_session_id,
               COALESCE(p.collected_files, 0)                AS collected_files,
               COALESCE(p.invalid_files, 0)                   AS invalid_files,
               -- attended đã DISTINCT theo (phiên, SV), nên LEFT JOIN này khớp
               -- tối đa MỘT dòng: cùng grain, không nhân dòng.
               (att.student_mssv IS NOT NULL)                 AS ever_attended
        FROM roster_students r
        FULL OUTER JOIN per_student p
          ON p.exam_session_id = r.exam_session_id
         AND p.student_mssv    = r.student_mssv
        LEFT JOIN attended att
          ON att.exam_session_id = COALESCE(r.exam_session_id, p.exam_session_id)
         AND att.student_mssv    = COALESCE(r.student_mssv,    p.student_mssv)
      ),
      per_session AS (
        -- TẦNG 2: một dòng mỗi phiên.
        SELECT u.exam_session_id,
               COUNT(*) AS expected_count,
               COUNT(*) FILTER (
                 WHERE COALESCE(d.required_count, 0) > 0
                   AND u.collected_files >= COALESCE(d.required_count, 0)
               ) AS fully_submitted,
               COUNT(*) FILTER (
                 WHERE (u.collected_files > 0 OR u.invalid_files > 0)
                   AND u.collected_files < COALESCE(d.required_count, 0)
               ) AS partial,
               COUNT(*) FILTER (
                 WHERE u.collected_files = 0 AND u.invalid_files = 0
                   AND u.ever_attended
               ) AS attended_no_submission,
               COUNT(*) FILTER (
                 WHERE u.collected_files = 0 AND u.invalid_files = 0
                   AND NOT u.ever_attended
               ) AS never_attended,
               SUM(u.invalid_files) AS invalid_file_count
        FROM universe u
        LEFT JOIN deliv d ON d.exam_session_id = u.exam_session_id
        GROUP BY u.exam_session_id
      ),
      roster_size AS (
        SELECT exam_session_id, COUNT(*) AS roster_size
        FROM roster_students
        GROUP BY exam_session_id
      )
      SELECT s.id, s.name, s.code,
             s.course_id, c.name AS course_name,
             s.class_id,  cl.name AS class_name,
             rm.name AS room_name,
             s.exam_type, s.start_time, s.end_time, s.status,
             s.archived_at, s.attention_closed_at,
             s.rubric_id, rb.version AS rubric_version,
             sem.id AS semester_id, sem.name AS semester_name,
             d.required_count,
             rs.roster_size,
             ps.expected_count, ps.fully_submitted, ps.partial,
             ps.attended_no_submission, ps.never_attended, ps.invalid_file_count
      FROM ${schema}.exam_session s
      JOIN      ${schema}.course c  ON c.id  = s.course_id
      -- course.semester_id là NOT NULL, nên JOIN thường không bỏ sót phiên nào.
      JOIN      ${schema}.semester sem ON sem.id = c.semester_id
      LEFT JOIN ${schema}.class  cl ON cl.id = s.class_id
      -- LEFT, không phải JOIN: phiên chưa gắn rubric PHẢI còn trong kết quả.
      -- Đổi thành JOIN thường là âm thầm giấu mất bài thi thật (§5.3).
      LEFT JOIN ${schema}.rubric rb ON rb.id = s.rubric_id
      JOIN      ${schema}.room   rm ON rm.id = s.room_id
      LEFT JOIN deliv       d  ON d.exam_session_id  = s.id
      LEFT JOIN per_session ps ON ps.exam_session_id = s.id
      LEFT JOIN roster_size rs ON rs.exam_session_id = s.id
      WHERE s.teacher_id = $1
      ORDER BY s.start_time DESC
      `,
      [teacherId],
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      courseId: row.course_id,
      courseName: row.course_name,
      classId: row.class_id,
      className: row.class_name,
      roomName: row.room_name,
      examType: row.exam_type as SessionOverviewItem['examType'],
      startTime: new Date(row.start_time).toISOString(),
      endTime: new Date(row.end_time).toISOString(),
      status: row.status as SessionOverviewItem['status'],
      rubricId: row.rubric_id,
      // Number(): node-postgres trả integer dạng string ở một số kiểu, theo
      // đúng quy ước đã áp dụng cho mọi con số khác trong file này.
      rubricVersion: row.rubric_version === null ? null : Number(row.rubric_version),
      requiredDeliverableCount: toCount(row.required_count),
      expectedCount: toCount(row.expected_count),
      rosterKnown: toCount(row.roster_size) > 0,
      fullySubmittedCount: toCount(row.fully_submitted),
      partialCount: toCount(row.partial),
      attendedNoSubmissionCount: toCount(row.attended_no_submission),
      neverAttendedCount: toCount(row.never_attended),
      invalidFileCount: toCount(row.invalid_file_count),
      semesterId: row.semester_id,
      semesterName: row.semester_name,
      archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
      attentionClosedAt: row.attention_closed_at
        ? new Date(row.attention_closed_at).toISOString()
        : null,
    }));
  }
}

/** bigint/numeric của Postgres về đây là string; NULL là "chưa có dòng nào". */
function toCount(value: string | null): number {
  return value === null ? 0 : Number(value);
}
