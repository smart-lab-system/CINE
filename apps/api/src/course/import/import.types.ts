import type { NearDuplicateReason } from '../../common/near-duplicate';

/**
 * Hình dạng kết quả của MỌI import dữ liệu nền (spec §6.2 nguyên tắc 5). Lớp (không phải interface) để bộ sinh OpenAPI
 * đọc được và client web có kiểu thật — cùng cách `RoomView`, `SemesterView` làm ở plan C.
 */
export type ImportRowStatus = 'new' | 'update' | 'unchanged' | 'error';

/** Một trường sẽ đổi — chỉ có ở dòng `update`: "Giảng viên: A → B" (spec §6.2 nguyên tắc 2, T-IMP-6). */
export class ImportChange {
  field!: string;
  /** Nhãn tiếng Việt của trường, để giao diện không phải dịch tên trường. */
  label!: string;
  from!: string | null;
  to!: string | null;
}

/** Một mục "gần giống" của một dòng MỚI (spec §6.2 nguyên tắc 4). */
export class ImportSimilar {
  /** Id của mục có sẵn; `null` khi mục kia là một dòng khác trong cùng file. */
  id!: string | null;
  name!: string;
  reason!: NearDuplicateReason;
  source!: 'existing' | 'file';
  /** Số dòng của mục kia khi `source = 'file'`. */
  line!: number | null;
}

export class ImportRowResult {
  /** Số dòng như Excel hiện ra, do client gửi lên. */
  line!: number;
  status!: ImportRowStatus;
  /** Tên đọc được của đối tượng: `Phòng H3.03`, `HK1 2026-2027`, `DHKTPM18A – Nhóm 1 · HK1 2026-2027`; `Dòng N` khi chưa đọc ra. */
  label!: string;
  changes!: ImportChange[];
  errors!: string[];
  similar!: ImportSimilar[];
}

export class ImportCounts {
  added!: number;
  updated!: number;
  unchanged!: number;
  errors!: number;
}

export class ImportResult {
  dryRun!: boolean;
  /** `true` chỉ khi lần gọi này ĐÃ ghi gì đó. `dryRun` và lần chạy không có gì để ghi đều `false`. */
  applied!: boolean;
  counts!: ImportCounts;
  rows!: ImportRowResult[];
  /** Có mục mới gần giống mục khác — ghi thật cần `confirmSimilar: true`. */
  needsSimilarConfirmation!: boolean;
}

/** Thứ MỘT planner trả về: từng dòng (cho xem trước) và việc cần ghi (cho `apply`). */
export interface ImportPlan<W> {
  rows: ImportRowResult[];
  writes: W[];
}

export function blankRow(line: number, label: string): ImportRowResult {
  return { line, status: 'unchanged', label, changes: [], errors: [], similar: [] };
}

export function errorRow(line: number, label: string, errors: string[]): ImportRowResult {
  return { line, status: 'error', label, changes: [], errors, similar: [] };
}

export function summarize(rows: readonly ImportRowResult[]): ImportCounts {
  const counts = { added: 0, updated: 0, unchanged: 0, errors: 0 };
  for (const row of rows) {
    if (row.status === 'new') counts.added += 1;
    else if (row.status === 'update') counts.updated += 1;
    else if (row.status === 'unchanged') counts.unchanged += 1;
    else counts.errors += 1;
  }
  return counts;
}

export function needsSimilarConfirmation(rows: readonly ImportRowResult[]): boolean {
  return rows.some((row) => row.status === 'new' && row.similar.length > 0);
}
