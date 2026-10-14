import { describe, expect, it } from 'vitest';
import type { GridCell, InspectGrid, PlanResponse, PlanRowView } from './api/grade-export';
import {
  ACTION_LABEL, EMPTY_CHOICE, ROUNDING_OPTIONS, blankReportCsv, blankReportFilename, canWriteNow, causeText, causeTallyText, causesText, columnsReady,
  countFilters, directionText, matchesFilter, roundingText, sampledOverwriteCount, scoreText, toPlanBase, validateUpload, type ColumnChoice,
} from './grade-export-view';

const row = (over: Partial<PlanRowView> = {}): PlanRowView => ({
  row: 3, mssvInFile: '20120001', studentMssv: '20120001', studentName: 'Nguyễn Văn An', action: 'write', systemScore: '7.25', writtenScore: '7.50',
  blankReason: null, blankLabel: null, previousScore: null, direction: null, causes: [], note: null, ...over,
});
const plan = (over: Partial<PlanResponse> = {}): PlanResponse => ({
  digest: 'd'.repeat(64), deliverableId: null, roundingStepHundredths: 50,
  summary: { write: 1, blank: 0, kept: 0, unmatched: 0, duplicates: 0, skipped: 0, ignoredEmpty: 0, notInFile: 0 },
  overwrite: { score: 0, reason: 0 }, changes: null, blockers: [], canWrite: true, rows: [row()], notInFile: [], ...over,
});

describe('scoreText — a decimal STRING becomes a Vietnamese number, without a float', () => {
  it.each([['7.25', '7,25'], ['8.50', '8,5'], ['7.00', '7,0'], ['0.05', '0,05'], ['10', '10,0'], ['7.5', '7,5']])('%s → %s', (input, out) => {
    expect(scoreText(input as string)).toBe(out);
  });
  it('null is a dash, never 0; something that is not a score is shown as it came', () => {
    expect(scoreText(null)).toBe('—');
    expect(scoreText('abc')).toBe('abc');
  });
});

describe('rounding options (spec D9)', () => {
  it('offers exact / 0,1 / 0,25 / 0,5 and preselects none', () => {
    expect(ROUNDING_OPTIONS.map((o) => [o.value, o.label])).toEqual([[1, 'Không làm tròn (giữ 2 chữ số lẻ)'], [10, '0,1'], [25, '0,25'], [50, '0,5']]);
  });
});

describe('roundingText — how a step is said in a list of past exports', () => {
  it('exact is "Không làm tròn", the others "Làm tròn <step>"', () => {
    expect(roundingText(1)).toBe('Không làm tròn');
    expect(roundingText(10)).toBe('Làm tròn 0,1');
    expect(roundingText(25)).toBe('Làm tròn 0,25');
    expect(roundingText(50)).toBe('Làm tròn 0,5');
  });
});

