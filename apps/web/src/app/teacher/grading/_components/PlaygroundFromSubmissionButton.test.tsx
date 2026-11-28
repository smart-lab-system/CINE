import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PlaygroundFromSubmissionButton } from './PlaygroundFromSubmissionButton';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push }),
}));

vi.mock('sonner', () => ({
  toast: { error: h.toastError, success: vi.fn() },
}));

vi.mock('@/lib/api/playground', () => ({
  createPlaygroundRunFromGradingResult: (...args: unknown[]) => h.create(...args),
  PlaygroundHttpError: class PlaygroundHttpError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
      this.name = 'PlaygroundHttpError';
    }
  },
}));

describe('PlaygroundFromSubmissionButton', () => {
  beforeEach(() => {
    h.push.mockReset();
    h.create.mockReset();
    h.toastError.mockReset();
  });

  it('tạo run rồi điều hướng tới playground với runId', async () => {
    h.create.mockResolvedValue({ id: 'run-1' });
    render(<PlaygroundFromSubmissionButton resultId="res-1" sessionId="sess-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Chạy thử/i }));

    await waitFor(() => {
      expect(h.create).toHaveBeenCalledWith('res-1');
      expect(h.push).toHaveBeenCalledWith(
        '/teacher/playground?runId=run-1&resultId=res-1&sessionId=sess-1',
      );
    });
  });
});
