'use client';

import { useEffect, useState } from 'react';

/**
 * Đồng hồ cho giao diện phụ thuộc "bây giờ": nút Sửa chỉ bật TRƯỚC giờ bắt đầu, nên một trang mở lâu phải tự tắt nút khi phiên tới giờ, không để
 * người dùng bấm vào một cửa sổ đã đóng rồi mới nhận 409. Làm mới mỗi `intervalMs` (mặc định 30 giây — ranh giới là phút nên đủ mịn).
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
