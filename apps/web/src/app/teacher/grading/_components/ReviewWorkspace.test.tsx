import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReviewWorkspace } from './ReviewWorkspace';
import type { GradingResult } from '@/lib/api/grading';

const useSubmitReviewMock = vi.fn();
vi.mock('@/hooks/useGrading', () => ({
  useSubmitReview: (...args: unknown[]) => useSubmitReviewMock(...args),
}));

function result(over: Partial<GradingResult> = {}): GradingResult {
  return {
    id: 'r1',
    submissionId: 's1',
    studentMssv: '20120001',
    studentName: 'Nguyễn Văn A',
    status: 'flagged_for_review',
    modelUsed: 'keyword-match@1',
    aiTotalScore: 4,
    confidence: 0.2,
    flagForReview: true,
    criterionResults: [
      {
        criterionId: 'c1',
        verdict: 'partially_met',
        points: 2,
        evidence: 'chưa nêu độ phức tạp',
      },
    ],
    // Mặc định là "cổng phản biện không kích hoạt" và "chấm trước khi hệ
    // thống ghi lại ngữ cảnh" — đúng hình dạng của mọi bài đã chấm trước
    // hôm nay, nên đó là mặc định trung thực cho factory này.
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

describe('ReviewWorkspace', () => {
  beforeEach(() => {
    useSubmitReviewMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
  });

  it('nhóm rail theo status, đếm đúng từng nhóm', () => {
    render(
      <ReviewWorkspace
        examSessionId="e1"
        results={[
          result({ id: 'r1', status: 'flagged_for_review' }),
          result({ id: 'r2', status: 'auto_approved', studentName: 'Trần B' }),
          result({ id: 'r3', status: 'auto_approved', studentName: 'Lê C' }),
        ]}
      />,
    );

    expect(screen.getByText(/Cần xem \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Tự duyệt \(2\)/)).toBeInTheDocument();
  });

  it('hiện điểm cuối cùng khi đã có review, điểm AI khi chưa', () => {
    render(
      <ReviewWorkspace
        examSessionId="e1"
        results={[
          result({
            id: 'r1',
            status: 'teacher_reviewed',
            finalScore: 7.5,
            aiTotalScore: 4,
            editedCriteria: [{ criterionId: 'c1', verdict: 'met', points: 7.5 }],
          }),
        ]}
      />,
    );

    // Khoanh vùng vào rail: tổng ở khung phải cũng là 7.5 và cũng đúng, nên
    // getByText toàn trang sẽ khớp hai chỗ. Điều cần khẳng định là DÒNG TRONG
    // RAIL hiện điểm cuối cùng chứ không phải điểm AI.
    const railRow = screen.getByRole('button', { name: /Nguyễn Văn A/ });
    expect(railRow).toHaveTextContent('7.5');
    // Điểm cuối cùng thắng điểm AI — đó là cả điểm của việc duyệt.
    expect(railRow).not.toHaveTextContent('4');
  });

  it('bài đang chấm thì khung phải chỉ đọc, không có nút Lưu', () => {
    render(
      <ReviewWorkspace
        examSessionId="e1"
        results={[result({ id: 'r1', status: 'ai_grading' })]}
      />,
    );

    expect(screen.queryByRole('button', { name: /Lưu duyệt/i })).not.toBeInTheDocument();
    expect(screen.getByText(/AI đang chấm/i)).toBeInTheDocument();
  });

  it('sau khi chốt, nút Lưu cảnh báo sẽ ghi nhật ký', () => {
    render(
      <ReviewWorkspace
        examSessionId="e1"
        results={[
          result({
            id: 'r1',
            status: 'finalized',
            finalScore: 7.5,
            editedCriteria: [{ criterionId: 'c1', verdict: 'met', points: 7.5 }],
          }),
        ]}
      />,
    );

    expect(screen.getByText(/ghi vào nhật ký/i)).toBeInTheDocument();
  });
});
