import { machineNoteOf } from './rule-note';

describe('machineNoteOf — dòng "máy kiểm bằng gì" của bang-loi.md', () => {
  it('luật lời → không có dòng', () => {
    expect(machineNoteOf(null)).toBeNull();
  });
  it('nhóm test trượt → nêu nhóm', () => {
    expect(machineNoteOf({ kind: 'test_group_failed', group: 'bien' })).toBe('nhóm test bien');
  });
  it('mẫu máy chưa đo được → model phán đoán (Q1)', () => {
    expect(machineNoteOf({ kind: 'calls_function', name: 'sort' })).toBe('máy chưa đo được — bạn phán đoán');
  });
});
