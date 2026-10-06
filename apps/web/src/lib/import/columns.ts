import type { SheetData } from '@/lib/read-workbook';
import { trimTrailingBlankRows } from '@/lib/roster-file';
import type { ImportRowInput } from './import-types';

/**
 * Mô tả cột của từng loại dữ liệu nền (spec §6.3): MỘT cấu trúc điều khiển bộ nhận diện cột, file mẫu, bước ghép cột và bản
 * xem trước. Khoá cột (`key`) là tên trường của DTO server (E1) — đổi một bên là đổi cả hai, và test ghim điều đó.
 *
 * Client chỉ hiểu CẤU TRÚC (có cột không, có dòng không, có vượt trần không). Số, ngày, học kỳ do server hiểu (E1
 * `import-cells.ts`) để chỉ có một chỗ hiểu.
 */

export type ImportKindId = 'semester' | 'room' | 'administrative-class' | 'class';

export interface ImportColumn {
  /** Tên trường trong thân yêu cầu. */
  key: string;
  /** Tên chính thức: tiêu đề cột trong file mẫu. */
  label: string;
  required: boolean;
  /** Tên cột khác cũng được nhận (chưa chuẩn hoá — `normalizeHeader` lo). Tên chính thức luôn được nhận. */
  aliases: readonly string[];
  /** Giá trị ở dòng ví dụ của file mẫu. */
  example: string;
  /** Giải thích ngắn cho sheet "Huong dan" của file mẫu. */
  hint: string;
}

export interface ImportKind {
  id: ImportKindId;
  /** Tiêu đề hộp thoại: "Nhập {title thường} từ file". */
  title: string;
  /** Danh từ trong câu xác nhận "gần giống": "…đúng là những {noun} khác nhau". */
  noun: string;
  columns: readonly ImportColumn[];
  /** Trần dòng — khớp `IMPORT_ROW_LIMITS` của server (spec §6.3). */
  maxRows: number;
  sheetName: string;
  fileName: string;
}

export const SEMESTER_KIND: ImportKind = {
  id: 'semester',
  title: 'Học kỳ',
  noun: 'học kỳ',
  maxRows: 20,
  sheetName: 'HocKy',
  fileName: 'mau-hoc-ky.xlsx',
  columns: [
    {
      key: 'academicYear',
      label: 'Năm học',
      required: true,
      aliases: ['nam', 'nam bat dau', 'academic year'],
      example: '2026',
      hint: 'Năm bắt đầu của năm học, vd 2026 cho năm học 2026-2027.',
    },
    {
      key: 'term',
      label: 'Kỳ',
      required: true,
      aliases: ['hoc ky', 'hk', 'term'],
      example: '1',
      hint: '1, 2 hoặc 3.',
    },
    {
      key: 'startDate',
      label: 'Ngày bắt đầu',
      required: true,
      aliases: ['bat dau', 'ngay bd', 'tu ngay', 'start date', 'start'],
      example: '2026-09-01',
      hint: 'yyyy-mm-dd hoặc dd/mm/yyyy.',
    },
    {
      key: 'endDate',
      label: 'Ngày kết thúc',
      required: true,
      aliases: ['ket thuc', 'ngay kt', 'den ngay', 'end date', 'end'],
      example: '2027-01-31',
      hint: 'yyyy-mm-dd hoặc dd/mm/yyyy. Không được chồng ngày với học kỳ khác.',
    },
  ],
};

export const ROOM_KIND: ImportKind = {
  id: 'room',
  title: 'Phòng thi',
  noun: 'phòng',
  maxRows: 500,
  sheetName: 'PhongThi',
  fileName: 'mau-phong-thi.xlsx',
  columns: [
    {
      key: 'name',
      label: 'Tên phòng',
      required: true,
      aliases: ['ten', 'phong', 'ten phong thi', 'room', 'name'],
      example: 'Phòng máy A1',
      hint: 'Khoá nhận diện. Tên khác là một phòng MỚI; muốn đổi tên một phòng thì sửa thủ công.',
    },
    {
      key: 'capacity',
      label: 'Sức chứa',
      required: false,
      aliases: ['so cho', 'so cho ngoi', 'si so', 'so may', 'capacity'],
      example: '40',
      hint: 'Không bắt buộc, số nguyên 1–1000. Để trống thì không đổi sức chứa đang có.',
    },
  ],
};

