import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReviewWorkspace } from './ReviewWorkspace';
import type { GradingResult } from '@/lib/api/grading';

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
  it('nhóm danh sách theo status, đếm đúng từng nhóm', () => {
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

    const row = screen.getByRole('link', { name: /Nguyễn Văn A/ });
    expect(row).toHaveTextContent('7.5');
    // Điểm cuối cùng thắng điểm AI — đó là cả điểm của việc duyệt.
    expect(row).not.toHaveTextContent('4');
  });

  it('mỗi dòng là một LINK trỏ thẳng vào bài, kèm phiên thi', () => {
    // Đường dẫn trỏ thẳng vào một bài là thứ cần thật khi sinh viên phúc
    // khảo — gửi được cho đồng nghiệp mà không phải mô tả đường đi.
    render(
      <ReviewWorkspace examSessionId="e1" results={[result({ id: 'r1' })]} />,
    );

    expect(screen.getByRole('link', { name: /Nguyễn Văn A/ })).toHaveAttribute(
      'href',
      '/teacher/grading/r1?sessionId=e1',
    );
  });

  it('danh sách rỗng nói rõ, không hiện khung trắng', () => {
    render(<ReviewWorkspace examSessionId="e1" results={[]} />);
    expect(screen.getByText(/Chưa có bài nào để duyệt/)).toBeInTheDocument();
  });
});
