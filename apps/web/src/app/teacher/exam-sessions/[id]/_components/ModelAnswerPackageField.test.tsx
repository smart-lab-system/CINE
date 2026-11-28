import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mutateAsync = vi.fn();
const requestAnswerKeyUpload = vi.fn();

vi.mock('@/hooks/useGrading', () => ({
  useSetGradingReference: () => ({ mutateAsync }),
}));

vi.mock('@/lib/api/grading', () => ({
  requestAnswerKeyUpload: (...args: unknown[]) => requestAnswerKeyUpload(...args),
}));

vi.mock('@/lib/model-answer-package', () => ({
  normalizeModelAnswerPackage: async (files: File[]) => files[0],
}));

import { ModelAnswerPackageField } from './ModelAnswerPackageField';

describe('ModelAnswerPackageField', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    requestAnswerKeyUpload.mockReset();
    requestAnswerKeyUpload.mockResolvedValue({
      storageKey: 'k1',
      uploadUrl: 'https://example.test/put',
    });
    mutateAsync.mockResolvedValue({});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true }),
    );
  });

  it('chỉ một nút Tải lên (không còn 3 ô File/Zip/Thư mục)', () => {
    render(<ModelAnswerPackageField sessionId="s1" />);
    expect(screen.getByRole('button', { name: /Tải lên/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^File$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/File nén/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Thư mục$/i)).not.toBeInTheDocument();
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(1);
  });

  it('chọn file → upload và lưu tham chiếu', async () => {
    render(<ModelAnswerPackageField sessionId="s1" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'dap-an.rar');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(requestAnswerKeyUpload).toHaveBeenCalledWith('s1');
    });
    expect(mutateAsync).toHaveBeenCalledWith({
      modelAnswerStorageKey: 'k1',
      modelAnswerFilename: 'dap-an.rar',
    });
    expect(await screen.findByText(/Đã lưu đáp án mẫu/i)).toBeInTheDocument();
  });
});
