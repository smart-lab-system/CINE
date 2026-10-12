import { BLANK_LABELS } from './blank-reason';
import type { BlankReason } from './grade-export.types';
import { buildPlan, type FileCell, type FileRowInput, type PlanInput, type PlanStudent, type StudentOutcome } from './plan';

const scored = (hundredths: number, computationId: string | null = 'c1'): StudentOutcome => ({ kind: 'scored', hundredths, computationId, source: 'finalized' });
const blank = (reason: BlankReason): StudentOutcome => ({ kind: 'blank', reason });
const student = (mssv: string, outcome: StudentOutcome, name = `SV ${mssv}`): PlanStudent => ({ mssv, name, outcome });
const cell = (text: string, kind: FileCell['kind'] = 'text', over: Partial<FileCell> = {}): FileCell => ({
  text, kind: text === '' ? 'empty' : kind, hasFormula: false, mergedNonMaster: false, ...over,
});
const row = (n: number, mssv: string, over: { mssvKind?: FileCell['kind']; score?: FileCell; reason?: FileCell | null } = {}): FileRowInput => ({
  row: n, mssv: cell(mssv, over.mssvKind ?? 'text'), score: over.score ?? cell(''), reason: over.reason === undefined ? null : over.reason,
});
const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  firstDataRow: 3, rows: [], students: [], previous: new Map(), roundingStep: 1, hasReasonColumn: false, sheetProtected: false, ...over,
});
const only = (plan: ReturnType<typeof buildPlan>) => plan.rows[0]!;

describe('buildPlan — what is written', () => {
  it('writes the ROUNDED score, keeps the system score beside it, never a float', () => {
    const plan = buildPlan(input({ roundingStep: 50, students: [student('20120001', scored(725))], rows: [row(3, '20120001')] }));
    expect(only(plan)).toMatchObject({ action: 'write', systemHundredths: 725, writtenHundredths: 750, studentMssv: '20120001', note: null });
    expect(plan.summary).toMatchObject({ write: 1, blank: 0, kept: 0, unmatched: 0 });
  });

  it('a blank student is NEVER given a number', () => {
    const reasons: BlankReason[] = ['absent', 'not_finished', 'ungradable', 'flagged'];
    const plan = buildPlan(input({
      students: reasons.map((r, i) => student(`SV00000${i}`, blank(r))),
      rows: reasons.map((_, i) => row(3 + i, `SV00000${i}`)),
    }));
    expect(plan.rows.map((r) => [r.action, r.writtenHundredths, r.blankReason])).toEqual(reasons.map((r) => ['blank', null, r]));
    expect(plan.summary.blank).toBe(4);
  });

  it('rows before/around the data — empty MSSV cells — are ignored and counted, not "unmatched"', () => {
    const plan = buildPlan(input({ students: [student('20120001', scored(700))], rows: [row(3, '20120001'), row(4, ''), row(5, '   ')] }));
    expect(plan.rows).toHaveLength(1);
    expect(plan.summary.ignoredEmpty).toBe(2);
    expect(plan.summary.unmatched).toBe(0);
  });
});

describe('buildPlan — matching', () => {
  it('an MSSV that is not in the session is unmatched, with the reason', () => {
    const plan = buildPlan(input({ students: [student('20120001', scored(700))], rows: [row(3, '99999999'), row(4, 'Họ tên')] }));
    expect(plan.rows.map((r) => [r.action, r.studentMssv])).toEqual([['unmatched', null], ['unmatched', null]]);
    expect(plan.rows[1]!.note).toContain('Không giống MSSV');
    expect(plan.summary.unmatched).toBe(2);
  });

  it('a numeric cell that lost its zeros matches and the row says how', () => {
    const plan = buildPlan(input({ students: [student('0012345', scored(700))], rows: [row(3, '12345', { mssvKind: 'number' })] }));
    expect(only(plan)).toMatchObject({ action: 'write', studentMssv: '0012345', note: 'Khớp sau khi bỏ số 0 đầu (ô số).' });
  });

  it('the same student on two rows makes BOTH rows "duplicate" and blocks the write', () => {
    const plan = buildPlan(input({ students: [student('20120001', scored(700))], rows: [row(3, '20120001'), row(9, '20120001')] }));
    expect(plan.rows.map((r) => r.action)).toEqual(['duplicate', 'duplicate']);
    expect(plan.rows[0]!.note).toBe('MSSV trùng ở các dòng 3, 9.');
    expect(plan.summary.duplicates).toBe(2);
    expect(plan.blockers[0]).toContain('1 MSSV xuất hiện nhiều lần trong file (20120001)');
  });

  it('a duplicate differing only in letter case is still a duplicate', () => {
    const plan = buildPlan(input({ students: [student('SV000001', scored(700))], rows: [row(3, 'SV000001'), row(4, 'sv000001')] }));
    expect(plan.rows.map((r) => r.action)).toEqual(['duplicate', 'duplicate']);
  });

  it('students the file never mentions are listed, sorted, not added', () => {
    const plan = buildPlan(input({
      students: [student('20120009', scored(700)), student('20120001', scored(800)), student('20120005', blank('absent'))],
      rows: [row(3, '20120005')],
    }));
    expect(plan.notInFile.map((s) => s.mssv)).toEqual(['20120001', '20120009']);
    expect(plan.summary.notInFile).toBe(2);
  });
});

