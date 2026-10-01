import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StepPreview } from './StepPreview';
import type { PlanResponse, PlanRowView, WriteResponse } from '@/lib/api/grade-export';

const previewMutate = vi.fn();
const writeMutate = vi.fn();
const writeReset = vi.fn();
let previewState: { data?: PlanResponse; isPending: boolean; error: Error | null };
let writeState: { data?: WriteResponse; isPending: boolean; error: Error | null };
vi.mock('@/hooks/useGradeExport', () => ({
  usePreviewExport: () => ({ mutate: previewMutate, ...previewState }),
  useWriteExport: () => ({ mutate: writeMutate, reset: writeReset, ...writeState }),
}));

const row = (over: Partial<PlanRowView> = {}): PlanRowView => ({
  row: 3, mssvInFile: '20120001', studentMssv: '20120001', studentName: 'Nguyễn Văn An', action: 'write', systemScore: '7.25', writtenScore: '7.50',
  blankReason: null, blankLabel: null, previousScore: null, direction: null, causes: [], note: null, ...over,
});
const plan = (over: Partial<PlanResponse> = {}): PlanResponse => ({
  digest: 'd'.repeat(64), deliverableId: null, roundingStepHundredths: 50,
  summary: { write: 1, blank: 1, kept: 0, unmatched: 1, duplicates: 0, skipped: 0, ignoredEmpty: 0, notInFile: 0 },
  overwrite: { score: 0, reason: 0 }, changes: null, blockers: [], canWrite: true,
  rows: [
    row(),
    row({ row: 4, studentMssv: '20120002', studentName: 'Trần Thị Bình', action: 'blank', systemScore: null, writtenScore: null, blankReason: 'absent', blankLabel: 'Vắng — không có bài nộp' }),
    row({ row: 5, mssvInFile: '99999999', studentMssv: null, studentName: null, action: 'unmatched', systemScore: null, writtenScore: null, note: 'Không có trong danh sách sinh viên của phiên.' }),
  ],
  notInFile: [], ...over,
});
const REQUEST = { templateId: 't1', sheetName: 'Bảng điểm', firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'D', reasonColumn: 'E' };

const setup = () => render(<StepPreview sessionId="s1" sessionName="Giữa kỳ N01" sessionCode="GK-N01" templateFileName="Sổ điểm N01.xlsx" request={REQUEST} onBack={vi.fn()} />);
const rounding = (label: string) => screen.getByRole('radio', { name: label });
const writeButton = () => screen.getByRole('button', { name: 'Ghi vào file' });

beforeEach(() => {
  previewMutate.mockReset();
  writeMutate.mockReset();
  writeReset.mockReset();
  previewState = { isPending: false, error: null };
  writeState = { isPending: false, error: null };
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:x'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
});

describe('StepPreview — rounding first (spec D9, §13.1 rule 7)', () => {
  it('offers four choices, preselects none, and asks for no preview until one is chosen', () => {
    setup();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).checked)).toEqual([false, false, false, false]);
    expect(radios.map((r) => r.getAttribute('aria-label') ?? r.closest('label')?.textContent)).toEqual([
      expect.stringContaining('Không làm tròn'), expect.stringContaining('0,1'), expect.stringContaining('0,25'), expect.stringContaining('0,5'),
    ]);
    expect(previewMutate).not.toHaveBeenCalled();
    expect(writeButton()).toBeDisabled();
    expect(screen.getByText('Chọn cách làm tròn.')).toBeInTheDocument();
  });

  it('says the rule and that it is recorded', () => {
    setup();
    expect(screen.getByText(/nửa lên/i)).toBeInTheDocument();
    expect(screen.getByText(/được ghi vào bản ghi lượt xuất/)).toBeInTheDocument();
  });

  it('choosing a step asks for the preview with exactly that step', () => {
    setup();
    fireEvent.click(rounding('0,5'));
    expect(previewMutate).toHaveBeenCalledWith({ ...REQUEST, roundingStepHundredths: 50 });
    fireEvent.click(rounding('0,1'));
    expect(previewMutate).toHaveBeenLastCalledWith({ ...REQUEST, roundingStepHundredths: 10 });
    expect(writeReset).toHaveBeenCalled();
  });
});

