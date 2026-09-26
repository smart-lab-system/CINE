import { BLOCKS_FINALIZE, canTransition, GRADING_STATUSES, GRADING_TRANSITIONS } from './grading-transitions';

describe('bảng chuyển trạng thái §14.3', () => {
  it('đúng 15 cặp: 8 có từ trước + 7 cặp mới của §14.3 (sáu dòng Thêm, một dòng hai nguồn)', () => {
    expect(GRADING_TRANSITIONS).toHaveLength(15);
    expect(new Set(GRADING_TRANSITIONS.map(([f, t]) => `${f}>${t}`)).size).toBe(15);
  });

  it('không cặp nào tự trỏ về chính nó, và mọi trạng thái đều có trong enum', () => {
    for (const [from, to] of GRADING_TRANSITIONS) {
      expect(from).not.toBe(to);
      expect(GRADING_STATUSES).toContain(from);
      expect(GRADING_STATUSES).toContain(to);
    }
  });

  it('finalized chỉ đến từ teacher_reviewed và auto_approved', () => {
    const into = GRADING_TRANSITIONS.filter(([, t]) => t === 'finalized').map(([f]) => f).sort();
    expect(into).toEqual(['auto_approved', 'teacher_reviewed']);
  });

  it('audit_pending chặn chốt, và không đi thẳng sang finalized', () => {
    expect(BLOCKS_FINALIZE.has('audit_pending')).toBe(true);
    expect(canTransition('audit_pending', 'finalized')).toBe(false);
  });

  it('BLOCKS_FINALIZE đúng danh sách của §14.3', () => {
    expect([...BLOCKS_FINALIZE].sort()).toEqual(['ai_graded', 'ai_grading', 'audit_pending', 'flagged_for_review']);
  });
});
