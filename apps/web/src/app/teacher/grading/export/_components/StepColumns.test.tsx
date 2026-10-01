import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StepColumns } from './StepColumns';
import type { GridCell, InspectGrid, InspectResponse } from '@/lib/api/grade-export';
import { EMPTY_CHOICE, type ColumnChoice } from '@/lib/grade-export-view';

const cell = (kind: GridCell['kind'], text = '', formula = false): GridCell => ({ kind, text, formula });
const grid = (over: Partial<InspectGrid> = {}): InspectGrid => ({
  name: 'Bảng điểm', rowCount: 5, columnCount: 5, protected: false, fromRow: 1, hasMore: false, columns: ['A', 'B', 'C', 'D', 'E'],
  rows: [
    { row: 1, cells: [cell('text', 'BẢNG ĐIỂM LỚP N01'), cell('empty'), cell('empty'), cell('empty'), cell('empty')] },
    { row: 2, cells: [cell('text', 'STT'), cell('text', 'MSSV'), cell('text', 'Họ tên'), cell('text', 'Điểm'), cell('text', 'Ghi chú')] },
    { row: 3, cells: [cell('number', '1'), cell('text', '20120001'), cell('text', 'Nguyễn Văn An'), cell('number', '7'), cell('empty')] },
    { row: 4, cells: [cell('number', '2'), cell('text', '20120002'), cell('text', 'Trần Thị Bình'), cell('empty'), cell('empty')] },
    { row: 5, cells: [cell('number', '3'), cell('text', '20120003'), cell('text', 'Lê Văn Cường'), cell('number', '3', true), cell('empty')] },
  ],
  ...over,
});
const inspect = (over: Partial<InspectResponse> = {}): InspectResponse => ({
  templateId: 't1', fileSizeBytes: 1, sheets: [{ name: 'Bảng điểm', hidden: false }], deliverables: [], sheet: grid(), ...over,
});
const READY: ColumnChoice = { sheetName: 'Bảng điểm', firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'D', reasonColumn: 'E', deliverableId: '' };

const setup = (props: { inspect?: InspectResponse; choice?: ColumnChoice; busy?: boolean } = {}) => {
  const handlers = { onChange: vi.fn(), onSelectSheet: vi.fn(), onLoadRows: vi.fn(), onNext: vi.fn() };
  render(<StepColumns inspect={props.inspect ?? inspect()} choice={props.choice ?? EMPTY_CHOICE} busy={props.busy ?? false} {...handlers} />);
  return handlers;
};
const next = () => screen.getByRole('button', { name: 'Xem trước điểm sẽ ghi' });

describe('StepColumns — nothing is chosen for the teacher (rule 9)', () => {
  it('every picker starts on its placeholder and the start row is empty, even though row 2 says "MSSV" and "Điểm"', () => {
    setup({ choice: { ...EMPTY_CHOICE, sheetName: 'Bảng điểm' } });
    expect(screen.getByLabelText('Cột MSSV')).toHaveValue('');
    expect(screen.getByLabelText('Cột điểm')).toHaveValue('');
    expect(screen.getByLabelText('Cột lý do ô trống (tuỳ chọn)')).toHaveValue('');
    expect(screen.getByLabelText('Dữ liệu bắt đầu từ dòng số')).toHaveValue(null);
    expect(next()).toBeDisabled();
  });

  it('says what is still missing next to the disabled button', () => {
    setup({ choice: { ...EMPTY_CHOICE, sheetName: 'Bảng điểm' } });
    expect(screen.getByText('Còn thiếu: cột MSSV, cột điểm, dòng bắt đầu dữ liệu.')).toBeInTheDocument();
  });

  it('reports each choice through onChange and nothing else', () => {
    const h = setup({ choice: { ...EMPTY_CHOICE, sheetName: 'Bảng điểm' } });
    fireEvent.change(screen.getByLabelText('Cột MSSV'), { target: { value: 'B' } });
    fireEvent.change(screen.getByLabelText('Cột điểm'), { target: { value: 'D' } });
    fireEvent.change(screen.getByLabelText('Cột lý do ô trống (tuỳ chọn)'), { target: { value: 'E' } });
    fireEvent.change(screen.getByLabelText('Dữ liệu bắt đầu từ dòng số'), { target: { value: '3' } });
    expect(h.onChange.mock.calls).toEqual([[{ mssvColumn: 'B' }], [{ scoreColumn: 'D' }], [{ reasonColumn: 'E' }], [{ firstDataRow: 3 }]]);
  });

  it('a row button sets the start row too', () => {
    const h = setup({ choice: { ...EMPTY_CHOICE, sheetName: 'Bảng điểm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dữ liệu bắt đầu từ dòng 3' }));
    expect(h.onChange).toHaveBeenCalledWith({ firstDataRow: 3 });
  });
});

