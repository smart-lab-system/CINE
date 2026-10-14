import { foldStudentResults } from './fold-student-results';
import type { StudentOutcome } from './plan';

const roster = [
  { mssv: 'HS001', name: 'An' },
  { mssv: 'HS002', name: 'Bình' },
];
const scored = (hundredths: number): StudentOutcome => ({
  kind: 'scored',
  hundredths,
  computationId: null,
  source: 'computation',
});

describe('foldStudentResults()', () => {
  it('sinh viên không có kết quả → vắng, như trước', () => {
    const out = foldStudentResults(roster, []);
    expect(out.find((s) => s.mssv === 'HS001')!.outcome).toEqual({ kind: 'blank', reason: 'absent' });
  });

  it('một kết quả → outcome của chính kết quả đó, tên lấy từ danh sách lớp', () => {
    const out = foldStudentResults(roster, [{ mssv: 'HS001', name: 'Tên khác', outcome: scored(700) }]);
    const hs1 = out.find((s) => s.mssv === 'HS001')!;
    expect(hs1).toEqual({ mssv: 'HS001', name: 'An', outcome: scored(700) });
  });

  it('hai kết quả cùng sinh viên → conflict, KHÔNG lấy kết quả cuối (bẫy 3)', () => {
    const out = foldStudentResults(roster, [
      { mssv: 'HS001', name: 'An', outcome: scored(700) },
      { mssv: 'HS001', name: 'An', outcome: scored(900) },
    ]);
    expect(out.find((s) => s.mssv === 'HS001')!.outcome).toEqual({
      kind: 'conflict',
      reason: expect.stringMatching(/nhiều kết quả/),
    });
  });

  it('MSSV khác hoa thường gộp về một sinh viên và vẫn là conflict', () => {
    const out = foldStudentResults(roster, [
      { mssv: 'hs001', name: 'An', outcome: scored(700) },
      { mssv: 'HS001', name: 'An', outcome: scored(900) },
    ]);
    expect(out.filter((s) => s.mssv === 'HS001')).toHaveLength(1);
    expect(out.find((s) => s.mssv === 'HS001')!.outcome.kind).toBe('conflict');
  });

  it('sinh viên ngoài danh sách lớp vẫn được đưa vào, với tên từ kết quả', () => {
    const out = foldStudentResults(roster, [{ mssv: 'HS009', name: 'Lạ', outcome: scored(500) }]);
    expect(out.find((s) => s.mssv === 'HS009')).toEqual({ mssv: 'HS009', name: 'Lạ', outcome: scored(500) });
  });
});
