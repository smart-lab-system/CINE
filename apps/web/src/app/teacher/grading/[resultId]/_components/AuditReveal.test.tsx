import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AuditReveal } from './AuditReveal';
import type { AuditReveal as AuditRevealData } from '@/lib/api/audit';

const reveal = (over: Partial<AuditRevealData> = {}): AuditRevealData => ({
  status: 'teacher_reviewed',
  currentScore: 8.5,
  currentScoreSource: 'computation',
  systemErrors: [
    { ruleId: 'a', ruleKey: 'sai_bien', ruleName: 'Sai biên', counted: 'counted' },
    { ruleId: 'b', ruleKey: 'ten_bien', ruleName: 'Đặt tên biến', counted: 'unpriced' },
  ],
  perRule: [
    { ruleId: 'a', ruleKey: 'sai_bien', ruleName: 'Sai biên', verdict: 'both' },
    { ruleId: 'b', ruleKey: 'ten_bien', ruleName: 'Đặt tên biến', verdict: 'system_only' },
    { ruleId: 'c', ruleKey: 'thieu_ct', ruleName: 'Thiếu chú thích', verdict: 'teacher_only' },
  ],
  extraErrors: ['Nộp thiếu file đầu vào'],
  summary: { both: 1, teacherOnly: 1, systemOnly: 1, neither: 2, extra: 1, agreement: 'partial' },
  ...over,
});

const renderIt = (over: Partial<AuditRevealData> = {}, onOpenDossier = vi.fn()) => {
  render(<AuditReveal reveal={reveal(over)} onOpenDossier={onOpenDossier} />);
  return onOpenDossier;
};

describe('AuditReveal (parent spec §8.1 rule 3)', () => {
  it('shows the system score, and says it did not change because of the teacher\'s answer', () => {
    renderIt();
    expect(screen.getByText('8,5')).toBeInTheDocument();
    expect(screen.getByText(/không đổi vì nhận xét của bạn/)).toBeInTheDocument();
    expect(screen.getByText(/Ngoại lệ hoặc Chấm tay/)).toBeInTheDocument();
  });

  it('a missing score is "—", never 0', () => {
    renderIt({ currentScore: null });
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('compares every rule in words: both saw it / only you / only the system', () => {
    renderIt();
    const items = within(screen.getByRole('list', { name: 'So sánh từng luật' })).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Sai biên');
    expect(items[0]).toHaveTextContent('Cả hai đều thấy');
    expect(items[1]).toHaveTextContent('Đặt tên biến');
    expect(items[1]).toHaveTextContent('Chỉ hệ thống thấy');
    expect(items[2]).toHaveTextContent('Thiếu chú thích');
    expect(items[2]).toHaveTextContent('Chỉ bạn thấy');
  });

  it('every verdict carries an icon as well as words', () => {
    renderIt();
    const items = within(screen.getByRole('list', { name: 'So sánh từng luật' })).getAllByRole('listitem');
    for (const item of items) expect(item.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('marks a system-only error that has no price yet (the score does not count it)', () => {
    renderIt();
    const items = within(screen.getByRole('list', { name: 'So sánh từng luật' })).getAllByRole('listitem');
    expect(items[1]).toHaveTextContent('chưa có giá');
    expect(items[0]).not.toHaveTextContent('chưa có giá');
  });

  it.each([
    ['full', 'Trùng khớp hoàn toàn'],
    ['partial', 'Trùng một phần'],
    ['none', 'Không trùng'],
  ] as const)('agreement %s reads "%s"', (agreement, label) => {
    renderIt({ summary: { ...reveal().summary, agreement } });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('lists the errors the teacher wrote outside the rule table, and omits the section when there are none', () => {
    const { unmount } = render(<AuditReveal reveal={reveal()} onOpenDossier={vi.fn()} />);
    expect(screen.getByText('Nộp thiếu file đầu vào')).toBeInTheDocument();
    unmount();
    renderIt({ extraErrors: [], summary: { ...reveal().summary, extra: 0 } });
    expect(screen.queryByText(/Lỗi bạn ghi ngoài bảng lỗi/)).not.toBeInTheDocument();
  });

  it('states every count of the summary, including the rules nobody saw', () => {
    renderIt();
    const summary = screen.getByRole('list', { name: 'Tổng kết' });
    expect(within(summary).getByText('Cả hai thấy: 1')).toBeInTheDocument();
    expect(within(summary).getByText('Chỉ bạn thấy: 1')).toBeInTheDocument();
    expect(within(summary).getByText('Chỉ hệ thống thấy: 1')).toBeInTheDocument();
    expect(within(summary).getByText('Không ai thấy: 2')).toBeInTheDocument();
    expect(within(summary).getByText('Lỗi ngoài bảng lỗi: 1')).toBeInTheDocument();
  });

  it('when neither side saw any error it says so instead of showing an empty list', () => {
    renderIt({
      systemErrors: [], perRule: [], extraErrors: [],
      summary: { both: 0, teacherOnly: 0, systemOnly: 0, neither: 3, extra: 0, agreement: 'full' },
    });
    expect(screen.getByText(/Cả bạn và hệ thống đều không thấy lỗi nào/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'So sánh từng luật' })).not.toBeInTheDocument();
  });

  it('"Mở hồ sơ" hands over to the dossier exactly once', () => {
    const onOpenDossier = renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Mở hồ sơ' }));
    expect(onOpenDossier).toHaveBeenCalledTimes(1);
  });
});
