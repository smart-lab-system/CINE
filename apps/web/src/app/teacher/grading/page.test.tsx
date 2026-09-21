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

const useSessionOverviewMock = vi.fn();
vi.mock('@/hooks/useSubmissionOverview', () => ({
  useSessionOverview: (...args: unknown[]) => useSessionOverviewMock(...args),
}));

const useSetSessionRubricMock = vi.fn();

const useTeachingClassesMock = vi.fn();
vi.mock('@/hooks/useTeaching', () => ({
  useTeachingClasses: (...args: unknown[]) => useTeachingClassesMock(...args),
}));

const useGradingResultsMock = vi.fn();
const useRubricsMock = vi.fn();
const useSaveRubricMock = vi.fn();
const useStartGradingMock = vi.fn();
const useGradingProgressMock = vi.fn();
const useGradingReadinessMock = vi.fn();
const useRegradeStuckMock = vi.fn();
vi.mock('@/hooks/useGrading', () => ({
  useGradingResults: (...args: unknown[]) => useGradingResultsMock(...args),
  useRubrics: (...args: unknown[]) => useRubricsMock(...args),
  useSaveRubric: (...args: unknown[]) => useSaveRubricMock(...args),
  useSetSessionRubric: (...args: unknown[]) => useSetSessionRubricMock(...args),
  useStartGrading: (...args: unknown[]) => useStartGradingMock(...args),
  useGradingProgress: (...args: unknown[]) => useGradingProgressMock(...args),
  useGradingReadiness: (...args: unknown[]) => useGradingReadinessMock(...args),
  useRegradeStuck: (...args: unknown[]) => useRegradeStuckMock(...args),
  useSetGradingReference: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // Khi có kết quả chấm, ReviewWorkspace và FinalizeGradesButton cũng mount.
  useSubmitReview: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useFinalizeGrades: () => ({ mutate: vi.fn(), isPending: false, isError: false, isSuccess: false }),
}));

// Dialog cấu hình đọc danh sách tài liệu qua hook riêng của phiên thi.
vi.mock('@/hooks/useExamSession', () => ({
  useExamMaterials: () => ({ data: [], isLoading: false }),
}));

