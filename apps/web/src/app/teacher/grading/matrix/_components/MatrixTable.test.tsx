import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MatrixTable } from './MatrixTable';
import { noAdvocate, rubric, stillGrading, withAdvocate } from './fixtures';

function show(results = [withAdvocate], queueActive = 2) {
  return render(
    <MatrixTable
      results={results}
      rubric={rubric}
      queueActive={queueActive}
      selectedIds={[]}
      onToggle={vi.fn()}
      onToggleAll={vi.fn()}
    />,
  );
}

describe('MatrixTable', () => {
  it('cột "Phản biện" nói rõ đó là điểm QUY RA, không phải điểm ai đó chấm', () => {
    show();
    expect(screen.getByText(/quy ra từ các mức đánh giá/i)).toBeInTheDocument();
  });

  it('hiện một câu tóm tắt của lượt phản biện — nắm tình hình mà không mở bài', () => {
    show();
    expect(screen.getByText(/Em ấy mô tả đúng cơ chế bù trừ/)).toBeInTheDocument();
  });

  it('bài không có ý kiến phản biện hiện dấu gạch, không hiện 0', () => {
    // 0 đọc thành "phản biện chấm 0 điểm". Hai thứ khác nhau.
    show([noAdvocate]);
    expect(screen.getByTestId('advocate-score-r2')).toHaveTextContent('—');
  });

  it('hàng đợi đang chạy thì KHÔNG gọi bài đang chấm là "đang kẹt"', () => {
    // `queueActive={2}` — hàng đợi có việc. Một bài đang chấm lúc này là
    // bình thường, không phải sự cố.
    show([stillGrading], 2);
    expect(screen.queryByText(/kẹt/i)).not.toBeInTheDocument();
  });

  it('tick ô đầu bảng chọn TẤT CẢ dòng đang hiện', () => {
    const onToggleAll = vi.fn();
    render(
      <MatrixTable
        results={[withAdvocate, noAdvocate]}
        rubric={rubric}
        queueActive={0}
        selectedIds={[]}
        onToggle={vi.fn()}
        onToggleAll={onToggleAll}
      />,
    );
    fireEvent.click(screen.getByLabelText('Chọn tất cả'));
    expect(onToggleAll).toHaveBeenCalledWith(true);
  });

  it('không dùng thuật ngữ nội bộ', () => {
    const { container } = show();
    expect(container.textContent).not.toMatch(/Advocate|Grader|flagged_for_review|keep_ai/i);
  });

  it('bài pipeline=investigator trỏ tới Hồ sơ một bài, không phải màn chấm cũ', () => {
    show([{ ...withAdvocate, pipeline: 'investigator' }]);
    expect(screen.getByRole('link', { name: 'Xem' })).toHaveAttribute(
      'href',
      `/teacher/grading/investigation/${withAdvocate.id}`,
    );
  });

  it('bài pipeline=one_shot (hoặc thiếu) trỏ tới màn chấm cũ', () => {
    show([withAdvocate]);
    expect(screen.getByRole('link', { name: 'Xem' })).toHaveAttribute(
      'href',
      `/teacher/grading/${withAdvocate.id}`,
    );
  });

  it('bài investigator ở bucket "high" hiện nhãn ĐÚNG, không phải "Trích dẫn đã đối chiếu" (chưa từng đối chiếu gì)', () => {
    show([{ ...withAdvocate, pipeline: 'investigator', status: 'auto_approved', criterionResults: [], confidence: null }]);
    expect(screen.queryByText(/trích dẫn đã đối chiếu/i)).not.toBeInTheDocument();
  });

  it('bài one_shot ở bucket "high" vẫn hiện đúng nhãn cũ — không hồi quy', () => {
    show([{ ...withAdvocate, status: 'auto_approved', confidence: 0.9, criterionResults: [] }]);
    expect(screen.getByText(/trích dẫn đã đối chiếu/i)).toBeInTheDocument();
  });
});
