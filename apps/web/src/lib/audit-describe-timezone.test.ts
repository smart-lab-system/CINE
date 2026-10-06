import { describe, expect, it } from 'vitest';

// Đặt múi giờ của TIẾN TRÌNH trước khi nạp module: `Intl.DateTimeFormat` chốt múi giờ lúc được tạo, nên việc này phải đứng trước
// `import('./audit-describe')`. Tách thành file riêng (mỗi file test chạy trong một worker riêng) để không đổi múi giờ của file khác.
// Cần thiết vì máy phát triển ở UTC+7 trùng múi giờ cần chứng minh: ca "không theo máy người xem" trong `audit-describe.test.ts` chỉ đỏ
// được khi máy chạy test KHÁC giờ Việt Nam, và `TZ=… vitest` đặt từ ngoài không có tác dụng với Node trên Windows.
process.env.TZ = 'America/New_York';

describe('describeAuditEntry — thời điểm đọc theo giờ Việt Nam dù máy người xem ở múi giờ khác', () => {
  it('máy ở New York vẫn đọc 01:00Z là 08:00 giờ Việt Nam', async () => {
    // Tiền đề: nếu môi trường không đổi được múi giờ thì test này phải ĐỎ, không được xanh vì tình cờ.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');

    const { describeAuditEntry } = await import('./audit-describe');
    const text = describeAuditEntry({
      action: 'exam_session.update',
      targetType: 'exam_session',
      targetId: '9f8e7d6c-1111-4222-8333-444455556666',
      oldValue: { startTime: '2026-10-20T01:00:00.000Z' },
      newValue: { targetLabel: 'Cuối kỳ CTDL', startTime: '2026-10-20T02:30:00.000Z' },
    });

    expect(text).toBe('Sửa phiên thi Cuối kỳ CTDL: giờ bắt đầu 20/10/2026 08:00 → 20/10/2026 09:30');
  });
});
