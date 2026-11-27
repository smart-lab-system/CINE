import { describe, expect, it } from 'vitest';
import { approveWarning } from './ide-version-approval';

describe('approveWarning', () => {
  it('phiên bản cụ thể chưa có file: hỏi lại trước khi duyệt', () => {
    expect(approveWarning({ version: '1.22.11', storageKey: null, artifactUploadedAt: null })).toMatch(/chưa có file \.vsix/);
    expect(approveWarning({ version: '1.22.11' })).not.toBeNull();
  });

  it('có file (khoá lưu trữ hoặc mốc tải lên): không hỏi', () => {
    expect(approveWarning({ version: '1.22.11', storageKey: 'ide/x.vsix' })).toBeNull();
    expect(approveWarning({ version: '1.22.11', artifactUploadedAt: '2026-11-01T00:00:00Z' })).toBeNull();
  });

  it('"mọi phiên bản (*)" không bao giờ có file theo thiết kế: không hỏi', () => {
    expect(approveWarning({ version: '*', storageKey: null, artifactUploadedAt: null })).toBeNull();
  });
});
