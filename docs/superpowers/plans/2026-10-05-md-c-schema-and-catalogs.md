# Plan C — Nền dữ liệu: migration mở rộng, entity, danh mục học kỳ / phòng / lớp danh nghĩa

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng bốn bảng mới (`semester`, `room`, `administrative_class`, `student`), các cột mới trên `class` / `exam_session`, view nhãn lớp, và ba bộ CRUD của admin (học kỳ, phòng, Danh mục lớp danh nghĩa) có audit và cảnh báo "gần giống" — **trên một schema mà code CŨ vẫn chạy được** (giai đoạn mở rộng, spec §8.4 bước 1).

**Architecture:** Một migration **chỉ thêm** (cộng hai nới lỏng có chủ ý, xem Global Constraints): bảng mới, cột nullable, ràng buộc và trigger bất biến ở DB, ràng buộc chống trùng phòng theo `room_id` song song với bản cũ theo tên (chỉ còn áp cho dòng chưa có `room_id`), view `class_label`. Tầng service/controller nằm trong `CourseModule`; mọi ghi của admin đi qua một transaction cùng dòng `audit_log`. Luật "gần giống" là một hàm thuần dùng chung cho nhập tay và (plan E) import.

**Tech Stack:** NestJS 10, TypeORM 0.3 (entity chỉ là siêu dữ liệu; `synchronize: false`), Postgres 16 (`citext`, `btree_gist`, `daterange`, `EXCLUDE`), class-validator, jest.

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §2.1–2.6, §3, §4 (nhóm Học kỳ / Phòng / Lớp danh nghĩa), §6.2 nguyên tắc 4 và 6, §8.4 bước 1, §11 (T-MD-1…9, T-ROOM-1, T-ADM-3, T-ADM-5, T-AUD-1); quyết định mở §13 mục 2 và 12.

## Global Constraints

- **Migration mở rộng, đặt timestamp `1789600000000`**: sau mọi migration của G1–G5 (G2 `1789500000000`, G5 `1789530000000`) để lịch sử tuyến tính (spec §8.6). Tên lớp `ExpandMasterDataEntities1789600000000`. Migration thu hẹp là việc của plan H, một PR riêng.
- **Mọi trạng thái trung gian phải chạy được với code cũ** (spec §8.4: "Code cũ vẫn chạy"). Hệ quả cụ thể, là hai nới lỏng có chủ ý ngoài danh sách "chỉ thêm": (a) `class.name` và `enrollment.student_name` bỏ `NOT NULL` — code mới không còn ghi chúng, và nếu giữ `NOT NULL` thì mọi lần tạo lớp / thêm sinh viên bằng code mới giữa bước triển khai và bước thu hẹp sẽ chết; (b) ràng buộc chống trùng phòng theo **tên** không bị bỏ ngay mà thu hẹp thành `WHERE room_id IS NULL` (tên `ex_exam_session_room_overlap_legacy`), còn ràng buộc theo `room_id` nhận tên `ex_exam_session_room_overlap` — nếu bỏ hẳn bản cũ, code cũ còn chạy giữa bước mở rộng và bước triển khai sẽ đặt trùng phòng không ai chặn.
- Cột mới trên `class`/`exam_session` **nullable** (`semester_id`, `administrative_class_id`, `room_id`); `group_name` là `NOT NULL DEFAULT ''` (không phải NULL: Postgres coi mọi NULL là khác nhau nên khoá duy nhất sẽ bị vô hiệu — spec §2.3).
- **Không** thêm khoá ngoại `enrollment.student_mssv → student.mssv` ở đây: code cũ còn ghi enrollment cho MSSV chưa có trong `student`. Nó đến cùng migration thu hẹp (plan H).
- `ex_exam_session_class_overlap` và `ex_exam_session_teacher_gap` **không bị đụng** (spec §2.4): migration không được tạo lại hay làm mất chúng.
- Chuẩn hoá ở **tầng ghi**, ép lại ở DB: mã lớp danh nghĩa `trim().toUpperCase()` (`CHECK` từ chối chữ thường); tên phòng cắt đầu-cuối và gộp khoảng trắng liên tiếp (`CHECK` từ chối hai khoảng trắng liền nhau).
- Một dòng audit cho mỗi thao tác ghi của admin, **cùng transaction** với thay đổi; thao tác thất bại không để lại dòng nào. Tên hành động `<loại>.<động từ>`: `semester.create|update|delete`, `room.create|update|delete`, `administrative_class.create|update|delete` (plan E thêm `…import`). Quy ước `targetLabel` (plan B, `lib/audit-describe.ts`): tên đọc được của đối tượng nằm trong `newValue` (hoặc `oldValue` khi xoá).
- Mọi route mới `@Roles('admin')` ở **mức class**, route đọc dùng chung với giảng viên ghi đè từng handler (`@Roles('admin','teacher')`). Cách này làm "quên `@Roles`" thành 403 chứ không thành route mở (`RolesGuard` trả `true` khi không có metadata).
- **Luật "gần giống" (spec §2.2, §6.2 nguyên tắc 4, đã đo ngày 05/10):** bằng nhau sau chuẩn hoá (bỏ dấu tiếng Việt, hoa-thường, ký tự không phải chữ/số), HOẶC hơn kém đúng một ký tự chèn/xoá, HOẶC hai ký tự liền kề đổi chỗ; hai vế chuẩn hoá dài ≥ 5 mới áp luật mờ. **Một ký tự thay thế KHÔNG tính** (sẽ cảnh báo nhầm `A1`/`B1`, `ATT`/`CTT`).
- Dữ liệu chung toàn hệ (học kỳ, phòng, mã lớp danh nghĩa) **không được dọn bởi e2e** như dữ liệu theo giảng viên: test dùng hậu tố ngẫu nhiên 10 ký tự cho tên/mã, và **năm học ≥ 2200** làm vùng tên riêng của test (DB cho phép `academic_year_start` 2000–2999; dữ liệu thật là 2026). Test tự dọn những gì nó tạo (`purgeTestSemesters`).
- `scripts/reset-dev-data.sql` đã lỗi thời từ 20/09 (còn xoá bảng `course`, `semester` cũ): **không dùng** trong plan này; plan H viết lại.
- Route mới ⇒ sinh lại `packages/shared/src/api/schema.d.ts` (Task 9).

## Review Focus

1. **Bất biến chỉ được ép ở service.** "Không đổi kỳ của lớp đã có phiên", "không đổi năm/kỳ của học kỳ đã có lớp", "không chồng ngày học kỳ", "không trùng phòng" phải đúng cả khi ai đó ghi thẳng SQL. → `master-data-schema.e2e-spec.ts` ghi bằng SQL thô và đòi DB từ chối (Task 3); service chỉ thêm câu báo lỗi đọc được.
2. **Gán lần đầu không phải "đổi".** Backfill (plan H) phải gán `class.semester_id` cho lớp **đã có phiên thi** từ NULL sang một giá trị; nếu trigger coi đó là đổi thì cả cutover chết. → trigger chỉ chặn khi `OLD.semester_id IS NOT NULL`; test ở Task 3.
3. **Chuẩn hoá hai chiều.** `'dhktpm18a '` và `'DHKTPM18A'` phải là cùng một mã (409 khi thêm lần hai), `'Phong  A1'` (hai khoảng trắng) và `'Phong A1'` là cùng một phòng. → test service ở Task 7, 8 và `CHECK` ở Task 3.
4. **Cảnh báo nhầm trên dữ liệu thật.** `DHKTPM18ATT`/`DHKTPM18CTT` và `Phòng máy A1`/`Phòng máy B1` là các thực thể khác nhau; một cảnh báo ở đây dạy admin bấm "xác nhận" cho qua mọi thứ. → bảng ca có đủ bốn tên thật và khẳng định **không** cảnh báo (Task 1, 7, 8).
5. **Thao tác thất bại để rác audit.** Một 409 nửa chừng không được để lại dòng `*.create`. → test đếm dòng audit trước/sau một lần thất bại (Task 6–8).
6. **Giảng viên đọc được quá nhiều.** `GET /semesters` và `GET /rooms` mở cho giảng viên nhưng số lớp/số phiên là thông tin tổng hợp của người khác. → chỉ admin nhận `classCount` / `sessionCount`; test khẳng định khoá không tồn tại trong phản hồi của giảng viên (Task 6, 7).

---

## File Structure

| File | Việc |
|---|---|
| `apps/api/src/common/near-duplicate.ts` (+ `.spec.ts`) | **Mới.** Luật "gần giống" (hàm thuần). |
| `apps/api/src/common/master-data-normalize.ts` (+ `.spec.ts`) | **Mới.** Chuẩn hoá tên phòng và mã lớp danh nghĩa, kiểm mã. |
| `apps/api/src/common/semester-label.ts` (+ `.spec.ts`) | **Mới.** `semesterLabel`, `formatDmy`. |
| `apps/api/src/course/semester.rules.ts` (+ `.spec.ts`) | **Mới.** `semesterProblems` — một lớp kiểm tra dùng chung cho nhập tay và (plan E) import. |
| `apps/api/src/database/migrations/1789600000000-ExpandMasterDataEntities.ts` | **Mới.** Migration mở rộng. |
| `apps/api/test/master-data-schema.e2e-spec.ts` | **Mới.** Bất biến ở tầng DB. |
| `apps/api/src/course/entities/{semester,room,administrative-class,student}.entity.ts` | **Mới.** |
| `apps/api/src/course/entities/class.entity.ts`, `enrollment.entity.ts`, `apps/api/src/exam-session/entities/exam-session.entity.ts` | Thêm cột; nới nullable cột cũ; sửa ràng buộc phòng. |
| `apps/api/src/database/data-source.ts`, `verify-schema.ts` | Đăng ký entity / bảng mới. |
| `apps/api/src/course/dto/{semester,room,administrative-class}.dto.ts` | **Mới.** |
| `apps/api/src/course/dto/course.dto.ts` | Xoá bảy DTO mồ côi. |
| `apps/api/src/course/{semester,room,administrative-class}.service.ts` | **Mới.** |
| `apps/api/src/course/{semester,room,administrative-class}.controller.ts` | **Mới.** |
| `apps/api/src/course/near-duplicate.error.ts` | **Mới.** Dựng câu `409 NEAR_DUPLICATE`. |
| `apps/api/src/course/course.types.ts`, `course.module.ts` | Thêm kiểu view; nối module. |
| `apps/api/test/helpers/master-data.ts` | **Mới.** `randomTag`, `freshTestYear`, `semesterDates`, `purgeTestSemesters`. |
| `apps/api/test/helpers/seed.ts` | Thêm tuỳ chọn cột mới (không đổi hành vi mặc định). |
| `apps/api/test/{semester,room,administrative-class}.e2e-spec.ts` | **Mới.** |
| `packages/shared/src/api/schema.d.ts` | Sinh lại. |

---

### Task 1: Luật "gần giống" (hàm thuần)

**Files:**
- Create: `apps/api/src/common/near-duplicate.ts`
- Test: `apps/api/src/common/near-duplicate.spec.ts`

**Interfaces:**
- Produces:

```ts
export type NearDuplicateReason = 'normalized' | 'insert_delete' | 'swap';
export function normalizeForCompare(value: string): string;
export function nearDuplicateReason(a: string, b: string): NearDuplicateReason | null;
export interface NearDuplicateMatch<T> { candidate: T; reason: NearDuplicateReason }
export function findNearDuplicates<T>(
  value: string,
  candidates: readonly T[],
  textOf: (candidate: T) => string,
): NearDuplicateMatch<T>[];
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/api/src/common/near-duplicate.spec.ts`:

```ts
import { findNearDuplicates, nearDuplicateReason, normalizeForCompare } from './near-duplicate';

describe('normalizeForCompare', () => {
  it('bỏ dấu tiếng Việt, kể cả đ/Đ', () => {
    expect(normalizeForCompare('Đại sảnh 1')).toBe('daisanh1');
    expect(normalizeForCompare('PHÒNG MÁY A1')).toBe('phongmaya1');
  });

  it('bỏ hoa-thường và mọi ký tự không phải chữ/số', () => {
    expect(normalizeForCompare('P.A101')).toBe('pa101');
    expect(normalizeForCompare(' p-a 101 ')).toBe('pa101');
  });

  it('chuỗi chỉ toàn ký tự bị bỏ thì ra rỗng', () => {
    expect(normalizeForCompare('...--  ')).toBe('');
  });
});

describe('nearDuplicateReason', () => {
  // Cặp THẬT từ phép đo 2026-10-04: khác nhau ở khoảng cách chỉnh sửa 1 nhưng là
  // các thực thể khác nhau. Luật "khoảng cách ≤ 2" của bản spec đầu sẽ cảnh báo nhầm
  // đúng chúng — đây là lý do luật hiện nay không tính ký tự thay thế.
  const DISTINCT_REAL_PAIRS: Array<[string, string]> = [
    ['Phòng máy A1', 'Phòng máy B1'],
    ['Phòng máy A1', 'Phòng H3.03'],
    ['Phòng máy B1', 'Phòng H3.03'],
    ['DHKTPM18ATT', 'DHKTPM18CTT'],
  ];

  it.each(DISTINCT_REAL_PAIRS)('KHÔNG cảnh báo cặp thật khác nhau: %s ~ %s', (a, b) => {
    expect(nearDuplicateReason(a, b)).toBeNull();
    expect(nearDuplicateReason(b, a)).toBeNull();
  });

  const SHOULD_WARN: Array<[string, string, string]> = [
    ['P.A101', 'P A101', 'normalized'],
    ['P.A101', 'p-a101', 'normalized'],
    ['Phòng H3.03', 'Phong h3.03', 'normalized'],
    ['PHÒNG MÁY A1', 'Phòng máy A1', 'normalized'],
    ['Đại sảnh 1', 'Dai sanh 1', 'normalized'],
    ['DHKTPM18ATT', 'DHKTMP18ATT', 'swap'],
    ['DHKTPM18ATT', 'DHKTPM18AT', 'insert_delete'],
    ['DHKTPM18ATT', 'DHKTPM18ATTT', 'insert_delete'],
  ];

  it.each(SHOULD_WARN)('cảnh báo lỗi gõ điển hình: %s ~ %s (%s)', (a, b, reason) => {
    expect(nearDuplicateReason(a, b)).toBe(reason);
    // Đối xứng: lỗi gõ đúng cả chiều ngược lại.
    expect(nearDuplicateReason(b, a)).toBe(reason);
  });

  it('chuỗi ngắn (< 5 sau chuẩn hoá) không bị so mờ: A1 ≠ A12, H3 ≠ H4', () => {
    expect(nearDuplicateReason('A1', 'A12')).toBeNull();
    expect(nearDuplicateReason('H3', 'H4')).toBeNull();
  });

  it('chuỗi ngắn vẫn bị bắt khi bằng nhau sau chuẩn hoá', () => {
    expect(nearDuplicateReason('A-1', 'a 1')).toBe('normalized');
  });

  it('giống hệt (cả hoa-thường) cũng là "normalized"; việc coi nó là trùng cứng là của người gọi', () => {
    expect(nearDuplicateReason('P101', 'P101')).toBe('normalized');
  });

  it('rỗng sau chuẩn hoá không bao giờ là gần giống', () => {
    expect(nearDuplicateReason('...', '---')).toBeNull();
    expect(nearDuplicateReason('', 'abc')).toBeNull();
  });

  it('khác hai ký tự thay thế thì không', () => {
    expect(nearDuplicateReason('DHKTPM18ATT', 'DHKTPM18CCT')).toBeNull();
  });

  it('hoán vị hai ký tự KHÔNG liền kề không tính', () => {
    expect(nearDuplicateReason('DHKTPM18ATT', 'DHKPTM18ATT')).toBe('swap');
    expect(nearDuplicateReason('ABCDEFG', 'CBADEFG')).toBeNull();
  });
});

describe('findNearDuplicates', () => {
  const rooms = [
    { id: '1', name: 'Phòng máy A1' },
    { id: '2', name: 'Phòng máy B1' },
    { id: '3', name: 'Phòng H3.03' },
  ];

  it('trả các ứng viên gần giống kèm lý do, giữ thứ tự đầu vào', () => {
    const found = findNearDuplicates('Phong may a1', rooms, (r) => r.name);
    expect(found).toEqual([{ candidate: rooms[0], reason: 'normalized' }]);
  });

  it('không có gì gần giống thì mảng rỗng, kể cả khi chỉ khác một ký tự thay thế', () => {
    expect(findNearDuplicates('Phòng máy C1', rooms, (r) => r.name)).toEqual([]);
  });

  it('danh sách rỗng thì mảng rỗng', () => {
    expect(findNearDuplicates('Phòng máy A1', [], (r: { name: string }) => r.name)).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run (từ `apps/api`): `npx jest src/common/near-duplicate.spec.ts`
Expected: FAIL — không import được `./near-duplicate`.

- [ ] **Step 3: Viết hàm**

Create `apps/api/src/common/near-duplicate.ts`:

```ts
/**
 * "Gần giống" — luật cảnh báo lỗi gõ cho tên phòng và mã lớp danh nghĩa.
 *
 * Hệ thống KHÔNG biết một phòng hay một lớp có thật không; nó chỉ biết đã có gì
 * trong bảng. Cái nó làm được là nói "cái bạn vừa gõ giống cái này", trước khi
 * ghi, để người gõ nhìn lại một lần.
 *
 * Luật (đo trên dữ liệu thật ngày 2026-10-04, ba phòng và hai mã lớp):
 *   1. bằng nhau sau chuẩn hoá — bỏ dấu tiếng Việt, hoa-thường, và mọi ký tự
 *      không phải chữ/số ("P.A101" ~ "P A101" ~ "p-a101");
 *   2. HOẶC hơn kém đúng MỘT ký tự chèn/xoá;
 *   3. HOẶC hai ký tự LIỀN KỀ đổi chỗ.
 * Luật 2 và 3 chỉ áp khi cả hai chuỗi chuẩn hoá dài >= MIN_FUZZY_LENGTH: với
 * chuỗi ngắn một ký tự là cả một phần ba cái tên ("A1" ~ "A12" là hai phòng).
 *
 * KHÔNG tính một ký tự THAY THẾ, và đây là điểm cố ý khác bản spec đầu ("khoảng
 * cách chỉnh sửa <= 2"): `DHKTPM18ATT` / `DHKTPM18CTT` và `Phòng máy A1` /
 * `Phòng máy B1` là các thực thể KHÁC NHAU ở khoảng cách 1. Một cảnh báo bật
 * trên chúng dạy người dùng bấm "xác nhận" cho qua mọi thứ, tức là phá chính
 * cái nó sinh ra để làm. Cái giá: lỗi gõ thay một ký tự ("ATT" -> "ATR") không
 * bị bắt, vì về hình thức nó không phân biệt được với một lớp anh em thật.
 *
 * Hàm đối xứng: nearDuplicateReason(a, b) === nearDuplicateReason(b, a).
 */

export type NearDuplicateReason = 'normalized' | 'insert_delete' | 'swap';

/** Dưới ngưỡng này chỉ so bằng nhau sau chuẩn hoá. */
const MIN_FUZZY_LENGTH = 5;

