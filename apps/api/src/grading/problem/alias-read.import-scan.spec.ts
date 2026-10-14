import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §10.1: từ P1 một file ngoài resolveProblemConfig() không được ĐỌC hai cột bí danh của phiên.
 * Quét chuỗi SQL: `es.rubric_id`, `es.test_bundle_id`, `exam_session.rubric_id`, `exam_session.test_bundle_id`.
 * Ghi (UPDATE) được phép ở exam-session.service.ts (ghi kép, Task 3). Backfill M2 đọc cột bí danh theo thiết kế.
 */
const ROOT = join(__dirname, '..', '..'); // apps/api/src
// `s` là bí danh thường gặp của exam_session trong SQL (submission-overview); không có `s.` nào khác mang hai tên cột này.
const READ = /\b(es|exam_session|s)\.(rubric_id|test_bundle_id)\b/;
const ALLOWED = new Set([
  'grading/problem/resolve-problem-config.ts',
  'grading/problem/default-problem-backfill.ts', // M2: chép cột bí danh vào câu mặc định (migration helper)
  'exam-session/exam-session.service.ts', // ghi kép và tạo phiên
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'migrations') walk(p, out);
    } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

describe('P1a — không đọc cột bí danh ngoài resolver', () => {
  it('không file nào ngoài danh sách cho phép đọc es.rubric_id / es.test_bundle_id', () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
      if (ALLOWED.has(rel)) continue;
      if (READ.test(readFileSync(file, 'utf8'))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