beforeEach(() => {
  searchParams = new URLSearchParams();
  useSessionOverviewMock.mockReset();
  useSetSessionRubricMock.mockReset();
  useTeachingClassesMock.mockReset();
  useGradingResultsMock.mockReset();
  // Mặc định: không có lượt chấm nào đang chạy. Khối tiến độ chỉ hiện
  // khi pending > 0, nên mặc định này giữ nguyên hành vi của mọi ca cũ.
  useGradingProgressMock.mockReset();
  useGradingProgressMock.mockReturnValue({ data: undefined, isLoading: false });
  useRubricsMock.mockReset();
  useSaveRubricMock.mockReset();
  useStartGradingMock.mockReset();
  // Mặc định: chưa nạp được mức sẵn sàng. Dải chỉ render khi có data, nên
  // mặc định này giữ nguyên hành vi của mọi ca cũ.
  useGradingReadinessMock.mockReset();
  useGradingReadinessMock.mockReturnValue({ data: undefined, isLoading: false });
  useRegradeStuckMock.mockReset();
  useRegradeStuckMock.mockReturnValue({ mutate: vi.fn(), isPending: false, isSuccess: false });

  useSessionOverviewMock.mockReturnValue({
    data: [
      {
        id: 'session-2',
        name: 'Cuối kỳ',
        courseId: 'course-1',
        courseName: 'Cấu trúc dữ liệu',
        rubricId: 'rubric-1',
        rubricVersion: 3,
        fullySubmittedCount: 2,
        partialCount: 0,
      },
    ],
    isLoading: false,
  });
  useSetSessionRubricMock.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false, error: null });
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

  it('KHÔNG ẩn phiên có bài thu mà chưa gắn rubric (spec §5.3)', () => {
    // Test quan trọng nhất của trang này. Ẩn phiên thiếu rubric là giấu mất
    // bài thi thật của sinh viên vì một field mà hệ thống chưa từng hỏi
    // giảng viên — đúng lỗi đã phải đẻ ra màn admin/unowned-courses để cứu.
    useSessionOverviewMock.mockReturnValue({
      data: [
        {
          id: 'session-9',
          name: 'Phiên thiếu rubric',
          courseId: 'course-1',
          courseName: 'Lập trình Web',
          rubricId: null,
          rubricVersion: null,
          fullySubmittedCount: 3,
          partialCount: 0,
        },
      ],
      isLoading: false,
    });
    searchParams = new URLSearchParams('sessionId=session-9');

    render(<GradingPage />);

    // Hai chỗ, có chủ đích: hậu tố trong ô chọn (thấy được TRƯỚC khi chọn)
    // và thẻ chặn sau khi chọn. Khẳng định riêng thẻ chặn, vì nó là thứ nói
    // rõ bài vẫn còn và chỉ ra cách xử lý.
    expect(screen.getByText(/chưa chấm được/i)).toBeInTheDocument();
    expect(screen.getAllByText(/chưa gắn rubric/i).length).toBeGreaterThan(0);
    // Và không được tắt câm: nút phải nêu lý do.
    const startButton = screen.getByRole('button', { name: /Bắt đầu chấm/i });
    expect(startButton).toBeDisabled();
    expect(startButton).toHaveAttribute('title', expect.stringMatching(/chưa gắn rubric/i));
  });

  it('ẩn phiên chưa có bài nộp nào — không có gì để chấm', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [
        {
          id: 'session-8',
          name: 'Phiên chưa ai nộp',
          courseId: 'course-1',
          courseName: 'Lập trình Web',
          rubricId: 'rubric-1',
          rubricVersion: 1,
          fullySubmittedCount: 0,
          partialCount: 0,
        },
      ],
      isLoading: false,
    });
    searchParams = new URLSearchParams('sessionId=session-8');

    render(<GradingPage />);

    // Khác hẳn ca trên: ở đây không có bài nào để mất, nên ẩn là đúng.
    expect(screen.queryByText('Kết quả chấm')).not.toBeInTheDocument();
  });

  it('hiện phiên bản rubric đã ghim của phiên, không phải bản mới nhất của môn', () => {
    useRubricsMock.mockReturnValue({
      // Môn đã có bản 5 đang active — phiên vẫn phải nói bản 3.
      data: [{ id: 'rubric-5', version: 5, isActive: true, totalPoints: 10, criteria: [] }],
      isLoading: false,
    });
    searchParams = new URLSearchParams('sessionId=session-2');

    render(<GradingPage />);

    expect(screen.getByText(/phiên bản 3/i)).toBeInTheDocument();
    expect(screen.queryByText(/phiên bản 5/i)).not.toBeInTheDocument();
  });

  describe('chấm điểm chạy nền', () => {
    it('hiện tiến độ khi còn bài đang chấm', () => {
      // Lý do tồn tại của khối này: từ 2026-09-11 "Bắt đầu chấm" trả về
      // ngay sau khi xếp hàng, và một lượt 40 bài mất nhiều phút. Không có
      // nó, giảng viên bấm nút rồi nhìn một màn hình đứng yên — chuyển
      // sang hàng đợi mà đổi một timeout lấy một màn hình im lặng.
      useGradingProgressMock.mockReturnValue({
        data: { total: 10, pending: 4, done: 6, byStatus: {}, queue: { waiting: 4, active: 1, failed: 0 } },
        isLoading: false,
      });
      searchParams = new URLSearchParams('sessionId=session-2');

      render(<GradingPage />);

      expect(screen.getByText(/đang chấm 6\/10 bài/i)).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '6');
    });

    it('khoá nút trong lúc đang chấm', () => {
      // Bấm lại lúc đó không tạo thêm gì — jobId trùng bị bỏ qua — nhưng
      // một nút bấm được trong khi không có gì xảy ra là một lời nói dối.
      useGradingProgressMock.mockReturnValue({
        data: { total: 10, pending: 4, done: 6, byStatus: {}, queue: { waiting: 4, active: 1, failed: 0 } },
        isLoading: false,
      });
      searchParams = new URLSearchParams('sessionId=session-2');

      render(<GradingPage />);

      expect(screen.getByRole('button', { name: /bắt đầu chấm/i })).toBeDisabled();
    });

    it('chấm xong thì khối tiến độ biến mất', () => {
      useGradingProgressMock.mockReturnValue({
        data: { total: 10, pending: 0, done: 10, byStatus: {}, queue: { waiting: 0, active: 0, failed: 0 } },
        isLoading: false,
      });
      searchParams = new URLSearchParams('sessionId=session-2');

      render(<GradingPage />);

      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /bắt đầu chấm/i })).toBeEnabled();
    });

    it('job lỗi trong hàng đợi nói "có gì đó hỏng", không nói "bài của bạn hỏng"', () => {
      // `queue` đếm TOÀN hàng đợi, không theo phiên — nên câu chữ phải là
      // một lời nhắc chung, không phải một kết luận về phiên này.
      useGradingProgressMock.mockReturnValue({
        data: { total: 10, pending: 4, done: 6, byStatus: {}, queue: { waiting: 2, active: 1, failed: 3 } },
        isLoading: false,
      });
      searchParams = new URLSearchParams('sessionId=session-2');

      render(<GradingPage />);

      expect(screen.getByText(/hàng đợi đang có 3 job lỗi/i)).toBeInTheDocument();
    });
  });

  describe('điều phối', () => {
    const READY = { level: 'with_question', warning: null, hasQuestion: true, hasModelAnswer: false };

    function gradedResult(over: Record<string, unknown> = {}) {
      return {
        id: 'r1',
        submissionId: 'sub-1',
        studentMssv: '2151010023',
        studentName: 'Nguyễn Minh Anh',
        homeClassId: 'class-a',
        homeClassName: 'N01',
        status: 'flagged_for_review',
        modelUsed: 'keyword-match@1',
        aiTotalScore: 4,
        confidence: 0.3,
        flagForReview: true,
        criterionResults: [
          { criterionId: 'c1', verdict: 'not_met', points: 0, evidence: '', check: 'empty' },
        ],
        advocateOpinion: null,
        contextUsedQuestion: null,
        contextUsedModelAnswer: null,
        finalScore: null,
        reviewedAt: null,
        reviewedByName: null,
        editedCriteria: null,
        ...over,
      };
    }

    it('dải mức sẵn sàng đứng TRƯỚC khối tiến độ', async () => {
      useGradingReadinessMock.mockReturnValue({ data: READY, isLoading: false });
      useGradingProgressMock.mockReturnValue({
        data: { total: 4, pending: 2, done: 2, byStatus: {}, queue: { waiting: 1, active: 1, failed: 0 } },
        isLoading: false,
      });
      searchParams = new URLSearchParams('sessionId=session-2');
      render(<GradingPage />);

      const readiness = await screen.findByText(/Mức sẵn sàng chấm/);
      const progress = screen.getByText(/Đang chấm 2\/4 bài/);
      // "Bạn đang chấm với bao nhiêu ngữ cảnh" quan trọng hơn "đã chấm bao
      // nhiêu bài" — mức sẵn sàng quyết định lượt phản biện có chạy không.
      expect(readiness.compareDocumentPosition(progress)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it('nút chấm lại bài treo TẮT khi hàng đợi còn job chạy', async () => {
      useGradingReadinessMock.mockReturnValue({ data: READY, isLoading: false });
      useGradingResultsMock.mockReturnValue({
        data: [gradedResult({ status: 'ai_grading' })],
        isLoading: false,
      });
      useGradingProgressMock.mockReturnValue({
        data: { total: 1, pending: 1, done: 0, byStatus: {}, queue: { waiting: 0, active: 2, failed: 0 } },
        isLoading: false,
      });
      searchParams = new URLSearchParams('sessionId=session-2');
      render(<GradingPage />);

      // Một bài đang được worker chấm dở cũng ở `ai_grading`; xếp lại nó là
      // tự tạo ra đúng lượt chấm trùng mà jobId sinh ra để chặn.
      expect(await screen.findByRole('button', { name: /Chấm lại/ })).toBeDisabled();
    });

    it('nút chấm lại BẬT khi hàng đợi rỗng mà vẫn còn bài treo', async () => {
      useGradingReadinessMock.mockReturnValue({ data: READY, isLoading: false });
      useGradingResultsMock.mockReturnValue({
        data: [gradedResult({ status: 'ai_grading' })],
        isLoading: false,
      });
      useGradingProgressMock.mockReturnValue({
        data: { total: 1, pending: 1, done: 0, byStatus: {}, queue: { waiting: 0, active: 0, failed: 0 } },
        isLoading: false,
      });
      searchParams = new URLSearchParams('sessionId=session-2');
      render(<GradingPage />);

      expect(await screen.findByRole('button', { name: /Chấm lại 1 bài treo/ })).toBeEnabled();
    });

    it('báo khi lượt chấm trả lời mà không dùng tới đề bài', async () => {
      useGradingReadinessMock.mockReturnValue({ data: READY, isLoading: false });
      useGradingResultsMock.mockReturnValue({
        data: [gradedResult({ contextUsedQuestion: false })],
        isLoading: false,
      });
      searchParams = new URLSearchParams('sessionId=session-2');
      render(<GradingPage />);

      expect(await screen.findByText(/không dùng tới đề bài/)).toBeInTheDocument();
    });

    it('KHÔNG cảnh báo khi contextUsedQuestion là null — bài chấm trước khi đo', async () => {
      useGradingReadinessMock.mockReturnValue({ data: READY, isLoading: false });
      useGradingResultsMock.mockReturnValue({
        data: [gradedResult({ contextUsedQuestion: null })],
        isLoading: false,
      });
      searchParams = new URLSearchParams('sessionId=session-2');
      render(<GradingPage />);

      await screen.findByText(/Mức sẵn sàng chấm/);
      // null = chưa đo, khác false = đã đo và không có. Gộp hai thứ sẽ báo
      // động giả trên mọi bài cũ.
      expect(screen.queryByText(/không dùng tới đề bài/)).not.toBeInTheDocument();
    });
  });
});
