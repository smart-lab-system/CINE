/**
 * Dựng dòng áp dụng và giá của chúng từ mô hình cũ (luật mang `criterion_key` ở bản sửa hiện hành,
 * giá ở `rule_price`). Dùng ở HAI nơi: migration `RubricErrors1789550000000` (`$1 = NULL` → mọi giảng
 * viên) và test (`$1 = một giảng viên`). Idempotent: chạy lại không đổi gì.
 *
 * Quy tắc (spec §6): luật `active` thuộc rubric N của cùng giảng viên khi MỘT phiên bản nào đó của N
 * có tiêu chí cùng khoá — đúng tập (luật, rubric) mà tính điểm hôm nay thực sự áp.
 */
export const BACKFILL_ASSIGNMENTS_SQL = `
  INSERT INTO examcollect.rubric_error (teacher_id, rubric_name, error_rule_id, criterion_key)
  SELECT DISTINCT r.teacher_id, rb.name, r.id, v.criterion_key
    FROM examcollect.error_rule r
    JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
    JOIN examcollect.rubric rb ON rb.teacher_id = r.teacher_id
    JOIN examcollect.rubric_criterion rc ON rc.rubric_id = rb.id AND rc.key = v.criterion_key
   WHERE r.state = 'active' AND v.criterion_key IS NOT NULL
     AND ($1::uuid IS NULL OR r.teacher_id = $1)
  ON CONFLICT (teacher_id, rubric_name, error_rule_id) DO NOTHING`;

/** Chép MỌI phiên bản giá — phiên đã chốt (ghim phiên bản cũ) vẫn đọc được giá cũ qua bảng mới. */
export const BACKFILL_PRICES_SQL = `
  INSERT INTO examcollect.rubric_error_price (price_table_version_id, rubric_error_id, teacher_id, deduction)
  SELECT p.price_table_version_id, re.id, p.teacher_id, p.deduction
    FROM examcollect.rule_price p
    JOIN examcollect.rubric_error re ON re.error_rule_id = p.error_rule_id AND re.teacher_id = p.teacher_id
   WHERE ($1::uuid IS NULL OR p.teacher_id = $1)
  ON CONFLICT (price_table_version_id, rubric_error_id) DO NOTHING`;