describe('words for what happens to a row — every state has words, not just a colour', () => {
  it('labels every action', () => {
    expect(ACTION_LABEL).toEqual({
      write: 'Sẽ ghi', blank: 'Để trống', kept: 'Giữ nguyên ô', unmatched: 'Không khớp', duplicate: 'MSSV trùng', conflict: 'Nhiều kết quả',
      skipped_formula: 'Ô có công thức', skipped_merged: 'Ô gộp',
    });
  });
  it('names a cause in Vietnamese', () => {
    expect(causeText({ kind: 'rule', ruleKey: 'sai_bien', ruleName: 'Sai biên', delta: 100 })).toBe('luật Sai biên');
    expect(causeText({ kind: 'rule', ruleKey: 'sai_bien', ruleName: null, delta: 100 })).toBe('luật sai_bien');
    expect(causeText({ kind: 'manual_score' })).toBe('chấm tay');
    expect(causeText({ kind: 'review' })).toBe('duyệt lại bài tự luận');
    expect(causeText({ kind: 'rounding' })).toBe('chỉ do đổi bước làm tròn');
    expect(causeText({ kind: 'unknown' })).toBe('chưa rõ nguyên nhân');
    expect(causesText([{ kind: 'manual_score' }, { kind: 'rounding' }])).toBe('chấm tay, chỉ do đổi bước làm tròn');
  });
  it('a tally of causes reads "cause (N bài)"', () => {
    expect(causeTallyText({ kind: 'rule', ruleKey: 'sai_bien', ruleName: 'Sai biên', students: 2 })).toBe('luật Sai biên (2 bài)');
    expect(causeTallyText({ kind: 'rule', ruleKey: 'sai_bien', ruleName: null, students: 1 })).toBe('luật sai_bien (1 bài)');
    expect(causeTallyText({ kind: 'manual_score', ruleKey: null, ruleName: null, students: 1 })).toBe('chấm tay (1 bài)');
    expect(causeTallyText({ kind: 'rounding', ruleKey: null, ruleName: null, students: 3 })).toBe('chỉ do đổi bước làm tròn (3 bài)');
  });
  it('says the direction with an arrow AND words, what was there before, and why (spec §3.6)', () => {
    expect(directionText(row({ direction: 'down', previousScore: '7.50', causes: [{ kind: 'rule', ruleKey: 'a', ruleName: 'Sai biên', delta: 50 }] })))
      .toBe('↓ Giảm — trước đã ghi 7,5, do luật Sai biên');
    expect(directionText(row({ direction: 'up', previousScore: '7.00' }))).toBe('↑ Tăng — trước đã ghi 7,0');
    expect(directionText(row({ direction: 'same' }))).toBe('Không đổi so với lần ghi trước');
    expect(directionText(row({ direction: 'new' }))).toBe('Mới — chưa từng ghi');
    expect(directionText(row({ direction: null }))).toBe('');
  });
});

describe('row filters', () => {
  const rows = [
    row({ row: 3 }),
    row({ row: 4, action: 'write', direction: 'down' }),
    row({ row: 5, action: 'blank', blankReason: 'absent' }),
    row({ row: 6, action: 'kept', blankReason: 'flagged' }),
    row({ row: 7, action: 'unmatched' }),
    row({ row: 8, action: 'duplicate' }),
    row({ row: 9, action: 'skipped_formula' }),
  ];
  it('write / blank / problem / changed / all', () => {
    const pick = (f: Parameters<typeof matchesFilter>[1]) => rows.filter((r) => matchesFilter(r, f)).map((r) => r.row);
    expect(pick('all')).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(pick('write')).toEqual([3, 4]);
    expect(pick('blank')).toEqual([5, 6]);
    expect(pick('problem')).toEqual([7, 8, 9]);
    expect(pick('changed')).toEqual([4]);
  });
  it('counts them for the chips', () => {
    expect(countFilters(rows)).toEqual({ all: 7, write: 2, blank: 2, problem: 3, changed: 1 });
  });
});

