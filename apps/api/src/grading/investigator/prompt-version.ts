import { createHash } from 'node:crypto';
import { INVESTIGATOR_SYSTEM_PROMPT } from './protocol';

/**
 * Phiên bản prompt của AGENT ĐIỀU TRA: 12 ký tự đầu của SHA-256 system prompt. Đổi một byte là đổi
 * mã — nên một bản ghi chấm trả lời được "lượt này chạy với prompt nào" mà không cần đoán theo
 * commit. GIỚI HẠN ĐÃ BIẾT: system prompt của bốn lăng kính là hằng cục bộ trong từng file lăng
 * kính, chưa nằm trong băm này; thêm chúng vào là việc riêng khi cần.
 */
export function promptVersionOf(): string {
  return createHash('sha256').update(INVESTIGATOR_SYSTEM_PROMPT).digest('hex').slice(0, 12);
}
