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
});
