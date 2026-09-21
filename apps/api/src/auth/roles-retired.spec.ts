import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * T-ROLE-1 — hai vai trò đã rút không được sống sót ở bất kỳ route nào.
 *
 * Vì sao một bài kiểm tra TRÊN MÃ NGUỒN thay vì một e2e: `@Roles()` nhận
 * chuỗi, còn `AccountRole` giờ chỉ có hai giá trị — nên một route bỏ sót
 * `@Roles('department_admin')` VẪN BIÊN DỊCH ĐƯỢC, và vẫn chạy được, chỉ là
 * không ai vào được nữa. Nó hỏng trong im lặng, ở một chỗ không ai mở lại.
 * Một e2e chỉ bắt được route nào đó gọi tới; cái quét này bắt hết.
 *
 * Nó cũng bao cả các tệp không phải controller: một vai trò đã xoá xuất
 * hiện trong guard, decorator hay seed đều là cùng một loại rác.
 */
const ROOT = join(__dirname, '..');

/**
 * Chỉ tính các lần xuất hiện LÀ CHUỖI TRONG MÃ, sau khi đã gỡ chú thích.
 *
 * Nhắc tên hai vai trò trong một chú thích là việc nên làm — đó là cách
 * người đọc sau hiểu vì sao chúng biến mất. Thứ không được còn là
 * `@Roles('department_admin')` và các danh sách enum: những chỗ mã thật sự
 * cư xử theo chúng.
 */
const RETIRED_LITERAL = /(['"`])(department_admin|super_admin)\1/;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Migration nào cũng nhắc tới vai trò cũ, và PHẢI nhắc: chúng ghi lại
      // lịch sử lược đồ, gồm cả lượt chuyển vai trò ở ContractMasterData.
      return entry === 'migrations' ? [] : sourceFiles(full);
    }
    // Trừ chính tệp này ra: nó buộc phải mang hai cái tên để tìm chúng.
    return entry.endsWith('.ts') && entry !== 'roles-retired.spec.ts' ? [full] : [];
  });
}

describe('T-ROLE-1: vai trò đã rút', () => {
  it('không còn là giá trị chuỗi ở bất cứ đâu ngoài migration', () => {
    const offenders = sourceFiles(ROOT)
      .filter((file) => RETIRED_LITERAL.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => file.slice(ROOT.length + 1));

    expect(offenders).toEqual([]);
  });
});
