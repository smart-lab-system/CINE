import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EMPTY_FILTERS } from '@/lib/submission-filters';
import { FilterRail } from './FilterRail';

const facets = {
  kinds: [
    { value: 'attended-no-submission', label: 'Nghi mất bài', count: 1 },
    { value: 'partial', label: 'Thiếu file', count: 2 },
    { value: 'never-attended', label: 'Vắng thi', count: 3 },
    { value: 'complete', label: 'Đã đủ', count: 6 },
  ],
  examTypes: [
    { value: 'GK', label: 'Giữa kỳ', count: 4 },
    { value: 'CK', label: 'Cuối kỳ', count: 3 },
  ],
  rooms: [
    { value: 'A3-01', label: 'A3-01', count: 5 },
    { value: 'A3-02', label: 'A3-02', count: 2 },
  ],
  classes: [
    { value: 'k-1', label: 'N01', count: 4 },
    { value: 'k-2', label: 'N02', count: 3 },
  ],
  archivedCount: 4,
  closedCount: 1,
};

const SEMESTERS = [
  { id: 'sem-2', academicYearStart: 2026, term: 2, label: 'HK2 2026-2027' },
  { id: 'sem-1', academicYearStart: 2026, term: 1, label: 'HK1 2026-2027' },
  { id: 'sem-0', academicYearStart: 2025, term: 2, label: 'HK2 2025-2026' },
];

const onChange = vi.fn();
beforeEach(() => onChange.mockReset());

