import { describe, expect, it } from 'vitest';
import { isMakeupSubmission, pointsForVerdict } from './grading-triage';

describe('pointsForVerdict', () => {
  it('khớp pointsFor() của server — nửa thang cho đạt một phần', () => {
    expect(pointsForVerdict('met', 4)).toBe(4);
    expect(pointsForVerdict('partially_met', 4)).toBe(2);
    expect(pointsForVerdict('partially_met', 3)).toBe(1.5);
    expect(pointsForVerdict('not_met', 4)).toBe(0);
  });
});

describe('isMakeupSubmission', () => {
  it('T-MU-2: bài có lớp gốc khác lớp phiên → thi bù', () => {
    expect(isMakeupSubmission('class-b', 'class-a')).toBe(true);
    expect(isMakeupSubmission('class-a', 'class-a')).toBe(false);
  });

  it('thiếu một vế thì KHÔNG đoán là thi bù', () => {
    // Dữ liệu cũ trước khi `exam_session.class_id` thành NOT NULL vẫn còn
    // trong DB. Gắn nhãn "thi bù" cho một bài chỉ vì thiếu dữ liệu là bịa
    // ra một sự kiện chưa chắc đã xảy ra — im lặng là câu trả lời đúng.
    expect(isMakeupSubmission(null, 'class-a')).toBe(false);
    expect(isMakeupSubmission('class-b', null)).toBe(false);
  });
});
