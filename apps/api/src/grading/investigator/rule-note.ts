import type { RulePredicate } from '../decision/types';

/**
 * Dòng model đọc ở `bang-loi.md`: máy kiểm luật này bằng gì, hay vì sao chưa kiểm được (Q1).
 * MỘT chỗ cho runner eval và đường chấm thật — lệch chữ thì eval đo một prompt khác prompt chạy.
 */
export function machineNoteOf(p: RulePredicate | null): string | null {
  if (!p) return null;
  if (p.kind === 'test_group_failed') return `nhóm test ${p.group}`;
  return 'máy chưa đo được — bạn phán đoán';
}
