/**
 * Cảnh báo trước khi duyệt một phiên bản tiện ích chưa có file .vsix.
 *
 * Duyệt là một quyết định "cho phép" theo mã tiện ích và phiên bản (đóng các vi phạm, xem `violation-filter` ở
 * backend), nên backend không đòi có file: phiên bản được đồng bộ trước, file đến sau; và "mọi phiên bản (*)" không
 * bao giờ có file. Nhưng người duyệt phiên bản chưa có file thì duyệt mà không xem được mã, nên hỏi lại một lần.
 *
 * Trả về câu hỏi xác nhận, hoặc `null` khi không cần hỏi.
 */
export function approveWarning(version: {
  version: string;
  storageKey?: string | null;
  artifactUploadedAt?: string | null;
}): string | null {
  if (version.version === '*') return null;
  if (version.storageKey || version.artifactUploadedAt) return null;
  return 'Phiên bản này chưa có file .vsix nên chưa xem được nội dung để kiểm tra. Vẫn duyệt?';
}
