'use client';

import { useEffect, useRef, useState } from 'react';
import { useSemesters } from '@/hooks/useDepartment';
import type { Semester } from '@/lib/api/department';

const DAY_MS = 86_400_000;

export interface CurrentSemesterState {
  /**
   * Kỳ "hợp lý nhất hôm nay" — TÍNH TỪ NGÀY, không đọc cờ nào.
   *
   * KHÔNG phải `is_current` quay lại (CLAUDE.md §1.2): không lưu ở đâu,
   * không API set-current, và quan trọng nhất là **không chặn thao tác
   * nào**. Nó chỉ trả lời "hôm nay hợp lý nhất là kỳ nào" cho phần hiển
   * thị và cho giá trị khởi tạo của các ô chọn kỳ.
   */
  current: Semester | null;
  semesters: Semester[];
  isLoading: boolean;
  /** Kỳ mặc định đã quá `end_date` — hệ thống không tự sửa, nên phải nói ra. */
  isStale: boolean;
  staleDays: number;
}

export interface SemesterFilterState extends CurrentSemesterState {
  /** `null` = tất cả học kỳ. */
  semesterId: string | null;
  setSemesterId: (value: string | null) => void;
}

/**
 * Kỳ "hợp lý nhất hôm nay": ưu tiên kỳ ĐÃ BẮT ĐẦU gần hôm nay nhất; nếu
 * chưa kỳ nào bắt đầu (hệ thống mới cài), lấy kỳ SẮP TỚI gần nhất.
 *
 * KHÔNG dùng `MAX(start_date)` vô điều kiện: quản trị viên tạo sẵn kỳ sau
 * trong khi cả trường vẫn đang ở kỳ hiện tại là chuyện thường, và MAX đơn
 * giản sẽ nhảy sang kỳ tương lai chưa ai có lớp — người dùng mở form ra và
 * thấy mặc định là một kỳ còn nhiều tháng nữa mới tới. CLAUDE.md §7.2.3.
 *
 * Export ra ngoài vì đây là ĐỊNH NGHĨA dùng chung của "kỳ hiện tại": banner
 * ở header, bộ lọc danh sách và mặc định của form tạo Môn học đều phải trả
 * lời giống nhau. Hai công thức song song là cách chúng lệch nhau.
 */
export function pickDefaultSemester(semesters: Semester[], now: number): Semester | null {
  const started = semesters
    .filter((s) => new Date(s.startDate).getTime() <= now)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  if (started.length > 0) {
    return started[0];
  }
  const upcoming = semesters
    .filter((s) => new Date(s.startDate).getTime() > now)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  return upcoming[0] ?? null;
}

/**
 * Số ngày LỊCH đã qua kể từ `endDate`, đếm theo giờ địa phương.
 *
 * `semester.end_date` là cột DATE, không phải timestamp — nó nói "kỳ này
 * kết thúc ngày 15", không nói giờ nào. Nên phép đếm đúng là đếm ngày
 * lịch: kết thúc ngày 15, hôm nay ngày 20 thì là 5 ngày, bất kể đang là
 * mấy giờ. Trừ thẳng hai timestamp sẽ ra 4 hay 5 tuỳ giờ trong ngày, và
 * con số trên màn hình sẽ tự đổi giữa buổi sáng và buổi chiều.
 *
 * Giờ địa phương chứ không phải UTC: ngày trong `end_date` là ngày hành
 * chính của trường, và ở UTC+7 thì 2 giờ sáng hôm nay vẫn là hôm qua theo
 * UTC. `Math.round` để một lần đổi giờ DST không làm lệch kết quả.
 */
function calendarDaysSince(endDate: string, now: number): number {
  const [year, month, day] = endDate.slice(0, 10).split('-').map(Number);
  const end = new Date(year, month - 1, day).getTime();
  const today = new Date(now);
  const todayMidnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  return Math.round((todayMidnight - end) / DAY_MS);
}

/**
 * Chỉ đọc: "hôm nay là kỳ nào", không kèm state lựa chọn nào.
 *
 * Dùng cho banner ở header và cho giá trị khởi tạo của form tạo Môn học —
 * những chỗ cần biết kỳ mặc định nhưng không có bộ lọc để giữ.
 */
export function useCurrentSemester(): CurrentSemesterState {
  const { data, isLoading } = useSemesters();
  const semesters = data ?? [];
  const now = Date.now();
  const current = pickDefaultSemester(semesters, now);
  const staleDays = current ? calendarDaysSince(current.endDate, now) : 0;

  return {
    current,
    semesters,
    isLoading,
    // Ngày cuối của kỳ vẫn là một ngày TRONG kỳ, nên phải > 0 chứ không
    // phải >= 0.
    isStale: current !== null && staleDays > 0,
    staleDays: staleDays > 0 ? staleDays : 0,
  };
}

/**
 * Bộ lọc kỳ dùng chung cho mọi màn hình danh sách.
 *
 * Logic gieo-một-lần nằm Ở ĐÂY, không ở trang: tính lại mặc định mỗi
 * render sẽ ghi đè lựa chọn thủ công của người dùng ngay lần query
 * refetch đầu tiên, và họ sẽ không hiểu tại sao dropdown tự nhảy về.
 *
 * `scopeKey` là định danh TRANG, không phải dữ liệu — điều hướng sang màn
 * hình khác thì gieo lại từ kỳ mặc định, còn dữ liệu về lại trên cùng
 * trang thì không.
 */
export function useSemesterFilter(scopeKey: string): SemesterFilterState {
  const currentState = useCurrentSemester();
  const { current, isLoading } = currentState;

  const [semesterId, setSemesterId] = useState<string | null>(null);
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || seededFor.current === scopeKey) {
      return;
    }
    seededFor.current = scopeKey;
    setSemesterId(current?.id ?? null);
    // `current` KHÔNG có trong deps một cách có chủ ý: nó là một object mới
    // mỗi render, nên thêm vào đây sẽ gieo lại sau mỗi lần render và xoá
    // lựa chọn của người dùng — đúng lỗi mà `seededFor` tồn tại để chặn.
    // Bỏ qua nó là an toàn vì lần gieo duy nhất đọc `current` đúng một
    // lần, ngay khi `isLoading` chuyển sang false.
  }, [isLoading, scopeKey]);

  return { ...currentState, semesterId, setSemesterId };
}
