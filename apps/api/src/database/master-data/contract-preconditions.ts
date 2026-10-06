/** Chỉ cần `query` — cả `DataSource`, `QueryRunner` lẫn một đối tượng giả trong test đều thoả. */
export interface Queryable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(sql: string, params?: unknown[]): Promise<any>;
}

export interface ContractCounts {
  classesWithoutSemester: number;
  classesWithoutAdministrativeClass: number;
  sessionsWithoutRoom: number;
  enrollmentsWithoutStudent: number;
}

/**
 * Bốn con số quyết định migration thu hẹp có chạy được không — và cũng là phần "còn thiếu" mà backfill báo cuối lần chạy. MỘT câu truy vấn dùng chung cho
 * backfill, `verify` và migration, để "backfill xong" và "thu hẹp được phép" không bao giờ nói hai điều khác nhau. `classIds` giới hạn phạm vi (test/diễn tập
 * có phạm vi); không truyền thì đếm toàn bộ.
 */
export async function countContractBlockers(db: Queryable, classIds?: readonly string[]): Promise<ContractCounts> {
  const scope = classIds ? [...classIds] : null;
  const [row] = await db.query(
    `SELECT
       (SELECT count(*)::int FROM examcollect.class c
         WHERE c.semester_id IS NULL AND ($1::uuid[] IS NULL OR c.id = ANY($1::uuid[]))) AS "classesWithoutSemester",
       (SELECT count(*)::int FROM examcollect.class c
         WHERE c.administrative_class_id IS NULL AND ($1::uuid[] IS NULL OR c.id = ANY($1::uuid[]))) AS "classesWithoutAdministrativeClass",
       (SELECT count(*)::int FROM examcollect.exam_session es
         WHERE es.room_id IS NULL AND ($1::uuid[] IS NULL OR es.class_id = ANY($1::uuid[]))) AS "sessionsWithoutRoom",
       (SELECT count(*)::int FROM examcollect.enrollment e
         WHERE NOT EXISTS (SELECT 1 FROM examcollect.student s WHERE s.mssv = e.student_mssv)
           AND ($1::uuid[] IS NULL OR e.home_class_id = ANY($1::uuid[]))) AS "enrollmentsWithoutStudent"`,
    [scope],
  );
  return row as ContractCounts;
}

/** Câu báo cho từng thứ còn dở; rỗng = được phép thu hẹp. Thu hẹp DỪNG ở đây, không đoán và không "tạm gán". */
export function contractProblems(counts: ContractCounts): string[] {
  const out: string[] = [];
  if (counts.classesWithoutSemester > 0) out.push(`Còn ${counts.classesWithoutSemester} lớp chưa có học kỳ — chạy lại backfill (hoặc gán tay) trước.`);
  if (counts.classesWithoutAdministrativeClass > 0) {
    out.push(`Còn ${counts.classesWithoutAdministrativeClass} lớp chưa có lớp danh nghĩa — chạy lại backfill (hoặc gán tay) trước.`);
  }
  if (counts.sessionsWithoutRoom > 0) out.push(`Còn ${counts.sessionsWithoutRoom} phiên thi chưa gắn phòng trong danh mục — chạy lại backfill trước.`);
  if (counts.enrollmentsWithoutStudent > 0) {
    out.push(`Còn ${counts.enrollmentsWithoutStudent} enrollment chưa có hàng sinh viên tương ứng — chạy lại backfill trước.`);
  }
  return out;
}
