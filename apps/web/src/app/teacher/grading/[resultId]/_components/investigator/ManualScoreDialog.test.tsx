import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManualScoreDialog } from './ManualScoreDialog';

const mutate = vi.fn();
vi.mock('@/hooks/useGrading', () => ({ useSetManualScore: () => ({ mutate, isPending: false, isError: false, error: null }) }));

describe('ManualScoreDialog', () => {
  beforeEach(() => {
    mutate.mockClear();
  });

  it('prefills the input with the current score (T-UI-25)', () => {
    render(<ManualScoreDialog resultId="r1" sessionId="s1" currentScore={7.5} maxTotal={10} open onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText(/Điểm/i)).toHaveValue('7.5');
  });
  it('submits a decimal STRING, not a number, and includes the resultId', () => {
    render(<ManualScoreDialog resultId="r1" sessionId="s1" currentScore={7.5} maxTotal={10} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Điểm/i), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chấm tay' }));
    expect(mutate).toHaveBeenCalledWith({ resultId: 'r1', score: '8' }, expect.anything());
  });
  it('rejects a value above the rubric ceiling before sending anything', () => {
    render(<ManualScoreDialog resultId="r1" sessionId="s1" currentScore={7.5} maxTotal={10} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Điểm/i), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chấm tay' }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/vượt trần/i)).toBeInTheDocument();
  });
});
