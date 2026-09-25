import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QuestionCard } from './question-card';
import type { GeneratedQuestion } from '@/lib/api/exam-authoring';

/** `topic`/`requiredComplexity` là văn bản TỰ DO của model, không giới hạn
 *  độ dài ở đâu cả — model đã thật sự viết dài như dưới đây (đo 2026-09-24),
 *  không phải fixture bịa cho khớp bug. */
const LONG_TOPIC = 'Đồ thị - Thuật toán Dijkstra trên lưới có trọng số và chướng ngại vật';
const LONG_COMPLEXITY =
  'O(M*N log(M*N)) thời gian, O(M*N) bộ nhớ; cấm đệ quy vét cạn thuần túy';

function question(overrides: Partial<GeneratedQuestion> = {}): GeneratedQuestion {
  return {
    statement: 'Đường đi rẻ nhất trong lưới có chi phí và chướng ngại vật.',
    points: 3.5,
    topic: LONG_TOPIC,
    requiredComplexity: LONG_COMPLEXITY,
    modelAnswer: 'def solve():\n    pass\n',
    testBundle: [],
    resemblesKnownProblem: null,
    ...overrides,
  };
}

const noop = () => {};

describe('QuestionCard — dải tiêu đề khi gập lại', () => {
  // Bug thật 2026-09-24: `topic`/`requiredComplexity` không có giới hạn độ
  // dài, và badge của chúng (badge.tsx) không tự cắt. Khi model viết dài
  // (đã xảy ra thật), dải tiêu đề GẬP LẠI phình gần bằng lúc MỞ RA — gập
  // "không có tác dụng gì" theo đúng lời báo của người dùng.
  it('MỞ RA thì hiện topic/độ phức tạp ĐẦY ĐỦ, không cắt — cần đọc hết lúc đang xem chi tiết', () => {
    render(
      <QuestionCard
        index={2}
        question={question()}
        onChange={noop}
        onRegenerate={noop}
        regenerating={false}
      />,
    );
    // `useState(true)` — mặc định đã MỞ, không cần bấm gì.
    const topicBadge = screen.getByText(LONG_TOPIC);
    const complexityBadge = screen.getByText(LONG_COMPLEXITY);
    expect(topicBadge).not.toHaveClass('truncate');
    expect(complexityBadge).not.toHaveClass('truncate');
  });

  it('GẬP LẠI thì topic/độ phức tạp bị CẮT — dải tiêu đề phải thật sự gọn', () => {
    render(
      <QuestionCard
        index={2}
        question={question()}
        onChange={noop}
        onRegenerate={noop}
        regenerating={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /gập lại câu 3/i }));

    const topicBadge = screen.getByText(LONG_TOPIC);
    const complexityBadge = screen.getByText(LONG_COMPLEXITY);
    expect(topicBadge).toHaveClass('truncate');
    expect(complexityBadge).toHaveClass('truncate');
    // Cắt bằng CSS (ellipsis), không phải cắt chuỗi — chữ ĐẦY ĐỦ vẫn còn
    // trong DOM để `title` hiện được khi di chuột, và để không cắt nhầm
    // giữa một cụm từ đang gõ tiếng Việt có dấu.
    expect(topicBadge).toHaveAttribute('title', LONG_TOPIC);
    expect(complexityBadge).toHaveAttribute('title', LONG_COMPLEXITY);
  });
});

describe('QuestionCard — sinh lại câu KHÔNG bị gắn cờ trùng bài kinh điển', () => {
  // Yêu cầu 2026-09-25: model có thể ra một câu tốt, không trùng bài kinh
  // điển — nhưng giảng viên vẫn có thể muốn đổi test case hoặc nâng độ khó.
  // Trước đây "Sinh lại riêng câu này" CHỈ hiện khi `isClassic`, nên câu tốt
  // không có lối nào để sinh lại ngoài "Sinh lại cả đề" (mất luôn các câu
  // khác đang giữ).
  it('vẫn có nút "Sinh lại câu này", dù không phải bài kinh điển', () => {
    render(
      <QuestionCard
        index={0}
        question={question({ resemblesKnownProblem: null })}
        onChange={noop}
        onRegenerate={noop}
        regenerating={false}
      />,
    );
    expect(screen.getByRole('button', { name: /^sinh lại câu này$/i })).toBeInTheDocument();
  });

  it('bấm nút thì mở form, khoá nút gửi tới khi có ghi chú — cùng luật với câu bị gắn cờ', () => {
    render(
      <QuestionCard
        index={0}
        question={question({ resemblesKnownProblem: null })}
        onChange={noop}
        onRegenerate={noop}
        regenerating={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^sinh lại câu này$/i }));

    const submit = screen.getByRole('button', { name: /^sinh lại câu 1$/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/cần đổi gì ở câu 1/i), {
      target: { value: 'Nâng độ khó, thêm ca test biên' },
    });
    expect(submit).toBeEnabled();
  });

  it('gửi đúng ghi chú lên, và KHÔNG có dòng "Không được ra lại bài..." — không có gì để tránh', () => {
    render(
      <QuestionCard
        index={0}
        question={question({ resemblesKnownProblem: null })}
        onChange={noop}
        onRegenerate={noop}
        regenerating={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^sinh lại câu này$/i }));

    expect(screen.queryByText(/không được ra lại bài/i)).toBeNull();
    expect(screen.getByText(/đề của các câu đang giữ/i)).toBeInTheDocument();
  });
});