describe('the blank report (spec D14) — CSV, grouped by reason, safe against formulas', () => {
  const p = plan({
    rows: [
      row({ row: 9, action: 'blank', studentMssv: 'SV000009', studentName: 'Vũ Thị Hà', blankReason: 'flagged', blankLabel: 'Đang chờ giảng viên duyệt' }),
      row({ row: 5, action: 'blank', studentMssv: 'SV000005', studentName: '=HYPERLINK("http://x")', blankReason: 'absent', blankLabel: 'Vắng — không có bài nộp' }),
      row({ row: 6, action: 'kept', studentMssv: 'SV000006', studentName: 'Trần, Văn B', blankReason: 'flagged', blankLabel: 'Đang chờ giảng viên duyệt' }),
      row({ row: 3 }),
    ],
    notInFile: [
      { mssv: 'SV000001', name: 'Có điểm', blankReason: null, blankLabel: null, score: '8.00' },
      { mssv: 'SV000002', name: 'Không dòng', blankReason: 'absent', blankLabel: 'Vắng — không có bài nộp', score: null },
    ],
  });
  const lines = () => blankReportCsv(p).replace(/^﻿/, '').trimEnd().split('\r\n');

  it('starts with a BOM (Excel reads UTF-8 names right) and a header', () => {
    expect(blankReportCsv(p).startsWith('﻿')).toBe(true);
    expect(lines()[0]).toBe('Dòng,MSSV,Họ tên,Lý do ô trống,Ghi chú');
  });
  it('lists blank and kept rows plus students with no row in the file — not the ones that have a score', () => {
    const body = lines().slice(1).join('\n');
    expect(body).toContain('SV000005');
    expect(body).toContain('SV000006');
    expect(body).toContain('SV000009');
    expect(body).toContain('SV000002,');
    expect(body).not.toContain('SV000001');
    expect(body).not.toContain('20120001');
  });
  it('groups by reason (absent first) and then by MSSV', () => {
    expect(lines().slice(1).map((l) => l.split(',')[1])).toEqual(['SV000002', 'SV000005', 'SV000006', 'SV000009']);
  });
  it('says why each row is there', () => {
    expect(lines().join('\n')).toContain('Giữ nguyên ô điểm đã ghi lần trước');
    expect(lines().join('\n')).toContain('Không có dòng trong file');
  });
  it('neutralises a leading formula character and quotes a comma (CWE-1236)', () => {
    const text = lines().join('\n');
    expect(text).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(text).toContain('"Trần, Văn B"');
  });
  it('the file name is built like the existing CSV export, with its own prefix', () => {
    expect(blankReportFilename('Giữa kỳ N01', 'GK-N01', new Date(2026, 8, 29))).toBe('o-trong-giua-ky-n01-2026-09-29.csv');
  });
});

describe('validateUpload — the same rules the server enforces, reported early', () => {
  it('accepts a small .xlsx', () => {
    expect(validateUpload({ name: 'So-diem.XLSX', size: 1000 })).toBeNull();
  });
  it('refuses .csv / .xls with the sentence that says what to do', () => {
    const message = 'Chỉ nhận file .xlsx. Nếu sổ điểm của bạn là .csv hoặc .xls, hãy mở bằng Excel rồi lưu lại thành .xlsx.';
    expect(validateUpload({ name: 'a.csv', size: 10 })).toBe(message);
    expect(validateUpload({ name: 'a.xls', size: 10 })).toBe(message);
  });
  it('refuses over 5 MB and empty', () => {
    expect(validateUpload({ name: 'a.xlsx', size: 5 * 1024 * 1024 + 1 })).toBe('File quá lớn (giới hạn 5 MB).');
    expect(validateUpload({ name: 'a.xlsx', size: 0 })).toBe('File rỗng.');
  });
});

describe('column choice — nothing is preselected (spec D5, rule 9)', () => {
  const ready: ColumnChoice = { sheetName: 'S', firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'D', reasonColumn: '', deliverableId: '' };
  it('the empty choice has no column and no row', () => {
    expect(EMPTY_CHOICE).toEqual({ sheetName: '', firstDataRow: null, mssvColumn: '', scoreColumn: '', reasonColumn: '', deliverableId: '' });
  });
  it('says what is still missing, in words', () => {
    expect(columnsReady(EMPTY_CHOICE, false)).toEqual({ ok: false, hints: ['trang tính', 'cột MSSV', 'cột điểm', 'dòng bắt đầu dữ liệu'] });
    expect(columnsReady({ ...ready, deliverableId: '' }, true).hints).toEqual(['yêu cầu nộp']);
  });
  it('is ready when the essentials are chosen; the reason column and the deliverable are optional', () => {
    expect(columnsReady(ready, false)).toEqual({ ok: true, hints: [] });
  });
  it('refuses the same column twice', () => {
    expect(columnsReady({ ...ready, scoreColumn: 'B' }, false)).toEqual({ ok: false, hints: ['ba cột phải khác nhau'] });
    expect(columnsReady({ ...ready, reasonColumn: 'D' }, false).ok).toBe(false);
  });
  it('builds the request base without the empty optionals', () => {
    expect(toPlanBase('t1', ready)).toEqual({ templateId: 't1', sheetName: 'S', firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'D' });
    expect(toPlanBase('t1', { ...ready, reasonColumn: 'E', deliverableId: 'd1' })).toEqual({
      templateId: 't1', sheetName: 'S', firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'D', reasonColumn: 'E', deliverableId: 'd1',
    });
  });
});

