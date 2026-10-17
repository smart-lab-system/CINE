import { aggregateStudentTotal, ProblemState } from './student-total';

const done = (ordinal: number, hundredths: number, points = 500): ProblemState => ({
  ordinal,
  status: 'finalized',
  pointsHundredths: points,
  scoreHundredths: hundredths,
  auditPending: false,
});
const pending = (ordinal: number, points = 500): ProblemState => ({
  ordinal,
  status: 'pending',
  pointsHundredths: points,
  scoreHundredths: null,
  auditPending: false,
});
const blank = (ordinal: number, points = 500): ProblemState => ({
  ordinal,
  status: 'blank',
  pointsHundredths: points,
  scoreHundredths: null,
  auditPending: false,
});
const audit = (ordinal: number, points = 500): ProblemState => ({
  ordinal,
  status: 'pending',
  pointsHundredths: points,
  scoreHundredths: null,
  auditPending: true,
});

describe('aggregateStudentTotal (P1b §3.4)', () => {
  it('(a) hai câu đã chốt → final với tổng đúng', () => {
    expect(aggregateStudentTotal([done(1, 430), done(2, 520)], 2)).toEqual({ kind: 'final', hundredths: 950 });
  });

  it('(b) một câu chưa chốt, đủ hai câu → tạm, không thiếu câu nào, tổng chỉ cộng câu đã chốt', () => {
    expect(aggregateStudentTotal([done(1, 430), pending(2)], 2)).toEqual({ kind: 'tạm', hundredths: 430, missing: [] });
  });

  it('(c) một câu vắng hẳn khỏi mảng → tạm, missing = [2]', () => {
    expect(aggregateStudentTotal([done(1, 430)], 2)).toEqual({ kind: 'tạm', hundredths: 430, missing: [2] });
  });

  it('(c2) câu blank (sinh viên không có bài) → tạm, missing gồm câu đó', () => {
    expect(aggregateStudentTotal([done(1, 430), blank(2)], 2)).toEqual({ kind: 'tạm', hundredths: 430, missing: [2] });
  });

  it('(d) một câu đang chờ kiểm mẫu, còn lại đã chốt → dash, không lộ số', () => {
    expect(aggregateStudentTotal([done(1, 430), audit(2)], 2)).toEqual({ kind: 'dash' });
  });

  it('(e) chờ kiểm mẫu được ưu tiên hơn thiếu câu → dash', () => {
    expect(aggregateStudentTotal([audit(1)], 2)).toEqual({ kind: 'dash' });
  });

  it('(f) một câu đã chốt → final bằng đúng điểm câu, không làm tròn lại', () => {
    expect(aggregateStudentTotal([done(1, 1234, 1500)], 1)).toEqual({ kind: 'final', hundredths: 1234 });
  });
});
