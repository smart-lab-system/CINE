import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'e1', versionId: 'v1' }),
  usePathname: () => '/admin/ide-utilities/e1/versions/v1/browse',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/jplag/jplag-comparison-viewer', () => ({ JplagComparisonViewer: () => null }));

const api = vi.hoisted(() => ({
  getCatalog: vi.fn(),
  getVersionBrowse: vi.fn(),
  requestVersionExtract: vi.fn(),
}));
vi.mock('@/lib/api/ide-utilities', () => ({
  getCatalog: api.getCatalog,
  getVersionBrowse: api.getVersionBrowse,
  getVersionBrowseFile: vi.fn(),
  getVersionNormalizedSources: vi.fn(),
  postVersionJplagDemo: vi.fn(),
  requestVersionExtract: api.requestVersionExtract,
}));

import IdeExtensionVersionBrowsePage from './page';

const detail = { id: 'e1', displayName: 'GitHub Copilot', identifier: 'github.copilot', versions: [{ id: 'v1', version: '1.250.0' }] };

beforeEach(() => {
  api.getCatalog.mockReset().mockResolvedValue(detail);
  api.getVersionBrowse.mockReset();
  api.requestVersionExtract.mockReset();
});

describe('trang xem nội dung VSIX (L-19)', () => {
  it('đang tải: hiện "Đang tải…", chưa có lỗi', () => {
    api.getVersionBrowse.mockReturnValue(new Promise(() => undefined));
    render(<IdeExtensionVersionBrowsePage />);
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử tải lại' })).not.toBeInTheDocument();
  });

  it('tải lỗi: hiện thông báo lỗi và nút thử lại, KHÔNG còn chữ "Đang tải…"', async () => {
    api.getVersionBrowse.mockRejectedValue(new Error('Phiên bản chưa có file .vsix trên kho lưu trữ.'));
    render(<IdeExtensionVersionBrowsePage />);
    await waitFor(() => expect(screen.getByText('Phiên bản chưa có file .vsix trên kho lưu trữ.')).toBeInTheDocument());
    expect(screen.queryByText('Đang tải…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử tải lại' })).toBeInTheDocument();
  });

  it('thử tải lại thành công: xoá lỗi và hiện nội dung', async () => {
    api.getVersionBrowse
      .mockRejectedValueOnce(new Error('Máy chủ tạm thời lỗi.'))
      .mockResolvedValue({ status: 'none', artifact: { storageKey: null }, tree: null, error: null });
    render(<IdeExtensionVersionBrowsePage />);
    await waitFor(() => expect(screen.getByText('Máy chủ tạm thời lỗi.')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Thử tải lại' }));
    await waitFor(() => expect(screen.queryByText('Máy chủ tạm thời lỗi.')).not.toBeInTheDocument());
    expect(screen.getByText('Chưa giải nén nội dung.')).toBeInTheDocument();
    expect(api.getVersionBrowse).toHaveBeenCalledTimes(2);
  });
});
