/**
 * Kiểu của một lần import, phản chiếu `apps/api/src/course/import/import.types.ts` (plan E1). Viết tay thay vì lấy từ
 * schema sinh ra vì hai lý do: cấu trúc này là hợp đồng ổn định giữa hai plan, và UI cần `RunImport` — một hàm — mà schema
 * không mô tả. Nếu server đổi hình dạng, `lib/api/master-data-import.test.ts` và các test giao diện là nơi vỡ đầu tiên.
 */
export type ImportRowStatus = 'new' | 'update' | 'unchanged' | 'error';

/** Một trường sẽ đổi — chỉ có ở dòng `update`: "Giảng viên: A → B". */
export interface ImportChange {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
}

/** Một mục "gần giống" của một dòng MỚI. */
export interface ImportSimilar {
  /** Id của mục có sẵn; `null` khi mục kia là một dòng khác trong cùng file. */
  id: string | null;
  name: string;
  reason: 'normalized' | 'insert_delete' | 'swap';
  source: 'existing' | 'file';
  line: number | null;
}

export interface ImportRowResult {
  /** Số dòng như Excel hiện ra. */
  line: number;
  status: ImportRowStatus;
  label: string;
  changes: ImportChange[];
  errors: string[];
  similar: ImportSimilar[];
}

export interface ImportResult {
  dryRun: boolean;
  /** `true` chỉ khi lần gọi này ĐÃ ghi gì đó. */
  applied: boolean;
  counts: { added: number; updated: number; unchanged: number; errors: number };
  rows: ImportRowResult[];
  /** Có mục mới gần giống mục khác — ghi thật cần `confirmSimilar: true`. */
  needsSimilarConfirmation: boolean;
}

/** Một dòng gửi lên: `line` cùng các ô CHỮ theo khoá cột của loại đang nhập. */
export type ImportRowInput = { line: number } & Record<string, string | number>;

export interface ImportRequest {
  rows: ImportRowInput[];
  dryRun: boolean;
  confirmSimilar?: boolean;
}

/** Thứ duy nhất mà giao diện cần biết về mạng. Test truyền một hàm giả vào đây. */
export type RunImport = (request: ImportRequest) => Promise<ImportResult>;

/**
 * Server từ chối lần GHI THẬT (400 `IMPORT_HAS_ERRORS` hoặc 409 `NEAR_DUPLICATE`) và kèm bản xem trước MỚI NHẤT — trạng thái
 * có thể đã đổi từ lúc xem trước (người khác thêm phòng trong lúc admin đọc). Giao diện hiện lại bản này thay vì chỉ một câu.
 */
export class ImportRejectedError extends Error {
  constructor(
    message: string,
    readonly code: 'IMPORT_HAS_ERRORS' | 'NEAR_DUPLICATE',
    readonly preview: ImportResult,
  ) {
    super(message);
    this.name = 'ImportRejectedError';
  }
}
