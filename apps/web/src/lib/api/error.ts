/** Lỗi từ máy chủ → `Error` mang thông điệp nguyên văn (mảng thì nối bằng "; "). Dùng chung cho mọi module `lib/api/*` của Bảng lỗi. */
export function apiFailure(error: unknown, response: Response): Error {
  const body = error as { message?: string | string[] } | undefined;
  const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
  return new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
}

/**
 * Lỗi máy chủ KÈM mã trạng thái và thân lỗi, cho chỗ giao diện phải phân biệt các lỗi: 409 "chưa có mã đáp án" mở form tải
 * mã, 422 kèm `mismatches` hay `compileLog` hiện chi tiết, 503 báo máy chạy bài chưa sẵn sàng. Vẫn là `Error` với thông điệp
 * nguyên văn nên chỗ nào chỉ cần `error.message` không phải đổi gì.
 */
export class ApiStatusError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiStatusError';
  }
}

export function apiStatusFailure(error: unknown, response: Response): ApiStatusError {
  return new ApiStatusError(apiFailure(error, response).message, response.status, error);
}
