import { buildCourseExamTitle } from './exam-bank.constants';

describe('buildCourseExamTitle', () => {
  it('ghép loại đề và tên môn', () => {
    expect(buildCourseExamTitle('GK', 'Cấu trúc dữ liệu và giải thuật')).toBe(
      'Đề thi giữa kỳ — Cấu trúc dữ liệu và giải thuật',
    );
    expect(buildCourseExamTitle('CK', 'Lập trình Web')).toBe('Đề thi cuối kỳ — Lập trình Web');
    expect(buildCourseExamTitle('TK', 'Toán rời rạc')).toBe('Đề thi thường kỳ — Toán rời rạc');
  });
});
