import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AnswerPane, marksFor } from './AnswerPane';
import type { SubmissionText } from '@/lib/api/grading';

const TEXT: SubmissionText = {
  paragraphs: ['Ưu điểm là mở rộng độc lập.', 'Nhược điểm là phân mảnh dữ liệu.'],
  spans: [
    { criterionId: 'c1', paragraph: 0, start: 11, end: 26 },
    // Giao hoàn toàn vào c1 — hai tiêu chí trích cùng một câu.
    { criterionId: 'c2', paragraph: 0, start: 19, end: 26 },
    { criterionId: 'c3', paragraph: 1, start: 0, end: 12 },
  ],
  unlocatable: ['c4'],
  truncatedByGrading: false,
};

const INDEX = new Map([
  ['c1', 0],
  ['c2', 1],
  ['c3', 2],
]);

function pane(over: Partial<SubmissionText> = {}, props: Record<string, unknown> = {}) {
  return render(
    <AnswerPane
      text={{ ...TEXT, ...over }}
      criterionIndexOf={(id) => INDEX.get(id) ?? 0}
      activeCriterionId={null}
      onSelectCriterion={vi.fn()}
      {...props}
    />,
  );
}

describe('marksFor', () => {
  it('chồng lấn: giữ span bắt đầu trước, bỏ phần giao', () => {
    // Tô lồng nhau cho ra HTML không đọc được. Đây là quyết định TRÌNH BÀY,
    // nên nó ở client — phép đối chiếu đã xong ở server.
    expect(marksFor(TEXT.spans, 0)).toEqual([
      { criterionId: 'c1', paragraph: 0, start: 11, end: 26 },
    ]);
  });

  it('chỉ lấy span của đúng đoạn được hỏi', () => {
    expect(marksFor(TEXT.spans, 1)).toHaveLength(1);
    expect(marksFor(TEXT.spans, 1)[0].criterionId).toBe('c3');
  });

  it('đoạn không có span nào trả mảng rỗng', () => {
    expect(marksFor(TEXT.spans, 9)).toEqual([]);
  });
});

describe('AnswerPane', () => {
  it('tô đúng đoạn theo span, không tự đi tìm chuỗi', () => {
    pane();
    const marks = screen.getAllByTestId('evidence-mark');
    expect(marks[0]).toHaveTextContent('mở rộng độc lập');
    expect(marks[0]).toHaveAttribute('data-criterion', 'c1');
  });

  it('đoạn 0 chỉ còn MỘT vệt tô dù có hai span chồng nhau', () => {
    pane();
    const paragraph = screen.getByTestId('paragraph-0');
    expect(paragraph.querySelectorAll('[data-testid="evidence-mark"]')).toHaveLength(1);
  });

  it('bấm vào vệt tô thì báo tiêu chí ra ngoài', () => {
    const onSelectCriterion = vi.fn();
    pane({}, { onSelectCriterion });

    fireEvent.click(screen.getAllByTestId('evidence-mark')[0]);
    expect(onSelectCriterion).toHaveBeenCalledWith('c1');
  });

  it('đánh dấu vệt của tiêu chí đang chọn', () => {
    pane({}, { activeCriterionId: 'c3' });
    const marks = screen.getAllByTestId('evidence-mark');
    const active = marks.find((m) => m.getAttribute('data-criterion') === 'c3');
    expect(active).toHaveAttribute('data-active', 'true');
  });

  it('cảnh báo khi bài đã bị cắt LÚC CHẤM', () => {
    pane({ truncatedByGrading: true });
    // Phần không hiển thị ở đây cũng là phần AI chưa bao giờ đọc — giảng
    // viên cần biết cả hai vế.
    expect(screen.getByText(/phần cuối bài không được chấm/i)).toBeInTheDocument();
  });

  it('nội dung rỗng nói rõ lý do, không hiện khung trắng', () => {
    pane({ paragraphs: [''], spans: [] });
    expect(screen.getByText(/chưa đọc được nội dung/i)).toBeInTheDocument();
    expect(screen.queryByTestId('paragraph-0')).not.toBeInTheDocument();
  });

  it('bôi đen đủ dài thì đề nghị gán làm minh chứng', () => {
    const onPin = vi.fn();
    pane({}, { onPin });
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'mở rộng độc lập',
    } as unknown as Selection);

    fireEvent.mouseUp(screen.getByTestId('paragraph-0').parentElement!);
    expect(onPin).toHaveBeenCalledWith('mở rộng độc lập');
  });

  it('bôi đen quá ngắn thì bỏ qua', () => {
    const onPin = vi.fn();
    pane({}, { onPin });
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'là',
    } as unknown as Selection);

    fireEvent.mouseUp(screen.getByTestId('paragraph-0').parentElement!);
    // Cùng ngưỡng MIN_EVIDENCE_CHARS của server: dưới 10 ký tự thì một chuỗi
    // khớp bừa vào gần như mọi bài tiếng Việt.
    expect(onPin).not.toHaveBeenCalled();
  });
});
