'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALL_SEMESTERS,
  matchesSemester,
  reconcileSelection,
  selectSemester,
  selectYear,
  toQueryParams,
  type SemesterRef,
  type SemesterSelection,
} from '@/lib/semester-filter';
import { useSemesters } from './useSemesters';

export interface SemesterYearFilterState {
  semesters: SemesterRef[];
  isLoading: boolean;
  selection: SemesterSelection;
  setYear: (year: number | null) => void;
  setSemester: (semesterId: string | null) => void;
  clear: () => void;
  /** Tham số cho truy vấn lọc ở server. Không lọc thì rỗng (vắng mặt = tất cả). */
  params: { semesterId?: string; academicYear?: number };
  /** Một dòng đã tải có khớp không — cho trang lọc trong trình duyệt. */
  matches: (item: { semesterId: string | null; academicYear: number | null }) => boolean;
}

/**
 * Trạng thái của bộ lọc Năm học → Học kỳ cho MỘT màn hình (spec §7.2). Thay `useSemesterFilter` (theo chuỗi).
 *
 * - **Mặc định "Tất cả" ở mọi màn hình.** Không đoán hộ ai "kỳ hiện tại": một bộ lọc mặc định đã che mất bài chưa chấm của kỳ cũ.
 * - **Mỗi màn hình giữ bộ lọc riêng** (`scopeKey`): sang màn hình khác thì về mặc định, về lại cùng trang thì giữ — quyết định hiện tại.
 * - **Lựa chọn mồ côi tự về "Tất cả"**: học kỳ vừa bị admin xoá không để lại một bộ lọc trỏ vào thứ không còn. Chỉ dọn khi danh sách ĐÃ
 *   tải xong — danh sách rỗng vì chưa tải không phải bằng chứng rằng kỳ đã xoá.
 */
export function useSemesterYearFilter(scopeKey: string): SemesterYearFilterState {
  const query = useSemesters();
  const semesters = useMemo<SemesterRef[]>(() => query.data ?? [], [query.data]);
  const [raw, setRaw] = useState<SemesterSelection>(ALL_SEMESTERS);
  const scopedTo = useRef(scopeKey);

  useEffect(() => {
    if (scopedTo.current === scopeKey) return;
    scopedTo.current = scopeKey;
    setRaw(ALL_SEMESTERS);
  }, [scopeKey]);

  // Giá trị DẪN XUẤT, không phải effect ghi ngược vào state: `selection` luôn nhất quán với danh sách học kỳ ở mọi lần render, không có
  // một khung hình trung gian trỏ vào kỳ đã xoá.
  const selection = useMemo(
    () => (query.isSuccess ? reconcileSelection(raw, semesters) : raw),
    [raw, semesters, query.isSuccess],
  );

  const setYear = useCallback(
    (year: number | null) => setRaw((current) => selectYear(current, year, semesters)),
    [semesters],
  );
  const setSemester = useCallback(
    (semesterId: string | null) => setRaw((current) => selectSemester(semesterId, current, semesters)),
    [semesters],
  );
  const clear = useCallback(() => setRaw(ALL_SEMESTERS), []);
  const matches = useCallback(
    (item: { semesterId: string | null; academicYear: number | null }) => matchesSemester(selection, item),
    [selection],
  );

  return {
    semesters,
    isLoading: query.isLoading,
    selection,
    setYear,
    setSemester,
    clear,
    params: toQueryParams(selection),
    matches,
  };
}
