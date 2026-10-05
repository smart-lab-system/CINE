# Plan E1 — Import dữ liệu nền: bộ tính toán dùng chung và bốn route (server)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin nhập **học kỳ, phòng thi, Danh mục lớp danh nghĩa, lớp** từ một danh sách (file .xlsx đã được trình duyệt đọc thành các dòng chữ). Mỗi loại có `POST …/import` nhận `{ rows, dryRun, confirmSimilar? }`; **xem trước và ghi chạy cùng một hàm tính trên server**, nên người dùng thấy đúng điều lần ghi thật sẽ làm.

**Architecture:** Mỗi loại có một **bộ tính (planner) hàm thuần**: nhận các dòng chữ + trạng thái hiện có của DB, trả về từng dòng là `new | update | unchanged | error` kèm lý do/thay đổi/mục gần giống, và danh sách việc cần ghi. Một `runImport` dùng chung mở transaction, (khi ghi thật) lấy khoá tư vấn, gọi planner, rồi **từ chối nếu có dòng lỗi hoặc cần xác nhận "gần giống"**, ghi, và để lại **một** dòng `audit_log` cho cả lô. Bốn route mỏng nằm ở controller sẵn có của từng loại. Roster của giảng viên **không đụng tới** (spec §6.2 nguyên tắc 5).

**Tech Stack:** NestJS 10, TypeORM 0.3, Postgres 16 (`citext`, advisory lock), class-validator, jest (unit cho planner, e2e cho tích hợp).

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §4 (bốn route import), §6.1 (khoá nhận diện, cột), §6.2 (tám nguyên tắc — plan này làm 1–7; 8 thuộc plan E2), §6.3 (trần dòng), §4.2 (audit import), §11: T-IMP-2, T-IMP-3, T-IMP-6 (phần server), T-IMP-8, T-ADM-2, T-AUD-1 (phần import).

## Global Constraints

- **Bốn route, đều `@Roles('admin')`:** `POST /semesters/import`, `POST /rooms/import`, `POST /administrative-classes/import`, `POST /classes/import`. Thân: `{ rows: Row[], dryRun: boolean, confirmSimilar?: boolean }`. **`dryRun` là BẮT BUỘC** (không mặc định): một client lỗi quên cờ không được phép ghi. Trần dòng (spec §6.3): học kỳ **20**, phòng **500**, Danh mục lớp danh nghĩa **500**, lớp **200** — vượt là 400 cho cả yêu cầu.
- **Mọi ô đến server dạng CHỮ** (trình duyệt gửi `cell.text`), kèm `line` (số dòng như Excel hiện ra, do client tính; server **không tự đoán** số dòng). Việc hiểu số/ngày/học kỳ nằm ở **một** chỗ (`import-cells.ts`) và chỉ nhận dạng không mơ hồ: ngày `yyyy-mm-dd` hoặc `dd/mm/yyyy` (đọc là ngày-tháng-năm), học kỳ `HK1 2026-2027`.
- **Chỉ thêm và sửa, không bao giờ xoá** (nguyên tắc 1). **Chỉ sửa trường không phải khoá** (nguyên tắc 2): sức chứa phòng, ngày học kỳ, giảng viên của lớp. Danh mục lớp danh nghĩa **chỉ thêm** (đổi mã làm thủ công). **Ô trống không xoá giá trị đang có** (sức chứa để trống ≠ "bỏ sức chứa"). Dòng vắng khỏi file không bao giờ bị đụng tới.
- **File có dòng lỗi thì không ghi gì** (nguyên tắc 3): ghi thật mà có lỗi → `400 { error: 'IMPORT_HAS_ERRORS', message, preview }`. `dryRun` luôn trả `200` với lỗi nằm trong từng dòng.
- **Xem trước = ghi** (nguyên tắc 5): `runImport` gọi **cùng planner** cho cả hai chế độ; chế độ ghi tính lại **bên trong transaction, sau khi giữ khoá tư vấn** (hai import cùng loại không chạy song song). `dryRun` không ghi gì, kể cả audit.
- **"Gần giống"** (nguyên tắc 4) chỉ cho **phòng mới** và **mã lớp danh nghĩa mới**, so với mục có sẵn **và** với các dòng mới khác trong file, theo luật plan C (`near-duplicate.ts`). Ghi thật mà còn mục gần giống chưa xác nhận → `409 { error: 'NEAR_DUPLICATE', message, preview }`; gửi lại với `confirmSimilar: true` thì ghi. Phòng/mã khớp **khoá có sẵn** (không phân biệt hoa-thường) là dòng "có sẵn", không bao giờ là "gần giống".
- **Đổi tên phòng bằng file tạo một phòng MỚI** (không sửa phòng cũ): khoá là tên; hệ thống không biết đó là cùng một phòng nên chỉ cảnh báo (T-IMP-8).
- **Học kỳ không được chồng ngày** — trong file lẫn với dữ liệu có sẵn. Quy tắc **bảo thủ** để không bao giờ gây xung đột *tạm thời* ở ràng buộc `ex_semester_dates_overlap` (không hoãn được): khoảng ngày mới của một dòng bị so với **ngày HIỆN TẠI của mọi học kỳ có sẵn** (kể cả kỳ cũng đang được file dời đi) và với **ngày sau-nhập của mọi dòng khác trong file**. Hệ quả: một file dời hai kỳ chéo vào chỗ của nhau bị từ chối kèm gợi ý "nhập từng kỳ một".
- **Lớp:** học kỳ (theo nhãn), mã lớp danh nghĩa (trong Danh mục) và giảng viên (theo email, `role = teacher`, đang hoạt động) phải **đã tồn tại** — import lớp **không tạo gì khác ngoài lớp** (spec §2.2, T-ADM-2). Khoá lớp = (học kỳ, mã, nhóm); đổi giảng viên của lớp có sẵn đi qua **cùng một hàm** với nhập tay (`ClassService.applyTeacherChange`): `enrollment.home_teacher_id` đổi theo, phiên/ảnh chốt/bài nộp đã có **giữ** giảng viên cũ.
- **Audit (nguyên tắc 7):** mỗi lần import **được áp dụng** ghi **một** dòng: `action = <loại>.import`, `targetType` = loại, `targetId` = UUID mới sinh cho lô (cột `NOT NULL uuid`), `newValue = { targetLabel, added, updated, unchanged }` (lớp thêm `reassigned: [{ label, from, to }]`, tối đa 50 mục, kèm `reassignedTotal`). **Không** ghi dòng nào cho `dryRun`, cho yêu cầu bị từ chối (400/409), hay cho lần chạy không có gì để ghi (`added + updated = 0` → `applied: false`). Câu tiếng Việt của các hành động này thêm ở plan G.
- DB (ràng buộc duy nhất, EXCLUDE, trigger) vẫn là thẩm quyền cuối: planner chỉ để báo lỗi **đọc được, đúng số dòng**; một va chạm lọt qua planner (hai người ghi cùng lúc, ngoài import) làm cả lô rollback với `409` chung — không bao giờ ghi nửa chừng.
- Giữ nguyên mọi thứ khác: route nhập thủ công, roster của giảng viên, `ClassService.update` (chỉ đổi cách gọi một hàm dùng chung).
- Chạy e2e theo plan A (Docker `cine-*`, `.env.test`, `--runInBand`); dữ liệu chung toàn hệ dùng hậu tố ngẫu nhiên và năm học ≥ 2200 (plan C).

## Review Focus

1. **Xem trước nói một đằng, ghi làm một nẻo.** Hai đường tính riêng sẽ lệch nhau. → `runImport` gọi một planner; e2e đòi `rows` và `counts` của `dryRun` **bằng** của lần ghi thật (Task 5, T-IMP-3).
2. **Một dòng lỗi mà các dòng hợp lệ vẫn được ghi** (bộ nhập lớp cũ làm vậy). → e2e đếm dòng trước/sau một file có đúng một dòng lỗi giữa các dòng tốt (Task 5, 6).
3. **Import âm thầm xoá/xoá trắng.** Ô sức chứa trống xoá sức chứa; dòng vắng bị xoá. → unit + e2e khẳng định sức chứa còn nguyên và phòng vắng file còn nguyên (Task 2, 5).
4. **Cảnh báo "gần giống" nhầm trên dữ liệu thật, hoặc bỏ sót giữa hai dòng cùng file.** → bảng ca có `Phòng máy A1/B1`, `DHKTPM18ATT/CTT` và hai dòng mới giống nhau trong cùng file (Task 2).
5. **Dời ngày học kỳ gây xung đột tạm thời ở DB** dù bản xem trước nói ổn. → quy tắc bảo thủ + unit cho ca hai kỳ dời chéo (Task 3).
6. **Gửi lại cùng một file (bấm hai lần, mạng chập chờn).** → lần hai ra toàn `unchanged`, `applied: false`, **không** thêm dòng audit (Task 5, 6).
7. **Giảng viên đích là tài khoản admin hoặc đã bị vô hiệu hoá** (email gõ nhầm trúng người khác). → lỗi theo dòng, không tạo lớp mồ côi (Task 4, 6).
8. **Import lớp "tiện tay" tạo mã lớp danh nghĩa hay học kỳ thiếu.** → e2e đếm `administrative_class` và `semester` trước/sau (Task 6).

---

## File Structure

| File | Việc |
|---|---|
| `apps/api/src/course/import/import.types.ts` | **Mới.** Kiểu kết quả, `blankRow`/`errorRow`/`summarize`. |
| `apps/api/src/course/import/import-cells.ts` (+ `.spec.ts`) | **Mới.** `parseCellInt`, `parseCellDate`, `parseTermCell`, `parseSemesterCell`. |
| `apps/api/src/course/import/import-similar.ts` (+ `.spec.ts`) | **Mới.** `attachSimilar` (so với có sẵn và giữa các dòng mới). |
| `apps/api/src/course/import/plan-room-import.ts` (+ `.spec.ts`) | **Mới.** |
| `apps/api/src/course/import/plan-administrative-class-import.ts` (+ `.spec.ts`) | **Mới.** |
| `apps/api/src/course/import/plan-semester-import.ts` (+ `.spec.ts`) | **Mới.** |
| `apps/api/src/course/import/plan-class-import.ts` (+ `.spec.ts`) | **Mới.** |
| `apps/api/src/course/import/import-runner.ts` | **Mới.** `runImport`. |
| `apps/api/src/course/dto/import.dto.ts` | **Mới.** Bốn DTO thân yêu cầu + trần dòng. |
| `apps/api/src/course/master-data-import.service.ts` | **Mới.** Nạp trạng thái, gọi planner, ghi. |
| `apps/api/src/common/master-data-normalize.ts` (+ `.spec.ts`) | Thêm `normalizeGroupName`, `groupNameProblem`. |
| `apps/api/src/course/class.service.ts` | Dùng `normalizeGroupName` chung; thêm `applyTeacherChange`; `update` gọi nó. |
| `apps/api/src/course/{semester,room,administrative-class,class}.controller.ts`, `course.module.ts` | Mỗi controller thêm `POST import`; nối module. |
| `apps/api/test/master-data-import.e2e-spec.ts` | **Mới.** |
| `packages/shared/src/api/schema.d.ts` | Sinh lại. |

---

### Task 1: Kiểu kết quả, bộ đọc ô, so khớp "gần giống" theo lô, chuẩn hoá nhóm

**Files:**
- Create: `apps/api/src/course/import/import.types.ts`, `import-cells.ts`, `import-similar.ts`
- Modify: `apps/api/src/common/master-data-normalize.ts`
- Test: `apps/api/src/course/import/import-cells.spec.ts`, `import-similar.spec.ts`, `apps/api/src/common/master-data-normalize.spec.ts`

**Interfaces:**
- Consumes: `findNearDuplicates`, `NearDuplicateReason` (plan C `common/near-duplicate.ts`).
- Produces:

```ts
// import.types.ts
export type ImportRowStatus = 'new' | 'update' | 'unchanged' | 'error';
export class ImportChange { field: string; label: string; from: string | null; to: string | null }
export class ImportSimilar { id: string | null; name: string; reason: NearDuplicateReason; source: 'existing' | 'file'; line: number | null }
export class ImportRowResult { line: number; status: ImportRowStatus; label: string; changes: ImportChange[]; errors: string[]; similar: ImportSimilar[] }
export class ImportCounts { added: number; updated: number; unchanged: number; errors: number }
export class ImportResult { dryRun: boolean; applied: boolean; counts: ImportCounts; rows: ImportRowResult[]; needsSimilarConfirmation: boolean }
export interface ImportPlan<W> { rows: ImportRowResult[]; writes: W[] }
export function blankRow(line: number, label: string): ImportRowResult;
export function errorRow(line: number, label: string, errors: string[]): ImportRowResult;
export function summarize(rows: readonly ImportRowResult[]): ImportCounts;
export function needsSimilarConfirmation(rows: readonly ImportRowResult[]): boolean;
// import-cells.ts
export function parseCellInt(text: string): number | null;
export function parseCellDate(text: string): string | null;            // -> 'yyyy-mm-dd'
export function parseTermCell(text: string): number | null;            // '2' | 'HK2' -> 2
export function parseSemesterCell(text: string): { academicYearStart: number; term: number } | null;
export function shown(text: string): string;                            // '(trống)' | '"x"'
// import-similar.ts
export interface NewEntry { index: number; line: number; name: string }
export interface ExistingEntry { id: string; name: string }
export function attachSimilar(results: ImportRowResult[], news: readonly NewEntry[], existing: readonly ExistingEntry[]): void;
// master-data-normalize.ts (thêm)
export const GROUP_NAME_MAX = 50;
export function normalizeGroupName(raw: string | undefined): string;
export function groupNameProblem(name: string): string | null;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/api/src/course/import/import-cells.spec.ts`:

```ts
import {
  parseCellDate,
  parseCellInt,
  parseSemesterCell,
  parseTermCell,
  shown,
} from './import-cells';

describe('parseCellInt', () => {
  it.each([
    ['40', 40],
    [' 40 ', 40],
    ['40.0', 40], // ô số định dạng 2 chữ số thập phân
    ['007', 7],
  ])('đọc %j thành %d', (text, expected) => {
    expect(parseCellInt(text)).toBe(expected);
  });

  it.each(['', 'abc', '40.5', '-3', '1e3', '4 0', '1234567890'])('từ chối %j', (text) => {
    expect(parseCellInt(text)).toBeNull();
  });
});

describe('parseCellDate', () => {
  it('nhận yyyy-mm-dd', () => {
    expect(parseCellDate('2026-09-01')).toBe('2026-09-01');
    expect(parseCellDate(' 2026-09-01 ')).toBe('2026-09-01');
  });

  it('nhận dd/mm/yyyy (ngày-tháng-năm), kể cả không đệm số 0, và trả yyyy-mm-dd', () => {
    expect(parseCellDate('01/09/2026')).toBe('2026-09-01');
    expect(parseCellDate('1/9/2026')).toBe('2026-09-01');
    // Không đoán tháng-ngày-năm: 09/01 là 9 tháng 1.
    expect(parseCellDate('09/01/2026')).toBe('2026-01-09');
  });

  it('từ chối ngày không có thật', () => {
    expect(parseCellDate('2026-02-30')).toBeNull();
    expect(parseCellDate('31/02/2026')).toBeNull();
    expect(parseCellDate('2026-13-01')).toBeNull();
  });

  it('từ chối mọi dạng còn lại, kể cả chuỗi `Date.toString()` của exceljs', () => {
    expect(parseCellDate('')).toBeNull();
    expect(parseCellDate('2026/09/01')).toBeNull();
    expect(parseCellDate('1-9-2026')).toBeNull();
    expect(parseCellDate('46266')).toBeNull(); // số sê-ri Excel
    // Thứ mà `cell.text` của exceljs trả cho ô ngày chưa qua `readWorkbook` đã sửa (plan E2). Phải bị từ chối chứ không
    // bị đọc nhầm: bản xem trước sẽ nói rõ "không hiểu được" thay vì ghi một ngày lệch múi giờ.
    expect(parseCellDate('Tue Sep 01 2026 07:00:00 GMT+0700 (Indochina Time)')).toBeNull();
  });
});

describe('parseTermCell', () => {
  it.each([
    ['1', 1],
    ['2', 2],
    ['3', 3],
    ['HK2', 2],
    ['hk 3', 3],
  ])('đọc %j', (text, expected) => {
    expect(parseTermCell(text)).toBe(expected);
  });

  it.each(['', '0', '4', 'abc', '1.5'])('từ chối %j', (text) => {
    expect(parseTermCell(text)).toBeNull();
  });
});

describe('parseSemesterCell', () => {
  it.each([
    ['HK1 2026-2027', 2026, 1],
    ['hk2 2026-2027', 2026, 2],
    ['HK 3 2026-2027', 2026, 3],
    ['Học kỳ 1 2026-2027', 2026, 1],
    ['1 2026-2027', 2026, 1],
    ['HK1 2026–2027', 2026, 1], // dấu gạch dài
    ['HK1 2026 - 2027', 2026, 1],
  ])('đọc %j', (text, year, term) => {
    expect(parseSemesterCell(text)).toEqual({ academicYearStart: year, term });
  });

  it('chấp nhận chữ có dấu ở dạng tổ hợp (NFD) như Excel/Mac hay gửi', () => {
    const decomposed = 'Học kỳ 2 2026-2027'.normalize('NFD');
    expect(parseSemesterCell(decomposed)).toEqual({ academicYearStart: 2026, term: 2 });
  });

  it.each(['', 'HK4 2026-2027', 'HK1 2026-2028', 'HK1 2026', '2026-2027', 'HK1'])('từ chối %j', (text) => {
    expect(parseSemesterCell(text)).toBeNull();
  });
});

describe('shown', () => {
  it('hiện "(trống)" cho ô trống và đặt giá trị trong ngoặc kép', () => {
    expect(shown('')).toBe('(trống)');
    expect(shown('   ')).toBe('(trống)');
    expect(shown(' abc ')).toBe('"abc"');
  });
});
```

Create `apps/api/src/course/import/import-similar.spec.ts`:

```ts
import { attachSimilar, type NewEntry } from './import-similar';
import { blankRow, type ImportRowResult } from './import.types';

function rowsFor(entries: NewEntry[]): ImportRowResult[] {
  const results: ImportRowResult[] = [];
  for (const entry of entries) {
    results[entry.index] = { ...blankRow(entry.line, entry.name), status: 'new' };
  }
  return results;
}

describe('attachSimilar', () => {
  const existing = [
    { id: 'r1', name: 'Phòng máy A1' },
    { id: 'r2', name: 'Phòng máy B1' },
    { id: 'r3', name: 'Phòng H3.03' },
  ];

  it('mục mới gần giống mục có sẵn: ghi id, tên, lý do và nguồn', () => {
    const news = [{ index: 0, line: 2, name: 'Phong H303' }];
    const results = rowsFor(news);
    attachSimilar(results, news, existing);
    expect(results[0].similar).toEqual([
      { id: 'r3', name: 'Phòng H3.03', reason: 'normalized', source: 'existing', line: null },
    ]);
  });

  it('KHÔNG cảnh báo các cặp thật khác nhau: A1/B1 và mọi phòng khác tên (Review Focus 4)', () => {
    const news = [
      { index: 0, line: 2, name: 'Phòng máy C1' },
      { index: 1, line: 3, name: 'Phòng máy A2' },
    ];
    const results = rowsFor(news);
    attachSimilar(results, news, existing);
    expect(results[0].similar).toEqual([]);
    expect(results[1].similar).toEqual([]);
  });

  it('hai mục MỚI gần giống nhau trong cùng file: cả hai được đánh dấu, nguồn là file kèm số dòng', () => {
    const news = [
      { index: 0, line: 2, name: 'P.A101' },
      { index: 1, line: 3, name: 'P A101' },
    ];
    const results = rowsFor(news);
    attachSimilar(results, news, []);
    expect(results[0].similar).toEqual([
      { id: null, name: 'P A101', reason: 'normalized', source: 'file', line: 3 },
    ]);
    expect(results[1].similar).toEqual([
      { id: null, name: 'P.A101', reason: 'normalized', source: 'file', line: 2 },
    ]);
  });

  it('một mục có thể gần giống cả mục có sẵn lẫn mục trong file', () => {
    const news = [
      { index: 0, line: 2, name: 'Phong H303' },
      { index: 1, line: 3, name: 'Phòng H3-03' },
    ];
    const results = rowsFor(news);
    attachSimilar(results, news, existing);
    expect(results[0].similar.map((s) => [s.source, s.name])).toEqual([
      ['existing', 'Phòng H3.03'],
      ['file', 'Phòng H3-03'],
    ]);
  });

  it('mục không gần giống ai nhận mảng rỗng, không phải undefined', () => {
    const news = [{ index: 0, line: 2, name: 'Giảng đường lớn' }];
    const results = rowsFor(news);
    attachSimilar(results, news, existing);
    expect(results[0].similar).toEqual([]);
  });
});
```

Thêm vào cuối `apps/api/src/common/master-data-normalize.spec.ts` (import thêm `groupNameProblem, normalizeGroupName`):

```ts
describe('normalizeGroupName', () => {
  it('gộp khoảng trắng, cắt hai đầu, giữ nguyên hoa-thường', () => {
    expect(normalizeGroupName('  Nhóm   1 ')).toBe('Nhóm 1');
    expect(normalizeGroupName('nhóm 2')).toBe('nhóm 2');
  });

  it('không có nhóm là chuỗi rỗng', () => {
    expect(normalizeGroupName(undefined)).toBe('');
    expect(normalizeGroupName('   ')).toBe('');
  });
});

describe('groupNameProblem', () => {
  it('chấp nhận rỗng và đủ ngắn; từ chối quá 50 ký tự', () => {
    expect(groupNameProblem('')).toBeNull();
    expect(groupNameProblem('x'.repeat(50))).toBeNull();
    expect(groupNameProblem('x'.repeat(51))).toMatch(/50/);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/api && npx jest src/course/import src/common/master-data-normalize.spec.ts`
Expected: FAIL — không import được `import-cells`, `import-similar`, và hai hàm mới của `master-data-normalize`.

- [ ] **Step 3: Viết kiểu kết quả**

Create `apps/api/src/course/import/import.types.ts`:

```ts
import type { NearDuplicateReason } from '../../common/near-duplicate';

/**
 * Hình dạng kết quả của MỌI import dữ liệu nền (spec §6.2 nguyên tắc 5). Lớp (không phải interface) để bộ sinh OpenAPI
 * đọc được và client web có kiểu thật — cùng cách `RoomView`, `SemesterView` làm ở plan C.
 */
export type ImportRowStatus = 'new' | 'update' | 'unchanged' | 'error';

/** Một trường sẽ đổi — chỉ có ở dòng `update`: "Giảng viên: A → B" (spec §6.2 nguyên tắc 2, T-IMP-6). */
export class ImportChange {
  field!: string;
  /** Nhãn tiếng Việt của trường, để giao diện không phải dịch tên trường. */
  label!: string;
  from!: string | null;
  to!: string | null;
}

/** Một mục "gần giống" của một dòng MỚI (spec §6.2 nguyên tắc 4). */
export class ImportSimilar {
  /** Id của mục có sẵn; `null` khi mục kia là một dòng khác trong cùng file. */
  id!: string | null;
  name!: string;
  reason!: NearDuplicateReason;
  source!: 'existing' | 'file';
  /** Số dòng của mục kia khi `source = 'file'`. */
  line!: number | null;
}

export class ImportRowResult {
  /** Số dòng như Excel hiện ra, do client gửi lên. */
  line!: number;
  status!: ImportRowStatus;
  /** Tên đọc được của đối tượng: `Phòng H3.03`, `HK1 2026-2027`, `DHKTPM18A – Nhóm 1 · HK1 2026-2027`; `Dòng N` khi chưa đọc ra. */
  label!: string;
  changes!: ImportChange[];
  errors!: string[];
  similar!: ImportSimilar[];
}

export class ImportCounts {
  added!: number;
  updated!: number;
  unchanged!: number;
  errors!: number;
}

export class ImportResult {
  dryRun!: boolean;
  /** `true` chỉ khi lần gọi này ĐÃ ghi gì đó. `dryRun` và lần chạy không có gì để ghi đều `false`. */
  applied!: boolean;
  counts!: ImportCounts;
  rows!: ImportRowResult[];
  /** Có mục mới gần giống mục khác — ghi thật cần `confirmSimilar: true`. */
  needsSimilarConfirmation!: boolean;
}

/** Thứ MỘT planner trả về: từng dòng (cho xem trước) và việc cần ghi (cho `apply`). */
export interface ImportPlan<W> {
  rows: ImportRowResult[];
  writes: W[];
}

export function blankRow(line: number, label: string): ImportRowResult {
  return { line, status: 'unchanged', label, changes: [], errors: [], similar: [] };
}

export function errorRow(line: number, label: string, errors: string[]): ImportRowResult {
  return { line, status: 'error', label, changes: [], errors, similar: [] };
}

export function summarize(rows: readonly ImportRowResult[]): ImportCounts {
  const counts = { added: 0, updated: 0, unchanged: 0, errors: 0 };
  for (const row of rows) {
    if (row.status === 'new') counts.added += 1;
    else if (row.status === 'update') counts.updated += 1;
    else if (row.status === 'unchanged') counts.unchanged += 1;
    else counts.errors += 1;
  }
  return counts;
}

export function needsSimilarConfirmation(rows: readonly ImportRowResult[]): boolean {
  return rows.some((row) => row.status === 'new' && row.similar.length > 0);
}
```

- [ ] **Step 4: Viết bộ đọc ô và so khớp theo lô**

Create `apps/api/src/course/import/import-cells.ts`:

```ts
/**
 * Đọc ô của file nhập. Mọi ô đến server dạng CHỮ (trình duyệt đọc xlsx rồi gửi `cell.text`), nên việc hiểu số/ngày/học kỳ
 * nằm ở MỘT chỗ, và hiểu CHẶT: chỉ nhận dạng không mơ hồ (spec §6.3). `01/02/2026` đọc là ngày-tháng-năm (1 tháng 2) vì
 * đó là cách trường ghi; `2026-02-01` thì đã rõ. Không đoán tháng-ngày-năm — một lần đoán nhầm là một học kỳ lệch cả tháng
 * mà bản xem trước vẫn trông hợp lệ.
 */

/** Số nguyên không âm; chấp nhận đuôi `.0…` vì ô số định dạng hai chữ số thập phân hiện `40.00`. */
export function parseCellInt(text: string): number | null {
  const match = /^(\d{1,9})(?:\.0+)?$/.exec(text.trim());
  return match ? Number(match[1]) : null;
}

/** `yyyy-mm-dd` hoặc `dd/mm/yyyy` → `yyyy-mm-dd`; `null` nếu không phải ngày có thật. */
export function parseCellDate(text: string): string | null {
  const value = text.trim();
  let year: number;
  let month: number;
  let day: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (dmy) {
    [day, month, year] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  } else {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `1`, `2`, `3` hoặc `HK2`. */
export function parseTermCell(text: string): number | null {
  const match = /^(?:HK\s*)?([123])$/i.exec(text.trim());
  return match ? Number(match[1]) : null;
}

const SEMESTER_CELL = /^(?:HK|H\.K\.?|Học\s*kỳ)?\s*([123])\s+(\d{4})\s*[-–/]\s*(\d{4})$/i;

/**
 * Nhãn học kỳ như trường ghi: `HK1 2026-2027`, `Học kỳ 1 2026-2027`, hoặc chỉ `1 2026-2027`. Hai năm phải liền nhau.
 * Chuẩn hoá NFC trước vì Excel/Mac hay gửi chữ có dấu ở dạng tổ hợp, và `Học` ở dạng đó không khớp mẫu.
 */
export function parseSemesterCell(text: string): { academicYearStart: number; term: number } | null {
  const match = SEMESTER_CELL.exec(text.normalize('NFC').trim());
  if (!match) return null;
  const start = Number(match[2]);
  if (Number(match[3]) !== start + 1) return null;
  return { academicYearStart: start, term: Number(match[1]) };
}

/** Một ô trong câu báo lỗi: `(trống)` hoặc `"giá trị"`. */
export function shown(text: string): string {
  const value = text.trim();
  return value === '' ? '(trống)' : `"${value}"`;
}
```

Create `apps/api/src/course/import/import-similar.ts`:

```ts
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
```

Thêm vào cuối `apps/api/src/common/master-data-normalize.ts`:

```ts
/** Tên nhóm (`Nhóm 1`): tối đa 50 ký tự; rỗng nghĩa là không tách nhóm. Khớp `@Length(0, 50)` ở DTO lớp. */
export const GROUP_NAME_MAX = 50;

export function normalizeGroupName(raw: string | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim();
}

export function groupNameProblem(name: string): string | null {
  return name.length > GROUP_NAME_MAX ? `Tên nhóm tối đa ${GROUP_NAME_MAX} ký tự.` : null;
}
```

- [ ] **Step 5: Chạy để thấy xanh**

Run: `cd apps/api && npx jest src/course/import src/common/master-data-normalize.spec.ts`
Expected: PASS. Hai ca cần để ý: `'HK1 2026'` bị từ chối vì thiếu năm thứ hai; ca NFD của `parseSemesterCell` chỉ xanh nhờ `normalize('NFC')`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/course/import apps/api/src/common/master-data-normalize.ts apps/api/src/common/master-data-normalize.spec.ts
git commit -m "feat(master-data): kiểu kết quả import, bộ đọc ô chữ, so khớp gần giống theo lô"
```

---

### Task 2: Planner phòng thi và Danh mục lớp danh nghĩa

**Files:**
- Create: `apps/api/src/course/import/plan-room-import.ts`, `plan-administrative-class-import.ts`
- Test: `apps/api/src/course/import/plan-room-import.spec.ts`, `plan-administrative-class-import.spec.ts`

**Interfaces:**
- Consumes: `normalizeRoomName`, `roomNameProblem`, `normalizeAdministrativeCode`, `administrativeCodeProblem`, `parseCellInt`, `shown`, `attachSimilar`, `blankRow`, `errorRow`.
- Produces:

```ts
// plan-room-import.ts
export interface RoomImportRow { line: number; name: string; capacity: string }
export interface ExistingRoom { id: string; name: string; capacity: number | null }
export type RoomWrite = { kind: 'create'; name: string; capacity: number | null } | { kind: 'update'; id: string; capacity: number };
export function planRoomImport(rows: readonly RoomImportRow[], existing: readonly ExistingRoom[]): ImportPlan<RoomWrite>;
// plan-administrative-class-import.ts
export interface AdministrativeClassImportRow { line: number; code: string }
export interface ExistingAdministrativeClass { id: string; code: string }
export type AdministrativeClassWrite = { code: string };
export function planAdministrativeClassImport(rows: readonly AdministrativeClassImportRow[], existing: readonly ExistingAdministrativeClass[]): ImportPlan<AdministrativeClassWrite>;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/api/src/course/import/plan-room-import.spec.ts`:

```ts
import { planRoomImport, type ExistingRoom } from './plan-room-import';

const existing: ExistingRoom[] = [
  { id: 'r1', name: 'Phòng máy A1', capacity: 40 },
  { id: 'r2', name: 'Phòng máy B1', capacity: null },
  { id: 'r3', name: 'Phòng H3.03', capacity: 30 },
];
const row = (line: number, name: string, capacity = '') => ({ line, name, capacity });

describe('planRoomImport', () => {
  it('phòng chưa có là "new": tên được chuẩn hoá, sức chứa được đọc', () => {
    const plan = planRoomImport([row(2, '  Phòng   Mới  ', '50')], existing);
    expect(plan.rows).toEqual([
      { line: 2, status: 'new', label: 'Phòng Mới', changes: [], errors: [], similar: [] },
    ]);
    expect(plan.writes).toEqual([{ kind: 'create', name: 'Phòng Mới', capacity: 50 }]);
  });

  it('sức chứa để trống ở phòng mới là null, không phải lỗi', () => {
    const plan = planRoomImport([row(2, 'Phòng Mới')], existing);
    expect(plan.writes).toEqual([{ kind: 'create', name: 'Phòng Mới', capacity: null }]);
  });

  it('khoá là TÊN không phân biệt hoa-thường: dòng khớp phòng có sẵn không đổi tên (nguyên tắc 2)', () => {
    const plan = planRoomImport([row(2, 'PHÒNG MÁY A1', '40')], existing);
    expect(plan.rows[0]).toMatchObject({ status: 'unchanged', label: 'Phòng máy A1' }); // tên đang LƯU
    expect(plan.writes).toEqual([]);
  });

  it('sức chứa khác: "update" kèm từ → đến, và chỉ sức chứa được ghi', () => {
    const plan = planRoomImport([row(2, 'Phòng máy A1', '45')], existing);
    expect(plan.rows[0]).toMatchObject({
      status: 'update',
      changes: [{ field: 'capacity', label: 'Sức chứa', from: '40', to: '45' }],
    });
    expect(plan.writes).toEqual([{ kind: 'update', id: 'r1', capacity: 45 }]);
  });

  it('phòng chưa có sức chứa nhận sức chứa từ file (từ null)', () => {
    const plan = planRoomImport([row(2, 'Phòng máy B1', '60')], existing);
    expect(plan.rows[0].changes).toEqual([{ field: 'capacity', label: 'Sức chứa', from: null, to: '60' }]);
  });

  it('ô sức chứa TRỐNG không xoá sức chứa đang có (Review Focus 3)', () => {
    const plan = planRoomImport([row(2, 'Phòng máy A1', '')], existing);
    expect(plan.rows[0].status).toBe('unchanged');
    expect(plan.writes).toEqual([]);
  });

  it('phòng có sẵn mà file không nhắc tới không bao giờ có dòng nào (không xoá)', () => {
    const plan = planRoomImport([row(2, 'Phòng máy A1', '40')], existing);
    expect(plan.rows).toHaveLength(1);
    expect(plan.writes).toEqual([]);
  });

  it.each([
    [row(2, ''), /để trống/i],
    [row(3, 'x'.repeat(101)), /100/],
    [row(4, 'Phòng ok1', '0'), /sức chứa/i],
    [row(5, 'Phòng ok2', '1001'), /sức chứa/i],
    [row(6, 'Phòng ok3', 'abc'), /sức chứa/i],
    [row(7, 'Phòng ok4', '40.5'), /sức chứa/i],
  ])('dòng lỗi: %j', (input, pattern) => {
    const plan = planRoomImport([input], existing);
    expect(plan.rows[0].status).toBe('error');
    expect(plan.rows[0].errors.join(' ')).toMatch(pattern);
    expect(plan.rows[0].line).toBe(input.line);
  });

  it('dòng lỗi mang nhãn "Dòng N" khi chưa đọc ra tên', () => {
    expect(planRoomImport([row(9, '')], existing).rows[0].label).toBe('Dòng 9');
  });

  it('một dòng lỗi gom MỌI lỗi của nó thay vì dừng ở lỗi đầu', () => {
    const plan = planRoomImport([row(2, '', 'abc')], existing);
    expect(plan.rows[0].errors).toHaveLength(2);
  });

  it('trùng trong file (không phân biệt hoa-thường): dòng sau là lỗi nêu số dòng đầu', () => {
    const plan = planRoomImport([row(2, 'Phòng Z9'), row(3, 'PHÒNG z9')], existing);
    expect(plan.rows.map((r) => r.status)).toEqual(['new', 'error']);
    expect(plan.rows[1].errors[0]).toMatch(/dòng 2/);
    expect(plan.writes).toHaveLength(1);
  });

  it('phòng mới gần giống phòng có sẵn: similar nêu id, tên, lý do (T-IMP-8)', () => {
    const plan = planRoomImport([row(2, 'Phong H303')], existing);
    expect(plan.rows[0].status).toBe('new');
    expect(plan.rows[0].similar).toEqual([
      { id: 'r3', name: 'Phòng H3.03', reason: 'normalized', source: 'existing', line: null },
    ]);
  });

  it('KHÔNG cảnh báo nhầm trên các phòng thật khác nhau (Review Focus 4)', () => {
    const plan = planRoomImport([row(2, 'Phòng máy C1'), row(3, 'Phòng máy A2')], existing);
    expect(plan.rows.map((r) => r.similar)).toEqual([[], []]);
  });

  it('hai dòng MỚI giống nhau trong cùng file đều được đánh dấu', () => {
    const plan = planRoomImport([row(2, 'P.A101'), row(3, 'P A101')], []);
    expect(plan.rows[0].similar).toEqual([{ id: null, name: 'P A101', reason: 'normalized', source: 'file', line: 3 }]);
    expect(plan.rows[1].similar).toEqual([{ id: null, name: 'P.A101', reason: 'normalized', source: 'file', line: 2 }]);
  });

  it('dòng lỗi không tham gia so sánh gần giống', () => {
    const plan = planRoomImport([row(2, 'P.A101', 'abc'), row(3, 'P A101')], []);
    expect(plan.rows[0].status).toBe('error');
    expect(plan.rows[1].similar).toEqual([]);
  });

  it('dòng có sẵn không bao giờ bị đánh dấu gần giống, dù giống một phòng khác', () => {
    const plan = planRoomImport([row(2, 'Phòng H3.03', '30')], existing);
    expect(plan.rows[0]).toMatchObject({ status: 'unchanged', similar: [] });
  });
});
```

Create `apps/api/src/course/import/plan-administrative-class-import.spec.ts`:

```ts
import { planAdministrativeClassImport } from './plan-administrative-class-import';

