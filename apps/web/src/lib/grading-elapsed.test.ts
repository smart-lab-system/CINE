import { describe, expect, it } from 'vitest';
import { formatGradingElapsed, gradingInProgressMessage } from './grading-elapsed';

describe('formatGradingElapsed', () => {
  it('chỉ giây khi dưới 1 phút', () => {
    expect(formatGradingElapsed(12_000)).toBe('12 giây');
    expect(formatGradingElapsed(0)).toBe('0 giây');
  });

  it('phút + giây như mẫu alert', () => {
    expect(formatGradingElapsed(3 * 60_000 + 12_000)).toBe('3 phút 12 giây');
  });

  it('giờ khi quá dài', () => {
    expect(formatGradingElapsed(3600_000 + 5 * 60_000 + 7_000)).toBe('1 giờ 5 phút 7 giây');
  });

  it('không âm', () => {
    expect(formatGradingElapsed(-500)).toBe('0 giây');
  });
});

describe('gradingInProgressMessage', () => {
  const started = '2026-11-19T00:00:00.000Z';
  const now = Date.parse(started) + 3 * 60_000 + 12_000;

  it('có mốc → đúng câu alert', () => {
    expect(gradingInProgressMessage(started, now)).toBe('AI đang chấm bài này - đã 3 phút 12 giây.');
  });

  it('thiếu / hỏng mốc → câu ngắn', () => {
    expect(gradingInProgressMessage(undefined, now)).toBe('AI đang chấm bài này.');
    expect(gradingInProgressMessage('not-a-date', now)).toBe('AI đang chấm bài này.');
  });

  it('ai_graded: AI đã chấm xong, không được nói "AI đang chấm"', () => {
    const msg = gradingInProgressMessage(started, now, 'ai_graded');
    expect(msg).toBe('AI đã chấm xong, hệ thống đang xếp loại bài này - đã 3 phút 12 giây.');
    expect(msg).not.toMatch(/AI đang chấm/);
    expect(gradingInProgressMessage(undefined, now, 'ai_graded')).toBe('AI đã chấm xong, hệ thống đang xếp loại bài này.');
  });

  it('quá 30 phút ở một bước: nói thẳng là có thể bị kẹt, cho cả hai trạng thái', () => {
    const late = Date.parse(started) + 384 * 3600_000;
    expect(gradingInProgressMessage(started, late)).toContain('Lâu hơn bình thường: bài này có thể bị kẹt.');
    expect(gradingInProgressMessage(started, late, 'ai_graded')).toContain('Lâu hơn bình thường: bài này có thể bị kẹt.');
  });

  it('đúng ngưỡng 30 phút thì báo kẹt, dưới ngưỡng thì không', () => {
    expect(gradingInProgressMessage(started, Date.parse(started) + 30 * 60_000)).toContain('có thể bị kẹt');
    expect(gradingInProgressMessage(started, Date.parse(started) + 30 * 60_000 - 1000)).not.toContain('có thể bị kẹt');
  });
});