describe('StepPreview — the three numbers and the table (spec §3.6)', () => {
  it('shows will-write · left-blank · unmatched', () => {
    previewState = { data: plan(), isPending: false, error: null };
    setup();
    const numbers = screen.getByRole('list', { name: 'Ba con số' });
    expect(within(numbers).getByText('Sẽ ghi').closest('li')).toHaveTextContent('1');
    expect(within(numbers).getByText('Để trống').closest('li')).toHaveTextContent('1');
    expect(within(numbers).getByText('Không khớp').closest('li')).toHaveTextContent('1');
  });

  it('counts "kept" cells with the blank ones and mentions the rest only when they exist', () => {
    previewState = { data: plan({ summary: { write: 2, blank: 1, kept: 2, unmatched: 0, duplicates: 0, skipped: 1, ignoredEmpty: 3, notInFile: 4 } }), isPending: false, error: null };
    setup();
    expect(within(screen.getByRole('list', { name: 'Ba con số' })).getByText('Để trống').closest('li')).toHaveTextContent('3');
    expect(screen.getByText(/2 ô giữ nguyên/)).toBeInTheDocument();
    expect(screen.getByText(/1 dòng bị bỏ qua/)).toBeInTheDocument();
    expect(screen.getByText(/4 sinh viên chưa có dòng trong file/)).toBeInTheDocument();
  });

  it('each row: file row, MSSV, name, the system score, the value to write — with a decimal comma — and a note', () => {
    previewState = { data: plan(), isPending: false, error: null };
    setup();
    const table = screen.getByRole('table', { name: 'Từng dòng của file' });
    const first = within(table).getByText('20120001').closest('tr')!;
    expect(within(first).getByText('7,25')).toBeInTheDocument();
    expect(within(first).getByText('7,5')).toBeInTheDocument();
    const blank = within(table).getByText('20120002').closest('tr')!;
    expect(within(blank).getByText('Để trống')).toBeInTheDocument();
    expect(within(blank).getByText('Vắng — không có bài nộp')).toBeInTheDocument();
    const unmatched = within(table).getByText('99999999').closest('tr')!;
    expect(within(unmatched).getByText('Không khớp')).toBeInTheDocument();
    expect(within(unmatched).getByText('Không có trong danh sách sinh viên của phiên.')).toBeInTheDocument();
  });

  it('the chips filter the rows', () => {
    previewState = { data: plan(), isPending: false, error: null };
    setup();
    fireEvent.click(screen.getByRole('button', { name: /^Để trống · 1$/ }));
    const table = screen.getByRole('table', { name: 'Từng dòng của file' });
    expect(within(table).queryByText('20120001')).not.toBeInTheDocument();
    expect(within(table).getByText('20120002')).toBeInTheDocument();
  });

  it('a student who is in the session but not in the file is listed, with a score or a reason', () => {
    previewState = {
      data: plan({ notInFile: [{ mssv: 'SV000001', name: 'Có điểm', blankReason: null, blankLabel: null, score: '8.00' }, { mssv: 'SV000002', name: 'Vắng', blankReason: 'absent', blankLabel: 'Vắng — không có bài nộp', score: null }] }),
      isPending: false, error: null,
    };
    setup();
    const details = screen.getByRole('group', { name: /Sinh viên có trong phiên nhưng chưa có dòng trong file/ });
    expect(within(details).getByText('SV000001').closest('li')).toHaveTextContent('8,0');
    expect(within(details).getByText('SV000002').closest('li')).toHaveTextContent('Vắng — không có bài nộp');
  });

  it('shows what is happening while the preview loads, and a failure verbatim', () => {
    previewState = { isPending: true, error: null };
    setup();
    expect(screen.getByText('Đang tính bản xem trước…')).toBeInTheDocument();
  });
  it('shows a preview failure verbatim', () => {
    previewState = { isPending: false, error: new Error('Phiên chưa chốt điểm — chốt điểm trước rồi mới ghi vào sổ điểm.') };
    setup();
    expect(screen.getByRole('alert')).toHaveTextContent('Phiên chưa chốt điểm — chốt điểm trước rồi mới ghi vào sổ điểm.');
  });
});