const existing = [
  { id: 'a1', code: 'DHKTPM18ATT' },
  { id: 'a2', code: 'DHKTPM18CTT' },
];
const row = (line: number, code: string) => ({ line, code });

describe('planAdministrativeClassImport', () => {
  it('mã mới được viết hoa và cắt khoảng trắng; ghi create', () => {
    const plan = planAdministrativeClassImport([row(2, ' dhktpm19a ')], existing);
    expect(plan.rows[0]).toMatchObject({ status: 'new', label: 'DHKTPM19A', similar: [] });
    expect(plan.writes).toEqual([{ code: 'DHKTPM19A' }]);
  });

  it('mã đã có (không phân biệt hoa-thường) là "unchanged", không ghi gì, KHÔNG sửa (chỉ thêm)', () => {
    const plan = planAdministrativeClassImport([row(2, 'dhktpm18att')], existing);
    expect(plan.rows[0]).toMatchObject({ status: 'unchanged', label: 'DHKTPM18ATT' });
    expect(plan.writes).toEqual([]);
  });

  it('KHÔNG cảnh báo cặp thật anh em ATT/CTT (Review Focus 4)', () => {
    const plan = planAdministrativeClassImport([row(2, 'DHKTPM18BTT')], existing);
    expect(plan.rows[0].similar).toEqual([]);
  });

  it('cảnh báo mã mới thừa một ký tự so với mã có sẵn', () => {
    const plan = planAdministrativeClassImport([row(2, 'DHKTPM18ATTT')], existing);
    expect(plan.rows[0].similar).toEqual([
      { id: 'a1', name: 'DHKTPM18ATT', reason: 'insert_delete', source: 'existing', line: null },
    ]);
  });

  it('cảnh báo hai ký tự liền kề đổi chỗ', () => {
    const plan = planAdministrativeClassImport([row(2, 'DHKPTM18ATT')], existing);
    expect(plan.rows[0].similar[0]).toMatchObject({ id: 'a1', reason: 'swap' });
  });

  it.each([
    [row(2, ''), /3–30/],
    [row(3, 'AB'), /3–30/],
    [row(4, 'DHK-TPM'), /chữ và số/],
    [row(5, 'DHK TPM18'), /chữ và số/],
  ])('mã không hợp lệ: %j', (input, pattern) => {
    const plan = planAdministrativeClassImport([input], existing);
    expect(plan.rows[0].status).toBe('error');
    expect(plan.rows[0].errors[0]).toMatch(pattern);
  });

  it('mã trùng trong file (khác hoa-thường): dòng sau là lỗi nêu số dòng đầu', () => {
    const plan = planAdministrativeClassImport([row(2, 'abc123'), row(3, 'ABC123')], existing);
    expect(plan.rows.map((r) => r.status)).toEqual(['new', 'error']);
    expect(plan.rows[1].errors[0]).toMatch(/dòng 2/);
  });

  it('hai mã MỚI gần giống nhau trong cùng file đều bị đánh dấu', () => {
    const plan = planAdministrativeClassImport([row(2, 'DHKTPM19A'), row(3, 'DHKTPM19AA')], []);
    expect(plan.rows[0].similar).toEqual([
      { id: null, name: 'DHKTPM19AA', reason: 'insert_delete', source: 'file', line: 3 },
    ]);
    expect(plan.rows[1].similar).toEqual([
      { id: null, name: 'DHKTPM19A', reason: 'insert_delete', source: 'file', line: 2 },
    ]);
  });

  it('mã có sẵn mà file không nhắc tới không có dòng nào (không xoá)', () => {
    const plan = planAdministrativeClassImport([row(2, 'DHKTPM19A')], existing);
    expect(plan.rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/api && npx jest src/course/import/plan-room-import.spec.ts src/course/import/plan-administrative-class-import.spec.ts`
Expected: FAIL — không import được hai planner.

- [ ] **Step 3: Viết planner phòng**

Create `apps/api/src/course/import/plan-room-import.ts`:

```ts
import { normalizeRoomName, roomNameProblem } from '../../common/master-data-normalize';
import { parseCellInt, shown } from './import-cells';
import { attachSimilar, type NewEntry } from './import-similar';
import { blankRow, errorRow, type ImportPlan, type ImportRowResult } from './import.types';

export interface RoomImportRow {
  line: number;
  name: string;
  /** Chữ của ô; rỗng = không nói gì về sức chứa. */
  capacity: string;
}

export interface ExistingRoom {
  id: string;
  name: string;
  capacity: number | null;
}

export type RoomWrite =
  | { kind: 'create'; name: string; capacity: number | null }
  | { kind: 'update'; id: string; capacity: number };

/** Khớp `ck_room_capacity` ở DB (plan C). */
const CAPACITY_MIN = 1;
const CAPACITY_MAX = 1000;

/**
 * Hàm THUẦN: dòng chữ + các phòng có sẵn → kết quả từng dòng và việc cần ghi. Không chạm DB, nên xem trước và ghi thật gọi
 * cùng một hàm (spec §6.2 nguyên tắc 5) và test được hết các ca mà không cần dựng gì.
 *
 * Khoá là TÊN (so không phân biệt hoa-thường, như `citext` ở DB). Chỉ SỬA sức chứa (nguyên tắc 2): ô sức chứa trống không
 * xoá sức chứa đang có, và đổi tên làm thủ công — một tên khác trong file là một phòng MỚI (T-IMP-8).
 *
 * `toLowerCase()` của JS và `lower()` của Postgres có thể khác nhau ở locale lạ; nếu lệch, DB (khoá duy nhất citext) vẫn là
 * thẩm quyền cuối và cả lô rollback — không bao giờ ghi nửa chừng.
 */
export function planRoomImport(
  rows: readonly RoomImportRow[],
  existing: readonly ExistingRoom[],
): ImportPlan<RoomWrite> {
  const byKey = new Map(existing.map((room) => [room.name.toLowerCase(), room]));
  const firstLineOfKey = new Map<string, number>();
  const results: ImportRowResult[] = [];
  const writes: RoomWrite[] = [];
  const newEntries: NewEntry[] = [];

  rows.forEach((row) => {
    const name = normalizeRoomName(row.name);
    const problems: string[] = [];

    const nameProblem = roomNameProblem(name);
    if (nameProblem) problems.push(nameProblem);

    let capacity: number | null = null;
    if (row.capacity.trim() !== '') {
      const parsed = parseCellInt(row.capacity);
      if (parsed === null || parsed < CAPACITY_MIN || parsed > CAPACITY_MAX) {
        problems.push(
          `Sức chứa ${shown(row.capacity)} không hợp lệ, cần số nguyên từ ${CAPACITY_MIN} đến ${CAPACITY_MAX} (hoặc để trống).`,
        );
      } else {
        capacity = parsed;
      }
    }

    if (!nameProblem) {
      const key = name.toLowerCase();
      const first = firstLineOfKey.get(key);
      if (first !== undefined) {
        problems.push(`Trùng với dòng ${first}: phòng "${name}" đã xuất hiện trong file.`);
      } else {
        firstLineOfKey.set(key, row.line);
      }
    }

    if (problems.length > 0) {
      results.push(errorRow(row.line, name === '' ? `Dòng ${row.line}` : name, problems));
      return;
    }

    const current = byKey.get(name.toLowerCase());
    if (!current) {
      results.push({ ...blankRow(row.line, name), status: 'new' });
      writes.push({ kind: 'create', name, capacity });
      newEntries.push({ index: results.length - 1, line: row.line, name });
      return;
    }

    const result = blankRow(row.line, current.name);
    if (capacity !== null && capacity !== current.capacity) {
      result.status = 'update';
      result.changes.push({
        field: 'capacity',
        label: 'Sức chứa',
        from: current.capacity === null ? null : String(current.capacity),
        to: String(capacity),
      });
      writes.push({ kind: 'update', id: current.id, capacity });
    }
    results.push(result);
  });

  attachSimilar(
    results,
    newEntries,
    existing.map((room) => ({ id: room.id, name: room.name })),
  );
  return { rows: results, writes };
}
```

- [ ] **Step 4: Viết planner Danh mục lớp danh nghĩa**

Create `apps/api/src/course/import/plan-administrative-class-import.ts`:

```ts
import {
  administrativeCodeProblem,
  normalizeAdministrativeCode,
} from '../../common/master-data-normalize';
import { attachSimilar, type NewEntry } from './import-similar';
import { blankRow, errorRow, type ImportPlan, type ImportRowResult } from './import.types';

export interface AdministrativeClassImportRow {
  line: number;
  code: string;
}

export interface ExistingAdministrativeClass {
  id: string;
  code: string;
}

export type AdministrativeClassWrite = { code: string };

/**
 * Danh mục lớp danh nghĩa: một cột, CHỈ THÊM (spec §6.1) — không sửa, không xoá bằng file. Mã đã có là "unchanged";
 * mã mới được so "gần giống" với mã có sẵn và với các mã mới khác trong file.
 *
 * Mã đã viết hoa ở tầng này (`normalizeAdministrativeCode`), nên so khoá bằng chuỗi thẳng là đủ.
 */
export function planAdministrativeClassImport(
  rows: readonly AdministrativeClassImportRow[],
  existing: readonly ExistingAdministrativeClass[],
): ImportPlan<AdministrativeClassWrite> {
  const known = new Set(existing.map((entry) => entry.code));
  const firstLineOfCode = new Map<string, number>();
  const results: ImportRowResult[] = [];
  const writes: AdministrativeClassWrite[] = [];
  const newEntries: NewEntry[] = [];

  rows.forEach((row) => {
    const code = normalizeAdministrativeCode(row.code);
    const problem = administrativeCodeProblem(code);
    if (problem) {
      results.push(errorRow(row.line, code === '' ? `Dòng ${row.line}` : code, [problem]));
      return;
    }

    const first = firstLineOfCode.get(code);
    if (first !== undefined) {
      results.push(errorRow(row.line, code, [`Trùng với dòng ${first}: mã ${code} đã xuất hiện trong file.`]));
      return;
    }
    firstLineOfCode.set(code, row.line);

    if (known.has(code)) {
      results.push(blankRow(row.line, code));
      return;
    }

    results.push({ ...blankRow(row.line, code), status: 'new' });
    writes.push({ code });
    newEntries.push({ index: results.length - 1, line: row.line, name: code });
  });

  attachSimilar(
    results,
    newEntries,
    existing.map((entry) => ({ id: entry.id, name: entry.code })),
  );
  return { rows: results, writes };
}
```

Một chi tiết: `known` chứa mã đúng như DB lưu (đã HOA nhờ `CHECK` + chuẩn hoá lúc ghi), nên `known.has(code)` so đúng. Mã có sẵn cũ không HOA (không thể, do `CHECK`) sẽ không khớp — và DB chặn ngay từ gốc.

- [ ] **Step 5: Chạy để thấy xanh**

Run: `cd apps/api && npx jest src/course/import`
Expected: PASS (toàn bộ unit của Task 1 và 2).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/course/import
git commit -m "feat(master-data): planner import phòng thi và Danh mục lớp danh nghĩa (hàm thuần)"
```

---

### Task 3: Planner học kỳ

**Files:**
- Create: `apps/api/src/course/import/plan-semester-import.ts`
- Test: `apps/api/src/course/import/plan-semester-import.spec.ts`

**Interfaces:**
- Consumes: `semesterProblems`, `SemesterInput` (plan C `course/semester.rules.ts`), `semesterLabel`, `formatDmy`, `parseCellInt`, `parseCellDate`, `parseTermCell`, `shown`.
- Produces:

```ts
export interface SemesterImportRow { line: number; academicYear: string; term: string; startDate: string; endDate: string }
export interface ExistingSemester { id: string; academicYearStart: number; term: number; startDate: string; endDate: string }
export type SemesterWrite =
  | { kind: 'create'; academicYearStart: number; term: number; startDate: string; endDate: string }
  | { kind: 'update'; id: string; startDate: string; endDate: string };
export function planSemesterImport(rows: readonly SemesterImportRow[], existing: readonly ExistingSemester[]): ImportPlan<SemesterWrite>;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/api/src/course/import/plan-semester-import.spec.ts`:

```ts
import { planSemesterImport, type ExistingSemester } from './plan-semester-import';

const existing: ExistingSemester[] = [
  { id: 's1', academicYearStart: 2026, term: 1, startDate: '2026-09-01', endDate: '2027-01-31' },
  { id: 's2', academicYearStart: 2026, term: 2, startDate: '2027-02-01', endDate: '2027-05-31' },
];
const row = (line: number, academicYear: string, term: string, startDate: string, endDate: string) => ({
  line,
  academicYear,
  term,
  startDate,
  endDate,
});

describe('planSemesterImport', () => {
  it('học kỳ mới liền sau kỳ cuối: "new", nhãn đọc được, ghi create', () => {
    const plan = planSemesterImport([row(2, '2026', '3', '2027-06-01', '2027-08-31')], existing);
    expect(plan.rows[0]).toMatchObject({ line: 2, status: 'new', label: 'HK3 2026-2027', errors: [] });
    expect(plan.writes).toEqual([
      { kind: 'create', academicYearStart: 2026, term: 3, startDate: '2027-06-01', endDate: '2027-08-31' },
    ]);
  });

  it('nhận ngày dd/mm/yyyy và "HK2" ở cột kỳ; ghi ra yyyy-mm-dd', () => {
    const plan = planSemesterImport([row(2, '2026', 'HK3', '01/06/2027', '31/08/2027')], existing);
    expect(plan.writes).toEqual([
      { kind: 'create', academicYearStart: 2026, term: 3, startDate: '2027-06-01', endDate: '2027-08-31' },
    ]);
  });

  it('cùng khoá, cùng ngày: "unchanged"', () => {
    const plan = planSemesterImport([row(2, '2026', '1', '2026-09-01', '2027-01-31')], existing);
    expect(plan.rows[0].status).toBe('unchanged');
    expect(plan.writes).toEqual([]);
  });

  it('cùng khoá, ngày kết thúc khác: "update" kèm từ → đến (dd/mm/yyyy), chỉ ngày được ghi', () => {
    const plan = planSemesterImport([row(2, '2026', '2', '2027-02-01', '2027-06-15')], existing);
    expect(plan.rows[0]).toMatchObject({
      status: 'update',
      changes: [{ field: 'endDate', label: 'Ngày kết thúc', from: '31/05/2027', to: '15/06/2027' }],
    });
    expect(plan.writes).toEqual([{ kind: 'update', id: 's2', startDate: '2027-02-01', endDate: '2027-06-15' }]);
  });

  it('đổi cả hai ngày cho ra hai thay đổi', () => {
    const plan = planSemesterImport([row(2, '2026', '2', '2027-02-05', '2027-06-15')], existing);
    expect(plan.rows[0].changes.map((c) => c.field)).toEqual(['startDate', 'endDate']);
  });

  it('kỳ có sẵn mà file không nhắc tới không có dòng nào (không xoá)', () => {
    const plan = planSemesterImport([row(2, '2026', '3', '2027-06-01', '2027-08-31')], existing);
    expect(plan.rows).toHaveLength(1);
  });

  describe('chồng ngày', () => {
    it('chồng với kỳ có sẵn: lỗi nêu nhãn và khoảng ngày của kỳ đó', () => {
      const plan = planSemesterImport([row(2, '2026', '3', '2027-05-15', '2027-08-31')], existing);
      expect(plan.rows[0].status).toBe('error');
      expect(plan.rows[0].errors[0]).toMatch(/HK2 2026-2027 \(01\/02\/2027–31\/05\/2027\)/);
      expect(plan.writes).toEqual([]);
    });

    it('khoảng ngày là ĐÓNG ở hai đầu: trùng đúng một ngày cũng là chồng', () => {
      const plan = planSemesterImport([row(2, '2026', '3', '2027-05-31', '2027-08-31')], existing);
      expect(plan.rows[0].status).toBe('error');
    });

    it('hai dòng trong file chồng nhau: cả hai lỗi, nêu số dòng của dòng kia', () => {
      const plan = planSemesterImport(
        [row(2, '2026', '3', '2027-06-01', '2027-08-31'), row(3, '2027', '1', '2027-08-15', '2028-01-31')],
        existing,
      );
      expect(plan.rows.map((r) => r.status)).toEqual(['error', 'error']);
      expect(plan.rows[0].errors[0]).toMatch(/dòng 3/);
      expect(plan.rows[1].errors[0]).toMatch(/dòng 2/);
    });

    it('dời hai kỳ CHÉO vào chỗ của nhau: dòng đi vào chỗ cũ của kỳ kia bị từ chối kèm gợi ý (Review Focus 5)', () => {
      // s1 dời vào đúng khoảng CŨ của s2, còn s2 dời đi chỗ khác. Quy tắc bảo thủ so với ngày HIỆN TẠI của s2 nên dòng 2 bị
      // chặn — nếu không, `UPDATE` s1 chạy trước s2 sẽ chồng NGAY LÚC ĐÓ ở ràng buộc EXCLUDE không hoãn được.
      const plan = planSemesterImport(
        [row(2, '2026', '1', '2027-02-01', '2027-05-31'), row(3, '2026', '2', '2027-09-01', '2028-01-31')],
        existing,
      );
      expect(plan.rows.map((r) => r.status)).toEqual(['error', 'update']);
      expect(plan.rows[0].errors[0]).toMatch(/từng kỳ một/);
      expect(plan.writes).toEqual([{ kind: 'update', id: 's2', startDate: '2027-09-01', endDate: '2028-01-31' }]);
    });

    it('kéo dài một kỳ sang chỗ trống thì được', () => {
      const plan = planSemesterImport([row(2, '2026', '1', '2026-08-15', '2027-01-31')], existing);
      expect(plan.rows[0].status).toBe('update');
    });
  });

  describe('lỗi từng dòng', () => {
    it('gom MỌI lỗi đọc ô của một dòng', () => {
      const plan = planSemesterImport([row(2, 'abc', '4', 'x', '')], existing);
      expect(plan.rows[0].status).toBe('error');
      expect(plan.rows[0].errors).toHaveLength(4);
      expect(plan.rows[0].label).toBe('Dòng 2');
    });

    it('chuỗi `Date.toString()` của exceljs bị từ chối kèm hướng dẫn định dạng', () => {
      const plan = planSemesterImport(
        [row(2, '2026', '3', 'Tue Jun 01 2027 07:00:00 GMT+0700 (Indochina Time)', '2027-08-31')],
        existing,
      );
      expect(plan.rows[0].errors[0]).toMatch(/yyyy-mm-dd hoặc dd\/mm\/yyyy/);
    });

    it('ngày kết thúc trước ngày bắt đầu: dùng đúng câu của luật dùng chung', () => {
      const plan = planSemesterImport([row(2, '2026', '3', '2027-08-31', '2027-06-01')], existing);
      expect(plan.rows[0].errors).toEqual([expect.stringMatching(/không được trước/)]);
    });

    it('năm học ngoài 2000–2999: lỗi của luật dùng chung', () => {
      const plan = planSemesterImport([row(2, '1999', '1', '1999-09-01', '2000-01-31')], existing);
      expect(plan.rows[0].errors[0]).toMatch(/2000/);
    });

    it('trùng khoá trong file: dòng sau là lỗi nêu số dòng đầu', () => {
      const plan = planSemesterImport(
        [row(2, '2026', '3', '2027-06-01', '2027-08-31'), row(3, '2026', '3', '2027-06-02', '2027-08-30')],
        existing,
      );
      expect(plan.rows.map((r) => r.status)).toEqual(['new', 'error']);
      expect(plan.rows[1].errors[0]).toMatch(/dòng 2/);
    });
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/api && npx jest src/course/import/plan-semester-import.spec.ts`
Expected: FAIL — không import được `plan-semester-import`.

- [ ] **Step 3: Viết planner**

Create `apps/api/src/course/import/plan-semester-import.ts`:

```ts
import { formatDmy, semesterLabel } from '../../common/semester-label';
import { semesterProblems, type SemesterInput } from '../semester.rules';
import { parseCellDate, parseCellInt, parseTermCell, shown } from './import-cells';
import { blankRow, errorRow, type ImportPlan, type ImportRowResult } from './import.types';

export interface SemesterImportRow {
  line: number;
  academicYear: string;
  term: string;
  startDate: string;
  endDate: string;
}

export interface ExistingSemester {
  id: string;
  academicYearStart: number;
  term: number;
  /** `yyyy-mm-dd`. */
  startDate: string;
  endDate: string;
}

export type SemesterWrite =
  | { kind: 'create'; academicYearStart: number; term: number; startDate: string; endDate: string }
  | { kind: 'update'; id: string; startDate: string; endDate: string };

interface Candidate {
  index: number;
  line: number;
  label: string;
  input: SemesterInput;
  current: ExistingSemester | undefined;
  kind: 'new' | 'update' | 'unchanged';
}

/** Hai khoảng ĐÓNG ở hai đầu (như `ex_semester_dates_overlap`, `daterange(…, '[]')`) có chung ít nhất một ngày. */
function overlaps(a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

const range = (value: { startDate: string; endDate: string }) =>
  `${formatDmy(value.startDate)}–${formatDmy(value.endDate)}`;

/**
 * Hàm THUẦN cho import học kỳ. Khoá là (năm học, kỳ); CHỈ SỬA ngày (nguyên tắc 2) — đổi khoá là một học kỳ mới.
 *
 * Chồng ngày là quy tắc BẢO THỦ có chủ ý. Ràng buộc `ex_semester_dates_overlap` kiểm TỪNG câu lệnh và không hoãn được, nên
 * một file dời hai kỳ chéo vào chỗ của nhau sẽ chồng NGAY LÚC câu `UPDATE` đầu chạy dù kết quả cuối hợp lệ. Thay vì sắp
 * thứ tự ghi (không có thứ tự nào đúng cho mọi file), mỗi khoảng ngày mới bị so với:
 *   (1) ngày HIỆN TẠI của MỌI học kỳ có sẵn — kể cả kỳ cũng đang được file dời đi, và
 *   (2) ngày sau-nhập của mọi dòng khác trong file.
 * Qua được cả hai thì mọi thứ tự ghi đều không chồng ở bất kỳ thời điểm nào. Cái giá: file dời chéo hai kỳ bị từ chối kèm
 * gợi ý "nhập từng kỳ một" — hiếm với 3 kỳ/năm, và rẻ hơn một rollback khó hiểu.
 *
 * Mọi so sánh chồng dùng tập dòng hợp lệ ở thời điểm TRƯỚC khi gán lỗi chồng, để kết quả không phụ thuộc thứ tự dòng.
 */
export function planSemesterImport(
  rows: readonly SemesterImportRow[],
  existing: readonly ExistingSemester[],
): ImportPlan<SemesterWrite> {
  const byKey = new Map(existing.map((s) => [`${s.academicYearStart}-${s.term}`, s]));
  const firstLineOfKey = new Map<string, number>();
  const results: ImportRowResult[] = new Array(rows.length);
  const candidates: Candidate[] = [];

  rows.forEach((row, index) => {
    const problems: string[] = [];
    const year = parseCellInt(row.academicYear);
    const term = parseTermCell(row.term);
    const startDate = parseCellDate(row.startDate);
    const endDate = parseCellDate(row.endDate);
    if (year === null) problems.push(`Năm học ${shown(row.academicYear)} không phải số (vd 2026 cho năm học 2026-2027).`);
    if (term === null) problems.push(`Kỳ ${shown(row.term)} không hợp lệ, cần 1, 2 hoặc 3.`);
    if (startDate === null) {
      problems.push(`Ngày bắt đầu ${shown(row.startDate)} không hiểu được, dùng yyyy-mm-dd hoặc dd/mm/yyyy.`);
    }
    if (endDate === null) {
      problems.push(`Ngày kết thúc ${shown(row.endDate)} không hiểu được, dùng yyyy-mm-dd hoặc dd/mm/yyyy.`);
    }

    const label = year !== null && term !== null ? semesterLabel(year, term) : `Dòng ${row.line}`;
    if (year === null || term === null || startDate === null || endDate === null) {
      results[index] = errorRow(row.line, label, problems);
      return;
    }

    const input: SemesterInput = { academicYearStart: year, term, startDate, endDate };
    problems.push(...semesterProblems(input));

    if (problems.length === 0) {
      const key = `${year}-${term}`;
      const first = firstLineOfKey.get(key);
      if (first !== undefined) {
        problems.push(`Trùng với dòng ${first}: ${label} đã xuất hiện trong file.`);
      } else {
        firstLineOfKey.set(key, row.line);
      }
    }
    if (problems.length > 0) {
      results[index] = errorRow(row.line, label, problems);
      return;
    }

    const current = byKey.get(`${year}-${term}`);
    const kind: Candidate['kind'] = !current
      ? 'new'
      : current.startDate === startDate && current.endDate === endDate
        ? 'unchanged'
        : 'update';
    candidates.push({ index, line: row.line, label, input, current, kind });
  });

  // Chồng ngày — chỉ các dòng sẽ ĐỔI dữ liệu (`new`/`update`) là chủ thể; dòng `unchanged` trùng đúng dữ liệu có sẵn
  // nên phép so (1) đã bao nó.
  const touched = candidates.filter((c) => c.kind !== 'unchanged');
  const overlapError = new Map<number, string>();
  for (const subject of touched) {
    const mine = subject.input;
    const clash = existing.find((other) => other.id !== subject.current?.id && overlaps(mine, other));
    if (clash) {
      const movedByFile = touched.some((t) => t.current?.id === clash.id);
      overlapError.set(
        subject.index,
        `Ngày ${range(mine)} chồng với ${semesterLabel(clash.academicYearStart, clash.term)} (${range(clash)}).` +
          (movedByFile
            ? ' Ngày hiện tại của kỳ đó vẫn được tính; nếu bạn đang dời cả hai kỳ, hãy nhập từng kỳ một.'
            : ''),
      );
      continue;
    }
    const fileClash = touched.find((other) => other.index !== subject.index && overlaps(mine, other.input));
    if (fileClash) {
      overlapError.set(
        subject.index,
        `Ngày ${range(mine)} chồng với ${fileClash.label} ở dòng ${fileClash.line} của file (${range(fileClash.input)}).`,
      );
    }
  }

  const writes: SemesterWrite[] = [];
  for (const candidate of candidates) {
    const message = overlapError.get(candidate.index);
    if (message) {
      results[candidate.index] = errorRow(candidate.line, candidate.label, [message]);
      continue;
    }
    const result = blankRow(candidate.line, candidate.label);
    result.status = candidate.kind;
    if (candidate.kind === 'new') {
      writes.push({ kind: 'create', ...candidate.input });
    } else if (candidate.kind === 'update' && candidate.current) {
      const { current, input } = candidate;
      if (current.startDate !== input.startDate) {
        result.changes.push({
          field: 'startDate',
          label: 'Ngày bắt đầu',
          from: formatDmy(current.startDate),
          to: formatDmy(input.startDate),
        });
      }
      if (current.endDate !== input.endDate) {
        result.changes.push({
          field: 'endDate',
          label: 'Ngày kết thúc',
          from: formatDmy(current.endDate),
          to: formatDmy(input.endDate),
        });
      }
      writes.push({ kind: 'update', id: current.id, startDate: input.startDate, endDate: input.endDate });
    }
    results[candidate.index] = result;
  }

  return { rows: results, writes };
}
```

Hai chỗ cần để ý khi chép: `results` được khởi tạo `new Array(rows.length)` rồi điền theo chỉ số, nên thứ tự dòng kết quả luôn là thứ tự file kể cả khi lỗi chồng được gán ở bước sau; và `writes` đi theo thứ tự file (an toàn vì quy tắc bảo thủ).

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/api && npx jest src/course/import/plan-semester-import.spec.ts`
Expected: PASS. Ca "dời chéo": dòng 3 (s2 → 2027-09-01…) hợp lệ vì không chạm ngày hiện tại của s1 (kết thúc 2027-01-31) cũng không chạm dòng 2 (2027-02-01–2027-05-31).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/course/import/plan-semester-import.ts apps/api/src/course/import/plan-semester-import.spec.ts
git commit -m "feat(master-data): planner import học kỳ (chồng ngày theo quy tắc bảo thủ)"
```

---

### Task 4: Planner lớp

**Files:**
- Create: `apps/api/src/course/import/plan-class-import.ts`
- Test: `apps/api/src/course/import/plan-class-import.spec.ts`

**Interfaces:**
- Consumes: `parseSemesterCell`, `shown`, `normalizeAdministrativeCode`, `administrativeCodeProblem`, `normalizeGroupName`, `groupNameProblem`, `semesterLabel`.
- Produces:

```ts
export interface ClassImportRow { line: number; semester: string; administrativeClassCode: string; groupName: string; teacherEmail: string }
export interface ClassImportContext {
  semesters: Array<{ id: string; academicYearStart: number; term: number }>;
  administrativeClasses: Array<{ id: string; code: string }>;
  teachers: Array<{ id: string; email: string; name: string; role: string; isActive: boolean }>;
  classes: Array<{ id: string; semesterId: string | null; administrativeClassId: string | null; groupName: string; teacherId: string; teacherName: string }>;
}
export type ClassWrite =
  | { kind: 'create'; semesterId: string; administrativeClassId: string; groupName: string; teacherId: string; teacherName: string; label: string }
  | { kind: 'reassign'; classId: string; label: string; fromTeacherName: string; toTeacherId: string; toTeacherName: string };
export function planClassImport(rows: readonly ClassImportRow[], context: ClassImportContext): ImportPlan<ClassWrite>;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/api/src/course/import/plan-class-import.spec.ts`:

```ts
import { planClassImport, type ClassImportContext } from './plan-class-import';

const context: ClassImportContext = {
  semesters: [{ id: 'sem1', academicYearStart: 2026, term: 1 }],
  administrativeClasses: [{ id: 'ac1', code: 'DHKTPM18A' }],
  teachers: [
    { id: 't1', email: 'a@x.vn', name: 'Giảng viên A', role: 'teacher', isActive: true },
    { id: 't2', email: 'b@x.vn', name: 'Giảng viên B', role: 'teacher', isActive: true },
    { id: 't3', email: 'admin@x.vn', name: 'Quản trị', role: 'admin', isActive: true },
    { id: 't4', email: 'nghi@x.vn', name: 'Đã nghỉ', role: 'teacher', isActive: false },
  ],
  classes: [
    { id: 'c1', semesterId: 'sem1', administrativeClassId: 'ac1', groupName: 'Nhóm 1', teacherId: 't1', teacherName: 'Giảng viên A' },
  ],
};
const row = (line: number, semester: string, code: string, groupName: string, teacherEmail: string) => ({
  line,
  semester,
  administrativeClassCode: code,
  groupName,
  teacherEmail,
});

describe('planClassImport', () => {
  it('lớp mới: "new", nhãn gộp kèm học kỳ, ghi create với id đã tra (không tạo gì khác)', () => {
    const plan = planClassImport([row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 2', 'b@x.vn')], context);
    expect(plan.rows[0]).toMatchObject({
      line: 2,
      status: 'new',
      label: 'DHKTPM18A – Nhóm 2 · HK1 2026-2027',
      errors: [],
      similar: [],
    });
    expect(plan.writes).toEqual([
      {
        kind: 'create',
        semesterId: 'sem1',
        administrativeClassId: 'ac1',
        groupName: 'Nhóm 2',
        teacherId: 't2',
        teacherName: 'Giảng viên B',
        label: 'DHKTPM18A – Nhóm 2 · HK1 2026-2027',
      },
    ]);
  });

  it('không có nhóm thì nhãn không có gạch ngang', () => {
    const plan = planClassImport([row(2, 'HK1 2026-2027', 'DHKTPM18A', '', 'a@x.vn')], context);
    expect(plan.rows[0].label).toBe('DHKTPM18A · HK1 2026-2027');
  });

  it('cùng khoá, cùng giảng viên: "unchanged"', () => {
    const plan = planClassImport([row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 1', 'a@x.vn')], context);
    expect(plan.rows[0].status).toBe('unchanged');
    expect(plan.writes).toEqual([]);
  });

  it('cùng khoá, giảng viên khác: "update" nêu "A → B" (T-IMP-6) và ghi reassign', () => {
    const plan = planClassImport([row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 1', 'b@x.vn')], context);
    expect(plan.rows[0]).toMatchObject({
      status: 'update',
      changes: [{ field: 'teacher', label: 'Giảng viên', from: 'Giảng viên A', to: 'Giảng viên B' }],
    });
    expect(plan.writes).toEqual([
      {
        kind: 'reassign',
        classId: 'c1',
        label: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027',
        fromTeacherName: 'Giảng viên A',
        toTeacherId: 't2',
        toTeacherName: 'Giảng viên B',
      },
    ]);
  });

  it('email không phân biệt hoa-thường; nhóm được gộp khoảng trắng; mã được viết hoa', () => {
    const plan = planClassImport([row(2, 'hk1 2026-2027', 'dhktpm18a', '  Nhóm   1 ', 'B@X.VN')], context);
    expect(plan.rows[0].status).toBe('update');
    expect(plan.rows[0].label).toBe('DHKTPM18A – Nhóm 1 · HK1 2026-2027');
  });

  it('lớp có sẵn mà file không nhắc tới không có dòng nào (không xoá)', () => {
    const plan = planClassImport([row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 9', 'a@x.vn')], context);
    expect(plan.rows).toHaveLength(1);
    expect(plan.writes).toHaveLength(1); // chỉ lớp mới Nhóm 9; c1 không bị đụng
  });

  describe('chỉ CHỌN, không tạo (T-ADM-2)', () => {
    it('học kỳ chưa có: lỗi nêu nhãn và bảo tạo học kỳ trước', () => {
      const plan = planClassImport([row(2, 'HK2 2026-2027', 'DHKTPM18A', 'Nhóm 1', 'a@x.vn')], context);
      expect(plan.rows[0].status).toBe('error');
      expect(plan.rows[0].errors[0]).toMatch(/Chưa có học kỳ HK2 2026-2027.*tạo học kỳ trước/);
      expect(plan.writes).toEqual([]);
    });

    it('nhãn học kỳ không hiểu được: lỗi nêu dạng đúng', () => {
      const plan = planClassImport([row(2, 'học kỳ một', 'DHKTPM18A', 'Nhóm 1', 'a@x.vn')], context);
      expect(plan.rows[0].errors[0]).toMatch(/HK1 2026-2027/);
    });

    it('mã lớp danh nghĩa chưa có trong Danh mục: lỗi nêu mã và chỉ tới Danh mục', () => {
      const plan = planClassImport([row(7, 'HK1 2026-2027', 'DHKTPM18Z', 'Nhóm 1', 'a@x.vn')], context);
      expect(plan.rows[0].line).toBe(7);
      expect(plan.rows[0].errors[0]).toMatch(/Mã DHKTPM18Z chưa có trong Danh mục lớp danh nghĩa/);
    });

    it('mã sai định dạng: dùng câu của luật dùng chung', () => {
      const plan = planClassImport([row(2, 'HK1 2026-2027', 'DHK-TPM', 'Nhóm 1', 'a@x.vn')], context);
      expect(plan.rows[0].errors[0]).toMatch(/chữ và số/);
    });
  });

  describe('giảng viên (Review Focus 7)', () => {
    it.each([
      ['', /thiếu email/i],
      ['khongco@x.vn', /không có tài khoản/i],
      ['admin@x.vn', /không phải tài khoản giảng viên/i],
      ['nghi@x.vn', /vô hiệu hoá/i],
    ])('email %j', (email, pattern) => {
      const plan = planClassImport([row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 2', email)], context);
      expect(plan.rows[0].status).toBe('error');
      expect(plan.rows[0].errors.join(' ')).toMatch(pattern);
      expect(plan.writes).toEqual([]);
    });
  });

  it('một dòng gom MỌI lỗi của nó', () => {
    const plan = planClassImport([row(2, 'HK9 2026-2027', 'ZZZ', 'x'.repeat(51), '')], context);
    expect(plan.rows[0].errors.length).toBeGreaterThanOrEqual(4);
  });

  it('trùng khoá trong file: dòng sau là lỗi nêu số dòng đầu', () => {
    const plan = planClassImport(
      [
        row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 2', 'a@x.vn'),
        row(3, 'HK1 2026-2027', 'dhktpm18a', 'Nhóm  2', 'b@x.vn'),
      ],
      context,
    );
    expect(plan.rows.map((r) => r.status)).toEqual(['new', 'error']);
    expect(plan.rows[1].errors[0]).toMatch(/dòng 2/);
  });

  it('cùng mã khác nhóm là hai lớp khác nhau, không phải trùng', () => {
    const plan = planClassImport(
      [
        row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 2', 'a@x.vn'),
        row(3, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 3', 'a@x.vn'),
      ],
      context,
    );
    expect(plan.rows.map((r) => r.status)).toEqual(['new', 'new']);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/api && npx jest src/course/import/plan-class-import.spec.ts`
Expected: FAIL — không import được `plan-class-import`.

- [ ] **Step 3: Viết planner**

Create `apps/api/src/course/import/plan-class-import.ts`:

```ts
import {
  administrativeCodeProblem,
  groupNameProblem,
  normalizeAdministrativeCode,
  normalizeGroupName,
} from '../../common/master-data-normalize';
import { semesterLabel } from '../../common/semester-label';
import { parseSemesterCell, shown } from './import-cells';
import { blankRow, errorRow, type ImportPlan, type ImportRowResult } from './import.types';

export interface ClassImportRow {
  line: number;
  /** Nhãn học kỳ: `HK1 2026-2027`. */
  semester: string;
  administrativeClassCode: string;
  groupName: string;
  teacherEmail: string;
}

/** Trạng thái hiện có mà planner cần — service nạp, planner không chạm DB. */
export interface ClassImportContext {
  semesters: Array<{ id: string; academicYearStart: number; term: number }>;
  administrativeClasses: Array<{ id: string; code: string }>;
  /** Chỉ cần các tài khoản có email xuất hiện trong file. */
  teachers: Array<{ id: string; email: string; name: string; role: string; isActive: boolean }>;
  classes: Array<{
    id: string;
    semesterId: string | null;
    administrativeClassId: string | null;
    groupName: string;
    teacherId: string;
    teacherName: string;
  }>;
}

export type ClassWrite =
  | {
      kind: 'create';
      semesterId: string;
      administrativeClassId: string;
      groupName: string;
      teacherId: string;
      teacherName: string;
      label: string;
    }
  | {
      kind: 'reassign';
      classId: string;
      label: string;
      fromTeacherName: string;
      toTeacherId: string;
      toTeacherName: string;
    };

/**
 * Hàm THUẦN cho import lớp. Khoá là (học kỳ, mã lớp danh nghĩa, nhóm); CHỈ SỬA giảng viên (nguyên tắc 2).
 *
 * Học kỳ, mã lớp danh nghĩa và giảng viên đều phải ĐÃ CÓ: planner chỉ TRA, không bao giờ trả về việc "tạo" cho chúng
 * (spec §2.2, T-ADM-2) — kiểu `ClassWrite` không có biến thể nào như vậy. Thiếu thì dòng lỗi, kèm câu chỉ cách khắc phục.
 *
 * Nhãn dựng cùng dạng với view `class_label.label_with_semester` (`DHKTPM18A – Nhóm 1 · HK1 2026-2027`) để bản xem trước
 * nói đúng thứ admin sẽ thấy ở danh sách lớp.
 */
export function planClassImport(
  rows: readonly ClassImportRow[],
  context: ClassImportContext,
): ImportPlan<ClassWrite> {
  const semesterByKey = new Map(context.semesters.map((s) => [`${s.academicYearStart}-${s.term}`, s]));
  const codeToId = new Map(context.administrativeClasses.map((a) => [a.code, a.id]));
  const teacherByEmail = new Map(context.teachers.map((t) => [t.email.toLowerCase(), t]));
  const classByKey = new Map(
    context.classes
      .filter((c) => c.semesterId !== null && c.administrativeClassId !== null)
      .map((c) => [`${c.semesterId}|${c.administrativeClassId}|${c.groupName}`, c]),
  );
  const firstLineOfKey = new Map<string, number>();
  const results: ImportRowResult[] = [];
  const writes: ClassWrite[] = [];

  for (const row of rows) {
    const problems: string[] = [];

    // Học kỳ.
    const parsedSemester = parseSemesterCell(row.semester);
    let semesterId: string | null = null;
    let semesterText: string | null = null;
    if (!parsedSemester) {
      problems.push(`Học kỳ ${shown(row.semester)} không hiểu được, cần dạng HK1 2026-2027 (hai năm liền nhau).`);
    } else {
      semesterText = semesterLabel(parsedSemester.academicYearStart, parsedSemester.term);
      const found = semesterByKey.get(`${parsedSemester.academicYearStart}-${parsedSemester.term}`);
      if (found) semesterId = found.id;
      else problems.push(`Chưa có học kỳ ${semesterText}, hãy tạo học kỳ trước.`);
    }

    // Mã lớp danh nghĩa — CHỌN trong Danh mục, không tạo.
    const code = normalizeAdministrativeCode(row.administrativeClassCode);
    let administrativeClassId: string | null = null;
    const codeProblem = administrativeCodeProblem(code);
    if (codeProblem) {
      problems.push(codeProblem);
    } else {
      administrativeClassId = codeToId.get(code) ?? null;
      if (!administrativeClassId) {
        problems.push(`Mã ${code} chưa có trong Danh mục lớp danh nghĩa, hãy thêm nó vào Danh mục trước.`);
      }
    }

    // Nhóm.
    const groupName = normalizeGroupName(row.groupName);
    const groupProblem = groupNameProblem(groupName);
    if (groupProblem) problems.push(groupProblem);

    // Giảng viên — theo email, phải là giảng viên đang hoạt động.
    const email = row.teacherEmail.trim();
    let teacher: ClassImportContext['teachers'][number] | null = null;
    if (email === '') {
      problems.push('Thiếu email giảng viên.');
    } else {
      teacher = teacherByEmail.get(email.toLowerCase()) ?? null;
      if (!teacher) {
        problems.push(`Không có tài khoản ${email}.`);
      } else if (teacher.role !== 'teacher') {
        problems.push(`${email} không phải tài khoản giảng viên.`);
        teacher = null;
      } else if (!teacher.isActive) {
        problems.push(`Tài khoản ${email} đã bị vô hiệu hoá nên không giao lớp được.`);
        teacher = null;
      }
    }

    const label =
      semesterText !== null && !codeProblem && code !== ''
        ? `${code}${groupName ? ` – ${groupName}` : ''} · ${semesterText}`
        : `Dòng ${row.line}`;

    if (semesterId && administrativeClassId && !groupProblem) {
      const key = `${semesterId}|${administrativeClassId}|${groupName}`;
      const first = firstLineOfKey.get(key);
      if (first !== undefined) problems.push(`Trùng với dòng ${first}: lớp ${label} đã xuất hiện trong file.`);
      else firstLineOfKey.set(key, row.line);
    }

    if (problems.length > 0 || !semesterId || !administrativeClassId || !teacher) {
      results.push(errorRow(row.line, label, problems));
      continue;
    }

    const current = classByKey.get(`${semesterId}|${administrativeClassId}|${groupName}`);
    if (!current) {
      results.push({ ...blankRow(row.line, label), status: 'new' });
      writes.push({
        kind: 'create',
        semesterId,
        administrativeClassId,
        groupName,
        teacherId: teacher.id,
        teacherName: teacher.name,
        label,
      });
      continue;
    }

    const result = blankRow(row.line, label);
    if (current.teacherId !== teacher.id) {
      result.status = 'update';
      result.changes.push({ field: 'teacher', label: 'Giảng viên', from: current.teacherName, to: teacher.name });
      writes.push({
        kind: 'reassign',
        classId: current.id,
        label,
        fromTeacherName: current.teacherName,
        toTeacherId: teacher.id,
        toTeacherName: teacher.name,
      });
    }
    results.push(result);
  }

  return { rows: results, writes };
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/api && npx jest src/course/import`
Expected: PASS (cả năm file spec của thư mục).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/course/import/plan-class-import.ts apps/api/src/course/import/plan-class-import.spec.ts
git commit -m "feat(master-data): planner import lớp (chỉ tra học kỳ/mã/giảng viên, chỉ đổi giảng viên)"
```

---

### Task 5: `runImport`, DTO, route và e2e cho học kỳ, phòng, Danh mục lớp danh nghĩa

**Files:**
- Create: `apps/api/src/course/import/import-runner.ts`, `apps/api/src/course/dto/import.dto.ts`, `apps/api/src/course/master-data-import.service.ts`
- Modify: `apps/api/src/course/semester.controller.ts`, `room.controller.ts`, `administrative-class.controller.ts`, `course.module.ts`
- Test: `apps/api/test/master-data-import.e2e-spec.ts`

**Interfaces:**
- Consumes: bốn planner (Task 2–4), `AuditLogService.recordUserAction(input, manager)`, `SemesterEntity`, `RoomEntity`, `AdministrativeClassEntity`.
- Produces:

```ts
// import-runner.ts
export interface RunImportArgs<W> {
  dataSource: DataSource; auditLog: AuditLogService;
  actorId: string; dryRun: boolean; confirmSimilar: boolean;
  lockName: string;
  audit: { action: string; targetType: string; targetLabel: string };
  plan(manager: EntityManager): Promise<ImportPlan<W>>;
  apply(manager: EntityManager, writes: W[]): Promise<void>;
  auditExtra?(plan: ImportPlan<W>): Record<string, unknown>;
}
export function runImport<W>(args: RunImportArgs<W>): Promise<ImportResult>;
// master-data-import.service.ts
class MasterDataImportService {
  importSemesters(actorId: string, dto: ImportSemestersDto): Promise<ImportResult>;
  importRooms(actorId: string, dto: ImportRoomsDto): Promise<ImportResult>;
  importAdministrativeClasses(actorId: string, dto: ImportAdministrativeClassesDto): Promise<ImportResult>;
}
// Routes (admin): POST /semesters/import · POST /rooms/import · POST /administrative-classes/import  — 200
```

- [ ] **Step 1: Viết e2e (đỏ)**

Create `apps/api/test/master-data-import.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { freshTestYear, purgeTestSemesters, randomTag, semesterDates } from './helpers/master-data';

/**
 * Import dữ liệu nền (plan E1): học kỳ, phòng, Danh mục lớp danh nghĩa. Phần lớp ở Task 6 (cùng file).
 *
 * Mọi ca dùng hậu tố ngẫu nhiên riêng và các TỪ KHÁC NHAU trong tên, vì luật "gần giống" so với cả bảng chung: hai tên
 * `… A` và `… AB` của hai test khác nhau sẽ cảnh báo nhau ở những ca không hề nói về điều đó.
 */
describe('Import dữ liệu nền (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let adminId: string;
  let teacherToken: string;

  const RUN = `IMPT${randomTag(6)}`;
  const PASSWORD = 'correct-horse-battery';
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return response.body.accessToken as string;
  }

  function importTo(
    path: string,
    rows: object[],
    options: { dryRun: boolean; confirmSimilar?: boolean },
    token = adminToken,
  ) {
    return request(app.getHttpServer()).post(path).set(auth(token)).send({ rows, ...options });
  }

  async function auditCount(action: string): Promise<number> {
    const [row] = await ds.query(
      `SELECT count(*)::int AS n FROM examcollect.audit_log WHERE action = $1 AND actor_id = $2`,
      [action, adminId],
    );
    return row.n as number;
  }

  async function lastAudit(action: string) {
    const [row] = await ds.query(
      `SELECT target_type, target_id, old_value, new_value FROM examcollect.audit_log
        WHERE action = $1 AND actor_id = $2 ORDER BY occurred_at DESC LIMIT 1`,
      [action, adminId],
    );
    return row;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const adminEmail = `imp_admin_${RUN}@example.com`;
    adminId = await createTestAccount(ds, { email: adminEmail, password: PASSWORD, role: 'admin' });
    adminToken = await login(adminEmail);
    const teacherEmail = `imp_teacher_${RUN}@example.com`;
    await createTestAccount(ds, { email: teacherEmail, password: PASSWORD, role: 'teacher' });
    teacherToken = await login(teacherEmail);
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM examcollect.room WHERE name::text LIKE $1`, [`${RUN}%`]).catch(() => undefined);
    await ds
      .query(`DELETE FROM examcollect.administrative_class WHERE code::text LIKE $1`, [`${RUN}%`])
      .catch(() => undefined);
    await purgeTestSemesters(ds).catch(() => undefined);
    await app.close();
  });

  describe('chung cho cả bốn route', () => {
    const ROUTES = ['/semesters/import', '/rooms/import', '/administrative-classes/import', '/classes/import'];

    it.each(ROUTES)('%s: không token là 401, giảng viên là 403', async (path) => {
      await request(app.getHttpServer()).post(path).send({ rows: [], dryRun: true }).expect(401);
      await importTo(path, [{ line: 2 }], { dryRun: true }, teacherToken).expect(403);
    });

    it.each(ROUTES)('%s: thiếu dryRun là 400 — một client lỗi không được ghi vì quên cờ (Review Focus)', async (path) => {
      await request(app.getHttpServer())
        .post(path)
        .set(auth(adminToken))
        .send({ rows: [{ line: 2 }] })
        .expect(400);
    });

    it.each(ROUTES)('%s: danh sách rỗng là 400', async (path) => {
      await importTo(path, [], { dryRun: true }).expect(400);
    });

    // Mỗi dòng ở đây HỢP LỆ về hình dạng: nếu không, 400 đến từ việc dòng sai chứ không phải từ trần dòng và ca này xanh
    // vì sai lý do. Ca "đúng bằng trần" là 200 chứng minh điều đó.
    const SHAPE_OK: Record<string, (line: number) => object> = {
      '/semesters/import': (line) => ({ line, academicYear: '2026', term: '1', startDate: '2026-09-01', endDate: '2027-01-31' }),
      '/rooms/import': (line) => ({ line, name: 'x', capacity: '' }),
      '/administrative-classes/import': (line) => ({ line, code: 'ABC' }),
      '/classes/import': (line) => ({ line, semester: '', administrativeClassCode: '', groupName: '', teacherEmail: '' }),
    };
    it.each([
      ['/semesters/import', 20],
      ['/rooms/import', 500],
      ['/administrative-classes/import', 500],
      ['/classes/import', 200],
    ])('%s: đúng trần %d dòng là 200, thêm một dòng là 400', async (path, limit) => {
      const make = (count: number) => Array.from({ length: count }, (_, i) => SHAPE_OK[path](i + 2));
      await importTo(path, make(limit), { dryRun: true }).expect(200);
      await importTo(path, make(limit + 1), { dryRun: true }).expect(400);
    });
  });

  describe('POST /rooms/import', () => {
    const room = (line: number, name: string, capacity = '') => ({ line, name, capacity });
    const roomCount = async () =>
      ((await ds.query(`SELECT count(*)::int AS n FROM examcollect.room WHERE name::text LIKE $1`, [`${RUN}%`]))[0].n as number);
    const find = async (name: string) =>
      (await ds.query(`SELECT id, name::text AS name, capacity, is_active FROM examcollect.room WHERE name = $1`, [name]))[0];

    it('dryRun không ghi gì, kể cả audit', async () => {
      const before = await roomCount();
      const auditBefore = await auditCount('room.import');

      const response = await importTo('/rooms/import', [room(2, `${RUN} Cam`, '40'), room(3, `${RUN} Tim`)], {
        dryRun: true,
      }).expect(200);

      expect(response.body).toMatchObject({
        dryRun: true,
        applied: false,
        counts: { added: 2, updated: 0, unchanged: 0, errors: 0 },
        needsSimilarConfirmation: false,
      });
      expect(response.body.rows.map((r: { status: string }) => r.status)).toEqual(['new', 'new']);
      expect(await roomCount()).toBe(before);
      expect(await auditCount('room.import')).toBe(auditBefore);
    });

    it('T-IMP-3: xem trước và ghi thật cho CÙNG rows và counts; ghi một dòng audit cho cả lô (T-AUD-1)', async () => {
      const rows = [room(2, `${RUN} Vang`, '35'), room(3, `${RUN} Nau`)];
      const auditBefore = await auditCount('room.import');

      const preview = await importTo('/rooms/import', rows, { dryRun: true }).expect(200);
      const real = await importTo('/rooms/import', rows, { dryRun: false }).expect(200);

      expect(real.body.dryRun).toBe(false);
      expect(real.body.applied).toBe(true);
      expect(real.body.rows).toEqual(preview.body.rows);
      expect(real.body.counts).toEqual(preview.body.counts);

      expect(await find(`${RUN} Vang`)).toMatchObject({ capacity: 35, is_active: true });
      expect(await find(`${RUN} Nau`)).toMatchObject({ capacity: null, is_active: true });

      expect(await auditCount('room.import')).toBe(auditBefore + 1);
      const audit = await lastAudit('room.import');
      expect(audit.target_type).toBe('room');
      expect(audit.target_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(audit.new_value).toMatchObject({ added: 2, updated: 0, unchanged: 0 });
      expect(typeof audit.new_value.targetLabel).toBe('string');
    });

    it('một dòng lỗi giữa các dòng tốt: dryRun trả 200 kèm số dòng lỗi; ghi thật là 400 và KHÔNG ghi dòng nào (Review Focus 2)', async () => {
      const rows = [room(2, `${RUN} Xanh`), room(3, `${RUN} Do`, 'abc'), room(4, `${RUN} Luc`)];
      const before = await roomCount();
      const auditBefore = await auditCount('room.import');

      const preview = await importTo('/rooms/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.counts).toMatchObject({ added: 2, errors: 1 });
      expect(preview.body.rows[1]).toMatchObject({ line: 3, status: 'error' });

      const real = await importTo('/rooms/import', rows, { dryRun: false }).expect(400);
      expect(real.body.error).toBe('IMPORT_HAS_ERRORS');
      expect(real.body.preview.rows[1].line).toBe(3);

      expect(await roomCount()).toBe(before);
      expect(await auditCount('room.import')).toBe(auditBefore);
    });

    it('gửi lại cùng một file: toàn "unchanged", applied=false, KHÔNG thêm dòng audit (Review Focus 6)', async () => {
      const rows = [room(2, `${RUN} Hong`, '20')];
      await importTo('/rooms/import', rows, { dryRun: false }).expect(200);
      const auditBefore = await auditCount('room.import');

      const again = await importTo('/rooms/import', rows, { dryRun: false }).expect(200);

      expect(again.body).toMatchObject({ applied: false, counts: { added: 0, updated: 0, unchanged: 1 } });
      expect(await auditCount('room.import')).toBe(auditBefore);
    });

    it('chỉ sửa sức chứa, ô trống không xoá sức chứa, phòng vắng khỏi file còn nguyên (Review Focus 3)', async () => {
      await importTo('/rooms/import', [room(2, `${RUN} Bac`, '40'), room(3, `${RUN} Dong`, '30')], { dryRun: false }).expect(200);

      const update = await importTo('/rooms/import', [room(2, `${RUN} Bac`, '45')], { dryRun: true }).expect(200);
      expect(update.body.rows[0]).toMatchObject({
        status: 'update',
        changes: [{ field: 'capacity', from: '40', to: '45' }],
      });
      await importTo('/rooms/import', [room(2, `${RUN} Bac`, '45')], { dryRun: false }).expect(200);
      expect((await find(`${RUN} Bac`)).capacity).toBe(45);

      // Ô trống: không xoá.
      await importTo('/rooms/import', [room(2, `${RUN} Bac`, '')], { dryRun: false }).expect(200);
      expect((await find(`${RUN} Bac`)).capacity).toBe(45);
      // Phòng không có trong file: còn nguyên, nguyên vẹn sức chứa.
      expect((await find(`${RUN} Dong`)).capacity).toBe(30);
      // Tên khác hoa-thường khớp cùng phòng, không đổi tên.
      await importTo('/rooms/import', [room(2, `${RUN} BAC`.toLowerCase(), '46')], { dryRun: false }).expect(200);
      expect((await find(`${RUN} Bac`)).name).toBe(`${RUN} Bac`);
    });

    it('T-IMP-8: tên gần giống phòng có sẵn — xem trước cảnh báo, ghi thật cần xác nhận, và tạo phòng MỚI (không sửa phòng cũ)', async () => {
      await importTo('/rooms/import', [room(2, `${RUN} Sanh H3.03`, '50')], { dryRun: false }).expect(200);
      const rows = [room(2, `${RUN} Sanh H303`, '99')];

      const preview = await importTo('/rooms/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.needsSimilarConfirmation).toBe(true);
      expect(preview.body.rows[0].similar).toEqual([
        expect.objectContaining({ name: `${RUN} Sanh H3.03`, reason: 'normalized', source: 'existing' }),
      ]);

      const before = await roomCount();
      const refused = await importTo('/rooms/import', rows, { dryRun: false }).expect(409);
      expect(refused.body.error).toBe('NEAR_DUPLICATE');
      expect(refused.body.preview.rows[0].similar).toHaveLength(1);
      expect(await roomCount()).toBe(before);

      await importTo('/rooms/import', rows, { dryRun: false, confirmSimilar: true }).expect(200);
      expect(await roomCount()).toBe(before + 1);
      // Phòng cũ không bị đụng: đổi tên bằng file là một phòng mới, không phải sửa phòng cũ.
      expect(await find(`${RUN} Sanh H3.03`)).toMatchObject({ capacity: 50 });
      expect(await find(`${RUN} Sanh H303`)).toMatchObject({ capacity: 99 });
    });

    it('hai dòng mới giống nhau trong cùng file được cảnh báo; hai phòng thật khác nhau (A1/B1) thì không', async () => {
      const similar = await importTo(
        '/rooms/import',
        [room(2, `${RUN} Kho P.A101`), room(3, `${RUN} Kho P A101`)],
        { dryRun: true },
      ).expect(200);
      expect(similar.body.needsSimilarConfirmation).toBe(true);
      expect(similar.body.rows[0].similar[0]).toMatchObject({ source: 'file', line: 3 });

      const distinct = await importTo(
        '/rooms/import',
        [room(2, `${RUN} May A1`), room(3, `${RUN} May B1`)],
        { dryRun: false },
      ).expect(200);
      expect(distinct.body).toMatchObject({ applied: true, needsSimilarConfirmation: false });
    });

    it('tên chuẩn hoá khi ghi: khoảng trắng thừa được gộp', async () => {
      await importTo('/rooms/import', [room(2, `  ${RUN}   Kem   `)], { dryRun: false }).expect(200);
      expect(await find(`${RUN} Kem`)).toBeDefined();
    });
  });

  describe('POST /administrative-classes/import', () => {
    const code = (line: number, value: string) => ({ line, code: value });
    const codeCount = async () =>
      ((await ds.query(`SELECT count(*)::int AS n FROM examcollect.administrative_class WHERE code::text LIKE $1`, [`${RUN}%`]))[0].n as number);

    it('thêm mã mới (viết hoa), xem trước = ghi, một dòng audit, gửi lại là no-op', async () => {
      const rows = [code(2, `${RUN}ALFA`.toLowerCase()), code(3, `${RUN}BRAVO`)];
      const auditBefore = await auditCount('administrative_class.import');

      const preview = await importTo('/administrative-classes/import', rows, { dryRun: true }).expect(200);
      expect(await codeCount()).toBe(0);
      const real = await importTo('/administrative-classes/import', rows, { dryRun: false }).expect(200);
      expect(real.body.rows).toEqual(preview.body.rows);
      expect(await codeCount()).toBe(2);
      expect(real.body.rows[0].label).toBe(`${RUN}ALFA`);

      expect(await auditCount('administrative_class.import')).toBe(auditBefore + 1);
      expect((await lastAudit('administrative_class.import')).new_value).toMatchObject({ added: 2, unchanged: 0 });

      const again = await importTo('/administrative-classes/import', rows, { dryRun: false }).expect(200);
      expect(again.body).toMatchObject({ applied: false, counts: { added: 0, unchanged: 2 } });
      expect(await auditCount('administrative_class.import')).toBe(auditBefore + 1);
    });

    it('anh em ATT/CTT thật không bị cảnh báo; mã thừa một ký tự bị cảnh báo và cần xác nhận', async () => {
      await importTo('/administrative-classes/import', [code(2, `${RUN}XATT`)], { dryRun: false }).expect(200);

      const sibling = await importTo('/administrative-classes/import', [code(2, `${RUN}XCTT`)], { dryRun: true }).expect(200);
      expect(sibling.body.needsSimilarConfirmation).toBe(false);

      const extra = [code(2, `${RUN}XATTT`)];
      const preview = await importTo('/administrative-classes/import', extra, { dryRun: true }).expect(200);
      expect(preview.body.rows[0].similar).toEqual([
        expect.objectContaining({ name: `${RUN}XATT`, reason: 'insert_delete', source: 'existing' }),
      ]);
      await importTo('/administrative-classes/import', extra, { dryRun: false }).expect(409);
      await importTo('/administrative-classes/import', extra, { dryRun: false, confirmSimilar: true }).expect(200);
    });

    it('một mã sai giữa các mã tốt: không mã nào được ghi', async () => {
      const before = await codeCount();
      const rows = [code(2, `${RUN}OKONE`), code(3, 'DHK-TPM'), code(4, `${RUN}OKTWO`)];
      const response = await importTo('/administrative-classes/import', rows, { dryRun: false }).expect(400);
      expect(response.body.preview.rows[1]).toMatchObject({ line: 3, status: 'error' });
      expect(await codeCount()).toBe(before);
    });
  });

  describe('POST /semesters/import', () => {
    const sem = (line: number, year: number, term: number, startDate: string, endDate: string) => ({
      line,
      academicYear: String(year),
      term: String(term),
      startDate,
      endDate,
    });
    const findSemester = async (year: number, term: number) =>
      (
        await ds.query(
          `SELECT id, to_char(start_date,'YYYY-MM-DD') AS "startDate", to_char(end_date,'YYYY-MM-DD') AS "endDate"
             FROM examcollect.semester WHERE academic_year_start = $1 AND term = $2`,
          [year, term],
        )
      )[0];

    it('thêm hai kỳ: xem trước = ghi, ngày dd/mm/yyyy được hiểu, một dòng audit', async () => {
      const year = await freshTestYear(ds);
      const t1 = semesterDates(year, 1);
      const t2 = semesterDates(year, 2);
      const [y2, m2, d2] = t2.startDate.split('-');
      const rows = [
        sem(2, year, 1, t1.startDate, t1.endDate),
        sem(3, year, 2, `${d2}/${m2}/${y2}`, t2.endDate), // dd/mm/yyyy
      ];
      const auditBefore = await auditCount('semester.import');

      const preview = await importTo('/semesters/import', rows, { dryRun: true }).expect(200);
      expect(await findSemester(year, 1)).toBeUndefined();
      const real = await importTo('/semesters/import', rows, { dryRun: false }).expect(200);

      expect(real.body.rows).toEqual(preview.body.rows);
      expect(real.body.rows[0].label).toBe(`HK1 ${year}-${year + 1}`);
      expect(await findSemester(year, 2)).toMatchObject({ startDate: t2.startDate, endDate: t2.endDate });
      expect(await auditCount('semester.import')).toBe(auditBefore + 1);
      expect((await lastAudit('semester.import')).new_value).toMatchObject({ added: 2, updated: 0, unchanged: 0 });
    });

    it('sửa ngày kỳ có sẵn: hiện từ → đến, chỉ ngày đổi; gửi lại là no-op', async () => {
      const year = await freshTestYear(ds);
      const t1 = semesterDates(year, 1);
      await importTo('/semesters/import', [sem(2, year, 1, t1.startDate, t1.endDate)], { dryRun: false }).expect(200);

      const shorter = `${year + 1}-01-15`;
      const rows = [sem(2, year, 1, t1.startDate, shorter)];
      const preview = await importTo('/semesters/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.rows[0]).toMatchObject({
        status: 'update',
        changes: [expect.objectContaining({ field: 'endDate', to: `15/01/${year + 1}` })],
      });
      await importTo('/semesters/import', rows, { dryRun: false }).expect(200);
      expect((await findSemester(year, 1)).endDate).toBe(shorter);

      const again = await importTo('/semesters/import', rows, { dryRun: false }).expect(200);
      expect(again.body.applied).toBe(false);
    });

    it('chồng ngày với kỳ có sẵn: lỗi nêu nhãn kỳ đó; ghi thật là 400 và không ghi gì', async () => {
      const year = await freshTestYear(ds);
      const t1 = semesterDates(year, 1);
      await importTo('/semesters/import', [sem(2, year, 1, t1.startDate, t1.endDate)], { dryRun: false }).expect(200);

      const t2 = semesterDates(year, 2);
      const rows = [sem(2, year, 2, `${year}-12-01`, t2.endDate)]; // bắt đầu giữa kỳ 1
      const preview = await importTo('/semesters/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.rows[0].errors[0]).toContain(`HK1 ${year}-${year + 1}`);

      await importTo('/semesters/import', rows, { dryRun: false }).expect(400);
      expect(await findSemester(year, 2)).toBeUndefined();
    });

    it('hai kỳ trong cùng file chồng nhau: cả hai lỗi, không kỳ nào được ghi', async () => {
      const year = await freshTestYear(ds);
      const t1 = semesterDates(year, 1);
      const rows = [
        sem(2, year, 1, t1.startDate, t1.endDate),
        sem(3, year, 2, `${year}-12-01`, `${year + 1}-05-31`),
      ];
      const response = await importTo('/semesters/import', rows, { dryRun: false }).expect(400);
      expect(response.body.preview.rows.map((r: { status: string }) => r.status)).toEqual(['error', 'error']);
      expect(await findSemester(year, 1)).toBeUndefined();
    });

    it('dời hai kỳ chéo vào chỗ của nhau: bị từ chối kèm gợi ý, KHÔNG có lỗi DB nào lọt ra (Review Focus 5)', async () => {
      const year = await freshTestYear(ds);
      const t1 = semesterDates(year, 1);
      const t2 = semesterDates(year, 2);
      await importTo(
        '/semesters/import',
        [sem(2, year, 1, t1.startDate, t1.endDate), sem(3, year, 2, t2.startDate, t2.endDate)],
        { dryRun: false },
      ).expect(200);

      // Kỳ 1 dời vào đúng chỗ cũ của kỳ 2.
      const rows = [sem(2, year, 1, t2.startDate, t2.endDate)];
      const preview = await importTo('/semesters/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.rows[0].status).toBe('error');
      await importTo('/semesters/import', rows, { dryRun: false }).expect(400);
      expect((await findSemester(year, 1)).startDate).toBe(t1.startDate);
    });

    it('ô ngày kiểu `Date.toString()` bị từ chối kèm hướng dẫn định dạng', async () => {
      const year = await freshTestYear(ds);
      const t1 = semesterDates(year, 1);
      const response = await importTo(
        '/semesters/import',
        [sem(2, year, 1, 'Tue Sep 01 2026 07:00:00 GMT+0700 (Indochina Time)', t1.endDate)],
        { dryRun: true },
      ).expect(200);
      expect(response.body.rows[0].errors[0]).toMatch(/yyyy-mm-dd hoặc dd\/mm\/yyyy/);
    });
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand test/master-data-import.e2e-spec.ts`
Expected: FAIL — ba route trả 404 (và `/classes/import` chưa có; cụm "chung cho cả bốn route" của nó chỉ xanh sau Task 6).

- [ ] **Step 3: Viết DTO thân yêu cầu**

Create `apps/api/src/course/dto/import.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Trần dòng của từng loại (spec §6.3). Vượt là 400 cho cả yêu cầu, không phải lỗi theo dòng: một file 5.000 dòng phòng là
 * file sai chứ không phải file có dòng sai.
 */
export const IMPORT_ROW_LIMITS = {
  semesters: 20,
  rooms: 500,
  administrativeClasses: 500,
  classes: 200,
} as const;

/** Độ dài tối đa một ô — chặn một ô khổng lồ trước khi nó tới planner. */
const CELL_MAX = 200;

/**
 * Mọi ô là CHỮ: trình duyệt gửi `cell.text`, server tự hiểu số/ngày/học kỳ (`import-cells.ts`) để có MỘT chỗ hiểu.
 * `line` là số dòng như Excel hiện ra, do client tính — server không tự đoán nên câu báo lỗi luôn trỏ đúng dòng người dùng
 * nhìn thấy.
 */
class ImportRowBase {
  @IsInt()
  @Min(1)
  line!: number;
}

export class ImportSemesterRowDto extends ImportRowBase {
  @IsString() @MaxLength(CELL_MAX) academicYear!: string;
  @IsString() @MaxLength(CELL_MAX) term!: string;
  @IsString() @MaxLength(CELL_MAX) startDate!: string;
  @IsString() @MaxLength(CELL_MAX) endDate!: string;
}

export class ImportRoomRowDto extends ImportRowBase {
  @IsString() @MaxLength(CELL_MAX) name!: string;
  @IsString() @MaxLength(CELL_MAX) capacity!: string;
}

export class ImportAdministrativeClassRowDto extends ImportRowBase {
  @IsString() @MaxLength(CELL_MAX) code!: string;
}

export class ImportClassRowDto extends ImportRowBase {
  @IsString() @MaxLength(CELL_MAX) semester!: string;
  @IsString() @MaxLength(CELL_MAX) administrativeClassCode!: string;
  @IsString() @MaxLength(CELL_MAX) groupName!: string;
  @IsString() @MaxLength(CELL_MAX) teacherEmail!: string;
}

export class ImportSemestersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(IMPORT_ROW_LIMITS.semesters)
  @ValidateNested({ each: true })
  @Type(() => ImportSemesterRowDto)
  rows!: ImportSemesterRowDto[];

  /** BẮT BUỘC, không mặc định: một client lỗi quên cờ không được phép ghi. */
  @IsBoolean()
  dryRun!: boolean;

  @IsOptional()
  @IsBoolean()
  confirmSimilar?: boolean;
}

export class ImportRoomsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(IMPORT_ROW_LIMITS.rooms)
  @ValidateNested({ each: true })
  @Type(() => ImportRoomRowDto)
  rows!: ImportRoomRowDto[];

  @IsBoolean()
  dryRun!: boolean;

  /** Admin đã thấy cảnh báo "gần giống" ở bản xem trước và vẫn muốn ghi. */
  @IsOptional()
  @IsBoolean()
  confirmSimilar?: boolean;
}

export class ImportAdministrativeClassesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(IMPORT_ROW_LIMITS.administrativeClasses)
  @ValidateNested({ each: true })
  @Type(() => ImportAdministrativeClassRowDto)
  rows!: ImportAdministrativeClassRowDto[];

  @IsBoolean()
  dryRun!: boolean;

  @IsOptional()
  @IsBoolean()
  confirmSimilar?: boolean;
}

export class ImportClassesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(IMPORT_ROW_LIMITS.classes)
  @ValidateNested({ each: true })
  @Type(() => ImportClassRowDto)
  rows!: ImportClassRowDto[];

  @IsBoolean()
  dryRun!: boolean;

  @IsOptional()
  @IsBoolean()
  confirmSimilar?: boolean;
}
```

- [ ] **Step 4: Viết `runImport`**

Create `apps/api/src/course/import/import-runner.ts`:

```ts
import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogService } from '../../admin/audit-log.service';
import {
  needsSimilarConfirmation,
  summarize,
  type ImportPlan,
  type ImportResult,
} from './import.types';

export interface RunImportArgs<W> {
  dataSource: DataSource;
  auditLog: AuditLogService;
  actorId: string;
  dryRun: boolean;
  confirmSimilar: boolean;
  /** Khoá tư vấn: hai import cùng loại không chạy song song (ghi thật). */
  lockName: string;
  audit: { action: string; targetType: string; targetLabel: string };
  plan(manager: EntityManager): Promise<ImportPlan<W>>;
  apply(manager: EntityManager, writes: W[]): Promise<void>;
  /** Trường thêm cho `new_value` của dòng audit (vd danh sách đổi giảng viên của lớp). */
  auditExtra?(plan: ImportPlan<W>): Record<string, unknown>;
}

/**
 * Điều phối MỘT lần import (spec §6.2). Xem trước và ghi thật đi qua CÙNG `plan` — đó là toàn bộ lý do hàm này tồn tại: hai
 * đường tính riêng thì có lúc bản xem trước nói một đằng, lần ghi làm một nẻo.
 *
 *   dryRun            → tính và trả về; không khoá, không ghi, không audit.
 *   ghi + có dòng lỗi → 400 IMPORT_HAS_ERRORS (cả file không được ghi — nguyên tắc 3).
 *   ghi + gần giống chưa xác nhận → 409 NEAR_DUPLICATE (nguyên tắc 4).
 *   ghi + không có gì để ghi → trả kết quả, applied=false, KHÔNG audit (gửi lại cùng một file là no-op).
 *   ghi → `apply`, rồi MỘT dòng audit cho cả lô, cùng transaction.
 *
 * Ghi thật tính lại `plan` BÊN TRONG transaction, sau khi giữ khoá tư vấn: trạng thái "có sẵn" mà planner so là trạng thái
 * lúc ghi chứ không phải lúc xem trước. Mọi `throw` sau khi lấy khoá làm rollback toàn bộ — chưa có gì được ghi ở các
 * nhánh từ chối nên rollback chỉ là nhả khoá.
 */
export async function runImport<W>(args: RunImportArgs<W>): Promise<ImportResult> {
  return args.dataSource.transaction(async (manager) => {
    if (!args.dryRun) {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [args.lockName]);
    }

    const plan = await args.plan(manager);
    const counts = summarize(plan.rows);
    const similar = needsSimilarConfirmation(plan.rows);
    const result: ImportResult = {
      dryRun: args.dryRun,
      applied: false,
      counts,
      rows: plan.rows,
      needsSimilarConfirmation: similar,
    };
    if (args.dryRun) return result;

    if (counts.errors > 0) {
      throw new BadRequestException({
        error: 'IMPORT_HAS_ERRORS',
        message: `File có ${counts.errors} dòng lỗi nên không có gì được ghi. Hãy sửa file rồi chọn lại.`,
        preview: result,
      });
    }
    if (similar && !args.confirmSimilar) {
      throw new ConflictException({
        error: 'NEAR_DUPLICATE',
        message: 'Có mục mới gần giống mục khác. Hãy xem lại bản xem trước và xác nhận nếu đúng là các mục khác nhau.',
        preview: result,
      });
    }
    if (counts.added + counts.updated === 0) return result;

    await args.apply(manager, plan.writes);
    await args.auditLog.recordUserAction(
      {
        actorId: args.actorId,
        action: args.audit.action,
        targetType: args.audit.targetType,
        // `target_id` là `NOT NULL uuid` mà một lô không có đối tượng duy nhất: dùng một UUID mới sinh cho lô (spec §4.2).
        targetId: randomUUID(),
        newValue: {
          targetLabel: args.audit.targetLabel,
          added: counts.added,
          updated: counts.updated,
          unchanged: counts.unchanged,
          ...(args.auditExtra?.(plan) ?? {}),
        },
      },
      manager,
    );
    return { ...result, applied: true };
  });
}
```

- [ ] **Step 5: Viết service nạp trạng thái và ghi**

Create `apps/api/src/course/master-data-import.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogService } from '../admin/audit-log.service';
import {
  ImportAdministrativeClassesDto,
  ImportRoomsDto,
  ImportSemestersDto,
} from './dto/import.dto';
import { AdministrativeClassEntity } from './entities/administrative-class.entity';
import { RoomEntity } from './entities/room.entity';
import { SemesterEntity } from './entities/semester.entity';
import { runImport } from './import/import-runner';
import type { ImportResult } from './import/import.types';
import {
  planAdministrativeClassImport,
  type AdministrativeClassWrite,
  type ExistingAdministrativeClass,
} from './import/plan-administrative-class-import';
import { planRoomImport, type ExistingRoom, type RoomWrite } from './import/plan-room-import';
import {
  planSemesterImport,
  type ExistingSemester,
  type SemesterWrite,
} from './import/plan-semester-import';

/**
 * Import dữ liệu nền của admin (spec §6). Service chỉ làm hai việc mà planner không được làm: NẠP trạng thái hiện có và GHI.
 * Mọi quyết định (dòng nào mới, sửa, lỗi, gần giống) nằm ở planner thuần; mọi thủ tục (khoá, từ chối, audit) ở `runImport`.
 *
 * Ghi đi thẳng qua repository thay vì gọi `SemesterService.create`… vì các hàm đó mỗi lần ghi một dòng audit riêng, còn một
 * lần import phải để lại ĐÚNG MỘT dòng cho cả lô. Luật kiểm hợp lệ thì vẫn chung: planner gọi `semesterProblems`,
 * `roomNameProblem`, `administrativeCodeProblem` — chính các hàm mà nhập tay dùng (nguyên tắc 6).
 */
@Injectable()
export class MasterDataImportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditLog: AuditLogService,
  ) {}

  importSemesters(actorId: string, dto: ImportSemestersDto): Promise<ImportResult> {
    return runImport<SemesterWrite>({
      dataSource: this.dataSource,
      auditLog: this.auditLog,
      actorId,
      dryRun: dto.dryRun,
      confirmSimilar: dto.confirmSimilar === true,
      lockName: 'import:semester',
      audit: { action: 'semester.import', targetType: 'semester', targetLabel: 'Học kỳ (nhập từ file)' },
      plan: async (manager) => planSemesterImport(dto.rows, await this.loadSemesters(manager)),
      apply: async (manager, writes) => {
        const repo = manager.getRepository(SemesterEntity);
        for (const write of writes) {
          if (write.kind === 'create') {
            await repo.save(
              repo.create({
                academicYearStart: write.academicYearStart,
                term: write.term,
                startDate: write.startDate,
                endDate: write.endDate,
              }),
            );
          } else {
            await repo.update({ id: write.id }, { startDate: write.startDate, endDate: write.endDate });
          }
        }
      },
    });
  }

  importRooms(actorId: string, dto: ImportRoomsDto): Promise<ImportResult> {
    return runImport<RoomWrite>({
      dataSource: this.dataSource,
      auditLog: this.auditLog,
      actorId,
      dryRun: dto.dryRun,
      confirmSimilar: dto.confirmSimilar === true,
      lockName: 'import:room',
      audit: { action: 'room.import', targetType: 'room', targetLabel: 'Phòng thi (nhập từ file)' },
      plan: async (manager) => planRoomImport(dto.rows, await this.loadRooms(manager)),
      apply: async (manager, writes) => {
        const repo = manager.getRepository(RoomEntity);
        for (const write of writes) {
          if (write.kind === 'create') {
            await repo.save(repo.create({ name: write.name, capacity: write.capacity, isActive: true }));
          } else {
            await repo.update({ id: write.id }, { capacity: write.capacity });
          }
        }
      },
    });
  }

  importAdministrativeClasses(actorId: string, dto: ImportAdministrativeClassesDto): Promise<ImportResult> {
    return runImport<AdministrativeClassWrite>({
      dataSource: this.dataSource,
      auditLog: this.auditLog,
      actorId,
      dryRun: dto.dryRun,
      confirmSimilar: dto.confirmSimilar === true,
      lockName: 'import:administrative_class',
      audit: {
        action: 'administrative_class.import',
        targetType: 'administrative_class',
        targetLabel: 'Danh mục lớp danh nghĩa (nhập từ file)',
      },
      plan: async (manager) => planAdministrativeClassImport(dto.rows, await this.loadAdministrativeClasses(manager)),
      apply: async (manager, writes) => {
        const repo = manager.getRepository(AdministrativeClassEntity);
        for (const write of writes) {
          await repo.save(repo.create({ code: write.code }));
        }
      },
    });
  }

  // ----------------------------------------------------------------- nạp trạng thái hiện có

  private loadSemesters(manager: EntityManager): Promise<ExistingSemester[]> {
    return manager.query(
      `SELECT id, academic_year_start AS "academicYearStart", term,
              to_char(start_date, 'YYYY-MM-DD') AS "startDate",
              to_char(end_date,   'YYYY-MM-DD') AS "endDate"
         FROM examcollect.semester`,
    );
  }

  private loadRooms(manager: EntityManager): Promise<ExistingRoom[]> {
    return manager.query(`SELECT id, name::text AS name, capacity FROM examcollect.room`);
  }

  private loadAdministrativeClasses(manager: EntityManager): Promise<ExistingAdministrativeClass[]> {
    return manager.query(`SELECT id, code::text AS code FROM examcollect.administrative_class`);
  }
}
```

- [ ] **Step 6: Thêm route vào ba controller và nối module**

Trong `apps/api/src/course/semester.controller.ts`: thêm `import { MasterDataImportService } from './master-data-import.service';` và `import { ImportSemestersDto } from './dto/import.dto';`, đổi constructor thành

```ts
  constructor(
    private readonly semesters: SemesterService,
    private readonly imports: MasterDataImportService,
  ) {}
```

và thêm handler (đặt ngay trên `@Post()` tạo thủ công):

```ts
  /** Nhập từ file (spec §6). `dryRun` bắt buộc; 200 cho cả hai chế độ vì không tạo một tài nguyên duy nhất. */
  @Post('import')
  @HttpCode(200)
  importFromFile(@Body() dto: ImportSemestersDto, @Req() req: Request) {
    return this.imports.importSemesters(req.user!.sub, dto);
  }
```

Trong `apps/api/src/course/room.controller.ts`: cùng cách, với `ImportRoomsDto` và

```ts
  @Post('import')
  @HttpCode(200)
  importFromFile(@Body() dto: ImportRoomsDto, @Req() req: Request) {
    return this.imports.importRooms(req.user!.sub, dto);
  }
```

Trong `apps/api/src/course/administrative-class.controller.ts`: `ImportAdministrativeClassesDto` và `this.imports.importAdministrativeClasses(...)`.

Cả ba controller đã `@Roles('admin')` ở **mức class** (plan C), nên route mới tự là admin-only; e2e ca "giảng viên là 403" ghim điều đó.

Trong `apps/api/src/course/course.module.ts`: thêm `import { MasterDataImportService } from './master-data-import.service';` và đưa `MasterDataImportService` vào `providers`.

- [ ] **Step 7: Chạy để thấy xanh**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand test/master-data-import.e2e-spec.ts -t "rooms|administrative|semesters|chung"`
Expected: PASS cho ba nhóm route và các ca "chung" của ba route đầu; ca `/classes/import` trong nhóm "chung" còn đỏ cho tới Task 6 (bình thường). Nếu ca "dời chéo" của học kỳ hiện lỗi 409 chung từ DB, planner đang thiếu quy tắc bảo thủ — kiểm lại bước (1) so với ngày HIỆN TẠI của kỳ có sẵn.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/course apps/api/test/master-data-import.e2e-spec.ts
git commit -m "feat(master-data): import học kỳ, phòng thi, Danh mục lớp danh nghĩa (xem trước = ghi, một dòng audit/lô)"
```

---

### Task 6: Import lớp

**Files:**
- Modify: `apps/api/src/course/class.service.ts`, `apps/api/src/course/class.controller.ts`, `apps/api/src/course/master-data-import.service.ts`
- Test: `apps/api/test/master-data-import.e2e-spec.ts` (thêm nhóm `POST /classes/import`)

**Interfaces:**
- Consumes: `planClassImport` (Task 4), `ClassService` (plan D2), `runImport`.
- Produces:

```ts
// ClassService (thêm)
applyTeacherChange(manager: EntityManager, classId: string, teacherId: string): Promise<void>;
// MasterDataImportService (thêm)
importClasses(actorId: string, dto: ImportClassesDto): Promise<ImportResult>;
// Route (admin): POST /classes/import — 200
```

- [ ] **Step 1: Viết e2e (đỏ)**

Thêm vào `apps/api/test/master-data-import.e2e-spec.ts`. Import thêm ở đầu file (đưa `ensureTestSemester` vào dòng import **có sẵn** từ `./helpers/master-data`, đừng mở dòng import thứ hai cho cùng module):

```ts
import { semesterLabel } from '../src/common/semester-label';
import { seedClass, seedEnrollment, seedExamSession } from './helpers/seed';
// và: import { ensureTestSemester, freshTestYear, purgeTestSemesters, randomTag, semesterDates } from './helpers/master-data';
```

Thêm trước `afterAll` hai biến và bổ sung `beforeAll`/`afterAll` (không thay phần đã có):

```ts
  // Dùng cho nhóm lớp (Task 6).
  const teacherIds: string[] = [];
  const mssvs: string[] = [];
```

Trong `afterAll`, **trước** các dòng xoá phòng, thêm:

```ts
    if (teacherIds.length) {
      await ds.query(`DELETE FROM examcollect.exam_session WHERE teacher_id = ANY($1::uuid[])`, [teacherIds]).catch(() => undefined);
      await ds.query(`DELETE FROM examcollect.enrollment WHERE home_teacher_id = ANY($1::uuid[])`, [teacherIds]).catch(() => undefined);
      await ds.query(`DELETE FROM examcollect.class WHERE teacher_id = ANY($1::uuid[])`, [teacherIds]).catch(() => undefined);
    }
    if (mssvs.length) {
      await ds.query(`DELETE FROM examcollect.student WHERE mssv = ANY($1::text[])`, [mssvs]).catch(() => undefined);
    }
```

Thêm nhóm test cuối `describe` ngoài cùng:

```ts
  describe('POST /classes/import', () => {
    let semesterId: string;
    let semesterText: string;
    let teacherA: { id: string; email: string; name: string };
    let teacherB: { id: string; email: string; name: string };
    let codeOne: string;
    let codeTwo: string;

    const cls = (line: number, semester: string, code: string, groupName: string, teacherEmail: string) => ({
      line,
      semester,
      administrativeClassCode: code,
      groupName,
      teacherEmail,
    });
    const count = async (table: string) =>
      ((await ds.query(`SELECT count(*)::int AS n FROM examcollect.${table}`))[0].n as number);
    const classesOf = async (teacherId: string) =>
      ds.query(`SELECT id, group_name, semester_id, administrative_class_id FROM examcollect.class WHERE teacher_id = $1`, [
        teacherId,
      ]);

    async function teacher(label: string, active = true) {
      const email = `imp_${label}_${RUN}@example.com`.toLowerCase();
      const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher', name: `GV ${label} ${RUN}` });
      if (!active) await ds.query(`UPDATE examcollect.account SET is_active = false WHERE id = $1`, [id]);
      teacherIds.push(id);
      return { id, email, name: `GV ${label} ${RUN}` };
    }

    beforeAll(async () => {
      semesterId = await ensureTestSemester(ds, 1);
      const [row] = await ds.query(`SELECT academic_year_start AS year, term FROM examcollect.semester WHERE id = $1`, [semesterId]);
      semesterText = semesterLabel(row.year, row.term);
      teacherA = await teacher('a');
      teacherB = await teacher('b');
      codeOne = `${RUN}KLONE`;
      codeTwo = `${RUN}KLTWO`;
      await importTo('/administrative-classes/import', [{ line: 2, code: codeOne }, { line: 3, code: codeTwo }], { dryRun: false }).expect(200);
    });

    it('T-ADM-2: một dòng mã chưa có → ghi thật là 400, không lớp nào được ghi, không tạo mã, lỗi nêu mã và số dòng', async () => {
      const rows = [
        cls(2, semesterText, codeOne, 'Nhóm 1', teacherA.email),
        cls(3, semesterText, `${RUN}ZZNONE`, 'Nhóm 1', teacherA.email),
      ];
      const classesBefore = await count('class');
      const codesBefore = await count('administrative_class');
      const semestersBefore = await count('semester');
      const auditBefore = await auditCount('class.import');

      const preview = await importTo('/classes/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.rows[1]).toMatchObject({ line: 3, status: 'error' });
      expect(preview.body.rows[1].errors[0]).toContain(`${RUN}ZZNONE`);
      expect(preview.body.rows[1].errors[0]).toMatch(/Danh mục lớp danh nghĩa/);

      await importTo('/classes/import', rows, { dryRun: false }).expect(400);

      expect(await count('class')).toBe(classesBefore);
      expect(await count('administrative_class')).toBe(codesBefore); // KHÔNG tạo mã "tiện tay"
      expect(await count('semester')).toBe(semestersBefore);
      expect(await auditCount('class.import')).toBe(auditBefore);
    });

    it('học kỳ chưa có, nhãn học kỳ sai, giảng viên không có / là admin / bị vô hiệu hoá: lỗi theo dòng, không ghi gì (Review Focus 7)', async () => {
      const inactive = await teacher('nghi', false);
      const rows = [
        cls(2, 'HK1 2299-2300', codeOne, 'Nhóm 1', teacherA.email),
        cls(3, 'học kỳ một', codeOne, 'Nhóm 1', teacherA.email),
        cls(4, semesterText, codeOne, 'Nhóm 1', `khongco_${RUN}@example.com`.toLowerCase()),
        cls(5, semesterText, codeOne, 'Nhóm 1', `imp_admin_${RUN}@example.com`.toLowerCase()),
        cls(6, semesterText, codeOne, 'Nhóm 1', inactive.email),
      ];
      const before = await count('class');

      const preview = await importTo('/classes/import', rows, { dryRun: true }).expect(200);

      expect(preview.body.counts.errors).toBe(5);
      expect(preview.body.rows[0].errors[0]).toMatch(/Chưa có học kỳ HK1 2299-2300/);
      expect(preview.body.rows[1].errors[0]).toMatch(/HK1 2026-2027/);
      expect(preview.body.rows[2].errors[0]).toMatch(/Không có tài khoản/);
      expect(preview.body.rows[3].errors[0]).toMatch(/không phải tài khoản giảng viên/);
      expect(preview.body.rows[4].errors[0]).toMatch(/vô hiệu hoá/);
      await importTo('/classes/import', rows, { dryRun: false }).expect(400);
      expect(await count('class')).toBe(before);
    });

    it('thêm lớp: xem trước = ghi, lớp có học kỳ + lớp danh nghĩa + nhóm + giảng viên, một dòng audit; gửi lại là no-op', async () => {
      const rows = [
        cls(2, semesterText, codeOne, 'Nhóm 1', teacherA.email),
        cls(3, semesterText, codeTwo, '', teacherB.email.toUpperCase()),
      ];
      const codesBefore = await count('administrative_class');
      const auditBefore = await auditCount('class.import');

      const preview = await importTo('/classes/import', rows, { dryRun: true }).expect(200);
      expect(await classesOf(teacherA.id)).toHaveLength(0);
      const real = await importTo('/classes/import', rows, { dryRun: false }).expect(200);

      expect(real.body.applied).toBe(true);
      expect(real.body.rows).toEqual(preview.body.rows);
      expect(real.body.rows[0].label).toBe(`${codeOne} – Nhóm 1 · ${semesterText}`);
      expect(real.body.rows[1].label).toBe(`${codeTwo} · ${semesterText}`);

      const [created] = await classesOf(teacherA.id);
      expect(created).toMatchObject({ group_name: 'Nhóm 1', semester_id: semesterId });
      expect(await classesOf(teacherB.id)).toHaveLength(1);
      expect(await count('administrative_class')).toBe(codesBefore);

      expect(await auditCount('class.import')).toBe(auditBefore + 1);
      expect((await lastAudit('class.import')).new_value).toMatchObject({ added: 2, updated: 0, unchanged: 0 });

      const again = await importTo('/classes/import', rows, { dryRun: false }).expect(200);
      expect(again.body).toMatchObject({ applied: false, counts: { added: 0, updated: 0, unchanged: 2 } });
      expect(await auditCount('class.import')).toBe(auditBefore + 1);
    });

    it('T-IMP-6: đổi giảng viên qua file hiện "A → B"; ghi thật đổi enrollment, GIỮ giảng viên cũ trên phiên; một dòng audit nêu ai bị đổi', async () => {
      const mine = await teacher('chu');
      const heir = await teacher('ke');
      const code = `${RUN}KLREASSIGN`;
      await importTo('/administrative-classes/import', [{ line: 2, code }], { dryRun: false }).expect(200);
      const klass = await seedClass(ds, { teacherId: mine.id, semesterId, administrativeClassId: (await ds.query(
        `SELECT id FROM examcollect.administrative_class WHERE code = $1`, [code]))[0].id, groupName: 'Nhóm 7' });
      const mssv = `IMP${randomTag(8)}`;
      mssvs.push(mssv);
      await seedEnrollment(ds, { classId: klass.id, teacherId: mine.id, mssv, name: 'Sinh vien doi chu' });
      const session = await seedExamSession(ds, {
        teacherId: mine.id,
        classId: klass.id,
        startTime: new Date(Date.now() + 40 * 86_400_000),
        endTime: new Date(Date.now() + 40 * 86_400_000 + 3_600_000),
      });
      const rows = [cls(2, semesterText, code, 'Nhóm 7', heir.email)];
      const auditBefore = await auditCount('class.import');
      const reassignAuditBefore = await auditCount('class.reassign_teacher');

      const preview = await importTo('/classes/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.rows[0]).toMatchObject({
        status: 'update',
        changes: [{ field: 'teacher', label: 'Giảng viên', from: mine.name, to: heir.name }],
      });

      await importTo('/classes/import', rows, { dryRun: false }).expect(200);

      const [after] = await ds.query(`SELECT teacher_id FROM examcollect.class WHERE id = $1`, [klass.id]);
      expect(after.teacher_id).toBe(heir.id);
      const [enrollment] = await ds.query(`SELECT home_teacher_id FROM examcollect.enrollment WHERE home_class_id = $1`, [klass.id]);
      expect(enrollment.home_teacher_id).toBe(heir.id);
      // Phiên đã có giữ giảng viên cũ: không ai sửa được điểm của phiên người khác đã chấm.
      const [sessionRow] = await ds.query(`SELECT teacher_id FROM examcollect.exam_session WHERE id = $1`, [session.id]);
      expect(sessionRow.teacher_id).toBe(mine.id);

      expect(await auditCount('class.import')).toBe(auditBefore + 1);
      expect(await auditCount('class.reassign_teacher')).toBe(reassignAuditBefore); // một dòng cho cả lô, không thêm dòng lẻ
      const audit = await lastAudit('class.import');
      expect(audit.new_value).toMatchObject({ added: 0, updated: 1, reassignedTotal: 1 });
      expect(audit.new_value.reassigned).toEqual([
        { label: `${code} – Nhóm 7 · ${semesterText}`, from: mine.name, to: heir.name },
      ]);
    });

    it('một dòng lỗi giữa các lớp tốt: không lớp nào được ghi (Review Focus 2)', async () => {
      const lone = await teacher('le');
      const rows = [
        cls(2, semesterText, codeOne, 'Nhóm 31', lone.email),
        cls(3, semesterText, codeOne, 'Nhóm 32', 'khong-co@example.com'),
        cls(4, semesterText, codeTwo, 'Nhóm 33', lone.email),
      ];
      await importTo('/classes/import', rows, { dryRun: false }).expect(400);
      expect(await classesOf(lone.id)).toHaveLength(0);
    });

    it('trùng khoá trong file là lỗi; cùng mã khác nhóm là hai lớp khác nhau', async () => {
      const dup = await teacher('trung');
      const rows = [
        cls(2, semesterText, codeOne, 'Nhóm 41', dup.email),
        cls(3, semesterText, codeOne, 'Nhóm 41', dup.email),
        cls(4, semesterText, codeOne, 'Nhóm 42', dup.email),
      ];
      const preview = await importTo('/classes/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.rows.map((r: { status: string }) => r.status)).toEqual(['new', 'error', 'new']);
      expect(preview.body.rows[1].errors[0]).toMatch(/dòng 2/);
    });
  });
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand test/master-data-import.e2e-spec.ts -t "classes"`
Expected: FAIL — `/classes/import` là 404 (hoặc rơi vào route `:id`).

- [ ] **Step 3: Sửa `ClassService` — dùng chung chuẩn hoá nhóm và đổi giảng viên**

Trong `apps/api/src/course/class.service.ts`:

1. Đổi import từ `'../common/master-data-normalize'` thành
```ts
import {
  administrativeCodeProblem,
  normalizeAdministrativeCode,
  normalizeGroupName,
} from '../common/master-data-normalize';
```
và **xoá** hàm cục bộ `normalizeGroupName` (cùng chú thích) ở đầu file — từ nay chỉ có một bản, dùng chung với import.

2. Thêm phương thức công khai (đặt sau `remove`, trước khối "nội bộ"):

```ts
  /**
   * Đổi giảng viên của MỘT lớp, trong transaction của người gọi (spec §2.3 mục 2): lớp và `enrollment.home_teacher_id` đổi
   * theo; `exam_session.teacher_id`, `session_roster.home_teacher_id` và `submission.home_teacher_id` đã có GIỮ giảng viên
   * cũ để không ai sửa được điểm của phiên người khác đã chấm. Dùng chung cho `update` (nhập tay) và import (spec §6.2
   * nguyên tắc 6) — hai đường không được lệch nhau ở chính điểm này.
   */
  async applyTeacherChange(manager: EntityManager, classId: string, teacherId: string): Promise<void> {
    await manager.getRepository(ClassEntity).update({ id: classId }, { teacherId });
    await manager.query(`UPDATE examcollect.enrollment SET home_teacher_id = $1 WHERE home_class_id = $2`, [
      teacherId,
      classId,
    ]);
  }
```

3. Trong `update`, thay đoạn

```ts
      current.semesterId = nextSemesterId;
      current.administrativeClassId = nextAdministrativeClassId;
      current.groupName = nextGroup;
      current.teacherId = nextTeacherId;
      await repo.save(current);

      if (teacherChanged) {
        // Chỉ `enrollment` đi theo (spec §2.3 mục 2). Phiên, ảnh chốt và bài nộp đã có GIỮ giảng viên cũ để
        // không ai sửa được điểm của phiên người khác đã chấm.
        await manager.query(`UPDATE examcollect.enrollment SET home_teacher_id = $1 WHERE home_class_id = $2`, [
          nextTeacherId,
          id,
        ]);
      }
```

bằng

```ts
      current.semesterId = nextSemesterId;
      current.administrativeClassId = nextAdministrativeClassId;
      current.groupName = nextGroup;
      await repo.save(current);

      if (teacherChanged) {
        await this.applyTeacherChange(manager, id, nextTeacherId);
      }
```

(`current.teacherId` không còn bị gán ở đây: `applyTeacherChange` ghi nó, nên không có hai nơi ghi cùng một cột.) Chạy lại `class-admin.e2e-spec.ts` ngay sau bước này — T-OWN-3 (đọc bốn cột sau khi đổi giảng viên) phải còn xanh.

- [ ] **Step 4: Thêm `importClasses` vào service import**

Trong `apps/api/src/course/master-data-import.service.ts`: thêm import

```ts
import { ClassService } from './class.service';
import { ClassEntity } from './entities/class.entity';
import { COURSE_NAME } from '../common/course-name';
import { ImportClassesDto } from './dto/import.dto';
import {
  planClassImport,
  type ClassImportContext,
  type ClassImportRow,
  type ClassWrite,
} from './import/plan-class-import';
```

thêm `private readonly classes: ClassService,` vào constructor, rồi thêm các phương thức:

```ts
  importClasses(actorId: string, dto: ImportClassesDto): Promise<ImportResult> {
    return runImport<ClassWrite>({
      dataSource: this.dataSource,
      auditLog: this.auditLog,
      actorId,
      dryRun: dto.dryRun,
      confirmSimilar: dto.confirmSimilar === true,
      lockName: 'import:class',
      audit: { action: 'class.import', targetType: 'class', targetLabel: 'Lớp (nhập từ file)' },
      plan: async (manager) => planClassImport(dto.rows, await this.loadClassContext(manager, dto.rows)),
      apply: async (manager, writes) => {
        const repo = manager.getRepository(ClassEntity);
        for (const write of writes) {
          if (write.kind === 'create') {
            await repo.save(
              repo.create({
                courseName: COURSE_NAME,
                semesterId: write.semesterId,
                administrativeClassId: write.administrativeClassId,
                groupName: write.groupName,
                teacherId: write.teacherId,
              }),
            );
          } else {
            // CÙNG hàm với nhập tay: enrollment đi theo, phiên/ảnh chốt/bài nộp đã có giữ giảng viên cũ.
            await this.classes.applyTeacherChange(manager, write.classId, write.toTeacherId);
          }
        }
      },
      // Đổi giảng viên là thứ duy nhất trong lô có hệ quả về QUYỀN, nên audit nêu rõ ai bị đổi (cắt ở 50 mục; tổng số luôn có).
      auditExtra: (plan) => {
        const reassigned = plan.writes
          .filter((w): w is Extract<ClassWrite, { kind: 'reassign' }> => w.kind === 'reassign')
          .map((w) => ({ label: w.label, from: w.fromTeacherName, to: w.toTeacherName }));
        return reassigned.length === 0
          ? {}
          : { reassigned: reassigned.slice(0, 50), reassignedTotal: reassigned.length };
      },
    });
  }

  private async loadClassContext(manager: EntityManager, rows: readonly ClassImportRow[]): Promise<ClassImportContext> {
    const emails = [...new Set(rows.map((row) => row.teacherEmail.trim()).filter((email) => email !== ''))];
    const [semesters, administrativeClasses, teachers, classes] = await Promise.all([
      manager.query(
        `SELECT id, academic_year_start AS "academicYearStart", term FROM examcollect.semester`,
      ),
      manager.query(`SELECT id, code::text AS code FROM examcollect.administrative_class`),
      // `email` là citext: `ANY($1::citext[])` so không phân biệt hoa-thường. `::text[]` sẽ so phân biệt và lặng lẽ
      // không thấy tài khoản gõ khác hoa-thường (bẫy đã gặp ở plan D1).
      manager.query(
        `SELECT id, email::text AS email, name, role::text AS role, is_active AS "isActive"
           FROM examcollect.account WHERE email = ANY($1::citext[])`,
        [emails],
      ),
      manager.query(
        `SELECT c.id, c.semester_id AS "semesterId", c.administrative_class_id AS "administrativeClassId",
                c.group_name AS "groupName", c.teacher_id AS "teacherId", t.name AS "teacherName"
           FROM examcollect.class c
           JOIN examcollect.account t ON t.id = c.teacher_id`,
      ),
    ]);
    return { semesters, administrativeClasses, teachers, classes };
  }
```

`Promise.all` trên cùng một `manager` (một kết nối) chạy tuần tự trong driver `pg` — an toàn, và vẫn rõ ý. Nếu muốn tránh mọi nghi ngờ, đổi thành bốn `await` liên tiếp; kết quả không đổi.

- [ ] **Step 5: Thêm route vào `ClassController`**

Trong `apps/api/src/course/class.controller.ts`: thêm `import { MasterDataImportService } from './master-data-import.service';`, `import { ImportClassesDto } from './dto/import.dto';`, thêm `private readonly imports: MasterDataImportService,` vào constructor, và handler

```ts
  /**
   * Nhập lớp từ file (spec §6). CHỈ tra học kỳ, mã lớp danh nghĩa và giảng viên — không tạo gì ngoài lớp. Quyền khai tường
   * minh vì controller này trộn route của admin (lớp) và của giảng viên (roster).
   */
  @Post('import')
  @Roles('admin')
  @HttpCode(200)
  importFromFile(@Body() dto: ImportClassesDto, @Req() req: Request) {
    return this.imports.importClasses(req.user!.sub, dto);
  }
```

Đặt nó **trước** mọi route có tham số `:id` để đường dẫn `import` không bao giờ bị hiểu là một id (Nest khớp theo thứ tự khai báo).

- [ ] **Step 6: Chạy để thấy xanh**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand test/master-data-import.e2e-spec.ts test/class-admin.e2e-spec.ts`
Expected: PASS cả hai (ca "chung" của `/classes/import` giờ cũng xanh; `class-admin` xanh chứng minh refactor `applyTeacherChange` không đổi hành vi nhập tay).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/course apps/api/test/master-data-import.e2e-spec.ts
git commit -m "feat(master-data): import lớp (chỉ tra học kỳ/mã/giảng viên; đổi giảng viên qua cùng hàm với nhập tay)"
```

---

### Task 7: Sinh lại client, chạy cả hai bộ, soát

**Files:**
- Modify: `packages/shared/src/api/schema.d.ts`

- [ ] **Step 1: Chạy cả hai bộ và so với baseline**

```powershell
cd apps/api
pnpm exec tsc --noEmit
pnpm test 2>&1 | Out-File C:/tmp/unit-after-e1.txt
Select-String C:/tmp/unit-after-e1.txt -Pattern '^Tests:|^Test Suites:'
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'jest|nest' } | Select-Object ProcessId, CommandLine
npx jest --config ./test/jest-e2e.json --runInBand --json --outputFile=C:/tmp/e2e-after-e1.json
node scripts/e2e-summary.cjs C:/tmp/e2e-after-e1.json | Out-File -Encoding utf8 C:/tmp/after-e1.tsv
$base = Get-Content ../../docs/superpowers/plans/md-restore-baseline.tsv | Where-Object { $_ -notmatch '^#' -and $_ -notmatch '^TOTAL' }
$after = Get-Content C:/tmp/after-e1.tsv | Where-Object { $_ -notmatch '^TOTAL' }
Compare-Object $base $after
```

Expected: `tsc` sạch; không `failed > 0`; `Compare-Object` chỉ khác ở các suite của plan A–E1 đã biết (suite mới `master-data-import` cùng các suite đã đổi số test ở plan C–D3). Suite `class-admin` giữ nguyên số test so với trước Task 6.

- [ ] **Step 2: Sinh lại client OpenAPI**

Làm đúng Task 3 của plan B. Diff phải thêm đúng bốn đường dẫn `…/import` và các kiểu `ImportResult`, `ImportRowResult`, `ImportChange`, `ImportSimilar`, `ImportCounts`, cùng bốn thân yêu cầu. Hunk không liên quan ⇒ tách commit riêng.

- [ ] **Step 3: Soát quyền một lượt**

Chạy lại bộ quét quyền của plan C Task 9 Step 3 (mọi route mới có `@Roles` ở mức class hoặc tường minh): bốn route import đều admin-only; `roles-retired.spec.ts` xanh.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/api/schema.d.ts
git commit -m "chore(api-client): sinh lại schema cho bốn route import dữ liệu nền"
```

---

## Tự kiểm lại plan so với spec

- §4 (bốn route `…/import` có `dryRun`): Task 5, 6. §6.1 (khoá và cột): phòng (tên, sức chứa) — Task 2; học kỳ (năm học, kỳ, ngày bắt đầu, ngày kết thúc; kiểm không chồng ngày trong file lẫn với dữ liệu có sẵn) — Task 3; Danh mục lớp danh nghĩa (một cột, chỉ thêm, gần giống với mã có sẵn và giữa các dòng) — Task 2; lớp (học kỳ, mã, nhóm, email giảng viên; thiếu thì dòng lỗi, không tự tạo, lỗi chỉ tới Danh mục) — Task 4, 6. Sinh viên: roster hiện có giữ nguyên (không có trong plan này, đúng spec).
- §6.2: nguyên tắc 1 (chỉ thêm/sửa — `RoomWrite`/`SemesterWrite`/`ClassWrite` không có biến thể xoá; e2e "phòng vắng file còn nguyên"), 2 (chỉ sửa trường không phải khoá; "A → B" ở `changes`), 3 (`IMPORT_HAS_ERRORS`), 4 (`attachSimilar` so với có sẵn và giữa các dòng; `confirmSimilar`), 5 (một planner cho cả hai chế độ; e2e T-IMP-3), 6 (planner gọi `semesterProblems`, `roomNameProblem`, `administrativeCodeProblem`, `normalizeGroupName`, `ClassService.applyTeacherChange` — các hàm nhập tay dùng), 7 (một dòng audit/lô, `target_id` UUID mới, `new_value = {added, updated, unchanged}`). Nguyên tắc 8 (file mẫu, nhận diện cột theo tên) thuộc **plan E2** (web).
- §6.3: trần dòng 20/500/200/500 — `IMPORT_ROW_LIMITS` + e2e từng route. Ô ngày: `parseCellDate` chỉ nhận hai dạng không mơ hồ; chuỗi `Date.toString()` của exceljs bị từ chối có chủ ý — **cách `readWorkbook` trả ô ngày được xử lý ở plan E2** (đổi sang `yyyy-mm-dd`), còn ở đây server không bao giờ đoán từ chuỗi đó.
- §11: T-IMP-2 (không bao giờ xoá: unit + e2e `Bac`/`Dong`), T-IMP-3 (e2e `rows`/`counts` bằng nhau, từng loại), T-IMP-6 (unit `A → B` + e2e), T-IMP-8 (e2e đúng hành vi "đổi tên bằng file tạo phòng mới" + unit), T-ADM-2 (e2e đếm bảng), T-AUD-1 phần import (e2e từng loại). T-STU-3 (roster) ngoài phạm vi.
- Quyết định mới không có trong spec, nói thẳng để user duyệt: (a) **`dryRun` bắt buộc**; (b) **không ghi audit cho lần import không có gì để ghi** (`added + updated = 0`) — spec nói "mỗi lần xác nhận import ghi một dòng", tôi đọc là mỗi lần *có ghi*; nếu muốn đúng chữ thì bỏ nhánh `counts.added + counts.updated === 0` trong `runImport` và đổi hai khẳng định "không thêm dòng audit" ở e2e; (c) quy tắc **bảo thủ** cho chồng ngày học kỳ (từ chối dời chéo hai kỳ trong một file); (d) `reassigned` liệt kê trong `new_value` của `class.import` (cắt 50).
- Placeholder scan: không có "TBD" hay bước mơ hồ; mọi bước có mã cụ thể (đã đối chiếu `createTestAccount` nhận `name`). Các ca trần dòng dùng dòng hợp lệ về hình dạng để 400 chỉ có thể đến từ trần. Kiểu nhất quán: `ImportPlan<W>`/`ImportRowResult`/`ImportResult` khớp giữa Task 1–6; `ClassWrite` ở Task 4 khớp `apply` và `auditExtra` ở Task 6; `applyTeacherChange(manager, classId, teacherId)` khớp lời gọi ở `update` và `importClasses`; plan E2 dùng đúng các trường `rows[].{line,status,label,changes,errors,similar}`, `counts`, `needsSimilarConfirmation`, `applied` và hai mã lỗi `IMPORT_HAS_ERRORS` / `NEAR_DUPLICATE` kèm `preview`.
