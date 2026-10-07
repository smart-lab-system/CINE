import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DEFAULT_VIEW, groupRows } from '@/lib/session-list';
import { NOW, rowsOf, session, summary } from '@/lib/session-list.fixtures';
import { SessionTable, type SessionTableProps } from './SessionTable';

const rows = rowsOf(
  [
    session({ id: 'a', name: 'Kiểm tra giữa kỳ', className: 'DHKTPM18ATT', roomName: 'Phòng máy A1' }),
    session({ id: 'b', name: 'TEST dien tap - xoa sau 1790588688826', rubricId: null, className: 'DHKTPM19BTT', roomName: 'H3.03', classId: 'c2' }),
    session({ id: 'c', name: 'Kiểm tra cuối kỳ', examType: 'CK' }),
  ],
  [summary('a', { flagged_for_review: 11, ai_grading: 4, auto_approved: 23 }), summary('b'), summary('c', { finalized: 38 })],
);

function props(over: Partial<SessionTableProps> = {}): SessionTableProps {
  return {
    groups: groupRows(rows, 'none'),
    view: DEFAULT_VIEW,
    onSort: vi.fn(),
    selected: new Set(),
    onToggleRows: vi.fn(),
    collapsed: new Set(),
    onToggleGroup: vi.fn(),
    onStart: vi.fn(),
    density: 'cozy',
    now: NOW,
    ...over,
  };
}

// Tên chính xác, không regex: liên kết hành động ở cuối hàng có aria-label lặp lại tên phiên nên regex khớp cả hai.
const rowOf = (name: string) => screen.getByRole('link', { name }).closest('tr') as HTMLElement;

describe('SessionTable', () => {
  it('shows name, class · room, date, submitted count, status and a caption per row', () => {
    render(<SessionTable {...props()} />);
    const row = rowOf('Kiểm tra giữa kỳ');
    expect(within(row).getByText(/DHKTPM18ATT/)).toBeInTheDocument();
    expect(within(row).getByText(/Phòng máy A1/)).toBeInTheDocument();
    expect(within(row).getByText('28/09/2026')).toBeInTheDocument();
    expect(within(row).getByText('07:30')).toBeInTheDocument();
    expect(within(row).getByText('38')).toBeInTheDocument();
    expect(within(row).getByText('Cần bạn xem')).toBeInTheDocument();
    expect(within(row).getByText('11 cần xem · 4 đang chấm')).toBeInTheDocument();
  });

  it('never writes "Phòng Phòng": the room name is shown as typed', () => {
    render(<SessionTable {...props()} />);
    expect(screen.queryByText(/Phòng Phòng/)).not.toBeInTheDocument();
  });

  it('the name is a link that keeps the session in the URL', () => {
    render(<SessionTable {...props()} />);
    expect(screen.getByRole('link', { name: 'Kiểm tra giữa kỳ' })).toHaveAttribute('href', '/teacher/grading?sessionId=a');
  });

  it('a long name keeps its distinguishing tail in the DOM (title carries the full text)', () => {
    render(<SessionTable {...props()} />);
    expect(screen.getByRole('link', { name: 'TEST dien tap - xoa sau 1790588688826' })).toHaveAttribute('title', 'TEST dien tap - xoa sau 1790588688826');
  });

  it('each row has the action its status calls for', () => {
    render(<SessionTable {...props()} />);
    expect(within(rowOf('Kiểm tra giữa kỳ')).getByRole('link', { name: /Xem xét/ })).toHaveAttribute('href', '/teacher/grading?sessionId=a&state=needsYou');
    expect(within(rowOf('TEST dien tap - xoa sau 1790588688826')).getByRole('link', { name: /Chuẩn bị/ })).toBeInTheDocument();
    expect(within(rowOf('Kiểm tra cuối kỳ')).getByRole('link', { name: /Mở kết quả/ })).toBeInTheDocument();
  });

  it('a todo session with no blocker gets a button that opens the confirm dialog, not a link', () => {
    const ready = rowsOf([session({ id: 'r', name: 'Sẵn sàng' })], [summary('r')]);
    const p = props({ groups: groupRows(ready, 'none') });
    render(<SessionTable {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu chấm/ }));
    expect(p.onStart).toHaveBeenCalledWith(ready[0]);
  });

  it('says why a todo session cannot start', () => {
    render(<SessionTable {...props()} />);
    expect(within(rowOf('TEST dien tap - xoa sau 1790588688826')).getByText('Thiếu rubric')).toBeInTheDocument();
  });

  it('the progress bar is readable without colour: it carries the full numbers', () => {
    render(<SessionTable {...props()} />);
    expect(screen.getByRole('img', { name: /11 cần xem, 4 đang chấm, 23 chờ chốt/ })).toBeInTheDocument();
  });

  it('a row checkbox toggles exactly that row', () => {
    const p = props();
    render(<SessionTable {...p} />);
    fireEvent.click(within(rowOf('Kiểm tra giữa kỳ')).getByRole('checkbox'));
    expect(p.onToggleRows).toHaveBeenCalledWith(['a'], true);
  });

  it('the header checkbox selects every visible row, and is indeterminate when some are', () => {
    const p = props({ selected: new Set(['a']) });
    render(<SessionTable {...p} />);
    const head = screen.getByRole('checkbox', { name: /Chọn tất cả/ }) as HTMLInputElement;
    expect(head.indeterminate).toBe(true);
    fireEvent.click(head);
    expect(p.onToggleRows).toHaveBeenCalledWith(['a', 'b', 'c'], true);
  });

  it('header sort buttons call onSort and mark the active column', () => {
    const p = props();
    render(<SessionTable {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Ngày thi/ }));
    expect(p.onSort).toHaveBeenCalledWith('date');
    expect(screen.getByRole('columnheader', { name: /Trạng thái/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: /Ngày thi/ })).toHaveAttribute('aria-sort', 'none');
  });

  it('grouped: a header per group, collapsing hides its rows, the group checkbox selects the group', () => {
    const groups = groupRows(rows, 'class');
    const collapsed = new Set([groups[0].key!]);
    const p = props({ groups, collapsed });
    render(<SessionTable {...p} />);
    expect(screen.getByRole('button', { name: /DHKTPM18ATT/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Kiểm tra giữa kỳ' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Chọn cả nhóm DHKTPM18ATT/ }));
    expect(p.onToggleRows).toHaveBeenCalledWith(['a', 'c'], true);
  });

  it('while statuses are unknown the row still renders, with dashes and a plain open link', () => {
    const unknown = rowsOf([session({ id: 'u', name: 'Chưa rõ' })], undefined);
    render(<SessionTable {...props({ groups: groupRows(unknown, 'none') })} />);
    const row = rowOf('Chưa rõ');
    expect(within(row).getByRole('link', { name: /^Mở/ })).toBeInTheDocument();
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0);
  });
});
