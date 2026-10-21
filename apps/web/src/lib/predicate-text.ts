import type { RulePredicate } from '@/lib/api/grading';

/**
 * Điều kiện đo của một luật, viết bằng tiếng Việt thường cho giảng viên (spec §5.8, mục 1). Chỉ đổi nhãn hiển thị;
 * không đổi cách máy đo. `null` là luật bằng lời: hệ thống đọc bài để xét, không có phép đo cụ thể nào.
 */
export function predicateText(predicate: RulePredicate | null): string {
  if (!predicate) return 'Quy tắc mô tả bằng lời; hệ thống đọc bài để xét, không có phép đo cụ thể';
  switch (predicate.kind) {
    case 'test_group_failed':
      return `Có ca kiểm thử thuộc nhóm “${predicate.group}” không đạt`;
    case 'calls_function':
      return `Bài gọi hàm “${predicate.name}”`;
    case 'complexity_exceeds_required':
      return 'Độ phức tạp đo được vượt mức đề yêu cầu';
    case 'no_recursion':
      return predicate.functionName
        ? `Bài không dùng đệ quy trong hàm “${predicate.functionName}”`
        : 'Bài không dùng đệ quy';
  }
}
