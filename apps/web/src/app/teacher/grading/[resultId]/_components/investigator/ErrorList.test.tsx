import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorList } from './ErrorList';

const mutate = vi.fn();
beforeEach(() => mutate.mockClear());
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

  it('strikes through a refuted error and shows "0" not "0,0"', () => {
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
    expect(screen.queryByRole('button', { name: 'Bỏ lỗi này cho riêng bài này' })).not.toBeInTheDocument();
  });

  // Review C1: the backend never lets `include` flip a refuted error (score-core.ts: `refuted` wins), yet the
  // service still stamps the result "teacher_reviewed" — a button that says "keep this error" would silently
  // lie AND clear the result off the review queue. Locked with a "cần backend" badge until the backend honours it.
  it('locks "Không đồng ý" on a refuted error: disabled, badged "cần backend", and sends nothing', () => {
    render(
      <ErrorList
        resultId="r1" sessionId="s1" status="flagged_for_review"
        errors={[{ ...baseError, counted: 'refuted', deductionHundredths: 150 }]}
        errorFlags={[]}
        verdicts={[{ lens: 'qua_tay', ruleKey: 'sai_bien', status: 'refuted', reason: 'Khung mã của đề đặt sẵn tên biến.' }]}
        investigationNotes={[]}
      />,
    );
    const button = screen.getByRole('button', { name: /Không đồng ý/i });
    expect(button).toBeDisabled();
    expect(screen.getByText('cần backend')).toBeInTheDocument();
    fireEvent.click(button);
    expect(mutate).not.toHaveBeenCalled();
  });

  // Review I1: `counted: 'excluded'` used to render exactly like a counted error (−1,5, "Bỏ lỗi này" again,
  // no way back) while ScoreCard had already dropped it from the sum — the row contradicted the formula.
  describe('an error already dropped for this result (counted: "excluded")', () => {
    const excluded = { ...baseError, counted: 'excluded' as const };
    const renderExcluded = (over: Partial<typeof baseError> = {}) =>
      render(
        <ErrorList
          resultId="r1" sessionId="s1" status="teacher_reviewed"
          errors={[{ ...excluded, ...over }]} errorFlags={[]} verdicts={[]} investigationNotes={[]}
        />,
      );

    it('strikes it through, shows "0" and the "Đã bỏ cho bài này" badge — not "−1,5"', () => {
      renderExcluded();
      expect(screen.getByText('sai_bien')).toHaveClass('line-through');
      expect(screen.getByText('Đã bỏ cho bài này')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.queryByText(/1,5/)).not.toBeInTheDocument();
    });

    it('shows "0", never "0,0" or "−0,0", even when the rule has no price yet', () => {
      renderExcluded({ deductionHundredths: null as unknown as number });
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.queryByText(/0,0/)).not.toBeInTheDocument();
    });

    it('offers the way back — "Giữ lại lỗi này" sends include — and no second "Bỏ lỗi này"', () => {
      renderExcluded();
      fireEvent.click(screen.getByRole('button', { name: 'Giữ lại lỗi này' }));
      expect(mutate).toHaveBeenCalledWith({ resultId: 'r1', ruleId: 'rule-1', direction: 'include' });
      expect(screen.queryByRole('button', { name: /Bỏ lỗi/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Sửa luật này' })).not.toBeInTheDocument();
    });

    it('is counted in the header summary', () => {
      renderExcluded();
      expect(screen.getByText(/0 lỗi đã trừ · 1 đã bỏ cho bài này/)).toBeInTheDocument();
    });
  });

  // Review minor: a double click wrote two `teacher_review` rows.
  it('disables every action while a change is being sent', () => {
    mockState = { isPending: true, isError: false, error: null };
    render(
      <ErrorList resultId="r1" sessionId="s1" status="flagged_for_review" errors={[baseError]} errorFlags={[]} verdicts={[]} investigationNotes={[]} />,
    );
    expect(screen.getByRole('button', { name: 'Bỏ lỗi này cho riêng bài này' })).toBeDisabled();
    mockState = { isPending: false, isError: false, error: null };
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

  // Review minor #5: the tint must follow how the BACKEND merges lenses (one confirmation stands unless
  // someone refutes) — a row tinted "chưa kiểm được" while its buttons behave as confirmed contradicts itself.
  it('tints a row by the merged verdict: confirmed + unverified is confirmed, not a warning', () => {
    render(
      <ErrorList
        resultId="r1" sessionId="s1" status="flagged_for_review" errors={[baseError]} errorFlags={[]}
        verdicts={[
          { lens: 'tinh_dung', ruleKey: 'sai_bien', status: 'confirmed', reason: null },
          { lens: 'qua_tay', ruleKey: 'sai_bien', status: 'unverified', reason: 'Hết ngân sách.' },
        ]}
        investigationNotes={[]}
      />,
    );
    expect(screen.getByText(/Tính đúng/).closest('div')).toHaveClass('bg-success-subtle');
  });

  it('tints a row red as soon as any lens refutes it', () => {
    render(
      <ErrorList
        resultId="r1" sessionId="s1" status="flagged_for_review" errors={[baseError]} errorFlags={[]}
        verdicts={[
          { lens: 'tinh_dung', ruleKey: 'sai_bien', status: 'confirmed', reason: null },
          { lens: 'qua_tay', ruleKey: 'sai_bien', status: 'refuted', reason: 'Đề đặt sẵn.' },
        ]}
        investigationNotes={[]}
      />,
    );
    expect(screen.getByText(/Quá tay/).closest('div')).toHaveClass('bg-danger-subtle');
  });

  // Lost from the old investigation page (review section 7, item 4): what "unverified" MEANS for the score.
  it('explains an unverified error: still deducted, but the result cannot auto-approve', () => {
    render(
      <ErrorList
        resultId="r1" sessionId="s1" status="flagged_for_review" errors={[baseError]}
        errorFlags={[{ ruleKey: 'sai_bien', code: 'unverified' }]}
        verdicts={[{ lens: 'qua_tay', ruleKey: 'sai_bien', status: 'unverified', reason: 'Hết ngân sách.' }]}
        investigationNotes={[]}
      />,
    );
    expect(screen.getByText('Chưa xác minh — vẫn bị trừ, nhưng bài không được tự duyệt')).toBeInTheDocument();
  });

  it('does not say it for an error nobody flagged as unverified', () => {
    render(
      <ErrorList resultId="r1" sessionId="s1" status="flagged_for_review" errors={[baseError]} errorFlags={[]} verdicts={[]} investigationNotes={[]} />,
    );
    expect(screen.queryByText(/Chưa xác minh/)).not.toBeInTheDocument();
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
