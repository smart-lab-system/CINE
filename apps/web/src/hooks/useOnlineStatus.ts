'use client';

import { useEffect, useState } from 'react';

/**
 * Máy giảng viên có mạng không — để màn "đang chấm" phân biệt "MÁY BẠN mất mạng" (việc chấm vẫn chạy trên máy
 * chủ, không bài nào bị ảnh hưởng) với "MÁY CHỦ không trả lời" (spec §3.8, T-UI-12). Hai chuyện cần hai câu nói
 * khác nhau, và chỉ trình duyệt biết cái đầu.
 *
 * Khởi đầu `true` khi render trên server (không có `navigator`), rồi đồng bộ ngay khi vào trình duyệt.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
