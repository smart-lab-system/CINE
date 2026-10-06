import { randomUUID } from 'crypto';
import type { Queryable } from './seed';

/**
 * Dữ liệu nền (học kỳ, phòng, mã lớp danh nghĩa) là bảng CHUNG, không thuộc
 * giảng viên nào, và e2e không dọn được chúng giữa các lần chạy như dọn tài
 * khoản. Hai cách giữ test độc lập với nhau và với lần chạy trước:
 *
 *   - tên/mã: hậu tố NGẪU NHIÊN, không theo thời gian. Hai lần chạy cách nhau
 *     vài phút có hậu tố thời gian gần như trùng đuôi, và luật "gần giống" sẽ
 *     cảnh báo giữa chúng (một ký tự đổi chỗ) ở những test không hề nói về nó.
 *   - học kỳ: một VÙNG TÊN riêng, năm học >= 2200. DB cho phép 2000–2999, dữ liệu
 *     thật là 2026–2027, nên hai bên không bao giờ chạm nhau.
 */

export function randomTag(length = 10): string {
  return randomUUID().replace(/-/g, '').slice(0, length).toUpperCase();
}

export const TEST_YEAR_FLOOR = 2200;

let yearCursor = 0;

/**
 * Năm học > 2200 chưa có học kỳ nào và chưa cấp trong tiến trình này.
 *
 * Năm `TEST_YEAR_FLOOR` (2200) KHÔNG bao giờ được cấp ở đây: nó dành cho các học kỳ MẶC ĐỊNH dùng chung (kỳ 1, 2, 3 của
 * năm 2200 — xem `ensureTestSemester`, plan D1), tạo một lần rồi dùng lại giữa mọi file test và mọi lần chạy. Cấp cả năm
 * 2200 ở đây thì một test có thể chiếm mất (2200, 1) trước khi helper kia tạo nó.
 */
export async function freshTestYear(db: Queryable): Promise<number> {
  const [row] = await db.query(
    `SELECT COALESCE(MAX(academic_year_start), 0)::int AS max FROM examcollect.semester WHERE academic_year_start >= ${TEST_YEAR_FLOOR}`,
  );
  const year = Math.max(row.max + 1, TEST_YEAR_FLOOR + 1, yearCursor + 1);
  yearCursor = year;
  return year;
}

/**
 * Ngày của (năm, kỳ) sao cho MỌI cặp (năm, kỳ) đều không chồng nhau: kỳ 1 từ
 * 01/09 tới 31/01 năm sau, kỳ 2 từ 01/02 tới 31/05, kỳ 3 từ 01/06 tới 31/08 — và
 * kỳ 3 của năm Y kết thúc đúng ngày trước kỳ 1 của năm Y+1.
 */
export function semesterDates(year: number, term: 1 | 2 | 3): { startDate: string; endDate: string } {
  if (term === 1) return { startDate: `${year}-09-01`, endDate: `${year + 1}-01-31` };
  if (term === 2) return { startDate: `${year + 1}-02-01`, endDate: `${year + 1}-05-31` };
  return { startDate: `${year + 1}-06-01`, endDate: `${year + 1}-08-31` };
}

/** Xoá học kỳ thuộc vùng tên test mà không còn lớp nào. Học kỳ còn lớp thì giữ — FK RESTRICT. */
export async function purgeTestSemesters(db: Queryable): Promise<void> {
  await db.query(
    `DELETE FROM examcollect.semester s
      WHERE s.academic_year_start >= ${TEST_YEAR_FLOOR}
        AND NOT EXISTS (SELECT 1 FROM examcollect.class c WHERE c.semester_id = s.id)`,
  );
}