export function normalizeForCompare(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** `longer` có đúng một ký tự thừa so với `shorter` (và bỏ nó đi thì ra `shorter`). */
function isSingleInsertion(shorter: string, longer: string): boolean {
  let i = 0;
  while (i < shorter.length && shorter[i] === longer[i]) i++;
  return shorter.slice(i) === longer.slice(i + 1);
}

/** Cùng độ dài, khác nhau đúng ở hai vị trí LIỀN KỀ và hai ký tự đó đổi chỗ cho nhau. */
function isAdjacentSwap(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (i >= a.length - 1) return false;
  return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
}

export function nearDuplicateReason(a: string, b: string): NearDuplicateReason | null {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (na === '' || nb === '') return null;
  if (na === nb) return 'normalized';
  if (na.length < MIN_FUZZY_LENGTH || nb.length < MIN_FUZZY_LENGTH) return null;
  if (Math.abs(na.length - nb.length) === 1) {
    const [shorter, longer] = na.length < nb.length ? [na, nb] : [nb, na];
    if (isSingleInsertion(shorter, longer)) return 'insert_delete';
  }
  if (isAdjacentSwap(na, nb)) return 'swap';
  return null;
}

export interface NearDuplicateMatch<T> {
  candidate: T;
  reason: NearDuplicateReason;
}

/**
 * Các ứng viên gần giống `value`, theo thứ tự đầu vào. Người gọi tự loại trừ
 * (a) bản thân đối tượng đang sửa và (b) các trùng CỨNG (bằng nhau không phân
 * biệt hoa-thường — DB đã có khoá duy nhất citext cho chúng).
 */
export function findNearDuplicates<T>(
  value: string,
  candidates: readonly T[],
  textOf: (candidate: T) => string,
): NearDuplicateMatch<T>[] {
  const matches: NearDuplicateMatch<T>[] = [];
  for (const candidate of candidates) {
    const reason = nearDuplicateReason(value, textOf(candidate));
    if (reason) matches.push({ candidate, reason });
  }
  return matches;
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `npx jest src/common/near-duplicate.spec.ts`
Expected: PASS (mọi `it.each` xanh). Một dòng cần để ý: `['DHKTPM18ATT', 'DHKPTM18ATT']` là hoán vị `TP`→`PT` liền kề nên `swap`; `['ABCDEFG', 'CBADEFG']` đổi chỗ `A` và `C` cách nhau một ký tự nên `null`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/near-duplicate.ts apps/api/src/common/near-duplicate.spec.ts
git commit -m "feat(master-data): luật 'gần giống' cho tên phòng và mã lớp (đã đo trên dữ liệu thật)"
```

---

### Task 2: Chuẩn hoá, nhãn học kỳ, luật kiểm học kỳ

**Files:**
- Create: `apps/api/src/common/master-data-normalize.ts`, `apps/api/src/common/master-data-normalize.spec.ts`
- Create: `apps/api/src/common/semester-label.ts`, `apps/api/src/common/semester-label.spec.ts`
- Create: `apps/api/src/course/semester.rules.ts`, `apps/api/src/course/semester.rules.spec.ts`

**Interfaces:**
- Produces:

```ts
// master-data-normalize.ts
export const ADMINISTRATIVE_CODE_PATTERN: RegExp;           // /^[A-Z0-9]{3,30}$/
export function normalizeRoomName(raw: string): string;     // cắt đầu-cuối, gộp khoảng trắng
export function normalizeAdministrativeCode(raw: string): string; // trim + toUpperCase
export function administrativeCodeProblem(code: string): string | null;
export function roomNameProblem(name: string): string | null;
// semester-label.ts
export function semesterLabel(academicYearStart: number, term: number): string; // "HK1 2026-2027"
export function formatDmy(isoDate: string): string;                              // "2026-09-01" -> "01/09/2026"
// semester.rules.ts
export interface SemesterInput { academicYearStart: number; term: number; startDate: string; endDate: string }
export function semesterProblems(input: SemesterInput): string[];
```

- [ ] **Step 1: Viết ba bộ test (đỏ)**

Create `apps/api/src/common/master-data-normalize.spec.ts`:

```ts
import {
  administrativeCodeProblem,
  normalizeAdministrativeCode,
  normalizeRoomName,
  roomNameProblem,
} from './master-data-normalize';

describe('normalizeRoomName', () => {
  it('cắt đầu-cuối và gộp khoảng trắng liên tiếp thành một', () => {
    expect(normalizeRoomName('  Phòng   máy  A1 ')).toBe('Phòng máy A1');
    expect(normalizeRoomName('P\tA101')).toBe('P A101');
  });
  it('không đổi hoa-thường hay dấu', () => {
    expect(normalizeRoomName('Phòng H3.03')).toBe('Phòng H3.03');
  });
});

describe('roomNameProblem', () => {
  it('rỗng và quá 100 ký tự là lỗi', () => {
    expect(roomNameProblem('')).toMatch(/không được để trống/);
    expect(roomNameProblem('x'.repeat(101))).toMatch(/tối đa 100/);
  });
  it('tên hợp lệ không có lỗi', () => {
    expect(roomNameProblem('Phòng máy A1')).toBeNull();
    expect(roomNameProblem('x'.repeat(100))).toBeNull();
  });
});

describe('normalizeAdministrativeCode', () => {
  it('viết hoa và cắt khoảng trắng', () => {
    expect(normalizeAdministrativeCode(' dhktpm18a ')).toBe('DHKTPM18A');
  });
  it('KHÔNG bỏ khoảng trắng ở giữa: đó là lỗi để người dùng sửa, không phải để đoán', () => {
    expect(normalizeAdministrativeCode('dhk tpm18a')).toBe('DHK TPM18A');
  });
});

describe('administrativeCodeProblem', () => {
  it('chấp nhận mã 3–30 ký tự chữ HOA và số', () => {
    expect(administrativeCodeProblem('DHKTPM18A')).toBeNull();
    expect(administrativeCodeProblem('A1B')).toBeNull();
    expect(administrativeCodeProblem('A'.repeat(30))).toBeNull();
  });
  it('từ chối quá ngắn, quá dài, có ký tự lạ, chữ thường', () => {
    expect(administrativeCodeProblem('AB')).toMatch(/3–30/);
    expect(administrativeCodeProblem('A'.repeat(31))).toMatch(/3–30/);
    expect(administrativeCodeProblem('DHK-TPM')).toMatch(/chữ và số/);
    expect(administrativeCodeProblem('DHK TPM')).toMatch(/chữ và số/);
    expect(administrativeCodeProblem('dhktpm18a')).toMatch(/chữ và số/);
  });
});
```

Create `apps/api/src/common/semester-label.spec.ts`:

```ts
import { formatDmy, semesterLabel } from './semester-label';

describe('semesterLabel', () => {
  it('ghép HK{kỳ} {năm}-{năm+1}', () => {
    expect(semesterLabel(2026, 1)).toBe('HK1 2026-2027');
    expect(semesterLabel(2026, 3)).toBe('HK3 2026-2027');
    expect(semesterLabel(2099, 2)).toBe('HK2 2099-2100');
  });
});

describe('formatDmy', () => {
  it('đổi yyyy-mm-dd thành dd/mm/yyyy', () => {
    expect(formatDmy('2026-09-01')).toBe('01/09/2026');
    expect(formatDmy('2027-01-31')).toBe('31/01/2027');
  });
});
```

Create `apps/api/src/course/semester.rules.spec.ts`:

```ts
import { semesterProblems } from './semester.rules';

const GOOD = { academicYearStart: 2026, term: 1, startDate: '2026-09-01', endDate: '2027-01-31' };

describe('semesterProblems', () => {
  it('đầu vào hợp lệ không có lỗi', () => {
    expect(semesterProblems(GOOD)).toEqual([]);
  });

  it('kỳ chỉ là 1, 2 hoặc 3 (một năm học có ba kỳ)', () => {
    expect(semesterProblems({ ...GOOD, term: 4 })).toEqual([expect.stringMatching(/kỳ/i)]);
    expect(semesterProblems({ ...GOOD, term: 0 })).toEqual([expect.stringMatching(/kỳ/i)]);
    expect(semesterProblems({ ...GOOD, term: 1.5 })).toEqual([expect.stringMatching(/kỳ/i)]);
  });

  it('năm học trong 2000–2999', () => {
    expect(semesterProblems({ ...GOOD, academicYearStart: 1999 })).toEqual([expect.stringMatching(/năm học/i)]);
    expect(semesterProblems({ ...GOOD, academicYearStart: 3000 })).toEqual([expect.stringMatching(/năm học/i)]);
  });

  it('ngày phải là ngày có thật theo dạng yyyy-mm-dd', () => {
    expect(semesterProblems({ ...GOOD, startDate: '2026-02-30' })).toEqual([expect.stringMatching(/ngày bắt đầu/i)]);
    expect(semesterProblems({ ...GOOD, endDate: '31/01/2027' })).toEqual([expect.stringMatching(/ngày kết thúc/i)]);
    expect(semesterProblems({ ...GOOD, startDate: '' })).toEqual([expect.stringMatching(/ngày bắt đầu/i)]);
  });

  it('ngày kết thúc không được trước ngày bắt đầu, nhưng bằng nhau thì được', () => {
    expect(semesterProblems({ ...GOOD, endDate: '2026-08-31' })).toEqual([expect.stringMatching(/không được trước/i)]);
    expect(semesterProblems({ ...GOOD, endDate: '2026-09-01' })).toEqual([]);
  });

  it('gom mọi lỗi thay vì dừng ở lỗi đầu tiên', () => {
    expect(semesterProblems({ academicYearStart: 1, term: 9, startDate: 'x', endDate: 'y' }).length).toBe(4);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `npx jest src/common/master-data-normalize.spec.ts src/common/semester-label.spec.ts src/course/semester.rules.spec.ts`
Expected: FAIL — không import được ba module.

- [ ] **Step 3: Viết ba module**

Create `apps/api/src/common/master-data-normalize.ts`:

```ts
/**
 * Chuẩn hoá ở tầng GHI cho dữ liệu nền do admin gõ. DB ép lại bằng CHECK
 * (`ck_room_name`, `ck_administrative_class_code`), nhưng DB chỉ TỪ CHỐI: việc
 * biến "dhktpm18a " thành "DHKTPM18A" là của lớp này, để hai cách gõ là một mã.
 */

/** Mã lớp danh nghĩa: chữ HOA và số, 3–30 ký tự. Khớp CHECK ở DB. */
export const ADMINISTRATIVE_CODE_PATTERN = /^[A-Z0-9]{3,30}$/;

const ROOM_NAME_MAX = 100;

export function normalizeRoomName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function normalizeAdministrativeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function roomNameProblem(name: string): string | null {
  if (name === '') return 'Tên phòng không được để trống.';
  if (name.length > ROOM_NAME_MAX) return `Tên phòng tối đa ${ROOM_NAME_MAX} ký tự.`;
  return null;
}

export function administrativeCodeProblem(code: string): string | null {
  if (code.length < 3 || code.length > 30) {
    return 'Mã lớp danh nghĩa phải dài 3–30 ký tự.';
  }
  if (!ADMINISTRATIVE_CODE_PATTERN.test(code)) {
    return 'Mã lớp danh nghĩa chỉ gồm chữ và số viết hoa, không có dấu cách hay ký tự đặc biệt.';
  }
  return null;
}
```

Hai nhánh của `administrativeCodeProblem` cho hai câu khác nhau: mã `'AB'` rơi nhánh độ dài (khớp `/3–30/`), còn `'DHK-TPM'` (7 ký tự) và `'dhktpm18a'` (9 ký tự) qua kiểm độ dài rồi rơi nhánh ký tự (khớp `/chữ và số/`).

Create `apps/api/src/common/semester-label.ts`:

```ts
/**
 * Nhãn một học kỳ: `HK1 2026-2027`. Không có cột `name` riêng (spec §2.1) —
 * tên là biểu thức của (năm học, kỳ), nên không có hai chỗ để nhãn lệch nhau.
 * Phải khớp hàm SQL `examcollect.semester_label` (migration
 * `ExpandMasterDataEntities`): test e2e Task 3 so hai bên.
 */
export function semesterLabel(academicYearStart: number, term: number): string {
  return `HK${term} ${academicYearStart}-${academicYearStart + 1}`;
}

/** `2026-09-01` -> `01/09/2026`, cho câu báo lỗi người đọc. */
export function formatDmy(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}
```

Create `apps/api/src/course/semester.rules.ts`:

```ts
/**
 * MỘT lớp kiểm tra học kỳ cho cả hai đường nhập (spec §6.2 nguyên tắc 6): nhập
 * tay gọi nó qua `SemesterService`, và import (plan E) gọi đúng hàm này cho từng
 * dòng. Hai bản kiểm tra là hai chỗ để chúng lệch nhau — rồi một file nhập được
 * thứ mà form từ chối, hoặc ngược lại.
 *
 * Trả MỌI lỗi (không dừng ở lỗi đầu), để người sửa file không phải chạy lại
 * nhiều lần mới hết lỗi.
 */
export interface SemesterInput {
  academicYearStart: number;
  term: number;
  /** `yyyy-mm-dd`. */
  startDate: string;
  endDate: string;
}

const YEAR_MIN = 2000;
const YEAR_MAX = 2999;

/** Ngày có thật theo dạng `yyyy-mm-dd` (từ chối `2026-02-30`, `31/01/2027`, rỗng). */
function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function semesterProblems(input: SemesterInput): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(input.academicYearStart) || input.academicYearStart < YEAR_MIN || input.academicYearStart > YEAR_MAX) {
    problems.push(`Năm học phải từ ${YEAR_MIN} đến ${YEAR_MAX}.`);
  }
  if (!Number.isInteger(input.term) || input.term < 1 || input.term > 3) {
    problems.push('Kỳ phải là 1, 2 hoặc 3 (một năm học có ba kỳ).');
  }
  const startOk = isRealIsoDate(input.startDate);
  const endOk = isRealIsoDate(input.endDate);
  if (!startOk) problems.push('Ngày bắt đầu phải là ngày có thật theo dạng yyyy-mm-dd.');
  if (!endOk) problems.push('Ngày kết thúc phải là ngày có thật theo dạng yyyy-mm-dd.');
  if (startOk && endOk && input.endDate < input.startDate) {
    problems.push('Ngày kết thúc không được trước ngày bắt đầu.');
  }
  return problems;
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `npx jest src/common/master-data-normalize.spec.ts src/common/semester-label.spec.ts src/course/semester.rules.spec.ts`
Expected: PASS. (So sánh `endDate < startDate` bằng chuỗi `yyyy-mm-dd` là đúng thứ tự thời gian vì đã qua `isRealIsoDate`.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/master-data-normalize.ts apps/api/src/common/master-data-normalize.spec.ts apps/api/src/common/semester-label.ts apps/api/src/common/semester-label.spec.ts apps/api/src/course/semester.rules.ts apps/api/src/course/semester.rules.spec.ts
git commit -m "feat(master-data): chuẩn hoá tên phòng/mã lớp, nhãn học kỳ, luật kiểm học kỳ dùng chung"
```

---

### Task 3: Migration mở rộng và bất biến ở tầng DB

**Files:**
- Create: `apps/api/src/database/migrations/1789600000000-ExpandMasterDataEntities.ts`
- Test: `apps/api/test/master-data-schema.e2e-spec.ts`
- Create: `apps/api/test/helpers/master-data.ts`

**Interfaces:**
- Consumes: `seedClass`, `seedExamSession` (Plan A `test/helpers/seed.ts`); `createTestAccount`.
- Produces (DB): bảng `examcollect.semester`, `room`, `administrative_class`, `student`; cột `class.semester_id`, `class.administrative_class_id`, `class.group_name`, `exam_session.room_id`; hàm `examcollect.semester_label(integer, smallint)`; view `examcollect.class_label(class_id, label, label_with_semester)`; ràng buộc `ex_exam_session_room_overlap` (theo `room_id`) và `ex_exam_session_room_overlap_legacy` (theo `room_name`, chỉ `room_id IS NULL`); trigger `trg_class_semester_guard`, `trg_semester_key_guard`.
- Produces (test helper, plan D–H dùng lại):

```ts
export function randomTag(length?: number): string;                 // HOA/số ngẫu nhiên, mặc định 10
export function freshTestYear(db: Queryable): Promise<number>;       // năm học >= 2200 chưa dùng
export function semesterDates(year: number, term: 1 | 2 | 3): { startDate: string; endDate: string };
export function purgeTestSemesters(db: Queryable): Promise<void>;   // xoá học kỳ >= 2200 không còn lớp
```

- [ ] **Step 1: Viết helper test dữ liệu nền**

Create `apps/api/test/helpers/master-data.ts`:

```ts
import { randomUUID } from 'crypto';
import type { Queryable } from './seed';

/**
 * Dữ liệu nền (học kỳ, phòng, mã lớp danh nghĩa) là bảng CHUNG, không thuộc
 * giảng viên nào, và e2e không dọn được chúng giữa các lần chạy như dọn tài
 * khoản. Hai cách giữ test độc lập với nhau và với lần chạy trước:
 *
 *   - tên/mã: hậu tố NGẪU NHIÊN, không theo thời gian. Hai lần chạy cách nhau
 *     vài phút có hậu tố thời gian gần như trùng đuôi, và luật "gần giống" sẽ
 *     cảnh báo giữa chúng (một ký tự đổi chỗ) ở những test không hề nói về nó.
 *   - học kỳ: một VÙNG TÊN riêng, năm học >= 2200. DB cho phép 2000–2999, dữ liệu
 *     thật là 2026–2027, nên hai bên không bao giờ chạm nhau.
 */

export function randomTag(length = 10): string {
  return randomUUID().replace(/-/g, '').slice(0, length).toUpperCase();
}

export const TEST_YEAR_FLOOR = 2200;

let yearCursor = 0;

/**
 * Năm học > 2200 chưa có học kỳ nào và chưa cấp trong tiến trình này.
 *
 * Năm `TEST_YEAR_FLOOR` (2200) KHÔNG bao giờ được cấp ở đây: nó dành cho các học kỳ MẶC ĐỊNH dùng chung (kỳ 1, 2, 3 của
 * năm 2200 — xem `ensureTestSemester`, plan D1), tạo một lần rồi dùng lại giữa mọi file test và mọi lần chạy. Cấp cả năm
 * 2200 ở đây thì một test có thể chiếm mất (2200, 1) trước khi helper kia tạo nó.
 */
export async function freshTestYear(db: Queryable): Promise<number> {
  const [row] = await db.query(
    `SELECT COALESCE(MAX(academic_year_start), 0)::int AS max FROM examcollect.semester WHERE academic_year_start >= ${TEST_YEAR_FLOOR}`,
  );
  const year = Math.max(row.max + 1, TEST_YEAR_FLOOR + 1, yearCursor + 1);
  yearCursor = year;
  return year;
}

/**
 * Ngày của (năm, kỳ) sao cho MỌI cặp (năm, kỳ) đều không chồng nhau: kỳ 1 từ
 * 01/09 tới 31/01 năm sau, kỳ 2 từ 01/02 tới 31/05, kỳ 3 từ 01/06 tới 31/08 — và
 * kỳ 3 của năm Y kết thúc đúng ngày trước kỳ 1 của năm Y+1.
 */
export function semesterDates(year: number, term: 1 | 2 | 3): { startDate: string; endDate: string } {
  if (term === 1) return { startDate: `${year}-09-01`, endDate: `${year + 1}-01-31` };
  if (term === 2) return { startDate: `${year + 1}-02-01`, endDate: `${year + 1}-05-31` };
  return { startDate: `${year + 1}-06-01`, endDate: `${year + 1}-08-31` };
}

/** Xoá học kỳ thuộc vùng tên test mà không còn lớp nào. Học kỳ còn lớp thì giữ — FK RESTRICT. */
export async function purgeTestSemesters(db: Queryable): Promise<void> {
  await db.query(
    `DELETE FROM examcollect.semester s
      WHERE s.academic_year_start >= ${TEST_YEAR_FLOOR}
        AND NOT EXISTS (SELECT 1 FROM examcollect.class c WHERE c.semester_id = s.id)`,
  );
}
```

- [ ] **Step 2: Viết test bất biến ở tầng DB (đỏ)**

Create `apps/api/test/master-data-schema.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { createTestAccount } from './helpers/create-account';
import { freshTestYear, purgeTestSemesters, randomTag, semesterDates } from './helpers/master-data';
import { seedClass, seedExamSession } from './helpers/seed';

/**
 * Bất biến của dữ liệu nền phải đúng KỂ CẢ khi ai đó ghi thẳng SQL — đó là lý do
 * chúng là ràng buộc/trigger chứ không phải kiểm tra trong service (spec §2.1,
 * §2.3, §2.4). Mọi ca ở đây bỏ qua service hoàn toàn.
 */
describe('Master data schema (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let teacherA: string;
  let teacherB: string;

  const createdSessions: string[] = [];
  const createdClasses: string[] = [];
  const createdRooms: string[] = [];
  const createdAdminClasses: string[] = [];

  async function expectDbError(promise: Promise<unknown>, code: string) {
    await expect(promise).rejects.toMatchObject({ code });
  }

  async function newSemester(term: 1 | 2 | 3 = 1, year?: number): Promise<{ id: string; year: number }> {
    const y = year ?? (await freshTestYear(ds));
    const { startDate, endDate } = semesterDates(y, term);
    const [row] = await ds.query(
      `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [y, term, startDate, endDate],
    );
    return { id: row.id, year: y };
  }

  async function newAdminClass(code = `ZZ${randomTag()}`): Promise<string> {
    const [row] = await ds.query(
      `INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`,
      [code],
    );
    createdAdminClasses.push(row.id);
    return row.id;
  }

  async function newRoom(name = `Phong ZZ${randomTag()}`): Promise<string> {
    const [row] = await ds.query(`INSERT INTO examcollect.room (name) VALUES ($1) RETURNING id`, [name]);
    createdRooms.push(row.id);
    return row.id;
  }

  async function newClass(teacherId: string, extra: { semesterId?: string; administrativeClassId?: string; groupName?: string } = {}) {
    const klass = await seedClass(ds, { teacherId, ...extra });
    createdClasses.push(klass.id);
    return klass;
  }

  async function newSession(opts: {
    teacherId: string;
    classId: string;
    start: Date;
    end: Date;
    roomId?: string;
    roomName?: string;
    status?: 'active' | 'collecting' | 'completed' | 'cancelled';
  }) {
    const session = await seedExamSession(ds, {
      teacherId: opts.teacherId,
      classId: opts.classId,
      startTime: opts.start,
      endTime: opts.end,
      roomId: opts.roomId,
      roomName: opts.roomName,
      status: opts.status ?? 'active',
    });
    createdSessions.push(session.id);
    return session;
  }

  const hour = 3_600_000;
  const day = 24 * hour;
  /** Một khung giờ trong tương lai xa, riêng cho từng ca, để các ca không đụng nhau. */
  let windowCursor = 0;
  function window(hours = 2) {
    windowCursor += 1;
    const start = new Date(Date.now() + (400 + windowCursor * 3) * day);
    return { start, end: new Date(start.getTime() + hours * hour) };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    teacherA = await createTestAccount(ds, { email: `mdschema_a_${randomTag()}@example.com`, password: 'correct-horse-battery', role: 'teacher' });
    teacherB = await createTestAccount(ds, { email: `mdschema_b_${randomTag()}@example.com`, password: 'correct-horse-battery', role: 'teacher' });
  });

  afterAll(async () => {
    // Dọn theo thứ tự FK; lỗi dọn không được làm đỏ một test đã xanh.
    const tryDelete = async (sql: string, ids: string[]) => {
      if (ids.length === 0) return;
      try {
        await ds.query(sql, [ids]);
      } catch {
        /* giữ lại: có thể còn tham chiếu từ test khác */
      }
    };
    await tryDelete(`DELETE FROM examcollect.exam_session WHERE id = ANY($1)`, createdSessions);
    await tryDelete(`DELETE FROM examcollect.class WHERE id = ANY($1)`, createdClasses);
    await tryDelete(`DELETE FROM examcollect.administrative_class WHERE id = ANY($1)`, createdAdminClasses);
    await tryDelete(`DELETE FROM examcollect.room WHERE id = ANY($1)`, createdRooms);
    await purgeTestSemesters(ds);
    await app.close();
  });

  describe('semester', () => {
    it('T-MD-7: hai học kỳ chồng ngày bị DB từ chối (23P01); hai kỳ liền kề thì được', async () => {
      const year = await freshTestYear(ds);
      await newSemester(1, year);
      // Cùng khoảng ngày với kỳ 1 nhưng ghi là kỳ 2 của cùng năm.
      const { startDate, endDate } = semesterDates(year, 1);
      await expectDbError(
        ds.query(
          `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date) VALUES ($1, 2, $2, $3)`,
          [year, startDate, endDate],
        ),
        '23P01',
      );
      // Kỳ 2 thật sự bắt đầu ngay sau khi kỳ 1 kết thúc: liền kề, không chồng.
      await newSemester(2, year);
    });

    it('một (năm học, kỳ) chỉ có một dòng (23505)', async () => {
      const year = await freshTestYear(ds);
      await newSemester(1, year);
      await expectDbError(
        ds.query(
          `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date)
           VALUES ($1, 1, '2900-01-01', '2900-02-01')`,
          [year],
        ),
        '23505',
      );
    });

    it('kỳ chỉ 1–3, ngày kết thúc không trước ngày bắt đầu, năm 2000–2999 (23514)', async () => {
      const year = await freshTestYear(ds);
      await expectDbError(
        ds.query(`INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date) VALUES ($1, 4, '2901-01-01', '2901-02-01')`, [year]),
        '23514',
      );
      await expectDbError(
        ds.query(`INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date) VALUES ($1, 1, '2902-02-01', '2902-01-01')`, [year]),
        '23514',
      );
      await expectDbError(
        ds.query(`INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date) VALUES (3000, 1, '2903-01-01', '2903-02-01')`),
        '23514',
      );
    });

    it('T-MD-6: không đổi được năm học hay kỳ khi đã có lớp; đổi ngày thì được', async () => {
      const sem = await newSemester(1);
      const adm = await newAdminClass();
      await newClass(teacherA, { semesterId: sem.id, administrativeClassId: adm });

      await expectDbError(ds.query(`UPDATE examcollect.semester SET term = 2 WHERE id = $1`, [sem.id]), '23503');
      await expectDbError(
        ds.query(`UPDATE examcollect.semester SET academic_year_start = academic_year_start + 1 WHERE id = $1`, [sem.id]),
        '23503',
      );
      // Ngày là thứ sửa được.
      await ds.query(`UPDATE examcollect.semester SET end_date = end_date - 1 WHERE id = $1`, [sem.id]);
    });

    it('học kỳ chưa có lớp thì đổi kỳ thoải mái', async () => {
      const sem = await newSemester(1);
      await ds.query(`UPDATE examcollect.semester SET term = 2 WHERE id = $1`, [sem.id]);
    });

    it('hàm SQL semester_label cho đúng nhãn mà code TypeScript dùng', async () => {
      const [row] = await ds.query(`SELECT examcollect.semester_label(2026, 1::smallint) AS label`);
      expect(row.label).toBe('HK1 2026-2027');
    });
  });

  describe('administrative_class', () => {
    it('T-MD-3 (tầng DB): mã phải là chữ HOA và số, 3–30 ký tự (23514)', async () => {
      await expectDbError(ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ('dhktpm18a')`), '23514');
      await expectDbError(ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ('DHK TPM')`), '23514');
      await expectDbError(ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ('AB')`), '23514');
      await expectDbError(ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ('${'A'.repeat(31)}')`), '23514');
    });

    it('mã trùng bị chặn (23505)', async () => {
      const code = `ZZ${randomTag()}`;
      await newAdminClass(code);
      await expectDbError(ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1)`, [code]), '23505');
    });
  });

  describe('room', () => {
    it('tên không có khoảng trắng đầu/cuối hay hai khoảng trắng liền nhau (23514)', async () => {
      await expectDbError(ds.query(`INSERT INTO examcollect.room (name) VALUES (' Phong A')`), '23514');
      await expectDbError(ds.query(`INSERT INTO examcollect.room (name) VALUES ('Phong  A')`), '23514');
      await expectDbError(ds.query(`INSERT INTO examcollect.room (name) VALUES ('')`), '23514');
    });

    it('tên trùng không phân biệt hoa-thường là một phòng (23505)', async () => {
      const tag = randomTag();
      await newRoom(`Phong zz${tag}`);
      await expectDbError(ds.query(`INSERT INTO examcollect.room (name) VALUES ($1)`, [`PHONG ZZ${tag}`]), '23505');
    });

    it('sức chứa 1–1000 hoặc trống (23514)', async () => {
      await expectDbError(ds.query(`INSERT INTO examcollect.room (name, capacity) VALUES ($1, 0)`, [`Phong ZZ${randomTag()}`]), '23514');
      await expectDbError(ds.query(`INSERT INTO examcollect.room (name, capacity) VALUES ($1, 1001)`, [`Phong ZZ${randomTag()}`]), '23514');
      await ds.query(`INSERT INTO examcollect.room (name, capacity) VALUES ($1, 1) RETURNING id`, [`Phong ZZ${randomTag()}`]).then((r) => createdRooms.push(r[0].id));
    });

    it('mặc định đang hoạt động', async () => {
      const id = await newRoom();
      const [row] = await ds.query(`SELECT is_active FROM examcollect.room WHERE id = $1`, [id]);
      expect(row.is_active).toBe(true);
    });
  });

  describe('student', () => {
    it('MSSV 4–20 ký tự chữ/số, duy nhất không phân biệt hoa-thường', async () => {
      const mssv = `SV${randomTag(8)}`;
      await ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'Nguyễn Văn A')`, [mssv]);
      await expectDbError(ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'B')`, [mssv.toLowerCase()]), '23505');
      await expectDbError(ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ('AB', 'B')`), '23514');
      await expectDbError(ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, '   ')`, [`SV${randomTag(8)}`]), '23514');
      await ds.query(`DELETE FROM examcollect.student WHERE mssv = $1`, [mssv]);
    });
  });

  describe('class', () => {
    it('T-MD-1: tham chiếu học kỳ hoặc mã lớp danh nghĩa không tồn tại bị DB từ chối (23503)', async () => {
      const ghost = '00000000-0000-4000-8000-0000000000aa';
      // Qua helper seed (không phải SQL thô — guard của plan A cấm SQL thô dựng lớp): helper
      // chuyển nguyên id ma xuống DB, và DB là bên từ chối.
      await expectDbError(seedClass(ds, { teacherId: teacherA, semesterId: ghost }), '23503');
      await expectDbError(seedClass(ds, { teacherId: teacherA, administrativeClassId: ghost }), '23503');
    });

    it('T-MD-2: hai lớp cùng (kỳ, mã, nhóm) bị chặn; khác nhóm thì được; nhóm mặc định là chuỗi rỗng, không phải NULL', async () => {
      const sem = await newSemester(1);
      const adm = await newAdminClass();
      const first = await newClass(teacherA, { semesterId: sem.id, administrativeClassId: adm });

      const [row] = await ds.query(`SELECT group_name FROM examcollect.class WHERE id = $1`, [first.id]);
      expect(row.group_name).toBe('');

      // Lớp thứ hai cùng (kỳ, mã, nhóm ''): giảng viên khác để không dính khoá cũ (teacher, môn, tên).
      await expectDbError(
        seedClass(ds, { teacherId: teacherB, semesterId: sem.id, administrativeClassId: adm, groupName: '' }),
        '23505',
      );
      await newClass(teacherB, { semesterId: sem.id, administrativeClassId: adm, groupName: 'Nhóm 1' });
    });

    it('T-MD-5: không đổi được học kỳ của lớp đã có phiên; lớp chưa có phiên thì đổi được', async () => {
      const s1 = await newSemester(1);
      const s2 = await newSemester(1);
      const adm = await newAdminClass();
      const withSession = await newClass(teacherA, { semesterId: s1.id, administrativeClassId: adm });
      const { start, end } = window();
      await newSession({ teacherId: teacherA, classId: withSession.id, start, end });

      await expectDbError(
        ds.query(`UPDATE examcollect.class SET semester_id = $1 WHERE id = $2`, [s2.id, withSession.id]),
        '23503',
      );

      const free = await newClass(teacherA, { semesterId: s1.id, administrativeClassId: await newAdminClass() });
      await ds.query(`UPDATE examcollect.class SET semester_id = $1 WHERE id = $2`, [s2.id, free.id]);
    });

    it('gán học kỳ LẦN ĐẦU cho lớp đã có phiên (NULL -> giá trị) không phải là "đổi" (Review Focus 2)', async () => {
      const sem = await newSemester(1);
      const legacy = await newClass(teacherA); // chưa có học kỳ, như dữ liệu cũ
      const { start, end } = window();
      await newSession({ teacherId: teacherA, classId: legacy.id, start, end });

      await ds.query(`UPDATE examcollect.class SET semester_id = $1 WHERE id = $2`, [sem.id, legacy.id]);
      const [row] = await ds.query(`SELECT semester_id FROM examcollect.class WHERE id = $1`, [legacy.id]);
      expect(row.semester_id).toBe(sem.id);
    });
  });

  describe('exam_session: chống trùng phòng', () => {
    /** Hai giảng viên và hai lớp khác nhau, để chỉ còn ràng buộc phòng có thể phản đối. */
    async function twoSides() {
      const a = await newClass(teacherA);
      const b = await newClass(teacherB);
      return { a, b };
    }

    it('T-ROOM-1: hai phiên chưa kết thúc cùng room_id, giờ chồng nhau -> 23P01', async () => {
      const room = await newRoom();
      const { a, b } = await twoSides();
      const { start, end } = window();
      await newSession({ teacherId: teacherA, classId: a.id, start, end, roomId: room });
      await expectDbError(
        newSession({ teacherId: teacherB, classId: b.id, start: new Date(start.getTime() + hour), end: new Date(end.getTime() + hour), roomId: room }),
        '23P01',
      );
    });

    it('khác phòng cùng giờ thì được', async () => {
      const r1 = await newRoom();
      const r2 = await newRoom();
      const { a, b } = await twoSides();
      const { start, end } = window();
      await newSession({ teacherId: teacherA, classId: a.id, start, end, roomId: r1 });
      await newSession({ teacherId: teacherB, classId: b.id, start, end, roomId: r2 });
    });

    it('cùng phòng, phiên sau bắt đầu đúng lúc phiên trước kết thúc thì được (khoảng nửa mở "[)")', async () => {
      const room = await newRoom();
      // Hai GIẢNG VIÊN khác nhau: cùng một giảng viên còn bị luật giãn cách 30 phút chặn,
      // và ca này chỉ nói về phòng.
      const { a, b } = await twoSides();
      const { start, end } = window();
      await newSession({ teacherId: teacherA, classId: a.id, start, end, roomId: room });
      await newSession({ teacherId: teacherB, classId: b.id, start: end, end: new Date(end.getTime() + 2 * hour), roomId: room });
    });

    it('phiên đã collecting/completed/cancelled không giữ phòng', async () => {
      const room = await newRoom();
      const b = await newClass(teacherB);
      const { start, end } = window();
      for (const status of ['collecting', 'completed', 'cancelled'] as const) {
        const done = await newClass(teacherA);
        await newSession({ teacherId: teacherA, classId: done.id, start, end, roomId: room, status });
      }
      // Ba phiên đã "xong" cùng phòng, cùng giờ không cản phiên đang hoạt động này.
      await newSession({ teacherId: teacherB, classId: b.id, start, end, roomId: room });
    });

    it('ràng buộc cũ theo TÊN vẫn bảo vệ dòng chưa có room_id (code cũ còn chạy giữa các bước cutover)', async () => {
      const { a, b } = await twoSides();
      const { start, end } = window();
      const roomName = `PHONG CU ${randomTag()}`;
      await newSession({ teacherId: teacherA, classId: a.id, start, end, roomName });
      await expectDbError(
        newSession({ teacherId: teacherB, classId: b.id, start, end, roomName }),
        '23P01',
      );
    });

    it('ràng buộc cũ theo tên CHỈ áp cho dòng chưa có room_id: cùng chuỗi tên nhưng đã có room_id thì không bị nó chặn', async () => {
      const room = await newRoom();
      const other = await newRoom();
      const { a, b } = await twoSides();
      const { start, end } = window();
      const sameSnapshot = `Ban chup ${randomTag()}`;
      // Hai phòng THẬT KHÁC NHAU cùng mang một bản chụp tên (một phòng từng đổi tên): không được coi là đặt trùng.
      await newSession({ teacherId: teacherA, classId: a.id, start, end, roomId: room, roomName: sameSnapshot });
      await newSession({ teacherId: teacherB, classId: b.id, start, end, roomId: other, roomName: sameSnapshot });
    });

    it('phòng đã có phiên không xoá được (FK RESTRICT)', async () => {
      const room = await newRoom();
      const { a } = await twoSides();
      const { start, end } = window();
      await newSession({ teacherId: teacherA, classId: a.id, start, end, roomId: room });
      await expectDbError(ds.query(`DELETE FROM examcollect.room WHERE id = $1`, [room]), '23503');
    });

    it('ràng buộc chống trùng lớp và giãn cách giảng viên không bị mất', async () => {
      const room1 = await newRoom();
      const room2 = await newRoom();
      const a = await newClass(teacherA);
      const { start, end } = window();
      await newSession({ teacherId: teacherA, classId: a.id, start, end, roomId: room1 });
      // Cùng lớp, cùng giờ, phòng khác -> ex_exam_session_class_overlap.
      await expectDbError(
        newSession({ teacherId: teacherB, classId: a.id, start, end, roomId: room2 }),
        '23P01',
      );
      // Cùng giảng viên cách nhau 10 phút -> ex_exam_session_teacher_gap.
      const c = await newClass(teacherA);
      await expectDbError(
        newSession({ teacherId: teacherA, classId: c.id, start: new Date(end.getTime() + 10 * 60_000), end: new Date(end.getTime() + 70 * 60_000), roomId: room2 }),
        '23P01',
      );
    });
  });

  describe('class_label (view)', () => {
    it('nhãn = mã, hoặc "mã – nhóm"; kèm kỳ khi cần phân biệt', async () => {
      const sem = await newSemester(1);
      const code = `ZZ${randomTag()}`;
      const adm = await newAdminClass(code);
      const plain = await newClass(teacherA, { semesterId: sem.id, administrativeClassId: adm });
      const grouped = await newClass(teacherA, { semesterId: sem.id, administrativeClassId: adm, groupName: 'Nhóm 1' });

      const rows = await ds.query(
        `SELECT class_id, label, label_with_semester FROM examcollect.class_label WHERE class_id = ANY($1)`,
        [[plain.id, grouped.id]],
      );
      const byId = new Map(rows.map((r: { class_id: string }) => [r.class_id, r]));
      const semLabel = `HK1 ${sem.year}-${sem.year + 1}`;
      expect(byId.get(plain.id)).toMatchObject({ label: code, label_with_semester: `${code} · ${semLabel}` });
      expect(byId.get(grouped.id)).toMatchObject({
        label: `${code} – Nhóm 1`,
        label_with_semester: `${code} – Nhóm 1 · ${semLabel}`,
      });
    });

    it('lớp cũ chưa gán mã danh nghĩa rơi về tên cũ, không ra NULL', async () => {
      const legacy = await newClass(teacherA, { groupName: 'Lớp cũ chưa gán' });
      const [row] = await ds.query(`SELECT label, label_with_semester FROM examcollect.class_label WHERE class_id = $1`, [legacy.id]);
      expect(row.label).toBe(legacy.label);
      expect(row.label_with_semester).toBe(legacy.label);
    });
  });

  describe('nới lỏng cho code cũ', () => {
    it('class.name và enrollment.student_name cho phép NULL (code mới không ghi chúng)', async () => {
      const [cls] = await ds.query(
        `SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'examcollect' AND table_name = 'class' AND column_name = 'name'`,
      );
      const [enr] = await ds.query(
        `SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'examcollect' AND table_name = 'enrollment' AND column_name = 'student_name'`,
      );
      expect(cls.is_nullable).toBe('YES');
      expect(enr.is_nullable).toBe('YES');
    });
  });
});
```

Test này gọi `seedClass({ semesterId, administrativeClassId })` và `seedExamSession({ roomId })` — hai tuỳ chọn mới của helper seed, thêm ngay ở bước dưới.

- [ ] **Step 3: Mở rộng `test/helpers/seed.ts` bằng các cột mới**

Mặc định không đổi hành vi: các cột mới ghi NULL (hoặc `''` cho `group_name`) khi test không nói gì.

Trong `SeedClassOptions` thêm hai trường sau `courseName?`:

```ts
  /** Học kỳ của lớp (hàng trong `semester`). Mặc định NULL — chỉ test về dữ liệu nền cần nó. */
  semesterId?: string;
  /** Lớp danh nghĩa (hàng trong `administrative_class`). Mặc định NULL. */
  administrativeClassId?: string;
```

Thay thân `seedClass` bằng bản ghi cả cột mới (tên cũ vẫn ghi vào `name` như trước):

```ts
export async function seedClass(db: Queryable, o: SeedClassOptions): Promise<SeededClass> {
  const code = o.code ?? `ADM${stamp()}`;
  const groupName = o.groupName ?? '';
  const label = classLabel(code, groupName);
  const [row] = await db.query(
    `INSERT INTO examcollect.class
       (course_name, name, teacher_id, semester_id, administrative_class_id, group_name)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [o.courseName ?? COURSE_NAME, label, o.teacherId, o.semesterId ?? null, o.administrativeClassId ?? null, groupName],
  );
  return { id: row.id as string, code, groupName, label };
}
```

Trong `SeedExamSessionOptions` thêm sau `courseName?`:

```ts
  /** Phòng thật (hàng trong `room`). Mặc định NULL: phiên "kiểu cũ" chỉ có bản chụp tên phòng. */
  roomId?: string;
