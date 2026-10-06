import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { EMPTY_LIST_FILTERS, facetOptions, type ListFilters } from '@/lib/session-list';
import { NOW, SEMESTERS, SEM_HK1_2026, SEM_HK2_2025, rowsOf, session } from '@/lib/session-list.fixtures';
import { FilterBar, type FilterBarProps } from './FilterBar';
import { StatusTabs } from './StatusTabs';

const rows = rowsOf(
  [
    session({ id: 'a', classId: 'c1', classLabel: 'DHKTPM18ATT' }),
    session({ id: 'b', classId: 'c2', classLabel: 'DHKTPM19BTT', rubricId: null }),
  ],
  [],
);

function setup(filters: ListFilters = EMPTY_LIST_FILTERS, over: Partial<FilterBarProps> = {}) {
  const onChange = vi.fn();
  render(
    <FilterBar
      filters={filters}
      options={facetOptions(rows, filters, NOW)}
      semesters={SEMESTERS}
      noRubricCount={1}
      onChange={onChange}
      searchRef={createRef<HTMLInputElement>()}
      {...over}
    />,
  );
  return onChange;
}

const openMenu = (name: RegExp) => fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' });

describe('FilterBar', () => {
  it('typing in the search box reports the text', () => {
    const onChange = setup();
    fireEvent.change(screen.getByRole('searchbox', { name: /Tìm phiên/ }), { target: { value: 'giua ky' } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_LIST_FILTERS, q: 'giua ky' });
  });

  it('"Thiếu rubric" toggles and shows how many sessions it would leave', () => {
    const onChange = setup();
    const button = screen.getByRole('button', { name: /Thiếu rubric/ });
    expect(button).toHaveTextContent('1');
    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_LIST_FILTERS, noRubric: true });
  });

  it('a facet menu lists the values with counts; choosing one adds it to the filter', () => {
    const onChange = setup();
    openMenu(/^Lớp/);
    const item = screen.getByRole('menuitemcheckbox', { name: /DHKTPM19BTT/ });
    expect(item).toHaveTextContent('1');
    fireEvent.click(item);
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_LIST_FILTERS, classIds: ['c2'] });
  });

  it('choosing a value that is already chosen removes it', () => {
    const onChange = setup({ ...EMPTY_LIST_FILTERS, classIds: ['c1', 'c2'] });
    openMenu(/^Lớp/);
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /DHKTPM18ATT/ }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_LIST_FILTERS, classIds: ['c2'] });
  });

  it('the facet button names what is chosen', () => {
    setup({ ...EMPTY_LIST_FILTERS, classIds: ['c2'] });
    expect(screen.getByRole('button', { name: /^Lớp/ })).toHaveTextContent('DHKTPM19BTT');
  });

  it('has no semester dropdown of its own: the shared year → semester pair is the filter', () => {
    setup();
    expect(screen.getByRole('combobox', { name: 'Lọc theo năm học' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Học kỳ/ })).not.toBeInTheDocument();
  });

  it('choosing a year reports it and leaves the term on "all" (a whole year)', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo năm học' }));
    fireEvent.click(screen.getByRole('option', { name: '2025-2026' }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_LIST_FILTERS, semester: { academicYear: 2025, semesterId: null } });
  });

  it('choosing a term carries its year with it; a term nobody has a session in is still offered', () => {
    const onChange = setup(); // không phiên nào ở HK2 2025-2026 trong `rows`
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    fireEvent.click(screen.getByRole('option', { name: 'HK2 2025-2026' }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_LIST_FILTERS, semester: { academicYear: 2025, semesterId: SEM_HK2_2025 } });
  });

  it('Review Focus 1: a semester alone makes "Xoá bộ lọc" appear, and clearing resets it too', () => {
    const onChange = setup({ ...EMPTY_LIST_FILTERS, semester: { academicYear: 2026, semesterId: SEM_HK1_2026 } });
    fireEvent.click(screen.getByRole('button', { name: /Xoá bộ lọc/ }));
    expect(onChange).toHaveBeenCalledWith(EMPTY_LIST_FILTERS);
  });

  it('"Xoá bộ lọc" appears only when something is filtered', () => {
    setup();
    expect(screen.queryByRole('button', { name: /Xoá bộ lọc/ })).not.toBeInTheDocument();
  });

  it('clearing resets every filter, status included', () => {
    const onChange = setup({ ...EMPTY_LIST_FILTERS, q: 'x', status: 'done', rooms: ['A1'] });
    fireEvent.click(screen.getByRole('button', { name: /Xoá bộ lọc/ }));
    expect(onChange).toHaveBeenCalledWith(EMPTY_LIST_FILTERS);
  });
});

describe('StatusTabs', () => {
  const counts = { all: 20, attention: 4, ready: 3, todo: 3, running: 1, done: 9 };

  it('shows every status with its count and marks the chosen one', () => {
    render(<StatusTabs counts={counts} value="attention" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Tất cả/ })).toHaveTextContent('20');
    const attention = screen.getByRole('button', { name: /Cần bạn xem/ });
    expect(attention).toHaveTextContent('4');
    expect(attention).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Đã chốt/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('choosing a tab reports it', () => {
    const onChange = vi.fn();
    render(<StatusTabs counts={counts} value="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Sẵn sàng chốt/ }));
    expect(onChange).toHaveBeenCalledWith('ready');
  });

  it('renders nothing while the statuses are unknown — no tab is better than a wrong count', () => {
    const { container } = render(<StatusTabs counts={null} value="all" onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
