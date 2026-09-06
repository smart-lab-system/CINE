import { describe, expect, it } from 'vitest';
import { GROUP_ORDER, groupOf, type ReviewGroup } from './grading-groups';

describe('groupOf', () => {
  // Bảng ánh xạ ở spec §8. Không status nào được rơi ra ngoài — một status
  // không có nhóm nghĩa là một bài biến mất khỏi rail, và trong bài đó là bài
  // thi thật của sinh viên.
  const cases: [string, ReviewGroup][] = [
    ['flagged_for_review', 'needsReview'],
    ['auto_approved', 'autoApproved'],
    ['teacher_reviewed', 'reviewed'],
    ['finalized', 'finalised'],
    ['exported', 'finalised'],
    ['ai_grading', 'grading'],
    ['ai_graded', 'grading'],
  ];

  it.each(cases)('xếp %s vào %s', (status, expected) => {
    expect(groupOf(status)).toBe(expected);
  });

  it('mọi nhóm đều có mặt trong GROUP_ORDER', () => {
    const groups = new Set(cases.map(([, group]) => group));
    for (const group of groups) {
      expect(GROUP_ORDER).toContain(group);
    }
  });

  it('status lạ rơi vào nhóm grading thay vì biến mất', () => {
    // An toàn theo hướng "vẫn hiện ra": một giá trị enum thêm sau này không
    // được làm bài nào rơi khỏi rail trong im lặng.
    expect(groupOf('something_new')).toBe('grading');
  });
});
