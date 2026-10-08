import { EntityManager } from 'typeorm';

/** `rule_key` sinh từ tên: bỏ dấu tiếng Việt (kể cả đ), chữ thường, gạch dưới; ≤ 60 ký tự để còn chỗ cho `_N`. */
export function slugifyRuleKey(name: string): string {
  const slug = name
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
    .replace(/_+$/g, '');
  return slug === '' ? 'loi_moi' : slug;
}

/** Khoá chưa dùng của giảng viên: `base`, rồi `base_2`, `base_3`… — giảng viên không bao giờ thấy 409 vì khoá họ chưa từng thấy. */
export async function uniqueRuleKey(m: EntityManager, teacherId: string, base: string): Promise<string> {
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? base : `${base}_${n}`;
    const [hit] = await m.query(`SELECT 1 FROM examcollect.error_rule WHERE teacher_id = $1 AND rule_key = $2`, [
      teacherId,
      candidate,
    ]);
    if (!hit) return candidate;
  }
  throw new Error('không sinh được khoá luật duy nhất');
}
