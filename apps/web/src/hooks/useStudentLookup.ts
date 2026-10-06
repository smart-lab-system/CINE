'use client';

import { useQuery } from '@tanstack/react-query';
import { lookupStudent } from '@/lib/api/students';

// Cùng luật với STUDENT_MSSV_REGEX của server (apps/api/src/common/student-mssv.ts) và `MSSV_REGEX` của roster-file.ts: 4–20 chữ
// hoặc số. Khớp từng ký tự — lệch ở đây thì hoặc gọi server vô ích (rồi 400), hoặc không bao giờ tra cho một MSSV hợp lệ.
const MSSV_REGEX = /^[A-Za-z0-9]{4,20}$/;

/**
 * Thời gian chờ giảng viên NGỪNG GÕ trước khi gọi server. Mọi tiền tố từ 4 ký tự trở lên của một MSSV đã khớp `MSSV_REGEX`, nên chỉ
 * kiểm luật thì gõ một MSSV 10 ký tự gọi bảy lần. 400 ms: dưới nhịp gõ liền tay của một MSSV, trên cảm giác "đã tra xong" của người chờ.
 */
export const LOOKUP_SETTLE_MS = 400;

/** Đợi `ms` rồi trả về; bị huỷ (`signal`) thì dừng NGAY — đó là cách một tiền tố đã gõ quá không bao giờ tới mạng. */
function settle(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Tra tên sinh viên theo MSSV đang gõ (spec §2.6). CHỈ chạy khi MSSV hợp lệ VÀ giảng viên đã ngừng gõ `LOOKUP_SETTLE_MS`: server giới
 * hạn 30 lần/phút/giảng viên để không ai quét được danh sách, nên mỗi lần gọi thừa (MSSV chưa gõ xong) là một lần trừ vào hạn mức.
 * `data === null` nghĩa là MSSV mới — giảng viên nhập tên; có dữ liệu nghĩa là tên đã lưu, ô tên được điền sẵn và khoá. Không thử
 * lại khi lỗi: 429 thử lại là tự làm hết hạn mức.
 *
 * Hạn mức đó nay là MỘT bộ đếm cho cả ba đường trả tên đã lưu (tra cứu, thêm tay vào lớp, thêm tay vào phiên — review cụm 2): mỗi
 * lần gọi thừa ở đây cũng trừ vào lượt thêm tay của chính giảng viên.
 *
 * Chờ nằm TRONG `queryFn` (không debounce giá trị truyền vào) và khoá truy vấn là MSSV HIỆN TẠI. Hai lý do: (1) `data` luôn là của
 * đúng MSSV đang hiện trong ô — debounce giá trị sẽ giữ tên của MSSV TRƯỚC suốt khoảng chờ, và ô tên (dựng từ `data`) có thể gửi một
 * cái tên lạ kèm MSSV mới; (2) `isFetching` là true suốt lúc gõ, nên người dùng của hook khoá ô tên và nút gửi mà không cần thêm cờ.
 * MSSV đã tra trong 5 phút trả ngay từ bộ nhớ, không chờ.
 */
export function useStudentLookup(rawMssv: string) {
  const mssv = rawMssv.trim();
  return useQuery({
    queryKey: ['students', 'lookup', mssv.toLowerCase()],
    queryFn: async ({ signal }) => {
      await settle(LOOKUP_SETTLE_MS, signal);
      return lookupStudent(mssv);
    },
    enabled: MSSV_REGEX.test(mssv),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
