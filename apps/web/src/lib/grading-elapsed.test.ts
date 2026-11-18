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
});
