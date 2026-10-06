import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Ratchet: các bộ e2e dựng dữ liệu nền qua `test/helpers/seed.ts`, không bằng
 * SQL thô và không tự dựng thân `POST /exam-sessions`.
 *
 * Vì sao phải là guard chứ không chỉ là quy ước: SQL thô hỏng lúc CHẠY, sau
 * khi schema đổi, ở file nào đó mà không ai mở lại (xem spec 2026-10-04 §10
 * bước 1). Một ngày nào đó có người viết `INSERT INTO examcollect.class` vào
 * một spec mới vì "nhanh hơn" — guard này làm việc đó đỏ ngay hôm ấy.
 *
 * Hai danh sách dưới đây là NỢ ĐANG TRẢ, không phải ngoại lệ vĩnh viễn:
 *   - mỗi file chuyển sang helper phải bị xoá khỏi danh sách trong CÙNG commit;
 *   - một mục không còn vi phạm mà vẫn nằm trong danh sách làm test này đỏ
 *     ("mục dư"), để danh sách không bao giờ phình lại bằng cách im lặng.
 * Kết thúc plan A: `RAW_SEED_ALLOWLIST` rỗng; `SESSION_BODY_ALLOWLIST` còn đúng
 * ba file kiểm hành vi tạo phiên / chống trùng lịch / bản chụp: chúng dựng thân request bằng tay có chủ ý để kiểm cả đầu vào
 * sai (thiếu `roomId`, `roomId` rác…), nên ở lại danh sách vĩnh viễn.
 */
const TEST_ROOT = join(__dirname, '..', '..', 'test');
/** Chỗ duy nhất được phép chứa SQL dựng ba bảng này. */
const SEED_HELPER = 'helpers/seed.ts';

/**
 * SQL thô dựng lớp / enrollment / phiên thi. Khớp CẢ `examcollect.` lẫn
 * `${schema}.`: vài spec lấy tên schema từ `dataSource.options` rồi viết
 * `INSERT INTO ${schema}.class`, và một regex chỉ nhìn chữ `examcollect.` bỏ
 * sót đúng các file ấy (plan A đếm 35 file chính vì vậy).
 */
const RAW_SEED = /INSERT INTO (?:examcollect|\$\{schema\})\.(class|exam_session|enrollment)\b/;
/**
 * Một lời gọi `POST /exam-sessions` mà `.send(` ĐẦU TIÊN sau nó nhận một object
 * literal viết tay (`.send({`). Thân dựng bằng `sessionBody` thì là
 * `.send(await sessionBody(` nên không khớp. Phần `(?!\.send\()` buộc regex
 * dừng ở `.send(` đầu tiên: không có nó, một `.send({})` của request KHÁC nằm
 * trong 400 ký tự sau sẽ bị tính nhầm cho lời gọi này.
 *
 * Quét thân literal chứ không quét tên `roomName`/`semesterName`: test đã
 * chuyển vẫn truyền `roomName` cho `sessionBody` (nó cần làm sạch/khẳng định
 * theo phòng), nên tên đó không phân biệt được hai cách.
 */
const SESSION_POST_LITERAL_BODY =
  /\.post\(\s*['"`]\/exam-sessions['"`]\s*\)(?:(?!\.send\()[\s\S]){0,400}\.send\(\s*\{/;

export const RAW_SEED_ALLOWLIST = new Set<string>([]);

export const SESSION_BODY_ALLOWLIST = new Set<string>([
  'exam-schedule-conflict.e2e-spec.ts',
  'exam-session-snapshots.e2e-spec.ts',
  'exam-session.e2e-spec.ts',
]);

/** Ba file kiểm hành vi tạo phiên / chống trùng lịch / bản chụp, dựng thân tay có chủ ý — giá trị cuối của rule 2. */
export const PERMANENT_SESSION_BODY_FILES = [
  'exam-schedule-conflict.e2e-spec.ts',
  'exam-session-snapshots.e2e-spec.ts',
  'exam-session.e2e-spec.ts',
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function testFiles(): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(TEST_ROOT)) {
    if (entry.endsWith('.ts')) out.push(entry);
  }
  for (const entry of readdirSync(join(TEST_ROOT, 'helpers'))) {
    if (entry.endsWith('.ts')) out.push(`helpers/${entry}`);
  }
  return out.sort();
}

function offenders(pattern: RegExp): string[] {
  return testFiles().filter(
    (file) =>
      file !== SEED_HELPER &&
      pattern.test(stripComments(readFileSync(join(TEST_ROOT, file), 'utf8'))),
  );
}

describe('e2e seed hygiene (ratchet)', () => {
  it('không có file nào ngoài helper/seed.ts dùng SQL thô dựng lớp, enrollment, phiên thi — trừ nợ đã khai', () => {
    const found = offenders(RAW_SEED);
    const unexpected = found.filter((file) => !RAW_SEED_ALLOWLIST.has(file));
    expect(unexpected).toEqual([]);
  });

  it('RAW_SEED_ALLOWLIST không chứa mục đã sạch (xoá nó khỏi danh sách)', () => {
    const found = new Set(offenders(RAW_SEED));
    const stale = [...RAW_SEED_ALLOWLIST].filter((file) => !found.has(file));
    expect(stale).toEqual([]);
  });

  it('không có file nào ngoài helper tự viết object literal làm thân POST /exam-sessions — trừ nợ đã khai', () => {
    const found = offenders(SESSION_POST_LITERAL_BODY);
    const unexpected = found.filter((file) => !SESSION_BODY_ALLOWLIST.has(file));
    expect(unexpected).toEqual([]);
  });

  it('SESSION_BODY_ALLOWLIST không chứa mục đã sạch (xoá nó khỏi danh sách)', () => {
    const found = new Set(offenders(SESSION_POST_LITERAL_BODY));
    const stale = [...SESSION_BODY_ALLOWLIST].filter((file) => !found.has(file));
    expect(stale).toEqual([]);
  });

  it('danh sách rule 2 chỉ được phép co về đúng ba file kiểm hành vi tạo phiên/chống trùng lịch/bản chụp', () => {
    const extra = [...SESSION_BODY_ALLOWLIST].filter(
      (file) => !PERMANENT_SESSION_BODY_FILES.includes(file),
    );
    expect(extra).toEqual([]);
  });
});
