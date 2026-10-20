import type { TestBundleCase, TestBundleCaseInput } from '@/lib/api/test-bundle';

/**
 * Bản nháp phiên bản gói test (G2b-R, mock-up v2). Gói đã lưu là bất biến, nên "sửa" một ca nghĩa là dựng MỘT PHIÊN BẢN MỚI
 * từ các ca của phiên bản cũ rồi gửi cả danh sách qua route tạo gói. Toàn bộ logic ở đây thuần (không React, không mạng) để
 * mỗi luật có một test trực tiếp; component chỉ giữ state và vẽ.
 *
 * Hàm nào cũng trả mảng MỚI, không sửa mảng đầu vào.
 */

/** Khuôn `case_key` khớp CHECK của DB và `TestCaseDto` ở server. */
export const CASE_KEY_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_GROUP_CHARS = 100;
/** Trần `constraintQuote` của `TestCaseDto`; trích đề do hệ thống sinh có thể dài hơn (tới 4000). */
const MAX_QUOTE_CHARS = 2000;

/**
 * - `same`: giữ nguyên từ phiên bản gốc;
 * - `added` / `edited`: giảng viên thêm / sửa trong bản nháp này;
 * - `removed`: giảng viên bỏ trong bản nháp này (hoàn tác được);
 * - `dropped`: hệ thống đã bỏ ở phiên bản gốc — chỉ để hiện, KHÔNG bao giờ gửi đi (vắng mặt không có nghĩa là sống lại).
 */
export type RowState = 'same' | 'added' | 'edited' | 'removed' | 'dropped';

export interface CaseValues {
  caseKey: string;
  group: string;
  input: string;
  expectedOutput: string;
}

export interface DraftRow extends CaseValues {
  /** Trích đề HIỆN TẠI của ca. Sửa ca làm mất nó (đề không còn biện minh cho input mới). */
  constraintQuote: string | null;
  autoDroppedReason: string | null;
  state: RowState;
  /** Giá trị ở phiên bản gốc; null với ca thêm mới và ca hệ thống đã bỏ. */
  base: CaseValues | null;
  /** Trích đề GỐC, để trả lại khi giảng viên sửa rồi hoàn về đúng giá trị cũ (không mất trích đề vì một lần sửa thử). */
  baseQuote: string | null;
}

export type CaseErrors = Partial<Record<'caseKey' | 'group' | 'expectedOutput', string>>;

const valuesOf = (v: CaseValues): CaseValues => ({ caseKey: v.caseKey, group: v.group, input: v.input, expectedOutput: v.expectedOutput });

/** Comparator `exact` của worker bỏ xuống dòng và khoảng trắng ĐUÔI, nên hai output chỉ khác đuôi là cùng một ca. */
const sameValues = (a: CaseValues, b: CaseValues) =>
  a.caseKey === b.caseKey && a.group === b.group && a.input === b.input && a.expectedOutput.trimEnd() === b.expectedOutput.trimEnd();

const isActive = (row: DraftRow) => row.state !== 'removed' && row.state !== 'dropped';

export function startDraft(cases: TestBundleCase[] | null): DraftRow[] {
  return (cases ?? []).map((c) => {
    const dropped = c.autoDroppedReason !== null;
    return {
      caseKey: c.caseKey,
      group: c.group,
      input: c.input,
      expectedOutput: c.expectedOutput,
      constraintQuote: c.constraintQuote,
      autoDroppedReason: c.autoDroppedReason,
      state: dropped ? 'dropped' : 'same',
      base: dropped ? null : valuesOf(c),
      baseQuote: c.constraintQuote,
    };
  });
}

/** Kiểm một ca sắp thêm/sửa. `skipIndex` là dòng đang sửa, để nó không tự báo trùng với chính nó. */
export function validateCase(values: CaseValues, rows: DraftRow[], skipIndex: number | null): CaseErrors {
  const errors: CaseErrors = {};
  const key = values.caseKey.trim();
  if (key === '') errors.caseKey = 'Nhập tên ca, ví dụ ca6.';
  else if (key.length > 64) errors.caseKey = 'Tên ca tối đa 64 ký tự.';
  else if (!CASE_KEY_REGEX.test(key)) errors.caseKey = 'Tên ca chỉ gồm chữ, số, dấu _ và -, tối đa 64 ký tự.';
  else if (rows.some((row, i) => i !== skipIndex && isActive(row) && row.caseKey === key)) errors.caseKey = `Tên ca "${key}" đã có trong gói.`;

  const group = values.group.trim();
  if (group === '') errors.group = 'Chọn hoặc nhập nhóm, ví dụ co_ban.';
  else if (group.length > MAX_GROUP_CHARS) errors.group = `Nhóm dài quá ${MAX_GROUP_CHARS} ký tự.`;

  if (values.expectedOutput.trim() === '') errors.expectedOutput = 'Nhập output mong đợi. Ca không có output không chấm được.';
  return errors;
}

