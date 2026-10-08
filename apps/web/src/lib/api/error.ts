/** Lỗi từ máy chủ → `Error` mang thông điệp nguyên văn (mảng thì nối bằng "; "). Dùng chung cho mọi module `lib/api/*` của Bảng lỗi. */
export function apiFailure(error: unknown, response: Response): Error {
  const body = error as { message?: string | string[] } | undefined;
  const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
  return new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
}
