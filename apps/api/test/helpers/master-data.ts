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

const sharedSemesters = new Map<number, Promise<string>>();

/** Năm của các học kỳ MẶC ĐỊNH dùng chung — cố định, đầu vùng tên test (xem `freshTestYear`: không bao giờ cấp năm này). */
export const DEFAULT_TEST_YEAR = TEST_YEAR_FLOOR;

/**
 * Học kỳ MẶC ĐỊNH dùng chung: (2200, term). Tạo một lần (get-or-create) rồi dùng lại giữa MỌI file test và MỌI lần chạy.
 *
 * Cần cho mọi test về PHẠM VI THEO HỌC KỲ (hai lớp "cùng học kỳ" phải trỏ cùng một hàng) và cho `seedClass` mặc định
 * (plan D3). CỐ ĐỊNH chứ không sinh mới mỗi file: một học kỳ đã có lớp thì không xoá được (FK RESTRICT) nên
 * `purgeTestSemesters` bỏ qua nó, và nếu mỗi file test tạo một cái thì cả bộ e2e ăn dần vùng năm 2200–2999 — hết chỗ
 * sau vài lần chạy.
 *
 * `term` 1/2/3 cho ba kỳ không chồng ngày của năm 2200 (`semesterDates`).
 */
export function ensureTestSemester(db: Queryable, term: 1 | 2 | 3 = 1): Promise<string> {
  const cached = sharedSemesters.get(term);
  if (cached) return cached;
  const created = (async () => {
    const { startDate, endDate } = semesterDates(DEFAULT_TEST_YEAR, term);
    await db.query(
      `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (academic_year_start, term) DO NOTHING`,
      [DEFAULT_TEST_YEAR, term, startDate, endDate],
    );
    const [row] = await db.query(
      `SELECT id FROM examcollect.semester WHERE academic_year_start = $1 AND term = $2`,
      [DEFAULT_TEST_YEAR, term],
    );
    return row.id as string;
  })();
  sharedSemesters.set(term, created);
  return created;
}

/**
 * Một học kỳ có ngày THẬT trong quá khứ (2001-09-01 → 2002-01-31). Nằm NGOÀI vùng tên ≥ 2200 của test (nên
 * `purgeTestSemesters` không đụng) và không đụng dữ liệu thật (2026 trở đi). Idempotent: chạy lại trả cùng một hàng.
 */
export async function ensurePastSemester(db: Queryable): Promise<string> {
  const [existing] = await db.query(
    `SELECT id FROM examcollect.semester WHERE academic_year_start = 2001 AND term = 1`,
  );
  if (existing) return existing.id as string;
  const [row] = await db.query(
    `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date)
     VALUES (2001, 1, '2001-09-01', '2002-01-31') RETURNING id`,
  );
  return row.id as string;
}
