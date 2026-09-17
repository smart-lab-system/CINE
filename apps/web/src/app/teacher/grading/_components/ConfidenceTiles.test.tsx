import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConfidenceTiles } from './ConfidenceTiles';
import type { GradingResult } from '@/lib/api/grading';

function result(over: Partial<GradingResult> = {}): GradingResult {
  return {
    id: Math.random().toString(36),
    submissionId: 's1',
    studentMssv: '2151010023',
    studentName: 'Nguyễn Minh Anh',
    status: 'flagged_for_review',
    modelUsed: 'keyword-match@1',
    aiTotalScore: 4,
    confidence: 0.3,
    flagForReview: true,
    ungradableReason: null,
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

const flagged = [result(), result(), result()];

describe('ConfidenceTiles', () => {
  it('đếm đúng theo nhóm', () => {
    render(
      <ConfidenceTiles results={flagged} queueActive={0} active="flagged" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Cần bạn duyệt/ })).toHaveTextContent('3');
  });

  it('giải thích vì sao nhiều bài bị giữ lại — như một bảo đảm, không như sự cố', () => {
    render(
      <ConfidenceTiles results={flagged} queueActive={0} active="flagged" onChange={vi.fn()} />,
    );
    // Không có câu này, giảng viên đọc con số cao thành "AI chấm kém" và mất
    // niềm tin vào một hệ thống đang hoạt động đúng thiết kế.
    expect(screen.getByText(/đây không phải lỗi/i)).toBeInTheDocument();
    expect(screen.getByText(/bảo đảm công bằng cho sinh viên/i)).toBeInTheDocument();
  });

  it('ô đang lọc được đánh dấu bằng aria-pressed', () => {
    render(
      <ConfidenceTiles results={flagged} queueActive={0} active="flagged" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Cần bạn duyệt/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /Tin cậy cao/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('bấm một ô thì báo nhóm đó ra ngoài', () => {
    const onChange = vi.fn();
    render(<ConfidenceTiles results={flagged} queueActive={0} active="flagged" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Tin cậy cao/ }));
    expect(onChange).toHaveBeenCalledWith('high');
  });

  it('không dùng thuật ngữ nội bộ', () => {
    const { container } = render(
      <ConfidenceTiles results={flagged} queueActive={0} active="flagged" onChange={vi.fn()} />,
    );
    expect(container.textContent).not.toMatch(
      /Advocate|Grader|flagged_for_review|ai_grading|guard|timeout/i,
    );
  });
});
