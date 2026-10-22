import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ImportReview } from './import-review';
import type { RosterDiff } from '@/lib/roster-file';

const diff: RosterDiff = {
  added: [{ mssv: '20210001', name: 'An' }],
  renamed: [],
  unchanged: 0,
  missing: [
    { mssv: '20210002', name: 'Bình' },
    { mssv: '20210003', name: 'Chi' },
  ],
};

describe('ImportReview', () => {
  it('danh sách thiếu trong file cuộn giống danh sách sẽ thêm', () => {
    render(
      <ImportReview
        errors={[]}
        diff={diff}
        removeMissing={false}
        onRemoveMissingChange={vi.fn()}
      />,
    );

    const added = screen.getByText('Sẽ thêm vào lớp').nextElementSibling as HTMLElement;
    const missing = screen.getByText('20210002').closest('ul') as HTMLElement;

    expect(added.className).toContain('max-h-56');
    expect(added.className).toContain('overflow-y-auto');
    expect(missing.className).toContain('max-h-56');
    expect(missing.className).toContain('overflow-y-auto');
    expect(
      screen.getByRole('checkbox', { name: /Xoá 2 sinh viên này khỏi lớp/i }),
    ).toBeInTheDocument();
  });

  it('phiên thi có ô tích thay danh sách thi cũ bằng file', () => {
    render(
      <ImportReview
        errors={[]}
        diff={diff}
        removeMissing={false}
        onRemoveMissingChange={vi.fn()}
        scope="exam"
      />,
    );

    expect(
      screen.getByText(/đang trong danh sách thi nhưng không có trong file/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: /Sử dụng danh sách mới để xoá danh sách thi cũ và lấy từ danh sách mới/i,
      }),
    ).not.toBeChecked();
  });
});
