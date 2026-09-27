import type { GradingResult } from '@/lib/api/grading';
import { groupOf, GROUP_LABELS } from './grading-groups';

/**
 * "Giảng viên chỉ cần export điểm về danh sách" — đúng một hàm thuần, không
 * gọi mạng, không đổi trạng thái bài chấm. Cột điểm đọc từ `currentScore`
 * (§14.2: "MỌI màn đọc điểm từ đây"), không phải `aiTotalScore` hay
 * `finalScore` — hai trường đó là ảnh chụp một thời điểm, còn `currentScore`
 * mới là điểm giảng viên đang thấy trên chính màn hình này.
 */
const HEADER = ['MSSV', 'Họ tên', 'Lớp', 'Trạng thái', 'Điểm', 'Ghi chú'] as const;

/**
 * Excel/Sheets đọc một ô BẮT ĐẦU bằng `=`, `+`, `-`, `@` như một công thức,
 * không phải văn bản — và tên sinh viên hay lý do không chấm được là dữ liệu
 * người dùng nhập, không phải hằng số hệ thống kiểm soát (CWE-1236). Thêm
 * một dấu `'` phía trước buộc Excel hiểu là văn bản; Excel tự bỏ dấu đó khi
 * hiện ô, nên người đọc không thấy gì khác thường.
 */
const FORMULA_LEADING = /^[=+\-@\t\r]/;

function csvField(value: string): string {
  const safe = FORMULA_LEADING.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function scoreCell(result: GradingResult): string {
  const score = result.currentScore ?? null;
  return score === null ? '' : String(score);
}

/**
 * BOM `﻿` ở đầu: không có nó, Excel trên Windows đọc file UTF-8 như
 * ANSI và tên tiếng Việt (Nguyễn, Trần…) ra dấu hỏi. `\r\n` cùng lý do —
 * đúng xuống dòng CSV mà Excel mong đợi, không phải quy ước của trình duyệt.
 */
export function gradingResultsToCsv(results: GradingResult[]): string {
  const sorted = [...results].sort((a, b) =>
    a.studentMssv.localeCompare(b.studentMssv, 'vi', { numeric: true }),
  );
  const rows = sorted.map((r) => [
    r.studentMssv,
    r.studentName,
    r.homeClassName ?? '',
    GROUP_LABELS[groupOf(r.status)],
    scoreCell(r),
    r.ungradableReason ?? '',
  ]);
  const lines = [HEADER as unknown as string[], ...rows].map((cols) =>
    cols.map(csvField).join(','),
  );
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Bỏ dấu + ký tự lạ khỏi tên phiên để làm tên file — giữ đọc được, không vỡ trên mọi hệ điều hành. */
export function gradingCsvFilename(sessionName: string, sessionCode: string, now = new Date()): string {
  const slug = sessionName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  // Giờ ĐỊA PHƯƠNG, không phải UTC: `toISOString()` lùi ngày cho người dùng
  // Việt Nam (UTC+7) xuất file trong khoảng 0h–7h sáng.
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `diem-${slug || sessionCode.toLowerCase()}-${date}.csv`;
}
