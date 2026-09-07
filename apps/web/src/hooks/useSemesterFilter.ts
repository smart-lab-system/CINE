'use client';

import { useEffect, useRef, useState } from 'react';
import { useSemesters } from '@/hooks/useDepartment';
import type { Semester } from '@/lib/api/department';

const DAY_MS = 86_400_000;

export interface SemesterFilterState {
  /** `null` = tất cả học kỳ. */
  semesterId: string | null;
  setSemesterId: (value: string | null) => void;
  semesters: Semester[];
  /** Kỳ đang gạt cờ, hoặc `null` khi chưa ai gạt. */
  current: Semester | null;
  isLoading: boolean;
  /** Kỳ hiện hành đã quá `end_date` — cờ không tự sửa, nên phải nói ra. */
  isStale: boolean;
  staleDays: number;
}

/**
 * Bộ lọc học kỳ dùng chung cho mọi màn hình danh sách.
 *
 * Logic gieo-một-lần nằm Ở ĐÂY, không ở từng trang. Năm trang tự gieo là năm
 * biến thể hơi khác nhau, và cái bẫy chỉ cần sai một chỗ: tính lại mặc định mỗi
 * render sẽ ghi đè lựa chọn của giảng viên ngay khi query refetch — đúng thứ
 * trang Quản lý bài thu đã phải học bằng `seededRef`.
 *
 * `scopeKey` là định danh TRANG, không phải dữ liệu. Ref reset theo nó, nên
 * điều hướng sang màn hình khác thì gieo lại từ kỳ hiện hành, còn dữ liệu về
 * lại trên cùng một trang thì không.
 */
export function useSemesterFilter(scopeKey: string): SemesterFilterState {
  const { data, isLoading } = useSemesters();
  const semesters = data ?? [];
  const current = semesters.find((s) => s.isCurrent) ?? null;

  const [semesterId, setSemesterId] = useState<string | null>(null);
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || seededFor.current === scopeKey) {
      return;
    }
    seededFor.current = scopeKey;
    // Không kỳ nào gạt cờ → để null ("tất cả"), KHÔNG đoán một kỳ. Trang sẽ
    // nói "Chưa có học kỳ hiện hành" thay vì âm thầm hiện sai kỳ.
    setSemesterId(current?.id ?? null);
  }, [isLoading, scopeKey, current?.id]);

  // `endDate` là một NGÀY, và ngày đó vẫn thuộc học kỳ — nên mốc "bắt đầu cũ"
  // là nửa đêm SAU nó. Không cộng thêm một ngày thì một kỳ kết thúc hôm nay
  // đã bị báo là quá hạn ngay trong ngày cuối của nó.
  const staleFrom = current ? new Date(current.endDate).getTime() + DAY_MS : 0;
  const staleMs = current ? Date.now() - staleFrom : 0;
  const isStale = current !== null && staleMs > 0;

  return {
    semesterId,
    setSemesterId,
    semesters,
    current,
    isLoading,
    isStale,
    staleDays: isStale ? Math.floor(staleMs / DAY_MS) : 0,
  };
}
