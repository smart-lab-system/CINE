import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { RosterDiff } from '@/lib/roster-file';
import { ImportReview } from './import-review';

const diff = (over: Partial<RosterDiff> = {}): RosterDiff => ({
  added: [{ mssv: '20120001', name: 'Nguyễn An' }],
  renamed: [],
  unchanged: 3,
  missing: [],
  ...over,
});
const base = { removeMissing: false, onRemoveMissingChange: vi.fn() };
const NOTICE = /Kiểm tra kỹ lớp và danh sách sinh viên/;

describe('ImportReview — lời nhắc kiểm tra trước khi xác nhận (Review Focus 8)', () => {
  it('có gì sắp được ghi (thêm) → nhắc kiểm tra lớp và danh sách, nêu hậu quả nhập nhầm', () => {
    render(<ImportReview {...base} errors={[]} diff={diff()} />);
    const notice = screen.getByText(NOTICE).closest('[role="alert"]') as HTMLElement;
    expect(notice).toHaveTextContent(/đúng lớp/);
    expect(notice).toHaveTextContent(/sai lớp/);
    expect(notice).toHaveTextContent(/mọi lớp/); // tên trong file thay tên đã lưu ở mọi lớp (spec §2.6)
  });

  it('chỉ đổi tên hoặc chỉ có sinh viên không có trong file cũng là "có gì sắp được ghi"', () => {
    const { unmount } = render(
      <ImportReview {...base} errors={[]} diff={diff({ added: [], renamed: [{ mssv: '20120001', from: 'An', to: 'Nguyễn An' }] })} />,
    );
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    unmount();
    render(<ImportReview {...base} errors={[]} diff={diff({ added: [], missing: [{ mssv: '20120002', name: 'Bình' }] })} />);
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it('file khớp hoàn toàn với danh sách → KHÔNG nhắc (không có gì để xác nhận)', () => {
    render(<ImportReview {...base} errors={[]} diff={diff({ added: [] })} />);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('file có dòng lỗi → KHÔNG nhắc (không có dòng nào được nhập)', () => {
    render(<ImportReview {...base} errors={[{ row: 5, reason: 'MSSV sai khuôn' }]} diff={null} />);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('chưa có bản xem trước → không có gì', () => {
    const { container } = render(<ImportReview {...base} errors={[]} diff={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
