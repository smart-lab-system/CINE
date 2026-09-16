import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BulkActionBar } from './BulkActionBar';
import { noAdvocate, stillGrading, withAdvocate } from './fixtures';
import type { BulkReviewOutcome } from '@/lib/api/grading';

const rows = [withAdvocate, noAdvocate, stillGrading];

function bar(over: {
  selectedIds?: string[];
  outcome?: BulkReviewOutcome;
  pending?: boolean;
  onApply?: () => void;
} = {}) {
  return render(
    <BulkActionBar
      selectedIds={over.selectedIds ?? ['r1']}
      results={rows}
      outcome={over.outcome}
      pending={over.pending ?? false}
      onApply={over.onApply ?? vi.fn()}
    />,
  );
}

describe('BulkActionBar', () => {
  it('không hiện gì khi chưa chọn dòng nào', () => {
    const { container } = bar({ selectedIds: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it('hai nút, và nút phản biện nói rõ nó lấy mức cao hơn trên TỪNG tiêu chí', () => {
    bar();
    expect(screen.getByRole('button', { name: /Giữ điểm lượt chấm/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Áp kiến nghị phản biện — lấy mức cao hơn trên từng tiêu chí/,
      }),
    ).toBeInTheDocument();
    // "Lấy mức cao hơn" của bản mẫu KHÔNG phải nút thứ ba: nó chính là luật
    // của nút thứ hai.
    expect(screen.queryByRole('button', { name: /^Lấy mức cao hơn$/ })).not.toBeInTheDocument();
  });

  it('danh sách bỏ qua nêu TÊN, không nêu số đếm', () => {
    bar({
      outcome: {
        applied: 1,
        audited: 0,
        skipped: [{ resultId: 'r4', reason: 'not_reviewable' }],
      },
    });
    // `skipped: 1` bắt giảng viên tự đi tìm bài nào trong bốn mươi lăm bài.
    expect(screen.getByText(/Võ Hoàng Nam/)).toBeInTheDocument();
    expect(screen.getByText(/đang được chấm lại/i)).toBeInTheDocument();
  });

  it('lý do "unchanged" nói rõ không có gì thay đổi', () => {
    bar({
      outcome: { applied: 0, audited: 0, skipped: [{ resultId: 'r1', reason: 'unchanged' }] },
    });
    expect(screen.getByText(/không có gì thay đổi/i)).toBeInTheDocument();
  });

  it('nói ra số bài đã ghi nhật ký khi có bài đã công bố', () => {
    bar({ outcome: { applied: 2, audited: 2, skipped: [] } });
    expect(screen.getByText(/2 bài đã công bố — mỗi bài một dòng nhật ký/i)).toBeInTheDocument();
  });

  it('nút khoá trong lúc request bay', () => {
    bar({ pending: true });
    expect(screen.getByRole('button', { name: /Giữ điểm lượt chấm/ })).toBeDisabled();
  });

  it('không dùng thuật ngữ nội bộ', () => {
    const { container } = bar();
    expect(container.textContent).not.toMatch(/Advocate|Grader|keep_ai|apply_advocate/i);
  });
});
