import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AnomalyPanel } from './AnomalyPanel';
import type { AdvocateOpinion, GradingResult, Rubric } from '@/lib/api/grading';

const rubric: Rubric = {
  id: 'rub-1',
  courseId: 'c-1',
  version: 3,
  isActive: true,
  totalPoints: 4,
  criteria: [{ id: 'c2', description: 'Xử lý nhất quán dữ liệu', maxPoints: 4 }],
};

function result(over: Partial<GradingResult> = {}): GradingResult {
  return {
    id: Math.random().toString(36),
    submissionId: 's1',
    studentMssv: '2151010023',
    studentName: 'Nguyễn Minh Anh',
    status: 'flagged_for_review',
    modelUsed: 'keyword-match@1',
    aiTotalScore: 0,
    confidence: 0.3,
    flagForReview: true,
    criterionResults: [
      { criterionId: 'c2', verdict: 'not_met', points: 0, evidence: '', check: 'empty' },
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

const opinion: AdvocateOpinion = {
  isCorrect: 'yes',
  reasoning: 'Em ấy mô tả đúng cơ chế bù trừ.',
  evidence: [],
  suggestedVerdicts: [{ criterionId: 'c2', suggestedVerdict: 'met', why: '' }],
  unverifiedEvidence: [],
};

describe('AnomalyPanel', () => {
  it('gọi tên tiêu chí bị trừ điểm hàng loạt, và đổ lỗi cho RUBRIC chứ không cho lớp', () => {
    const results = Array.from({ length: 10 }, () => result());
    render(<AnomalyPanel results={results} rubric={rubric} />);

    expect(screen.getByText(/10\/10 bài mất điểm ở "Xử lý nhất quán dữ liệu"/)).toBeInTheDocument();
    expect(screen.getByText(/nằm ở cách tiêu chí được viết chứ không ở bài làm/i)).toBeInTheDocument();
  });

  it('nói rõ khoảng cách KHÔNG phải điểm đã bị sửa', () => {
    const results = [result({ advocateOpinion: opinion })];
    render(<AnomalyPanel results={results} rubric={rubric} />);

    // Không có câu này, giảng viên đọc "+4 điểm" thành "AI đã tự nâng điểm".
    expect(screen.getByText(/không bao giờ tự sửa điểm/i)).toBeInTheDocument();
    expect(screen.getByText(/khoảng cách giữa hai lập luận/i)).toBeInTheDocument();
  });

  it('không render gì khi không có bất thường nào', () => {
    const clean = [
      result({
        status: 'auto_approved',
        aiTotalScore: 4,
        confidence: 0.9,
        criterionResults: [
          { criterionId: 'c2', verdict: 'met', points: 4, evidence: 'ok', check: 'ok' },
        ],
      }),
    ];
    const { container } = render(<AnomalyPanel results={clean} rubric={rubric} />);
    // Một khối rỗng mang tiêu đề "Bất thường" tự nó là một cảnh báo giả.
    expect(container).toBeEmptyDOMElement();
  });

  it('nút mở tiêu chí báo đúng id ra ngoài', () => {
    const onOpenCriterion = vi.fn();
    const results = Array.from({ length: 10 }, () => result());
    render(<AnomalyPanel results={results} rubric={rubric} onOpenCriterion={onOpenCriterion} />);

    fireEvent.click(screen.getByRole('button', { name: /Xem các bài mất điểm/ }));
    expect(onOpenCriterion).toHaveBeenCalledWith('c2');
  });

  it('chưa tải được rubric thì vẫn chạy, không nổ', () => {
    const results = Array.from({ length: 10 }, () => result());
    render(<AnomalyPanel results={results} rubric={undefined} />);
    expect(screen.getByText(/10\/10 bài mất điểm/)).toBeInTheDocument();
  });
});
