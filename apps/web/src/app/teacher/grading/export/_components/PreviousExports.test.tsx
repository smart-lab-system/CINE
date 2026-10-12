import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PreviousExports } from './PreviousExports';
import type { ExportListItem } from '@/lib/api/grade-export';

const download = vi.fn();
let listState: { data?: ExportListItem[]; isLoading: boolean; error: Error | null };
let downloadState: { isPending: boolean; error: Error | null };
vi.mock('@/hooks/useGradeExport', () => ({
  useGradeExports: () => listState,
  useExportDownload: () => ({ mutate: download, ...downloadState }),
}));

const item = (over: Partial<ExportListItem> = {}): ExportListItem => ({
  id: 'e1', exportedAt: '2026-09-29T09:30:00.000Z', sheetName: 'Bảng điểm', firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'D', reasonColumn: 'E',
  deliverableName: null, roundingStepHundredths: 50, written: 38, blank: 2, unmatched: 1, overwritten: 0, decreased: 0, decreaseConfirmedBy: null,
  exportedByName: 'Nguyễn Văn Giảng', templateFileName: 'Sổ điểm N01.xlsx', outputFileName: 'Sổ điểm N01-da-ghi-diem.xlsx', ...over,
});

beforeEach(() => {
  download.mockReset();
  listState = { data: [], isLoading: false, error: null };
  downloadState = { isPending: false, error: null };
});

describe('PreviousExports', () => {
  it('says so when nothing was exported yet', () => {
    render(<PreviousExports sessionId="s1" />);
    expect(screen.getByText('Chưa có lượt xuất nào cho phiên này.')).toBeInTheDocument();
  });

  it('describes each export: who, which sheet and columns, the rounding, and the counts', () => {
    listState = { data: [item()], isLoading: false, error: null };
    render(<PreviousExports sessionId="s1" />);
    const li = screen.getByRole('list', { name: 'Các lượt xuất trước' }).querySelector('li')!;
    expect(li).toHaveTextContent('Sổ điểm N01.xlsx');
    expect(li).toHaveTextContent('Nguyễn Văn Giảng');
    expect(li).toHaveTextContent('Trang tính Bảng điểm');
    expect(li).toHaveTextContent('MSSV cột B · điểm cột D · lý do cột E');
    expect(li).toHaveTextContent('Làm tròn 0,5');
    expect(li).toHaveTextContent('38 điểm đã ghi');
    expect(li).toHaveTextContent('2 ô để trống');
    expect(li).toHaveTextContent('1 không khớp');
  });

  it('names the person who confirmed a decrease, and the deliverable when there is one', () => {
    listState = { data: [item({ decreased: 2, decreaseConfirmedBy: 'Nguyễn Văn Giảng', deliverableName: 'Cau2.docx', roundingStepHundredths: 1 })], isLoading: false, error: null };
    render(<PreviousExports sessionId="s1" />);
    const li = screen.getByRole('list', { name: 'Các lượt xuất trước' }).querySelector('li')!;
    expect(li).toHaveTextContent('↓ 2 bài giảm điểm — Nguyễn Văn Giảng đã xác nhận');
    expect(li).toHaveTextContent('Yêu cầu nộp Cau2.docx');
    expect(li).toHaveTextContent('Không làm tròn');
    expect(li).not.toHaveTextContent('Làm tròn Không');
  });

  it('a download asks for the signed URL of THAT export and opens it', () => {
    listState = { data: [item({ id: 'e1' }), item({ id: 'e2' })], isLoading: false, error: null };
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<PreviousExports sessionId="s1" />);
    fireEvent.click(within(screen.getAllByRole('listitem')[1]!).getByRole('button', { name: 'Tải file' }));
    expect(download).toHaveBeenCalledWith('e2', expect.objectContaining({ onSuccess: expect.any(Function) }));
    const onSuccess = download.mock.calls[0]![1].onSuccess as (d: { downloadUrl: string }) => void;
    onSuccess({ downloadUrl: 'https://storage.local/out' });
    expect(open).toHaveBeenCalledWith('https://storage.local/out', '_blank', 'noopener');
    open.mockRestore();
  });

  it('shows a list failure and a download failure verbatim', () => {
    listState = { data: undefined, isLoading: false, error: new Error('Không tải được danh sách.') };
    render(<PreviousExports sessionId="s1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được danh sách.');
  });
  it('shows a download failure verbatim', () => {
    listState = { data: [item()], isLoading: false, error: null };
    downloadState = { isPending: false, error: new Error('Không tìm thấy lượt xuất này.') };
    render(<PreviousExports sessionId="s1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy lượt xuất này.');
  });
});
