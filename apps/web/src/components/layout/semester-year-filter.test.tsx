import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ALL_SEMESTERS } from '@/lib/semester-filter';
import { SemesterYearFilter } from './semester-year-filter';

const sem = (id: string, year: number, term: number) => ({
  id,
  academicYearStart: year,
  term,
  label: `HK${term} ${year}-${year + 1}`,
});
const SEMESTERS = [sem('b1', 2026, 1), sem('b2', 2026, 2), sem('a1', 2025, 1)];

function setup(selection = ALL_SEMESTERS) {
  const onYearChange = vi.fn();
  const onSemesterChange = vi.fn();
  render(
    <SemesterYearFilter
      semesters={SEMESTERS}
      selection={selection}
      onYearChange={onYearChange}
      onSemesterChange={onSemesterChange}
    />,
  );
  return { onYearChange, onSemesterChange };
}

describe('SemesterYearFilter', () => {
  it('hai ô liên kết, mặc định "Tất cả"', () => {
    setup();
    expect(screen.getByRole('combobox', { name: 'Lọc theo năm học' })).toHaveTextContent('Tất cả năm học');
    expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toHaveTextContent('Tất cả học kỳ');
  });

  it('ô năm liệt kê năm học từ bảng học kỳ, mới nhất trước; chọn năm gọi onYearChange(năm)', () => {
    const { onYearChange } = setup();

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo năm học' }));
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Tất cả năm học', '2026-2027', '2025-2026']);

    fireEvent.click(screen.getByRole('option', { name: '2026-2027' }));
    expect(onYearChange).toHaveBeenCalledWith(2026);
  });

  it('chọn "Tất cả năm học" gọi onYearChange(null)', () => {
    const { onYearChange } = setup({ academicYear: 2026, semesterId: null });

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo năm học' }));
    fireEvent.click(screen.getByRole('option', { name: 'Tất cả năm học' }));

    expect(onYearChange).toHaveBeenCalledWith(null);
  });

  it('đã chọn năm: ô kỳ chỉ liệt kê các kỳ của năm đó; chọn một kỳ gọi onSemesterChange(id)', () => {
    const { onSemesterChange } = setup({ academicYear: 2026, semesterId: null });

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Tất cả học kỳ',
      'HK1 2026-2027',
      'HK2 2026-2027',
    ]);

    fireEvent.click(screen.getByRole('option', { name: 'HK2 2026-2027' }));
    expect(onSemesterChange).toHaveBeenCalledWith('b2');
  });

  it('chưa chọn năm: ô kỳ liệt kê MỌI kỳ để chọn thẳng', () => {
    setup();
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Tất cả học kỳ',
      'HK2 2026-2027',
      'HK1 2026-2027',
      'HK1 2025-2026',
    ]);
  });

  it('hiện giá trị đang chọn', () => {
    setup({ academicYear: 2026, semesterId: 'b2' });
    expect(screen.getByRole('combobox', { name: 'Lọc theo năm học' })).toHaveTextContent('2026-2027');
    expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toHaveTextContent('HK2 2026-2027');
  });

  it('chưa có học kỳ nào: vẫn vẽ, chỉ có "Tất cả" — bộ lọc không bao giờ chặn thao tác', () => {
    render(
      <SemesterYearFilter semesters={[]} selection={ALL_SEMESTERS} onYearChange={vi.fn()} onSemesterChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo năm học' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Tất cả năm học']);
  });
});