```

Thay câu `INSERT` trong `seedExamSession` bằng bản có `room_id`:

```ts
  const [row] = await db.query(
    `INSERT INTO examcollect.exam_session
       (name, code, class_id, teacher_id, exam_type, start_time, end_time, status,
        semester_name, course_name, room_name, room_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      o.name ?? `Phiên ${s}`,
      code,
      o.classId,
      o.teacherId,
      o.examType ?? 'TK',
      o.startTime.toISOString(),
      o.endTime.toISOString(),
      o.status ?? 'active',
      semesterName,
      courseName,
      roomName,
      o.roomId ?? null,
    ],
  );
```

- [ ] **Step 4: Chạy để thấy đỏ**

Run (từ `apps/api`): `npx jest --config ./test/jest-e2e.json test/master-data-schema.e2e-spec.ts`
Expected: FAIL — bảng `examcollect.semester` chưa tồn tại (mọi ca đỏ).

- [ ] **Step 5: Viết migration**

Create `apps/api/src/database/migrations/1789600000000-ExpandMasterDataEntities.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Khôi phục dữ liệu nền có phân tầng — nửa MỞ RỘNG (spec 2026-10-04 §8.4 bước 1).
 *
 * Nửa này chỉ THÊM, cộng hai nới lỏng có chủ ý. Lý do tách làm hai nửa: migration
 * chạy TAY, DB dùng chung, code deploy riêng — nên mỗi trạng thái trung gian
 * (sau mở rộng, sau backfill, sau deploy) phải chạy được với cả code cũ lẫn mới.
 * Nửa THU HẸP (NOT NULL, khoá ngoại sinh viên, bỏ cột cũ) là một migration và một
 * PR riêng, sau khi backfill đã chạy (plan H).
 *
 * ## Hai nới lỏng ngoài "chỉ thêm"
 *
 * 1. `class.name` và `enrollment.student_name` bỏ NOT NULL. Code mới không còn
 *    ghi hai cột này (tên lớp là biểu thức của mã + nhóm; tên sinh viên nằm ở
 *    `student`). Giữ NOT NULL thì mọi lần tạo lớp hay thêm sinh viên bằng code
 *    mới, giữa bước triển khai và bước thu hẹp, chết ở 23502.
 * 2. `ex_exam_session_room_overlap` KHÔNG bị bỏ ngay. Nó được dựng lại theo
 *    `room_id`, còn bản theo TÊN giữ lại dưới tên `..._legacy` và chỉ áp cho dòng
 *    chưa có `room_id`. Code cũ còn chạy giữa bước mở rộng và bước triển khai
 *    không ghi `room_id`; bỏ hẳn bản cũ thì khoảng đó đặt trùng phòng không ai chặn.
 *    Chỉ áp cho `room_id IS NULL` còn tránh một lỗi ngược: hai phòng THẬT khác
 *    nhau cùng mang một bản chụp tên (một phòng từng đổi tên) không được coi là
 *    đặt trùng.
 *
 * ## Vì sao bất biến nằm ở DB
 *
 * "Không đổi kỳ của lớp đã có phiên" và "không đổi năm/kỳ của học kỳ đã có lớp"
 * là trigger, không chỉ là kiểm tra trong service: service không phải đường ghi
 * duy nhất vào bảng (backfill, SQL tay, lần sửa sau). Service chỉ thêm câu báo
 * lỗi đọc được.
 *
 * Trigger chỉ chặn khi giá trị CŨ khác NULL: gán lần đầu (NULL -> giá trị) là việc
 * backfill phải làm cho mọi lớp đã có phiên, và không phải là một "thay đổi".
 *
 * ## Không có ở đây
 *
 * - Khoá ngoại `enrollment.student_mssv -> student.mssv`: code cũ còn ghi
 *   enrollment cho MSSV chưa có trong `student`. Nó đến cùng migration thu hẹp.
 * - Dòng dữ liệu nào: backfill là một script riêng, chạy lại được (plan H).
 */
export class ExpandMasterDataEntities1789600000000 implements MigrationInterface {
  name = 'ExpandMasterDataEntities1789600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.startTransaction();
    try {
      // ------------------------------------------------------------ hàm nhãn
      await q.query(`
        CREATE FUNCTION "examcollect"."semester_label"(p_year integer, p_term smallint)
        RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
        AS $fn$ SELECT 'HK' || p_term::text || ' ' || p_year::text || '-' || (p_year + 1)::text $fn$
      `);

      // ------------------------------------------------------------ semester
      await q.query(`
        CREATE TABLE "examcollect"."semester" (
          "id"                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "created_at"          timestamptz NOT NULL DEFAULT now(),
          "updated_at"          timestamptz NOT NULL DEFAULT now(),
          "academic_year_start" integer  NOT NULL,
          "term"                smallint NOT NULL,
          "start_date"          date NOT NULL,
          "end_date"            date NOT NULL,
          CONSTRAINT "ck_semester_term"  CHECK ("term" IN (1, 2, 3)),
          CONSTRAINT "ck_semester_dates" CHECK ("end_date" >= "start_date"),
          CONSTRAINT "ck_semester_year"  CHECK ("academic_year_start" BETWEEN 2000 AND 2999),
          CONSTRAINT "ex_semester_dates_overlap"
            EXCLUDE USING gist (daterange("start_date", "end_date", '[]') WITH &&)
        )
      `);
      await q.query(`
        CREATE UNIQUE INDEX "uq_semester_year_term"
          ON "examcollect"."semester" ("academic_year_start", "term")
      `);

      // ------------------------------------------------- administrative_class
      await q.query(`
        CREATE TABLE "examcollect"."administrative_class" (
          "id"         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "created_at" timestamptz NOT NULL DEFAULT now(),
          "updated_at" timestamptz NOT NULL DEFAULT now(),
          "code"       citext NOT NULL,
          CONSTRAINT "ck_administrative_class_code"
            CHECK ("code"::text ~ '^[A-Z0-9]{3,30}$' AND "code"::text = upper("code"::text))
        )
      `);
      await q.query(`
        CREATE UNIQUE INDEX "uq_administrative_class_code"
          ON "examcollect"."administrative_class" ("code")
      `);

      // ----------------------------------------------------------------- room
      await q.query(`
        CREATE TABLE "examcollect"."room" (
          "id"         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "created_at" timestamptz NOT NULL DEFAULT now(),
          "updated_at" timestamptz NOT NULL DEFAULT now(),
          "name"       citext NOT NULL,
          "capacity"   integer,
          "is_active"  boolean NOT NULL DEFAULT true,
          CONSTRAINT "ck_room_name"
            CHECK ("name"::text = btrim("name"::text) AND "name"::text !~ '\\s{2,}' AND length("name"::text) BETWEEN 1 AND 100),
          CONSTRAINT "ck_room_capacity" CHECK ("capacity" IS NULL OR "capacity" BETWEEN 1 AND 1000)
        )
      `);
      await q.query(`CREATE UNIQUE INDEX "uq_room_name" ON "examcollect"."room" ("name")`);

      // -------------------------------------------------------------- student
      await q.query(`
        CREATE TABLE "examcollect"."student" (
          "id"         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "created_at" timestamptz NOT NULL DEFAULT now(),
          "updated_at" timestamptz NOT NULL DEFAULT now(),
          "mssv"       citext NOT NULL,
          "full_name"  varchar(150) NOT NULL,
          CONSTRAINT "ck_student_mssv" CHECK ("mssv" ~ '^[A-Za-z0-9]{4,20}$'),
          CONSTRAINT "ck_student_full_name" CHECK (btrim("full_name") <> '')
        )
      `);
      await q.query(`CREATE UNIQUE INDEX "uq_student_mssv" ON "examcollect"."student" ("mssv")`);

      // ---------------------------------------------------------------- class
      await q.query(`
        ALTER TABLE "examcollect"."class"
          ADD COLUMN "semester_id" uuid,
          ADD COLUMN "administrative_class_id" uuid,
          ADD COLUMN "group_name" varchar(50) NOT NULL DEFAULT '',
          ADD CONSTRAINT "fk_class_semester" FOREIGN KEY ("semester_id")
              REFERENCES "examcollect"."semester"("id") ON DELETE RESTRICT,
          ADD CONSTRAINT "fk_class_administrative_class" FOREIGN KEY ("administrative_class_id")
              REFERENCES "examcollect"."administrative_class"("id") ON DELETE RESTRICT,
          ADD CONSTRAINT "ck_class_group_name" CHECK ("group_name" = btrim("group_name")),
          ALTER COLUMN "name" DROP NOT NULL
      `);
      // `group_name` mặc định '' chứ không NULL: Postgres coi mọi NULL là khác
      // nhau, nên với NULL khoá duy nhất dưới đây bị vô hiệu — cùng lỗ hổng mà
      // spec 2026-09-20 §3.4 đã tìm thấy ở `exam_session.class_id`.
      await q.query(`
        CREATE UNIQUE INDEX "uq_class_semester_admin_group"
          ON "examcollect"."class" ("semester_id", "administrative_class_id", "group_name")
      `);

      // ----------------------------------------------------------- enrollment
      await q.query(`ALTER TABLE "examcollect"."enrollment" ALTER COLUMN "student_name" DROP NOT NULL`);

      // --------------------------------------------------------- exam_session
      await q.query(`
        ALTER TABLE "examcollect"."exam_session"
          ADD COLUMN "room_id" uuid,
          ADD CONSTRAINT "fk_exam_session_room" FOREIGN KEY ("room_id")
              REFERENCES "examcollect"."room"("id") ON DELETE RESTRICT
      `);
      await q.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "ex_exam_session_room_overlap"`);
      // Cùng vị từ trạng thái với hai ràng buộc anh em: collecting/completed/cancelled
      // không giữ phòng. NULL không bao giờ thoả `WITH =`, nên dòng chưa có room_id
      // không chạm ràng buộc này.
      await q.query(`
        ALTER TABLE "examcollect"."exam_session"
          ADD CONSTRAINT "ex_exam_session_room_overlap"
          EXCLUDE USING gist ("room_id" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&)
          WHERE ("status" <> 'collecting' AND "status" <> 'completed' AND "status" <> 'cancelled')
      `);
      await q.query(`
        ALTER TABLE "examcollect"."exam_session"
          ADD CONSTRAINT "ex_exam_session_room_overlap_legacy"
          EXCLUDE USING gist ("room_name" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&)
          WHERE ("status" <> 'collecting' AND "status" <> 'completed' AND "status" <> 'cancelled'
                 AND "room_id" IS NULL)
      `);

      // ---------------------------------------------------------- trigger kỳ
      // Mã lỗi là foreign_key_violation (23503): PostgresExceptionFilter đã đổi nó
      // thành 409 — đúng loại: xung đột với dữ liệu đang tồn tại.
      await q.query(`
        CREATE FUNCTION "examcollect"."guard_class_semester_change"()
        RETURNS trigger LANGUAGE plpgsql SET search_path = examcollect, public
        AS $$
        BEGIN
          IF OLD.semester_id IS NOT NULL
             AND NEW.semester_id IS DISTINCT FROM OLD.semester_id
             AND EXISTS (SELECT 1 FROM examcollect.exam_session s WHERE s.class_id = OLD.id) THEN
            RAISE EXCEPTION 'Không đổi được học kỳ của lớp % vì lớp đã có phiên thi', OLD.id
              USING ERRCODE = 'foreign_key_violation';
          END IF;
          RETURN NEW;
        END
        $$
      `);
      await q.query(`
        CREATE TRIGGER "trg_class_semester_guard"
          BEFORE UPDATE OF "semester_id" ON "examcollect"."class"
          FOR EACH ROW EXECUTE FUNCTION "examcollect"."guard_class_semester_change"()
      `);
      await q.query(`
        CREATE FUNCTION "examcollect"."guard_semester_key_change"()
        RETURNS trigger LANGUAGE plpgsql SET search_path = examcollect, public
        AS $$
        BEGIN
          IF (NEW.academic_year_start IS DISTINCT FROM OLD.academic_year_start
              OR NEW.term IS DISTINCT FROM OLD.term)
             AND EXISTS (SELECT 1 FROM examcollect.class c WHERE c.semester_id = OLD.id) THEN
            RAISE EXCEPTION 'Không đổi được năm học hay kỳ của học kỳ % vì đã có lớp thuộc nó', OLD.id
              USING ERRCODE = 'foreign_key_violation';
          END IF;
          RETURN NEW;
        END
        $$
      `);
      await q.query(`
        CREATE TRIGGER "trg_semester_key_guard"
          BEFORE UPDATE OF "academic_year_start", "term" ON "examcollect"."semester"
          FOR EACH ROW EXECUTE FUNCTION "examcollect"."guard_semester_key_change"()
      `);

      // ------------------------------------------------------------ class_label
      // MỘT nguồn duy nhất cho nhãn lớp (spec §2.5): mã danh nghĩa + nhóm, kèm kỳ
      // khi cần phân biệt. COALESCE về `class.name` chỉ để lớp CŨ chưa backfill
      // vẫn có nhãn; migration thu hẹp dựng lại view không còn nhánh đó.
      await q.query(`
        CREATE VIEW "examcollect"."class_label" AS
        SELECT c.id AS class_id,
               COALESCE(
                 ac.code::text || CASE WHEN c.group_name = '' THEN '' ELSE ' – ' || c.group_name END,
                 c.name
               ) AS label,
               COALESCE(
                 ac.code::text || CASE WHEN c.group_name = '' THEN '' ELSE ' – ' || c.group_name END
                   || ' · ' || examcollect.semester_label(sem.academic_year_start, sem.term),
                 ac.code::text || CASE WHEN c.group_name = '' THEN '' ELSE ' – ' || c.group_name END,
                 c.name
               ) AS label_with_semester
          FROM examcollect.class c
          LEFT JOIN examcollect.administrative_class ac ON ac.id = c.administrative_class_id
          LEFT JOIN examcollect.semester sem ON sem.id = c.semester_id
      `);

      await q.commitTransaction();
    } catch (error) {
      await q.rollbackTransaction();
      throw error;
    }
  }

  /**
   * Đảo ngược được (khác nửa thu hẹp): mọi thứ ở đây là thêm. Ngoại lệ là hai
   * câu `SET NOT NULL`, chúng sẽ nổ nếu đã có dòng NULL — đúng, vì khi đó "đảo
   * ngược" nghĩa là mất dữ liệu chứ không còn là một phép đảo.
   */
  public async down(q: QueryRunner): Promise<void> {
    await q.startTransaction();
    try {
      await q.query(`DROP VIEW IF EXISTS "examcollect"."class_label"`);
      await q.query(`DROP TRIGGER IF EXISTS "trg_semester_key_guard" ON "examcollect"."semester"`);
      await q.query(`DROP FUNCTION IF EXISTS "examcollect"."guard_semester_key_change"()`);
      await q.query(`DROP TRIGGER IF EXISTS "trg_class_semester_guard" ON "examcollect"."class"`);
      await q.query(`DROP FUNCTION IF EXISTS "examcollect"."guard_class_semester_change"()`);

      await q.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "ex_exam_session_room_overlap_legacy"`);
      await q.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "ex_exam_session_room_overlap"`);
      await q.query(`
        ALTER TABLE "examcollect"."exam_session"
          ADD CONSTRAINT "ex_exam_session_room_overlap"
          EXCLUDE USING gist ("room_name" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&)
          WHERE ("status" <> 'collecting' AND "status" <> 'completed' AND "status" <> 'cancelled')
      `);
      await q.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN "room_id"`);

      await q.query(`ALTER TABLE "examcollect"."enrollment" ALTER COLUMN "student_name" SET NOT NULL`);

      await q.query(`DROP INDEX "examcollect"."uq_class_semester_admin_group"`);
      await q.query(`
        ALTER TABLE "examcollect"."class"
          DROP COLUMN "group_name",
          DROP COLUMN "administrative_class_id",
          DROP COLUMN "semester_id",
          ALTER COLUMN "name" SET NOT NULL
      `);

      await q.query(`DROP TABLE "examcollect"."student"`);
      await q.query(`DROP TABLE "examcollect"."room"`);
      await q.query(`DROP TABLE "examcollect"."administrative_class"`);
      await q.query(`DROP TABLE "examcollect"."semester"`);
      await q.query(`DROP FUNCTION IF EXISTS "examcollect"."semester_label"(integer, smallint)`);
      await q.commitTransaction();
    } catch (error) {
      await q.rollbackTransaction();
      throw error;
    }
  }
}
```

Lưu ý hai chỗ dễ sai khi chép:
- Trong `ck_room_name`, biểu thức `'\\s{2,}'` nằm trong template literal TypeScript nên `\\s` ra `\s` ở SQL. Viết `\s` một dấu gạch ngược là một lỗi: JS ăn nó.
- Các thân hàm dùng `$$` / `$fn$` không chứa `${`, nên không bị template literal nội suy.

- [ ] **Step 6: Áp migration lên DB local và chạy test**

```powershell
cd apps/api
$env:DATABASE_URL = 'postgresql://examcollect_admin:examcollect_admin_password@localhost:5442/examcollect'
$env:DATABASE_SSL = 'false'
pnpm migration:run
npx jest --config ./test/jest-e2e.json test/master-data-schema.e2e-spec.ts
```

Expected: migration áp sạch (một dòng `ExpandMasterDataEntities1789600000000 has been executed successfully`); test PASS. Nếu `migration:run` dừng ở `AddAiUsage` với "đã tồn tại" thì bạn đang trỏ nhầm Supabase (xem plan A Task 0 Step 3).

- [ ] **Step 7: Kiểm đường lùi một lần, rồi áp lại**

```powershell
pnpm migration:revert
pnpm migration:run
```

Expected: `revert` chạy sạch (đối tượng mới biến mất, ràng buộc phòng cũ trở lại), `run` lại áp sạch. Nếu `revert` nổ ở `SET NOT NULL` thì có dòng NULL (vd lớp do e2e Task 5+ tạo sau này) — chỉ chạy bước này ngay sau Task 3, khi chưa có dữ liệu mới.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/database/migrations/1789600000000-ExpandMasterDataEntities.ts apps/api/test/master-data-schema.e2e-spec.ts apps/api/test/helpers/master-data.ts apps/api/test/helpers/seed.ts
git commit -m "feat(master-data): migration mở rộng — semester, room, lớp danh nghĩa, student, view nhãn lớp, bất biến ở DB"
```

---

### Task 4: Entity, đăng ký, và dọn DTO mồ côi

**Files:**
- Create: `apps/api/src/course/entities/semester.entity.ts`, `room.entity.ts`, `administrative-class.entity.ts`, `student.entity.ts`
- Modify: `apps/api/src/course/entities/class.entity.ts`, `enrollment.entity.ts`, `apps/api/src/exam-session/entities/exam-session.entity.ts`
- Modify: `apps/api/src/database/data-source.ts`, `apps/api/src/database/verify-schema.ts`, `apps/api/src/course/course.module.ts`
- Modify: `apps/api/src/course/dto/course.dto.ts`
- Test: `apps/api/test/entity-schema.e2e-spec.ts` (đã có; không sửa)

**Interfaces:**
- Produces (TypeScript):

```ts
class SemesterEntity extends BaseEntity { academicYearStart: number; term: number; startDate: string; endDate: string }
class RoomEntity extends BaseEntity { name: string; capacity: number | null; isActive: boolean }
class AdministrativeClassEntity extends BaseEntity { code: string }
class StudentEntity extends BaseEntity { mssv: string; fullName: string }
// ClassEntity thêm: semesterId: string | null; semester: SemesterEntity | null;
//   administrativeClassId: string | null; administrativeClass: AdministrativeClassEntity | null; groupName: string
//   và name thành string | null
// ExamSessionEntity thêm: roomId: string | null; room: RoomEntity | null
// EnrollmentEntity: studentName thành string | null
```

- [ ] **Step 1: Chạy bài kiểm "entity khớp schema" để thấy nó chưa biết bảng mới**

Run: `npx jest --config ./test/jest-e2e.json test/entity-schema.e2e-spec.ts`
Expected: PASS (chưa có entity nào nhắc tới cột mới nên chưa lệch). Bài này sẽ đỏ NGAY nếu ở các bước dưới bạn khai một cột sai tên hoặc sai nullable — đó là mục đích của nó.

- [ ] **Step 2: Viết bốn entity mới**

Create `apps/api/src/course/entities/semester.entity.ts`:

```ts
import { Check, Column, Entity, Exclusion, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

/**
 * Học kỳ: một năm học có BA kỳ (spec §2.1). Tên là biểu thức của (năm, kỳ) —
 * `HK1 2026-2027` — không có cột `name`, nên không có hai chỗ để nhãn lệch nhau.
 *
 * Học kỳ là một THỰC THỂ có ngày nhưng KHÔNG phải một TRẠNG THÁI: không có cờ
 * "kỳ hiện tại", và không có luật nào từ chối một thao tác vì lý do ngày kỳ
 * (CLAUDE.md §1.2). Ngày chỉ phục vụ việc chống chồng kỳ và sắp xếp.
 *
 * Bất biến ở DB (migration `ExpandMasterDataEntities`), không chỉ ở service:
 * không chồng ngày; không đổi `academic_year_start`/`term` khi đã có lớp.
 */
@Entity({ name: 'semester' })
@Index('uq_semester_year_term', ['academicYearStart', 'term'], { unique: true })
@Check('ck_semester_term', 'term IN (1, 2, 3)')
@Check('ck_semester_dates', 'end_date >= start_date')
@Check('ck_semester_year', 'academic_year_start BETWEEN 2000 AND 2999')
@Exclusion(
  'ex_semester_dates_overlap',
  `USING gist (daterange("start_date", "end_date", '[]') WITH &&)`,
)
export class SemesterEntity extends BaseEntity {
  /** 2026 nghĩa là năm học 2026-2027. */
  @Column({ name: 'academic_year_start', type: 'int' })
  academicYearStart!: number;

  @Column({ type: 'smallint' })
  term!: number;

  /** `yyyy-mm-dd`. TypeORM trả cột `date` về dạng chuỗi, không phải Date. */
  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;
}
```

Create `apps/api/src/course/entities/room.entity.ts`:

```ts
import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

/**
 * Phòng thi — một danh mục do admin khai, giảng viên chỉ chọn (spec §2.4).
 *
 * `is_active = false` nghĩa là KHÔNG CHỌN ĐƯỢC cho phiên mới; phiên cũ vẫn trỏ
 * tới được. Kiểm ở service chứ không ở ràng buộc DB, vì lịch sử phải tham chiếu
 * được một phòng đã ngừng.
 *
 * Tên: cắt khoảng trắng đầu-cuối và gộp khoảng trắng liên tiếp ở tầng ghi
 * (`normalizeRoomName`), DB ép lại bằng `ck_room_name`.
 */
@Entity({ name: 'room' })
@Index('uq_room_name', ['name'], { unique: true })
@Check(
  'ck_room_name',
  `"name"::text = btrim("name"::text) AND "name"::text !~ '\\s{2,}' AND length("name"::text) BETWEEN 1 AND 100`,
)
@Check('ck_room_capacity', '"capacity" IS NULL OR "capacity" BETWEEN 1 AND 1000')
export class RoomEntity extends BaseEntity {
  @Column({ type: 'citext' })
  name!: string;

  /** Chưa biết sức chứa không được chặn việc ghi nhận phòng. */
  @Column({ type: 'int', nullable: true })
  capacity!: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
```

Create `apps/api/src/course/entities/administrative-class.entity.ts`:

```ts
import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

/**
 * Lớp danh nghĩa — `DHKTPM18A`. Lưu thành BẢNG RIÊNG để DB kiểm chứng sự tồn tại
 * và chống trùng (spec §2.2): một cột chữ trên `class` là đúng lỗi cũ.
 *
 * Giảng viên KHÔNG có trang, route hay bộ lọc riêng cho nó; họ chỉ thấy nhãn gộp
 * `mã – nhóm` (view `class_label`). Mã chỉ được tạo trong Danh mục của admin
 * (nhập tay hoặc import); form tạo lớp chỉ CHỌN.
 *
 * `code` viết hoa và cắt khoảng trắng ở tầng ghi; CHECK ép lại ở DB.
 */
@Entity({ name: 'administrative_class' })
@Index('uq_administrative_class_code', ['code'], { unique: true })
@Check(
  'ck_administrative_class_code',
  `"code"::text ~ '^[A-Z0-9]{3,30}$' AND "code"::text = upper("code"::text)`,
)
export class AdministrativeClassEntity extends BaseEntity {
  @Column({ type: 'citext' })
  code!: string;
}
```

Create `apps/api/src/course/entities/student.entity.ts`:

```ts
import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

/**
 * Sinh viên — MSSV và họ tên ở MỘT chỗ duy nhất (spec §2.6), để giảng viên gõ
 * MSSV là hiện tên và để một sinh viên nối qua nhiều học kỳ mà không có hai bản
 * tên. Chỉ được ghi qua danh sách lớp của giảng viên; không có trang quản lý.
 *
 * `student` không bao giờ bị xoá tự động.
 */
@Entity({ name: 'student' })
@Index('uq_student_mssv', ['mssv'], { unique: true })
@Check('ck_student_mssv', `"mssv" ~ '^[A-Za-z0-9]{4,20}$'`)
@Check('ck_student_full_name', `btrim("full_name") <> ''`)
export class StudentEntity extends BaseEntity {
  @Column({ type: 'citext' })
  mssv!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName!: string;
}
```

- [ ] **Step 3: Sửa `ClassEntity`**

Trong `apps/api/src/course/entities/class.entity.ts`:

Thêm import và cột. Thay phần import ở đầu file bằng:

```ts
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { SemesterEntity } from './semester.entity';
import { AdministrativeClassEntity } from './administrative-class.entity';
```

Thêm hai decorator mức class ngay dưới `@Index('uq_class_teacher_course_name', …)` (giữ nguyên dòng đó):

```ts
// Khoá duy nhất MỚI: một lớp học phần là (học kỳ, lớp danh nghĩa, nhóm). `group_name`
// là '' chứ không NULL — NULL làm khoá này mất tác dụng (xem migration).
@Index('uq_class_semester_admin_group', ['semesterId', 'administrativeClassId', 'groupName'], {
  unique: true,
})
@Check('ck_class_group_name', '"group_name" = btrim("group_name")')
```

Thay khai báo cột `name` bằng bản nullable có cảnh báo, và thêm các cột mới ngay sau nó:

```ts
  /**
   * @deprecated TÊN CŨ, đang chờ gỡ. Từ đợt khôi phục master data tên lớp là biểu
   * thức (mã danh nghĩa + nhóm) — đọc qua view `class_label`, KHÔNG đọc cột này.
   * Cột nullable từ migration `ExpandMasterDataEntities` để code mới không phải
   * ghi nó; migration thu hẹp (plan H) bỏ hẳn cột và chỉ mục
   * `uq_class_teacher_course_name`.
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  name!: string | null;

  /** Học kỳ của lớp (spec §2.3). NOT NULL từ migration thu hẹp; hôm nay nullable để code cũ còn chạy. */
  @Column({ name: 'semester_id', type: 'uuid', nullable: true })
  semesterId!: string | null;

  @ManyToOne(() => SemesterEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'semester_id' })
  semester!: SemesterEntity | null;

  @Column({ name: 'administrative_class_id', type: 'uuid', nullable: true })
  administrativeClassId!: string | null;

  @ManyToOne(() => AdministrativeClassEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'administrative_class_id' })
  administrativeClass!: AdministrativeClassEntity | null;

  /** `''` khi không tách nhóm (KHÔNG phải NULL: xem `uq_class_semester_admin_group`). */
  @Column({ name: 'group_name', type: 'varchar', length: 50, default: '' })
  groupName!: string;
```

- [ ] **Step 4: Sửa `EnrollmentEntity`, `ExamSessionEntity`**

Trong `apps/api/src/course/entities/enrollment.entity.ts` thay khai báo `studentName` (cả khối chú thích phía trên nó) bằng:

```ts
  /**
   * @deprecated TÊN CŨ, đang chờ gỡ. Tên sinh viên nằm ở MỘT chỗ: bảng `student`
   * (spec §2.6). Không đọc, không ghi cột này ở code mới; nullable từ migration
   * `ExpandMasterDataEntities` và bị bỏ ở migration thu hẹp (plan H).
   */
  @Column({ name: 'student_name', type: 'varchar', length: 150, nullable: true })
  studentName!: string | null;
```

Trong `apps/api/src/exam-session/entities/exam-session.entity.ts`:

1. Thêm `import { RoomEntity } from '../../course/entities/room.entity';` cạnh import `ClassEntity`.
2. Thay decorator `@Exclusion('ex_exam_session_room_overlap', …)` bằng hai decorator:

```ts
@Exclusion(
  'ex_exam_session_room_overlap',
  `USING gist ("room_id" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&) WHERE ("status" <> 'collecting' AND "status" <> 'completed' AND "status" <> 'cancelled')`,
)
// BẢN CŨ theo tên phòng, thu hẹp thành dòng CHƯA có room_id. Giữ trong giai đoạn
// chuyển tiếp để code cũ (không ghi room_id) vẫn không đặt trùng phòng được;
// migration thu hẹp (plan H) bỏ nó.
@Exclusion(
  'ex_exam_session_room_overlap_legacy',
  `USING gist ("room_name" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&) WHERE ("status" <> 'collecting' AND "status" <> 'completed' AND "status" <> 'cancelled' AND "room_id" IS NULL)`,
)
```

3. Ngay dưới khai báo cột `roomName` thêm:

```ts
  /**
   * Phòng thi thật (khoá ngoại). `room_name` ở trên là BẢN CHỤP của tên phòng lúc
   * tạo phiên, giữ để bảng điểm, tên file `{PHONG}` và các đường đọc cũ không đổi
   * theo khi admin đổi tên phòng. NOT NULL từ migration thu hẹp.
   */
  @Column({ name: 'room_id', type: 'uuid', nullable: true })
  roomId!: string | null;

  @ManyToOne(() => RoomEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'room_id' })
  room!: RoomEntity | null;
