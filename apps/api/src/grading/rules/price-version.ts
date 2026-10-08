import { EntityManager } from 'typeorm';

/**
 * Một `price_table_version` MỚI của giảng viên, chép nguyên bảng giá phiên bản trước (§2.2) rồi ghi các
 * dòng đổi. Người gọi đã khoá giảng viên và đã kiểm mọi `rubricErrorId` thuộc giảng viên.
 * Dòng chưa từng có giá thì không có dòng (NULL tường minh chỉ ghi khi người gọi truyền `deduction: null`).
 */
export async function writeNextPriceVersion(
  m: EntityManager,
  teacherId: string,
  actorId: string,
  changes: { rubricErrorId: string; deduction: string | null }[],
): Promise<string> {
  const [{ next }] = await m.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM examcollect.price_table_version WHERE teacher_id = $1`,
    [teacherId],
  );
  const [v] = await m.query(
    `INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, $2, $3) RETURNING id`,
    [teacherId, next, actorId],
  );
  await m.query(
    `INSERT INTO examcollect.rubric_error_price (price_table_version_id, rubric_error_id, teacher_id, deduction)
     SELECT $1, p.rubric_error_id, p.teacher_id, p.deduction
       FROM examcollect.rubric_error_price p
       JOIN examcollect.price_table_version pv ON pv.id = p.price_table_version_id
      WHERE pv.teacher_id = $2 AND pv.version = $3 AND NOT (p.rubric_error_id = ANY($4::uuid[]))`,
    [v.id, teacherId, next - 1, changes.map((c) => c.rubricErrorId)],
  );
  for (const c of changes) {
    await m.query(
      `INSERT INTO examcollect.rubric_error_price (price_table_version_id, rubric_error_id, teacher_id, deduction) VALUES ($1, $2, $3, $4)`,
      [v.id, c.rubricErrorId, teacherId, c.deduction],
    );
  }
  return v.id as string;
}
