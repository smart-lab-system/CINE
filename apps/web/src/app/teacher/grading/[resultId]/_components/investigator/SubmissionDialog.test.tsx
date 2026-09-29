import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { SubmissionDialog } from './SubmissionDialog';

let useSubmissionTextMock = () => ({ data: undefined as unknown, isLoading: true });
vi.mock('@/hooks/useGrading', () => ({ useSubmissionText: () => useSubmissionTextMock() }));

describe('SubmissionDialog', () => {
  it('renders the submission text read-only when open', () => {
    useSubmissionTextMock = () => ({
      data: { paragraphs: ['Đoạn một.', 'Đoạn hai.'], spans: [], unlocatable: [], truncatedByGrading: false },
      isLoading: false,
    });
    render(<SubmissionDialog resultId="r1" open onOpenChange={vi.fn()} />);
    expect(screen.getByText('Đoạn một.')).toBeInTheDocument();
  });
  it('closes when the close control fires', () => {
    useSubmissionTextMock = () => ({
      data: { paragraphs: ['x'], spans: [], unlocatable: [], truncatedByGrading: false },
      isLoading: false,
    });
    const onOpenChange = vi.fn();
    render(<SubmissionDialog resultId="r1" open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Đóng/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