```

- [ ] **Step 5: Đăng ký entity và bảng**

Trong `apps/api/src/database/data-source.ts`: thêm bốn import (`SemesterEntity`, `RoomEntity`, `AdministrativeClassEntity`, `StudentEntity` từ `../course/entities/…`) và thêm `SemesterEntity, RoomEntity, AdministrativeClassEntity, StudentEntity,` vào mảng `entities` ngay sau `EnrollmentEntity,`.

Trong `apps/api/src/database/verify-schema.ts`: thêm vào `EXPECTED_TABLES`, ngay sau `'enrollment',`: `'semester'`, `'administrative_class'`, `'room'`, `'student'`, `'class_label'`. (`information_schema.tables` liệt kê cả view.)

Trong `apps/api/src/course/course.module.ts`: thêm bốn entity vào `TypeOrmModule.forFeature([...])` (cùng bốn import). **Chưa** thêm service/controller (Task 6–8).

- [ ] **Step 6: Xoá bảy DTO mồ côi trong `course.dto.ts`**

`CreateCourseDto`, `UpdateCourseDto`, `AssignCourseOwnerDto`, `CreateSemesterDto`, `UpdateSemesterDto`, `CreateRoomDto`, `UpdateRoomDto` không còn được import ở đâu (đã kiểm: `grep -rn` chỉ thấy chính file), và ba tên cuối sẽ trùng DTO mới ở Task 6–7. Xoá toàn bộ chúng; giữ `CreateClassDto` và `UpdateClassDto` (plan D thay chúng). Sau khi xoá, dòng import đầu file chỉ cần `IsString, Length`:

```ts
import { IsOptional, IsString, Length } from 'class-validator';
```

- [ ] **Step 7: Chạy kiểm tra**

```powershell
cd apps/api
pnpm exec tsc --noEmit
npx jest --config ./test/jest-e2e.json test/entity-schema.e2e-spec.ts
npx jest --config ./test/jest-e2e.json test/master-data-schema.e2e-spec.ts
```

Expected: `tsc` sạch (nếu báo `class.name` có thể là `null` ở các chỗ đọc nó — xem **Ghi chú** dưới); hai bộ e2e xanh.

**Ghi chú về `tsc`:** vì `ClassEntity.name` và `EnrollmentEntity.studentName` đổi từ `string` thành `string | null`, những chỗ code hiện hành gán chúng vào một `string` sẽ đỏ biên dịch. Các chỗ có kiểu tĩnh (đo ngày 05/10): `course/class.service.ts` (`name: klass.name` trong `findForTeacher`), `exam-session/exam-session.service.ts` (`item.className = session.class.name`), `agent-connection/attendance.service.ts` (bản đồ tên lớp truyền vào `buildDiscrepancy`, và ba lời gọi `toView(..., enrollment.studentName, ...)`), `course/roster.service.ts` (`RosterEntry.name` ở `listForClass` và `importForClass`). Các chỗ đọc bằng SQL thô (`recollect.service`, `submission-overview.service`, `grading.service`, `submission.service`, `schedule-conflict.service`) **không** đỏ biên dịch và vẫn chạy được trong giai đoạn này vì cột còn nguyên.

Trong plan này **đừng sửa logic** ở các chỗ đỏ: thêm `?? ''` tối thiểu tại chỗ báo lỗi và để plan D thay bằng nhãn lớp / tên từ `student` thật. Ghi lại từng chỗ bạn chạm vào trong thông điệp commit.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src
git commit -m "feat(master-data): entity cho học kỳ, phòng, lớp danh nghĩa, sinh viên; cột mới trên lớp và phiên thi"
```

