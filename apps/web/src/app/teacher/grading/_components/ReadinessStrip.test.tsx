import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReadinessStrip } from './ReadinessStrip';
import type { GradingReadiness } from '@/lib/api/grading';

function readiness(over: Partial<GradingReadiness> = {}): GradingReadiness {
  return {
    level: 'rubric_only',
    warning: null,
    hasQuestion: false,
    hasModelAnswer: false,
    ...over,
  };
}

/**
 * Dải mức sẵn sàng đứng ĐẦU màn Điều phối, trên cả con số tiến độ.
 *
 * Lý do nằm ở một sự thật vận hành: lượt phản biện chỉ chạy khi phiên có đề
 * bài, và cho tới nay không màn hình nào đặt được nó — nên nhánh bảo vệ sinh
 * viên làm đúng theo cách khác chưa chạy lần nào. Dải này tồn tại để trạng
 * thái đó không còn im lặng được.
 */
describe('ReadinessStrip', () => {
  it('nói rõ lượt phản biện KHÔNG chạy khi chưa có đề bài', () => {
    render(<ReadinessStrip readiness={readiness()} onConfigure={vi.fn()} />);

    expect(screen.getByText(/Đang chấm ở Mức 1/)).toBeInTheDocument();
    expect(screen.getByText(/không chạy/)).toBeInTheDocument();
    // Câu quan trọng nhất: hậu quả với sinh viên, không phải trạng thái máy.
    expect(screen.getByText(/không có ai lên tiếng/)).toBeInTheDocument();
  });

  it('ở Mức 2 thì báo lượt phản biện CÓ chạy', () => {
    render(
      <ReadinessStrip readiness={readiness({ level: 'with_question', hasQuestion: true })} onConfigure={vi.fn()} />,
    );

    expect(screen.getByText(/Đang chấm ở Mức 2/)).toBeInTheDocument();
    expect(screen.getByText(/có chạy ở mức này/)).toBeInTheDocument();
    expect(screen.queryByText(/không có ai lên tiếng/)).not.toBeInTheDocument();
  });

  it('Mức 3 khi đã có đáp án mẫu', () => {
    render(
      <ReadinessStrip
        readiness={readiness({ level: 'with_model_answer', hasQuestion: true, hasModelAnswer: true })}
        onConfigure={vi.fn()}
      />,
    );
    expect(screen.getByText(/đang ở mức 3 trên 3/i)).toBeInTheDocument();
  });

  it('hiện nguyên văn cảnh báo server gửi về, không diễn giải lại', () => {
    render(
      <ReadinessStrip
        readiness={readiness({ warning: 'Đề bài đã chọn không còn trên kho lưu trữ.' })}
        onConfigure={vi.fn()}
      />,
    );
    expect(screen.getByText('Đề bài đã chọn không còn trên kho lưu trữ.')).toBeInTheDocument();
  });

  it('không dùng thuật ngữ nội bộ trên màn hình', () => {
    // Bảng quy đổi ở spec §3.2. Chữ trên màn hình nói với giảng viên, không
    // nói với người viết code.
    const { container } = render(
      <ReadinessStrip
        readiness={readiness({ level: 'with_model_answer', hasQuestion: true, hasModelAnswer: true })}
        onConfigure={vi.fn()}
      />,
    );
    expect(container.textContent).not.toMatch(
      /Advocate|Grader|rubric_only|with_question|with_model_answer|guard/i,
    );
  });

  it('nút cấu hình gọi đúng callback', () => {
    const onConfigure = vi.fn();
    render(<ReadinessStrip readiness={readiness()} onConfigure={onConfigure} />);

    fireEvent.click(screen.getByRole('button', { name: /Cấu hình đề bài/ }));
    expect(onConfigure).toHaveBeenCalledTimes(1);
  });
});
