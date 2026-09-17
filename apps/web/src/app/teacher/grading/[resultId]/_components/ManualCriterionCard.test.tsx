import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ManualCriterionCard } from './ManualCriterionCard';

function card(props: Record<string, unknown> = {}) {
  return render(
    <ManualCriterionCard
      index={0}
      description="Xử lý nhất quán dữ liệu"
      maxPoints={4}
      draft={{ criterionId: 'c1', verdict: 'not_met', points: 0 }}
      active={false}
      onActivate={vi.fn()}
      onChange={vi.fn()}
      {...props}
    />,
  );
}

describe('ManualCriterionCard', () => {
  it('không bịa phán đoán của AI — không có badge đạt/chưa đạt nào', () => {
    card();
    // CriterionCard (bài AI chấm được) LUÔN có một trong ba nhãn này.
    // Card này thì không — vì không có phán đoán nào để hiện.
    expect(screen.queryByText(/^Đạt$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Đạt một phần/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chưa đạt/)).not.toBeInTheDocument();
    expect(screen.getByText(/AI chưa chấm tiêu chí này/i)).toBeInTheDocument();
  });

  it('bấm một mức điểm thì báo đúng điểm và đúng verdict suy ra', () => {
    const onChange = vi.fn();
    card({ maxPoints: 4, onChange });

    fireEvent.click(screen.getByRole('button', { name: '4' }));

    expect(onChange).toHaveBeenCalledWith({ points: 4, verdict: 'met' });
  });

  it('bấm 0 thì verdict là not_met', () => {
    const onChange = vi.fn();
    card({ maxPoints: 4, onChange });

    fireEvent.click(screen.getByRole('button', { name: '0' }));

    expect(onChange).toHaveBeenCalledWith({ points: 0, verdict: 'not_met' });
  });

  it('hiện mô tả tiêu chí và điểm tối đa từ rubric', () => {
    card({ description: 'Chiến lược chịu lỗi', maxPoints: 10 });

    expect(screen.getByText('Chiến lược chịu lỗi')).toBeInTheDocument();
    expect(screen.getByText(/Tối đa 10 điểm/)).toBeInTheDocument();
  });
});
