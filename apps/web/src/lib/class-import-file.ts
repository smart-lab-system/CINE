/**
 * Turning a spreadsheet into a list of classes, in the browser.
 *
 * Cùng ranh giới với `roster-file.ts`: `readWorkbook` là phần duy nhất
 * chạm vào file thật và thư viện thật; mọi thứ ở đây thuần tuý, nhận
 * mảng ô và trả về dữ liệu, nên các quy tắc kiểm được cạn kiệt mà không
 * cần file hay browser.
 *
 * File .xlsx không bao giờ lên server (Security rule 5) — thứ được POST
 * là JSON thường.
 *
 * **Khác `roster-file.ts` một điểm có chủ đích: ở đây KHÔNG all-or-nothing.**
 * Roster là danh sách một lớp, nhập thiếu một dòng cho ra một sĩ số trông
 * lành lặn mà sai. Đây là danh sách lớp của cả khoa: một môn gõ sai email
 * giảng viên không được phép chặn 49 môn còn lại. Lỗi được liệt kê ra bên
 * cạnh các dòng hợp lệ, người dùng đọc rồi mới bấm.
 */

export interface ClassImportRow {
  courseCode: string;
  courseName: string;
  className: string;
  teacherEmail: string;
}

export interface ClassImportRowError {
  /** 1-based, đúng như bảng tính hiển thị. */
  row: number;
  reason: string;
}

export interface ParsedClassImport {
  rows: ClassImportRow[];
  errors: ClassImportRowError[];
}

export interface ClassColumnMapping {
  /** Số dòng tiêu đề cần bỏ qua — người dùng nói, không đoán. */
  headerRows: number;
  /** Chỉ số cột 0-based, người dùng chọn. */
  courseCodeColumn: number;
  courseNameColumn: number;
  classNameColumn: number;
  teacherEmailColumn: number;
}

export const DEFAULT_CLASS_COLUMN_MAPPING: ClassColumnMapping = {
  headerRows: 1,
  courseCodeColumn: 0,
  courseNameColumn: 1,
  classNameColumn: 2,
  teacherEmailColumn: 3,
};

/**
 * Cùng hình dạng `@IsEmail` của DTO chấp nhận, ở mức đủ để bắt lỗi gõ
 * thật (thiếu `@`, thiếu tên miền). Cố khớp RFC 5322 ở đây là vô ích —
 * server vẫn validate lại, lớp này chỉ để nói cho người dùng biết dòng
 * nào sai khi họ còn sửa được.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cell(row: string[] | undefined, index: number): string {
  return (row?.[index] ?? '').trim();
}

function isBlankRow(row: string[]): boolean {
  return row.every((value) => (value ?? '').trim() === '');
}

/**
 * Bỏ các dòng trống ở CUỐI sheet.
 *
 * Một định dạng sót lại trên dòng chưa dùng đủ để bảng tính báo hàng
 * trăm dòng như vậy, nên đánh trượt một file thật vì mấy dòng trắng cuối
 * là hình thức. Dòng trống nằm GIỮA dữ liệu lại là chuyện khác — thường
 * là dấu hiệu chọn sai cột hoặc sai số dòng tiêu đề — và vẫn được báo.
 */
export function trimTrailingBlankRows(rows: string[][]): string[][] {
  let end = rows.length;
  while (end > 0 && isBlankRow(rows[end - 1])) {
    end--;
  }
  return rows.slice(0, end);
}

export function extractClasses(
  sheetRows: string[][],
  mapping: ClassColumnMapping,
): ParsedClassImport {
  const body = trimTrailingBlankRows(sheetRows).slice(mapping.headerRows);
  const rows: ClassImportRow[] = [];
  const errors: ClassImportRowError[] = [];
  const seen = new Map<string, number>();

  if (body.length === 0) {
    return {
      rows: [],
      errors: [{ row: 0, reason: 'Không có dòng dữ liệu nào sau phần tiêu đề' }],
    };
  }

  body.forEach((sheetRow, index) => {
    const rowNumber = index + mapping.headerRows + 1;

    if (isBlankRow(sheetRow)) {
      errors.push({
        row: rowNumber,
        reason: 'Dòng trống nằm giữa danh sách — kiểm tra lại cột đã chọn',
      });
      return;
    }

    const courseCode = cell(sheetRow, mapping.courseCodeColumn);
    const courseName = cell(sheetRow, mapping.courseNameColumn);
    const className = cell(sheetRow, mapping.classNameColumn);
    const teacherEmail = cell(sheetRow, mapping.teacherEmailColumn);

    if (courseCode === '') {
      errors.push({ row: rowNumber, reason: 'Thiếu mã môn' });
      return;
    }
    if (courseCode.length < 2 || courseCode.length > 32) {
      // Đúng bằng `@Length(2, 32)` của DTO — lệch ở đây nghĩa là preview
      // báo file ổn rồi import 400.
      errors.push({
        row: rowNumber,
        reason: `Mã môn "${courseCode}" phải dài 2-32 ký tự`,
      });
      return;
    }
    if (courseName === '') {
      errors.push({ row: rowNumber, reason: 'Thiếu tên môn' });
      return;
    }
    if (className === '') {
      errors.push({ row: rowNumber, reason: 'Thiếu tên lớp' });
      return;
    }
    if (!EMAIL_REGEX.test(teacherEmail)) {
      errors.push({
        row: rowNumber,
        reason: `Email giảng viên "${teacherEmail}" không hợp lệ`,
      });
      return;
    }

    // Hai dòng cùng (mã môn, tên lớp) là cùng một lớp với server — dòng
    // sau sẽ ghi đè dòng trước một cách âm thầm, và người dùng sẽ không
    // biết giảng viên nào đã thắng.
    const key = `${courseCode.toLowerCase()}::${className.toLowerCase()}`;
    const first = seen.get(key);
    if (first !== undefined) {
      errors.push({
        row: rowNumber,
        reason: `Lớp "${className}" của môn ${courseCode} đã xuất hiện ở dòng ${first}`,
      });
      return;
    }
    seen.set(key, rowNumber);

    rows.push({ courseCode, courseName, className, teacherEmail });
  });

  return { rows, errors };
}
