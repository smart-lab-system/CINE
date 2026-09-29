export interface BulkOutcome {
  sessionId: string;
  ok: boolean;
  /** Lời của máy chủ khi bị từ chối. */
  message?: string;
}

/**
 * Chạy một thao tác cho từng phiên, TUẦN TỰ, và báo lại kết quả của từng phiên.
 *
 * Tuần tự vì `start-grading` xếp cả lượt bài vào một hàng đợi dùng chung (năm giảng viên chấm cùng lúc
 * cuối kỳ), và vì thứ tự báo lại phải khớp thứ tự giảng viên đã chọn. Một phiên bị từ chối KHÔNG dừng
 * các phiên sau — nếu dừng, lỗi ở phiên thứ hai biến thành "phiên ba đến mười chưa được bắt đầu" mà
 * không ai được báo.
 */
export async function runSequentially(
  ids: string[],
  action: (id: string) => Promise<unknown>,
): Promise<BulkOutcome[]> {
  const outcomes: BulkOutcome[] = [];
  for (const sessionId of ids) {
    try {
      await action(sessionId);
      outcomes.push({ sessionId, ok: true });
    } catch (error) {
      outcomes.push({ sessionId, ok: false, message: error instanceof Error ? error.message : 'Không rõ lỗi.' });
    }
  }
  return outcomes;
}
