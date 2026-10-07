/**
 * Hằng số và kiểu dùng chung của module ghi điểm vào sổ điểm
 * (spec 2026-09-29-gradebook-export-design.md).
 */
export const BLANK_REASONS = ['absent', 'not_finished', 'ungradable', 'flagged'] as const;
export type BlankReason = (typeof BLANK_REASONS)[number];

/** Bước làm tròn tính bằng phần trăm điểm: 1 = không làm tròn, 10 = 0,1, 25 = 0,25, 50 = 0,5. */
export const ROUNDING_STEPS = [1, 10, 25, 50] as const;
export type RoundingStep = (typeof ROUNDING_STEPS)[number];

/** File mẫu tối đa 5 MiB (đo bằng HeadObject) — cùng con số của đọc roster ở web. */
export const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024;
/** Dòng lớn nhất có giá trị mà ta chịu đọc. */
export const MAX_SHEET_ROW = 5000;
/** Số dòng dữ liệu tối đa một lượt xuất. */
export const MAX_DATA_ROWS = 2000;
/** Cột lớn nhất có giá trị: 60 = BH. */
export const MAX_COLUMNS = 60;
/** Trần số ô đọc từ một trang tính — chặn file dựng để phồng bộ nhớ. */
export const MAX_CELLS = 400_000;
/** Số dòng lưới xem trước mỗi lần. */
export const GRID_ROWS = 40;