describe('sampledOverwriteCount — only what the grid on screen shows', () => {
  const cell = (kind: GridCell['kind'], text = ''): GridCell => ({ kind, text, formula: false });
  const grid: InspectGrid = {
    name: 'S', rowCount: 5, columnCount: 3, protected: false, fromRow: 1, hasMore: false, columns: ['A', 'B', 'C'],
    rows: [
      { row: 1, cells: [cell('text', 'tựa đề'), cell('empty'), cell('empty')] },
      { row: 2, cells: [cell('text', 'STT'), cell('text', 'MSSV'), cell('text', 'Điểm')] },
      { row: 3, cells: [cell('number', '1'), cell('text', '20120001'), cell('number', '7')] },
      { row: 4, cells: [cell('number', '2'), cell('text', '20120002'), cell('empty')] },
    ],
  };
  it('counts valued cells of the column from the first data row down', () => {
    expect(sampledOverwriteCount(grid, 'C', 3)).toBe(1);
    expect(sampledOverwriteCount(grid, 'C', 2)).toBe(2); // the header cell is a value too when the start row is set above it
    expect(sampledOverwriteCount(grid, 'B', 3)).toBe(2);
  });
  it('is zero for an unknown column or an empty one', () => {
    expect(sampledOverwriteCount(grid, 'Z', 3)).toBe(0);
    expect(sampledOverwriteCount(grid, '', 3)).toBe(0);
  });
});

describe('canWriteNow — every reason the button is off is written down', () => {
  it('needs a rounding choice and a plan', () => {
    expect(canWriteNow({ plan: null, roundingStep: null, overwriteAck: false, decreaseAck: false })).toEqual({ enabled: false, reasons: ['Chọn cách làm tròn.'] });
    expect(canWriteNow({ plan: null, roundingStep: 10, overwriteAck: false, decreaseAck: false })).toEqual({ enabled: false, reasons: ['Đang xem trước…'] });
  });
  it('a blocker switches it off and is quoted verbatim', () => {
    const out = canWriteNow({ plan: plan({ blockers: ['Trang tính đang được bảo vệ.'], canWrite: false }), roundingStep: 10, overwriteAck: true, decreaseAck: true });
    expect(out).toEqual({ enabled: false, reasons: ['Trang tính đang được bảo vệ.'] });
  });
  it('an overwrite and a decrease each need their own tick', () => {
    const p = plan({ overwrite: { score: 2, reason: 1 }, changes: { previousExports: 1, up: 0, down: 2, same: 0, new: 0, downByCause: [], upByCause: [] } });
    expect(canWriteNow({ plan: p, roundingStep: 10, overwriteAck: false, decreaseAck: false }).reasons).toEqual([
      'Cần đồng ý ghi đè 3 ô đã có giá trị.',
      'Cần xác nhận 2 bài bị giảm điểm.',
    ]);
    expect(canWriteNow({ plan: p, roundingStep: 10, overwriteAck: true, decreaseAck: false }).enabled).toBe(false);
    expect(canWriteNow({ plan: p, roundingStep: 10, overwriteAck: true, decreaseAck: true })).toEqual({ enabled: true, reasons: [] });
  });
  it('a clean plan can be written', () => {
    expect(canWriteNow({ plan: plan(), roundingStep: 50, overwriteAck: false, decreaseAck: false })).toEqual({ enabled: true, reasons: [] });
  });
});
