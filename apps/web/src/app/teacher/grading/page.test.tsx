import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import GradingPage from './page';
import type { GradingProgress, GradingResult, ResultDetail } from '@/lib/api/grading';
import type { SessionOverviewItem } from '@/lib/api/submissions';

let search = '';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/teacher/grading',
}));

const h = vi.hoisted(() => ({
  overview: { data: [] as unknown[], isLoading: false, isError: false, error: null as Error | null },
  summaries: { data: undefined as unknown, isLoading: false, isError: false, error: null as Error | null },
  results: { data: undefined as unknown, isLoading: false, isError: false, error: null as Error | null, refetch: vi.fn() },
  progress: { data: undefined as unknown, isLoading: false, isError: false, error: null as Error | null, dataUpdatedAt: 0, refetch: vi.fn() },
  details: { byId: new Map<string, unknown>(), loading: 0, failed: 0 },
  regradeMutate: vi.fn(),
  online: true,
  prepareProps: [] as unknown[],
  runningProps: [] as unknown[],
}));

vi.mock('@/hooks/useSubmissionOverview', () => ({ useSessionOverview: () => h.overview }));
vi.mock('@/hooks/useGrading', () => ({
  useGradingResults: () => h.results,
  useGradingSessionSummaries: () => h.summaries,
  useGradingProgress: () => h.progress,
  useResultDetails: () => h.details,
  useRegradeStuck: () => ({ mutate: h.regradeMutate, isPending: false, isError: false, error: null, data: undefined }),
}));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => h.online }));

// Each has its own tests; here only WHICH one the data selects, and what it is handed, matters.
vi.mock('./_components/PreparePanel', () => ({
  PreparePanel: (props: { allUngradable?: boolean }) => {
    h.prepareProps.push(props);
    return <div data-testid="prepare-panel" data-all-ungradable={String(Boolean(props.allUngradable))} />;
  },
}));
vi.mock('./_components/RunningPanel', () => ({
  RunningPanel: (props: unknown) => {
    h.runningProps.push(props);
    return <div data-testid="running-panel" />;
  },
}));
vi.mock('./_components/BulkAcceptEssays', () => ({ BulkAcceptEssays: () => <div data-testid="bulk-essays" /> }));

const session = (over: Partial<SessionOverviewItem> = {}) =>
  ({
    id: 's1', name: 'Giữa kỳ N01', code: 'GK-N01', classId: 'c1', className: 'N01', roomName: 'B2.07', status: 'completed',
    examType: 'GK', startTime: '2026-09-28T00:30:00.000Z', semesterName: 'HK1',
    rubricId: 'ru-1', rubricVersion: 2, expectedCount: 40, rosterKnown: true,
    fullySubmittedCount: 30, partialCount: 2, attendedNoSubmissionCount: 0, neverAttendedCount: 0, ...over,
  }) as SessionOverviewItem;

const result = (over: Partial<GradingResult> = {}): GradingResult => ({
  id: 'r1', submissionId: 's', studentMssv: '20120001', studentName: 'An', homeClassId: 'c1', homeClassName: 'N01',
  status: 'auto_approved', modelUsed: null, aiTotalScore: null, confidence: null, flagForReview: false, ungradableReason: null,
  criterionResults: [], advocateOpinion: null, contextUsedQuestion: null, contextUsedModelAnswer: null, finalScore: null,
  reviewedAt: null, reviewedByName: null, editedCriteria: null, pipeline: 'investigator', currentScore: 8.5, currentScoreSource: 'computation',
  ...over,
});

const progress = (over: Partial<GradingProgress> = {}): GradingProgress => ({
  total: 3, pending: 0, done: 3, byStatus: {}, queue: { waiting: 0, active: 0, failed: 0 }, ...over,
});

const dossier = (errorFlags: { ruleKey: string; code: string }[]): ResultDetail => ({
  pipeline: 'investigator', currentScore: 8, currentScoreSource: 'computation', status: 'flagged_for_review',
  ungradableClass: null, ungradableReason: null,
  breakdown: { errors: [], perCriterion: [], caseFlags: [], errorFlags, confidence: 1, mismatchedRules: [], notConsidered: [], ungradable: null },
  investigation: null, challengeNotes: [], challengeVerdicts: [],
});