---

### Task 5: Ghi test cho các tuỳ chọn mới của helper seed

**Files:**
- Modify: `apps/api/test/seed-helper.e2e-spec.ts`

**Interfaces:**
- Consumes: `seedClass({ semesterId, administrativeClassId })` và `seedExamSession({ roomId })` — hai tuỳ chọn thêm ở Task 3 Step 3. Mặc định không đổi hành vi (NULL), nên mọi suite cũ giữ nguyên.

- [ ] **Step 1: Thêm hai ca vào test của helper**

Trong `apps/api/test/seed-helper.e2e-spec.ts` thêm hai ca (trong `describe` hiện có):

```ts
  it('seedClass ghi học kỳ, lớp danh nghĩa và nhóm khi được cho', async () => {
    const year = await freshTestYear(dataSource);
    const { startDate, endDate } = semesterDates(year, 1);
    const [sem] = await dataSource.query(
      `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date) VALUES ($1, 1, $2, $3) RETURNING id`,
      [year, startDate, endDate],
    );
    const [adm] = await dataSource.query(
      `INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`,
      [`ZZ${randomTag()}`],
    );
    const klass = await seedClass(dataSource, {
      teacherId,
      semesterId: sem.id,
      administrativeClassId: adm.id,
      groupName: 'Nhóm 3',
    });
    const [row] = await dataSource.query(
      `SELECT semester_id, administrative_class_id, group_name FROM examcollect.class WHERE id = $1`,
      [klass.id],
    );
    expect(row).toEqual({ semester_id: sem.id, administrative_class_id: adm.id, group_name: 'Nhóm 3' });
    await dataSource.query(`DELETE FROM examcollect.class WHERE id = $1`, [klass.id]);
    await dataSource.query(`DELETE FROM examcollect.semester WHERE id = $1`, [sem.id]);
    await dataSource.query(`DELETE FROM examcollect.administrative_class WHERE id = $1`, [adm.id]);
  });

  it('seedExamSession ghi room_id khi được cho', async () => {
    const klass = await seedClass(dataSource, { teacherId });
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name) VALUES ($1) RETURNING id`,
      [`Phong ZZ${randomTag()}`],
    );
    const start = new Date(Date.now() - 5 * 24 * 3_600_000);
    const session = await seedExamSession(dataSource, {
      teacherId,
      classId: klass.id,
      startTime: start,
      endTime: new Date(start.getTime() + 3_600_000),
      status: 'completed',
      roomId: room.id,
    });
    const [row] = await dataSource.query(`SELECT room_id FROM examcollect.exam_session WHERE id = $1`, [session.id]);
    expect(row.room_id).toBe(room.id);
  });
```

và thêm import ở đầu file: `import { freshTestYear, randomTag, semesterDates } from './helpers/master-data';`.

- [ ] **Step 2: Chạy**

Run: `npx jest --config ./test/jest-e2e.json test/seed-helper.e2e-spec.ts` — Expected: PASS (10 test). Chạy lại guard Plan A: `npx jest src/common/e2e-seed-hygiene.spec.ts` — Expected: PASS (không thêm `INSERT` thô vào `class`/`exam_session`/`enrollment` ngoài `seed.ts`; mọi test ở plan này dựng lớp và phiên qua helper, kể cả các ca cố tình ghi dòng sai để DB từ chối).

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/seed-helper.e2e-spec.ts
git commit -m "test(e2e): ghi test cho tuỳ chọn học kỳ, lớp danh nghĩa và phòng của helper seed"
```

---

### Task 6: Học kỳ — service, controller, e2e

**Files:**
- Create: `apps/api/src/course/dto/semester.dto.ts`, `semester.service.ts`, `semester.controller.ts`
- Modify: `apps/api/src/course/course.types.ts`, `course.module.ts`
- Test: `apps/api/test/semester.e2e-spec.ts`

**Interfaces:**
- Consumes: `semesterProblems`, `semesterLabel`, `formatDmy`, `AuditLogService.recordUserAction(input, manager)`.
- Produces:

```ts
// course.types.ts
export interface SemesterView {
  id: string; academicYearStart: number; term: number; label: string;
  startDate: string; endDate: string; classCount?: number;
}
// SemesterService
list(withCounts: boolean): Promise<SemesterView[]>
create(actorId: string, dto: CreateSemesterDto): Promise<SemesterView>
update(actorId: string, id: string, dto: UpdateSemesterDto): Promise<SemesterView>
remove(actorId: string, id: string): Promise<void>
// Routes
GET /semesters (admin, teacher) · POST /semesters · PATCH /semesters/:id · DELETE /semesters/:id (204)
```

- [ ] **Step 1: Viết e2e (đỏ)**

Create `apps/api/test/semester.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { freshTestYear, purgeTestSemesters, randomTag, semesterDates } from './helpers/master-data';
import { seedClass } from './helpers/seed';

describe('Semesters (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let teacherToken: string;
  let adminId: string;
  let teacherId: string;
  const createdAdminClasses: string[] = [];

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    return response.body.accessToken;
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (body: object, token = adminToken) =>
    request(app.getHttpServer()).post('/semesters').set(auth(token)).send(body);

  async function auditRows(targetId: string) {
    return ds.query(
      `SELECT action, actor_id, old_value, new_value FROM examcollect.audit_log WHERE target_id = $1 ORDER BY occurred_at`,
      [targetId],
    );
  }

  async function auditCount(action: string) {
    const [row] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.audit_log WHERE action = $1 AND actor_id = $2`, [action, adminId]);
    return row.n as number;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const tag = randomTag();
    const adminEmail = `sem_admin_${tag}@example.com`;
    adminId = await createTestAccount(ds, { email: adminEmail, password: 'correct-horse-battery', role: 'admin' });
    adminToken = await login(adminEmail);
    const teacherEmail = `sem_teacher_${tag}@example.com`;
    teacherId = await createTestAccount(ds, { email: teacherEmail, password: 'correct-horse-battery', role: 'teacher' });
    teacherToken = await login(teacherEmail);
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM examcollect.exam_session WHERE class_id IN (SELECT id FROM examcollect.class WHERE teacher_id = $1)`, [teacherId]).catch(() => undefined);
    await ds.query(`DELETE FROM examcollect.class WHERE teacher_id = $1`, [teacherId]).catch(() => undefined);
    if (createdAdminClasses.length) {
      await ds.query(`DELETE FROM examcollect.administrative_class WHERE id = ANY($1)`, [createdAdminClasses]).catch(() => undefined);
    }
    await purgeTestSemesters(ds);
    await app.close();
  });

  describe('phân quyền', () => {
    it('không token là 401', async () => {
      await request(app.getHttpServer()).get('/semesters').expect(401);
    });

    it('giảng viên đọc được danh sách nhưng KHÔNG nhận classCount (Review Focus 6)', async () => {
      const year = await freshTestYear(ds);
      const created = await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      const response = await request(app.getHttpServer()).get('/semesters').set(auth(teacherToken)).expect(200);
      const row = response.body.find((s: { id: string }) => s.id === created.body.id);
      expect(row).toBeDefined();
      expect(row).not.toHaveProperty('classCount');
    });

    it('giảng viên không ghi được (POST/PATCH/DELETE đều 403)', async () => {
      const year = await freshTestYear(ds);
      const dates = semesterDates(year, 1);
      await post({ academicYearStart: year, term: 1, ...dates }, teacherToken).expect(403);
      const created = await post({ academicYearStart: year, term: 1, ...dates }).expect(201);
      await request(app.getHttpServer()).patch(`/semesters/${created.body.id}`).set(auth(teacherToken)).send({ endDate: dates.endDate }).expect(403);
      await request(app.getHttpServer()).delete(`/semesters/${created.body.id}`).set(auth(teacherToken)).expect(403);
    });
  });

  describe('tạo', () => {
    it('trả nhãn suy ra, ngày dạng yyyy-mm-dd, classCount = 0, và ghi ĐÚNG MỘT dòng audit (T-AUD-1)', async () => {
      const year = await freshTestYear(ds);
      const dates = semesterDates(year, 1);
      const before = await auditCount('semester.create');

      const response = await post({ academicYearStart: year, term: 1, ...dates }).expect(201);

      expect(response.body).toMatchObject({
        academicYearStart: year,
        term: 1,
        label: `HK1 ${year}-${year + 1}`,
        startDate: dates.startDate,
        endDate: dates.endDate,
        classCount: 0,
      });
      expect(await auditCount('semester.create')).toBe(before + 1);
      const rows = await auditRows(response.body.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_id).toBe(adminId);
      expect(rows[0].new_value).toMatchObject({ targetLabel: `HK1 ${year}-${year + 1}`, term: 1, academicYearStart: year });
    });

    it('danh sách sắp theo năm giảm dần, kỳ giảm dần', async () => {
      const year = await freshTestYear(ds);
      await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      await post({ academicYearStart: year, term: 2, ...semesterDates(year, 2) }).expect(201);
      const list = await request(app.getHttpServer()).get('/semesters').set(auth(adminToken)).expect(200);
      const mine = list.body.filter((s: { academicYearStart: number }) => s.academicYearStart === year);
      expect(mine.map((s: { term: number }) => s.term)).toEqual([2, 1]);
      const all = list.body.map((s: { academicYearStart: number; term: number }) => [s.academicYearStart, s.term]);
      const sorted = [...all].sort((a, b) => b[0] - a[0] || b[1] - a[1]);
      expect(all).toEqual(sorted);
    });

    it('trùng (năm, kỳ) là 409 nêu nhãn học kỳ', async () => {
      const year = await freshTestYear(ds);
      await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      const dup = await post({ academicYearStart: year, term: 1, startDate: `${year + 5}-01-01`, endDate: `${year + 5}-02-01` }).expect(409);
      expect(dup.body.message).toContain(`HK1 ${year}-${year + 1}`);
    });

    it('T-MD-7: trùng ngày với học kỳ khác là 409 nêu học kỳ đang giữ khoảng ngày', async () => {
      const year = await freshTestYear(ds);
      const first = await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      const clash = await post({ academicYearStart: year, term: 2, ...semesterDates(year, 1) }).expect(409);
      expect(clash.body.message).toContain(first.body.label);
      expect(clash.body.message).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('lỗi đầu vào là 400 và KHÔNG để lại dòng audit (Review Focus 5)', async () => {
      const year = await freshTestYear(ds);
      const before = await auditCount('semester.create');
      await post({ academicYearStart: year, term: 4, ...semesterDates(year, 1) }).expect(400);
      await post({ academicYearStart: year, term: 1, startDate: '2026-02-30', endDate: '2026-03-01' }).expect(400);
      await post({ academicYearStart: year, term: 1, startDate: '2026-09-01', endDate: '2026-08-01' }).expect(400);
      await post({ academicYearStart: 1999, term: 1, ...semesterDates(year, 1) }).expect(400);
      await post({ term: 1 }).expect(400);
      expect(await auditCount('semester.create')).toBe(before);
    });

    it('xung đột (409) cũng không để lại dòng audit', async () => {
      const year = await freshTestYear(ds);
      const dates = semesterDates(year, 1);
      await post({ academicYearStart: year, term: 1, ...dates }).expect(201);
      const afterCreate = await auditCount('semester.create');
      await post({ academicYearStart: year, term: 1, ...dates }).expect(409);
      expect(await auditCount('semester.create')).toBe(afterCreate);
    });
  });

  describe('sửa', () => {
    it('sửa ngày thì được, audit chỉ ghi các trường đổi', async () => {
      const year = await freshTestYear(ds);
      const dates = semesterDates(year, 1);
      const created = await post({ academicYearStart: year, term: 1, ...dates }).expect(201);

      const newEnd = `${year + 1}-02-15`;
      const response = await request(app.getHttpServer())
        .patch(`/semesters/${created.body.id}`)
        .set(auth(adminToken))
        .send({ endDate: newEnd })
        .expect(200);
      expect(response.body.endDate).toBe(newEnd);

      const rows = await auditRows(created.body.id);
      const update = rows.find((r: { action: string }) => r.action === 'semester.update');
      expect(update.old_value).toEqual({ endDate: dates.endDate });
      expect(update.new_value).toMatchObject({ endDate: newEnd, targetLabel: created.body.label });
      expect(Object.keys(update.new_value).sort()).toEqual(['endDate', 'targetLabel']);
    });

    it('gửi lại đúng giá trị hiện có là không đổi gì và không ghi audit', async () => {
      const year = await freshTestYear(ds);
      const dates = semesterDates(year, 1);
      const created = await post({ academicYearStart: year, term: 1, ...dates }).expect(201);
      await request(app.getHttpServer()).patch(`/semesters/${created.body.id}`).set(auth(adminToken)).send({ endDate: dates.endDate }).expect(200);
      const rows = await auditRows(created.body.id);
      expect(rows.filter((r: { action: string }) => r.action === 'semester.update')).toHaveLength(0);
    });

    it('sửa ngày thành chồng với học kỳ khác là 409; một học kỳ không tự va chạm với chính nó', async () => {
      const year = await freshTestYear(ds);
      const a = await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      const b = await post({ academicYearStart: year, term: 2, ...semesterDates(year, 2) }).expect(201);
      // Co kỳ 1 lại vẫn nằm trong chính nó: không được coi là chồng với chính nó.
      await request(app.getHttpServer()).patch(`/semesters/${a.body.id}`).set(auth(adminToken)).send({ endDate: `${year + 1}-01-15` }).expect(200);
      // Kéo kỳ 2 lùi về trước ngày bắt đầu của kỳ 1: chồng.
      await request(app.getHttpServer()).patch(`/semesters/${b.body.id}`).set(auth(adminToken)).send({ startDate: `${year}-12-01` }).expect(409);
    });

    it('T-MD-6: không đổi được năm học/kỳ khi đã có lớp (409, nói rõ số lớp); đổi ngày vẫn được', async () => {
      const year = await freshTestYear(ds);
      const created = await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      const [adm] = await ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`, [`ZZ${randomTag()}`]);
      createdAdminClasses.push(adm.id);
      await seedClass(ds, { teacherId, semesterId: created.body.id, administrativeClassId: adm.id });

      const blocked = await request(app.getHttpServer()).patch(`/semesters/${created.body.id}`).set(auth(adminToken)).send({ term: 2 }).expect(409);
      expect(blocked.body.message).toMatch(/1 lớp/);
      await request(app.getHttpServer()).patch(`/semesters/${created.body.id}`).set(auth(adminToken)).send({ endDate: `${year + 1}-01-20` }).expect(200);
    });

    it('404 cho học kỳ không tồn tại', async () => {
      await request(app.getHttpServer()).patch('/semesters/00000000-0000-4000-8000-000000000000').set(auth(adminToken)).send({ endDate: '2900-01-01' }).expect(404);
    });
  });

  describe('xoá', () => {
    it('xoá được học kỳ chưa có lớp và ghi audit mang nhãn trong oldValue', async () => {
      const year = await freshTestYear(ds);
      const created = await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      await request(app.getHttpServer()).delete(`/semesters/${created.body.id}`).set(auth(adminToken)).expect(204);
      const rows = await auditRows(created.body.id);
      const del = rows.find((r: { action: string }) => r.action === 'semester.delete');
      expect(del.old_value).toMatchObject({ targetLabel: created.body.label });
    });

    it('T-MD-8: học kỳ còn lớp không xoá được; báo lý do cụ thể kèm số lớp', async () => {
      const year = await freshTestYear(ds);
      const created = await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      const [adm] = await ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`, [`ZZ${randomTag()}`]);
      createdAdminClasses.push(adm.id);
      await seedClass(ds, { teacherId, semesterId: created.body.id, administrativeClassId: adm.id });

      const blocked = await request(app.getHttpServer()).delete(`/semesters/${created.body.id}`).set(auth(adminToken)).expect(409);
      expect(blocked.body.message).toContain(created.body.label);
      expect(blocked.body.message).toMatch(/1 lớp/);
    });

    it('classCount của admin đếm đúng số lớp', async () => {
      const year = await freshTestYear(ds);
      const created = await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      const [adm] = await ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`, [`ZZ${randomTag()}`]);
      createdAdminClasses.push(adm.id);
      await seedClass(ds, { teacherId, semesterId: created.body.id, administrativeClassId: adm.id, groupName: 'Nhóm 1' });
      await seedClass(ds, { teacherId, semesterId: created.body.id, administrativeClassId: adm.id, groupName: 'Nhóm 2' });
      const list = await request(app.getHttpServer()).get('/semesters').set(auth(adminToken)).expect(200);
      expect(list.body.find((s: { id: string }) => s.id === created.body.id).classCount).toBe(2);
    });
  });
});
```

`seedExamSession` được import nhưng chưa dùng ở file này; bỏ nó khỏi dòng import nếu lint báo (`no-unused-vars` chỉ cảnh báo).

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `npx jest --config ./test/jest-e2e.json test/semester.e2e-spec.ts`
Expected: FAIL — các request trả 404 (route chưa có).

- [ ] **Step 3: Viết kiểu view và DTO**

Thêm vào cuối `apps/api/src/course/course.types.ts`:

```ts
/** Một học kỳ như admin và giảng viên đọc nó. `classCount` chỉ có với admin. */
export class SemesterView {
  id!: string;
  academicYearStart!: number;
  term!: number;
  /** `HK1 2026-2027`, suy từ (năm, kỳ). */
  label!: string;
  /** `yyyy-mm-dd`. */
  startDate!: string;
  endDate!: string;
  classCount?: number;
}
```

Create `apps/api/src/course/dto/semester.dto.ts`:

```ts
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_MESSAGE = 'Ngày phải theo dạng yyyy-mm-dd';