describe('FilterRail', () => {
  it('lọc theo LỚP gửi lên classId, không gửi tên lớp', () => {
    // Nhãn là tên để đọc, nhưng khoá phải là id: hai lớp trùng tên hiển
    // thị vẫn là hai lớp khác nhau, và lọc theo tên sẽ trộn bài của chúng.
    render(<FilterRail semesters={SEMESTERS} facets={facets} filters={EMPTY_FILTERS} onChange={onChange} attentionTotal={6} />);
    fireEvent.click(screen.getByRole('button', { name: /N01/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ classIds: ['k-1'] }));
  });

  it('chỉ một lớp thì KHÔNG hiện nhóm lọc lớp', () => {
    // Cùng luật với Phòng và Loại kỳ thi: một lựa chọn là nhiễu. Học kỳ cố
    // ý KHÔNG theo luật này — xem chú thích trong FilterRail.
    render(
      <FilterRail semesters={SEMESTERS}
        facets={{ ...facets, classes: [] }}
        filters={EMPTY_FILTERS}
        onChange={onChange}
        attentionTotal={6}
      />,
    );
    expect(screen.queryByText('Lớp')).not.toBeInTheDocument();
  });

  it('hiện tổng số phiên cần chú ý', () => {
    render(<FilterRail semesters={SEMESTERS} facets={facets} filters={EMPTY_FILTERS} onChange={onChange} attentionTotal={6} />);
    // Không dùng getByText('6') trần: một facet count cũng có thể bằng 6.
    // Con số này chỉ có nghĩa khi đọc kèm nhãn của nó, nên khoá cả cụm.
    expect(screen.getByText('phiên cần chú ý').closest('p')).toHaveTextContent('6phiên cần chú ý');
  });

  it('bấm một mức gọi onChange với kind đó', () => {
    render(<FilterRail semesters={SEMESTERS} facets={facets} filters={EMPTY_FILTERS} onChange={onChange} attentionTotal={6} />);
    fireEvent.click(screen.getByRole('button', { name: /Nghi mất bài/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kinds: ['attended-no-submission'] }),
    );
  });

  it('bấm lại mức đang bật thì gỡ nó ra', () => {
    render(
      <FilterRail semesters={SEMESTERS}
        facets={facets}
        filters={{ ...EMPTY_FILTERS, kinds: ['attended-no-submission'] }}
        onChange={onChange}
        attentionTotal={1}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Nghi mất bài/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kinds: [] }));
  });

  it('nhóm rỗng (<=1 giá trị) KHÔNG được render', () => {
    render(
      <FilterRail semesters={SEMESTERS}
        facets={{ ...facets, rooms: [] }}
        filters={EMPTY_FILTERS}
        onChange={onChange}
        attentionTotal={6}
      />,
    );
    expect(screen.queryByText('Phòng thi')).not.toBeInTheDocument();
    expect(screen.getByText('Loại kỳ thi')).toBeInTheDocument();
  });

  it('Review Focus 4: ô chọn học kỳ LUÔN hiện, kể cả khi bảng học kỳ chỉ có một kỳ — và liệt kê kỳ KHÔNG có phiên nào', () => {
    // Danh sách lấy từ BẢNG học kỳ (`semesters`), không từ `facets`: một kỳ mà giảng viên chưa có phiên nào vẫn phải chọn được.
    render(
      <FilterRail
        semesters={[SEMESTERS[1]]}
        facets={facets}
        filters={EMPTY_FILTERS}
        onChange={onChange}
        attentionTotal={6}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Lọc theo năm học' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    expect(screen.getByRole('option', { name: 'HK1 2026-2027' })).toBeInTheDocument();
  });

  it('chọn một kỳ gọi onChange với semester { academicYear, semesterId } — năm đi theo kỳ', () => {
    render(<FilterRail semesters={SEMESTERS} facets={facets} filters={EMPTY_FILTERS} onChange={onChange} attentionTotal={6} />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    fireEvent.click(screen.getByRole('option', { name: 'HK2 2025-2026' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ semester: { academicYear: 2025, semesterId: 'sem-0' } }),
    );
  });

  it('chọn một năm: cả ba kỳ của năm đó (semesterId null); đổi năm thì kỳ không thuộc năm mới về "tất cả"', () => {
    render(
      <FilterRail
        semesters={SEMESTERS}
        facets={facets}
        filters={{ ...EMPTY_FILTERS, semester: { academicYear: 2026, semesterId: 'sem-2' } }}
        onChange={onChange}
        attentionTotal={6}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo năm học' }));
    fireEvent.click(screen.getByRole('option', { name: '2025-2026' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ semester: { academicYear: 2025, semesterId: null } }),
    );
  });

  it('chọn "Tất cả học kỳ" giữ năm đang chọn và bỏ kỳ', () => {
    render(
      <FilterRail
        semesters={SEMESTERS}
        facets={facets}
        filters={{ ...EMPTY_FILTERS, semester: { academicYear: 2026, semesterId: 'sem-2' } }}
        onChange={onChange}
        attentionTotal={6}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    fireEvent.click(screen.getByRole('option', { name: 'Tất cả học kỳ' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ semester: { academicYear: 2026, semesterId: null } }),
    );
  });

  it('Review Focus 6: "Xoá tất cả bộ lọc" GIỮ học kỳ — học kỳ là phạm vi đang xem, không phải một bộ lọc trong phạm vi đó', () => {
    const semester = { academicYear: 2026, semesterId: 'sem-1' };
    render(
      <FilterRail
        semesters={SEMESTERS}
        facets={facets}
        filters={{ ...EMPTY_FILTERS, semester, rooms: ['A3-01'] }}
        onChange={onChange}
        attentionTotal={5}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Xoá tất cả bộ lọc/ }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, semester });
  });

  it('chỉ chọn học kỳ KHÔNG làm hiện link xoá bộ lọc (không tính vào `hasActive`)', () => {
    render(
      <FilterRail
        semesters={SEMESTERS}
        facets={facets}
        filters={{ ...EMPTY_FILTERS, semester: { academicYear: 2026, semesterId: 'sem-1' } }}
        onChange={onChange}
        attentionTotal={6}
      />,
    );
    expect(screen.queryByRole('button', { name: /Xoá tất cả bộ lọc/ })).not.toBeInTheDocument();
  });

  it('link xoá bộ lọc chỉ hiện khi có bộ lọc đang bật', () => {
    const { rerender } = render(
      <FilterRail semesters={SEMESTERS} facets={facets} filters={EMPTY_FILTERS} onChange={onChange} attentionTotal={6} />,
    );
    expect(screen.queryByRole('button', { name: /Xoá tất cả bộ lọc/ })).not.toBeInTheDocument();

    rerender(
      <FilterRail semesters={SEMESTERS} facets={facets} filters={{ ...EMPTY_FILTERS, rooms: ['A3-01'] }}
        onChange={onChange} attentionTotal={5} />,
    );
    expect(screen.getByRole('button', { name: /Xoá tất cả bộ lọc/ })).toBeInTheDocument();
  });
});