beforeEach(() => {
  search = 'sessionId=s1';
  h.overview = { data: [session()], isLoading: false, isError: false, error: null };
  h.summaries = { data: [], isLoading: false, isError: false, error: null };
  h.results = { data: [result()], isLoading: false, isError: false, error: null, refetch: vi.fn() };
  h.progress = { data: progress(), isLoading: false, isError: false, error: null, dataUpdatedAt: 1, refetch: vi.fn() };
  h.details = { byId: new Map(), loading: 0, failed: 0 };
  h.regradeMutate.mockReset();
  h.online = true;
  h.prepareProps.length = 0;
  h.runningProps.length = 0;
});

describe('/teacher/grading — without a session: the picker', () => {
  beforeEach(() => {
    search = '';
    h.overview = {
      data: [
        session({ id: 'a', name: 'Giữa kỳ N01' }),
        session({ id: 'b', name: 'Cuối kỳ N02', rubricId: null, className: 'N02' }),
        session({ id: 'c', name: 'Phiên chưa thu bài', fullySubmittedCount: 0, partialCount: 0 }),
      ],
      isLoading: false, isError: false, error: null,
    };
  });

  it('lists the sessions that have collected work, each name a link that keeps the session in the URL', () => {
    render(<GradingPage />);
    expect(screen.getByRole('link', { name: 'Giữa kỳ N01' })).toHaveAttribute('href', '/teacher/grading?sessionId=a');
    expect(screen.getByRole('link', { name: 'Cuối kỳ N02' })).toHaveAttribute('href', '/teacher/grading?sessionId=b');
    expect(screen.queryByText('Phiên chưa thu bài')).not.toBeInTheDocument();
  });

  it('a session with no rubric is still listed, and the row says what is missing', () => {
    h.summaries = { data: [{ examSessionId: 'a', byStatus: {}, ungradable: 0, hasQuestion: true }, { examSessionId: 'b', byStatus: {}, ungradable: 0, hasQuestion: true }], isLoading: false, isError: false, error: null };
    render(<GradingPage />);
    expect(within(screen.getByRole('link', { name: 'Cuối kỳ N02' }).closest('tr') as HTMLElement).getByText('Thiếu rubric')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: 'Giữa kỳ N01' }).closest('tr') as HTMLElement).queryByText('Thiếu rubric')).not.toBeInTheDocument();
  });

  it('shows how many results were collected out of how many are expected', () => {
    render(<GradingPage />);
    const row = screen.getByRole('link', { name: 'Giữa kỳ N01' }).closest('tr') as HTMLElement;
    expect(within(row).getByText('32')).toBeInTheDocument();
    expect(within(row).getByText('/40')).toBeInTheDocument();
  });

  it('says so, and why, when there is nothing to grade yet', () => {
    h.overview = { data: [], isLoading: false, isError: false, error: null };
    render(<GradingPage />);
    expect(screen.getByText(/Chưa có phiên thi nào thu được bài/)).toBeInTheDocument();
  });

  it('shows a loading state, not the empty message', () => {
    h.overview = { data: [], isLoading: true, isError: false, error: null };
    render(<GradingPage />);
    expect(screen.queryByText(/Chưa có phiên thi nào thu được bài/)).not.toBeInTheDocument();
  });

  it('shows the load error', () => {
    h.overview = { data: [], isLoading: false, isError: true, error: new Error('Mất kết nối') };
    render(<GradingPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Mất kết nối');
  });
});

