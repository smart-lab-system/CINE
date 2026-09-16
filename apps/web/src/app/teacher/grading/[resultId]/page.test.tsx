import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import GradingDetailPage from './page';
import type { GradingResult, Rubric, SubmissionText } from '@/lib/api/grading';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('sessionId=e1'),
}));

const submitMock = vi.fn();
let resultsData: GradingResult[] = [];
let textData: SubmissionText | undefined;
let readinessData: unknown = { level: 'with_question', warning: null, hasQuestion: true, hasModelAnswer: false };

const rubric: Rubric = {
  id: 'rub-1',
  courseId: 'course-1',
  version: 3,
  isActive: true,
  totalPoints: 4,
  criteria: [{ id: 'c1', description: 'Xử lý nhất quán dữ liệu', maxPoints: 4 }],
};

vi.mock('@/hooks/useGrading', () => ({
  useGradingResults: () => ({ data: resultsData, isLoading: false }),
  useGradingReadiness: () => ({ data: readinessData, isLoading: false }),
  useSubmissionText: () => ({ data: textData, isLoading: false }),
  useRubrics: () => ({ data: [rubric], isLoading: false }),
  useSubmitReview: () => ({ mutate: submitMock, isPending: false, isError: false, error: null }),
}));

vi.mock('@/hooks/useSubmissionOverview', () => ({
  useSessionOverview: () => ({
    data: [{ id: 'e1', name: 'Cuối kỳ', courseId: 'course-1', rubricVersion: 3 }],
    isLoading: false,
  }),
}));

function result(over: Partial<GradingResult> = {}): GradingResult {
  return {
    id: 'r1',
    submissionId: 's1',
    studentMssv: '2151010023',
    studentName: 'Nguyễn Minh Anh',
    status: 'flagged_for_review',
    modelUsed: 'keyword-match@1',
    aiTotalScore: 0,
    confidence: 0.42,
    flagForReview: true,
    criterionResults: [
      {
        criterionId: 'c1',
        verdict: 'not_met',
        points: 0,
        evidence: 'ghi một bản ghi trạng thái trung gian',
        check: 'ok',
      },
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

async function page() {
  // Trang dùng `use(params)` — Next 15 truyền params dưới dạng Promise, và
  // `use` suspend ở lần render đầu kể cả khi promise đã resolve. Cần CẢ ranh
  // giới Suspense lẫn một `act` được await, nếu không render đồng bộ của RTL
  // dừng lại ở fallback và mọi truy vấn đều không thấy gì.
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <GradingDetailPage params={Promise.resolve({ resultId: 'r1' })} />
      </Suspense>,
    );
  });
}

describe('GradingDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resultsData = [result()];
    readinessData = {
      level: 'with_question',
      warning: null,
      hasQuestion: true,
      hasModelAnswer: false,
    };
    textData = {
      paragraphs: ['Em ghi một bản ghi trạng thái trung gian rồi hoàn tác sau.'],
      spans: [{ criterionId: 'c1', paragraph: 0, start: 3, end: 40 }],
      unlocatable: [],
      truncatedByGrading: false,
    };
  });

  it('bài đang chấm thì chỉ đọc, không có nút Lưu', async () => {
    resultsData = [result({ status: 'ai_grading' })];
    await page();

    expect(await screen.findByText(/AI đang chấm bài này/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lưu duyệt/ })).not.toBeInTheDocument();
  });

  it('bài đã chốt thì cảnh báo sẽ ghi nhật ký', async () => {
    resultsData = [result({ status: 'finalized', finalScore: 4 })];
    await page();

    expect(await screen.findByText(/ghi vào nhật ký/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lưu và ghi nhật ký/ })).toBeInTheDocument();
  });

  it('gửi ĐỦ mọi tiêu chí kèm ghi chú khi lưu', async () => {
    await page();
    await screen.findByText('Xử lý nhất quán dữ liệu');

    fireEvent.change(screen.getByLabelText(/Ghi chú riêng/), {
      target: { value: 'châm chước lỗi chính tả' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Lưu duyệt$/ }));

    expect(submitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gradingResultId: 'r1',
        criteria: [{ criterionId: 'c1', verdict: 'not_met', points: 0 }],
        privateNote: 'châm chước lỗi chính tả',
      }),
      expect.anything(),
    );
  });

  it('cho điểm lại thì tổng đổi theo, và payload mang điểm mới', async () => {
    await page();
    await screen.findByText('Xử lý nhất quán dữ liệu');

    fireEvent.click(screen.getByRole('button', { name: '4' }));
    fireEvent.click(screen.getByRole('button', { name: /^Lưu duyệt$/ }));

    expect(submitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        criteria: [{ criterionId: 'c1', verdict: 'met', points: 4 }],
      }),
      expect.anything(),
    );
  });

  it('cảnh báo riêng cho bài chấm mà không đọc được đề', async () => {
    resultsData = [result({ contextUsedQuestion: false })];
    await page();
    expect(await screen.findByText(/chấm mà không đọc được đề/)).toBeInTheDocument();
  });

  it('không cảnh báo khi contextUsedQuestion là null', async () => {
    await page();
    await screen.findByText('Xử lý nhất quán dữ liệu');
    // null = bài chấm trước khi hệ thống đo, khác false = đã đo và không có.
    expect(screen.queryByText(/chấm mà không đọc được đề/)).not.toBeInTheDocument();
  });

  it('không tìm thấy bài thì chỉ đường quay lại, không hiện trang trống', async () => {
    resultsData = [];
    await page();
    expect(await screen.findByText(/Không tìm thấy bài này/)).toBeInTheDocument();
  });
});
