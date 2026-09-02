import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import GradingPage from './page';

// This page previously only ever got a session from its own in-page
// dropdown (`useState('')`) — the per-session submissions detail page
// bridges here with `?sessionId=`, so the page needs to read it once on
// mount. No other pre-existing behavior is under test here (no prior test
// file existed for this page).
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

const useExamSessionsMock = vi.fn();
vi.mock('@/hooks/useExamSession', () => ({
  useExamSessions: (...args: unknown[]) => useExamSessionsMock(...args),
}));

const useTeachingClassesMock = vi.fn();
vi.mock('@/hooks/useTeaching', () => ({
  useTeachingClasses: (...args: unknown[]) => useTeachingClassesMock(...args),
}));

const useGradingResultsMock = vi.fn();
const useRubricsMock = vi.fn();
const useSaveRubricMock = vi.fn();
const useStartGradingMock = vi.fn();
vi.mock('@/hooks/useGrading', () => ({
  useGradingResults: (...args: unknown[]) => useGradingResultsMock(...args),
  useRubrics: (...args: unknown[]) => useRubricsMock(...args),
  useSaveRubric: (...args: unknown[]) => useSaveRubricMock(...args),
  useStartGrading: (...args: unknown[]) => useStartGradingMock(...args),
}));

beforeEach(() => {
  searchParams = new URLSearchParams();
  useExamSessionsMock.mockReset();
  useTeachingClassesMock.mockReset();
  useGradingResultsMock.mockReset();
  useRubricsMock.mockReset();
  useSaveRubricMock.mockReset();
  useStartGradingMock.mockReset();

  useExamSessionsMock.mockReturnValue({
    data: {
      items: [{ id: 'session-2', name: 'Cuối kỳ', courseName: 'Cấu trúc dữ liệu' }],
      total: 1,
    },
    isLoading: false,
  });
  useTeachingClassesMock.mockReturnValue({ data: [] });
  useGradingResultsMock.mockReturnValue({ data: [], isLoading: false });
  useRubricsMock.mockReturnValue({ data: [], isLoading: false });
  useSaveRubricMock.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false, error: null });
  useStartGradingMock.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    data: undefined,
    error: null,
  });
});

describe('GradingPage', () => {
  it('starts with no session picked when the URL carries none', () => {
    render(<GradingPage />);

    expect(screen.queryByText('Kết quả chấm')).not.toBeInTheDocument();
  });

  it('pre-selects the session named in ?sessionId=, arriving from the submissions detail page', () => {
    searchParams = new URLSearchParams('sessionId=session-2');

    render(<GradingPage />);

    expect(screen.getByText('Kết quả chấm')).toBeInTheDocument();
  });
});
