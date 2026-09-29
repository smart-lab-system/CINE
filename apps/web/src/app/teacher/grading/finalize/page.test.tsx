import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import FinalizePage from './page';

let search = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));

const h = vi.hoisted(() => ({
  overview: { data: [] as unknown[], isLoading: false },
  results: { data: undefined as unknown, isLoading: false, isError: false, error: null as Error | null },
  panelProps: [] as unknown[],
}));
vi.mock('@/hooks/useSubmissionOverview', () => ({ useSessionOverview: () => h.overview }));
vi.mock('@/hooks/useGrading', () => ({ useGradingResults: () => h.results }));
vi.mock('../_components/FinalizePanel', () => ({
  FinalizePanel: (props: { results: unknown[] }) => {
    h.panelProps.push(props);
    return <div data-testid="finalize-panel">{props.results.length} bài</div>;
  },
}));

const session = { id: 's1', name: 'Giữa kỳ N01', code: 'GK-N01' };

beforeEach(() => {
  search = 'sessionId=s1';
  h.overview = { data: [session], isLoading: false };
  h.results = { data: [{ id: 'a' }, { id: 'b' }], isLoading: false, isError: false, error: null };
  h.panelProps.length = 0;
});

describe('/teacher/grading/finalize', () => {
  it('names the screen and the session, with a way back to the session', () => {
    render(<FinalizePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Chốt điểm phiên' })).toBeInTheDocument();
    expect(screen.getByText('Giữa kỳ N01')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Chấm điểm/ })).toHaveAttribute('href', '/teacher/grading?sessionId=s1');
  });

  it('hands the panel the session\'s results', () => {
    render(<FinalizePage />);
    expect(screen.getByTestId('finalize-panel')).toHaveTextContent('2 bài');
  });

  it('without a session in the URL, asks to choose one', () => {
    search = '';
    render(<FinalizePage />);
    expect(screen.getByRole('link', { name: 'Chọn phiên' })).toHaveAttribute('href', '/teacher/grading');
    expect(screen.queryByTestId('finalize-panel')).not.toBeInTheDocument();
  });

  it('a session that does not exist says so', () => {
    search = 'sessionId=missing';
    render(<FinalizePage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy phiên thi này');
    expect(screen.queryByTestId('finalize-panel')).not.toBeInTheDocument();
  });

  it('waits for the results instead of showing "nothing graded"', () => {
    h.results = { data: undefined, isLoading: true, isError: false, error: null };
    render(<FinalizePage />);
    expect(screen.queryByTestId('finalize-panel')).not.toBeInTheDocument();
  });

  it('shows a results load error verbatim rather than an empty session', () => {
    h.results = { data: undefined, isLoading: false, isError: true, error: new Error('Mất kết nối') };
    render(<FinalizePage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Mất kết nối');
    expect(screen.queryByTestId('finalize-panel')).not.toBeInTheDocument();
  });
});
