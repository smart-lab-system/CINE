import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/**
 * Co giãn tiêu chí của rubric mẫu sang điểm của một câu (P1b, 5.1). Đơn vị: phần trăm điểm.
 *
 * Mỗi mục lấy phần theo tỉ lệ rồi làm tròn xuống; phần dư do làm tròn dồn vào mục cuối. Nhờ vậy tổng tiêu chí
 * luôn bằng điểm câu ngay từ cấu trúc, và kết quả là tất định. Hàm thuần: không DB.
 */
export function scaleCriteriaHundredths(sampleHundredths: number[], targetHundredths: number): number[] {
  const total = sampleHundredths.reduce((s, h) => s + h, 0);
  if (sampleHundredths.length === 0 || total <= 0) {
    throw new Error('rubric mẫu chưa có tiêu chí có điểm');
  }
  const out: number[] = [];
  let used = 0;
  for (let j = 0; j < sampleHundredths.length - 1; j += 1) {
    const h = Math.floor((sampleHundredths[j] * targetHundredths) / total);
    out.push(h);
    used += h;
  }
  out.push(targetHundredths - used);
  return out;
}

/**
 * Điểm trừ của một lỗi theo tỉ lệ điểm câu: `deduction × (điểm câu / tổng mẫu)`, làm tròn về 2 chữ số thập phân
 * (cột `numeric(6,2)`). Tính bằng số nguyên phần trăm để không sai số dấu phẩy động.
 */
export function scaleDeduction(deduction: string, targetHundredths: number, templateTotalHundredths: number): string {
  const d100 = Math.round(Number(deduction) * 100);
  return (Math.round((d100 * targetHundredths) / templateTotalHundredths) / 100).toFixed(2);
}

export interface QuestionRubricInput {
  teacherId: string;
  templateRubricId: string;
  /** Mã phiên, đưa vào tên rubric mới: `rubric_error` khoá theo tên, nên hai phiên không được trùng tên. */
  sessionCode: string;
  ordinal: number;
  pointsHundredths: number;
}

/**
 * Sinh rubric riêng cho một câu (P1b, 5.1): sao chép tiêu chí của rubric mẫu với điểm đã co giãn; sao chép các dòng
 * lỗi (`rubric_error`) sang tên rubric mới; và sao chép giá của phiên bản bảng giá MỚI NHẤT với điểm trừ đã co giãn.
 *
 * Tên rubric mới có dạng `<tên mẫu> — <mã phiên> — Câu i`, khác với quy ước `<tên> — Câu i` đã duyệt, vì
 * `rubric_error` khoá theo tên (không theo phiên): hai phiên dùng chung một rubric mẫu mà trùng tên sẽ dùng chung
 * dòng lỗi và giá. Giá của các phiên bản bảng giá cũ hơn không được sao chép.
 */
export async function cloneRubricForQuestion(m: EntityManager, input: QuestionRubricInput): Promise<string> {
  const [tpl] = await m.query(`SELECT name, teacher_id FROM examcollect.rubric WHERE id = $1`, [input.templateRubricId]);
  if (!tpl || (tpl.teacher_id as string) !== input.teacherId) {
    throw new BadRequestException('Rubric mẫu không thuộc giảng viên chủ phiên.');
  }
  const criteria: { key: string; description: string; sort_order: number; h: number }[] = await m.query(
    `SELECT key, description, sort_order, ROUND(max_points * 100)::int AS h
       FROM examcollect.rubric_criterion WHERE rubric_id = $1 ORDER BY sort_order, key`,
    [input.templateRubricId],
  );
  let scaled: number[];
  try {
    scaled = scaleCriteriaHundredths(
      criteria.map((c) => c.h),
      input.pointsHundredths,
    );
  } catch {
    throw new BadRequestException(`Rubric mẫu của phiên chưa có tiêu chí có điểm để tách cho câu ${input.ordinal}.`);
  }
  const templateTotal = criteria.reduce((s, c) => s + c.h, 0);

  const name = `${(tpl.name as string).slice(0, 120)} — ${input.sessionCode} — Câu ${input.ordinal}`;
  const [rubric] = await m.query(`INSERT INTO examcollect.rubric (teacher_id, name, version) VALUES ($1, $2, 1) RETURNING id`, [
    input.teacherId,
    name,
  ]);
  for (let j = 0; j < criteria.length; j += 1) {
    await m.query(
      `INSERT INTO examcollect.rubric_criterion (rubric_id, key, description, max_points, sort_order) VALUES ($1, $2, $3, $4, $5)`,
      [rubric.id, criteria[j].key, criteria[j].description, (scaled[j] / 100).toFixed(2), criteria[j].sort_order],
    );
  }

  const errors: { id: string; error_rule_id: string; criterion_key: string }[] = await m.query(
    `SELECT id, error_rule_id, criterion_key FROM examcollect.rubric_error
      WHERE teacher_id = $1 AND rubric_name = $2 AND removed_at IS NULL`,
    [input.teacherId, tpl.name],
  );
  const newErrorId = new Map<string, string>();
  for (const e of errors) {
    const [row] = await m.query(
      `INSERT INTO examcollect.rubric_error (teacher_id, rubric_name, error_rule_id, criterion_key) VALUES ($1, $2, $3, $4) RETURNING id`,
      [input.teacherId, name, e.error_rule_id, e.criterion_key],
    );
    newErrorId.set(e.id, row.id as string);
  }

  const [latest] = await m.query(
    `SELECT id FROM examcollect.price_table_version WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1`,
    [input.teacherId],
  );
  if (latest && errors.length > 0) {
    const prices: { rubric_error_id: string; deduction: string | null }[] = await m.query(
      `SELECT rubric_error_id, deduction FROM examcollect.rubric_error_price
        WHERE price_table_version_id = $1 AND rubric_error_id = ANY($2::uuid[])`,
      [latest.id, errors.map((e) => e.id)],
    );
    for (const p of prices) {
      const newId = newErrorId.get(p.rubric_error_id)!;
      const deduction = p.deduction === null ? null : scaleDeduction(p.deduction, input.pointsHundredths, templateTotal);
      await m.query(
        `INSERT INTO examcollect.rubric_error_price (price_table_version_id, rubric_error_id, teacher_id, deduction) VALUES ($1, $2, $3, $4)`,
        [latest.id, newId, input.teacherId, deduction],
      );
    }
  }
  return rubric.id as string;
}
