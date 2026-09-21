'use client';

import { useCallback, useEffect, useState } from 'react';

export type SessionViewMode = 'table' | 'calendar';

const STORAGE_KEY = 'examcollect:exam-sessions:view';

/**
 * Nhớ giảng viên thích xem Bảng hay Lịch, qua các lần vào trang.
 *
 * LUÔN khởi tạo bằng `'table'` rồi mới đọc localStorage trong `useEffect`.
 * Đọc thẳng lúc khởi tạo sẽ cho ra hai kết quả khác nhau giữa server và
 * client (server không có `localStorage`), và React sẽ báo hydration
 * mismatch — hoặc tệ hơn, im lặng giữ cây HTML của server và lựa chọn đã
 * lưu không bao giờ hiện ra.
 *
 * Mọi truy cập đều bọc `try/catch`: ở chế độ riêng tư hoặc khi trình duyệt
 * chặn site data, chỉ đọc `localStorage` cũng ném. Một cái lịch không nhớ
 * được lựa chọn vẫn dùng tốt; một trang trắng thì không.
 */
export function useSessionViewMode(): [SessionViewMode, (next: SessionViewMode) => void] {
  const [view, setView] = useState<SessionViewMode>('table');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'calendar' || saved === 'table') {
        setView(saved);
      }
    } catch {
      // Không nhớ được thì thôi — mặc định 'table' vẫn là một trang dùng được.
    }
  }, []);

  const update = useCallback((next: SessionViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ghi hỏng không được phép làm hỏng lượt đổi chế độ đang diễn ra.
    }
  }, []);

  return [view, update];
}
