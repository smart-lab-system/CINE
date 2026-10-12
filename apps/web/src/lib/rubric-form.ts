import type { Rubric } from './api/grading';
import { formatVnPoints } from './format';

/**
 * Logic thuần của hộp thoại rubric (spec §3.1, khối "Trần điểm theo tiêu chí"). Giới hạn phản chiếu
 * `apps/api/src/grading/dto/rubric.dto.ts`: server vẫn là bên quyết định, form chỉ báo sớm.
 *
 * Điều quan trọng nhất ở file này: lưu rubric LUÔN tạo một phiên bản mới, và server sinh lại `key` từ mô tả
 * cho tiêu chí nào không gửi kèm `key`. Luật lỗi trỏ tiêu chí bằng `key` — nên một tiêu chí CÓ SẴN phải gửi
 * lại đúng key cũ của nó, nếu không sửa một câu mô tả sẽ âm thầm cắt liên kết luật → tiêu chí.
 *
 * `totalPoints` và `courseName` chỉ sống ở form (UI): không gửi lên API, không đổi schema.
 */

export interface CriterionRow {
  /** Định danh phía client cho React (tiêu chí có sẵn dùng id của nó; hàng mới dùng id tự cấp). */
  id: string;
  key: string;
  /** Tiêu chí đã có ở phiên bản đang sửa — key của nó cố định, không gõ được. */
  existing: boolean;
  description: string;
  /** Trần điểm như người dùng gõ ("2,5"). */
  maxPoints: string;
}

export interface RubricRowErrors {
  description?: string;
  maxPoints?: string;
  key?: string;
}

export interface RubricErrors {
  name?: string;
  courseName?: string;
  totalPoints?: string;
  general?: string;
  rows: Record<string, RubricRowErrors>;
}

export interface RubricFormMeta {
  name: string;
  nameEditable: boolean;
  existingNames: string[];
  /** Ô "Tổng điểm" trên form — trần cho tổng điểm tối đa các tiêu chí. Mặc định UI: 10. */
  totalPoints: string;
  /** Tạo trống: bắt buộc chọn môn (chỉ UI, không lưu). */
  courseRequired?: boolean;
  courseName?: string;
}

const KEY = /^[a-z0-9_]{1,64}$/;
const CAP_ERROR = 'Điểm tối đa: từ 0,25 đến 100, tối đa hai chữ số lẻ.';
const TOTAL_ERROR = 'Tổng điểm: từ 0,25 đến 100, tối đa hai chữ số lẻ.';

export function rowsFromRubric(rubric: Rubric): CriterionRow[] {
  return rubric.criteria.map((c) => ({
    id: c.id,
    key: c.key,
    existing: true,
    description: c.description,
    maxPoints: String(c.maxPoints),
  }));
}

export function newRow(id: string): CriterionRow {
  return { id, key: '', existing: false, description: '', maxPoints: '1' };
}

/** "2,5" / "2.5" → 2.5; ngoài 0,25–100 hoặc quá hai chữ số lẻ → null. */
export function parseCap(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  return n >= 0.25 && n <= 100 ? n : null;
}

/** Tổng điểm tối đa đã parse được của các hàng (hàng sai bỏ qua). */
export function sumCaps(rows: CriterionRow[]): number {
  let sum = 0;
  for (const row of rows) {
    const n = parseCap(row.maxPoints);
    if (n !== null) sum += n;
  }
  return Math.round(sum * 100) / 100;
}

