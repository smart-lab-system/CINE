import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/** `src/`, tính từ vị trí của chính file này — không phụ thuộc thư mục chạy vitest. */
const SRC = join(__dirname, '..') + sep;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * T-FLT-1 (spec §7): MỘT bộ lọc Năm học → Học kỳ dùng chung, lọc bằng KHOÁ. Ba bản cũ lọc theo chuỗi chữ và dựng danh sách lựa chọn từ các dòng đã tải
 * (hai cách viết một kỳ là hai mục; kỳ chưa có dòng nào thì không chọn được). Test này giữ cho không ai nhập lại bản cũ khi sửa các trang sau này.
 */
const FORBIDDEN: Array<[RegExp, string]> = [
  [/from\s+['"][^'"]*hooks\/useSemesterFilter['"]/, 'hooks/useSemesterFilter (bộ lọc theo chuỗi)'],
  [/from\s+['"][^'"]*layout\/semester-filter['"]/, 'components/layout/semester-filter (ô lọc theo chuỗi)'],
  [/\bsemesterOptions\s*\(/, 'semesterOptions (danh sách kỳ dựng từ các dòng đã tải)'],
];

describe('T-FLT-1 — không còn bộ lọc học kỳ theo chuỗi', () => {
  it('không file nguồn nào nhập bản lọc cũ hay dựng danh sách kỳ từ các dòng đã tải', () => {
    const offenders = sourceFiles(SRC).flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return FORBIDDEN.filter(([pattern]) => pattern.test(text)).map(([, what]) => `${file.slice(SRC.length)} — ${what}`);
    });
    expect(offenders).toEqual([]);
  });
});
