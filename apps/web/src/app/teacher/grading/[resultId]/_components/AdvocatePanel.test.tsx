import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AdvocatePanel } from './AdvocatePanel';
import type { AdvocateOpinion } from '@/lib/api/grading';

function opinion(over: Partial<AdvocateOpinion> = {}): AdvocateOpinion {
  return {
    isCorrect: 'yes',
    reasoning: 'Em ấy mô tả đúng cơ chế bù trừ, chỉ thiếu tên gọi của mẫu thiết kế.',
    evidence: ['ghi một bản ghi trạng thái trung gian'],
    suggestedVerdicts: [{ criterionId: 'c1', suggestedVerdict: 'met', why: 'Đúng nguyên lý.' }],
    unverifiedEvidence: [],
    ...over,
  };
}

function panel(props: Record<string, unknown> = {}) {
  return render(
    <AdvocatePanel
      opinion={opinion()}
      criterionId="c1"
      maxPoints={4}
      hasQuestion
      onApply={vi.fn()}
      {...props}
    />,
  );
}

describe('AdvocatePanel', () => {
  it('phân biệt "chưa đối chiếu" với "đã đối chiếu và sạch"', () => {
    const { rerender } = panel();
    expect(screen.getByText(/tất cả đều có trong bài làm/i)).toBeInTheDocument();

    rerender(
      <AdvocatePanel
        opinion={opinion({ unverifiedEvidence: null })}
        criterionId="c1"
        maxPoints={4}
        hasQuestion
        onApply={vi.fn()}
      />,
    );
    // null = CHƯA đối chiếu. Gộp nó với [] là sai ở chỗ nguy hiểm nhất: lượt
    // phản biện đang lập luận để NÂNG điểm.
    expect(screen.getByText(/chưa đối chiếu/i)).toBeInTheDocument();
    expect(screen.queryByText(/tất cả đều có trong bài làm/i)).not.toBeInTheDocument();
  });

  it('KHÔNG loại bỏ kiến nghị khi có trích dẫn trượt — chỉ nêu ra', () => {
    panel({ opinion: opinion({ unverifiedEvidence: ['câu không có trong bài'] }) });

    expect(screen.getByText(/1 trích dẫn không tìm thấy/i)).toBeInTheDocument();
    // Loại bỏ là thay giảng viên quyết.
    expect(screen.getByRole('button', { name: /theo phản biện/i })).toBeEnabled();
  });

  it('luôn nói rõ nó KHÔNG đưa ra điểm', () => {
    panel();
    expect(screen.getByText(/không đưa ra điểm/i)).toBeInTheDocument();
    expect(screen.getByText(/ba lớp độc lập/i)).toBeInTheDocument();
  });

  it('opinion null + chưa có đề bài: nói VÌ SAO, không hiện khối rỗng', () => {
    panel({ opinion: null, hasQuestion: false });

    expect(screen.getByText(/chưa nạp đề bài nên lượt phản biện không chạy/i)).toBeInTheDocument();
    expect(screen.getByText(/không có ai lên tiếng/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('opinion null nhưng CÓ đề bài: lý do khác hẳn', () => {
    panel({ opinion: null, hasQuestion: true });
    expect(screen.getByText(/chỉ chạy khi lượt chấm kết luận chưa đạt/i)).toBeInTheDocument();
  });

  it('nút áp kiến nghị do GIẢNG VIÊN bấm, phát ra điểm quy từ mức đánh giá', () => {
    const onApply = vi.fn();
    panel({ onApply });

    fireEvent.click(screen.getByRole('button', { name: /theo phản biện/i }));
    expect(onApply).toHaveBeenCalledWith({ verdict: 'met', points: 4 });
  });

  it('quy điểm đúng nửa thang cho "đạt một phần"', () => {
    const onApply = vi.fn();
    panel({
      onApply,
      opinion: opinion({
        suggestedVerdicts: [{ criterionId: 'c1', suggestedVerdict: 'partially_met', why: '' }],
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: /theo phản biện/i }));
    expect(onApply).toHaveBeenCalledWith({ verdict: 'partially_met', points: 2 });
  });

  it('không có kiến nghị cho tiêu chí này thì không có nút', () => {
    panel({ criterionId: 'c-khac' });
    expect(screen.queryByRole('button', { name: /theo phản biện/i })).not.toBeInTheDocument();
    // Lập luận vẫn hiện — nó nói về cả bài, không chỉ về một tiêu chí.
    expect(screen.getByText(/mô tả đúng cơ chế bù trừ/)).toBeInTheDocument();
  });
});
