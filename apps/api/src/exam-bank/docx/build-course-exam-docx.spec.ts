import { buildCourseExamDocx } from './build-course-exam-docx';
import { parseCourseExamDocx } from './parse-course-exam-docx';

describe('buildCourseExamDocx', () => {
  it('round-trip docx → parse giữ loại / ngôn ngữ / mô tả / điểm / nội dung', async () => {
    const buf = await buildCourseExamDocx({
      examType: 'GK',
      courseName: 'Cấu trúc dữ liệu và giải thuật',
      language: 'cpp',
      description: 'Thời gian làm bài: 90 phút.',
      questions: [
        {
          points: 4,
          statement:
            'Cho một mảng arr và một số nguyên k.\nYêu cầu độ phức tạp: O(n)',
        },
        { points: 6, statement: 'Cài đặt ngăn xếp.' },
      ],
    });
    expect(buf.byteLength).toBeGreaterThan(100);

    const parsed = await parseCourseExamDocx(buf, 'Cấu trúc dữ liệu và giải thuật');
    expect(parsed.examType).toBe('GK');
    expect(parsed.language).toBe('cpp');
    expect(parsed.description).toBe('Thời gian làm bài: 90 phút.');
    expect(parsed.totalPoints).toBe(10);
    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0].statement).toContain('mảng arr');
    expect(parsed.questions[1].statement).toContain('ngăn xếp');
  });
});
