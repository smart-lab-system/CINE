'use client';

import { useQuery } from '@tanstack/react-query';
import { lookupStudent } from '@/lib/api/students';

// Cùng luật với STUDENT_MSSV_REGEX của server (apps/api/src/common/student-mssv.ts) và `MSSV_REGEX` của roster-file.ts: 4–20 chữ
// hoặc số. Khớp từng ký tự — lệch ở đây thì hoặc gọi server vô ích (rồi 400), hoặc không bao giờ tra cho một MSSV hợp lệ.
const MSSV_REGEX = /^[A-Za-z0-9]{4,20}$/;

/**
 * Tra tên sinh viên theo MSSV đang gõ (spec §2.6). CHỈ chạy khi MSSV hợp lệ: server giới hạn 30 lần/phút/giảng viên để không ai quét
 * được danh sách, nên mỗi lần gọi thừa (MSSV chưa gõ xong) là một lần trừ vào hạn mức. `data === null` nghĩa là MSSV mới — giảng
 * viên nhập tên; có dữ liệu nghĩa là tên đã lưu, ô tên được điền sẵn và khoá. Không thử lại khi lỗi: 429 thử lại là tự làm hết hạn mức.
 *
 * Hạn mức đó nay là MỘT bộ đếm cho cả ba đường trả tên đã lưu (tra cứu, thêm tay vào lớp, thêm tay vào phiên — review cụm 2): mỗi
 * lần gọi thừa ở đây cũng trừ vào lượt thêm tay của chính giảng viên.
 */
export function useStudentLookup(rawMssv: string) {
  const mssv = rawMssv.trim();
  return useQuery({
    queryKey: ['students', 'lookup', mssv.toLowerCase()],
    queryFn: () => lookupStudent(mssv),
    enabled: MSSV_REGEX.test(mssv),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
