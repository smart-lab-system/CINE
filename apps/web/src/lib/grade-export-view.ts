import { formatVnHundredths } from '@/lib/format';
import type { BlankReason, Cause, CauseTally, InspectGrid, PlanRequest, PlanResponse, PlanRowView, RowAction } from '@/lib/api/grade-export';
import { csvField, gradingCsvFilename } from '@/lib/grading-export';

/**
 * Cùng con số với server (`MAX_TEMPLATE_BYTES` và `GRID_ROWS` ở `apps/api/src/grade-export/grade-export.types.ts`). Đặt ở
 * đây, không ở `lib/api/grade-export.ts`, để một test thuần không phải nạp `api-client`.
 */
export const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024;
/** Số dòng của một trang lưới xem trước. */
export const GRID_ROWS = 40;

const SCORE = /^(\d{1,4})(?:\.(\d{1,2}))?$/;

/** "7.25" → "7,25", "8.50" → "8,5": chuỗi thập phân của API → chữ hiển thị, không qua số thực để LÀM TOÁN. */
export function scoreText(score: string | null): string {
  if (score === null) return '—';
  const match = SCORE.exec(score);
  if (!match) return score;
  return formatVnHundredths(Number(match[1]) * 100 + (match[2] ? Number(match[2].padEnd(2, '0')) : 0));
}

/** Bốn bước làm tròn (spec D9), nửa lên. Không cái nào được chọn sẵn. */
export const ROUNDING_OPTIONS = [
  { value: 1, label: 'Không làm tròn (giữ 2 chữ số lẻ)' },
  { value: 10, label: '0,1' },
  { value: 25, label: '0,25' },
  { value: 50, label: '0,5' },
] as const;

export const ACTION_LABEL: Record<RowAction, string> = {
  write: 'Sẽ ghi',
  blank: 'Để trống',
  kept: 'Giữ nguyên ô',
  unmatched: 'Không khớp',
  duplicate: 'MSSV trùng',
  conflict: 'Nhiều kết quả',
  skipped_formula: 'Ô có công thức',
  skipped_merged: 'Ô gộp',
};

export function causeText(cause: Cause): string {
  switch (cause.kind) {
    case 'rule':
      return `luật ${cause.ruleName ?? cause.ruleKey}`;
    case 'manual_score':
      return 'chấm tay';
    case 'review':
      return 'duyệt lại bài tự luận';
    case 'rounding':
      return 'chỉ do đổi bước làm tròn';
    case 'unknown':
      return 'chưa rõ nguyên nhân';
  }
}

export const causesText = (causes: Cause[]): string => causes.map(causeText).join(', ');

/** Một dòng của dải "Giảm do / Tăng do": nguyên nhân kèm số bài. */
export function causeTallyText(c: CauseTally): string {
  const label = c.kind === 'rule' ? `luật ${c.ruleName ?? c.ruleKey}` : causeText({ kind: c.kind } as Cause);
  return `${label} (${c.students} bài)`;
}

/** "Không làm tròn" / "Làm tròn 0,5" — cho danh sách lượt xuất trước. */
export function roundingText(step: number): string {
  const option = ROUNDING_OPTIONS.find((o) => o.value === step);
  return step === 1 || !option ? 'Không làm tròn' : `Làm tròn ${option.label}`;
}

/** "↓ Giảm — trước đã ghi 7,5, do luật …": chiều bằng mũi tên VÀ chữ (spec §3.6). */
export function directionText(row: Pick<PlanRowView, 'direction' | 'previousScore' | 'causes'>): string {
  const because = row.causes.length > 0 ? `, do ${causesText(row.causes)}` : '';
  switch (row.direction) {
    case 'down':
      return `↓ Giảm — trước đã ghi ${scoreText(row.previousScore)}${because}`;
    case 'up':
      return `↑ Tăng — trước đã ghi ${scoreText(row.previousScore)}${because}`;
    case 'same':
      return 'Không đổi so với lần ghi trước';
    case 'new':
      return 'Mới — chưa từng ghi';
    default:
      return '';
  }
}

