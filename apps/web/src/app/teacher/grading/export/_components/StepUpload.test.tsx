import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StepUpload } from './StepUpload';
import type { InspectResponse } from '@/lib/api/grade-export';

const uploadAsync = vi.fn();
const inspectAsync = vi.fn();
let uploadState: { isPending: boolean; error: Error | null };
let inspectState: { isPending: boolean; error: Error | null };
vi.mock('@/hooks/useGradeExport', () => ({
  useUploadTemplate: () => ({ mutateAsync: uploadAsync, ...uploadState }),
  useInspectTemplate: () => ({ mutateAsync: inspectAsync, ...inspectState }),
}));

const inspected: InspectResponse = { templateId: 't1', fileSizeBytes: 10, sheets: [{ name: 'S', hidden: false }], deliverables: [], sheet: null };
const file = (name: string, size = 1000) => new File([new Uint8Array(size)], name);
const input = () => screen.getByLabelText(/File sổ điểm/);
const pick = (f: File) => fireEvent.change(input(), { target: { files: [f] } });

beforeEach(() => {
  uploadAsync.mockReset().mockResolvedValue('t1');
  inspectAsync.mockReset().mockResolvedValue(inspected);
  uploadState = { isPending: false, error: null };
  inspectState = { isPending: false, error: null };
});

describe('StepUpload', () => {
  it('says what to bring and that only the chosen cells will be touched', () => {
    render(<StepUpload sessionId="s1" onInspected={vi.fn()} />);
    expect(screen.getByText(/mọi ô khác giữ nguyên/)).toBeInTheDocument();
    expect(input()).toHaveAttribute('accept', expect.stringContaining('.xlsx'));
  });

  it('uploads, then inspects, then hands the result over — in that order', async () => {
    const onInspected = vi.fn();
    render(<StepUpload sessionId="s1" onInspected={onInspected} />);
    const f = file('So-diem N01.xlsx');
    pick(f);
    await waitFor(() => expect(onInspected).toHaveBeenCalledTimes(1));
    expect(uploadAsync).toHaveBeenCalledWith(f);
    expect(inspectAsync).toHaveBeenCalledWith({ templateId: 't1' });
    expect(uploadAsync.mock.invocationCallOrder[0]).toBeLessThan(inspectAsync.mock.invocationCallOrder[0]!);
    expect(onInspected).toHaveBeenCalledWith({ templateId: 't1', fileName: 'So-diem N01.xlsx', inspect: inspected });
  });

  it('a .csv is refused before any request, with the sentence that says how to convert it', () => {
    render(<StepUpload sessionId="s1" onInspected={vi.fn()} />);
    pick(file('so-diem.csv'));
    expect(screen.getByRole('alert')).toHaveTextContent('Chỉ nhận file .xlsx. Nếu sổ điểm của bạn là .csv hoặc .xls, hãy mở bằng Excel rồi lưu lại thành .xlsx.');
    expect(uploadAsync).not.toHaveBeenCalled();
  });

  it('a file over 5 MB is refused before any request', () => {
    render(<StepUpload sessionId="s1" onInspected={vi.fn()} />);
    pick(file('a.xlsx', 5 * 1024 * 1024 + 1));
    expect(screen.getByRole('alert')).toHaveTextContent('File quá lớn (giới hạn 5 MB).');
    expect(uploadAsync).not.toHaveBeenCalled();
  });

  it('does not move on when the upload fails, and shows the server sentence verbatim', async () => {
    uploadAsync.mockRejectedValue(new Error('Không tải được file lên kho lưu trữ (HTTP 403).'));
    uploadState = { isPending: false, error: new Error('Không tải được file lên kho lưu trữ (HTTP 403).') };
    const onInspected = vi.fn();
    render(<StepUpload sessionId="s1" onInspected={onInspected} />);
    pick(file('a.xlsx'));
    await waitFor(() => expect(uploadAsync).toHaveBeenCalled());
    expect(onInspected).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được file lên kho lưu trữ (HTTP 403).');
  });

  it('shows the inspect failure verbatim too (a password-protected file, for instance)', async () => {
    inspectAsync.mockRejectedValue(new Error('File có mật khẩu hoặc là định dạng .xls cũ. Hãy bỏ mật khẩu, mở bằng Excel và lưu lại thành .xlsx.'));
    inspectState = { isPending: false, error: new Error('File có mật khẩu hoặc là định dạng .xls cũ. Hãy bỏ mật khẩu, mở bằng Excel và lưu lại thành .xlsx.') };
    render(<StepUpload sessionId="s1" onInspected={vi.fn()} />);
    pick(file('a.xlsx'));
    await waitFor(() => expect(inspectAsync).toHaveBeenCalled());
    expect(screen.getByRole('alert')).toHaveTextContent('File có mật khẩu');
  });

  it('locks the input while the file is on its way', () => {
    uploadState = { isPending: true, error: null };
    render(<StepUpload sessionId="s1" onInspected={vi.fn()} />);
    expect(input()).toBeDisabled();
    expect(screen.getByText('Đang tải file lên…')).toBeInTheDocument();
  });

  it('choosing nothing (cancelling the dialog) does nothing', () => {
    render(<StepUpload sessionId="s1" onInspected={vi.fn()} />);
    fireEvent.change(input(), { target: { files: [] } });
    expect(uploadAsync).not.toHaveBeenCalled();
  });
});
