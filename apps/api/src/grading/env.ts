/**
 * Đọc một số nguyên dương từ env, hoặc NỔ NGAY LÚC KHỞI ĐỘNG.
 *
 * File LEAF, không import gì.
 *
 * `Number(process.env.X ?? mặc_định)` là một cái bẫy im lặng: `??` chỉ bắt
 * `null`/`undefined`, nên `X=` (rỗng) đi qua và cho `0`, còn `X=abc` cho
 * `NaN`. Worker của BullMQ kiểm `jobsInProgress.size < opts.concurrency`,
 * và cả `0 < 0` lẫn `0 < NaN` đều `false` — worker lặng lẽ ngừng nhận job.
 * Không lỗi, không log, hàng đợi trông khoẻ mạnh trên mọi bảng quản trị,
 * và không bài nào được chấm.
 *
 * Ném lúc nạp module là kết cục ĐÚNG: nó lộ ra ngay khi khởi động, trước
 * khi có job nào được xếp hàng, thay vì lộ ra dưới dạng "sao chấm không
 * chạy" ba ngày sau.
 *
 * Tách khỏi `grading.processor.ts` ngày 2026-09-15 khi `grading.queue.ts`
 * cũng cần nó: hai bản sao của một hàm phân tích env là hai chỗ để một bản
 * được vá còn bản kia thì không.
 */
export function envPositiveInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(
      `${key}="${raw}" không phải số nguyên dương — từ chối khởi động với một ` +
        'hàng đợi chấm điểm hỏng.',
    );
  }
  return Math.trunc(value);
}
