import { describe, expect, it } from 'vitest';
import { ACTION_LABEL, ACTION_OPTIONS, actionLabel, fieldLabel, targetLabel } from './audit-labels';

describe('audit-labels', () => {
  it('mã đã biết có nhãn tiếng Việt, mã lạ trả null để giữ nguyên mã thô', () => {
    expect(actionLabel('grading_result.score_edited_after_finalize')).toBe('Sửa điểm sau khi chốt');
    expect(actionLabel('khong.biet')).toBeNull();
    expect(fieldLabel('finalScore')).toBe('Điểm chốt');
    expect(fieldLabel('note')).toBeNull();
  });

  it('loại đối tượng lạ giữ nguyên mã', () => {
    expect(targetLabel('exam_session')).toBe('Phiên thi');
    expect(targetLabel('error_rule')).toBe('error_rule');
  });

  it('không nhãn nào lộ lại mã kỹ thuật (dấu chấm, gạch dưới, camelCase)', () => {
    for (const label of Object.values(ACTION_LABEL)) expect(label).not.toMatch(/[._]|[a-z][A-Z]/);
    expect(ACTION_OPTIONS).toHaveLength(Object.keys(ACTION_LABEL).length);
  });
});