export function validateRubric(meta: RubricFormMeta, rows: CriterionRow[]): RubricErrors {
  const errors: RubricErrors = { rows: {} };
  const rowError = (id: string) => (errors.rows[id] ??= {});

  if (meta.nameEditable) {
    const name = meta.name.trim();
    if (name === '') errors.name = 'Đặt tên cho rubric.';
    else if (name.length > 200) errors.name = 'Tên tối đa 200 ký tự.';
    // Lưu cùng một tên là tạo phiên bản KẾ TIẾP của rubric đó và sinh lại key từ mô tả — đúng cái bẫy mà
    // form này tồn tại để tránh. Muốn sửa rubric có sẵn thì chọn nó rồi bấm "Sửa tiêu chí & điểm tối đa".
    else if (meta.existingNames.includes(name)) {
      errors.name = 'Đã có rubric tên này — chọn nó ở trên rồi bấm “Sửa tiêu chí & điểm tối đa” thay vì tạo lại.';
    }
  }

  if (meta.courseRequired && (meta.courseName ?? '').trim() === '') {
    errors.courseName = 'Chọn môn học.';
  }

  const total = parseCap(meta.totalPoints);
  if (total === null) errors.totalPoints = TOTAL_ERROR;

  if (rows.length === 0) errors.general = 'Rubric cần ít nhất một tiêu chí.';
  else if (rows.length > 30) errors.general = 'Tối đa 30 tiêu chí — nhiều hơn thì không ai rà nổi.';

  const seen = new Map<string, string>();
  let capsOk = true;
  for (const row of rows) {
    const description = row.description.trim();
    if (description.length < 3 || description.length > 1000) {
      rowError(row.id).description = 'Mô tả tiêu chí: 3–1000 ký tự.';
    }
    if (parseCap(row.maxPoints) === null) {
      rowError(row.id).maxPoints = CAP_ERROR;
      capsOk = false;
    }

    const key = row.key.trim();
    if (!row.existing && key !== '' && !KEY.test(key)) {
      rowError(row.id).key = 'Khoá: chữ thường không dấu, số, "_", tối đa 64 ký tự.';
    }
    if (key !== '') {
      if (seen.has(key)) {
        if (!row.existing) rowError(row.id).key = 'Trùng khoá với một tiêu chí khác.';
        else rowError(seen.get(key)!).key = 'Trùng khoá với một tiêu chí khác.';
      } else seen.set(key, row.id);
    }
  }

  // Trần UI: tổng điểm tối đa các tiêu chí không được vượt tổng điểm — không gửi field này lên server.
  if (errors.general === undefined && total !== null && capsOk) {
    const sum = sumCaps(rows);
    if (sum > total) {
      errors.general = `Tổng điểm tối đa các tiêu chí (${formatVnPoints(sum)}) vượt quá tổng điểm (${formatVnPoints(total)}).`;
    }
  }

  return errors;
}

export function hasErrors(errors: RubricErrors): boolean {
  return (
    errors.name !== undefined ||
    errors.courseName !== undefined ||
    errors.totalPoints !== undefined ||
    errors.general !== undefined ||
    Object.keys(errors.rows).length > 0
  );
}

/**
 * Thân POST /rubrics. Tiêu chí CÓ SẴN gửi lại key gốc; tiêu chí mới gửi key đã gõ, hoặc BỎ HẲN khoá `key`
 * khi để trống để server tự sinh.
 */
export function buildSaveInput(
  name: string,
  rows: CriterionRow[],
): { name: string; criteria: { description: string; maxPoints: number; key?: string }[] } {
  return {
    name: name.trim(),
    criteria: rows.map((row) => {
      const criterion: { description: string; maxPoints: number; key?: string } = {
        description: row.description.trim(),
        maxPoints: parseCap(row.maxPoints) as number,
      };
      const key = row.key.trim();
      if (key !== '') criterion.key = key;
      return criterion;
    }),
  };
}

/** Khoá của tiêu chí có sẵn mà bản mới không còn — lỗi gắn với chúng sẽ thành lỗi mồ côi (cần chuyển sang tiêu chí khác). */
export function removedKeys(original: Rubric | undefined, rows: CriterionRow[]): string[] {
  if (!original) return [];
  const kept = new Set(rows.filter((r) => r.existing).map((r) => r.key));
  return original.criteria.map((c) => c.key).filter((key) => !kept.has(key));
}