/** Tên đề xuất cho ca mới: `ca(N+1)` theo số lớn nhất từng dùng, kể cả ca đã bỏ (không tái dùng số đã dùng). */
export function nextCaseKey(rows: DraftRow[]): string {
  const biggest = rows.reduce((max, row) => {
    const m = /^ca(\d+)$/.exec(row.caseKey);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `ca${biggest + 1}`;
}

const normalize = (v: CaseValues): CaseValues => ({
  caseKey: v.caseKey.trim(),
  group: v.group.trim(),
  input: v.input,
  expectedOutput: v.expectedOutput.trimEnd(),
});

export function addRow(rows: DraftRow[], values: CaseValues): DraftRow[] {
  const v = normalize(values);
  return [...rows, { ...v, constraintQuote: null, autoDroppedReason: null, state: 'added', base: null, baseQuote: null }];
}

export function editRow(rows: DraftRow[], index: number, values: CaseValues): DraftRow[] {
  const v = normalize(values);
  return rows.map((row, i) => {
    // Ca hệ thống đã bỏ không được sửa thành ca sống: nó không chấm được ai (xem `toCreateInput`).
    if (i !== index || row.state === 'dropped') return row;
    if (row.base === null) return { ...row, ...v };
    // Sửa về đúng giá trị gốc thì là không sửa gì: trả lại nguyên giá trị gốc (kể cả đuôi output) VÀ trích đề gốc.
    if (sameValues(v, row.base)) return { ...row, ...row.base, state: 'same', constraintQuote: row.baseQuote };
    // Ca đã sửa mất trích đề: đề không còn biện minh cho input mới.
    return { ...row, ...v, state: 'edited', constraintQuote: null };
  });
}

export function removeRow(rows: DraftRow[], index: number): DraftRow[] {
  const row = rows[index];
  // Ca hệ thống đã bỏ không có nút bỏ; nếu có lời gọi thì phải là no-op, không đổi nó thành ca "đã bỏ bằng tay" hay sống lại.
  if (row === undefined || row.state === 'dropped') return rows;
  if (row.state === 'added') return rows.filter((_, i) => i !== index);
  return rows.map((r, i) => (i === index ? { ...r, state: 'removed' } : r));
}

export function undoRow(rows: DraftRow[], index: number): DraftRow[] {
  return rows.map((row, i) => {
    if (i !== index || row.state !== 'removed') return row;
    // Hoàn tác về đúng giá trị gốc thì trích đề gốc cũng quay lại; ca đã sửa thì trích đề vẫn mất như lúc sửa.
    if (row.base !== null && sameValues(row, row.base)) return { ...row, state: 'same', constraintQuote: row.baseQuote };
    return { ...row, state: 'edited' };
  });
}

export function changesCount(rows: DraftRow[]): number {
  return rows.filter((r) => r.state === 'added' || r.state === 'edited' || r.state === 'removed').length;
}

/** Lý do chưa lưu được bản nháp, hoặc null khi lưu được. */
export function saveBlocker(rows: DraftRow[], formOpen: boolean): string | null {
  if (formOpen) return 'Lưu hoặc huỷ ca đang nhập trước.';
  if (!rows.some(isActive)) return 'Gói cần ít nhất một ca đang dùng.';
  // Hai ca đang dùng cùng tên: server chỉ từ chối bằng lỗi trùng khoá (tiếng Anh), nên chặn ở đây và nói tên cụ thể.
  const seen = new Set<string>();
  for (const row of rows.filter(isActive)) {
    if (seen.has(row.caseKey)) return `Có hai ca cùng tên "${row.caseKey}" trong bản nháp — đổi tên một trong hai.`;
    seen.add(row.caseKey);
  }
  if (changesCount(rows) === 0) return 'Chưa có thay đổi nào để lưu.';
  return null;
}

/** Các ca gửi lên route tạo gói: chỉ ca đang dùng; ca `same` giữ trích đề, ca thêm/sửa thì không. */
export function toCreateInput(rows: DraftRow[]): TestBundleCaseInput[] {
  return rows.filter(isActive).map((row) => {
    const input: TestBundleCaseInput = { caseKey: row.caseKey, group: row.group, input: row.input, expectedOutput: row.expectedOutput };
    if (row.state === 'same' && row.constraintQuote) input.constraintQuote = row.constraintQuote.slice(0, MAX_QUOTE_CHARS);
    return input;
  });
}
