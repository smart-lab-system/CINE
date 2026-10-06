import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { RosterImportResult } from '@/lib/api/roster';
import { ImportResultAlert } from './import-result-alert';

const result = (overrides: Partial<RosterImportResult> = {}): RosterImportResult => ({
  added: 3,
  updated: 1,
  unchanged: 20,
  removed: 0,
  missing: [],
  renamed: [],
  ...overrides,
});

describe('ImportResultAlert', () => {
  it('đếm thêm / cập nhật / giữ nguyên; chỉ nói "xoá" khi có xoá', () => {
    const { rerender } = render(<ImportResultAlert result={result()} />);
    expect(screen.getByText('Đã nhập xong: thêm 3, cập nhật 1, giữ nguyên 20.')).toBeInTheDocument();

    rerender(<ImportResultAlert result={result({ removed: 2 })} />);
    expect(screen.getByText('Đã nhập xong: thêm 3, cập nhật 1, giữ nguyên 20, xoá 2.')).toBeInTheDocument();
  });

  it('Review Focus 5: liệt kê TỪNG sinh viên bị đổi tên và nói tên áp dụng cho mọi lớp', () => {
    render(
      <ImportResultAlert
        result={result({
          renamed: [
            { mssv: 'SV20120001', from: 'Nguyen Van A', to: 'Nguyễn Văn A' },
            { mssv: 'SV20120002', from: 'Tran Thi B', to: 'Trần Thị B' },
          ],
        })}
      />,
    );

    expect(screen.getByText(/đổi tên 2 sinh viên/i)).toBeInTheDocument();
    expect(screen.getByText(/mọi lớp/i)).toBeInTheDocument();
    expect(screen.getByText('SV20120001: "Nguyen Van A" → "Nguyễn Văn A"')).toBeInTheDocument();
    expect(screen.getByText('SV20120002: "Tran Thi B" → "Trần Thị B"')).toBeInTheDocument();
  });

  it('không ai bị đổi tên thì không có lời báo đổi tên', () => {
    render(<ImportResultAlert result={result()} />);
    expect(screen.queryByText(/đổi tên/i)).not.toBeInTheDocument();
  });

  it('server cũ chưa trả `renamed` (undefined) không làm nổ trang', () => {
    render(<ImportResultAlert result={{ ...result(), renamed: undefined as unknown as [] }} />);
    expect(screen.getByText(/đã nhập xong/i)).toBeInTheDocument();
  });
});