describe('StepPreview — writing (spec D13, D16, D20)', () => {
  const chooseAnd = (data: PlanResponse) => {
    previewState = { data, isPending: false, error: null };
    setup();
    fireEvent.click(rounding('0,5'));
  };

  it('a clean plan writes once, sending the digest it saw and the file name the teacher chose', () => {
    chooseAnd(plan());
    expect(writeButton()).toBeEnabled();
    fireEvent.click(writeButton());
    expect(writeMutate).toHaveBeenCalledTimes(1);
    expect(writeMutate).toHaveBeenCalledWith({
      ...REQUEST, roundingStepHundredths: 50, expectedDigest: 'd'.repeat(64), templateFileName: 'Sổ điểm N01.xlsx',
    });
  });

  it('overwriting needs its own tick, and the tick says how many cells', () => {
    chooseAnd(plan({ overwrite: { score: 2, reason: 1 } }));
    expect(writeButton()).toBeDisabled();
    expect(screen.getByText('Cần đồng ý ghi đè 3 ô đã có giá trị.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi đồng ý ghi đè 3 ô đã có giá trị' }));
    expect(writeButton()).toBeEnabled();
    fireEvent.click(writeButton());
    expect(writeMutate).toHaveBeenCalledWith(expect.objectContaining({ overwriteExisting: true }));
    expect(writeMutate.mock.calls[0]![0]).not.toHaveProperty('confirmDecreases');
  });

  it('a decrease needs ITS OWN tick — the overwrite tick does not stand in for it', () => {
    chooseAnd(plan({
      overwrite: { score: 1, reason: 0 },
      changes: { previousExports: 1, up: 0, down: 2, same: 0, new: 0, downByCause: [], upByCause: [] },
    }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi đồng ý ghi đè 1 ô đã có giá trị' }));
    expect(writeButton()).toBeDisabled();
    expect(screen.getByText('Cần xác nhận 2 bài bị giảm điểm.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi đã xem 2 bài bị giảm điểm và đồng ý ghi' }));
    fireEvent.click(writeButton());
    expect(writeMutate).toHaveBeenCalledWith(expect.objectContaining({ overwriteExisting: true, confirmDecreases: true }));
  });

  it('the ticks are not offered when there is nothing to confirm', () => {
    chooseAnd(plan());
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('a blocker switches writing off, whatever is ticked, and is quoted', () => {
    chooseAnd(plan({ blockers: ['Trang tính đang được bảo vệ. Hãy bỏ bảo vệ trong Excel rồi tải lại.'], canWrite: false }));
    expect(writeButton()).toBeDisabled();
    expect(screen.getAllByText('Trang tính đang được bảo vệ. Hãy bỏ bảo vệ trong Excel rồi tải lại.').length).toBeGreaterThan(0);
  });

  it('changing the rounding clears the ticks — they were given for another plan', () => {
    chooseAnd(plan({ overwrite: { score: 2, reason: 0 } }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi đồng ý ghi đè 2 ô đã có giá trị' }));
    fireEvent.click(rounding('0,1'));
    expect(screen.getByRole('checkbox', { name: 'Tôi đồng ý ghi đè 2 ô đã có giá trị' })).not.toBeChecked();
  });

  it('a server refusal is quoted verbatim and offers a fresh preview', () => {
    previewState = { data: plan(), isPending: false, error: null };
    writeState = { isPending: false, error: new Error('Kết quả chấm đã đổi kể từ lúc xem trước — hãy xem trước lại.') };
    setup();
    fireEvent.click(rounding('0,5'));
    expect(screen.getByRole('alert')).toHaveTextContent('Kết quả chấm đã đổi kể từ lúc xem trước — hãy xem trước lại.');
    previewMutate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước lại' }));
    expect(previewMutate).toHaveBeenCalledWith({ ...REQUEST, roundingStepHundredths: 50 });
  });

  it('after a write it offers the file, says what was written, and does not offer to write twice', () => {
    previewState = { data: plan(), isPending: false, error: null };
    writeState = {
      isPending: false, error: null,
      data: { exportId: 'e1', fileName: 'Sổ điểm N01-da-ghi-diem.xlsx', downloadUrl: 'https://storage.local/out', summary: { written: 1, blank: 1, kept: 0, unmatched: 1, skipped: 0, overwritten: 0, decreased: 0 }, blank: [] },
    };
    setup();
    fireEvent.click(rounding('0,5'));
    expect(screen.getByRole('status')).toHaveTextContent('Đã ghi 1 điểm vào file');
    const link = screen.getByRole('link', { name: /Tải file đã ghi/ });
    expect(link).toHaveAttribute('href', 'https://storage.local/out');
    expect(link).toHaveTextContent('Sổ điểm N01-da-ghi-diem.xlsx');
    expect(screen.queryByRole('button', { name: 'Ghi vào file' })).not.toBeInTheDocument();
  });
});

describe('StepPreview — re-export (spec §3.6 "Xuất lại")', () => {
  const changes = {
    previousExports: 1, up: 1, down: 2, same: 5, new: 0,
    downByCause: [{ kind: 'rule' as const, ruleKey: 'sai_bien', ruleName: 'Sai biên', students: 2 }],
    upByCause: [{ kind: 'manual_score' as const, ruleKey: null, ruleName: null, students: 1 }],
  };

  it('a band says how many went down and up — each with an arrow AND words — and what caused each', () => {
    previewState = { data: plan({ changes }), isPending: false, error: null };
    setup();
    fireEvent.click(rounding('0,5'));
    const band = screen.getByRole('region', { name: 'So với lần ghi trước' });
    expect(band).toHaveTextContent('↓ 2 bài giảm');
    expect(band).toHaveTextContent('↑ 1 bài tăng');
    expect(band).toHaveTextContent('5 bài không đổi');
    expect(band).toHaveTextContent('Giảm do: luật Sai biên (2 bài)');
    expect(band).toHaveTextContent('Tăng do: chấm tay (1 bài)');
  });

  it('a changed row says the direction in words, what was there, and why', () => {
    previewState = {
      data: plan({ changes, rows: [row({ direction: 'down', previousScore: '8.50', writtenScore: '7.50', causes: [{ kind: 'rule', ruleKey: 'sai_bien', ruleName: 'Sai biên', delta: 100 }] })] }),
      isPending: false, error: null,
    };
    setup();
    fireEvent.click(rounding('0,5'));
    expect(screen.getByText('↓ Giảm — trước đã ghi 8,5, do luật Sai biên')).toBeInTheDocument();
  });

  it('a first export shows no such band', () => {
    previewState = { data: plan(), isPending: false, error: null };
    setup();
    expect(screen.queryByRole('region', { name: 'So với lần ghi trước' })).not.toBeInTheDocument();
  });
});

describe('StepPreview — the blank report is a file, not a request', () => {
  it('downloads a CSV built from what is on screen', () => {
    previewState = { data: plan(), isPending: false, error: null };
    setup();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Tải bảng kê ô trống (CSV)' }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(writeMutate).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it('is not offered when nothing is blank', () => {
    previewState = { data: plan({ rows: [row()] }), isPending: false, error: null };
    setup();
    expect(screen.queryByRole('button', { name: 'Tải bảng kê ô trống (CSV)' })).not.toBeInTheDocument();
  });
});