/**
 * Kiểu và hình dạng ở đây; MỌI luật nghiệp vụ (kỳ 1–3, ngày có thật, ngày kết
 * thúc không trước ngày bắt đầu) nằm ở `semesterProblems` — một lớp kiểm tra
 * dùng chung với import (spec §6.2 nguyên tắc 6), không lặp lại ở decorator.
 */
export class CreateSemesterDto {
  @IsInt()
  @Min(2000)
  @Max(2999)
  academicYearStart!: number;

  @IsInt()
  term!: number;

  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  startDate!: string;

  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  endDate!: string;
}

export class UpdateSemesterDto {
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2999)
  academicYearStart?: number;

  @IsOptional()
  @IsInt()
  term?: number;

  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  startDate?: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  endDate?: string;
}
```

- [ ] **Step 4: Viết service**

Create `apps/api/src/course/semester.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogService } from '../admin/audit-log.service';
import { formatDmy, semesterLabel } from '../common/semester-label';
import { CreateSemesterDto, UpdateSemesterDto } from './dto/semester.dto';
import { SemesterEntity } from './entities/semester.entity';
import { SemesterInput, semesterProblems } from './semester.rules';
import { SemesterView } from './course.types';

interface SemesterRow {
  id: string;
  academicYearStart: number;
  term: number;
  startDate: string;
  endDate: string;
  classCount: number;
}

/**
 * Học kỳ do admin quản lý (spec §2.1, §4). Giảng viên chỉ ĐỌC.
 *
 * Quy tắc, theo thứ tự "lỗi đầu vào (400) rồi xung đột với dữ liệu hiện có (409)":
 *   - luật hợp lệ ở `semesterProblems` (dùng chung với import);
 *   - không chồng ngày, không trùng (năm, kỳ);
 *   - không đổi (năm, kỳ) khi đã có lớp — nhãn trên phiên đã chụp nhãn cũ;
 *   - không xoá khi còn lớp.
 * Mọi quy tắc xung đột còn có ĐÚNG MỘT bản ở DB (ràng buộc/trigger) là thẩm quyền
 * cuối; kiểm ở đây chỉ để đưa ra câu báo lỗi đọc được thay cho "This request
 * conflicts with an existing record".
 */
@Injectable()
export class SemesterService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
  ) {}

  async list(withCounts: boolean): Promise<SemesterView[]> {
    const rows: SemesterRow[] = await this.dataSource.query(
      `SELECT s.id,
              s.academic_year_start AS "academicYearStart",
              s.term,
              to_char(s.start_date, 'YYYY-MM-DD') AS "startDate",
              to_char(s.end_date,   'YYYY-MM-DD') AS "endDate",
              (SELECT count(*)::int FROM examcollect.class c WHERE c.semester_id = s.id) AS "classCount"
         FROM examcollect.semester s
        ORDER BY s.academic_year_start DESC, s.term DESC`,
    );
    return rows.map((row) => this.toView(row, withCounts));
  }

  async create(actorId: string, dto: CreateSemesterDto): Promise<SemesterView> {
    this.assertValid(dto);
    return this.dataSource.transaction(async (manager) => {
      await this.assertKeyFree(manager, dto.academicYearStart, dto.term, null);
      await this.assertNoOverlap(manager, dto.startDate, dto.endDate, null);

      const repo = manager.getRepository(SemesterEntity);
      const saved = await repo.save(
        repo.create({
          academicYearStart: dto.academicYearStart,
          term: dto.term,
          startDate: dto.startDate,
          endDate: dto.endDate,
        }),
      );
      const label = semesterLabel(saved.academicYearStart, saved.term);
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'semester.create',
          targetType: 'semester',
          targetId: saved.id,
          newValue: {
            targetLabel: label,
            academicYearStart: saved.academicYearStart,
            term: saved.term,
            startDate: saved.startDate,
            endDate: saved.endDate,
          },
        },
        manager,
      );
      return this.toView({ ...saved, classCount: 0 }, true);
    });
  }

  async update(actorId: string, id: string, dto: UpdateSemesterDto): Promise<SemesterView> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SemesterEntity);
      const current = await repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy học kỳ.');

      const next: SemesterInput = {
        academicYearStart: dto.academicYearStart ?? current.academicYearStart,
        term: dto.term ?? current.term,
        startDate: dto.startDate ?? current.startDate,
        endDate: dto.endDate ?? current.endDate,
      };
      this.assertValid(next);

      const changed = (Object.keys(next) as (keyof SemesterInput)[]).filter(
        (key) => next[key] !== current[key],
      );
      const classCount = await this.countClasses(manager, id);
      if (changed.length === 0) {
        return this.toView({ ...current, classCount }, true);
      }

      const keyChanged = changed.includes('academicYearStart') || changed.includes('term');
      if (keyChanged) {
        if (classCount > 0) {
          throw new ConflictException(
            `Không đổi được năm học hay kỳ của ${semesterLabel(current.academicYearStart, current.term)} ` +
              `vì đã có ${classCount} lớp thuộc học kỳ này; chỉ sửa được ngày.`,
          );
        }
        await this.assertKeyFree(manager, next.academicYearStart, next.term, id);
      }
      if (changed.includes('startDate') || changed.includes('endDate')) {
        await this.assertNoOverlap(manager, next.startDate, next.endDate, id);
      }

      const before = { ...current };
      Object.assign(current, next);
      const saved = await repo.save(current);

      const oldValue: Record<string, unknown> = {};
      const newValue: Record<string, unknown> = {};
      for (const key of changed) {
        oldValue[key] = before[key];
        newValue[key] = saved[key];
      }
      newValue.targetLabel = semesterLabel(saved.academicYearStart, saved.term);
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'semester.update',
          targetType: 'semester',
          targetId: id,
          oldValue,
          newValue,
        },
        manager,
      );
      return this.toView({ ...saved, classCount }, true);
    });
  }

  async remove(actorId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SemesterEntity);
      const current = await repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy học kỳ.');

      const label = semesterLabel(current.academicYearStart, current.term);
      const classCount = await this.countClasses(manager, id);
      if (classCount > 0) {
        throw new ConflictException(
          `${label} còn ${classCount} lớp nên không xoá được. Hãy chuyển hoặc xoá các lớp đó trước.`,
        );
      }
      await repo.remove(current);
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'semester.delete',
          targetType: 'semester',
          targetId: id,
          oldValue: {
            targetLabel: label,
            academicYearStart: current.academicYearStart,
            term: current.term,
            startDate: current.startDate,
            endDate: current.endDate,
          },
        },
        manager,
      );
    });
  }

  private assertValid(input: SemesterInput): void {
    const problems = semesterProblems(input);
    if (problems.length > 0) throw new BadRequestException(problems.join(' '));
  }

  private async countClasses(manager: EntityManager, semesterId: string): Promise<number> {
    const [row] = await manager.query(
      `SELECT count(*)::int AS n FROM examcollect.class WHERE semester_id = $1`,
      [semesterId],
    );
    return row.n;
  }

  private async assertKeyFree(
    manager: EntityManager,
    year: number,
    term: number,
    excludeId: string | null,
  ): Promise<void> {
    const [row] = await manager.query(
      `SELECT 1 AS found FROM examcollect.semester
        WHERE academic_year_start = $1 AND term = $2 AND ($3::uuid IS NULL OR id <> $3)`,
      [year, term, excludeId],
    );
    if (row) throw new ConflictException(`${semesterLabel(year, term)} đã tồn tại.`);
  }

  private async assertNoOverlap(
    manager: EntityManager,
    startDate: string,
    endDate: string,
    excludeId: string | null,
  ): Promise<void> {
    const [row] = await manager.query(
      `SELECT academic_year_start AS year, term,
              to_char(start_date, 'YYYY-MM-DD') AS "startDate",
              to_char(end_date,   'YYYY-MM-DD') AS "endDate"
         FROM examcollect.semester
        WHERE daterange(start_date, end_date, '[]') && daterange($1::date, $2::date, '[]')
          AND ($3::uuid IS NULL OR id <> $3)
        ORDER BY start_date LIMIT 1`,
      [startDate, endDate, excludeId],
    );
    if (row) {
      throw new ConflictException(
        `Khoảng ngày bị chồng với ${semesterLabel(row.year, row.term)} ` +
          `(${formatDmy(row.startDate)}–${formatDmy(row.endDate)}). Hai học kỳ không được chồng ngày.`,
      );
    }
  }

  private toView(
    row: Pick<SemesterRow, 'id' | 'academicYearStart' | 'term' | 'startDate' | 'endDate'> & {
      classCount?: number;
    },
    withCounts: boolean,
  ): SemesterView {
    return {
      id: row.id,
      academicYearStart: row.academicYearStart,
      term: row.term,
      label: semesterLabel(row.academicYearStart, row.term),
      startDate: row.startDate,
      endDate: row.endDate,
      ...(withCounts ? { classCount: row.classCount ?? 0 } : {}),
    };
  }
}
```

- [ ] **Step 5: Viết controller và nối module**

Create `apps/api/src/course/semester.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SemesterService } from './semester.service';
import { CreateSemesterDto, UpdateSemesterDto } from './dto/semester.dto';

/**
 * Học kỳ. `@Roles('admin')` ở MỨC CLASS: một route bỏ sót `@Roles` sẽ là 403 chứ
 * không phải route mở (RolesGuard trả `true` khi không có metadata). Chỉ route
 * ĐỌC ghi đè để giảng viên dùng được cho bộ lọc năm học → học kỳ (spec §7.2).
 */
@Controller('semesters')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SemesterController {
  constructor(private readonly semesters: SemesterService) {}

  @Get()
  @Roles('admin', 'teacher')
  list(@Req() req: Request) {
    // Số lớp là thông tin tổng hợp về lớp của NGƯỜI KHÁC: chỉ admin nhận nó.
    return this.semesters.list(req.user!.role === 'admin');
  }

  @Post()
  create(@Body() dto: CreateSemesterDto, @Req() req: Request) {
    return this.semesters.create(req.user!.sub, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSemesterDto,
    @Req() req: Request,
  ) {
    return this.semesters.update(req.user!.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.semesters.remove(req.user!.sub, id);
  }
}
```

Trong `apps/api/src/course/course.module.ts`: thêm `import { AdminModule } from '../admin/admin.module';`, `import { SemesterService } from './semester.service';`, `import { SemesterController } from './semester.controller';`; thêm `AdminModule` vào `imports`, `SemesterController` vào `controllers`, `SemesterService` vào `providers` **và** `exports` (plan D dùng nó khi tạo phiên).

- [ ] **Step 6: Chạy để thấy xanh**

Run: `npx jest --config ./test/jest-e2e.json test/semester.e2e-spec.ts`
Expected: PASS (~16 test). Chú ý ca "co kỳ 1 lại vẫn nằm trong chính nó": nếu nó 409, `assertNoOverlap` đang không loại trừ chính học kỳ (`excludeId`).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/course apps/api/test/semester.e2e-spec.ts
git commit -m "feat(master-data): CRUD học kỳ của admin (audit cùng giao dịch, báo lý do cụ thể)"
```

---

### Task 7: Phòng thi — service, controller, e2e

**Files:**
- Create: `apps/api/src/course/dto/room.dto.ts`, `near-duplicate.error.ts`, `room.service.ts`, `room.controller.ts`
- Modify: `apps/api/src/course/course.types.ts`, `course.module.ts`
- Test: `apps/api/test/room.e2e-spec.ts`

**Interfaces:**
- Consumes: `normalizeRoomName`, `roomNameProblem`, `findNearDuplicates`, `AuditLogService`.
- Produces:

```ts
// course.types.ts
export class RoomView { id: string; name: string; capacity: number | null; isActive: boolean; sessionCount?: number }
// near-duplicate.error.ts
export interface SimilarEntry { id: string; name: string }
export function nearDuplicateConflict(noun: string, value: string, similar: SimilarEntry[]): ConflictException
// RoomService
list(opts: { activeOnly: boolean; withCounts: boolean }): Promise<RoomView[]>
create(actorId, dto: CreateRoomDto): Promise<RoomView>
update(actorId, id, dto: UpdateRoomDto): Promise<RoomView>
remove(actorId, id): Promise<void>
// Routes
GET /rooms?active=true (admin, teacher) · POST /rooms · PATCH /rooms/:id · DELETE /rooms/:id (204)
// 409 NEAR_DUPLICATE body: { error: 'NEAR_DUPLICATE', message: string, similar: { id, name }[] }
```

- [ ] **Step 1: Viết e2e (đỏ)**

Create `apps/api/test/room.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { randomTag } from './helpers/master-data';
import { seedClass, seedExamSession } from './helpers/seed';

describe('Rooms (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let teacherToken: string;
  let adminId: string;
  let teacherId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (body: object, token = adminToken) =>
    request(app.getHttpServer()).post('/rooms').set(auth(token)).send(body);
  const patch = (id: string, body: object, token = adminToken) =>
    request(app.getHttpServer()).patch(`/rooms/${id}`).set(auth(token)).send(body);

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    return response.body.accessToken;
  }

  async function auditCount(action: string) {
    const [row] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.audit_log WHERE action = $1 AND actor_id = $2`, [action, adminId]);
    return row.n as number;
  }

  /** Tên phòng duy nhất, ASCII, và đủ xa mọi tên khác để không dính luật "gần giống". */
  const roomName = () => `Phong ZZ${randomTag(12)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const tag = randomTag();
    const adminEmail = `room_admin_${tag}@example.com`;
    adminId = await createTestAccount(ds, { email: adminEmail, password: 'correct-horse-battery', role: 'admin' });
    adminToken = await login(adminEmail);
    const teacherEmail = `room_teacher_${tag}@example.com`;
    teacherId = await createTestAccount(ds, { email: teacherEmail, password: 'correct-horse-battery', role: 'teacher' });
    teacherToken = await login(teacherEmail);
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM examcollect.exam_session WHERE teacher_id = $1`, [teacherId]).catch(() => undefined);
    await ds.query(`DELETE FROM examcollect.class WHERE teacher_id = $1`, [teacherId]).catch(() => undefined);
    await app.close();
  });

  describe('phân quyền', () => {
    it('giảng viên đọc được nhưng không nhận sessionCount; ghi thì 403', async () => {
      const name = roomName();
      const created = await post({ name }).expect(201);
      const list = await request(app.getHttpServer()).get('/rooms').set(auth(teacherToken)).expect(200);
      const row = list.body.find((r: { id: string }) => r.id === created.body.id);
      expect(row).toMatchObject({ name, isActive: true });
      expect(row).not.toHaveProperty('sessionCount');

      await post({ name: roomName() }, teacherToken).expect(403);
      await patch(created.body.id, { capacity: 10 }, teacherToken).expect(403);
      await request(app.getHttpServer()).delete(`/rooms/${created.body.id}`).set(auth(teacherToken)).expect(403);
    });

    it('không token là 401', async () => {
      await request(app.getHttpServer()).get('/rooms').expect(401);
    });
  });

  describe('tạo', () => {
    it('chuẩn hoá tên (cắt đầu-cuối, gộp khoảng trắng), mặc định hoạt động, và ghi ĐÚNG MỘT dòng audit', async () => {
      const tag = randomTag(12);
      const before = await auditCount('room.create');
      const response = await post({ name: `  Phong   ZZ${tag}  `, capacity: 40 }).expect(201);

      expect(response.body).toMatchObject({ name: `Phong ZZ${tag}`, capacity: 40, isActive: true, sessionCount: 0 });
      expect(await auditCount('room.create')).toBe(before + 1);
      const [row] = await ds.query(`SELECT new_value FROM examcollect.audit_log WHERE target_id = $1`, [response.body.id]);
      expect(row.new_value).toMatchObject({ targetLabel: `Phong ZZ${tag}`, capacity: 40, isActive: true });
    });

    it('sức chứa tuỳ chọn (không biết sức chứa không được chặn việc ghi nhận phòng)', async () => {
      const response = await post({ name: roomName() }).expect(201);
      expect(response.body.capacity).toBeNull();
    });

    it('trùng tên không phân biệt hoa-thường và khoảng trắng thừa là 409 nêu tên (Review Focus 3)', async () => {
      const tag = randomTag(12);
      await post({ name: `Phong zz${tag}` }).expect(201);
      const dup = await post({ name: `  PHONG   ZZ${tag} ` }).expect(409);
      expect(dup.body.message).toContain('đã tồn tại');
      expect(dup.body).not.toHaveProperty('error', 'NEAR_DUPLICATE');
    });

    it('đầu vào sai là 400: rỗng, quá dài, sức chứa ngoài 1–1000', async () => {
      await post({ name: '   ' }).expect(400);
      await post({ name: 'x'.repeat(101) }).expect(400);
      await post({ name: roomName(), capacity: 0 }).expect(400);
      await post({ name: roomName(), capacity: 1001 }).expect(400);
      await post({}).expect(400);
    });

    it('T-IMP-8 (nhập tay): tên gần giống phòng có sẵn bị chặn bằng 409 NEAR_DUPLICATE kèm phòng giống; xác nhận thì ghi được', async () => {
      const tag = randomTag(12);
      const existing = await post({ name: `Phong ZZ${tag}` }).expect(201);
      const before = await auditCount('room.create');

      // Chỉ khác dấu chấm và hoa-thường sau chuẩn hoá: cùng tên theo luật "gần giống", khác theo citext.
      const warn = await post({ name: `PHONG.ZZ${tag}` }).expect(409);
      expect(warn.body).toMatchObject({ error: 'NEAR_DUPLICATE' });
      expect(warn.body.similar).toEqual([{ id: existing.body.id, name: `Phong ZZ${tag}` }]);
      // Cảnh báo không phải ghi: không dòng audit, không phòng mới.
      expect(await auditCount('room.create')).toBe(before);

      const confirmed = await post({ name: `PHONG.ZZ${tag}`, confirmSimilar: true }).expect(201);
      expect(confirmed.body.name).toBe(`PHONG.ZZ${tag}`);
      expect(await auditCount('room.create')).toBe(before + 1);
    });

    it('KHÔNG cảnh báo trên các cặp phòng thật khác nhau (A1/B1, Review Focus 4)', async () => {
      const tag = randomTag(12);
      await post({ name: `Phong may ZZ${tag}A1` }).expect(201);
      await post({ name: `Phong may ZZ${tag}B1` }).expect(201);
    });

    it('thêm lỗi gõ liền kề đổi chỗ cũng bị cảnh báo', async () => {
      const tag = randomTag(12);
      await post({ name: `Phong ZZ${tag}AB` }).expect(201);
      const warn = await post({ name: `Phong ZZ${tag}BA` }).expect(409);
      expect(warn.body.error).toBe('NEAR_DUPLICATE');
    });
  });

  describe('sửa', () => {
    it('đổi sức chứa và tắt hoạt động; audit chỉ ghi các trường đổi', async () => {
      const created = await post({ name: roomName(), capacity: 40 }).expect(201);
      const response = await patch(created.body.id, { capacity: 45, isActive: false }).expect(200);
      expect(response.body).toMatchObject({ capacity: 45, isActive: false });

      const rows = await ds.query(
        `SELECT old_value, new_value FROM examcollect.audit_log WHERE target_id = $1 AND action = 'room.update'`,
        [created.body.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].old_value).toEqual({ capacity: 40, isActive: true });
      expect(Object.keys(rows[0].new_value).sort()).toEqual(['capacity', 'isActive', 'targetLabel']);
    });

    it('xoá sức chứa bằng null', async () => {
      const created = await post({ name: roomName(), capacity: 40 }).expect(201);
      const response = await patch(created.body.id, { capacity: null }).expect(200);
      expect(response.body.capacity).toBeNull();
    });

    it('đổi tên: trùng tên phòng khác là 409; một phòng không "trùng" với chính nó', async () => {
      const a = await post({ name: roomName() }).expect(201);
      const b = await post({ name: roomName() }).expect(201);
      await patch(a.body.id, { name: a.body.name.toUpperCase() }).expect(200); // đổi hoa-thường của chính mình
      const clash = await patch(b.body.id, { name: a.body.name }).expect(409);
      expect(clash.body.message).toContain('đã tồn tại');
    });

    it('đổi tên gần giống phòng khác bị cảnh báo; thêm khoảng trắng thừa vào tên của chính mình thì không', async () => {
      const tag = randomTag(12);
      await post({ name: `Phong ZZ${tag}` }).expect(201);
      const other = await post({ name: roomName() }).expect(201);
      // Dấu chấm thay khoảng trắng: khác nhau với citext (không phải trùng cứng) nhưng bằng nhau sau chuẩn hoá.
      const warn = await patch(other.body.id, { name: `Phong.ZZ${tag}` }).expect(409);
      expect(warn.body.error).toBe('NEAR_DUPLICATE');
      // Hai khoảng trắng cuối bị cắt: chuẩn hoá cho ra đúng tên cũ, nên không đổi gì và không cảnh báo.
      await patch(other.body.id, { name: `${other.body.name}  ` }).expect(200);
    });

    it('đổi tên không đổi bản chụp trên phiên cũ (T-ROOM-3 phần phòng; phần phiên ở plan D)', async () => {
      const created = await post({ name: roomName() }).expect(201);
      const klass = await seedClass(ds, { teacherId });
      const start = new Date(Date.now() - 20 * 24 * 3_600_000);
      const session = await seedExamSession(ds, {
        teacherId,
        classId: klass.id,
        startTime: start,
        endTime: new Date(start.getTime() + 3_600_000),
        status: 'completed',
        roomId: created.body.id,
        roomName: created.body.name,
      });
      const newName = roomName();
      await patch(created.body.id, { name: newName }).expect(200);
      const [row] = await ds.query(`SELECT room_name FROM examcollect.exam_session WHERE id = $1`, [session.id]);
      expect(row.room_name).toBe(created.body.name);
    });

    it('404 cho phòng không tồn tại', async () => {
      await patch('00000000-0000-4000-8000-000000000000', { capacity: 5 }).expect(404);
    });
  });

  describe('danh sách', () => {
    it('?active=true chỉ trả phòng đang hoạt động; mặc định trả cả hai (cho trang quản trị)', async () => {
      const on = await post({ name: roomName() }).expect(201);
      const off = await post({ name: roomName() }).expect(201);
      await patch(off.body.id, { isActive: false }).expect(200);

      const active = await request(app.getHttpServer()).get('/rooms?active=true').set(auth(teacherToken)).expect(200);
      const ids = active.body.map((r: { id: string }) => r.id);
      expect(ids).toContain(on.body.id);
      expect(ids).not.toContain(off.body.id);

      const all = await request(app.getHttpServer()).get('/rooms').set(auth(adminToken)).expect(200);
      const allIds = all.body.map((r: { id: string }) => r.id);
      expect(allIds).toEqual(expect.arrayContaining([on.body.id, off.body.id]));
    });

    it('sessionCount của admin đếm đúng số phiên của phòng', async () => {
      const created = await post({ name: roomName() }).expect(201);
      const klass = await seedClass(ds, { teacherId });
      const start = new Date(Date.now() - 21 * 24 * 3_600_000);
      await seedExamSession(ds, {
        teacherId,
        classId: klass.id,
        startTime: start,
        endTime: new Date(start.getTime() + 3_600_000),
        status: 'completed',
        roomId: created.body.id,
      });
      const list = await request(app.getHttpServer()).get('/rooms').set(auth(adminToken)).expect(200);
      expect(list.body.find((r: { id: string }) => r.id === created.body.id).sessionCount).toBe(1);
    });

    it('sắp theo tên: hai phòng chỉ khác ký tự cuối thì A đứng trước B', async () => {
      // Không so với một thứ tự tính bằng JS: DB sắp theo collation của nó (bỏ qua
      // khoảng trắng và dấu câu ở lượt đầu), còn `localeCompare` theo luật ICU — hai bên
      // lệch nhau ở tên có khoảng trắng. Hai tên khác nhau đúng ở ký tự cuối thì
      // collation nào cũng cho cùng một thứ tự.
      const tag = randomTag(12);
      const b = await post({ name: `Phong ZZ${tag}B` }).expect(201);
      const a = await post({ name: `Phong ZZ${tag}A` }).expect(201);
      const list = await request(app.getHttpServer()).get('/rooms').set(auth(adminToken)).expect(200);
      const ids = list.body.map((r: { id: string }) => r.id);
      expect(ids.indexOf(a.body.id)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(a.body.id)).toBeLessThan(ids.indexOf(b.body.id));
    });

    it('tham số active lạ là 400', async () => {
      await request(app.getHttpServer()).get('/rooms?active=maybe').set(auth(adminToken)).expect(400);
    });
  });

  describe('xoá', () => {
    it('xoá được phòng chưa có phiên; audit mang tên trong oldValue', async () => {
      const created = await post({ name: roomName(), capacity: 30 }).expect(201);
      await request(app.getHttpServer()).delete(`/rooms/${created.body.id}`).set(auth(adminToken)).expect(204);
      const [row] = await ds.query(`SELECT old_value FROM examcollect.audit_log WHERE target_id = $1 AND action = 'room.delete'`, [created.body.id]);
      expect(row.old_value).toMatchObject({ targetLabel: created.body.name, capacity: 30 });
    });

    it('T-MD-8: phòng đã có phiên không xoá được; báo số phiên và gợi ý tắt hoạt động', async () => {
      const created = await post({ name: roomName() }).expect(201);
      const klass = await seedClass(ds, { teacherId });
      const start = new Date(Date.now() - 22 * 24 * 3_600_000);
      await seedExamSession(ds, {
        teacherId,
        classId: klass.id,
        startTime: start,
        endTime: new Date(start.getTime() + 3_600_000),
        status: 'completed',
        roomId: created.body.id,
      });
      const blocked = await request(app.getHttpServer()).delete(`/rooms/${created.body.id}`).set(auth(adminToken)).expect(409);
      expect(blocked.body.message).toMatch(/1 phiên/);
      expect(blocked.body.message).toMatch(/hoạt động/);
    });

    it('xoá thất bại không để lại dòng audit', async () => {
      const created = await post({ name: roomName() }).expect(201);
      const klass = await seedClass(ds, { teacherId });
      const start = new Date(Date.now() - 23 * 24 * 3_600_000);
      await seedExamSession(ds, {
        teacherId, classId: klass.id, startTime: start, endTime: new Date(start.getTime() + 3_600_000), status: 'completed', roomId: created.body.id,
      });
      const before = await auditCount('room.delete');
      await request(app.getHttpServer()).delete(`/rooms/${created.body.id}`).set(auth(adminToken)).expect(409);
      expect(await auditCount('room.delete')).toBe(before);
    });
  });
});
```

Ca "đổi tên gần giống phòng khác" có một biểu thức nối chuỗi rối (`replace(...) + ''`); khi viết thật, thay nó bằng một chuỗi rõ ràng: `` `Phong.ZZ${tag}` `` (khác `Phong ZZ${tag}` đúng ở một dấu chấm thay cho khoảng trắng, nên `normalized`-bằng-nhau). Ca cuối của nhóm đó dùng `other.body.name` + một khoảng trắng thừa để chứng minh việc chuẩn hoá khoảng trắng; viết lại thành `` `${other.body.name}  ` `` (hai khoảng trắng cuối, bị cắt).

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `npx jest --config ./test/jest-e2e.json test/room.e2e-spec.ts`
Expected: FAIL — route `/rooms` chưa có (404).

- [ ] **Step 3: Viết kiểu, DTO và hàm dựng 409**

Thêm vào cuối `apps/api/src/course/course.types.ts`:

```ts
/** Một phòng thi. `sessionCount` chỉ có với admin. */
export class RoomView {
  id!: string;
  name!: string;
  capacity!: number | null;
  isActive!: boolean;
  sessionCount?: number;
}
```

Create `apps/api/src/course/dto/room.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateRoomDto {
  /** Tên chưa chuẩn hoá — service cắt và gộp khoảng trắng rồi kiểm độ dài. */
  @IsString()
  name!: string;

  /** Chưa biết sức chứa không được chặn việc ghi nhận phòng. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number;

  /** Admin đã thấy cảnh báo "gần giống" và vẫn muốn thêm. */
  @IsOptional()
  @IsBoolean()
  confirmSimilar?: boolean;
}

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  name?: string;

  /** `null` xoá sức chứa. `@IsOptional` bỏ qua cả `null` lẫn `undefined`. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  confirmSimilar?: boolean;
}

export class ListRoomsDto {
  /** `?active=true` cho form tạo phiên. Vắng mặt là cả phòng đã ngừng (trang quản trị). */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['true', 'false'])
  active?: 'true' | 'false';
}
```

Create `apps/api/src/course/near-duplicate.error.ts`:

```ts
import { ConflictException } from '@nestjs/common';

