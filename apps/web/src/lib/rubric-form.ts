import type { Rubric } from './api/grading';

/**
 * Logic thuần của hộp thoại rubric (spec §3.1, khối "Trần điểm theo tiêu chí"). Giới hạn phản chiếu
 * `apps/api/src/grading/dto/rubric.dto.ts`: server vẫn là bên quyết định, form chỉ báo sớm.
 *
 * Điều quan trọng nhất ở file này: lưu rubric LUÔN tạo một phiên bản mới, và server sinh lại `key` từ mô tả
 * cho tiêu chí nào không gửi kèm `key`. Luật lỗi trỏ tiêu chí bằng `key` — nên một tiêu chí CÓ SẴN phải gửi
 * lại đúng key cũ của nó, nếu không sửa một câu mô tả sẽ âm thầm cắt liên kết luật → tiêu chí.
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
  general?: string;
  rows: Record<string, RubricRowErrors>;
}

const KEY = /^[a-z0-9_]{1,64}$/;
const CAP_ERROR = 'Trần điểm: từ 0,25 đến 100, tối đa hai chữ số lẻ.';

/** Tiêu chí của các bản rubric ĐANG DÙNG, mỗi khoá một lần (cùng khoá ở hai rubric thì lấy bản gặp trước). */
export function activeCriteria(rubrics: Rubric[] | undefined): { key: string; description: string; max: number }[] {
  const seen = new Map<string, { key: string; description: string; max: number }>();
  for (const rubric of rubrics ?? []) {
    if (!rubric.isActive) continue;
    for (const c of rubric.criteria) {
      if (!seen.has(c.key)) seen.set(c.key, { key: c.key, description: c.description, max: c.maxPoints });
    }
  }
  return [...seen.values()];
}

/** Rubric đầu tiên có bản đang dùng (API sắp theo tên) — `RubricView` không có ngày tạo nên không suy ra "mới nhất". */
export function defaultRubricName(rubrics: Rubric[] | undefined): string | null {
  return rubrics?.find((r) => r.isActive)?.name ?? null;
}

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

export function validateRubric(
  meta: { name: string; nameEditable: boolean; existingNames: string[] },
  rows: CriterionRow[],
): RubricErrors {
  const errors: RubricErrors = { rows: {} };
  const rowError = (id: string) => (errors.rows[id] ??= {});

  if (meta.nameEditable) {
    const name = meta.name.trim();
    if (name === '') errors.name = 'Đặt tên cho rubric.';
    else if (name.length > 200) errors.name = 'Tên tối đa 200 ký tự.';
    // Lưu cùng một tên là tạo phiên bản KẾ TIẾP của rubric đó và sinh lại key từ mô tả — đúng cái bẫy mà
    // form này tồn tại để tránh. Muốn sửa rubric có sẵn thì chọn nó rồi bấm "Sửa trần".
    else if (meta.existingNames.includes(name)) {
      errors.name = 'Đã có rubric tên này — chọn nó ở trên rồi bấm "Sửa trần" thay vì tạo lại.';
    }
  }

  if (rows.length === 0) errors.general = 'Rubric cần ít nhất một tiêu chí.';
  else if (rows.length > 30) errors.general = 'Tối đa 30 tiêu chí — nhiều hơn thì không ai rà nổi.';

  const seen = new Map<string, string>();
  for (const row of rows) {
    const description = row.description.trim();
    if (description.length < 3 || description.length > 1000) {
      rowError(row.id).description = 'Mô tả tiêu chí: 3–1000 ký tự.';
    }
    if (parseCap(row.maxPoints) === null) rowError(row.id).maxPoints = CAP_ERROR;

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
  return errors;
}

export function hasErrors(errors: RubricErrors): boolean {
  return errors.name !== undefined || errors.general !== undefined || Object.keys(errors.rows).length > 0;
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

/** Khoá của tiêu chí có sẵn mà bản mới không còn — luật trỏ vào chúng sẽ báo "lệch tiêu chí". */
export function removedKeys(original: Rubric | undefined, rows: CriterionRow[]): string[] {
  if (!original) return [];
  const kept = new Set(rows.filter((r) => r.existing).map((r) => r.key));
  return original.criteria.map((c) => c.key).filter((key) => !kept.has(key));
}
