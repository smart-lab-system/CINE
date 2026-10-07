import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ExportPage from './page';
import type { GradingResult } from '@/lib/api/grading';

let query = 'sessionId=s1';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(query) }));
let overview: { data?: { id: string; name: string; code: string }[]; isLoading: boolean };
let results: { data?: GradingResult[]; isLoading: boolean; isError: boolean; error: Error | null };
vi.mock('@/hooks/useSubmissionOverview', () => ({ useSessionOverview: () => overview }));
vi.mock('@/hooks/useGrading', () => ({ useGradingResults: () => results }));
vi.mock('./_components/ExportWizard', () => ({
  ExportWizard: (p: { sessionId: string; sessionName: string; sessionCode: string }) => (
    <div data-testid="wizard">{`${p.sessionId}|${p.sessionName}|${p.sessionCode}`}</div>
  ),
}));

const result = (status: string, id = status): GradingResult => ({
  id, submissionId: id, studentMssv: id, studentName: id, homeClassId: 'c', homeClassName: 'N01', status, modelUsed: null, aiTotalScore: null,
  confidence: null, flagForReview: false, ungradableReason: null, criterionResults: [], advocateOpinion: null, contextUsedQuestion: null,
  contextUsedModelAnswer: null, finalScore: null, reviewedAt: null, reviewedByName: null, editedCriteria: null, pipeline: 'investigator',
  currentScore: 8, currentScoreSource: 'finalized',
}) as unknown as GradingResult;

beforeEach(() => {
  query = 'sessionId=s1';
  overview = { data: [{ id: 's1', name: 'Giữa kỳ N01', code: 'GK-N01' }], isLoading: false };
  results = { data: [result('finalized', 'a'), result('exported', 'b')], isLoading: false, isError: false, error: null };
});

describe('/teacher/grading/export', () => {
  it('without a session it asks for one', () => {
    query = '';
    render(<ExportPage />);
    expect(screen.getByText(/Chưa chọn phiên thi/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chọn phiên' })).toHaveAttribute('href', '/teacher/grading');
  });

  it('an unknown session is an error with a way out', () => {
    overview = { data: [], isLoading: false };
    render(<ExportPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy phiên thi này.');
  });

  it('shows a results failure verbatim', () => {
    results = { data: undefined, isLoading: false, isError: true, error: new Error('Không tải được.') };
    render(<ExportPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được kết quả chấm — Không tải được.');
  });

  it('a session with nothing graded has nothing to write', () => {
    results = { data: [], isLoading: false, isError: false, error: null };
    render(<ExportPage />);
    expect(screen.getByText(/Chưa chấm bài nào/)).toBeInTheDocument();
    expect(screen.queryByTestId('wizard')).not.toBeInTheDocument();
  });

  // Spec §3.10: ghi file trước khi chốt là đưa ra ngoài một con số chưa công bố.
  it('a session that is not fully finalised is sent to the finalize screen — the wizard is not shown', () => {
    results = { data: [result('finalized', 'a'), result('teacher_reviewed', 'b')], isLoading: false, isError: false, error: null };
    render(<ExportPage />);
    expect(screen.getByText('Phiên chưa chốt điểm — chốt điểm trước rồi mới ghi vào sổ điểm.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đi tới màn chốt điểm' })).toHaveAttribute('href', '/teacher/grading/finalize?sessionId=s1');
    expect(screen.queryByTestId('wizard')).not.toBeInTheDocument();
  });

  it('a finalised session (finalized or exported) gets the wizard, with the session name and code', () => {
    render(<ExportPage />);
    expect(screen.getByTestId('wizard')).toHaveTextContent('s1|Giữa kỳ N01|GK-N01');
    expect(screen.getByRole('heading', { name: 'Ghi điểm vào sổ điểm' })).toBeInTheDocument();
  });
});
