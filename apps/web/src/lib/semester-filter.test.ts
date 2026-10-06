import { describe, expect, it } from 'vitest';
import {
  ALL_SEMESTERS,
  academicYearLabel,
  academicYearOptions,
  isFiltering,
  matchesSemester,
  reconcileSelection,
  selectSemester,
  selectYear,
  termOptions,
  toQueryParams,
  type SemesterRef,
} from './semester-filter';

const sem = (id: string, year: number, term: number): SemesterRef => ({
  id,
  academicYearStart: year,
  term,
  label: `HK${term} ${year}-${year + 1}`,
});
// Cố ý để lộn xộn: bộ lọc không được dựa vào thứ tự đầu vào.
const SEMESTERS = [sem('b2', 2026, 2), sem('a1', 2025, 1), sem('b1', 2026, 1), sem('b3', 2026, 3)];

describe('academicYearLabel', () => {
  it('2026 → 2026-2027', () => expect(academicYearLabel(2026)).toBe('2026-2027'));
});

describe('academicYearOptions', () => {
  it('mỗi năm một lần, mới nhất trước', () => {
    expect(academicYearOptions(SEMESTERS)).toEqual([
      { value: 2026, label: '2026-2027' },
      { value: 2025, label: '2025-2026' },
    ]);
  });

  it('không có học kỳ nào thì không có năm nào', () => {
    expect(academicYearOptions([])).toEqual([]);
  });
});

