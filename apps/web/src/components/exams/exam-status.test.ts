import { describe, expect, it } from 'vitest';
import {
  EXAM_STATUS_LABELS,
  SESSION_TYPE_LABELS,
  examStatusBadgeVariant,
} from './exam-status';

describe('exam status copy', () => {
  it('labels every lifecycle status in Vietnamese', () => {
    expect(EXAM_STATUS_LABELS.draft).toBe('Nháp');
    expect(EXAM_STATUS_LABELS.scheduled).toBe('Đã công bố');
    expect(EXAM_STATUS_LABELS.active).toBe('Đang diễn ra');
    expect(EXAM_STATUS_LABELS.completed).toBe('Hoàn thành');
    expect(EXAM_STATUS_LABELS.cancelled).toBe('Đã hủy');
    expect(EXAM_STATUS_LABELS.aborted).toBe('Dừng');
  });

  it('distinguishes exam vs practice', () => {
    expect(SESSION_TYPE_LABELS.exam).toBe('Thi');
    expect(SESSION_TYPE_LABELS.practice).toBe('Thực hành');
  });

  it('uses a destructive badge for cancelled and aborted', () => {
    expect(examStatusBadgeVariant('cancelled')).toBe('destructive');
    expect(examStatusBadgeVariant('aborted')).toBe('destructive');
    expect(examStatusBadgeVariant('draft')).toBe('secondary');
  });
});
