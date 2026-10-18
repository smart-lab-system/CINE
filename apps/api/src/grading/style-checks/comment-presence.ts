import { scanCpp } from './cpp-scan';

/**
 * Bài có ít nhất một chú thích thật (không rỗng, không nằm trong chuỗi) hay không.
 * Chỉ kiểm có/không. Không kiểm chú thích có giải thích được cấu trúc dữ liệu hay không.
 */
export function hasComment(source: string): boolean {
  return scanCpp(source).comments.some((c) => c.trim() !== '');
}