describe('buildPlan — cells we must not touch', () => {
  it('a formula in the score cell skips the row; a merged non-master cell too', () => {
    const plan = buildPlan(input({
      students: [student('20120001', scored(700)), student('20120002', scored(800))],
      rows: [row(3, '20120001', { score: cell('7', 'number', { hasFormula: true }) }), row(4, '20120002', { score: cell('', 'empty', { mergedNonMaster: true }) })],
    }));
    expect(plan.rows.map((r) => r.action)).toEqual(['skipped_formula', 'skipped_merged']);
    expect(plan.rows[0]!.note).toBe('Ô điểm có công thức — không ghi.');
    expect(plan.summary.skipped).toBe(2);
  });

  it('a blank student does not care about a formula in the SCORE cell (nothing is written there)', () => {
    const plan = buildPlan(input({ students: [student('20120001', blank('absent'))], rows: [row(3, '20120001', { score: cell('7', 'number', { hasFormula: true }) })] }));
    expect(only(plan).action).toBe('blank');
  });

  it('but a formula in the REASON cell skips a row that would write a reason there', () => {
    const plan = buildPlan(input({
      hasReasonColumn: true,
      students: [student('20120001', blank('absent'))],
      rows: [row(3, '20120001', { reason: cell('x', 'text', { hasFormula: true }) })],
    }));
    expect(only(plan)).toMatchObject({ action: 'skipped_formula', note: 'Ô lý do có công thức — không ghi.' });
  });

  it('a protected sheet blocks everything', () => {
    const plan = buildPlan(input({ sheetProtected: true, students: [student('20120001', scored(700))], rows: [row(3, '20120001')] }));
    expect(plan.blockers).toContain('Trang tính đang được bảo vệ. Hãy bỏ bảo vệ trong Excel rồi tải lại.');
  });

  it('no row matching anything is a blocker that names the start row', () => {
    const plan = buildPlan(input({ firstDataRow: 12, students: [student('20120001', scored(700))], rows: [row(12, '99999999')] }));
    expect(plan.blockers).toEqual(['Không có dòng nào từ dòng 12 khớp sinh viên của phiên — hãy kiểm tra lại cột MSSV và dòng bắt đầu.']);
  });
});

describe('buildPlan — overwriting', () => {
  it('counts a score cell that already has a DIFFERENT value, not one that already holds what we would write', () => {
    const plan = buildPlan(input({
      roundingStep: 50,
      students: [student('20120001', scored(725)), student('20120002', scored(800)), student('20120003', scored(700)), student('20120004', scored(700))],
      rows: [
        row(3, '20120001', { score: cell('6.5', 'number') }), // 7.5 would replace 6.5 → overwrite
        row(4, '20120002', { score: cell('8', 'number') }), // already 8 → not an overwrite
        row(5, '20120003', { score: cell('bỏ thi', 'text') }), // text → overwrite
        row(6, '20120004', { score: cell('') }), // empty → none
      ],
    }));
    expect(plan.rows.map((r) => r.overwritesScore)).toEqual([true, false, true, false]);
    expect(plan.overwrite).toEqual({ score: 2, reason: 0 });
  });

  it('a reason cell holding OUR OWN label is not "a value"; anyone else’s text is', () => {
    const plan = buildPlan(input({
      hasReasonColumn: true,
      students: [student('20120001', blank('absent')), student('20120002', blank('absent')), student('20120003', blank('absent'))],
      rows: [
        row(3, '20120001', { reason: cell(BLANK_LABELS.absent) }),
        row(4, '20120002', { reason: cell('Nghỉ có phép') }),
        row(5, '20120003', { reason: cell('') }),
      ],
    }));
    expect(plan.rows.map((r) => [r.writesReason, r.overwritesReason])).toEqual([[true, false], [true, true], [true, false]]);
    expect(plan.overwrite).toEqual({ score: 0, reason: 1 });
  });

  it('a student who NOW has a score clears a stale reason label of ours — and only ours', () => {
    const plan = buildPlan(input({
      hasReasonColumn: true,
      students: [student('20120001', scored(700)), student('20120002', scored(800))],
      rows: [row(3, '20120001', { reason: cell(BLANK_LABELS.not_finished) }), row(4, '20120002', { reason: cell('Học lại') })],
    }));
    expect(plan.rows.map((r) => [r.clearsReason, r.overwritesReason])).toEqual([[true, false], [false, false]]);
  });

  it('without a reason column nothing about reasons is planned', () => {
    const plan = buildPlan(input({ students: [student('20120001', blank('absent'))], rows: [row(3, '20120001', { reason: cell('x') })] }));
    expect(only(plan)).toMatchObject({ writesReason: false, overwritesReason: false, clearsReason: false });
  });
});

