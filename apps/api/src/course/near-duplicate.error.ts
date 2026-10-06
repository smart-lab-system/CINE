import { ConflictException } from '@nestjs/common';

export interface SimilarEntry {
  id: string;
  name: string;
}

/**
 * 409 NEAR_DUPLICATE: "cái bạn gõ giống cái đã có". KHÁC trùng cứng — trùng cứng
 * là 409 thường với câu "đã tồn tại" (DB có khoá duy nhất cho nó). Cảnh báo này
 * là lời nhắc, không phải lệnh cấm: client gửi lại với `confirmSimilar: true` thì
 * ghi được. Thân phản hồi mang `error` để giao diện phân biệt hai loại 409 mà
 * không phải đọc chữ.
 */
export function nearDuplicateConflict(
  noun: string,
  value: string,
  similar: SimilarEntry[],
): ConflictException {
  const names = similar.map((entry) => `"${entry.name}"`).join(', ');
  return new ConflictException({
    error: 'NEAR_DUPLICATE',
    message:
      `${noun} "${value}" gần giống ${names}. ` +
      `Nếu đây đúng là một ${noun.toLowerCase()} khác, hãy xác nhận để tiếp tục.`,
    similar,
  });
}
