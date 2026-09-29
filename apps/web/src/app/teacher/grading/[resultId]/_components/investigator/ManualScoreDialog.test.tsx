import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManualScoreDialog } from './ManualScoreDialog';

const mutate = vi.fn();
let mockState = { isPending: false, isError: false, error: null as Error | null };
vi.mock('@/hooks/useGrading', () => ({ useSetManualScore: () => ({ mutate, ...mockState }) }));

type Props = React.ComponentProps<typeof ManualScoreDialog>;
const props = (over: Partial<Props> = {}): Props => ({
  resultId: 'r1', sessionId: 's1', currentScore: 7.5, maxTotal: 10, status: 'flagged_for_review',
  open: true, onOpenChange: vi.fn(), ...over,
});

describe('ManualScoreDialog', () => {
  beforeEach(() => {
    mutate.mockClear();
    mockState = { isPending: false, isError: false, error: null };
  });

  it('prefills the input with the current score, in Vietnamese decimal form (T-UI-25, §2.1 rule 6)', () => {
    render(<ManualScoreDialog {...props()} />);
    expect(screen.getByLabelText(/Điểm/i)).toHaveValue('7,5');
  });
  it('submits a decimal STRING with a dot, not a number, and includes the resultId', () => {
    render(<ManualScoreDialog {...props()} />);
    fireEvent.change(screen.getByLabelText(/Điểm/i), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chấm tay' }));
    expect(mutate).toHaveBeenCalledWith({ resultId: 'r1', score: '8' }, expect.anything());
  });
  it('accepts a decimal comma — the page shows "7,5", so the teacher types "7,5" — and sends "7.5"', () => {
    render(<ManualScoreDialog {...props({ currentScore: null })} />);
    fireEvent.change(screen.getByLabelText(/Điểm/i), { target: { value: '7,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chấm tay' }));
    expect(mutate).toHaveBeenCalledWith({ resultId: 'r1', score: '7.5' }, expect.anything());
  });
  it('rejects a value above the rubric ceiling before sending anything, in Vietnamese decimal form', () => {
    render(<ManualScoreDialog {...props()} />);
    fireEvent.change(screen.getByLabelText(/Điểm/i), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chấm tay' }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Điểm vượt trần của rubric (10,0).')).toBeInTheDocument();
  });
  it('rejects malformed input with a message that names the accepted form', () => {
    render(<ManualScoreDialog {...props()} />);
    fireEvent.change(screen.getByLabelText(/Điểm/i), { target: { value: '7,555' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chấm tay' }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/tối đa hai chữ số lẻ/)).toBeInTheDocument();
  });

  // Review I6: the ceiling used to be looked up by rubric *version* (every rubric starts at v1) and defaulted
  // to 10, so the client could refuse a score the server would accept. Unknown ceiling ⇒ the server decides.
  it('does not invent a ceiling when the rubric is unknown (maxTotal null) — the server checks it', () => {
    render(<ManualScoreDialog {...props({ maxTotal: null })} />);
    fireEvent.change(screen.getByLabelText(/Điểm/i), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chấm tay' }));
    expect(mutate).toHaveBeenCalledWith({ resultId: 'r1', score: '15' }, expect.anything());
  });

  // Review I3: the field was seeded once at mount, so after the score moved (e.g. "Bỏ lỗi" 6 → 7,5) the
  // dialog still offered "6" — and one click locked that stale score in for good.
  describe('every opening starts from the score as it is NOW', () => {
    it('re-seeds from the new currentScore after the dialog was closed and reopened', () => {
      const { rerender } = render(<ManualScoreDialog {...props({ currentScore: 6 })} />);
      expect(screen.getByLabelText(/Điểm/i)).toHaveValue('6');
      rerender(<ManualScoreDialog {...props({ currentScore: 6, open: false })} />);
      rerender(<ManualScoreDialog {...props({ currentScore: 7.5, open: true })} />);
      expect(screen.getByLabelText(/Điểm/i)).toHaveValue('7,5');
    });

    it('forgets what was typed and any validation error from the previous opening', () => {
      const { rerender } = render(<ManualScoreDialog {...props()} />);
      fireEvent.change(screen.getByLabelText(/Điểm/i), { target: { value: '15' } });
      fireEvent.click(screen.getByRole('button', { name: 'Chấm tay' }));
      expect(screen.getByText(/vượt trần/)).toBeInTheDocument();
      rerender(<ManualScoreDialog {...props({ open: false })} />);
      rerender(<ManualScoreDialog {...props({ open: true })} />);
      expect(screen.getByLabelText(/Điểm/i)).toHaveValue('7,5');
      expect(screen.queryByText(/vượt trần/)).not.toBeInTheDocument();
    });
  });

  it('shows the server message verbatim when saving fails', () => {
    mockState = { isPending: false, isError: true, error: new Error('Điểm vượt trần của rubric (5,00)') };
    render(<ManualScoreDialog {...props()} />);
    expect(screen.getByText('Điểm vượt trần của rubric (5,00)')).toBeInTheDocument();
  });

  // Review I7 (Review Focus #2): a finalized score can still be changed, and the change is written to the audit
  // log — the teacher must be told BEFORE pressing, not discover it afterwards.
  describe('a score that was already finalized', () => {
    it.each(['finalized', 'exported'])('says the change goes into the audit log (%s)', (status) => {
      render(<ManualScoreDialog {...props({ status })} />);
      expect(screen.getByText('Điểm đã chốt — thay đổi này sẽ được ghi vào nhật ký.')).toBeInTheDocument();
    });
    it('does not say it for a result that is still being reviewed', () => {
      render(<ManualScoreDialog {...props({ status: 'flagged_for_review' })} />);
      expect(screen.queryByText(/nhật ký/)).not.toBeInTheDocument();
    });
    it('labels the confirm button for what it does', () => {
      render(<ManualScoreDialog {...props({ status: 'finalized' })} />);
      expect(screen.getByRole('button', { name: 'Chấm tay và ghi nhật ký' })).toBeInTheDocument();
    });
  });
});
