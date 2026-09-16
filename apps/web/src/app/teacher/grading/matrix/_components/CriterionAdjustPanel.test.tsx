import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CriterionAdjustPanel } from './CriterionAdjustPanel';
import { result, rubric } from './fixtures';

/** Ba bài, HAI trong ba mất điểm ở `c1` — đúng con số test tỉ lệ khẳng định. */
const rows = [
  result({ id: 'r1' }),
  result({ id: 'r2' }),
  result({
    id: 'r3',
    criterionResults: [
      { criterionId: 'c1', verdict: 'met', points: 4, evidence: 'a', check: 'ok' },
      { criterionId: 'c2', verdict: 'partially_met', points: 1.5, evidence: 'b', check: 'ok' },
    ],
  }),
];

function panel(onApply = vi.fn()) {
  render(<CriterionAdjustPanel results={rows} rubric={rubric} pending={false} onApply={onApply} />);
  return onApply;
}

describe('CriterionAdjustPanel', () => {
  it('nhãn nói rõ "cho điểm tối đa", KHÔNG nói "huỷ tiêu chí"', () => {
    panel();
    // "Chia đều trọng số sang các tiêu chí còn lại" bị server từ chối bằng
    // 400 (points > maxPoints). Nhãn phải nói đúng thứ nó làm.
    expect(screen.getAllByRole('button', { name: /Cho điểm tối đa cho cả lớp/ })).toHaveLength(2);
    expect(screen.queryByText(/chia đều trọng số/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/huỷ tiêu chí/i)).not.toBeInTheDocument();
  });

  it('nhãn cộng bù nói ra TRẦN', () => {
    panel();
    expect(screen.getAllByText(/tối đa \+1 điểm/i).length).toBeGreaterThan(0);
  });

  it('hiện tỉ lệ bài mất điểm ở mỗi tiêu chí', () => {
    panel();
    expect(screen.getByText(/2\/3 bài mất điểm/)).toBeInTheDocument();
  });

  it('cho điểm tối đa phát ra đúng luật', () => {
    const onApply = panel();
    fireEvent.click(screen.getAllByRole('button', { name: /Cho điểm tối đa cho cả lớp/ })[0]);
    expect(onApply).toHaveBeenCalledWith({ kind: 'criterion_full_marks', criterionId: 'c1' });
  });

  it('cộng bù phát ra đúng luật', () => {
    const onApply = panel();
    fireEvent.click(screen.getAllByRole('button', { name: /Cộng bù/ })[0]);
    expect(onApply).toHaveBeenCalledWith({
      kind: 'criterion_bonus',
      criterionId: 'c1',
      points: 1,
    });
  });

  it('nói rõ áp cho MỌI bài của phiên, không chỉ nhóm đang lọc', () => {
    panel();
    expect(screen.getByText(/mọi bài trong phiên, không chỉ nhóm đang lọc/i)).toBeInTheDocument();
  });
});
