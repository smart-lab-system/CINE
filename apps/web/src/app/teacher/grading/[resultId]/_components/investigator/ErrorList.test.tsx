import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { ErrorList } from './ErrorList';

const mutate = vi.fn();
let mockState = { isPending: false, isError: false, error: null as Error | null };
vi.mock('@/hooks/useGrading', () => ({ useSetErrorException: () => ({ mutate, ...mockState }) }));

const baseError = {
  ruleId: 'rule-1', ruleKey: 'sai_bien', ruleName: 'Sai biên', criterionKey: 'tinh_dung',
  source: 'deterministic' as const, toolCallIds: ['tc-1'], deductionHundredths: 150, counted: 'counted' as const,
};

describe('ErrorList', () => {
  it('uses the spec §2.2 wording, not "Model + công cụ"', () => {
    render(
      <ErrorList
        resultId="r1" sessionId="s1" status="flagged_for_review"
        errors={[{ ...baseError, source: 'llm_with_tools' }]}
        errorFlags={[]} verdicts={[]} investigationNotes={[]}
      />,
    );
    expect(screen.getByText('Mô hình + công cụ')).toBeInTheDocument();
    expect(screen.queryByText(/Model \+ công cụ/)).not.toBeInTheDocument();
  });

  it('excludes an error and sends the resultId + ruleId + direction (Bỏ lỗi này cho riêng bài này)', () => {
    render(
      <ErrorList resultId="r1" sessionId="s1" status="flagged_for_review" errors={[baseError]} errorFlags={[]} verdicts={[]} investigationNotes={[]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ lỗi này cho riêng bài này' }));
    expect(mutate).toHaveBeenCalledWith({ resultId: 'r1', ruleId: 'rule-1', direction: 'exclude' });
  });

  it('hides exclude/include actions once the result is finalized (Review Focus #2)', () => {
    render(
      <ErrorList resultId="r1" sessionId="s1" status="finalized" errors={[baseError]} errorFlags={[]} verdicts={[]} investigationNotes={[]} />,
    );
    expect(screen.queryByRole('button', { name: /Bỏ lỗi/i })).not.toBeInTheDocument();
  });

  it('shows the server error message verbatim on a stale-rule 400 (Review Focus #1)', () => {
    mockState = { isPending: false, isError: true, error: new Error('Lỗi này không có trong lượt tính mới nhất của bài') };
    render(
      <ErrorList resultId="r1" sessionId="s1" status="flagged_for_review" errors={[baseError]} errorFlags={[]} verdicts={[]} investigationNotes={[]} />,
    );
    expect(screen.getByText('Lỗi này không có trong lượt tính mới nhất của bài')).toBeInTheDocument();
    mockState = { isPending: false, isError: false, error: null };
  });

  it('strikes through a refuted error, shows "0" not "0,0", and offers only "Không đồng ý"', () => {
    render(
      <ErrorList
        resultId="r1" sessionId="s1" status="flagged_for_review"
        errors={[{ ...baseError, counted: 'refuted', deductionHundredths: 150 }]}
        errorFlags={[]}
        verdicts={[{ lens: 'qua_tay', ruleKey: 'sai_bien', status: 'refuted', reason: 'Khung mã của đề đặt sẵn tên biến.' }]}
        investigationNotes={[]}
      />,
    );
    expect(screen.getByText('sai_bien')).toHaveClass('line-through');
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Không đồng ý/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bỏ lỗi này cho riêng bài này' })).not.toBeInTheDocument();
  });

  it('renders every verdict when two lenses disagree, tinted by the worse one (Review Focus #5)', () => {
    render(
      <ErrorList
        resultId="r1" sessionId="s1" status="flagged_for_review"
        errors={[baseError]}
        errorFlags={[]}
        verdicts={[
          { lens: 'tinh_dung', ruleKey: 'sai_bien', status: 'confirmed', reason: null },
          { lens: 'qua_tay', ruleKey: 'sai_bien', status: 'unverified', reason: 'Hết ngân sách trước khi đo lại được.' },
        ]}
        investigationNotes={[]}
      />,
    );
    expect(screen.getByText(/Tính đúng/)).toBeInTheDocument();
    expect(screen.getByText(/Quá tay/)).toBeInTheDocument();
    expect(screen.getByText(/Chưa kiểm được/)).toBeInTheDocument();
    expect(screen.getByText(/Xác nhận/)).toBeInTheDocument();
    expect(screen.queryByText(/lăng kính/i)).not.toBeInTheDocument(); // spec §2.2 fix #4: never say "lăng kính"
  });

  it('shows the investigation note as the evidence line when present', () => {
    render(
      <ErrorList
        resultId="r1" sessionId="s1" status="flagged_for_review" errors={[baseError]} errorFlags={[]} verdicts={[]}
        investigationNotes={[{ ruleKey: 'sai_bien', toolCallIds: ['tc-1'], note: 'run_tests("bien") trượt 3/5.' }]}
      />,
    );
    expect(screen.getByText(/trượt 3\/5/)).toBeInTheDocument();
  });
});
