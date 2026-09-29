import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ChallengeNotes } from './ChallengeNotes';

describe('ChallengeNotes', () => {
  it('không có ghi chú nào → không render gì', () => {
    const { container } = render(<ChallengeNotes notes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('có ghi chú nghi ngờ → hiện tên góc kiểm (tên đọc được) và nội dung, đánh dấu rõ là NGHI NGỜ', () => {
    render(<ChallengeNotes notes={[{ lens: 'gian_lan', suspected: true, note: 'đổi input vẫn ra cùng kết quả' }]} />);
    expect(screen.getByText('Gian lận')).toBeInTheDocument();
    expect(screen.getByText(/đổi input vẫn ra cùng kết quả/)).toBeInTheDocument();
    expect(screen.getByText(/góc kiểm phản biện nghi ngờ/i)).toBeInTheDocument();
  });

  it('ghi chú không nghi ngờ → KHÔNG nổi thành cảnh báo, nhưng vẫn đọc được trong mục thu gọn (§3.5: "không phát hiện gì" vẫn phải hiện)', () => {
    render(<ChallengeNotes notes={[{ lens: 'bo_sot', suspected: false, note: 'đã chạy đủ' }]} />);
    expect(screen.queryByText(/góc kiểm phản biện nghi ngờ/i)).not.toBeInTheDocument();
    expect(screen.getByText(/không thấy vấn đề \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/đã chạy đủ/)).toBeInTheDocument();
  });

  it('không bao giờ nói "lăng kính" với giảng viên (spec §2.2, sửa vi phạm #4)', () => {
    const { container } = render(
      <ChallengeNotes
        notes={[
          { lens: 'gian_lan', suspected: true, note: 'a' },
          { lens: 'bo_sot', suspected: false, note: 'b' },
        ]}
      />,
    );
    expect(container.textContent).not.toMatch(/lăng kính/i);
  });
});