describe('buildPlan — a re-export (parent §13.1 rules 3, 4, 6)', () => {
  const prev = (hundredths: number, computationId: string | null = 'old', step = 1) => ({ hundredths, computationId, step });

  it('compares the ROUNDED values: 7,10 → 7,20 at step 0,5 is unchanged', () => {
    const plan = buildPlan(input({ roundingStep: 50, previous: new Map([['20120001', prev(700)]]), students: [student('20120001', scored(720))], rows: [row(3, '20120001')] }));
    expect(only(plan)).toMatchObject({ writtenHundredths: 700, previousHundredths: 700, direction: 'same' });
  });

  it('7,24 → 7,26 at step 0,5 went up', () => {
    const plan = buildPlan(input({ roundingStep: 50, previous: new Map([['20120001', prev(700)]]), students: [student('20120001', scored(726))], rows: [row(3, '20120001')] }));
    expect(only(plan)).toMatchObject({ writtenHundredths: 750, direction: 'up' });
  });

  it('separates down from up, marks a student with no earlier write as "new", and leaves a first export with no direction at all', () => {
    const previous = new Map([['20120001', prev(800)], ['20120002', prev(600)]]);
    const students = [student('20120001', scored(750)), student('20120002', scored(650)), student('20120003', scored(900))];
    const rows = [row(3, '20120001'), row(4, '20120002'), row(5, '20120003')];
    expect(buildPlan(input({ previous, students, rows })).rows.map((r) => r.direction)).toEqual(['down', 'up', 'new']);
    expect(buildPlan(input({ students, rows })).rows.map((r) => r.direction)).toEqual([null, null, null]);
  });

  it('a student written before who is blank now is KEPT: the score cell is untouched and the row says what was there', () => {
    const plan = buildPlan(input({ previous: new Map([['20120001', prev(750)]]), students: [student('20120001', blank('flagged'))], rows: [row(3, '20120001', { score: cell('7.5', 'number') })] }));
    expect(only(plan)).toMatchObject({ action: 'kept', writtenHundredths: null, previousHundredths: 750, blankReason: 'flagged' });
    expect(only(plan).note).toBe('Lần trước đã ghi 7,5; lần này bài đang chờ giảng viên duyệt — giữ nguyên ô điểm.');
    expect(plan.summary).toMatchObject({ kept: 1, blank: 0 });
  });

  it('a kept row still writes the reason when a reason column was chosen', () => {
    const plan = buildPlan(input({ hasReasonColumn: true, previous: new Map([['20120001', prev(750)]]), students: [student('20120001', blank('flagged'))], rows: [row(3, '20120001', { reason: cell('') })] }));
    expect(only(plan)).toMatchObject({ action: 'kept', writesReason: true });
  });
});

describe('buildPlan — the digest', () => {
  const students = [student('20120001', scored(725)), student('20120002', blank('absent'))];
  const rows = [row(3, '20120001'), row(4, '20120002')];

  it('is stable: same input, same digest — whatever order the students arrive in', () => {
    const a = buildPlan(input({ students, rows })).digest;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(buildPlan(input({ students: [...students].reverse(), rows })).digest).toBe(a);
  });

  it('changes when the rounding step, a written value, an action or the reason column changes', () => {
    const a = buildPlan(input({ students, rows })).digest;
    expect(buildPlan(input({ students, rows, roundingStep: 50 })).digest).not.toBe(a);
    expect(buildPlan(input({ students: [student('20120001', scored(726)), students[1]!], rows, roundingStep: 1 })).digest).not.toBe(a);
    expect(buildPlan(input({ students: [students[0]!, student('20120002', blank('flagged'))], rows })).digest).not.toBe(a);
    expect(buildPlan(input({ students, rows, hasReasonColumn: true })).digest).not.toBe(a);
  });
});
