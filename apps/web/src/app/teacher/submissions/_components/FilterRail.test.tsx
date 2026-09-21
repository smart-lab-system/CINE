import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EMPTY_FILTERS } from '@/lib/submission-filters';
import { FilterRail } from './FilterRail';

const facets = {
  semesters: [
    { value: 'sem-1', label: 'Học kỳ 1 2026-2027', count: 12 },
    { value: 'sem-0', label: 'Học kỳ 2 2025-2026', count: 8 },
  ],
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

const onChange = vi.fn();
beforeEach(() => onChange.mockReset());

describe('FilterRail', () => {
  it('lọc theo LỚP gửi lên classId, không gửi tên lớp', () => {
    // Nhãn là tên để đọc, nhưng khoá phải là id: hai lớp trùng tên hiển
    // thị vẫn là hai lớp khác nhau, và lọc theo tên sẽ trộn bài của chúng.
    render(<FilterRail facets={facets} filters={EMPTY_FILTERS} onChange={onChange} attentionTotal={6} />);
    fireEvent.click(screen.getByRole('button', { name: /N01/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ classIds: ['k-1'] }));
  });

  it('chỉ một lớp thì KHÔNG hiện nhóm lọc lớp', () => {
    // Cùng luật với Phòng và Loại kỳ thi: một lựa chọn là nhiễu. Học kỳ cố
    // ý KHÔNG theo luật này — xem chú thích trong FilterRail.
    render(
      <FilterRail
        facets={{ ...facets, classes: [] }}
        filters={EMPTY_FILTERS}
        onChange={onChange}
        attentionTotal={6}
      />,
    );
    expect(screen.queryByText('Lớp')).not.toBeInTheDocument();
  });

  it('hiện tổng số phiên cần chú ý', () => {
    render(<FilterRail facets={facets} filters={EMPTY_FILTERS} onChange={onChange} attentionTotal={6} />);
    // Không dùng getByText('6') trần: một facet count cũng có thể bằng 6.
    // Con số này chỉ có nghĩa khi đọc kèm nhãn của nó, nên khoá cả cụm.
    expect(screen.getByText('phiên cần chú ý').closest('p')).toHaveTextContent('6phiên cần chú ý');
  });

  it('bấm một mức gọi onChange với kind đó', () => {
    render(<FilterRail facets={facets} filters={EMPTY_FILTERS} onChange={onChange} attentionTotal={6} />);
    fireEvent.click(screen.getByRole('button', { name: /Nghi mất bài/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kinds: ['attended-no-submission'] }),
    );
  });

  it('bấm lại mức đang bật thì gỡ nó ra', () => {
    render(
      <FilterRail
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
      <FilterRail
        facets={{ ...facets, rooms: [] }}
        filters={EMPTY_FILTERS}
        onChange={onChange}
        attentionTotal={6}
      />,
    );
    expect(screen.queryByText('Phòng thi')).not.toBeInTheDocument();
    expect(screen.getByText('Loại kỳ thi')).toBeInTheDocument();
  });

  it('ô chọn học kỳ vẫn hiện khi giảng viên CHỈ dạy một kỳ', () => {
    // Khác `rooms`/`examTypes` một cách có chủ đích. Giảng viên mới chỉ
    // có phiên trong đúng một kỳ, và bản trước ẩn ô này đi — họ đọc thành
    // "chức năng lọc theo học kỳ đã bị gỡ". Học kỳ là chiều THỜI GIAN:
    // thấy mình đang đứng ở kỳ nào là một phần của thông tin, kể cả khi
    // chỉ có một lựa chọn.
    render(
      <FilterRail
        facets={{ ...facets, semesters: [facets.semesters[0]] }}
        filters={{ ...EMPTY_FILTERS, semesterName: 'sem-1' }}
        onChange={onChange}
        attentionTotal={6}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toBeInTheDocument();
  });

  it('chọn "Tất cả học kỳ" trả semesterName về null', () => {
    render(
      <FilterRail
        facets={facets}
        filters={{ ...EMPTY_FILTERS, semesterName: 'sem-1' }}
        onChange={onChange}
        attentionTotal={6}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    fireEvent.click(screen.getByRole('option', { name: 'Tất cả học kỳ' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ semesterName: null }));
  });

  it('link xoá bộ lọc chỉ hiện khi có bộ lọc đang bật', () => {
    const { rerender } = render(
      <FilterRail facets={facets} filters={EMPTY_FILTERS} onChange={onChange} attentionTotal={6} />,
    );
    expect(screen.queryByRole('button', { name: /Xoá tất cả bộ lọc/ })).not.toBeInTheDocument();

    rerender(
      <FilterRail facets={facets} filters={{ ...EMPTY_FILTERS, rooms: ['A3-01'] }}
        onChange={onChange} attentionTotal={5} />,
    );
    expect(screen.getByRole('button', { name: /Xoá tất cả bộ lọc/ })).toBeInTheDocument();
  });
});
