import type { TestBundleCase } from '@/lib/api/test-bundle';

/** Ca đang dùng để chấm: ca hệ thống đã tự bỏ không chấm được ai nên không nằm trong danh sách giảng viên duyệt. */
export const runnableCases = (cases: TestBundleCase[]): TestBundleCase[] => cases.filter((c) => c.autoDroppedReason === null);

/**
 * Ca giảng viên PHẢI đọc kỹ trước khi duyệt và ghim (mock-up v2): mọi ca biên (`bien`) và ca lớn (`lon`) — nơi đáp án sai
 * lộ ra nhiều nhất — cộng ca cơ bản đầu tiên làm mẫu. Duyệt một gói chưa đọc là biến "khớp nội bộ" thành thước mà chưa ai nhìn.
 * Trả tập `caseKey`.
 */
export function casesToRead(cases: TestBundleCase[]): Set<string> {
  const active = runnableCases(cases);
  const keys = new Set<string>();
  const firstBasic = active.find((c) => c.group === 'co_ban');
  for (const c of active) {
    if (c.group === 'bien' || c.group === 'lon' || c === firstBasic) keys.add(c.caseKey);
  }
  return keys;
}