describe('termOptions', () => {
  it('năm đã chọn: các kỳ của năm đó, kỳ 1 trước', () => {
    expect(termOptions(SEMESTERS, 2026).map((s) => s.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('chưa chọn năm: MỌI kỳ, mới nhất trước (chọn thẳng một kỳ vẫn được)', () => {
    expect(termOptions(SEMESTERS, null).map((s) => s.id)).toEqual(['b3', 'b2', 'b1', 'a1']);
  });

  it('năm không có kỳ nào thì rỗng', () => {
    expect(termOptions(SEMESTERS, 1999)).toEqual([]);
  });
});

describe('selectYear', () => {
  it('chọn năm không chọn kỳ = cả ba kỳ: semesterId là null', () => {
    expect(selectYear(ALL_SEMESTERS, 2026, SEMESTERS)).toEqual({ academicYear: 2026, semesterId: null });
  });

  it('đổi năm: kỳ đang chọn KHÔNG thuộc năm mới thì về "tất cả"', () => {
    const current = { academicYear: 2026, semesterId: 'b2' };
    expect(selectYear(current, 2025, SEMESTERS)).toEqual({ academicYear: 2025, semesterId: null });
  });

  it('đổi năm: kỳ đang chọn thuộc năm mới thì GIỮ', () => {
    // Trường hợp: đang ở "tất cả năm" với kỳ b2 (do chọn thẳng kỳ), rồi chọn đúng năm của nó.
    const current = { academicYear: null, semesterId: 'b2' };
    expect(selectYear(current, 2026, SEMESTERS)).toEqual({ academicYear: 2026, semesterId: 'b2' });
  });

  it('về "tất cả năm" xoá luôn kỳ đang chọn — một kỳ không có năm đi kèm là trạng thái không hiểu được', () => {
    expect(selectYear({ academicYear: 2026, semesterId: 'b2' }, null, SEMESTERS)).toEqual(ALL_SEMESTERS);
  });
});

describe('selectSemester', () => {
  it('chọn thẳng một kỳ thì năm học đi theo', () => {
    expect(selectSemester('a1', ALL_SEMESTERS, SEMESTERS)).toEqual({ academicYear: 2025, semesterId: 'a1' });
  });

  it('chọn "tất cả kỳ" giữ nguyên năm: quay về "cả năm"', () => {
    expect(selectSemester(null, { academicYear: 2026, semesterId: 'b2' }, SEMESTERS)).toEqual({
      academicYear: 2026,
      semesterId: null,
    });
  });

  it('id không có trong danh sách thì về "tất cả" thay vì lưu một id mồ côi', () => {
    expect(selectSemester('khong-co', ALL_SEMESTERS, SEMESTERS)).toEqual(ALL_SEMESTERS);
  });
});

describe('reconcileSelection (Review Focus 1)', () => {
  it('lựa chọn còn hợp lệ thì giữ nguyên', () => {
    const selection = { academicYear: 2026, semesterId: 'b2' };
    expect(reconcileSelection(selection, SEMESTERS)).toBe(selection);
  });

  it('học kỳ đã bị xoá thì về "tất cả"', () => {
    expect(reconcileSelection({ academicYear: 2026, semesterId: 'da-xoa' }, SEMESTERS)).toEqual(ALL_SEMESTERS);
  });

  it('năm không còn kỳ nào thì bỏ năm', () => {
    expect(reconcileSelection({ academicYear: 1999, semesterId: null }, SEMESTERS)).toEqual(ALL_SEMESTERS);
  });

  it('kỳ còn nhưng không thuộc năm đang ghi thì chỉnh năm theo kỳ', () => {
    expect(reconcileSelection({ academicYear: 2025, semesterId: 'b2' }, SEMESTERS)).toEqual({
      academicYear: 2026,
      semesterId: 'b2',
    });
  });

  it('danh sách học kỳ rỗng (chưa tải hoặc chưa có) KHÔNG làm mất lựa chọn trống', () => {
    expect(reconcileSelection(ALL_SEMESTERS, [])).toEqual(ALL_SEMESTERS);
  });
});

describe('matchesSemester', () => {
  const row = (semesterId: string | null, academicYear: number | null) => ({ semesterId, academicYear });

  it('không lọc thì khớp mọi dòng — kể cả dòng chưa có học kỳ', () => {
    expect(matchesSemester(ALL_SEMESTERS, row('b1', 2026))).toBe(true);
    expect(matchesSemester(ALL_SEMESTERS, row(null, null))).toBe(true);
  });

  it('lọc theo kỳ: so bằng KHOÁ', () => {
    const selection = { academicYear: 2026, semesterId: 'b2' };
    expect(matchesSemester(selection, row('b2', 2026))).toBe(true);
    expect(matchesSemester(selection, row('b1', 2026))).toBe(false);
  });

  it('lọc theo năm (không chọn kỳ): cả ba kỳ của năm đó', () => {
    const selection = { academicYear: 2026, semesterId: null };
    expect(matchesSemester(selection, row('b1', 2026))).toBe(true);
    expect(matchesSemester(selection, row('b3', 2026))).toBe(true);
    expect(matchesSemester(selection, row('a1', 2025))).toBe(false);
  });

  it('Review Focus 3: dòng chưa có học kỳ (dữ liệu cũ) KHÔNG khớp khi đang lọc — và không nổ', () => {
    expect(matchesSemester({ academicYear: 2026, semesterId: null }, row(null, null))).toBe(false);
    expect(matchesSemester({ academicYear: 2026, semesterId: 'b2' }, row(null, null))).toBe(false);
  });
});

describe('toQueryParams / isFiltering', () => {
  it('không lọc: không gửi tham số nào (vắng mặt = tất cả, không phải lỗi)', () => {
    expect(toQueryParams(ALL_SEMESTERS)).toEqual({});
    expect(isFiltering(ALL_SEMESTERS)).toBe(false);
  });

  it('có kỳ: chỉ gửi semesterId (chính xác hơn năm)', () => {
    expect(toQueryParams({ academicYear: 2026, semesterId: 'b2' })).toEqual({ semesterId: 'b2' });
    expect(isFiltering({ academicYear: 2026, semesterId: 'b2' })).toBe(true);
  });

  it('chỉ có năm: gửi academicYear', () => {
    expect(toQueryParams({ academicYear: 2026, semesterId: null })).toEqual({ academicYear: 2026 });
    expect(isFiltering({ academicYear: 2026, semesterId: null })).toBe(true);
  });
});
