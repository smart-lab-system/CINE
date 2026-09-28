import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ChallengeNotes } from './ChallengeNotes';

describe('ChallengeNotes', () => {
  it('không có ghi chú nào → không render gì', () => {
    const { container } = render(<ChallengeNotes notes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('có ghi chú nghi ngờ → hiện tên lăng kính và nội dung, đánh dấu rõ là NGHI NGỜ', () => {
    render(<ChallengeNotes notes={[{ lens: 'gian_lan', suspected: true, note: 'đổi input vẫn ra cùng kết quả' }]} />);
    expect(screen.getByText(/gian_lan/i)).toBeInTheDocument();
    expect(screen.getByText(/đổi input vẫn ra cùng kết quả/)).toBeInTheDocument();
  });

  it('ghi chú không nghi ngờ (suspected:false) → KHÔNG hiện (chỉ hiện cái đáng chú ý)', () => {
    render(<ChallengeNotes notes={[{ lens: 'bo_sot', suspected: false, note: 'đã chạy đủ' }]} />);
    expect(screen.queryByText(/bo_sot/i)).not.toBeInTheDocument();
  });
});