describe('StepColumns — a chosen column is marked by colour AND by a word (spec §3.6)', () => {
  it('tags the header of each chosen column and marks every cell of it', () => {
    setup({ choice: READY });
    const table = screen.getByRole('table', { name: 'Xem trước file' });
    expect(within(table).getByRole('columnheader', { name: 'B MSSV' })).toHaveAttribute('data-role', 'mssv');
    expect(within(table).getByRole('columnheader', { name: 'D Điểm' })).toHaveAttribute('data-role', 'score');
    expect(within(table).getByRole('columnheader', { name: 'E Lý do' })).toHaveAttribute('data-role', 'reason');
    expect(within(table).getByRole('columnheader', { name: 'A' })).not.toHaveAttribute('data-role');
    expect(within(table).getByText('20120001').closest('td')).toHaveAttribute('data-role', 'mssv');
    expect(within(table).getByText('Nguyễn Văn An').closest('td')).not.toHaveAttribute('data-role');
  });

  it('rows above the start row are dimmed, and the start row is marked', () => {
    setup({ choice: READY });
    const table = screen.getByRole('table', { name: 'Xem trước file' });
    expect(within(table).getByText('BẢNG ĐIỂM LỚP N01').closest('tr')).toHaveAttribute('data-before-data', 'true');
    expect(within(table).getByText('20120001').closest('tr')).toHaveAttribute('data-first-data', 'true');
  });

  it('marks a formula cell so the teacher can see why it will be skipped', () => {
    setup({ choice: READY });
    expect(screen.getByLabelText('ô có công thức')).toBeInTheDocument();
  });
});

describe('StepColumns — overwriting is warned about before the last step', () => {
  it('counts the valued cells of the score column in the rows on screen — and says it is only those rows', () => {
    setup({ choice: READY });
    expect(screen.getByText(/Trong phần xem trước, 2 ô của cột D đã có giá trị/)).toBeInTheDocument();
    expect(screen.getByText(/Số ô thật hiện ở bước sau/)).toBeInTheDocument();
  });
  it('says nothing when the chosen column is empty in the rows on screen', () => {
    setup({ choice: { ...READY, scoreColumn: 'E', reasonColumn: '' } });
    expect(screen.queryByText(/đã có giá trị/)).not.toBeInTheDocument();
  });
});

describe('StepColumns — protected sheet, next step, paging, sheets, deliverables', () => {
  it('a protected sheet is refused with the server sentence and next stays off', () => {
    setup({ choice: READY, inspect: inspect({ sheet: grid({ protected: true }) }) });
    // `Alert` luôn có role="alert" — cảnh báo ghi đè cũng đang hiện — nên tìm theo chữ, không theo role.
    expect(screen.getByText('Trang tính đang được bảo vệ. Hãy bỏ bảo vệ trong Excel rồi tải lại.')).toBeInTheDocument();
    expect(next()).toBeDisabled();
  });

  it('is ready when the essentials are chosen, and Next hands over', () => {
    const h = setup({ choice: READY });
    expect(next()).toBeEnabled();
    fireEvent.click(next());
    expect(h.onNext).toHaveBeenCalledTimes(1);
  });

  it('the same column twice is refused in words', () => {
    setup({ choice: { ...READY, scoreColumn: 'B' } });
    expect(next()).toBeDisabled();
    expect(screen.getByText('Còn thiếu: ba cột phải khác nhau.')).toBeInTheDocument();
  });

  it('pages the grid: earlier and later rows', () => {
    const h = setup({ choice: READY, inspect: inspect({ sheet: grid({ fromRow: 41, hasMore: true, rowCount: 200 }) }) });
    fireEvent.click(screen.getByRole('button', { name: 'Xem các dòng trước' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xem các dòng tiếp' }));
    expect(h.onLoadRows.mock.calls).toEqual([[1], [46]]); // 41 − 40 → 1 ; 41 + the 5 rows on screen → 46
  });

  it('offers no paging when there is nowhere to go', () => {
    setup({ choice: READY });
    expect(screen.queryByRole('button', { name: 'Xem các dòng trước' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xem các dòng tiếp' })).not.toBeInTheDocument();
  });

  it('with several sheets the teacher chooses one and no grid is shown until then', () => {
    const h = setup({
      choice: EMPTY_CHOICE,
      inspect: inspect({ sheets: [{ name: 'Bảng điểm', hidden: false }, { name: 'Ghi chú', hidden: true }], sheet: null }),
    });
    expect(screen.getByText('Chọn trang tính để xem nội dung của nó.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Xem trước file' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ghi chú (ẩn)' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Trang tính'), { target: { value: 'Ghi chú' } });
    expect(h.onSelectSheet).toHaveBeenCalledWith('Ghi chú');
  });

  it('asks which deliverable only when the session has more than one — and requires it', () => {
    const one = setup({ choice: READY });
    expect(screen.queryByLabelText('Ghi điểm của yêu cầu nộp')).not.toBeInTheDocument();
    expect(one.onChange).not.toHaveBeenCalled();
  });

  it('with two deliverables the choice is required and each option is a file name', () => {
    const h = setup({
      choice: READY,
      inspect: inspect({ deliverables: [{ id: 'd1', requiredFilename: 'Cau1.docx' }, { id: 'd2', requiredFilename: 'Cau2.docx' }] }),
    });
    expect(screen.getByLabelText('Ghi điểm của yêu cầu nộp')).toHaveValue('');
    expect(next()).toBeDisabled();
    expect(screen.getByText('Còn thiếu: yêu cầu nộp.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Ghi điểm của yêu cầu nộp'), { target: { value: 'd2' } });
    expect(h.onChange).toHaveBeenCalledWith({ deliverableId: 'd2' });
  });

  it('is locked while the wizard is loading another page', () => {
    setup({ choice: READY, busy: true });
    expect(next()).toBeDisabled();
  });
});