export const ADMINISTRATIVE_CLASS_KIND: ImportKind = {
  id: 'administrative-class',
  title: 'Danh mục lớp danh nghĩa',
  noun: 'mã lớp danh nghĩa',
  maxRows: 500,
  sheetName: 'LopDanhNghia',
  fileName: 'mau-lop-danh-nghia.xlsx',
  columns: [
    {
      key: 'code',
      label: 'Mã lớp danh nghĩa',
      required: true,
      aliases: ['ma lop', 'lop danh nghia', 'lop', 'ma', 'code'],
      example: 'DHKTPM18A',
      hint: 'Chữ và số, 3–30 ký tự; tự viết hoa. Chỉ thêm mã mới — không sửa hay xoá bằng file.',
    },
  ],
};

export const CLASS_KIND: ImportKind = {
  id: 'class',
  title: 'Lớp',
  noun: 'lớp',
  maxRows: 200,
  sheetName: 'Lop',
  fileName: 'mau-lop.xlsx',
  columns: [
    {
      key: 'semester',
      label: 'Học kỳ',
      required: true,
      aliases: ['hk', 'semester', 'ky'],
      example: 'HK1 2026-2027',
      hint: 'Dạng HK1 2026-2027. Học kỳ phải đã có.',
    },
    {
      key: 'administrativeClassCode',
      label: 'Mã lớp danh nghĩa',
      required: true,
      aliases: ['ma lop', 'lop danh nghia', 'lop', 'code'],
      example: 'DHKTPM18A',
      hint: 'Phải đã có trong Danh mục lớp danh nghĩa.',
    },
    {
      key: 'groupName',
      label: 'Nhóm',
      required: false,
      aliases: ['group', 'nhom hoc phan'],
      example: 'Nhóm 1',
      hint: 'Không bắt buộc. Để trống nếu lớp không tách nhóm.',
    },
    {
      key: 'teacherEmail',
      label: 'Email giảng viên',
      required: true,
      aliases: ['email gv', 'email', 'giang vien', 'gv'],
      example: 'giangvien@truong.edu.vn',
      hint: 'Tài khoản giảng viên đang hoạt động.',
    },
  ],
};

export const IMPORT_KINDS: Record<ImportKindId, ImportKind> = {
  semester: SEMESTER_KIND,
  room: ROOM_KIND,
  'administrative-class': ADMINISTRATIVE_CLASS_KIND,
  class: CLASS_KIND,
};

/** Cột được chọn cho từng trường: chỉ số cột (0-based) hoặc `null` = không có cột này. */
export interface ImportMapping {
  /** Số dòng đầu cần bỏ qua trước khi tới dữ liệu. */
  headerRows: number;
  columns: Record<string, number | null>;
}

