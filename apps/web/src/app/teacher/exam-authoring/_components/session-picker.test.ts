import { describe, expect, it } from 'vitest';
import { blockedReason, isAttachable } from './session-picker';

const NOW = new Date('2026-09-22T10:00:00.000Z');

function session(status: string, startsAt: string) {
  return { status, startTime: startsAt };
}

describe('isAttachable', () => {
  // Chốt chặn của cả tính năng. `ExamSessionService.create()` ghi status
  // 'active' cho MỌI phiên mới, nên nếu luật quay về đọc `status` thì ca này
  // đỏ — và nó đỏ đúng: luật đó chặn sạch mọi lượt gắn đề.
  it('phiên active nhưng chưa tới giờ thi -> gắn được', () => {
    expect(isAttachable(session('active', '2026-09-22T13:00:00.000Z'), NOW)).toBe(true);
  });

  it('phiên active đã qua giờ bắt đầu -> không gắn được', () => {
    expect(isAttachable(session('active', '2026-09-22T09:59:00.000Z'), NOW)).toBe(false);
  });

  it('đúng mốc start_time -> không gắn được', () => {
    // Biên đóng: server phát tài liệu ngay TẠI mốc này (now >= start_time),
    // nên bằng nhau phải nằm về phía từ chối.
    expect(isAttachable(session('active', '2026-09-22T10:00:00.000Z'), NOW)).toBe(false);
  });

  it('phiên huỷ dù giờ thi còn ở tương lai -> không gắn được', () => {
    expect(isAttachable(session('cancelled', '2026-09-22T13:00:00.000Z'), NOW)).toBe(false);
  });

  it('đang thu bài / đã hoàn thành -> không gắn được', () => {
    expect(isAttachable(session('collecting', '2026-09-22T13:00:00.000Z'), NOW)).toBe(false);
    expect(isAttachable(session('completed', '2026-09-22T13:00:00.000Z'), NOW)).toBe(false);
  });
});

describe('blockedReason', () => {
  it('phiên đã bắt đầu -> nói rõ tài liệu đã phát', () => {
    expect(blockedReason(session('active', '2026-09-22T09:00:00.000Z'))).toContain('đã phát');
  });

  it('trạng thái đóng -> nói đúng trạng thái đó', () => {
    expect(blockedReason(session('cancelled', '2026-09-22T13:00:00.000Z'))).toBe('Đã huỷ');
    expect(blockedReason(session('collecting', '2026-09-22T13:00:00.000Z'))).toContain('thu bài');
  });
});
