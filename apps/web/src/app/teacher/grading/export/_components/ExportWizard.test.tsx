import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ExportWizard } from './ExportWizard';
import type { InspectResponse } from '@/lib/api/grade-export';

const reinspect = vi.fn();
let reinspectState: { isPending: boolean; error: Error | null };
vi.mock('@/hooks/useGradeExport', () => ({ useInspectTemplate: () => ({ mutate: reinspect, ...reinspectState }) }));

const oneSheet: InspectResponse = {
  templateId: 't1', fileSizeBytes: 1, sheets: [{ name: 'Bảng điểm', hidden: false }], deliverables: [],
  sheet: { name: 'Bảng điểm', rowCount: 3, columnCount: 3, protected: false, fromRow: 1, hasMore: false, columns: ['A', 'B', 'C'], rows: [] },
};
const manySheets: InspectResponse = { ...oneSheet, sheets: [{ name: 'Bảng điểm', hidden: false }, { name: 'Sheet2', hidden: false }], sheet: null };
let uploaded: InspectResponse;

// Bốn bước con được thay bằng cái vỏ chỉ để lái luồng; từng bước có test riêng ở Task 13–14.
vi.mock('./StepUpload', () => ({
  StepUpload: (p: { onInspected: (r: { templateId: string; fileName: string; inspect: InspectResponse }) => void }) => (
    <button onClick={() => p.onInspected({ templateId: 't1', fileName: 'Sổ điểm N01.xlsx', inspect: uploaded })}>stub-upload</button>
  ),
}));
vi.mock('./StepColumns', () => ({
  StepColumns: (p: {
    choice: unknown;
    busy: boolean;
    onChange: (patch: object) => void;
    onSelectSheet: (name: string) => void;
    onLoadRows: (row: number) => void;
    onNext: () => void;
  }) => (
    <div>
      <span data-testid="choice">{JSON.stringify(p.choice)}</span>
      <span data-testid="busy">{String(p.busy)}</span>
      <button onClick={() => p.onChange({ mssvColumn: 'B', scoreColumn: 'C', firstDataRow: 3 })}>stub-choose</button>
      <button onClick={() => p.onSelectSheet('Sheet2')}>stub-sheet</button>
      <button onClick={() => p.onLoadRows(41)}>stub-page</button>
      <button onClick={p.onNext}>stub-next</button>
    </div>
  ),
}));
vi.mock('./StepPreview', () => ({
  StepPreview: (p: { request: unknown; templateFileName: string; sessionName: string; onBack: () => void }) => (
    <div>
      <span data-testid="request">{JSON.stringify(p.request)}</span>
      <span data-testid="file">{p.templateFileName}</span>
      <span data-testid="session">{p.sessionName}</span>
      <button onClick={p.onBack}>stub-back</button>
    </div>
  ),
}));
vi.mock('./PreviousExports', () => ({ PreviousExports: () => <div data-testid="previous" /> }));

const setup = () => render(<ExportWizard sessionId="s1" sessionName="Giữa kỳ N01" sessionCode="GK-N01" />);
const current = () => screen.getByRole('listitem', { current: 'step' });

beforeEach(() => {
  reinspect.mockReset();
  reinspectState = { isPending: false, error: null };
  uploaded = oneSheet;
});

describe('ExportWizard', () => {
  it('starts on step 1, names all three steps, and always shows the earlier exports', () => {
    setup();
    const steps = screen.getByRole('list', { name: 'Các bước' });
    expect(steps).toHaveTextContent('Tải file');
    expect(steps).toHaveTextContent('Chọn cột');
    expect(steps).toHaveTextContent('Xem trước và ghi');
    expect(current()).toHaveTextContent('Tải file');
    expect(screen.getByRole('button', { name: 'stub-upload' })).toBeInTheDocument();
    expect(screen.getByTestId('previous')).toBeInTheDocument();
  });

  it('after the upload it moves to step 2; a single-sheet file has its sheet chosen, nothing else is', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));
    expect(current()).toHaveTextContent('Chọn cột');
    expect(JSON.parse(screen.getByTestId('choice').textContent!)).toEqual({
      sheetName: 'Bảng điểm', firstDataRow: null, mssvColumn: '', scoreColumn: '', reasonColumn: '', deliverableId: '',
    });
  });

  it('a file with several sheets starts with NO sheet chosen', () => {
    uploaded = manySheets;
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));
    expect(JSON.parse(screen.getByTestId('choice').textContent!).sheetName).toBe('');
  });

  it('a choice is merged into the state and carried to step 3 as the request base — with the file name', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));
    fireEvent.click(screen.getByRole('button', { name: 'stub-choose' }));
    fireEvent.click(screen.getByRole('button', { name: 'stub-next' }));
    expect(current()).toHaveTextContent('Xem trước và ghi');
    expect(JSON.parse(screen.getByTestId('request').textContent!)).toEqual({
      templateId: 't1', sheetName: 'Bảng điểm', firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'C',
    });
    expect(screen.getByTestId('file')).toHaveTextContent('Sổ điểm N01.xlsx');
    expect(screen.getByTestId('session')).toHaveTextContent('Giữa kỳ N01');
  });

  it('going back from step 3 keeps what was chosen', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));
    fireEvent.click(screen.getByRole('button', { name: 'stub-choose' }));
    fireEvent.click(screen.getByRole('button', { name: 'stub-next' }));
    fireEvent.click(screen.getByRole('button', { name: 'stub-back' }));
    expect(current()).toHaveTextContent('Chọn cột');
    expect(JSON.parse(screen.getByTestId('choice').textContent!)).toMatchObject({ mssvColumn: 'B', scoreColumn: 'C', firstDataRow: 3 });
  });

  it('changing the sheet RESETS the columns (letters mean something else there) and reads that sheet', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));
    fireEvent.click(screen.getByRole('button', { name: 'stub-choose' }));
    fireEvent.click(screen.getByRole('button', { name: 'stub-sheet' }));
    expect(reinspect).toHaveBeenCalledWith({ templateId: 't1', sheetName: 'Sheet2' }, expect.objectContaining({ onSuccess: expect.any(Function) }));
    expect(JSON.parse(screen.getByTestId('choice').textContent!)).toEqual({
      sheetName: 'Sheet2', firstDataRow: null, mssvColumn: '', scoreColumn: '', reasonColumn: '', deliverableId: '',
    });
  });

  it('paging asks the server for rows from that line of the same sheet', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));
    fireEvent.click(screen.getByRole('button', { name: 'stub-page' }));
    expect(reinspect).toHaveBeenCalledWith({ templateId: 't1', sheetName: 'Bảng điểm', fromRow: 41 }, expect.any(Object));
  });

  it('locks step 2 while another page is loading, and shows a failure verbatim', () => {
    reinspectState = { isPending: true, error: new Error('Không thấy trang tính "Sheet9" trong file.') };
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));
    expect(screen.getByTestId('busy')).toHaveTextContent('true');
    expect(screen.getByRole('alert')).toHaveTextContent('Không thấy trang tính "Sheet9" trong file.');
  });

  it('"Chọn file khác" goes back to step 1 and forgets the file', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chọn file khác' }));
    expect(current()).toHaveTextContent('Tải file');
    expect(screen.getByRole('button', { name: 'stub-upload' })).toBeInTheDocument();
  });
});