/** Bỏ dấu (kể cả đ/Đ), hạ chữ thường, mọi ký tự không phải chữ/số thành một khoảng trắng. */
export function normalizeHeader(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tên cột như Excel: 0 → A, 25 → Z, 26 → AA. */
export function columnLabel(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/** Quét tối đa chừng này dòng đầu để tìm dòng tiêu đề: đủ cho một tiêu đề bìa, không đủ để nhận nhầm dữ liệu làm tiêu đề. */
const HEADER_SCAN_ROWS = 10;

export interface DetectedMapping {
  mapping: ImportMapping;
  /** `true` khi MỌI cột bắt buộc khớp theo tên. `false` = giao diện phải mở sẵn bước chỉnh cột. */
  detected: boolean;
}

/**
 * Tự ghép cột theo TÊN (spec §6.2 nguyên tắc 8). Trong 10 dòng đầu, chọn dòng khớp nhiều cột nhất MÀ có đủ cột bắt buộc; một
 * cột của file không bao giờ gán cho hai trường. Không đủ thì ghép theo thứ tự cột với một dòng tiêu đề và báo `detected:
 * false` — người dùng chỉnh tay, đúng cái bước ghép cột mà roster vẫn hỏi.
 */
export function detectMapping(rows: string[][], kind: ImportKind): DetectedMapping {
  const names = kind.columns.map(
    (column) => new Set([normalizeHeader(column.label), ...column.aliases.map(normalizeHeader)]),
  );

  let best: { rowIndex: number; columns: Record<string, number | null>; matched: number } | null = null;
  const limit = Math.min(rows.length, HEADER_SCAN_ROWS);
  for (let rowIndex = 0; rowIndex < limit; rowIndex++) {
    const headers = rows[rowIndex].map(normalizeHeader);
    const used = new Set<number>();
    const columns: Record<string, number | null> = {};
    let matched = 0;
    kind.columns.forEach((column, i) => {
      const found = headers.findIndex((header, index) => header !== '' && !used.has(index) && names[i].has(header));
      if (found >= 0) {
        used.add(found);
        columns[column.key] = found;
        matched += 1;
      } else {
        columns[column.key] = null;
      }
    });
    const requiredOk = kind.columns.every((column) => !column.required || columns[column.key] !== null);
    if (requiredOk && (!best || matched > best.matched)) {
      best = { rowIndex, columns, matched };
    }
  }

  if (best) {
    return { detected: true, mapping: { headerRows: best.rowIndex + 1, columns: best.columns } };
  }
  const positional: Record<string, number | null> = {};
  kind.columns.forEach((column, i) => {
    positional[column.key] = i;
  });
  return { detected: false, mapping: { headerRows: 1, columns: positional } };
}

/** Sheet đầu tiên nhận diện được cột; không có thì sheet đầu. Bỏ qua sheet bìa/hướng dẫn. */
export function detectBestSheet(sheets: readonly SheetData[], kind: ImportKind): number {
  const index = sheets.findIndex((sheet) => detectMapping(sheet.rows, kind).detected);
  return index >= 0 ? index : 0;
}

export interface ExtractedRows {
  rows: ImportRowInput[];
  /** Vấn đề CẤU TRÚC khiến chưa nên gửi lên. Rỗng = gửi được; giá trị từng ô là việc của server. */
  problems: string[];
}

/**
 * Tách các dòng dữ liệu theo cột đã ghép. `line` là vị trí trong sheet (1-based) — KHÔNG đếm lại sau khi bỏ dòng trống, để
 * "Dòng 7" trong báo lỗi là dòng 7 mà người dùng thấy ở Excel (Review Focus 3). Dòng trống (theo CÁC CỘT ĐÃ GHÉP) bị bỏ
 * qua: khác roster, nơi một dòng trống ở giữa là dấu hiệu ghép sai cột, danh sách phòng/mã có dòng trống ngăn nhóm là chuyện
 * thường và máy chủ cũng không coi dòng trống là lỗi.
 */
export function extractImportRows(rows: string[][], mapping: ImportMapping, kind: ImportKind): ExtractedRows {
  const problems: string[] = [];
  for (const column of kind.columns) {
    if (column.required && mapping.columns[column.key] == null) {
      problems.push(`Chưa chọn cột "${column.label}".`);
    }
  }

  const mappedIndexes = kind.columns
    .map((column) => mapping.columns[column.key])
    .filter((index): index is number => index !== null && index !== undefined);
  const body = trimTrailingBlankRows(rows).slice(mapping.headerRows);
  const extracted: ImportRowInput[] = [];

  body.forEach((cells, offset) => {
    const isBlank = mappedIndexes.every((index) => (cells[index] ?? '').trim() === '');
    if (isBlank) return;
    const row: ImportRowInput = { line: mapping.headerRows + offset + 1 };
    for (const column of kind.columns) {
      const index = mapping.columns[column.key];
      row[column.key] = index === null || index === undefined ? '' : (cells[index] ?? '').trim();
    }
    extracted.push(row);
  });

  if (problems.length === 0 && extracted.length === 0) {
    problems.push('Không có dòng dữ liệu nào sau phần tiêu đề.');
  }
  if (extracted.length > kind.maxRows) {
    problems.push(`File có ${extracted.length} dòng dữ liệu, tối đa ${kind.maxRows} dòng mỗi lần nhập.`);
  }
  return { rows: extracted, problems };
}