export interface SimilarEntry {
  id: string;
  name: string;
}

/**
 * 409 NEAR_DUPLICATE: "cái bạn gõ giống cái đã có". KHÁC trùng cứng — trùng cứng
 * là 409 thường với câu "đã tồn tại" (DB có khoá duy nhất cho nó). Cảnh báo này
 * là lời nhắc, không phải lệnh cấm: client gửi lại với `confirmSimilar: true` thì
 * ghi được. Thân phản hồi mang `error` để giao diện phân biệt hai loại 409 mà
 * không phải đọc chữ.
 */
export function nearDuplicateConflict(
  noun: string,
  value: string,
  similar: SimilarEntry[],
): ConflictException {
  const names = similar.map((entry) => `"${entry.name}"`).join(', ');
  return new ConflictException({
    error: 'NEAR_DUPLICATE',
    message:
      `${noun} "${value}" gần giống ${names}. ` +
      `Nếu đây đúng là một ${noun.toLowerCase()} khác, hãy xác nhận để tiếp tục.`,
    similar,
  });
}
```

- [ ] **Step 4: Viết service**

Create `apps/api/src/course/room.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogService } from '../admin/audit-log.service';
import { normalizeRoomName, roomNameProblem } from '../common/master-data-normalize';
import { findNearDuplicates } from '../common/near-duplicate';
import { CreateRoomDto, UpdateRoomDto } from './dto/room.dto';
import { RoomEntity } from './entities/room.entity';
import { nearDuplicateConflict, SimilarEntry } from './near-duplicate.error';
import { RoomView } from './course.types';

interface RoomRow {
  id: string;
  name: string;
  capacity: number | null;
  isActive: boolean;
  sessionCount: number;
}

/**
 * Phòng thi do admin khai; giảng viên chỉ chọn trong những phòng đang hoạt động
 * (spec §2.4). Nhập tay và import dùng chung `prepareName` (nguyên tắc 6).
 *
 * Thứ tự kiểm khi tạo/đổi tên: hợp lệ (400) -> trùng CỨNG (409 "đã tồn tại",
 * DB có khoá duy nhất citext) -> "gần giống" (409 NEAR_DUPLICATE, có thể xác
 * nhận bỏ qua). Trùng cứng đứng trước vì không có gì để xác nhận.
 */
@Injectable()
export class RoomService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
  ) {}

  async list(opts: { activeOnly: boolean; withCounts: boolean }): Promise<RoomView[]> {
    const rows: RoomRow[] = await this.dataSource.query(
      `SELECT r.id, r.name::text AS name, r.capacity, r.is_active AS "isActive",
              (SELECT count(*)::int FROM examcollect.exam_session s WHERE s.room_id = r.id) AS "sessionCount"
         FROM examcollect.room r
        WHERE ($1::boolean IS FALSE OR r.is_active)
        ORDER BY lower(r.name::text), r.name::text`,
      [opts.activeOnly],
    );
    return rows.map((row) => this.toView(row, opts.withCounts));
  }

  async create(actorId: string, dto: CreateRoomDto): Promise<RoomView> {
    const name = this.prepareName(dto.name);
    return this.dataSource.transaction(async (manager) => {
      await this.assertNameFree(manager, name, null);
      if (!dto.confirmSimilar) {
        await this.assertNotNearDuplicate(manager, name, null);
      }
      const repo = manager.getRepository(RoomEntity);
      const saved = await repo.save(repo.create({ name, capacity: dto.capacity ?? null, isActive: true }));
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'room.create',
          targetType: 'room',
          targetId: saved.id,
          newValue: { targetLabel: saved.name, capacity: saved.capacity, isActive: saved.isActive },
        },
        manager,
      );
      return this.toView({ ...saved, sessionCount: 0 }, true);
    });
  }

  async update(actorId: string, id: string, dto: UpdateRoomDto): Promise<RoomView> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RoomEntity);
      const current = await repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy phòng.');

      const next = {
        name: dto.name === undefined ? current.name : this.prepareName(dto.name),
        capacity: dto.capacity === undefined ? current.capacity : dto.capacity,
        isActive: dto.isActive ?? current.isActive,
      };
      const changed = (['name', 'capacity', 'isActive'] as const).filter((key) => next[key] !== current[key]);
      const sessionCount = await this.countSessions(manager, id);
      if (changed.length === 0) return this.toView({ ...current, sessionCount }, true);

      if (changed.includes('name')) {
        await this.assertNameFree(manager, next.name, id);
        if (!dto.confirmSimilar) {
          await this.assertNotNearDuplicate(manager, next.name, id);
        }
      }

      const before = { ...current };
      Object.assign(current, next);
      const saved = await repo.save(current);

      const oldValue: Record<string, unknown> = {};
      const newValue: Record<string, unknown> = {};
      for (const key of changed) {
        oldValue[key] = before[key];
        newValue[key] = saved[key];
      }
      newValue.targetLabel = saved.name;
      await this.audit.recordUserAction(
        { actorId, action: 'room.update', targetType: 'room', targetId: id, oldValue, newValue },
        manager,
      );
      return this.toView({ ...saved, sessionCount }, true);
    });
  }

  async remove(actorId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RoomEntity);
      const current = await repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy phòng.');

      const sessionCount = await this.countSessions(manager, id);
      if (sessionCount > 0) {
        throw new ConflictException(
          `Phòng "${current.name}" đã có ${sessionCount} phiên thi nên không xoá được. ` +
            'Hãy tắt hoạt động để không ai chọn nó cho phiên mới, lịch sử vẫn giữ nguyên.',
        );
      }
      await repo.remove(current);
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'room.delete',
          targetType: 'room',
          targetId: id,
          oldValue: { targetLabel: current.name, capacity: current.capacity, isActive: current.isActive },
        },
        manager,
      );
    });
  }

  /** Chuẩn hoá rồi kiểm — dùng chung cho nhập tay và (plan E) import. */
  prepareName(raw: string): string {
    const name = normalizeRoomName(raw);
    const problem = roomNameProblem(name);
    if (problem) throw new BadRequestException(problem);
    return name;
  }

  private async countSessions(manager: EntityManager, roomId: string): Promise<number> {
    const [row] = await manager.query(
      `SELECT count(*)::int AS n FROM examcollect.exam_session WHERE room_id = $1`,
      [roomId],
    );
    return row.n;
  }

  private async assertNameFree(manager: EntityManager, name: string, excludeId: string | null): Promise<void> {
    const [row] = await manager.query(
      `SELECT name::text AS name FROM examcollect.room WHERE name = $1 AND ($2::uuid IS NULL OR id <> $2)`,
      [name, excludeId],
    );
    if (row) throw new ConflictException(`Phòng "${row.name}" đã tồn tại.`);
  }

  private async assertNotNearDuplicate(
    manager: EntityManager,
    name: string,
    excludeId: string | null,
  ): Promise<void> {
    const rows: SimilarEntry[] = await manager.query(
      `SELECT id, name::text AS name FROM examcollect.room WHERE ($1::uuid IS NULL OR id <> $1)`,
      [excludeId],
    );
    const similar = findNearDuplicates(name, rows, (row) => row.name).map((match) => match.candidate);
    if (similar.length > 0) throw nearDuplicateConflict('Phòng', name, similar);
  }

  private toView(row: RoomRow | (RoomEntity & { sessionCount: number }), withCounts: boolean): RoomView {
    return {
      id: row.id,
      name: row.name,
      capacity: row.capacity,
      isActive: row.isActive,
      ...(withCounts ? { sessionCount: row.sessionCount } : {}),
    };
  }
}
```

- [ ] **Step 5: Viết controller và nối module**

Create `apps/api/src/course/room.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoomService } from './room.service';
import { CreateRoomDto, ListRoomsDto, UpdateRoomDto } from './dto/room.dto';