describe('/teacher/grading?sessionId=… — one route, three states (spec §1)', () => {
  it('no results yet → PREPARE', () => {
    h.results = { ...h.results, data: [] };
    h.progress = { ...h.progress, data: progress({ total: 0, done: 0 }) };
    render(<GradingPage />);
    expect(screen.getByTestId('prepare-panel')).toHaveAttribute('data-all-ungradable', 'false');
    expect(screen.queryByTestId('running-panel')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('results still being graded → RUNNING, with the finished results below it, openable', () => {
    h.progress = { ...h.progress, data: progress({ total: 2, pending: 1, done: 1 }) };
    h.results = { ...h.results, data: [result({ id: 'a' }), result({ id: 'b', studentMssv: '20120002', status: 'ai_grading', currentScore: null })] };
    render(<GradingPage />);
    expect(screen.getByTestId('running-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('prepare-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '20120001' })).toHaveAttribute('href', '/teacher/grading/a?sessionId=s1');
  });

  it('everything graded → LIST: overview bar, results table, essay bulk-accept', () => {
    h.results = { ...h.results, data: [result({ id: 'a' }), result({ id: 'b', studentMssv: '20120002', status: 'flagged_for_review' })] };
    render(<GradingPage />);
    expect(screen.getByRole('list', { name: 'Số bài theo trạng thái' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-essays')).toBeInTheDocument();
    expect(screen.queryByTestId('prepare-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('running-panel')).not.toBeInTheDocument();
  });

  it('EVERY result "không chấm được" → the prepare screen reopens, with the list still reachable below', () => {
    h.results = { ...h.results, data: [result({ id: 'a', status: 'flagged_for_review', ungradableReason: 'hết giờ', currentScore: null })] };
    render(<GradingPage />);
    expect(screen.getByTestId('prepare-panel')).toHaveAttribute('data-all-ungradable', 'true');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('waits for the data instead of flashing the prepare screen on a session that already has results', () => {
    h.results = { ...h.results, data: undefined, isLoading: true };
    h.progress = { ...h.progress, data: undefined, isLoading: true };
    render(<GradingPage />);
    expect(screen.queryByTestId('prepare-panel')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('refetches the results every time a progress read comes in while grading, so finished rows appear', () => {
    h.progress = { ...h.progress, data: progress({ total: 2, pending: 1, done: 1 }), dataUpdatedAt: 100 };
    const { rerender } = render(<GradingPage />);
    const before = h.results.refetch.mock.calls.length;
    h.progress = { ...h.progress, dataUpdatedAt: 200 };
    rerender(<GradingPage />);
    expect(h.results.refetch.mock.calls.length).toBeGreaterThan(before);
  });

  it('hands the running panel the real progress, the machine\'s network state and a retry that refetches', () => {
    h.progress = { ...h.progress, data: progress({ total: 2, pending: 1, done: 1 }), isError: true, error: new Error('502'), dataUpdatedAt: 500 };
    h.online = false;
    render(<GradingPage />);
    const props = h.runningProps.at(-1) as { online: boolean; progressError: Error | null; lastReadAt: number; onRetry: () => void };
    expect(props.online).toBe(false);
    expect(props.progressError?.message).toBe('502');
    expect(props.lastReadAt).toBe(500);
    props.onRetry();
    expect(h.progress.refetch).toHaveBeenCalled();
  });

  it('says the list may be stale when a refetch failed, instead of showing it as current', () => {
    h.results = { ...h.results, isError: true, error: new Error('Mất kết nối') };
    render(<GradingPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Mất kết nối');
    expect(screen.getByRole('alert')).toHaveTextContent('dữ liệu cũ');
  });

  it('a session that is not in the list says so, with a way back', () => {
    search = 'sessionId=missing';
    render(<GradingPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy phiên thi này');
    expect(screen.getByRole('link', { name: 'Chọn phiên khác' })).toHaveAttribute('href', '/teacher/grading');
  });
});

describe('session header (spec §3.3)', () => {
  it('names the session, class, room and how many results were collected out of how many expected', () => {
    render(<GradingPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Giữa kỳ N01' })).toBeInTheDocument();
    // Tên phòng đúng như giảng viên đã nhập — không thêm chữ "Phòng" (spec 2026-09-29 mục 0, lỗi 7).
    expect(screen.getByText(/N01 · B2\.07/)).toBeInTheDocument();
    expect(screen.getByText('32/40 bài nộp')).toBeInTheDocument();
  });

  it('without a known roster there is no denominator to invent', () => {
    h.overview = { ...h.overview, data: [session({ rosterKnown: false, expectedCount: 0 })] };
    render(<GradingPage />);
    expect(screen.getByText('32 bài nộp')).toBeInTheDocument();
  });

  it('"Đổi phiên" goes back to the list the teacher had filtered', () => {
    sessionStorage.setItem('grading.list.query', 'status=attention&cls=c1');
    render(<GradingPage />);
    expect(screen.getByRole('link', { name: 'Đổi phiên' })).toHaveAttribute('href', '/teacher/grading?status=attention&cls=c1');
    sessionStorage.clear();
  });

  it('never shows "Phòng Phòng" for a room whose name already says Phòng', () => {
    h.overview = { data: [session({ roomName: 'Phòng máy B1' })], isLoading: false, isError: false, error: null };
    render(<GradingPage />);
    expect(screen.queryByText(/Phòng Phòng/)).not.toBeInTheDocument();
    expect(screen.getByText(/Phòng máy B1/)).toBeInTheDocument();
  });

  it('"Đổi phiên" goes back to the picker', () => {
    render(<GradingPage />);
    expect(screen.getByRole('link', { name: 'Đổi phiên' })).toHaveAttribute('href', '/teacher/grading');
  });

  it('"Chốt điểm phiên" opens the separate finalize page for THIS session', () => {
    render(<GradingPage />);
    expect(screen.getByRole('link', { name: 'Chốt điểm phiên' })).toHaveAttribute('href', '/teacher/grading/finalize?sessionId=s1');
  });

  it('finalizing is not offered before anything was graded — said, not silently dead', () => {
    h.results = { ...h.results, data: [] };
    render(<GradingPage />);
    expect(screen.queryByRole('link', { name: 'Chốt điểm phiên' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chốt điểm phiên' })).toBeDisabled();
  });

  it('"Chấm lại N bài lỗi hệ thống" is disabled + "cần backend" and sends nothing', () => {
    h.results = { ...h.results, data: [result({ id: 'a' }), result({ id: 'b', status: 'flagged_for_review', ungradableReason: 'x', currentScore: null })] };
    render(<GradingPage />);
    const button = screen.getByRole('button', { name: /Chấm lại 1 bài lỗi hệ thống/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(h.regradeMutate).not.toHaveBeenCalled();
  });

  it('does not offer that regrade when nothing failed', () => {
    render(<GradingPage />);
    expect(screen.queryByRole('button', { name: /lỗi hệ thống/ })).not.toBeInTheDocument();
  });
});

describe('list view — filter and the leverage line', () => {
  const needsYou = [result({ id: 'a', studentMssv: '1', status: 'flagged_for_review' }), result({ id: 'b', studentMssv: '2', status: 'flagged_for_review' })];

  it('?state= seeds the filter (the finalize page links here)', () => {
    search = 'sessionId=s1&state=needsYou';
    h.results = { ...h.results, data: [...needsYou, result({ id: 'c', studentMssv: '3' })] };
    render(<GradingPage />);
    expect(screen.getByRole('button', { name: 'Cần bạn xem · 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(2);
  });

  it('an unknown ?state= falls back to "Tất cả"', () => {
    search = 'sessionId=s1&state=bogus';
    h.results = { ...h.results, data: needsYou };
    render(<GradingPage />);
    expect(screen.getByRole('button', { name: 'Tất cả · 2' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the leverage line once every needs-you dossier is loaded and they only wait for prices', () => {
    h.results = { ...h.results, data: needsYou };
    h.details = { byId: new Map([['a', dossier([{ ruleKey: 'ten_bien', code: 'unpriced' }])], ['b', dossier([{ ruleKey: 'ten_bien', code: 'unpriced' }])]]), loading: 0, failed: 0 };
    render(<GradingPage />);
    expect(screen.getByRole('status')).toHaveTextContent('2 trong 2 bài cần xem đang chờ bạn đặt giá cho 1 luật');
  });

  it('says nothing while a dossier is missing — no claim from partial data', () => {
    h.results = { ...h.results, data: needsYou };
    h.details = { byId: new Map([['a', dossier([{ ruleKey: 'ten_bien', code: 'unpriced' }])]]), loading: 1, failed: 0 };
    render(<GradingPage />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
