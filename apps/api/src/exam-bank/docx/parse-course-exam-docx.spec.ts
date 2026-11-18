import { BadRequestException } from '@nestjs/common';
import { parseCourseExamText } from './parse-course-exam-docx';

const SAMPLE = `Đề thi giữa kỳ — Cấu trúc dữ liệu và giải thuật
Ngôn ngữ / project: cpp

Câu 1. (4 điểm)
Cho một mảng arr và một số nguyên k. Tìm tích lớn nhất của k phần tử liên tiếp.
Yêu cầu độ phức tạp: O(n) thời gian, O(1) phụ trợ

Câu 2. (6 điểm)
Cài đặt ngăn xếp bằng danh sách liên kết đơn.
`;

describe('parseCourseExamText', () => {
  it('parse mẫu FORMAT-DE-THI', () => {
    const r = parseCourseExamText(SAMPLE, 'Cấu trúc dữ liệu và giải thuật');
    expect(r.examType).toBe('GK');
    expect(r.language).toBe('cpp');
    expect(r.description).toBeNull();
    expect(r.totalPoints).toBe(10);
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0].points).toBe(4);
    expect(r.questions[0].statement).toContain('Yêu cầu độ phức tạp');
    expect(r.questions[1].statement).toContain('ngăn xếp');
    expect(r.warnings).toHaveLength(0);
  });

  it('parse mô tả dùng chung trước câu 1', () => {
    const text = `Đề thi giữa kỳ — DSA
Ngôn ngữ / project: cpp

Sinh viên được dùng tài liệu.
Thời gian: 90 phút.

Câu 1. (10 điểm)
Viết chương trình.
`;
    const r = parseCourseExamText(text);
    expect(r.description).toBe('Sinh viên được dùng tài liệu.\nThời gian: 90 phút.');
    expect(r.questions).toHaveLength(1);
  });

  it('chấp nhận alias Ngôn ngữ:', () => {
    const text = SAMPLE.replace('Ngôn ngữ / project: cpp', 'Ngôn ngữ: python');
    const r = parseCourseExamText(text);
    expect(r.language).toBe('python');
  });

  it('cảnh báo khi tên môn lệch', () => {
    const r = parseCourseExamText(SAMPLE, 'Môn khác');
    expect(r.warnings.some((w) => w.includes('khác môn'))).toBe(true);
  });

  it('điểm thập phân dấu phẩy', () => {
    const text = `Đề thi thường kỳ — DSA
Ngôn ngữ / project: java

Câu 1. (2,5 điểm)
Nội dung A

Câu 2. (7.5 điểm)
Nội dung B
`;
    const r = parseCourseExamText(text);
    expect(r.examType).toBe('TK');
    expect(r.totalPoints).toBe(10);
    expect(r.questions[0].points).toBe(2.5);
  });

  it('thiếu tiêu đề → 400', () => {
    expect(() => parseCourseExamText('Ngôn ngữ: cpp\n\nCâu 1. (1 điểm)\nA')).toThrow(
      BadRequestException,
    );
  });

  it('thiếu ngôn ngữ → 400', () => {
    expect(() =>
      parseCourseExamText('Đề thi cuối kỳ — X\n\nCâu 1. (1 điểm)\nA'),
    ).toThrow(BadRequestException);
  });

  it('không có câu → 400', () => {
    expect(() =>
      parseCourseExamText('Đề thi giữa kỳ — X\nNgôn ngữ / project: c\n\n'),
    ).toThrow(BadRequestException);
  });
});
