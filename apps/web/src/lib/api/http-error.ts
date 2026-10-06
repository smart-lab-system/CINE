/**
 * 409 "gần giống" (spec §2.2, §6.2 nguyên tắc 4): server báo mục vừa gõ giống mục đã có và liệt kê chúng; client hiện lời nhắc và
 * gửi lại với `confirmSimilar: true`. Lớp riêng thay vì một cờ trên `Error` thường vì HAI loại 409 cần hai cách xử lý khác hẳn: trùng
 * cứng chỉ có thể sửa, còn "gần giống" có thể xác nhận bỏ qua.
 */
export class NearDuplicateError extends Error {
  constructor(
    message: string,
    readonly similar: Array<{ id: string; name: string }>,
  ) {
    super(message);
    this.name = 'NearDuplicateError';
  }
}

/**
 * Mọi hàm `lib/api` của dữ liệu nền kết thúc ở đây. openapi-fetch chỉ điền `error` từ thân phản hồi và có lỗi để trống, nên
 * cũng xét `response.ok`. Chữ của server được giữ NGUYÊN VĂN: một 409 nêu mục nào gây lỗi ("Phòng X đã có 4 phiên thi…") và đó là cách
 * duy nhất admin biết vì sao thao tác không được — `Yêu cầu thất bại` chung chung là thất bại của cả màn hình.
 */
export async function throwIfFailed(
  error: unknown,
  response: { ok: boolean; status: number },
): Promise<void> {
  if (!error && response.ok) return;
  const body = (error ?? {}) as {
    error?: string;
    message?: string | string[];
    similar?: Array<{ id: string; name: string }>;
  };
  const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
  if (response.status === 409 && body.error === 'NEAR_DUPLICATE') {
    throw new NearDuplicateError(message ?? 'Mục này gần giống một mục đã có.', body.similar ?? []);
  }
  throw new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
}
