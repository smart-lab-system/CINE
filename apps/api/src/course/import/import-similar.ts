import { findNearDuplicates } from '../../common/near-duplicate';
import type { ImportRowResult, ImportSimilar } from './import.types';

export interface NewEntry {
  /** Vị trí của dòng trong mảng kết quả. */
  index: number;
  line: number;
  name: string;
}

export interface ExistingEntry {
  id: string;
  name: string;
}

/**
 * Gắn mục "gần giống" cho từng dòng MỚI (spec §6.2 nguyên tắc 4): so với mục có sẵn **và** với các dòng mới KHÁC trong cùng
 * file. Phép thứ hai là thứ một kiểm tra chỉ-so-với-DB bỏ sót: hai dòng `P.A101` và `P A101` trong cùng một file đều "mới",
 * không cái nào gần giống thứ gì đã có, mà vẫn là một phòng gõ hai lần.
 *
 * Hai chiều: cặp trong file hiện ở CẢ HAI dòng, để người đọc bản xem trước thấy từ dòng nào cũng được.
 * Người gọi chỉ truyền dòng MỚI và hợp lệ: dòng có sẵn không bao giờ là "gần giống", dòng lỗi không tham gia.
 */
export function attachSimilar(
  results: ImportRowResult[],
  news: readonly NewEntry[],
  existing: readonly ExistingEntry[],
): void {
  for (const entry of news) {
    const similar: ImportSimilar[] = [];
    for (const match of findNearDuplicates(entry.name, existing, (candidate) => candidate.name)) {
      similar.push({
        id: match.candidate.id,
        name: match.candidate.name,
        reason: match.reason,
        source: 'existing',
        line: null,
      });
    }
    const others = news.filter((other) => other.index !== entry.index);
    for (const match of findNearDuplicates(entry.name, others, (candidate) => candidate.name)) {
      similar.push({
        id: null,
        name: match.candidate.name,
        reason: match.reason,
        source: 'file',
        line: match.candidate.line,
      });
    }
    results[entry.index].similar = similar;
  }
}
