'use client';

import { useEffect, useRef, useState } from 'react';

export interface SemesterFilterState {
  /** `null` = tất cả học kỳ. */
  semesterName: string | null;
  setSemesterName: (value: string | null) => void;
}

/**
 * Bộ lọc học kỳ, sau khi học kỳ thôi là một hàng trong cơ sở dữ liệu.
 *
 * TRƯỚC ĐÂY hook này làm hai việc: chọn ra "kỳ hợp lý nhất hôm nay" từ
 * `start_date`/`end_date` của bảng `semester`, rồi gieo nó làm giá trị mặc
 * định của bộ lọc. Đợt thu hẹp master data bỏ bảng đó. Học kỳ giờ là một
 * chuỗi giảng viên gõ vào lúc tạo phiên thi, và một chuỗi thì **không có
 * ngày tháng** — nên câu hỏi "hôm nay là kỳ nào" không còn trả lời được, và
 * banner "kỳ mặc định đã quá hạn" không còn tính được.
 *
 * Thay bằng thứ trung thực hơn: MẶC ĐỊNH LÀ TẤT CẢ, và danh sách lựa chọn
 * đến từ chính các phiên giảng viên đã tạo (xem `semesterOptions`). Không
 * đoán hộ ai, và không có màn hình nào mở ra đã lọc sẵn theo một kỳ mà
 * người dùng không chọn.
 *
 * `scopeKey` vẫn ở đây để lựa chọn không rò rỉ giữa các trang: điều hướng
 * sang màn hình khác thì bộ lọc trở về "tất cả", còn dữ liệu về lại trên
 * cùng trang thì giữ nguyên thứ người dùng vừa chọn.
 */
export function useSemesterFilter(scopeKey: string): SemesterFilterState {
  const [semesterName, setSemesterName] = useState<string | null>(null);
  const scopedTo = useRef(scopeKey);

  useEffect(() => {
    if (scopedTo.current === scopeKey) {
      return;
    }
    scopedTo.current = scopeKey;
    setSemesterName(null);
  }, [scopeKey]);

  return { semesterName, setSemesterName };
}

/**
 * Các học kỳ có thật trong dữ liệu đang xem, mỗi cách viết một lần.
 *
 * Nguồn là dữ liệu trang đã tải, không phải một endpoint riêng: không còn
 * bảng nào để liệt kê, và "những kỳ giảng viên này đã dùng" chính xác là
 * tập hợp mà bộ lọc cần nói tới.
 *
 * Sắp giảm dần để kỳ gần nhất đứng đầu — với cách đặt tên thông thường
 * ("HK1 2026-2027") thì sắp chuỗi giảm dần cũng là sắp theo thời gian.
 * Không phải lúc nào cũng đúng, và đó là cái giá của việc bỏ cột ngày.
 */
export function semesterOptions(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
    b.localeCompare(a),
  );
}