/** Phòng thi. Admin quản lý; giảng viên chỉ đọc (để chọn cho phiên mới). Xem `SemesterController` về `@Roles` ở mức class. */
@Controller('rooms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class RoomController {
  constructor(private readonly rooms: RoomService) {}

  @Get()
  @Roles('admin', 'teacher')
  list(@Query() query: ListRoomsDto, @Req() req: Request) {
    return this.rooms.list({
      activeOnly: query.active === 'true',
      // Số phiên của một phòng là thông tin tổng hợp của người khác: chỉ admin.
      withCounts: req.user!.role === 'admin',
    });
  }

  @Post()
  create(@Body() dto: CreateRoomDto, @Req() req: Request) {
    return this.rooms.create(req.user!.sub, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoomDto, @Req() req: Request) {
    return this.rooms.update(req.user!.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.rooms.remove(req.user!.sub, id);
  }
}
```

Trong `apps/api/src/course/course.module.ts`: thêm `RoomController` vào `controllers`, `RoomService` vào `providers` và `exports`.

- [ ] **Step 6: Chạy để thấy xanh**

Run: `npx jest --config ./test/jest-e2e.json test/room.e2e-spec.ts`
Expected: PASS (~22 test).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/course apps/api/test/room.e2e-spec.ts
git commit -m "feat(master-data): CRUD phòng thi của admin (chuẩn hoá tên, cảnh báo gần giống, tắt thay vì xoá)"
```

---

### Task 8: Danh mục lớp danh nghĩa — service, controller, e2e

**Files:**
- Create: `apps/api/src/course/dto/administrative-class.dto.ts`, `administrative-class.service.ts`, `administrative-class.controller.ts`
- Modify: `apps/api/src/course/course.types.ts`, `course.module.ts`
- Test: `apps/api/test/administrative-class.e2e-spec.ts`

**Interfaces:**
- Consumes: `normalizeAdministrativeCode`, `administrativeCodeProblem`, `findNearDuplicates`, `nearDuplicateConflict`, `AuditLogService`.
- Produces:

```ts
export class AdministrativeClassView { id: string; code: string; classCount: number }
// AdministrativeClassService
list(): Promise<AdministrativeClassView[]>
create(actorId, dto: CreateAdministrativeClassDto): Promise<AdministrativeClassView>
update(actorId, id, dto: UpdateAdministrativeClassDto): Promise<AdministrativeClassView>
remove(actorId, id): Promise<void>
prepareCode(raw: string): string
// Routes (TẤT CẢ admin)
GET /administrative-classes · POST · PATCH /:id · DELETE /:id (204)
```

- [ ] **Step 1: Viết e2e (đỏ)**

Create `apps/api/test/administrative-class.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { randomTag } from './helpers/master-data';
import { seedClass } from './helpers/seed';

describe('Danh mục lớp danh nghĩa (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let teacherToken: string;
  let adminId: string;
  let teacherId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (body: object, token = adminToken) =>
    request(app.getHttpServer()).post('/administrative-classes').set(auth(token)).send(body);
  const patch = (id: string, body: object, token = adminToken) =>
    request(app.getHttpServer()).patch(`/administrative-classes/${id}`).set(auth(token)).send(body);

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    return response.body.accessToken;
  }

  async function auditCount(action: string) {
    const [row] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.audit_log WHERE action = $1 AND actor_id = $2`, [action, adminId]);
    return row.n as number;
  }

  /** Mã duy nhất, ngẫu nhiên, đủ xa mọi mã khác để không dính luật "gần giống". */
  const code = () => `ZZ${randomTag(12)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const tag = randomTag();
    const adminEmail = `adm_admin_${tag}@example.com`;
    adminId = await createTestAccount(ds, { email: adminEmail, password: 'correct-horse-battery', role: 'admin' });
    adminToken = await login(adminEmail);
    const teacherEmail = `adm_teacher_${tag}@example.com`;
    teacherId = await createTestAccount(ds, { email: teacherEmail, password: 'correct-horse-battery', role: 'teacher' });
    teacherToken = await login(teacherEmail);
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM examcollect.class WHERE teacher_id = $1`, [teacherId]).catch(() => undefined);
    await app.close();
  });

  it('T-ADM-5: giảng viên không đọc cũng không ghi được Danh mục (mọi route đều 403)', async () => {
    const created = await post({ code: code() }).expect(201);
    await request(app.getHttpServer()).get('/administrative-classes').set(auth(teacherToken)).expect(403);
    await post({ code: code() }, teacherToken).expect(403);
    await patch(created.body.id, { code: code() }, teacherToken).expect(403);
    await request(app.getHttpServer()).delete(`/administrative-classes/${created.body.id}`).set(auth(teacherToken)).expect(403);
    await request(app.getHttpServer()).get('/administrative-classes').expect(401);
  });

  describe('tạo', () => {
    it('T-MD-3 (service): viết hoa và cắt khoảng trắng; mã gõ lại ở dạng khác là 409', async () => {
      const base = code();
      const before = await auditCount('administrative_class.create');
      const created = await post({ code: ` ${base.toLowerCase()} ` }).expect(201);
      expect(created.body).toMatchObject({ code: base, classCount: 0 });
      expect(await auditCount('administrative_class.create')).toBe(before + 1);

      const dup = await post({ code: base }).expect(409);
      expect(dup.body.message).toContain('đã tồn tại');
      expect(dup.body).not.toHaveProperty('error', 'NEAR_DUPLICATE');
      const dup2 = await post({ code: `  ${base.toLowerCase()}` }).expect(409);
      expect(dup2.body.message).toContain('đã tồn tại');
      // Trùng cứng không để lại dòng audit nào thêm.
      expect(await auditCount('administrative_class.create')).toBe(before + 1);
    });

    it('audit mang targetLabel và code', async () => {
      const value = code();
      const created = await post({ code: value }).expect(201);
      const [row] = await ds.query(`SELECT new_value FROM examcollect.audit_log WHERE target_id = $1`, [created.body.id]);
      expect(row.new_value).toEqual({ targetLabel: value, code: value });
    });

    it('mã sai định dạng là 400 kèm lý do: quá ngắn, quá dài, ký tự lạ, khoảng trắng giữa', async () => {
      await post({ code: 'AB' }).expect(400);
      await post({ code: 'A'.repeat(31) }).expect(400);
      await post({ code: 'DHK-TPM18' }).expect(400);
      const spaced = await post({ code: 'DHK TPM18' }).expect(400);
      expect(spaced.body.message).toMatch(/chữ và số/);
      await post({ code: '   ' }).expect(400);
      await post({}).expect(400);
    });

    it('T-ADM-3: mã gần giống mã có sẵn bị cảnh báo 409 NEAR_DUPLICATE; xác nhận thì ghi được', async () => {
      const base = `ZZ${randomTag(10)}AB`;
      const existing = await post({ code: base }).expect(201);
      const before = await auditCount('administrative_class.create');

      const similar = `${base.slice(0, -2)}BA`; // hai ký tự cuối đổi chỗ
      const warn = await post({ code: similar }).expect(409);
      expect(warn.body.error).toBe('NEAR_DUPLICATE');
      expect(warn.body.similar).toEqual([{ id: existing.body.id, name: base }]);
      expect(await auditCount('administrative_class.create')).toBe(before);

      const confirmed = await post({ code: similar, confirmSimilar: true }).expect(201);
      expect(confirmed.body.code).toBe(similar);
    });

    it('KHÔNG cảnh báo trên cặp lớp thật khác nhau ATT/CTT (Review Focus 4)', async () => {
      const prefix = `ZZ${randomTag(8)}`;
      await post({ code: `${prefix}ATT` }).expect(201);
      await post({ code: `${prefix}CTT` }).expect(201);
    });

    it('cảnh báo cả trường hợp thiếu một ký tự', async () => {
      const base = `ZZ${randomTag(10)}ATT`;
      await post({ code: base }).expect(201);
      const warn = await post({ code: base.slice(0, -1) }).expect(409);
      expect(warn.body.error).toBe('NEAR_DUPLICATE');
    });
  });

  describe('sửa', () => {
    it('sửa lỗi gõ: đổi code của đúng một dòng; audit ghi cũ và mới', async () => {
      const typo = code();
      const created = await post({ code: typo }).expect(201);
      const fixed = code();
      const response = await patch(created.body.id, { code: fixed.toLowerCase() }).expect(200);
      expect(response.body.code).toBe(fixed);

      const [row] = await ds.query(
        `SELECT old_value, new_value FROM examcollect.audit_log WHERE target_id = $1 AND action = 'administrative_class.update'`,
        [created.body.id],
      );
      expect(row.old_value).toEqual({ code: typo });
      expect(row.new_value).toEqual({ targetLabel: fixed, code: fixed });
    });

    it('đổi sang mã đã có là 409; đổi hoa-thường của chính mình thì không phải trùng', async () => {
      const a = await post({ code: code() }).expect(201);
      const b = await post({ code: code() }).expect(201);
      await patch(a.body.id, { code: a.body.code.toLowerCase() }).expect(200);
      const clash = await patch(b.body.id, { code: a.body.code }).expect(409);
      expect(clash.body.message).toContain('đã tồn tại');
    });

    it('đổi sang mã gần giống mã khác bị cảnh báo; confirmSimilar bỏ qua', async () => {
      const base = `ZZ${randomTag(10)}AB`;
      await post({ code: base }).expect(201);
      const other = await post({ code: code() }).expect(201);
      const similar = `${base.slice(0, -2)}BA`;
      const warn = await patch(other.body.id, { code: similar }).expect(409);
      expect(warn.body.error).toBe('NEAR_DUPLICATE');
      await patch(other.body.id, { code: similar, confirmSimilar: true }).expect(200);
    });

    it('404 cho mã không tồn tại; gửi lại đúng giá trị cũ không ghi audit', async () => {
      await patch('00000000-0000-4000-8000-000000000000', { code: code() }).expect(404);
      const created = await post({ code: code() }).expect(201);
      await patch(created.body.id, { code: created.body.code }).expect(200);
      const rows = await ds.query(`SELECT 1 FROM examcollect.audit_log WHERE target_id = $1 AND action = 'administrative_class.update'`, [created.body.id]);
      expect(rows).toHaveLength(0);
    });
  });

  describe('danh sách và xoá', () => {
    it('danh sách đếm số lớp đang dùng mỗi mã', async () => {
      const value = code();
      const created = await post({ code: value }).expect(201);
      await seedClass(ds, { teacherId, administrativeClassId: created.body.id, groupName: 'Nhóm 1' });
      await seedClass(ds, { teacherId, administrativeClassId: created.body.id, groupName: 'Nhóm 2' });

      const list = await request(app.getHttpServer()).get('/administrative-classes').set(auth(adminToken)).expect(200);
      expect(list.body.find((c: { id: string }) => c.id === created.body.id)).toMatchObject({ code: value, classCount: 2 });
    });

    it('sắp theo mã: hai mã chỉ khác ký tự cuối thì A đứng trước B', async () => {
      // Xem ghi chú ở test phòng: không so với một thứ tự tính bằng JS vì collation của DB khác ICU.
      const prefix = `ZZ${randomTag(10)}`;
      const b = await post({ code: `${prefix}B` }).expect(201);
      const a = await post({ code: `${prefix}A` }).expect(201);
      const list = await request(app.getHttpServer()).get('/administrative-classes').set(auth(adminToken)).expect(200);
      const ids = list.body.map((c: { id: string }) => c.id);
      expect(ids.indexOf(a.body.id)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(a.body.id)).toBeLessThan(ids.indexOf(b.body.id));
    });

    it('T-MD-4: xoá mã còn lớp dùng bị chặn kèm lý do và số lớp', async () => {
      const created = await post({ code: code() }).expect(201);
      await seedClass(ds, { teacherId, administrativeClassId: created.body.id });
      const before = await auditCount('administrative_class.delete');

      const blocked = await request(app.getHttpServer()).delete(`/administrative-classes/${created.body.id}`).set(auth(adminToken)).expect(409);
      expect(blocked.body.message).toContain(created.body.code);
      expect(blocked.body.message).toMatch(/1 lớp/);
      expect(await auditCount('administrative_class.delete')).toBe(before);
    });

    it('T-MD-4: mã không lớp nào dùng thì xoá được, và KHÔNG tự biến mất khi chưa ai xoá (đã bỏ "mồ côi tự dọn")', async () => {
      const created = await post({ code: code() }).expect(201);
      // Chưa có lớp nào dùng: vẫn nằm trong Danh mục.
      const list = await request(app.getHttpServer()).get('/administrative-classes').set(auth(adminToken)).expect(200);
      expect(list.body.map((c: { id: string }) => c.id)).toContain(created.body.id);

      // Một lớp dùng nó rồi bị xoá: mã vẫn ở lại.
      const klass = await seedClass(ds, { teacherId, administrativeClassId: created.body.id });
      await ds.query(`DELETE FROM examcollect.class WHERE id = $1`, [klass.id]);
      const again = await request(app.getHttpServer()).get('/administrative-classes').set(auth(adminToken)).expect(200);
      expect(again.body.map((c: { id: string }) => c.id)).toContain(created.body.id);

      await request(app.getHttpServer()).delete(`/administrative-classes/${created.body.id}`).set(auth(adminToken)).expect(204);
      const [row] = await ds.query(`SELECT old_value FROM examcollect.audit_log WHERE target_id = $1 AND action = 'administrative_class.delete'`, [created.body.id]);
      expect(row.old_value).toMatchObject({ targetLabel: created.body.code });
    });
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `npx jest --config ./test/jest-e2e.json test/administrative-class.e2e-spec.ts`
Expected: FAIL — route chưa có (404 thay vì 403/201).

- [ ] **Step 3: Viết kiểu và DTO**

Thêm vào cuối `apps/api/src/course/course.types.ts`:

```ts
/** Một mã trong Danh mục lớp danh nghĩa (chỉ admin thấy). */
export class AdministrativeClassView {
  id!: string;
  code!: string;
  /** Số lớp học phần đang dùng mã này. */
  classCount!: number;
}
```

Create `apps/api/src/course/dto/administrative-class.dto.ts`:

```ts
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateAdministrativeClassDto {
  /** Chưa chuẩn hoá: service viết hoa, cắt khoảng trắng rồi kiểm 3–30 ký tự chữ/số. */
  @IsString()
  code!: string;

  @IsOptional()
  @IsBoolean()
  confirmSimilar?: boolean;
}

export class UpdateAdministrativeClassDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsBoolean()
  confirmSimilar?: boolean;
}
```

- [ ] **Step 4: Viết service**

Create `apps/api/src/course/administrative-class.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogService } from '../admin/audit-log.service';
import {
  administrativeCodeProblem,
  normalizeAdministrativeCode,
} from '../common/master-data-normalize';
import { findNearDuplicates } from '../common/near-duplicate';
import {
  CreateAdministrativeClassDto,
  UpdateAdministrativeClassDto,
} from './dto/administrative-class.dto';
import { AdministrativeClassEntity } from './entities/administrative-class.entity';
import { nearDuplicateConflict } from './near-duplicate.error';
import { AdministrativeClassView } from './course.types';

/**
 * Danh mục lớp danh nghĩa (spec §2.2). Mã CHỈ được tạo ở đây (nhập tay hoặc
 * import); form tạo lớp chỉ chọn. Hệ thống vẫn không biết trường có những mã nào
 * thật — danh mục đúng tới mức danh sách của admin đúng — nhưng lỗi gõ giờ xảy ra
 * MỘT lần cho cả danh mục thay vì mỗi lần tạo lớp.
 *
 * Xoá chỉ khi không lớp nào dùng. Mã nhập trước khi có lớp là trạng thái BÌNH
 * THƯỜNG, nên không có "mồ côi tự dọn": một mã không có lớp nào không bao giờ tự
 * biến mất.
 */
@Injectable()
export class AdministrativeClassService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
  ) {}

  async list(): Promise<AdministrativeClassView[]> {
    const rows: AdministrativeClassView[] = await this.dataSource.query(
      `SELECT a.id, a.code::text AS code,
              (SELECT count(*)::int FROM examcollect.class c WHERE c.administrative_class_id = a.id) AS "classCount"
         FROM examcollect.administrative_class a
        ORDER BY a.code::text`,
    );
    return rows;
  }

  async create(actorId: string, dto: CreateAdministrativeClassDto): Promise<AdministrativeClassView> {
    const code = this.prepareCode(dto.code);
    return this.dataSource.transaction(async (manager) => {
      await this.assertCodeFree(manager, code, null);
      if (!dto.confirmSimilar) {
        await this.assertNotNearDuplicate(manager, code, null);
      }
      const repo = manager.getRepository(AdministrativeClassEntity);
      const saved = await repo.save(repo.create({ code }));
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'administrative_class.create',
          targetType: 'administrative_class',
          targetId: saved.id,
          newValue: { targetLabel: saved.code, code: saved.code },
        },
        manager,
      );
      return { id: saved.id, code: saved.code, classCount: 0 };
    });
  }

  async update(
    actorId: string,
    id: string,
    dto: UpdateAdministrativeClassDto,
  ): Promise<AdministrativeClassView> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AdministrativeClassEntity);
      const current = await repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy mã lớp danh nghĩa.');

      const classCount = await this.countClasses(manager, id);
      if (dto.code === undefined) return { id, code: current.code, classCount };

      const next = this.prepareCode(dto.code);
      // `code` là citext: "dhktpm18a" và "DHKTPM18A" bằng nhau, nên đổi hoa-thường
      // của chính mình không phải một thay đổi (mã đã được chuẩn hoá HOA ở tầng ghi).
      if (next === current.code) return { id, code: current.code, classCount };

      await this.assertCodeFree(manager, next, id);
      if (!dto.confirmSimilar) {
        await this.assertNotNearDuplicate(manager, next, id);
      }

      const previous = current.code;
      current.code = next;
      const saved = await repo.save(current);
      // Mọi lớp dùng mã này đổi nhãn theo, kể cả lớp của kỳ cũ: nhãn lớp là biểu
      // thức, không phải bản chụp (spec §2.2). Đó là mục đích của việc sửa lỗi gõ.
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'administrative_class.update',
          targetType: 'administrative_class',
          targetId: id,
          oldValue: { code: previous },
          newValue: { targetLabel: saved.code, code: saved.code },
        },
        manager,
      );
      return { id, code: saved.code, classCount };
    });
  }

  async remove(actorId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AdministrativeClassEntity);
      const current = await repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy mã lớp danh nghĩa.');

      const classCount = await this.countClasses(manager, id);
      if (classCount > 0) {
        throw new ConflictException(
          `Mã ${current.code} còn ${classCount} lớp đang dùng nên không xoá được. ` +
            'Hãy chuyển hoặc xoá các lớp đó trước.',
        );
      }
      await repo.remove(current);
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'administrative_class.delete',
          targetType: 'administrative_class',
          targetId: id,
          oldValue: { targetLabel: current.code, code: current.code },
        },
        manager,
      );
    });
  }

  /** Chuẩn hoá rồi kiểm — dùng chung cho nhập tay và (plan E) import. */
  prepareCode(raw: string): string {
    const code = normalizeAdministrativeCode(raw);
    const problem = administrativeCodeProblem(code);
    if (problem) throw new BadRequestException(problem);
    return code;
  }

  private async countClasses(manager: EntityManager, id: string): Promise<number> {
    const [row] = await manager.query(
      `SELECT count(*)::int AS n FROM examcollect.class WHERE administrative_class_id = $1`,
      [id],
    );
    return row.n;
  }

  private async assertCodeFree(manager: EntityManager, code: string, excludeId: string | null): Promise<void> {
    const [row] = await manager.query(
      `SELECT code::text AS code FROM examcollect.administrative_class
        WHERE code = $1 AND ($2::uuid IS NULL OR id <> $2)`,
      [code, excludeId],
    );
    if (row) throw new ConflictException(`Mã ${row.code} đã tồn tại trong Danh mục lớp danh nghĩa.`);
  }

  private async assertNotNearDuplicate(
    manager: EntityManager,
    code: string,
    excludeId: string | null,
  ): Promise<void> {
    const rows: { id: string; name: string }[] = await manager.query(
      `SELECT id, code::text AS name FROM examcollect.administrative_class
        WHERE ($1::uuid IS NULL OR id <> $1)`,
      [excludeId],
    );
    const similar = findNearDuplicates(code, rows, (row) => row.name).map((match) => match.candidate);
    if (similar.length > 0) throw nearDuplicateConflict('Mã lớp danh nghĩa', code, similar);
  }
}
```

- [ ] **Step 5: Viết controller và nối module**

Create `apps/api/src/course/administrative-class.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdministrativeClassService } from './administrative-class.service';
import {
  CreateAdministrativeClassDto,
  UpdateAdministrativeClassDto,
} from './dto/administrative-class.dto';

/**
 * Danh mục lớp danh nghĩa — TOÀN BỘ chỉ admin, kể cả đọc. Giảng viên không có
 * trang, route hay bộ lọc cho nó; họ chỉ thấy nhãn gộp `mã – nhóm` ở mọi nơi
 * hiện tên lớp (spec §2.2, §5.2), nên không bao giờ thấy "hai thứ".
 */
@Controller('administrative-classes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdministrativeClassController {
  constructor(private readonly classes: AdministrativeClassService) {}

  @Get()
  list() {
    return this.classes.list();
  }

  @Post()
  create(@Body() dto: CreateAdministrativeClassDto, @Req() req: Request) {
    return this.classes.create(req.user!.sub, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdministrativeClassDto,
    @Req() req: Request,
  ) {
    return this.classes.update(req.user!.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.classes.remove(req.user!.sub, id);
  }
}
```

Trong `apps/api/src/course/course.module.ts`: thêm `AdministrativeClassController` vào `controllers`, `AdministrativeClassService` vào `providers` và `exports`.

- [ ] **Step 6: Chạy để thấy xanh**

Run: `npx jest --config ./test/jest-e2e.json test/administrative-class.e2e-spec.ts`
Expected: PASS (~18 test).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/course apps/api/test/administrative-class.e2e-spec.ts
git commit -m "feat(master-data): Danh mục lớp danh nghĩa của admin (chuẩn hoá hoa, cảnh báo gần giống, chặn xoá khi còn lớp)"
```

---

### Task 9: Sinh lại client, chạy cả hai bộ, và soát quyền

**Files:**
- Modify: `packages/shared/src/api/schema.d.ts`

- [ ] **Step 1: Sinh lại client OpenAPI**

Làm đúng Task 3 của plan B (build API, chạy với `DOTENV_CONFIG_PATH=.env.test`, `pnpm generate:api-client`, kiểm diff, tắt đúng PID). Diff phải **chỉ thêm** các đường `/semesters`, `/semesters/{id}`, `/rooms`, `/rooms/{id}`, `/administrative-classes`, `/administrative-classes/{id}` và các kiểu DTO của chúng (nếu plan B đã được merge thì cả `/audit-log` đã nằm sẵn). Hunk không liên quan ⇒ dừng và tách commit `chore(shared): đồng bộ schema.d.ts` trước.

- [ ] **Step 2: Quét "quên `@Roles`"**

Bài `roles-retired.spec.ts` chỉ canh hai vai trò đã rút. Thêm một kiểm tra nhỏ rằng ba controller mới đều khai `@Roles('admin')` ở mức class — để một ngày ai đó xoá dòng ấy thì có test đỏ. Create `apps/api/src/course/catalog-roles.spec.ts`:

```ts
import { ROLES_KEY } from '../auth/roles.decorator';
import { AdministrativeClassController } from './administrative-class.controller';
import { RoomController } from './room.controller';
import { SemesterController } from './semester.controller';

/**
 * `RolesGuard` trả `true` khi không có metadata, nên một controller mất dòng
 * `@Roles('admin')` ở mức class vẫn biên dịch, vẫn chạy — và mở cho mọi tài
 * khoản đã đăng nhập. Test này ghim dòng đó.
 */
describe('Controller dữ liệu nền khai @Roles("admin") ở mức class', () => {
  it.each([
    ['SemesterController', SemesterController],
    ['RoomController', RoomController],
    ['AdministrativeClassController', AdministrativeClassController],
  ])('%s', (_name, controller) => {
    expect(Reflect.getMetadata(ROLES_KEY, controller)).toEqual(['admin']);
  });

  it('chỉ route đọc của học kỳ và phòng ghi đè cho giảng viên', () => {
    expect(Reflect.getMetadata(ROLES_KEY, SemesterController.prototype.list)).toEqual(['admin', 'teacher']);
    expect(Reflect.getMetadata(ROLES_KEY, RoomController.prototype.list)).toEqual(['admin', 'teacher']);
    for (const handler of [
      SemesterController.prototype.create,
      SemesterController.prototype.update,
      SemesterController.prototype.remove,
      RoomController.prototype.create,
      RoomController.prototype.update,
      RoomController.prototype.remove,
    ]) {
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toBeUndefined();
    }
    // Danh mục lớp danh nghĩa không có route nào mở cho giảng viên.
    for (const name of ['list', 'create', 'update', 'remove'] as const) {
      expect(Reflect.getMetadata(ROLES_KEY, AdministrativeClassController.prototype[name])).toBeUndefined();
    }
  });
});
```

Run: `npx jest src/course/catalog-roles.spec.ts` — Expected: PASS.

- [ ] **Step 3: Chạy cả bộ unit và cả bộ e2e, so với baseline**

```powershell
cd apps/api
pnpm exec tsc --noEmit
pnpm test 2>&1 | Out-File C:/tmp/unit-after-c.txt
Select-String C:/tmp/unit-after-c.txt -Pattern '^Tests:|^Test Suites:'
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'jest|nest' } | Select-Object ProcessId, CommandLine
npx jest --config ./test/jest-e2e.json --runInBand --json --outputFile=C:/tmp/e2e-after-c.json
node scripts/e2e-summary.cjs C:/tmp/e2e-after-c.json | Out-File -Encoding utf8 C:/tmp/after-c.tsv
$base = Get-Content ../../docs/superpowers/plans/md-restore-baseline.tsv | Where-Object { $_ -notmatch '^#' -and $_ -notmatch '^TOTAL' }
$after = Get-Content C:/tmp/after-c.tsv | Where-Object { $_ -notmatch '^TOTAL' }
Compare-Object $base $after
```

Expected: `Compare-Object` chỉ liệt kê các suite **mới** của plan A–C (`seed-helper`, `master-data-schema`, `semester`, `room`, `administrative-class`, và `audit-log-reader` nếu plan B đã vào) với `=>`; **không** dòng `<=` nào (không suite cũ nào mất hoặc đổi số test). Suite cũ đỏ nghĩa là migration mở rộng đã làm hỏng code cũ: dừng và tìm — nguyên nhân thường gặp là một chỗ đọc `class.name` hay `enrollment.student_name` mà `tsc` không bắt (SQL thô).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/api/schema.d.ts apps/api/src/course/catalog-roles.spec.ts
git commit -m "chore(master-data): sinh lại client OpenAPI và ghim @Roles('admin') của ba controller dữ liệu nền"
```

---

## Tự kiểm lại plan so với spec

- §2.1 `semester` (cột, unique, EXCLUDE không chồng ngày, không đổi năm/kỳ khi đã có lớp, tên suy ra): Task 3 (DB), 4 (entity), 6 (service). §2.2 `administrative_class` (code citext, CHECK, viết hoa/cắt ở tầng ghi, mã chỉ tạo trong Danh mục, cảnh báo gần giống, sửa mã đổi nhãn mọi nơi, xoá chỉ khi không lớp dùng, không mồ côi tự dọn): Task 3, 4, 8. §2.3 `class` (cột mới, `group_name` mặc định `''`, unique, trigger không đổi kỳ khi đã có phiên): Task 3, 4. Phần "đổi `name`/`course_name`, scope kiểm tra theo học kỳ, đổi giảng viên của lớp" thuộc **plan D**. §2.4 `room`, `exam_session.room_id`, chống trùng theo khoá: Task 3, 4, 7. Bản chụp `room_name`/`semester_name` `update:false` và việc server điền: **plan D**. §2.5 view nhãn lớp (view): Task 3; 11 chỗ đọc nó: **plan D**. §2.6 `student` (bảng): Task 3, 4; mọi hành vi (tra tên, khoá tên, rate limit): **plan D**.
- §4 route Học kỳ / Phòng / Lớp danh nghĩa (trừ `…/import`, thuộc plan E): Task 6–8. `GET /accounts/teachers` đủ cho combobox giảng viên của admin (điểm mở §13 mục 7) — nó trả `{id, name}` cho `role: 'teacher'` và dòng chú thích cũ nhắc "Trưởng khoa" ở `accounts.controller.ts:28` chỉ cần sửa chữ: đưa vào plan D (Task sửa `ClassController`) để cùng một PR với chỗ nó được dùng.
- §6.2 nguyên tắc 4 (cảnh báo gần giống) và 6 (một lớp kiểm tra): Task 1, 2, 7, 8 (`prepareName`, `prepareCode`, `semesterProblems` là hàm công khai để plan E gọi lại).
- §8.4 bước 1 ("code cũ vẫn chạy"): hai nới lỏng ở Global Constraints, kiểm bằng Task 3 ("nới lỏng cho code cũ", "ràng buộc cũ theo TÊN vẫn bảo vệ…") và Task 9 Step 3 (suite cũ giữ nguyên số test).
- §13 mục 2 (cơ chế ép bất biến): **trigger** (Task 3) — chọn trigger thay vì khoá ngoại ghép vì nó cho phép gán lần đầu NULL → giá trị mà backfill cần, và không buộc `exam_session` mang thêm cột `semester_id`.
- §13 mục 12 (hàm "gần giống"): Task 1, đã đo, spec đã sửa ở commit 57b727e.
- §11: T-MD-1, 2, 3, 4, 5, 6, 7, 8 (phần học kỳ/phòng/mã), T-ROOM-1, T-ROOM-3 (phần phòng), T-ADM-3, T-ADM-5, T-IMP-8 (nhập tay), T-AUD-1 (học kỳ, phòng, mã). **Không thuộc plan này:** T-MD-9 (snapshot phiên, plan D), T-RW-1/2 (plan D), T-ROOM-2 (phòng ngừng không chọn được cho phiên mới, plan D), T-OWN, T-STU, T-IMP-1…7 (plan D/E), T-ADM-1, 2, 4 (cần lớp admin, plan D/E).
- Kiểu nhất quán: `semesterProblems(SemesterInput)` dùng ở `SemesterService.assertValid` và `update` (đúng 4 khoá `academicYearStart/term/startDate/endDate`); `nearDuplicateConflict(noun, value, SimilarEntry[])` nhận `{id, name}` — `AdministrativeClassService` ánh xạ `code AS name` để dùng chung; `RoomService.prepareName`/`AdministrativeClassService.prepareCode` công khai cho plan E.
- Placeholder scan: hai chỗ trong e2e `room.e2e-spec.ts` được chủ động viết rối rồi chú thích cách viết lại ngay dưới khối mã; chúng là hướng dẫn cụ thể (chuỗi thay thế đã cho), không phải "TBD".
