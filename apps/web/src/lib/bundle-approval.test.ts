import { describe, expect, it } from 'vitest';
import type { TestBundleCase } from '@/lib/api/test-bundle';
import { casesToRead, runnableCases } from './bundle-approval';

const c = (caseKey: string, group: string, autoDroppedReason: string | null = null): TestBundleCase => ({
  caseKey, group, input: '1', expectedOutput: '1', constraintQuote: null, autoDroppedReason,
});

describe('ca cần đọc kỹ trước khi duyệt và ghim một gói (mock-up v2)', () => {
  it('chỉ tính ca đang dùng: ca hệ thống đã bỏ không vào danh sách duyệt', () => {
    expect(runnableCases([c('a', 'co_ban'), c('b', 'bien', 'không trích được đề')]).map((x) => x.caseKey)).toEqual(['a']);
  });

  it('mọi ca nhóm bien và lon, cộng ca co_ban ĐẦU TIÊN, là ca cần đọc kỹ', () => {
    const cases = [c('cb1', 'co_ban'), c('cb2', 'co_ban'), c('b1', 'bien'), c('l1', 'lon'), c('x', 'khac')];
    expect([...casesToRead(cases)]).toEqual(['cb1', 'b1', 'l1']);
  });

  it('ca đã bỏ không bao giờ là ca cần đọc, kể cả khi là ca co_ban đầu tiên', () => {
    const cases = [c('cb1', 'co_ban', 'đã bỏ'), c('cb2', 'co_ban'), c('b1', 'bien', 'đã bỏ')];
    expect([...casesToRead(cases)]).toEqual(['cb2']);
  });

  it('gói không có nhóm co_ban, bien, lon nào thì không có ca nào bị đánh dấu', () => {
    expect(casesToRead([c('x', 'khac')]).size).toBe(0);
  });
});