export type RowFilter = 'all' | 'write' | 'blank' | 'problem' | 'changed';
export const ROW_FILTER_LABEL: Record<RowFilter, string> = {
  all: 'Tất cả',
  write: 'Sẽ ghi',
  blank: 'Để trống',
  problem: 'Cần chú ý',
  changed: 'Có thay đổi',
};

export function matchesFilter(row: PlanRowView, filter: RowFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'write':
      return row.action === 'write';
    case 'blank':
      return row.action === 'blank' || row.action === 'kept';
    case 'problem':
      return row.action === 'unmatched' || row.action === 'duplicate' || row.action === 'skipped_formula' || row.action === 'skipped_merged';
    case 'changed':
      return row.direction === 'up' || row.direction === 'down';
  }
}

export function countFilters(rows: PlanRowView[]): Record<RowFilter, number> {
  const filters = Object.keys(ROW_FILTER_LABEL) as RowFilter[];
  return Object.fromEntries(filters.map((f) => [f, rows.filter((r) => matchesFilter(r, f)).length])) as Record<RowFilter, number>;
}

// ---------------------------------------------------------------------------------------------- bảng kê ô trống
const BLANK_ORDER: BlankReason[] = ['absent', 'not_finished', 'ungradable', 'flagged'];
const REPORT_HEADER = ['Dòng', 'MSSV', 'Họ tên', 'Lý do ô trống', 'Ghi chú'];

/**
 * Bảng kê ô trống theo lý do (§13.1 luật 5): dòng để trống hoặc giữ nguyên ô, cộng sinh viên KHÔNG có dòng trong file
 * mà cũng không có điểm. BOM (U+FEFF) ở đầu để Excel đọc tên tiếng Việt đúng; `csvField` chặn công thức (CWE-1236) —
 * họ tên là chữ người dùng nhập, không phải hằng của hệ thống.
 */
