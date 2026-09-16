import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CriterionCard } from './CriterionCard';
import type { GradingResult } from '@/lib/api/grading';

type Criterion = GradingResult['criterionResults'][number];

function criterion(over: Partial<Criterion> = {}): Criterion {
  return {
    criterionId: 'c1',
    verdict: 'partially_met',
    points: 2,
    evidence: 'ghi một bản ghi trạng thái trung gian',
    check: 'ok',
    ...over,
  };
}

function card(props: Record<string, unknown> = {}) {
  return render(
    <CriterionCard
      criterion={criterion()}
      index={0}
      description="Xử lý nhất quán dữ liệu"
      maxPoints={4}
      confidence={0.42}
      draft={{ criterionId: 'c1', verdict: 'partially_met', points: 2 }}
      active={false}
      onActivate={vi.fn()}
      onChange={vi.fn()}
      {...props}
    />,
  );
}

describe('CriterionCard', () => {
  it('phân biệt BỐN trạng thái đối chiếu, và null KHÔNG giống ok', () => {
    const { rerender } = card();
    expect(screen.getByText(/khớp từng chữ/i)).toBeInTheDocument();

    const rerenderWith = (check: Criterion['check']) =>
      rerender(
        <CriterionCard
          criterion={criterion({ check })}
          index={0}
          description="Xử lý nhất quán dữ liệu"
          maxPoints={4}
          confidence={0.42}
          draft={{ criterionId: 'c1', verdict: 'partially_met', points: 2 }}
          active={false}
          onActivate={vi.fn()}
          onChange={vi.fn()}
        />,
      );

    rerenderWith(null);
    // null = chấm trước khi hệ thống ghi lại phép đối chiếu. Gộp vào 'ok'
    // làm mọi bài cũ trông như đã được kiểm.
    expect(screen.getByText(/chưa đối chiếu/i)).toBeInTheDocument();
    expect(screen.queryByText(/khớp từng chữ/i)).not.toBeInTheDocument();

    rerenderWith('unverified');
    // Chuỗi này xuất hiện ở CẢ badge lẫn câu giải thích bên dưới — cả hai
    // đều đúng chỗ, nên test khẳng định có hai, không khẳng định có một.
    expect(screen.getAllByText(/không có trong bài làm/i).length).toBeGreaterThanOrEqual(1);

    rerenderWith('empty');
    expect(screen.getByText(/không đưa trích dẫn nào/i)).toBeInTheDocument();
  });

  it('gọi độ tin cậy là PHÉP ĐO, không phải AI tự chấm', () => {
    card();
    // `confidence` do guard tính bằng đối chiếu; provider chỉ được đặt trần.
    // Vẽ nó như model tự chấm là nói sai bản chất kiến trúc.
    expect(screen.getByRole('meter', { name: /độ tin cậy/i })).toBeInTheDocument();
    expect(screen.getByText(/đối chiếu trích dẫn với bài làm/i)).toBeInTheDocument();
    expect(screen.getByText(/không phải AI tự chấm/i)).toBeInTheDocument();
  });

  it('trích dẫn không định vị được thì nói thẳng AI đã diễn giải lại', () => {
    card({ criterion: criterion({ check: 'unverified' }) });
    expect(screen.getByText(/diễn giải lại thay vì trích nguyên văn/i)).toBeInTheDocument();
  });

  it('nút điểm nhanh theo đúng thang của tiêu chí', () => {
    const onChange = vi.fn();
    card({ maxPoints: 4, onChange });

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(onChange).toHaveBeenCalledWith({ points: 2, verdict: 'partially_met' });
  });

  it('điểm tối đa kéo theo mức đánh giá "đạt"', () => {
    const onChange = vi.fn();
    card({ maxPoints: 4, onChange });

    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(onChange).toHaveBeenCalledWith({ points: 4, verdict: 'met' });
  });

  it('thang lẻ không sinh nút trùng', () => {
    // maxPoints = 0 thì cả ba bậc đều là 0 — một hàng ba nút giống hệt nhau
    // trông như lỗi hiển thị.
    card({ maxPoints: 0, draft: { criterionId: 'c1', verdict: 'not_met', points: 0 } });
    expect(screen.getAllByRole('button', { name: '0' })).toHaveLength(1);
  });

  it('bấm tiêu đề thì báo ra ngoài để cuộn tới dẫn chứng', () => {
    const onActivate = vi.fn();
    card({ onActivate });

    fireEvent.click(screen.getByText('Xử lý nhất quán dữ liệu'));
    expect(onActivate).toHaveBeenCalled();
  });

  it('không dùng thuật ngữ nội bộ', () => {
    const { container } = card();
    expect(container.textContent).not.toMatch(/Advocate|Grader|guard|G2|confidence|verdict/i);
  });
});
