import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { groupRows } from '@/lib/session-list';
import { NOW, rowsOf, session, summary } from '@/lib/session-list.fixtures';
import { SessionCards, type SessionCardsProps } from './SessionCards';

const rows = rowsOf(
  [
    session({ id: 'a', name: 'Kiểm tra giữa kỳ', className: 'DHKTPM18ATT', roomName: 'Phòng máy A1' }),
    session({ id: 'b', name: 'TEST dien tap - xoa sau 1790588688826', rubricId: null, className: 'DHKTPM19BTT', roomName: 'H3.03', classId: 'c2' }),
    session({ id: 'c', name: 'Kiểm tra cuối kỳ', examType: 'CK' }),
  ],
  [summary('a', { flagged_for_review: 11, ai_grading: 4, auto_approved: 23 }), summary('b'), summary('c', { finalized: 38 })],
);

function props(over: Partial<SessionCardsProps> = {}): SessionCardsProps {
  return {
    groups: groupRows(rows, 'none'),
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

// Tên chính xác, không regex: liên kết hành động có aria-label lặp lại tên phiên nên regex khớp cả hai.
const cardOf = (name: string) => screen.getByRole('link', { name }).closest('li') as HTMLElement;

describe('SessionCards', () => {
  it('shows name, class · room, date, count, status, note and progress for each session', () => {
    render(<SessionCards {...props()} />);
    const card = cardOf('Kiểm tra giữa kỳ');
    expect(within(card).getByText(/DHKTPM18ATT/)).toBeInTheDocument();
    expect(within(card).getByText(/Phòng máy A1/)).toBeInTheDocument();
    expect(within(card).getByText(/28\/09\/2026 07:30/)).toBeInTheDocument();
    expect(within(card).getByText(/Giữa kỳ/)).toBeInTheDocument();
    expect(within(card).getByText(/38\/40 bài nộp/)).toBeInTheDocument();
    expect(within(card).getByText('Cần bạn xem')).toBeInTheDocument();
    expect(within(card).getByText('11 cần xem · 4 đang chấm')).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: /11 cần xem, 4 đang chấm, 23 chờ chốt/ })).toBeInTheDocument();
  });

  it('the name is a link that keeps the session in the URL', () => {
    render(<SessionCards {...props()} />);
    expect(screen.getByRole('link', { name: 'Kiểm tra giữa kỳ' })).toHaveAttribute('href', '/teacher/grading?sessionId=a');
  });

  it('a long name keeps its full text in title', () => {
    render(<SessionCards {...props()} />);
    expect(screen.getByRole('link', { name: 'TEST dien tap - xoa sau 1790588688826' })).toHaveAttribute('title', 'TEST dien tap - xoa sau 1790588688826');
  });

  it('each card has the action its status calls for', () => {
    render(<SessionCards {...props()} />);
    expect(within(cardOf('Kiểm tra giữa kỳ')).getByRole('link', { name: /Xem xét/ })).toHaveAttribute('href', '/teacher/grading?sessionId=a&state=needsYou');
    expect(within(cardOf('TEST dien tap - xoa sau 1790588688826')).getByRole('link', { name: /Chuẩn bị/ })).toBeInTheDocument();
    expect(within(cardOf('Kiểm tra cuối kỳ')).getByRole('link', { name: /Mở kết quả/ })).toBeInTheDocument();
  });

  it('says why a todo session cannot start', () => {
    render(<SessionCards {...props()} />);
    expect(within(cardOf('TEST dien tap - xoa sau 1790588688826')).getByText('Thiếu rubric')).toBeInTheDocument();
  });

  it('a todo session with no blocker gets a button that calls onStart, not a link', () => {
    const ready = rowsOf([session({ id: 'r', name: 'Sẵn sàng' })], [summary('r')]);
    const p = props({ groups: groupRows(ready, 'none') });
    render(<SessionCards {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu chấm/ }));
    expect(p.onStart).toHaveBeenCalledWith(ready[0]);
  });

  it('the checkbox toggles exactly that session', () => {
    const p = props();
    render(<SessionCards {...p} />);
    fireEvent.click(within(cardOf('Kiểm tra giữa kỳ')).getByRole('checkbox'));
    expect(p.onToggleRows).toHaveBeenCalledWith(['a'], true);
  });

  it('a selected session is marked on its card', () => {
    render(<SessionCards {...props({ selected: new Set(['a']) })} />);
    expect(cardOf('Kiểm tra giữa kỳ')).toHaveAttribute('data-selected', 'true');
    expect(cardOf('Kiểm tra cuối kỳ')).toHaveAttribute('data-selected', 'false');
  });

  it('tap targets are at least 40px', () => {
    render(<SessionCards {...props()} />);
    const card = cardOf('Kiểm tra giữa kỳ');
    const box = within(card).getByRole('checkbox');
    expect(box.closest('label')).toHaveClass('h-10', 'w-10');
    expect(within(card).getByRole('link', { name: /Xem xét/ })).toHaveClass('h-10');
  });

  it('grouped: a header per group, collapsing hides its cards, the group checkbox selects the group', () => {
    const groups = groupRows(rows, 'class');
    const collapsed = new Set([groups[0].key!]);
    const p = props({ groups, collapsed });
    render(<SessionCards {...p} />);
    expect(screen.getByRole('button', { name: /DHKTPM18ATT/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Kiểm tra giữa kỳ' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Chọn cả nhóm DHKTPM18ATT/ }));
    expect(p.onToggleRows).toHaveBeenCalledWith(['a', 'c'], true);
    fireEvent.click(screen.getByRole('button', { name: /DHKTPM18ATT/ }));
    expect(p.onToggleGroup).toHaveBeenCalledWith(groups[0].key);
  });

  it('unknown status: dashes and a plain open link, no crash', () => {
    const unknown = rowsOf([session({ id: 'u', name: 'Chưa rõ' })], undefined);
    render(<SessionCards {...props({ groups: groupRows(unknown, 'none') })} />);
    const card = cardOf('Chưa rõ');
    expect(within(card).getByRole('link', { name: /^Mở/ })).toBeInTheDocument();
    expect(within(card).getAllByText('-').length).toBeGreaterThan(0);
  });

  it('an 80-character name without spaces cannot widen the card', () => {
    const name = 'A'.repeat(80);
    const long = rowsOf([session({ id: 'l', name })], [summary('l')]);
    render(<SessionCards {...props({ groups: groupRows(long, 'none') })} />);
    const link = screen.getByRole('link', { name });
    expect(link).toHaveClass('break-words');
    expect(link.parentElement).toHaveClass('min-w-0');
  });

  it('compact density hides the note but keeps date and count', () => {
    const { rerender } = render(<SessionCards {...props({ density: 'cozy' })} />);
    expect(within(cardOf('TEST dien tap - xoa sau 1790588688826')).getByText('Thiếu rubric')).toBeInTheDocument();
    rerender(<SessionCards {...props({ density: 'compact' })} />);
    expect(screen.queryByText('Thiếu rubric')).not.toBeInTheDocument();
    expect(within(cardOf('Kiểm tra giữa kỳ')).getByText(/28\/09\/2026 07:30/)).toBeInTheDocument();
    expect(within(cardOf('Kiểm tra giữa kỳ')).getByText(/38\/40 bài nộp/)).toBeInTheDocument();
  });
});