export function blankReportCsv(plan: Pick<PlanResponse, 'rows' | 'notInFile'>): string {
  const entries: { order: number; mssv: string; cols: string[] }[] = [];
  for (const r of plan.rows) {
    if (r.action !== 'blank' && r.action !== 'kept') continue;
    entries.push({
      order: BLANK_ORDER.indexOf(r.blankReason!),
      mssv: r.studentMssv ?? '',
      cols: [String(r.row), r.studentMssv ?? '', r.studentName ?? '', r.blankLabel ?? '', r.action === 'kept' ? 'Giữ nguyên ô điểm đã ghi lần trước' : ''],
    });
  }
  for (const s of plan.notInFile) {
    if (s.blankReason === null) continue;
    entries.push({ order: BLANK_ORDER.indexOf(s.blankReason), mssv: s.mssv, cols: ['', s.mssv, s.name, s.blankLabel ?? '', 'Không có dòng trong file'] });
  }
  entries.sort((a, b) => a.order - b.order || (a.mssv < b.mssv ? -1 : a.mssv > b.mssv ? 1 : 0));
  const lines = [REPORT_HEADER, ...entries.map((e) => e.cols)].map((cols) => cols.map(csvField).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export const hasBlankReport = (plan: Pick<PlanResponse, 'rows' | 'notInFile'>): boolean =>
  plan.rows.some((r) => r.action === 'blank' || r.action === 'kept') || plan.notInFile.some((s) => s.blankReason !== null);

export const blankReportFilename = (sessionName: string, sessionCode: string, now = new Date()): string =>
  gradingCsvFilename(sessionName, sessionCode, now).replace(/^diem-/, 'o-trong-');

// ---------------------------------------------------------------------------------------------- tải lên và chọn cột
/** Cùng luật với server, báo sớm để giảng viên không phải đợi một vòng mạng. Server vẫn kiểm lại. */
export function validateUpload(file: { name: string; size: number }): string | null {
  if (!/\.xlsx$/i.test(file.name)) {
    return 'Chỉ nhận file .xlsx. Nếu sổ điểm của bạn là .csv hoặc .xls, hãy mở bằng Excel rồi lưu lại thành .xlsx.';
  }
  if (file.size === 0) return 'File rỗng.';
  if (file.size > MAX_TEMPLATE_BYTES) return 'File quá lớn (giới hạn 5 MB).';
  return null;
}

export interface ColumnChoice {
  sheetName: string;
  firstDataRow: number | null;
  mssvColumn: string;
  scoreColumn: string;
  reasonColumn: string;
  deliverableId: string;
}

/** Không cột nào, không dòng nào được chọn sẵn — kể cả khi tiêu đề ghi "MSSV" (rule 9). */
export const EMPTY_CHOICE: ColumnChoice = { sheetName: '', firstDataRow: null, mssvColumn: '', scoreColumn: '', reasonColumn: '', deliverableId: '' };

export function columnsReady(choice: ColumnChoice, needsDeliverable: boolean): { ok: boolean; hints: string[] } {
  const hints: string[] = [];
  if (!choice.sheetName) hints.push('trang tính');
  if (!choice.mssvColumn) hints.push('cột MSSV');
  if (!choice.scoreColumn) hints.push('cột điểm');
  if (choice.firstDataRow === null || choice.firstDataRow < 1) hints.push('dòng bắt đầu dữ liệu');
  if (needsDeliverable && !choice.deliverableId) hints.push('yêu cầu nộp');
  const chosen = [choice.mssvColumn, choice.scoreColumn, choice.reasonColumn].filter(Boolean);
  if (new Set(chosen).size !== chosen.length) hints.push('ba cột phải khác nhau');
  return { ok: hints.length === 0, hints };
}

export type PlanBase = Omit<PlanRequest, 'roundingStepHundredths'>;

export function toPlanBase(templateId: string, choice: ColumnChoice): PlanBase {
  return {
    templateId,
    sheetName: choice.sheetName,
    firstDataRow: choice.firstDataRow!,
    mssvColumn: choice.mssvColumn,
    scoreColumn: choice.scoreColumn,
    ...(choice.reasonColumn ? { reasonColumn: choice.reasonColumn } : {}),
    ...(choice.deliverableId ? { deliverableId: choice.deliverableId } : {}),
  };
}

/** Số ô của cột đã có giá trị TRONG PHẦN LƯỚI ĐANG HIỆN — con số thật do server đếm ở bước sau. */
export function sampledOverwriteCount(grid: InspectGrid, column: string, firstDataRow: number): number {
  const index = grid.columns.indexOf(column);
  if (index < 0) return 0;
  return grid.rows.filter((r) => r.row >= firstDataRow && r.cells[index]?.kind !== 'empty').length;
}

// ---------------------------------------------------------------------------------------------- nút "Ghi vào file"
export function canWriteNow(input: {
  plan: PlanResponse | null;
  roundingStep: number | null;
  overwriteAck: boolean;
  decreaseAck: boolean;
}): { enabled: boolean; reasons: string[] } {
  if (input.roundingStep === null) return { enabled: false, reasons: ['Chọn cách làm tròn.'] };
  if (input.plan === null) return { enabled: false, reasons: ['Đang xem trước…'] };
  const reasons: string[] = [...input.plan.blockers];
  const overwrites = input.plan.overwrite.score + input.plan.overwrite.reason;
  if (overwrites > 0 && !input.overwriteAck) reasons.push(`Cần đồng ý ghi đè ${overwrites} ô đã có giá trị.`);
  const down = input.plan.changes?.down ?? 0;
  if (down > 0 && !input.decreaseAck) reasons.push(`Cần xác nhận ${down} bài bị giảm điểm.`);
  return { enabled: reasons.length === 0, reasons };
}
