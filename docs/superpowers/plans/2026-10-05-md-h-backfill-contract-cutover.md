# Plan H — Backfill, migration thu hẹp, diễn tập và cutover

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa dữ liệu thật đang nằm ở hình dạng CŨ (lớp đặt tên bằng chữ, sinh viên chỉ có tên trong `enrollment`, phiên chỉ có tên phòng và tên học kỳ gõ tay) sang hình dạng ĐÍCH của đợt khôi phục master data — bằng một **backfill chạy lại được và dừng thay vì đoán**, một **migration thu hẹp** (PR riêng, không đảo ngược), công cụ **chụp/đối chiếu** để diễn tập trên bản sao, và một **runbook** cutover có đường lùi. Kèm `scripts/reset-dev-data.sql` viết lại và bản `CLAUDE.md` rev 6.

**Architecture:** Mọi thứ nằm ở `apps/api/src/database/master-data/`. Lõi là các hàm **thuần** test được không cần DB: `parseSemesterName`, `planBackfill` (nhận ảnh chụp dữ liệu cũ, trả kế hoạch **hoặc** danh sách điều không ánh xạ được), `contractProblems`. `runBackfill` đọc ảnh chụp, lập kế hoạch, và nếu không có vấn đề thì áp nó **trong một transaction** (khoá tiến trình + khoá ghi bảng, `IS NULL`/`ON CONFLICT DO NOTHING` ở mọi câu nên chạy lại không đổi gì; gộp lớp tìm mọi cột trỏ tới `class` từ catalog) rồi đếm những gì còn thiếu. Một CLI ba lệnh (`snapshot`, `backfill`, `verify`) bọc nó, **từ chối chạy vào máy chủ không phải local nếu không có `--confirm-host`**. Migration thu hẹp (`1789700000000`) kiểm tiền điều kiện bằng cùng hàm đếm rồi mới `SET NOT NULL`, thêm khoá ngoại sinh viên, bỏ bản chống trùng phòng theo tên, bỏ `class.name` và `enrollment.student_name`, dựng lại view `class_label` không còn nhánh dự phòng. Code của PR2 **không đọc** hai cột cũ nên chạy được trên schema trước thu hẹp: thứ tự deploy là code trước, migration sau, không có khoảng hỏng.

**Tech Stack:** NestJS 10, TypeORM 0.3 (`QueryRunner`), Postgres 16, jest (unit + e2e), `pg_dump`/`pg_restore`, Docker local.

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §8 (toàn bộ: 8.1 dữ liệu thật, 8.2 ánh xạ, 8.3 gộp lớp MongoDB, 8.4 trình tự expand → backfill → contract kèm bước 0b đối soát lịch sử migration, 8.5 diễn tập, 8.6 quan hệ với G1–G5), §9 (`CLAUDE.md`), §10 bước 4–6, §11: T-MIG-1…4, T-RW-1, T-RW-2, T-GR-1, T-GR-2, T-GR-3 và đoạn "Nghiệm thu bằng chấm thật"; §12 mục 4, 5, 8; §13 mục 8.

**Phụ thuộc:** toàn bộ plan A–G đã xong và nằm trên nhánh `feat/master-data-restore` (đặc biệt C: migration mở rộng `1789600000000`, hàm chuẩn hoá; D1: `COALESCE` dự phòng cần gỡ; D3: `seedExamSession({ withoutRoom })`, CLI diễn tập dùng `roomId`; F: nhánh "phiên cũ chưa có phòng"). **Thứ tự PR:** PR1 = A–G (chỉ thêm, code cũ vẫn chạy); backfill + CLI + script reset (Task 1–4) vào PR1 hoặc PR riêng ngay sau; PR2 = Task 5 (thu hẹp) **chỉ merge sau khi** backfill đã chạy thật xong trên môi trường dùng thật. Task 6 (runbook, `CLAUDE.md`) đi cùng PR1.

## Global Constraints

- **Dừng, không đoán** (spec §8.2): dòng nào không ánh xạ được (chuỗi học kỳ không đọc ra năm/kỳ và lớp không có phiên nào khác để suy; tên lớp không thành mã lớp danh nghĩa mà không có lệnh gộp; tên phòng rỗng/quá dài; MSSV sai khuôn; một MSSV hai tên; hai lớp trùng `(kỳ, mã, nhóm)`; một lớp có phiên ở hai kỳ) làm `runBackfill` ném `BackfillBlockedError` **trước khi ghi bất cứ gì**, kèm danh sách từng vấn đề.
- **Chạy lại không đổi gì** (T-MIG-2): mọi `UPDATE` có `IS NULL`, mọi `INSERT` có `ON CONFLICT DO NOTHING`, lệnh gộp bỏ qua khi lớp nguồn không còn. Lần chạy thứ hai bắt thêm phiên tạo bởi code cũ trong khoảng chờ (spec §8.4 bước 4). **Không bao giờ ghi đè** thứ admin đã sửa: lớp đã có `semester_id`/`administrative_class_id` giữ nguyên; sinh viên đã có trong `student` giữ tên đã lưu; phòng đã có không bị đổi `is_active`.
- **Ánh xạ (spec §8.2):** học kỳ từ `exam_session.semester_name` (`HK1 2026-2027` và `Học kỳ 1 2026-2027` cùng là 2026 kỳ 1; năm sau phải đúng bằng năm + 1); **ngày tạm** `01/09 → 31/01` (kỳ 1), `01/02 → 31/05` (kỳ 2), `01/06 → 31/08` (kỳ 3) — admin sửa sau; lớp không có phiên nào suy được thì dùng `--default-semester YYYY:T` (giả định cần admin xác nhận) hoặc **dừng**; mã lớp danh nghĩa = tên lớp `trim().toUpperCase()` nếu khớp `^[A-Z0-9]{3,30}$`; `group_name` giữ `''`; phòng = tên phiên đã chuẩn hoá (cắt đầu-cuối, gộp khoảng trắng), `is_active = true` trừ tên nằm trong `--inactive-room` **và** là phòng do lần chạy này tạo; chuỗi học kỳ trên phiên đọc được thì **viết lại** về dạng chuẩn `HK1 2026-2027`, chuỗi không đọc được (TEST) **giữ nguyên** để còn nhận ra; sinh viên từ `enrollment` (một MSSV một tên — hai tên là dừng).
- **Gộp lớp** (spec §8.3, `--merge "NGUỒN=ĐÍCH"` theo `class.name`): chỉ khi cùng giảng viên và **mọi MSSV của lớp nguồn đã có ở lớp đích** (không thì gộp làm mất sinh viên → dừng); ghi lại **mọi** cột trỏ tới `class(id)` (tìm từ catalog `pg_constraint`, cộng `exam_session.class_id`, `session_roster.home_class_id`, `submission.home_class_id` nếu chúng tồn tại mà không là khoá ngoại), xoá enrollment trùng, xoá lớp nguồn, **báo số dòng từng bảng**; khoá ngoại `RESTRICT` là chốt cuối — còn một tham chiếu sót thì `DELETE` lớp nổ và cả transaction lùi lại.
- **Một transaction, hai khoá:** `pg_advisory_xact_lock` (hai lần chạy cùng lúc không đạp nhau) và `LOCK TABLE class, exam_session, enrollment IN SHARE ROW EXCLUSIVE MODE` (không có phiên mới chen vào giữa lúc đọc ảnh chụp và lúc ghi; đọc vẫn chạy). `--dry-run` làm hết rồi **rollback**.
- **`onlyClassIds` chỉ để test/diễn tập có phạm vi:** giới hạn ảnh chụp ở các lớp này (kèm phiên và enrollment của chúng) — DB e2e dùng chung nên không được chạm lớp của suite khác. Vận hành thật **không bao giờ** truyền nó.
- **Không bao giờ chạy nhầm đích:** CLI in `host/database` và **từ chối** nếu host không phải `localhost`/`127.0.0.1`/`::1` mà thiếu `--confirm-host <đúng host đó>` (`apps/api/.env` trỏ Supabase từ xa — memory `cine-migration-hits-supabase`). Mọi lệnh ghi dùng `DATABASE_URL` truyền rõ.
- **Điểm số không bị đụng** (T-GR-2): `snapshot` ghi số dòng mọi bảng và checksum `grading_result`, `score_computation`; `verify` so với bản chụp trước, mọi bảng phải đúng mức đổi **mong đợi** (mặc định 0; bảng không khai là không được đổi), checksum phải **giống hệt**.
- **Migration thu hẹp `1789700000000`:** dừng trước khi đổi gì nếu còn `class.semester_id`/`administrative_class_id` NULL, `exam_session.room_id` NULL hoặc enrollment không có hàng `student` (T-MIG-4); `down()` ném lỗi trỏ tới bản dump (như `ContractMasterData`) — **không đảo ngược được**. Migration chạy **TAY** (`migrationsTransactionMode: 'none'`, tự mở transaction), DB dùng chung, đọc `apps/api/.env`: luôn truyền `DATABASE_URL` rõ và kiểm host trước.
- **Thứ tự deploy thu hẹp (không có khoảng hỏng):** (1) deploy PR1, (2) chạy lại backfill, (3) deploy PR2 — code không còn đọc `class.name`/`enrollment.student_name` nên chạy được trên schema trước thu hẹp, (4) mới chạy migration thu hẹp. Chạy migration TRƯỚC khi deploy PR2 làm code PR1 (còn `COALESCE(…, e.student_name)`) hỏng ở từng câu truy vấn.
- **Test e2e không dọn dữ liệu chung** (plan C): tên/mã/MSSV dùng hậu tố ngẫu nhiên, năm học ≥ 2200 (`freshTestYear`). Dựng dữ liệu hình dạng CŨ **chỉ qua `test/helpers/seed.ts`** (guard `e2e-seed-hygiene` của plan A cấm SQL thô dựng `class`/`exam_session`/`enrollment` ở chỗ khác); cờ chuyển tiếp `legacyName` và `withoutRoom` bị gỡ ở Task 5 cùng các test của giai đoạn chuyển tiếp.
- `CLAUDE.md` **bị `.gitignore`** (chỉ có ở checkout chính, không vào PR): sửa rev 6 là việc làm tay ở Task 6, không có commit cho nó.

## Review Focus

1. **Backfill đoán thay vì dừng**: một lớp tên lạ bị gán mã tự chế, một chuỗi học kỳ lạ bị ép thành kỳ nào đó, hai tên của cùng một MSSV bị chọn một. → mỗi loại có một ca "dừng" trong test thuần (Task 1), và e2e khẳng định **DB nguyên vẹn** sau lần dừng (Task 2).
2. **Chạy lại làm hỏng hoặc nhân đôi**: phòng tạo hai lần, sinh viên bị ghi đè tên, học kỳ admin vừa sửa bị gán lại, lần gộp thứ hai nổ vì lớp nguồn đã mất. → ca "kế hoạch rỗng khi dữ liệu đã chuẩn", ca "không ghi đè", e2e chạy lần hai (Task 1, 2).
3. **Gộp lớp bỏ sót một bảng tham chiếu hoặc làm mất sinh viên**. → tìm cột từ catalog, kiểm "mọi MSSV nguồn đã ở đích", báo số dòng từng bảng; e2e dựng đủ phiên + danh sách dự thi + bài nộp + enrollment (Task 2).
4. **Chạy nhầm vào Supabase** khi định chạy vào bản sao (hoặc ngược lại). → `assertTargetConfirmed` có test, CLI in đích trước khi làm gì (Task 3).
5. **Điểm số bị đụng** mà không ai thấy. → `verify` so checksum và số dòng từng bảng; một bảng đổi ngoài mong đợi là lỗi (Task 3).
6. **Thu hẹp chạy khi còn dữ liệu cũ**, hoặc làm hỏng view `class_label` / code đang chạy. → tiền điều kiện dùng chung một hàm đếm (T-MIG-4), view dựng lại trong cùng transaction, e2e trạng thái đích, và thứ tự deploy trong runbook (Task 5, 6).
7. **Khoảng chờ**: phiên tạo bởi code cũ giữa lúc backfill lần một và lúc deploy bị bỏ sót, rồi migration thu hẹp chặn. → backfill chạy lại + tiền điều kiện chặn thay vì để lọt (Task 2, 5, 6).

---

## File Structure

| File | Việc |
|---|---|
| `apps/api/src/database/master-data/semester-name.ts` (+ `.spec.ts`) | **Mới.** `parseSemesterName`, `defaultSemesterDates`. |
| `apps/api/src/database/master-data/backfill.types.ts` | **Mới.** Kiểu ảnh chụp, tuỳ chọn, kế hoạch, vấn đề. |
| `apps/api/src/database/master-data/backfill.plan.ts` (+ `.spec.ts`) | **Mới.** `planBackfill`, `scopeSnapshot`, `isEmptyPlan` (thuần). |
| `apps/api/src/database/master-data/contract-preconditions.ts` (+ `.spec.ts`) | **Mới.** `contractProblems` (thuần) và `countContractBlockers` (đếm, dùng chung). |
| `apps/api/src/database/master-data/backfill.runner.ts` | **Mới.** `runBackfill`, `BackfillBlockedError`. |
| `apps/api/test/master-data-backfill.e2e-spec.ts` | **Mới.** T-MIG-2, T-MIG-3, dừng nguyên vẹn, dry-run, phạm vi. |
| `apps/api/test/helpers/seed.ts` | `seedClass` thêm cờ chuyển tiếp `legacyName`. |
| `apps/api/src/database/master-data/verify.ts` (+ `.spec.ts`) | **Mới.** Chụp, so, kiểm bất biến, chứng minh chống trùng phòng. |
| `apps/api/src/database/master-data/cli-args.ts` (+ `.spec.ts`) | **Mới.** Đọc đối số, chốt đích. |
| `apps/api/src/database/master-data/cli.ts`, `apps/api/package.json` | **Mới.** CLI `snapshot`/`backfill`/`verify`, script `master-data`. |
| `apps/api/src/database/migrations/1789700000000-ContractMasterDataEntities.ts` | **Mới.** Thu hẹp (PR2, Task 5). |
| `apps/api/test/master-data-contract.e2e-spec.ts` | **Mới.** Trạng thái đích sau thu hẹp (T-RW-1, T-RW-2 chạy lại ở đây). |
| entity/service/seed/test của giai đoạn chuyển tiếp | Gỡ cột cũ, `COALESCE` dự phòng, cờ `legacyName`/`withoutRoom` (Task 5). |
| `scripts/reset-dev-data.sql` | Viết lại cho schema mới (Task 4). |
| `docs/runbooks/master-data-cutover.md` | **Mới.** Diễn tập, cutover, nghiệm thu, đường lùi (Task 6). |
| `CLAUDE.md` (cục bộ, bị ignore) | Rev 6 (Task 6). |

---

### Task 1: Lõi thuần — đọc chuỗi học kỳ, lập kế hoạch backfill, tiền điều kiện thu hẹp

**Files:**
- Create: `apps/api/src/database/master-data/semester-name.ts`, `backfill.types.ts`, `backfill.plan.ts`, `contract-preconditions.ts`
- Test: `apps/api/src/database/master-data/semester-name.spec.ts`, `backfill.plan.spec.ts`, `contract-preconditions.spec.ts`

**Interfaces:**
- Consumes: `normalizeRoomName`, `roomNameProblem`, `normalizeAdministrativeCode`, `administrativeCodeProblem` (plan C `common/master-data-normalize.ts`); `semesterLabel` (plan C `common/semester-label.ts`).
- Produces:

```ts
// semester-name.ts
export interface ParsedSemester { year: number; term: 1 | 2 | 3 }
export function parseSemesterName(raw: string): ParsedSemester | null;
export function defaultSemesterDates(year: number, term: 1 | 2 | 3): { startDate: string; endDate: string };
// backfill.types.ts
export interface LegacyClass { id: string; teacherId: string; name: string | null; semesterId: string | null; administrativeClassId: string | null; groupName: string }
export interface LegacySession { id: string; classId: string; semesterName: string; roomName: string; roomId: string | null }
export interface LegacyEnrollment { homeClassId: string; studentMssv: string; studentName: string | null }
export interface LegacySnapshot { classes: LegacyClass[]; sessions: LegacySession[]; enrollments: LegacyEnrollment[]; semesters: Array<{ id: string; academicYearStart: number; term: number }>; rooms: Array<{ id: string; name: string }>; administrativeClasses: Array<{ id: string; code: string }>; students: Array<{ mssv: string }> }
export interface BackfillOptions { defaultSemester?: ParsedSemester; merges?: Array<{ from: string; into: string }>; inactiveRooms?: string[]; onlyClassIds?: string[] }
export type BackfillProblemCode = 'MERGE_CLASS_MISSING' | 'MERGE_CLASS_AMBIGUOUS' | 'MERGE_TEACHER_MISMATCH' | 'MERGE_STUDENT_NOT_IN_TARGET' | 'MERGE_CHAIN' | 'CLASS_SEMESTER_UNKNOWN' | 'CLASS_SEMESTER_CONFLICT' | 'CLASS_CODE_UNMAPPABLE' | 'CLASS_KEY_COLLISION' | 'ROOM_NAME_INVALID' | 'STUDENT_MSSV_INVALID' | 'STUDENT_NAME_BLANK' | 'STUDENT_NAME_CONFLICT';
export interface BackfillProblem { code: BackfillProblemCode; message: string }
export interface BackfillPlan { merges: Array<{ fromId: string; intoId: string; fromName: string; intoName: string }>; semesters: ParsedSemester[]; administrativeClasses: string[]; classAssignments: Array<{ classId: string; semester?: ParsedSemester; code?: string }>; rooms: Array<{ name: string; isActive: boolean }>; roomAssignments: Array<{ name: string; sessionIds: string[] }>; semesterNameRewrites: Array<{ sessionId: string; label: string }>; students: Array<{ mssv: string; fullName: string }> }
// backfill.plan.ts
export function scopeSnapshot(snapshot: LegacySnapshot, classIds: readonly string[] | undefined): LegacySnapshot;
export function planBackfill(snapshot: LegacySnapshot, options?: BackfillOptions): { plan: BackfillPlan; problems: BackfillProblem[] };
export function isEmptyPlan(plan: BackfillPlan): boolean;
// contract-preconditions.ts
export interface ContractCounts { classesWithoutSemester: number; classesWithoutAdministrativeClass: number; sessionsWithoutRoom: number; enrollmentsWithoutStudent: number }
export function contractProblems(counts: ContractCounts): string[];
export interface Queryable { query(sql: string, params?: unknown[]): Promise<any> }
export function countContractBlockers(db: Queryable, classIds?: readonly string[]): Promise<ContractCounts>;
```

- [ ] **Step 1: Viết test cho `parseSemesterName` và ngày tạm (đỏ)**

Create `apps/api/src/database/master-data/semester-name.spec.ts`:

```ts
import { defaultSemesterDates, parseSemesterName } from './semester-name';

describe('parseSemesterName', () => {
  it.each([
    ['HK1 2026-2027', { year: 2026, term: 1 }],
    ['Học kỳ 1 2026-2027', { year: 2026, term: 1 }],
    ['học kỳ 2 2025-2026', { year: 2025, term: 2 }],
    ['HK3 2026–2027', { year: 2026, term: 3 }], // gạch ngang dài
    ['  HK1   2026 - 2027 ', { year: 2026, term: 1 }], // khoảng trắng thừa
    ['hk1 2026-2027', { year: 2026, term: 1 }],
  ])('đọc "%s"', (text, expected) => {
    expect(parseSemesterName(text)).toEqual(expected);
  });

  it('đọc được chữ tiếng Việt viết ở dạng tổ hợp (NFD) như dạng dựng sẵn (NFC)', () => {
    expect(parseSemesterName('Học kỳ 1 2026-2027'.normalize('NFD'))).toEqual({ year: 2026, term: 1 });
  });

  it.each([
    'TEST dien tap', // chuỗi diễn tập: KHÔNG phải học kỳ, giữ nguyên để còn nhận ra
    'HK1 2026-2028', // năm sau không bằng năm + 1
    'HK4 2026-2027', // chỉ có kỳ 1–3
    'HK1 1999-2000', // ngoài khoảng 2000–2999 của DB
    'HK1 2026', // thiếu năm sau
    'Học kỳ một 2026-2027',
    '',
  ])('KHÔNG đọc "%s" — trả null, không đoán', (text) => {
    expect(parseSemesterName(text)).toBeNull();
  });
});

describe('defaultSemesterDates', () => {
  it('kỳ 1 của 2026 là 01/09/2026 → 31/01/2027 (số tạm của spec §8.2)', () => {
    expect(defaultSemesterDates(2026, 1)).toEqual({ startDate: '2026-09-01', endDate: '2027-01-31' });
  });

  it('ba kỳ của một năm và kỳ 1 năm sau nối nhau, không chồng ngày (ràng buộc EXCLUDE của DB)', () => {
    const order = [defaultSemesterDates(2026, 1), defaultSemesterDates(2026, 2), defaultSemesterDates(2026, 3), defaultSemesterDates(2027, 1)];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i].startDate > order[i - 1].endDate).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/api && pnpm test -- src/database/master-data/semester-name.spec.ts`
Expected: FAIL — không import được `./semester-name`.

- [ ] **Step 3: Viết `semester-name.ts`**

```ts
export interface ParsedSemester {
  year: number;
  term: 1 | 2 | 3;
}

/**
 * Dạng giảng viên từng gõ vào `exam_session.semester_name`: `HK1 2026-2027` và `Học kỳ 1 2026-2027` (hai cách viết cùng một kỳ — dữ liệu thật 04/10).
 * Chấp nhận thêm chữ hoa/thường, `kỳ`/`kì`, gạch ngang dài, khoảng trắng thừa, và chữ tiếng Việt ở dạng tổ hợp. KHÔNG chấp nhận thứ gì khác: backfill
 * dừng thay vì đoán (spec §8.2), nên một chuỗi không khớp phải đi ra là `null`, không phải một kỳ gần đúng.
 */
const SEMESTER_NAME = /^(?:hk|học k[ỳìi]|hoc k[yi])\s*([123])\s+(\d{4})\s*[-–]\s*(\d{4})$/iu;

export function parseSemesterName(raw: string): ParsedSemester | null {
  const match = SEMESTER_NAME.exec(raw.normalize('NFC').replace(/\s+/g, ' ').trim());
  if (!match) return null;
  const year = Number(match[2]);
  // Năm sau phải đúng bằng năm + 1: `2026-2028` là một lỗi gõ, không phải một kỳ. Khoảng 2000–2999 là ràng buộc `ck_semester_year` của DB.
  if (Number(match[3]) !== year + 1 || year < 2000 || year > 2999) return null;
  return { year, term: Number(match[1]) as 1 | 2 | 3 };
}

/**
 * Ngày TẠM của một học kỳ do backfill tạo (spec §8.2 "migration không có cách biết ngày thật; admin sửa trên giao diện sau"): kỳ 1 từ 01/09 tới
 * 31/01 năm sau, kỳ 2 từ 01/02 tới 31/05, kỳ 3 từ 01/06 tới 31/08. Ba kỳ và kỳ 1 của năm kế nối nhau không chồng ngày, nên `ex_semester_dates_overlap`
 * không bao giờ chặn việc tạo hàng loạt.
 */
export function defaultSemesterDates(year: number, term: 1 | 2 | 3): { startDate: string; endDate: string } {
  if (term === 1) return { startDate: `${year}-09-01`, endDate: `${year + 1}-01-31` };
  if (term === 2) return { startDate: `${year + 1}-02-01`, endDate: `${year + 1}-05-31` };
  return { startDate: `${year + 1}-06-01`, endDate: `${year + 1}-08-31` };
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/api && pnpm test -- src/database/master-data/semester-name.spec.ts`
Expected: PASS.

- [ ] **Step 5: Viết `backfill.types.ts`**

```ts
import type { ParsedSemester } from './semester-name';

/**
 * Ảnh chụp dữ liệu CŨ mà backfill cần — một lần đọc, rồi mọi quyết định là hàm thuần của nó (nên test được không cần DB, và "dừng thay vì đoán"
 * là một thuộc tính của `planBackfill`, không của SQL).
 */
export interface LegacyClass {
  id: string;
  teacherId: string;
  /** Cột cũ `class.name` (đã nới NULL ở migration mở rộng). `null` chỉ với lớp tạo bởi code mới — lớp đó đã có mã danh nghĩa. */
  name: string | null;
  semesterId: string | null;
  administrativeClassId: string | null;
  groupName: string;
}

export interface LegacySession {
  id: string;
  classId: string;
  /** Bản chụp học kỳ do giảng viên gõ. */
  semesterName: string;
  roomName: string;
  roomId: string | null;
}

export interface LegacyEnrollment {
  homeClassId: string;
  studentMssv: string;
  /** Cột cũ `enrollment.student_name` (đã nới NULL). */
  studentName: string | null;
}

export interface LegacySnapshot {
  classes: LegacyClass[];
  sessions: LegacySession[];
  enrollments: LegacyEnrollment[];
  semesters: Array<{ id: string; academicYearStart: number; term: number }>;
  rooms: Array<{ id: string; name: string }>;
  administrativeClasses: Array<{ id: string; code: string }>;
  students: Array<{ mssv: string }>;
}

export interface BackfillOptions {
  /** Học kỳ cho lớp KHÔNG có phiên nào để suy — một GIẢ ĐỊNH, cần admin xác nhận (spec §8.2). Không có mà cần tới thì dừng. */
  defaultSemester?: ParsedSemester;
  /** Lớp đặt theo tên môn cũ gộp vào lớp thật, theo `class.name` (spec §8.3). */
  merges?: Array<{ from: string; into: string }>;
  /** Tên các phòng do lần chạy này TẠO MỚI mà phải ngừng hoạt động (vd `TEST-KHONG-PHONG`). Không bao giờ đổi `is_active` của phòng đã có. */
  inactiveRooms?: string[];
  /** CHỈ cho test/diễn tập có phạm vi: giới hạn ảnh chụp ở các lớp này. Vận hành thật không bao giờ truyền. */
  onlyClassIds?: string[];
}

export type BackfillProblemCode =
  | 'MERGE_CLASS_MISSING'
  | 'MERGE_CLASS_AMBIGUOUS'
  | 'MERGE_TEACHER_MISMATCH'
  | 'MERGE_STUDENT_NOT_IN_TARGET'
  | 'MERGE_CHAIN'
  | 'CLASS_SEMESTER_UNKNOWN'
  | 'CLASS_SEMESTER_CONFLICT'
  | 'CLASS_CODE_UNMAPPABLE'
  | 'CLASS_KEY_COLLISION'
  | 'ROOM_NAME_INVALID'
  | 'STUDENT_MSSV_INVALID'
  | 'STUDENT_NAME_BLANK'
  | 'STUDENT_NAME_CONFLICT';

export interface BackfillProblem {
  code: BackfillProblemCode;
  message: string;
}

export interface BackfillPlan {
  merges: Array<{ fromId: string; intoId: string; fromName: string; intoName: string }>;
  /** Học kỳ cần có (chỉ những cái CHƯA tồn tại). */
  semesters: ParsedSemester[];
  /** Mã lớp danh nghĩa cần có (chỉ những mã CHƯA tồn tại). */
  administrativeClasses: string[];
  classAssignments: Array<{ classId: string; semester?: ParsedSemester; code?: string }>;
  /** Phòng cần tạo (chỉ những phòng CHƯA tồn tại, không phân biệt hoa-thường). */
  rooms: Array<{ name: string; isActive: boolean }>;
  /** Phiên nào gắn vào phòng nào — theo id phiên, nên không lan sang phiên ngoài phạm vi. */
  roomAssignments: Array<{ name: string; sessionIds: string[] }>;
  semesterNameRewrites: Array<{ sessionId: string; label: string }>;
  /** Sinh viên cần thêm (chỉ MSSV CHƯA có trong `student`; không bao giờ ghi đè tên đã lưu). */
  students: Array<{ mssv: string; fullName: string }>;
}
```

- [ ] **Step 6: Viết test cho `planBackfill` (đỏ)**

Create `apps/api/src/database/master-data/backfill.plan.spec.ts`:

```ts
import type { LegacyClass, LegacyEnrollment, LegacySession, LegacySnapshot } from './backfill.types';
import { isEmptyPlan, planBackfill, scopeSnapshot } from './backfill.plan';

let counter = 0;
const cls = (name: string | null, over: Partial<LegacyClass> = {}): LegacyClass => ({
  id: `c-${name ?? `x${++counter}`}`, teacherId: 't1', name, semesterId: null, administrativeClassId: null, groupName: '', ...over,
});
const ses = (classId: string, semesterName: string, roomName = 'Phòng máy A1', over: Partial<LegacySession> = {}): LegacySession => ({
  id: `s-${++counter}`, classId, semesterName, roomName, roomId: null, ...over,
});
const enr = (homeClassId: string, studentMssv: string, studentName: string | null = `Tên ${studentMssv}`): LegacyEnrollment => ({
  homeClassId, studentMssv, studentName,
});
const snap = (parts: Partial<LegacySnapshot>): LegacySnapshot => ({
  classes: [], sessions: [], enrollments: [], semesters: [], rooms: [], administrativeClasses: [], students: [], ...parts,
});
const codes = (result: { problems: { code: string }[] }) => result.problems.map((p) => p.code);

describe('planBackfill — dữ liệu thật thu nhỏ (spec §8.1–8.3)', () => {
  const atl = cls('DHKTPM18ATT');
  const ctt = cls('DHKTPM18CTT');
  const mongo = cls('Hệ Quản Trị Dữ Liệu MongoDB');
  const world = snap({
    classes: [atl, ctt, mongo],
    sessions: [
      ses(atl.id, 'HK1 2026-2027', 'Phòng máy A1'),
      ses(atl.id, 'Học kỳ 1 2026-2027', 'Phòng máy B1'),
      ses(mongo.id, 'Học kỳ 1 2026-2027', 'Phòng  H3.03'),
      ses(mongo.id, 'TEST dien tap', 'TEST-KHONG-PHONG'),
    ],
    enrollments: [
      ...['1001', '1002', '1003', '1004'].map((m) => enr(atl.id, m)),
      ...['1001', '1002'].map((m) => enr(mongo.id, m)), // đã ở lớp ATT
      ...['2001', '2002'].map((m) => enr(ctt.id, m)),
    ],
  });
  const options = {
    defaultSemester: { year: 2026, term: 1 as const },
    merges: [{ from: 'Hệ Quản Trị Dữ Liệu MongoDB', into: 'DHKTPM18ATT' }],
    inactiveRooms: ['TEST-KHONG-PHONG'],
  };

  it('không có vấn đề, và kế hoạch đúng như spec §8.2–8.3', () => {
    const { plan, problems } = planBackfill(world, options);
    expect(problems).toEqual([]);
    expect(plan.merges).toEqual([{ fromId: mongo.id, intoId: atl.id, fromName: 'Hệ Quản Trị Dữ Liệu MongoDB', intoName: 'DHKTPM18ATT' }]);
    expect(plan.semesters).toEqual([{ year: 2026, term: 1 }]); // hai cách viết gộp thành MỘT kỳ
    expect(plan.administrativeClasses).toEqual(['DHKTPM18ATT', 'DHKTPM18CTT']);
    // ATT suy kỳ từ phiên của nó; CTT không có phiên nào nên dùng kỳ mặc định; lớp MongoDB đã bị gộp nên không còn là lớp.
    expect(plan.classAssignments).toEqual([
      { classId: atl.id, semester: { year: 2026, term: 1 }, code: 'DHKTPM18ATT' },
      { classId: ctt.id, semester: { year: 2026, term: 1 }, code: 'DHKTPM18CTT' },
    ]);
  });

  it('phòng: tên chuẩn hoá (gộp khoảng trắng), mỗi phòng một lần, TEST-KHONG-PHONG tạo ra NGỪNG hoạt động', () => {
    const { plan } = planBackfill(world, options);
    expect(plan.rooms).toEqual([
      { name: 'Phòng H3.03', isActive: true },
      { name: 'Phòng máy A1', isActive: true },
      { name: 'Phòng máy B1', isActive: true },
      { name: 'TEST-KHONG-PHONG', isActive: false },
    ]);
    expect(plan.roomAssignments.map((r) => r.name)).toEqual(['Phòng H3.03', 'Phòng máy A1', 'Phòng máy B1', 'TEST-KHONG-PHONG']);
  });

  it('chuỗi học kỳ đọc được thì viết lại về dạng chuẩn; chuỗi TEST giữ nguyên; dạng chuẩn rồi thì không đụng', () => {
    const { plan } = planBackfill(world, options);
    const rewritten = plan.semesterNameRewrites.map((r) => r.label);
    expect(rewritten).toEqual(['HK1 2026-2027', 'HK1 2026-2027']); // hai phiên viết "Học kỳ 1 …"; "HK1 …" và "TEST …" không nằm đây
  });

  it('sinh viên: mỗi MSSV một lần (enrollment của lớp bị gộp là bản trùng, không đếm)', () => {
    const { plan } = planBackfill(world, options);
    expect(plan.students.map((s) => s.mssv)).toEqual(['1001', '1002', '1003', '1004', '2001', '2002']);
    expect(plan.students[0]).toEqual({ mssv: '1001', fullName: 'Tên 1001' });
  });
});

describe('planBackfill — T-MIG-1: dừng thay vì đoán', () => {
  it('lớp có phiên mà không chuỗi nào đọc được, và không có kỳ mặc định → CLASS_SEMESTER_UNKNOWN', () => {
    const a = cls('DHKTPM18ATT');
    expect(codes(planBackfill(snap({ classes: [a], sessions: [ses(a.id, 'TEST dien tap')] })))).toEqual(['CLASS_SEMESTER_UNKNOWN']);
  });

  it('lớp KHÔNG có phiên nào và không có kỳ mặc định → CLASS_SEMESTER_UNKNOWN (không tự lấy "kỳ hiện tại")', () => {
    expect(codes(planBackfill(snap({ classes: [cls('DHKTPM18CTT')] })))).toEqual(['CLASS_SEMESTER_UNKNOWN']);
  });

  it('một lớp có phiên ở hai kỳ → CLASS_SEMESTER_CONFLICT (một lớp chỉ thuộc một kỳ)', () => {
    const a = cls('DHKTPM18ATT');
    const result = planBackfill(snap({ classes: [a], sessions: [ses(a.id, 'HK1 2026-2027'), ses(a.id, 'HK2 2026-2027')] }));
    expect(codes(result)).toEqual(['CLASS_SEMESTER_CONFLICT']);
  });

  it('tên lớp không thành mã danh nghĩa và không có lệnh gộp → CLASS_CODE_UNMAPPABLE, nêu tên lớp', () => {
    const odd = cls('Hệ Quản Trị Dữ Liệu MongoDB');
    const result = planBackfill(snap({ classes: [odd], sessions: [ses(odd.id, 'HK1 2026-2027')] }));
    expect(codes(result)).toEqual(['CLASS_CODE_UNMAPPABLE']);
    expect(result.problems[0].message).toContain('Hệ Quản Trị Dữ Liệu MongoDB');
  });

  it('tên lớp viết thường được chuẩn hoá thành mã HOA (dhktpm18att → DHKTPM18ATT)', () => {
    const a = cls(' dhktpm18att ');
    const { plan, problems } = planBackfill(snap({ classes: [a], sessions: [ses(a.id, 'HK1 2026-2027')] }));
    expect(problems).toEqual([]);
    expect(plan.classAssignments[0].code).toBe('DHKTPM18ATT');
  });

  it('tên phòng rỗng hoặc quá 100 ký tự → ROOM_NAME_INVALID', () => {
    const a = cls('DHKTPM18ATT');
    const result = planBackfill(snap({ classes: [a], sessions: [ses(a.id, 'HK1 2026-2027', '   '), ses(a.id, 'HK1 2026-2027', 'P'.repeat(101))] }));
    expect(codes(result)).toEqual(['ROOM_NAME_INVALID', 'ROOM_NAME_INVALID']);
  });

  it('một MSSV có hai tên → STUDENT_NAME_CONFLICT; MSSV sai khuôn → STUDENT_MSSV_INVALID; tên trống → STUDENT_NAME_BLANK', () => {
    const a = cls('DHKTPM18ATT');
    const b = cls('DHKTPM18BTT');
    const result = planBackfill(
      snap({
        classes: [a, b],
        sessions: [ses(a.id, 'HK1 2026-2027'), ses(b.id, 'HK1 2026-2027')],
        enrollments: [enr(a.id, '1001', 'Nguyễn An'), enr(b.id, '1001', 'Nguyễn Anh'), enr(a.id, 'a-b', 'X'), enr(a.id, '1003', '  ')],
      }),
    );
    expect(codes(result).sort()).toEqual(['STUDENT_MSSV_INVALID', 'STUDENT_NAME_BLANK', 'STUDENT_NAME_CONFLICT']);
  });

  it('hai lớp trùng (kỳ, mã, nhóm) — cùng tên ở hai giảng viên — → CLASS_KEY_COLLISION', () => {
    const a = cls('DHKTPM18ATT', { id: 'c-1' });
    const b = cls('DHKTPM18ATT', { id: 'c-2', teacherId: 't2' });
    const result = planBackfill(snap({ classes: [a, b], sessions: [ses(a.id, 'HK1 2026-2027'), ses(b.id, 'HK1 2026-2027')] }));
    expect(codes(result)).toEqual(['CLASS_KEY_COLLISION']);
  });

  describe('gộp lớp', () => {
    const into = cls('DHKTPM18ATT');
    const from = cls('Lớp MongoDB');
    const base = { classes: [into, from], sessions: [ses(into.id, 'HK1 2026-2027')], enrollments: [enr(into.id, '1001'), enr(from.id, '1001')] };
    const merge = { merges: [{ from: 'Lớp MongoDB', into: 'DHKTPM18ATT' }] };

    it('lớp đích không tồn tại → MERGE_CLASS_MISSING', () => {
      expect(codes(planBackfill(snap(base), { merges: [{ from: 'Lớp MongoDB', into: 'KHONG-CO' }] }))).toContain('MERGE_CLASS_MISSING');
    });

    it('khác giảng viên → MERGE_TEACHER_MISMATCH', () => {
      const other = cls('Lớp MongoDB', { teacherId: 't2' });
      expect(codes(planBackfill(snap({ ...base, classes: [into, other] }), merge))).toContain('MERGE_TEACHER_MISMATCH');
    });

    it('lớp nguồn có sinh viên chưa ở lớp đích → MERGE_STUDENT_NOT_IN_TARGET (gộp sẽ làm mất họ)', () => {
      const result = planBackfill(snap({ ...base, enrollments: [enr(into.id, '1001'), enr(from.id, '1001'), enr(from.id, '9999')] }), merge);
      expect(codes(result)).toContain('MERGE_STUDENT_NOT_IN_TARGET');
      expect(result.problems.find((p) => p.code === 'MERGE_STUDENT_NOT_IN_TARGET')?.message).toContain('9999');
    });

    it('hai lớp cùng tên (hai giảng viên) làm tên không chỉ ra MỘT lớp → MERGE_CLASS_AMBIGUOUS', () => {
      const twin = cls('DHKTPM18ATT', { id: 'c-twin', teacherId: 't2' });
      expect(codes(planBackfill(snap({ ...base, classes: [into, from, twin] }), merge))).toContain('MERGE_CLASS_AMBIGUOUS');
    });

    it('chuỗi gộp A→B, B→C → MERGE_CHAIN (không hỗ trợ)', () => {
      const c = cls('LOP-C');
      // Lớp C có đủ sinh viên của B, để lệnh gộp thứ hai qua được kiểm tra sinh viên và chỉ còn lại vấn đề chuỗi.
      const result = planBackfill(snap({ ...base, classes: [into, from, c], enrollments: [...base.enrollments, enr(c.id, '1001')] }), {
        merges: [{ from: 'Lớp MongoDB', into: 'DHKTPM18ATT' }, { from: 'DHKTPM18ATT', into: 'LOP-C' }],
      });
      expect(codes(result)).toContain('MERGE_CHAIN');
    });

    it('Review Focus 2: lớp nguồn đã mất (đã gộp ở lần chạy trước) → bỏ qua lặng lẽ, không phải vấn đề', () => {
      const done = planBackfill(snap({ classes: [into], sessions: base.sessions, enrollments: [enr(into.id, '1001')] }), merge);
      expect(done.problems.filter((p) => p.code.startsWith('MERGE'))).toEqual([]);
      expect(done.plan.merges).toEqual([]);
    });
  });
});

describe('planBackfill — chạy lại và không ghi đè (Review Focus 2)', () => {
  const a = cls('DHKTPM18ATT');
  const post = snap({
    classes: [{ ...a, semesterId: 'sem-1', administrativeClassId: 'ac-1' }],
    sessions: [ses(a.id, 'HK1 2026-2027', 'Phòng máy A1', { roomId: 'room-1' })],
    enrollments: [enr(a.id, '1001')],
    semesters: [{ id: 'sem-1', academicYearStart: 2026, term: 1 }],
    rooms: [{ id: 'room-1', name: 'Phòng máy A1' }],
    administrativeClasses: [{ id: 'ac-1', code: 'DHKTPM18ATT' }],
    students: [{ mssv: '1001' }],
  });

  it('dữ liệu đã ở hình dạng đích → kế hoạch RỖNG', () => {
    const { plan, problems } = planBackfill(post);
    expect(problems).toEqual([]);
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it('lớp đã có học kỳ/mã (admin đã sửa) KHÔNG bị gán lại, dù tên lớp và chuỗi phiên nói điều khác', () => {
    const edited = snap({ ...post, classes: [{ ...post.classes[0], semesterId: 'sem-2' }], semesters: [{ id: 'sem-2', academicYearStart: 2027, term: 2 }, ...post.semesters] });
    const { plan } = planBackfill(edited);
    expect(plan.classAssignments).toEqual([]);
  });

  it('sinh viên đã có trong `student` không bị ghi đè tên, dù enrollment mang tên khác', () => {
    const { plan } = planBackfill(snap({ ...post, enrollments: [enr(a.id, '1001', 'TÊN KHÁC')] }));
    expect(plan.students).toEqual([]);
  });

  it('phòng đã có (khác hoa-thường) không tạo lại, nhưng phiên chưa có room_id vẫn được gắn', () => {
    const { plan } = planBackfill(snap({ ...post, sessions: [ses(a.id, 'HK1 2026-2027', 'PHÒNG MÁY A1')] }));
    expect(plan.rooms).toEqual([]);
    expect(plan.roomAssignments).toHaveLength(1);
  });

  it('một kế hoạch lập trên dữ liệu MỚI CHEN VÀO (phiên tạo bởi code cũ trong khoảng chờ) chỉ chứa phần mới', () => {
    const late = ses(a.id, 'HK1 2026-2027', 'Phòng mới trong lúc chờ');
    const { plan } = planBackfill(snap({ ...post, sessions: [...post.sessions, late] }));
    expect(plan.rooms).toEqual([{ name: 'Phòng mới trong lúc chờ', isActive: true }]);
    expect(plan.roomAssignments).toEqual([{ name: 'Phòng mới trong lúc chờ', sessionIds: [late.id] }]);
    expect(plan.classAssignments).toEqual([]);
  });
});

describe('scopeSnapshot (cho test/diễn tập có phạm vi)', () => {
  it('chỉ giữ lớp được liệt kê cùng phiên và enrollment của chúng', () => {
    const a = cls('AAAA1');
    const b = cls('BBBB1');
    const scoped = scopeSnapshot(
      snap({ classes: [a, b], sessions: [ses(a.id, 'x'), ses(b.id, 'x')], enrollments: [enr(a.id, '1001'), enr(b.id, '1002')] }),
      [a.id],
    );
    expect(scoped.classes.map((c) => c.id)).toEqual([a.id]);
    expect(scoped.sessions).toHaveLength(1);
    expect(scoped.enrollments).toHaveLength(1);
  });

  it('không có phạm vi → nguyên ảnh chụp', () => {
    const all = snap({ classes: [cls('AAAA1')] });
    expect(scopeSnapshot(all, undefined)).toBe(all);
  });
});
```

- [ ] **Step 7: Chạy để thấy đỏ**

Run: `cd apps/api && pnpm test -- src/database/master-data/backfill.plan.spec.ts`
Expected: FAIL — không import được `./backfill.plan`.

- [ ] **Step 8: Viết `backfill.plan.ts`**

```ts
import {
  administrativeCodeProblem,
  normalizeAdministrativeCode,
  normalizeRoomName,
  roomNameProblem,
} from '../../common/master-data-normalize';
import { semesterLabel } from '../../common/semester-label';
import type {
  BackfillOptions,
  BackfillPlan,
  BackfillProblem,
  BackfillProblemCode,
  LegacyClass,
  LegacySnapshot,
} from './backfill.types';
import { parseSemesterName, type ParsedSemester } from './semester-name';

/** Khớp `ck_student_mssv` ở DB. */
const MSSV_PATTERN = /^[A-Za-z0-9]{4,20}$/;
const lower = (text: string) => text.toLowerCase();
const semesterKey = (s: ParsedSemester) => `${s.year}:${s.term}`;
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Giới hạn ảnh chụp ở một tập lớp (kèm phiên và enrollment của chúng). Không có tập → trả nguyên ảnh chụp. */
export function scopeSnapshot(snapshot: LegacySnapshot, classIds: readonly string[] | undefined): LegacySnapshot {
  if (!classIds) return snapshot;
  const keep = new Set(classIds);
  return {
    ...snapshot,
    classes: snapshot.classes.filter((c) => keep.has(c.id)),
    sessions: snapshot.sessions.filter((s) => keep.has(s.classId)),
    enrollments: snapshot.enrollments.filter((e) => keep.has(e.homeClassId)),
  };
}

export function isEmptyPlan(plan: BackfillPlan): boolean {
  return (
    plan.merges.length === 0 &&
    plan.semesters.length === 0 &&
    plan.administrativeClasses.length === 0 &&
    plan.classAssignments.length === 0 &&
    plan.rooms.length === 0 &&
    plan.roomAssignments.length === 0 &&
    plan.semesterNameRewrites.length === 0 &&
    plan.students.length === 0
  );
}

/**
 * Lập kế hoạch đưa dữ liệu cũ sang hình dạng đích (spec §8.2–8.3). THUẦN: không DB, không đồng hồ — nên "dừng thay vì đoán" là thuộc tính của hàm
 * này và test được từng ca. Trả `problems` KHÔNG rỗng nghĩa là kế hoạch không được áp (runner ném `BackfillBlockedError`); `plan` khi đó chỉ để
 * chẩn đoán.
 *
 * Mọi thứ đã ở hình dạng đích thì không có mặt trong kế hoạch (lớp đã có kỳ/mã, sinh viên đã có, phòng đã có, phiên đã có phòng, chuỗi đã chuẩn) —
 * đó là cái làm backfill chạy lại không đổi gì và không bao giờ ghi đè thứ admin đã sửa.
 */
export function planBackfill(
  rawSnapshot: LegacySnapshot,
  options: BackfillOptions = {},
): { plan: BackfillPlan; problems: BackfillProblem[] } {
  const snap = scopeSnapshot(rawSnapshot, options.onlyClassIds);
  const problems: BackfillProblem[] = [];
  const problem = (code: BackfillProblemCode, message: string) => problems.push({ code, message });

  const classesByName = new Map<string, LegacyClass[]>();
  for (const c of snap.classes) {
    if (c.name === null) continue;
    classesByName.set(c.name, [...(classesByName.get(c.name) ?? []), c]);
  }
  const mssvOf = new Map<string, Set<string>>();
  for (const e of snap.enrollments) {
    const set = mssvOf.get(e.homeClassId) ?? new Set<string>();
    set.add(lower(e.studentMssv));
    mssvOf.set(e.homeClassId, set);
  }

  // ---------------------------------------------------------------- gộp lớp
  const merges: BackfillPlan['merges'] = [];
  const mergedInto = new Map<string, string>();
  for (const { from, into } of options.merges ?? []) {
    const intoCandidates = classesByName.get(into) ?? [];
    const fromCandidates = classesByName.get(from) ?? [];
    if (intoCandidates.length === 0) {
      problem('MERGE_CLASS_MISSING', `Lớp đích "${into}" không tồn tại — không gộp "${from}" vào đâu được.`);
      continue;
    }
    if (intoCandidates.length > 1 || fromCandidates.length > 1) {
      problem('MERGE_CLASS_AMBIGUOUS', `Tên "${from}" hoặc "${into}" trùng ở nhiều lớp (nhiều giảng viên) — không biết gộp lớp nào.`);
      continue;
    }
    // Lớp nguồn đã mất = đã gộp ở lần chạy trước: không phải vấn đề, và là điều làm lệnh gộp chạy lại được.
    if (fromCandidates.length === 0) continue;
    const [source] = fromCandidates;
    const [target] = intoCandidates;
    if (source.id === target.id) {
      problem('MERGE_CLASS_AMBIGUOUS', `Không gộp "${from}" vào chính nó.`);
      continue;
    }
    if (source.teacherId !== target.teacherId) {
      problem('MERGE_TEACHER_MISMATCH', `"${from}" và "${into}" thuộc hai giảng viên khác nhau — gộp sẽ đổi chủ của bài thi và danh sách.`);
      continue;
    }
    const inTarget = mssvOf.get(target.id) ?? new Set<string>();
    const missing = [...(mssvOf.get(source.id) ?? [])].filter((m) => !inTarget.has(m));
    if (missing.length > 0) {
      problem(
        'MERGE_STUDENT_NOT_IN_TARGET',
        `${missing.length} sinh viên của "${from}" chưa có ở "${into}" (${missing.slice(0, 5).join(', ')}) — gộp sẽ làm mất họ khỏi danh sách.`,
      );
      continue;
    }
    mergedInto.set(source.id, target.id);
    merges.push({ fromId: source.id, intoId: target.id, fromName: from, intoName: into });
  }
  for (const m of merges) {
    if (mergedInto.has(m.intoId)) problem('MERGE_CHAIN', `"${m.intoName}" vừa là đích vừa là nguồn của một lệnh gộp — không hỗ trợ gộp chuỗi.`);
  }
  const liveClassId = (classId: string) => mergedInto.get(classId) ?? classId;

  // ------------------------------------------------- học kỳ + mã của từng lớp
  const semesterById = new Map(snap.semesters.map((s) => [s.id, s]));
  const adminById = new Map(snap.administrativeClasses.map((a) => [a.id, a]));
  const sessionsOfClass = new Map<string, typeof snap.sessions>();
  for (const s of snap.sessions) {
    const id = liveClassId(s.classId);
    sessionsOfClass.set(id, [...(sessionsOfClass.get(id) ?? []), s]);
  }

  const classAssignments: BackfillPlan['classAssignments'] = [];
  const neededSemesters = new Map<string, ParsedSemester>();
  const neededCodes = new Set<string>();
  const keyOwners = new Map<string, string[]>();

  for (const c of [...snap.classes].sort((a, b) => byText(a.id, b.id))) {
    if (mergedInto.has(c.id)) continue;
    const label = c.name ?? c.id;

    let semester: ParsedSemester | undefined;
    if (c.semesterId === null) {
      const found = new Map<string, ParsedSemester>();
      for (const s of sessionsOfClass.get(c.id) ?? []) {
        const parsed = parseSemesterName(s.semesterName);
        if (parsed) found.set(semesterKey(parsed), parsed);
      }
      if (found.size > 1) {
        problem('CLASS_SEMESTER_CONFLICT', `Lớp "${label}" có phiên ở nhiều học kỳ (${[...found.keys()].sort().join(', ')}) — một lớp chỉ thuộc một kỳ; xử lý tay trước.`);
      } else if (found.size === 1) {
        [semester] = found.values();
      } else if (options.defaultSemester) {
        semester = options.defaultSemester;
      } else {
        problem('CLASS_SEMESTER_UNKNOWN', `Lớp "${label}" không có phiên nào đọc ra học kỳ — truyền --default-semester YYYY:T (một GIẢ ĐỊNH cần admin xác nhận) hoặc gán tay.`);
      }
    }

    let code: string | undefined;
    if (c.administrativeClassId === null) {
      const candidate = normalizeAdministrativeCode(c.name ?? '');
      const bad = c.name === null ? 'lớp không có tên' : administrativeCodeProblem(candidate);
      if (bad) {
        problem('CLASS_CODE_UNMAPPABLE', `Lớp "${label}" không đọc được thành mã lớp danh nghĩa (${bad}) — gộp vào lớp thật bằng --merge, hoặc đổi tên/gán tay.`);
      } else {
        code = candidate;
      }
    }

    if (semester || code) {
      classAssignments.push({ classId: c.id, ...(semester ? { semester } : {}), ...(code ? { code } : {}) });
      if (semester) neededSemesters.set(semesterKey(semester), semester);
      if (code) neededCodes.add(code);
    }

    // Khoá duy nhất `(kỳ, mã, nhóm)` — kiểm trước để báo bằng tên lớp thay vì một lỗi 23505 của DB giữa transaction.
    let effectiveSemesterKey: string | null = null;
    if (c.semesterId !== null) {
      const existing = semesterById.get(c.semesterId);
      if (existing) effectiveSemesterKey = `${existing.academicYearStart}:${existing.term}`;
    } else if (semester) {
      effectiveSemesterKey = semesterKey(semester);
    }
    const effectiveCode = c.administrativeClassId !== null ? adminById.get(c.administrativeClassId)?.code : code;
    if (effectiveSemesterKey && effectiveCode) {
      const key = `${effectiveSemesterKey}|${effectiveCode}|${c.groupName}`;
      keyOwners.set(key, [...(keyOwners.get(key) ?? []), label]);
    }
  }
  for (const [key, owners] of keyOwners) {
    if (owners.length > 1) {
      problem('CLASS_KEY_COLLISION', `${owners.length} lớp cùng (kỳ|mã|nhóm) = ${key} (${owners.join('; ')}) — gộp hoặc đặt nhóm khác trước.`);
    }
  }

  const existingSemesterKeys = new Set(snap.semesters.map((s) => `${s.academicYearStart}:${s.term}`));
  const semesters = [...neededSemesters.entries()]
    .filter(([key]) => !existingSemesterKeys.has(key))
    .map(([, value]) => value)
    .sort((a, b) => a.year - b.year || a.term - b.term);
  const existingCodes = new Set(snap.administrativeClasses.map((a) => lower(a.code)));
  const administrativeClasses = [...neededCodes].filter((code) => !existingCodes.has(lower(code))).sort(byText);

  // ---------------------------------------------------- viết lại chuỗi học kỳ
  const semesterNameRewrites: BackfillPlan['semesterNameRewrites'] = [];
  for (const s of snap.sessions) {
    const parsed = parseSemesterName(s.semesterName);
    if (!parsed) continue; // chuỗi không đọc được (TEST …) GIỮ NGUYÊN để còn nhận ra
    const label = semesterLabel(parsed.year, parsed.term);
    if (label !== s.semesterName) semesterNameRewrites.push({ sessionId: s.id, label });
  }
  semesterNameRewrites.sort((a, b) => byText(a.sessionId, b.sessionId));

  // -------------------------------------------------------------------- phòng
  const existingRooms = new Set(snap.rooms.map((r) => lower(r.name)));
  const inactive = new Set((options.inactiveRooms ?? []).map((name) => lower(normalizeRoomName(name))));
  const roomsToCreate = new Map<string, { name: string; isActive: boolean }>();
  const assignmentsByRoom = new Map<string, { name: string; sessionIds: string[] }>();
  for (const s of snap.sessions) {
    if (s.roomId !== null) continue;
    const name = normalizeRoomName(s.roomName);
    const bad = roomNameProblem(name);
    if (bad) {
      problem('ROOM_NAME_INVALID', `Phiên ${s.id}: phòng "${s.roomName}" không hợp lệ (${bad})`);
      continue;
    }
    const key = lower(name);
    if (!existingRooms.has(key) && !roomsToCreate.has(key)) roomsToCreate.set(key, { name, isActive: !inactive.has(key) });
    const entry = assignmentsByRoom.get(key) ?? { name, sessionIds: [] };
    entry.sessionIds.push(s.id);
    assignmentsByRoom.set(key, entry);
  }
  const rooms = [...roomsToCreate.values()].sort((a, b) => byText(a.name, b.name));
  const roomAssignments = [...assignmentsByRoom.values()]
    .map((entry) => ({ name: entry.name, sessionIds: [...entry.sessionIds].sort(byText) }))
    .sort((a, b) => byText(a.name, b.name));

  // ---------------------------------------------------------------- sinh viên
  const existingStudents = new Set(snap.students.map((s) => lower(s.mssv)));
  const candidates = new Map<string, { mssv: string; names: Set<string> }>();
  for (const e of snap.enrollments) {
    if (mergedInto.has(e.homeClassId)) continue; // enrollment của lớp bị gộp là bản trùng của lớp đích
    const key = lower(e.studentMssv);
    const entry = candidates.get(key) ?? { mssv: e.studentMssv, names: new Set<string>() };
    const name = (e.studentName ?? '').normalize('NFC').trim();
    if (name !== '') entry.names.add(name);
    candidates.set(key, entry);
  }
  const students: BackfillPlan['students'] = [];
  for (const [key, { mssv, names }] of [...candidates].sort(([a], [b]) => byText(a, b))) {
    if (existingStudents.has(key)) continue; // không bao giờ ghi đè tên đã lưu
    if (!MSSV_PATTERN.test(mssv)) {
      problem('STUDENT_MSSV_INVALID', `MSSV "${mssv}" không đúng khuôn (4–20 chữ/số) — sửa trong enrollment trước.`);
    } else if (names.size === 0) {
      problem('STUDENT_NAME_BLANK', `MSSV ${mssv} không có tên ở enrollment nào — không có gì để ghi vào \`student\`.`);
    } else if (names.size > 1) {
      problem('STUDENT_NAME_CONFLICT', `MSSV ${mssv} có ${names.size} tên khác nhau (${[...names].join(' | ')}) — chọn một tên trước.`);
    } else {
      students.push({ mssv, fullName: [...names][0] });
    }
  }

  return {
    plan: {
      merges,
      semesters,
      administrativeClasses,
      classAssignments,
      rooms,
      roomAssignments,
      semesterNameRewrites,
      students,
    },
    problems,
  };
}
```

- [ ] **Step 9: Chạy để thấy xanh**

Run: `cd apps/api && pnpm test -- src/database/master-data/backfill.plan.spec.ts`
Expected: PASS. Ca dễ trượt: "phòng: …" đòi `rooms` sắp theo tên bằng so sánh code-unit (`'Phòng H3.03' < 'Phòng máy A1'` vì `'H' < 'm'`); nếu máy chạy dùng locale khác thì dùng `byText` như trên, **không** `localeCompare`. Ca "hai lớp trùng (kỳ, mã, nhóm)" đòi hai lớp có `id` khác nhau — `cls()` dùng `id: c-<tên>` nên test truyền `id` rõ.

- [ ] **Step 10: Viết test và code cho tiền điều kiện thu hẹp (T-MIG-4)**

Create `apps/api/src/database/master-data/contract-preconditions.spec.ts`:

```ts
import { contractProblems, countContractBlockers, type Queryable } from './contract-preconditions';

const clean = { classesWithoutSemester: 0, classesWithoutAdministrativeClass: 0, sessionsWithoutRoom: 0, enrollmentsWithoutStudent: 0 };

describe('contractProblems — T-MIG-4: migration thu hẹp dừng khi còn dữ liệu cũ', () => {
  it('sạch → không có vấn đề', () => {
    expect(contractProblems(clean)).toEqual([]);
  });

  it.each([
    ['classesWithoutSemester', /3 lớp.*học kỳ/],
    ['classesWithoutAdministrativeClass', /3 lớp.*lớp danh nghĩa/],
    ['sessionsWithoutRoom', /3 phiên.*phòng/],
    ['enrollmentsWithoutStudent', /3.*enrollment.*sinh viên/],
  ])('%s > 0 → một câu nêu số lượng và việc phải làm (chạy lại backfill)', (field, pattern) => {
    const problems = contractProblems({ ...clean, [field]: 3 });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(pattern);
    expect(problems[0]).toMatch(/backfill/);
  });

  it('nhiều thứ cùng dở → mỗi thứ một câu', () => {
    expect(contractProblems({ ...clean, classesWithoutSemester: 1, sessionsWithoutRoom: 2 })).toHaveLength(2);
  });
});

describe('countContractBlockers', () => {
  it('truyền phạm vi lớp vào câu truy vấn; không phạm vi thì truyền null', async () => {
    const calls: unknown[][] = [];
    const db: Queryable = {
      query: async (_sql, params) => {
        calls.push(params ?? []);
        return [{ classesWithoutSemester: 1, classesWithoutAdministrativeClass: 0, sessionsWithoutRoom: 2, enrollmentsWithoutStudent: 0 }];
      },
    };
    expect(await countContractBlockers(db, ['c1'])).toEqual({ classesWithoutSemester: 1, classesWithoutAdministrativeClass: 0, sessionsWithoutRoom: 2, enrollmentsWithoutStudent: 0 });
    await countContractBlockers(db);
    expect(calls).toEqual([[['c1']], [null]]);
  });
});
```

Create `apps/api/src/database/master-data/contract-preconditions.ts`:

```ts
/** Chỉ cần `query` — cả `DataSource`, `QueryRunner` lẫn một đối tượng giả trong test đều thoả. */
export interface Queryable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(sql: string, params?: unknown[]): Promise<any>;
}

export interface ContractCounts {
  classesWithoutSemester: number;
  classesWithoutAdministrativeClass: number;
  sessionsWithoutRoom: number;
  enrollmentsWithoutStudent: number;
}

/**
 * Bốn con số quyết định migration thu hẹp có chạy được không — và cũng là phần "còn thiếu" mà backfill báo cuối lần chạy. MỘT câu truy vấn dùng chung cho
 * backfill, `verify` và migration, để "backfill xong" và "thu hẹp được phép" không bao giờ nói hai điều khác nhau. `classIds` giới hạn phạm vi (test/diễn tập
 * có phạm vi); không truyền thì đếm toàn bộ.
 */
export async function countContractBlockers(db: Queryable, classIds?: readonly string[]): Promise<ContractCounts> {
  const scope = classIds ? [...classIds] : null;
  const [row] = await db.query(
    `SELECT
       (SELECT count(*)::int FROM examcollect.class c
         WHERE c.semester_id IS NULL AND ($1::uuid[] IS NULL OR c.id = ANY($1::uuid[]))) AS "classesWithoutSemester",
       (SELECT count(*)::int FROM examcollect.class c
         WHERE c.administrative_class_id IS NULL AND ($1::uuid[] IS NULL OR c.id = ANY($1::uuid[]))) AS "classesWithoutAdministrativeClass",
       (SELECT count(*)::int FROM examcollect.exam_session es
         WHERE es.room_id IS NULL AND ($1::uuid[] IS NULL OR es.class_id = ANY($1::uuid[]))) AS "sessionsWithoutRoom",
       (SELECT count(*)::int FROM examcollect.enrollment e
         WHERE NOT EXISTS (SELECT 1 FROM examcollect.student s WHERE s.mssv = e.student_mssv)
           AND ($1::uuid[] IS NULL OR e.home_class_id = ANY($1::uuid[]))) AS "enrollmentsWithoutStudent"`,
    [scope],
  );
  return row as ContractCounts;
}

/** Câu báo cho từng thứ còn dở; rỗng = được phép thu hẹp. Thu hẹp DỪNG ở đây, không đoán và không "tạm gán". */
export function contractProblems(counts: ContractCounts): string[] {
  const out: string[] = [];
  if (counts.classesWithoutSemester > 0) out.push(`Còn ${counts.classesWithoutSemester} lớp chưa có học kỳ — chạy lại backfill (hoặc gán tay) trước.`);
  if (counts.classesWithoutAdministrativeClass > 0) {
    out.push(`Còn ${counts.classesWithoutAdministrativeClass} lớp chưa có lớp danh nghĩa — chạy lại backfill (hoặc gán tay) trước.`);
  }
  if (counts.sessionsWithoutRoom > 0) out.push(`Còn ${counts.sessionsWithoutRoom} phiên thi chưa gắn phòng trong danh mục — chạy lại backfill trước.`);
  if (counts.enrollmentsWithoutStudent > 0) {
    out.push(`Còn ${counts.enrollmentsWithoutStudent} enrollment chưa có hàng sinh viên tương ứng — chạy lại backfill trước.`);
  }
  return out;
}
```

- [ ] **Step 11: Chạy để thấy xanh**

Run: `cd apps/api && pnpm test -- src/database/master-data`
Expected: PASS cả ba spec.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/database/master-data
git commit -m "feat(api): lõi thuần của backfill master data (đọc chuỗi học kỳ, lập kế hoạch dừng-thay-vì-đoán) và tiền điều kiện migration thu hẹp"
```

---

### Task 2: `runBackfill` — áp kế hoạch trong một transaction

**Files:**
- Create: `apps/api/src/database/master-data/backfill.runner.ts`
- Modify: `apps/api/test/helpers/seed.ts` (cờ chuyển tiếp `legacyName` cho `seedClass`)
- Test: `apps/api/test/master-data-backfill.e2e-spec.ts`

**Interfaces:**
- Consumes: `planBackfill`, `LegacySnapshot`, `BackfillOptions`, `BackfillProblem` (Task 1); `countContractBlockers`, `ContractCounts` (Task 1); `defaultSemesterDates`; từ plan A/C/D: `seedClass`, `seedEnrollment({ legacyName })`, `seedExamSession({ withoutRoom })` (`test/helpers/seed.ts`), `seedTeacher` (`test/helpers/grading-seed.ts`), `randomTag`, `freshTestYear` (`test/helpers/master-data.ts`).
- Produces:

```ts
export class BackfillBlockedError extends Error { readonly problems: BackfillProblem[] }
export interface BackfillReport {
  dryRun: boolean;
  created: { semesters: number; administrativeClasses: number; rooms: number; students: number };
  merged: Array<{ from: string; into: string; moved: Record<string, number>; enrollmentsRemoved: number }>;
  assigned: { classSemester: number; classAdministrativeClass: number; sessionRoom: number; sessionSemesterName: number };
  remaining: ContractCounts;
  complete: boolean;   // remaining toàn 0
}
export function runBackfill(ds: DataSource, options?: BackfillOptions, run?: { dryRun?: boolean }): Promise<BackfillReport>;
```

- [ ] **Step 1: Thêm cờ chuyển tiếp `legacyName` vào `seedClass`**

Trong `apps/api/test/helpers/seed.ts` (đang ở dạng cuối của plan D3):

1. Trong `SeedClassOptions` thêm:

```ts
  /**
   * CHỈ cho test về GIAI ĐOẠN CHUYỂN TIẾP (backfill): ghi cột cũ `class.name` như code trước khi có lớp danh nghĩa. Dùng cùng `semesterId: null`
   * và `administrativeClassId: null` để dựng một lớp ở HÌNH DẠNG CŨ. Bị gỡ ở migration thu hẹp (plan H Task 5) cùng cột `class.name`.
   */
  legacyName?: string;
```

2. Trong `seedClass`, đổi câu `INSERT` thành:

```ts
  const [row] = await db.query(
    `INSERT INTO examcollect.class
       (course_name, teacher_id, semester_id, administrative_class_id, group_name, name)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [o.courseName ?? COURSE_NAME, o.teacherId, semesterId, administrativeClassId, groupName, o.legacyName ?? null],
  );
```

và xoá dòng chú thích `// KHÔNG ghi \`class.name\` …` ngay trên nó (nay là có điều kiện).

- [ ] **Step 2: Viết e2e (đỏ)**

Create `apps/api/test/master-data-backfill.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { BackfillBlockedError, runBackfill } from '../src/database/master-data/backfill.runner';
import { seedTeacher } from './helpers/grading-seed';
import { freshTestYear, randomTag } from './helpers/master-data';
import { seedClass, seedEnrollment, seedExamSession } from './helpers/seed';

/**
 * Backfill trên dữ liệu ở HÌNH DẠNG CŨ (T-MIG-2, T-MIG-3 thu nhỏ). DB e2e dùng chung và không bao giờ được dọn, nên MỌI lần gọi đều có
 * `onlyClassIds` — backfill thật không có phạm vi, nhưng ở đây nó không được chạm lớp của suite khác.
 */
describe('master data backfill (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const tag = randomTag(8);
  let year: number;
  let teacherId: string;
  const S = (i: number) => `BF${tag}${i}`; // MSSV: 2 + 8 + 1 = 11 ký tự

  const ids: Record<string, string> = {};
  const sessionIds: Record<string, string> = {};
  let options: Parameters<typeof runBackfill>[1];
  // Lớp/phiên CỐ Ý ở hình dạng cũ mà backfill không được xử lý (ngoài phạm vi, hoặc dừng) — phải dọn khi xong: một lớp còn `semester_id` NULL trong DB
  // e2e sẽ làm migration thu hẹp (Task 5) dừng ở tiền điều kiện khi áp nó lên DB test.
  const leftover = { sessions: [] as string[], classes: [] as string[] };

  async function count(sql: string, params: unknown[]): Promise<number> {
    const [row] = await ds.query(sql, params);
    return Number(row.n);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);

    year = await freshTestYear(ds);
    teacherId = await seedTeacher(ds, `bf-${tag}`);

    // Ba lớp ở HÌNH DẠNG CŨ: có `name`, chưa có học kỳ, chưa có lớp danh nghĩa.
    const legacy = { teacherId, semesterId: null, administrativeClassId: null } as const;
    ids.A = (await seedClass(ds, { ...legacy, legacyName: `BF${tag}A` })).id;
    ids.M = (await seedClass(ds, { ...legacy, legacyName: `Hệ Quản Trị ${tag}` })).id; // lớp đặt theo tên môn — sẽ gộp vào A
    ids.N = (await seedClass(ds, { ...legacy, legacyName: `BF${tag}N` })).id; // không có phiên nào
    ids.V = (await seedClass(ds, { ...legacy, legacyName: `ZZ${tag}` })).id; // NGOÀI phạm vi: backfill không được chạm
    leftover.classes.push(ids.V);

    const enroll = (classId: string, i: number) =>
      seedEnrollment(ds, { classId, teacherId, mssv: S(i), legacyName: `Sinh viên ${S(i)}` });
    for (const i of [1, 2, 3]) await enroll(ids.A, i);
    for (const i of [2, 3]) await enroll(ids.M, i); // đã ở lớp A: bản trùng
    await enroll(ids.N, 4);

    const at = (day: number, hour: number) => new Date(2026, 8, day, hour);
    const session = (key: string, classId: string, over: { semesterName: string; roomName: string; day: number }) =>
      seedExamSession(ds, {
        classId, teacherId, status: 'completed', startTime: at(over.day, 8), endTime: at(over.day, 10),
        semesterName: over.semesterName, roomName: over.roomName, withoutRoom: true,
      }).then((s) => { sessionIds[key] = s.id; });
    await session('a1', ids.A, { semesterName: `HK1 ${year}-${year + 1}`, roomName: `Phòng ${tag} A1`, day: 1 });
    await session('a2', ids.A, { semesterName: `Học kỳ 1 ${year}-${year + 1}`, roomName: `Phòng  ${tag}  B1`, day: 2 }); // hai khoảng trắng
    await session('m1', ids.M, { semesterName: `Học kỳ 1 ${year}-${year + 1}`, roomName: `Phòng ${tag} A1`, day: 3 });
    await session('m2', ids.M, { semesterName: `TEST dien tap ${tag}`, roomName: `TEST-${tag}`, day: 4 });

    // Danh sách dự thi và bài nộp của các phiên lớp M — những thứ gộp lớp phải ghi lại (spec §8.3: 45 + 45 thu nhỏ thành 2 + 2).
    for (const i of [2, 3]) {
      await ds.query(
        `INSERT INTO examcollect.session_roster (exam_session_id, student_mssv, student_name, home_class_id, home_teacher_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [sessionIds.m1, S(i), `Sinh viên ${S(i)}`, ids.M, teacherId],
      );
    }
    const [deliverable] = await ds.query(
      `INSERT INTO examcollect.required_deliverable (exam_session_id, required_filename, deliverable_type)
       VALUES ($1, 'Cau1.docx', 'document') RETURNING id`,
      [sessionIds.m1],
    );
    for (const i of [2, 3]) {
      await ds.query(
        `INSERT INTO examcollect.submission
           (exam_session_id, required_deliverable_id, student_mssv, student_name_input, home_class_id, home_teacher_id,
            storage_key, checksum, file_size, submitted_via, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, 'normal', 'received')`,
        [sessionIds.m1, deliverable.id, S(i), S(i), ids.M, teacherId, `k/${S(i)}`, 'a'.repeat(64)],
      );
    }

    options = {
      defaultSemester: { year, term: 1 },
      merges: [{ from: `Hệ Quản Trị ${tag}`, into: `BF${tag}A` }],
      inactiveRooms: [`TEST-${tag}`],
      onlyClassIds: [ids.A, ids.M, ids.N],
    };
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM examcollect.exam_session WHERE id = ANY($1::uuid[])`, [leftover.sessions]);
    await ds.query(`DELETE FROM examcollect.class WHERE id = ANY($1::uuid[])`, [leftover.classes]);
    await app.close();
  });

  it('--dry-run làm hết rồi LÙI LẠI: báo cáo đầy đủ, DB nguyên vẹn', async () => {
    const report = await runBackfill(ds, options, { dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.created.semesters).toBe(1);
    expect(report.merged).toHaveLength(1);
    expect(await count(`SELECT count(*) AS n FROM examcollect.class WHERE id = $1`, [ids.M])).toBe(1); // lớp M còn đó
    expect(await count(`SELECT count(*) AS n FROM examcollect.class WHERE id = $1 AND semester_id IS NULL`, [ids.A])).toBe(1);
    expect(await count(`SELECT count(*) AS n FROM examcollect.exam_session WHERE id = $1 AND room_id IS NULL`, [sessionIds.a1])).toBe(1);
  });

  it('T-MIG-3: gộp lớp ghi lại MỌI tham chiếu, xoá enrollment trùng, xoá lớp nguồn — và báo số dòng từng bảng', async () => {
    const report = await runBackfill(ds, options);

    expect(report.merged).toHaveLength(1);
    expect(report.merged[0]).toMatchObject({
      from: `Hệ Quản Trị ${tag}`,
      into: `BF${tag}A`,
      enrollmentsRemoved: 2,
      moved: { 'exam_session.class_id': 2, 'session_roster.home_class_id': 2, 'submission.home_class_id': 2 },
    });
    expect(await count(`SELECT count(*) AS n FROM examcollect.class WHERE id = $1`, [ids.M])).toBe(0);
    expect(await count(`SELECT count(*) AS n FROM examcollect.exam_session WHERE class_id = $1`, [ids.A])).toBe(4);
    expect(await count(`SELECT count(*) AS n FROM examcollect.session_roster WHERE home_class_id = $1`, [ids.A])).toBe(2);
    expect(await count(`SELECT count(*) AS n FROM examcollect.submission WHERE home_class_id = $1`, [ids.A])).toBe(2);
    expect(await count(`SELECT count(*) AS n FROM examcollect.enrollment WHERE home_class_id = $1`, [ids.A])).toBe(3); // S1..S3, không mất ai
  });

  it('ánh xạ đúng spec §8.2: học kỳ, mã danh nghĩa, phòng, chuỗi học kỳ, sinh viên', async () => {
    const [semester] = await ds.query(
      `SELECT start_date::text AS s, end_date::text AS e FROM examcollect.semester WHERE academic_year_start = $1 AND term = 1`,
      [year],
    );
    expect(semester).toEqual({ s: `${year}-09-01`, e: `${year + 1}-01-31` }); // ngày TẠM

    const classes = await ds.query(
      `SELECT c.id, ac.code::text AS code, sem.academic_year_start AS year
         FROM examcollect.class c
         JOIN examcollect.administrative_class ac ON ac.id = c.administrative_class_id
         JOIN examcollect.semester sem ON sem.id = c.semester_id
        WHERE c.id = ANY($1)`,
      [[ids.A, ids.N]],
    );
    expect(Object.fromEntries(classes.map((c: { id: string; code: string }) => [c.id, c.code]))).toEqual({
      [ids.A]: `BF${tag}A`,
      [ids.N]: `BF${tag}N`,
    });
    expect(classes.every((c: { year: number }) => c.year === year)).toBe(true); // N dùng kỳ mặc định

    const rooms = await ds.query(
      `SELECT r.name::text AS name, r.is_active AS active
         FROM examcollect.exam_session es JOIN examcollect.room r ON r.id = es.room_id
        WHERE es.id = ANY($1) ORDER BY es.id`,
      [Object.values(sessionIds)],
    );
    const byName = new Map<string, boolean>(rooms.map((r: { name: string; active: boolean }) => [r.name, r.active]));
    expect(byName.get(`Phòng ${tag} A1`)).toBe(true);
    expect(byName.get(`Phòng ${tag} B1`)).toBe(true); // hai khoảng trắng đã gộp
    expect(byName.get(`TEST-${tag}`)).toBe(false); // tạo ra NGỪNG hoạt động
    expect(rooms).toHaveLength(4); // m1 và a1 dùng chung một phòng, nhưng mỗi phiên một dòng

    const names = await ds.query(`SELECT id, semester_name FROM examcollect.exam_session WHERE id = ANY($1)`, [Object.values(sessionIds)]);
    const nameOf = Object.fromEntries(names.map((r: { id: string; semester_name: string }) => [r.id, r.semester_name]));
    expect(nameOf[sessionIds.a1]).toBe(`HK1 ${year}-${year + 1}`);
    expect(nameOf[sessionIds.a2]).toBe(`HK1 ${year}-${year + 1}`); // "Học kỳ 1 …" đã viết lại
    expect(nameOf[sessionIds.m2]).toBe(`TEST dien tap ${tag}`); // chuỗi TEST giữ nguyên

    const students = await ds.query(`SELECT mssv::text AS mssv, full_name FROM examcollect.student WHERE mssv::text = ANY($1) ORDER BY mssv`, [[1, 2, 3, 4].map(S)]);
    expect(students).toEqual([1, 2, 3, 4].map((i) => ({ mssv: S(i), full_name: `Sinh viên ${S(i)}` })));
  });

  it('Review Focus 2: phạm vi — lớp ngoài `onlyClassIds` không bị chạm', async () => {
    expect(await count(`SELECT count(*) AS n FROM examcollect.class WHERE id = $1 AND semester_id IS NULL AND administrative_class_id IS NULL`, [ids.V])).toBe(1);
  });

  it('T-MIG-2: chạy lại KHÔNG đổi gì (kể cả khi lệnh gộp vẫn còn trong tham số) và báo hoàn tất', async () => {
    const report = await runBackfill(ds, options);
    expect(report.created).toEqual({ semesters: 0, administrativeClasses: 0, rooms: 0, students: 0 });
    expect(report.merged).toEqual([]);
    expect(report.assigned).toEqual({ classSemester: 0, classAdministrativeClass: 0, sessionRoom: 0, sessionSemesterName: 0 });
    expect(report.remaining).toEqual({ classesWithoutSemester: 0, classesWithoutAdministrativeClass: 0, sessionsWithoutRoom: 0, enrollmentsWithoutStudent: 0 });
    expect(report.complete).toBe(true);
  });

  it('Review Focus 1: dữ liệu không ánh xạ được → DỪNG với danh sách vấn đề, và DB nguyên vẹn', async () => {
    const odd = (await seedClass(ds, { teacherId, semesterId: null, administrativeClassId: null, legacyName: `Không hợp lệ ${tag}` })).id;
    const stray = await seedExamSession(ds, {
      classId: odd, teacherId, status: 'completed', startTime: new Date(2026, 8, 10, 8), endTime: new Date(2026, 8, 10, 10), withoutRoom: true,
    });

    leftover.classes.push(odd);
    leftover.sessions.push(stray.id);

    const failure = await runBackfill(ds, { onlyClassIds: [odd] }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(BackfillBlockedError);
    const codes = (failure as BackfillBlockedError).problems.map((p) => p.code).sort();
    expect(codes).toEqual(['CLASS_CODE_UNMAPPABLE', 'CLASS_SEMESTER_UNKNOWN']);
    expect(await count(`SELECT count(*) AS n FROM examcollect.class WHERE id = $1 AND semester_id IS NULL`, [odd])).toBe(1);
    expect(await count(`SELECT count(*) AS n FROM examcollect.exam_session WHERE id = $1 AND room_id IS NULL`, [stray.id])).toBe(1);
  });
});
```

- [ ] **Step 3: Chạy để thấy đỏ**

Run: `cd apps/api && pnpm test:e2e -- --runInBand master-data-backfill`
(Docker `cine-*` phải chạy và `.env.test` trỏ local — plan A; migration mở rộng `1789600000000` đã áp.)
Expected: FAIL — không import được `backfill.runner`.

- [ ] **Step 4: Viết `backfill.runner.ts`**

```ts
import { DataSource, QueryRunner } from 'typeorm';
import { planBackfill } from './backfill.plan';
import type { BackfillOptions, BackfillPlan, BackfillProblem, LegacySnapshot } from './backfill.types';
import { countContractBlockers, type ContractCounts } from './contract-preconditions';
import { defaultSemesterDates } from './semester-name';

export class BackfillBlockedError extends Error {
  constructor(readonly problems: BackfillProblem[]) {
    super(
      `Backfill DỪNG: ${problems.length} điều không ánh xạ được, KHÔNG đoán và KHÔNG ghi gì.\n` +
        problems.map((p) => `  - [${p.code}] ${p.message}`).join('\n'),
    );
    this.name = 'BackfillBlockedError';
  }
}

export interface BackfillReport {
  dryRun: boolean;
  created: { semesters: number; administrativeClasses: number; rooms: number; students: number };
  merged: Array<{ from: string; into: string; moved: Record<string, number>; enrollmentsRemoved: number }>;
  assigned: { classSemester: number; classAdministrativeClass: number; sessionRoom: number; sessionSemesterName: number };
  remaining: ContractCounts;
  /** `remaining` toàn 0: migration thu hẹp được phép chạy. */
  complete: boolean;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
/** Tên bảng/cột đến từ catalog Postgres, không phải từ người dùng — vẫn kiểm trước khi nối vào câu lệnh. */
function ident(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`Tên định danh lạ: "${name}"`);
  return `"${name}"`;
}

/** Số dòng bị ảnh hưởng: `affected` cho UPDATE/DELETE, số dòng RETURNING cho INSERT (kết quả có cấu trúc của TypeORM). */
async function affected(qr: QueryRunner, sql: string, params: unknown[] = []): Promise<number> {
  const result = await qr.query(sql, params, true);
  return result.affected ?? result.records.length;
}

async function readSnapshot(qr: QueryRunner): Promise<LegacySnapshot> {
  const [classes, sessions, enrollments, semesters, rooms, administrativeClasses, students] = await Promise.all(
    [
      `SELECT id, teacher_id AS "teacherId", name, semester_id AS "semesterId",
              administrative_class_id AS "administrativeClassId", group_name AS "groupName"
         FROM examcollect.class`,
      `SELECT id, class_id AS "classId", semester_name AS "semesterName", room_name AS "roomName", room_id AS "roomId"
         FROM examcollect.exam_session`,
      `SELECT home_class_id AS "homeClassId", student_mssv::text AS "studentMssv", student_name AS "studentName"
         FROM examcollect.enrollment`,
      `SELECT id, academic_year_start AS "academicYearStart", term FROM examcollect.semester`,
      `SELECT id, name::text AS name FROM examcollect.room`,
      `SELECT id, code::text AS code FROM examcollect.administrative_class`,
      `SELECT mssv::text AS mssv FROM examcollect.student`,
    ].map((sql) => qr.query(sql)),
  );
  return { classes, sessions, enrollments, semesters, rooms, administrativeClasses, students };
}

/**
 * Mọi cột đang trỏ tới `class(id)`: từ catalog (khoá ngoại), cộng ba cột đã biết mà spec §8.3 nêu — nếu một môi trường nào đó có chúng mà không phải khoá
 * ngoại thì vẫn phải được ghi lại. `enrollment` đi riêng (xoá bản trùng, không ghi lại). Khoá ngoại GHÉP thì dừng: backfill không biết cách gộp.
 */
async function classReferences(qr: QueryRunner): Promise<Array<{ table: string; column: string }>> {
  const foreignKeys: Array<{ table: string; column: string; width: number }> = await qr.query(
    `SELECT t.relname AS "table", a.attname AS "column", array_length(c.conkey, 1) AS width
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'examcollect'
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.confrelid = 'examcollect.class'::regclass`,
  );
  const composite = foreignKeys.filter((fk) => fk.width > 1);
  if (composite.length > 0) {
    throw new Error(`Khoá ngoại ghép trỏ tới class (${composite.map((fk) => fk.table).join(', ')}) — backfill không biết cách gộp.`);
  }
  const found = new Map(foreignKeys.map((fk) => [`${fk.table}.${fk.column}`, { table: fk.table, column: fk.column }]));
  for (const [table, column] of [['exam_session', 'class_id'], ['session_roster', 'home_class_id'], ['submission', 'home_class_id']]) {
    const [exists] = await qr.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'examcollect' AND table_name = $1 AND column_name = $2`,
      [table, column],
    );
    if (exists) found.set(`${table}.${column}`, { table, column });
  }
  return [...found.values()].filter((ref) => ref.table !== 'enrollment').sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`));
}

async function applyMerge(qr: QueryRunner, merge: BackfillPlan['merges'][number]): Promise<BackfillReport['merged'][number]> {
  const moved: Record<string, number> = {};
  for (const { table, column } of await classReferences(qr)) {
    moved[`${table}.${column}`] = await affected(
      qr,
      `UPDATE examcollect.${ident(table)} SET ${ident(column)} = $1 WHERE ${ident(column)} = $2`,
      [merge.intoId, merge.fromId],
    );
  }
  // Mọi MSSV của lớp nguồn đã có ở lớp đích (planBackfill kiểm), nên xoá là xoá BẢN TRÙNG, không mất ai.
  const enrollmentsRemoved = await affected(qr, `DELETE FROM examcollect.enrollment WHERE home_class_id = $1`, [merge.fromId]);
  // Khoá ngoại RESTRICT là chốt cuối: còn một tham chiếu sót thì câu này nổ và cả transaction lùi lại.
  await affected(qr, `DELETE FROM examcollect.class WHERE id = $1`, [merge.fromId]);
  return { from: merge.fromName, into: merge.intoName, moved, enrollmentsRemoved };
}

async function applyPlan(qr: QueryRunner, plan: BackfillPlan): Promise<Omit<BackfillReport, 'dryRun' | 'remaining' | 'complete'>> {
  const merged: BackfillReport['merged'] = [];
  for (const merge of plan.merges) merged.push(await applyMerge(qr, merge));

  let semesters = 0;
  for (const { year, term } of plan.semesters) {
    const { startDate, endDate } = defaultSemesterDates(year, term);
    semesters += await affected(
      qr,
      `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date)
       VALUES ($1, $2, $3, $4) ON CONFLICT (academic_year_start, term) DO NOTHING RETURNING id`,
      [year, term, startDate, endDate],
    );
  }
  let administrativeClasses = 0;
  for (const code of plan.administrativeClasses) {
    administrativeClasses += await affected(
      qr,
      `INSERT INTO examcollect.administrative_class (code) VALUES ($1) ON CONFLICT (code) DO NOTHING RETURNING id`,
      [code],
    );
  }
  let rooms = 0;
  for (const room of plan.rooms) {
    rooms += await affected(
      qr,
      `INSERT INTO examcollect.room (name, is_active) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING RETURNING id`,
      [room.name, room.isActive],
    );
  }
  const students = plan.students.length === 0
    ? 0
    : await affected(
        qr,
        `INSERT INTO examcollect.student (mssv, full_name)
         SELECT m, n FROM unnest($1::text[], $2::text[]) AS t(m, n)
         ON CONFLICT (mssv) DO NOTHING RETURNING id`,
        [plan.students.map((s) => s.mssv), plan.students.map((s) => s.fullName)],
      );

  // `IS NULL` ở mọi câu: gán lần đầu (NULL → giá trị) là việc trigger `trg_class_semester_guard` cho phép; chạy lại không đổi gì.
  let classSemester = 0;
  let classAdministrativeClass = 0;
  for (const assignment of plan.classAssignments) {
    if (assignment.semester) {
      classSemester += await affected(
        qr,
        `UPDATE examcollect.class c SET semester_id = s.id
           FROM examcollect.semester s
          WHERE c.id = $1 AND c.semester_id IS NULL AND s.academic_year_start = $2 AND s.term = $3`,
        [assignment.classId, assignment.semester.year, assignment.semester.term],
      );
    }
    if (assignment.code) {
      classAdministrativeClass += await affected(
        qr,
        `UPDATE examcollect.class c SET administrative_class_id = a.id
           FROM examcollect.administrative_class a
          WHERE c.id = $1 AND c.administrative_class_id IS NULL AND a.code = $2`,
        [assignment.classId, assignment.code],
      );
    }
  }
  let sessionRoom = 0;
  for (const assignment of plan.roomAssignments) {
    sessionRoom += await affected(
      qr,
      `UPDATE examcollect.exam_session es SET room_id = r.id
         FROM examcollect.room r
        WHERE es.id = ANY($1::uuid[]) AND es.room_id IS NULL AND r.name = $2`,
      [assignment.sessionIds, assignment.name],
    );
  }
  const sessionSemesterName = plan.semesterNameRewrites.length === 0
    ? 0
    : await affected(
        qr,
        `UPDATE examcollect.exam_session es SET semester_name = v.label
           FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::text[]) AS label) v
          WHERE es.id = v.id AND es.semester_name <> v.label`,
        [plan.semesterNameRewrites.map((r) => r.sessionId), plan.semesterNameRewrites.map((r) => r.label)],
      );

  return {
    created: { semesters, administrativeClasses, rooms, students },
    merged,
    assigned: { classSemester, classAdministrativeClass, sessionRoom, sessionSemesterName },
  };
}

/**
 * Backfill (spec §8.2–8.4 bước 2 và 4): đọc ảnh chụp dữ liệu cũ, lập kế hoạch, và — chỉ khi không có điều gì không ánh xạ được — áp nó trong MỘT
 * transaction. Ném `BackfillBlockedError` TRƯỚC khi ghi bất cứ gì khi có vấn đề; ném lỗi DB (và lùi cả transaction) khi một ràng buộc từ chối.
 *
 * Hai khoá: `pg_advisory_xact_lock` (hai lần chạy cùng lúc không đạp nhau) và `LOCK TABLE … SHARE ROW EXCLUSIVE` trên ba bảng nguồn (không có phiên mới chen
 * vào giữa lúc đọc ảnh chụp và lúc ghi; đọc vẫn chạy). Chạy vài giây.
 */
export async function runBackfill(
  ds: DataSource,
  options: BackfillOptions = {},
  run: { dryRun?: boolean } = {},
): Promise<BackfillReport> {
  const dryRun = run.dryRun === true;
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await qr.query(`SELECT pg_advisory_xact_lock(hashtext('master-data-backfill'))`);
    await qr.query(`LOCK TABLE examcollect.class, examcollect.exam_session, examcollect.enrollment IN SHARE ROW EXCLUSIVE MODE`);

    const { plan, problems } = planBackfill(await readSnapshot(qr), options);
    if (problems.length > 0) throw new BackfillBlockedError(problems);

    const applied = await applyPlan(qr, plan);
    const remaining = await countContractBlockers(qr, options.onlyClassIds);
    const report: BackfillReport = {
      dryRun,
      ...applied,
      remaining,
      complete: Object.values(remaining).every((n) => n === 0),
    };

    if (dryRun) await qr.rollbackTransaction();
    else await qr.commitTransaction();
    return report;
  } catch (error) {
    if (qr.isTransactionActive) await qr.rollbackTransaction();
    throw error;
  } finally {
    await qr.release();
  }
}

```

- [ ] **Step 5: Chạy để thấy xanh**

Run: `cd apps/api && pnpm test:e2e -- --runInBand master-data-backfill`
Expected: PASS cả năm ca. Ba chỗ dễ trượt:
1. **`qr.query(sql, params, true)`** phải trả `affected` cho `UPDATE`/`DELETE` và `records` cho `INSERT … RETURNING`; nếu `moved` ra `NaN`/`undefined`, đó là dùng nhầm kết quả không có cấu trúc (`[rows, rowCount]` cho UPDATE/DELETE).
2. **Ca "ánh xạ đúng"**: `rooms` có **4** dòng vì mỗi phiên một dòng (a1 và m1 chung một phòng nhưng là hai phiên) — nếu ra 3, truy vấn đang `DISTINCT`.
3. **Ca dừng** đòi cả hai mã `CLASS_CODE_UNMAPPABLE` và `CLASS_SEMESTER_UNKNOWN`: phiên `stray` dùng `semesterName` mặc định của `seedExamSession` (`'HK kiểm thử'`, không đọc được) và lớp không có tên hợp lệ.

- [ ] **Step 6: Chạy lại cả bộ unit và guard**

Run: `cd apps/api && pnpm test`
Expected: PASS — gồm guard `e2e-seed-hygiene` (plan A): spec mới không chứa `INSERT INTO examcollect.(class|exam_session|enrollment)` (chúng nằm trong `helpers/seed.ts`; `session_roster`, `required_deliverable`, `submission` không thuộc guard).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/database/master-data/backfill.runner.ts apps/api/test/helpers/seed.ts apps/api/test/master-data-backfill.e2e-spec.ts
git commit -m "feat(api): runBackfill — áp kế hoạch trong một transaction (gộp lớp ghi lại mọi tham chiếu, chạy lại không đổi gì, dừng nguyên vẹn khi không ánh xạ được)"
```

---

### Task 3: Chụp, đối chiếu và CLI (`snapshot` / `backfill` / `verify`)

**Files:**
- Create: `apps/api/src/database/master-data/verify.ts`, `cli-args.ts`, `cli.ts`
- Modify: `apps/api/package.json`
- Test: `apps/api/src/database/master-data/verify.spec.ts`, `cli-args.spec.ts`

**Interfaces:**
- Consumes: `runBackfill`, `BackfillBlockedError` (Task 2); `countContractBlockers`, `contractProblems` (Task 1); kiểu `ParsedSemester` (Task 1); `dataSourceOptions` (`src/database/data-source.ts`).
- Produces:

```ts
// verify.ts
export interface DbSnapshot { takenAt: string; tables: Record<string, number>; checksums: Record<string, string> }
export function takeSnapshot(ds: DataSource): Promise<DbSnapshot>;
export interface SnapshotComparison { ok: boolean; lines: string[]; problems: string[] }
export function compareSnapshots(before: DbSnapshot, after: DbSnapshot, expectedDelta?: Record<string, number>): SnapshotComparison;
export function checkInvariants(ds: DataSource): Promise<string[]>;                // [] = đạt
export function proveRoomExclusion(ds: DataSource): Promise<{ status: 'blocked' | 'skipped' | 'FAILED'; detail: string }>;
// cli-args.ts
export class CliUsageError extends Error {}
export interface CliArgs { command: 'snapshot' | 'backfill' | 'verify'; databaseUrl?: string; confirmHost?: string; out?: string; before?: string; dryRun: boolean; defaultSemester?: ParsedSemester; merges: Array<{ from: string; into: string }>; inactiveRooms: string[]; expect: Record<string, number> }
export function parseCliArgs(argv: string[]): CliArgs;
export function assertTargetConfirmed(databaseUrl: string | undefined, confirmHost: string | undefined): { host: string; database: string };
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/api/src/database/master-data/verify.spec.ts`:

```ts
import { compareSnapshots, type DbSnapshot } from './verify';

const snapshot = (tables: Record<string, number>, checksums: Record<string, string> = { grading_result: 'aaa', score_computation: 'bbb' }): DbSnapshot => ({
  takenAt: '2026-10-06T00:00:00.000Z', tables, checksums,
});

describe('compareSnapshots — T-GR-2 và số dòng (spec §8.5)', () => {
  const before = snapshot({ account: 4, class: 3, enrollment: 63, exam_session: 29, grading_result: 62, migrations: 46 });

  it('không đổi gì và không mong đợi gì → đạt', () => {
    const result = compareSnapshots(before, snapshot({ ...before.tables }));
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it('mức đổi mong đợi khớp → đạt; bảng MỚI (không có ở bản "trước") tính là 0 dòng', () => {
    const after = snapshot({ ...before.tables, class: 2, enrollment: 54, student: 54, semester: 1, room: 4, administrative_class: 2, migrations: 48 });
    const result = compareSnapshots(before, after, { class: -1, enrollment: -9, student: 54, semester: 1, room: 4, administrative_class: 2 });
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.lines.join('\n')).toContain('enrollment: 63 → 54');
  });

  it('Review Focus 5: một bảng đổi NGOÀI mong đợi → lỗi nêu đúng tên bảng và mức đổi', () => {
    const after = snapshot({ ...before.tables, exam_session: 28 });
    const result = compareSnapshots(before, after);
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(['exam_session: đổi -1, mong đợi 0']);
  });

  it('mong đợi đổi mà không đổi → cũng là lỗi (backfill im lặng không làm gì)', () => {
    const result = compareSnapshots(before, snapshot({ ...before.tables }), { student: 54 });
    expect(result.problems).toEqual(['student: đổi 0, mong đợi 54']);
  });

  it('Review Focus 5: checksum điểm khác → lỗi, kể cả khi MỌI số dòng đều đúng', () => {
    const after = snapshot({ ...before.tables }, { grading_result: 'aaa', score_computation: 'ĐÃ-ĐỔI' });
    const result = compareSnapshots(before, after);
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(['checksum score_computation KHÁC: bbb → ĐÃ-ĐỔI']);
  });

  it('bảng `migrations` đổi theo bản chất của việc chạy migration — không tính', () => {
    expect(compareSnapshots(before, snapshot({ ...before.tables, migrations: 99 })).ok).toBe(true);
  });
});
```

Create `apps/api/src/database/master-data/cli-args.spec.ts`:

```ts
import { assertTargetConfirmed, CliUsageError, parseCliArgs } from './cli-args';

describe('parseCliArgs', () => {
  it('backfill đầy đủ', () => {
    const args = parseCliArgs([
      'backfill', '--dry-run', '--default-semester', '2026:1',
      '--merge', 'Hệ Quản Trị Dữ Liệu MongoDB=DHKTPM18ATT', '--inactive-room', 'TEST-KHONG-PHONG',
      '--database-url', 'postgresql://u:p@db.example.com:5432/x', '--confirm-host', 'db.example.com',
    ]);
    expect(args).toEqual({
      command: 'backfill', dryRun: true, defaultSemester: { year: 2026, term: 1 },
      merges: [{ from: 'Hệ Quản Trị Dữ Liệu MongoDB', into: 'DHKTPM18ATT' }], inactiveRooms: ['TEST-KHONG-PHONG'], expect: {},
      databaseUrl: 'postgresql://u:p@db.example.com:5432/x', confirmHost: 'db.example.com',
    });
  });

  it('verify với --before và nhiều --expect (số âm được)', () => {
    const args = parseCliArgs(['verify', '--before', 'before.json', '--expect', 'enrollment=-9', '--expect', 'student=54']);
    expect(args.command).toBe('verify');
    expect(args.before).toBe('before.json');
    expect(args.expect).toEqual({ enrollment: -9, student: 54 });
  });

  it.each([
    [[], /Lệnh phải là/],
    [['lam-gi-do'], /Lệnh phải là/],
    [['backfill', '--khong-co'], /Cờ lạ/],
    [['backfill', '--merge'], /cần một giá trị/],
    [['backfill', '--merge', 'khong-co-dau-bang'], /NGUỒN=ĐÍCH/],
    [['backfill', '--default-semester', '2026-1'], /YYYY:T/],
    [['backfill', '--default-semester', '2026:4'], /YYYY:T/],
    [['verify', '--expect', 'enrollment'], /bảng=số/],
    [['verify', '--expect', 'enrollment=abc'], /bảng=số/],
    [['verify', '--expect', 'bảng-có-dấu=1'], /bảng=số/],
  ])('đối số sai %j → CliUsageError', (argv, message) => {
    expect(() => parseCliArgs(argv as string[])).toThrow(CliUsageError);
    expect(() => parseCliArgs(argv as string[])).toThrow(message);
  });
});

describe('assertTargetConfirmed — Review Focus 4: không chạy nhầm đích', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])('máy local (%s) không cần xác nhận', (host) => {
    expect(assertTargetConfirmed(`postgresql://u:p@${host}:5442/examcollect`, undefined).database).toBe('examcollect');
  });

  it('máy từ xa mà thiếu --confirm-host → từ chối, nêu host và cách xác nhận', () => {
    const attempt = () => assertTargetConfirmed('postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres', undefined);
    expect(attempt).toThrow(CliUsageError);
    expect(attempt).toThrow(/--confirm-host aws-0-ap-southeast-1\.pooler\.supabase\.com/);
  });

  it('máy từ xa mà --confirm-host SAI → từ chối (xác nhận phải đúng host đang trỏ tới)', () => {
    expect(() => assertTargetConfirmed('postgresql://u:p@db.example.com:5432/x', 'db.other.com')).toThrow(CliUsageError);
  });

  it('máy từ xa với --confirm-host đúng → cho chạy và trả host/database để in ra', () => {
    expect(assertTargetConfirmed('postgresql://u:p@db.example.com:5432/postgres', 'db.example.com')).toEqual({ host: 'db.example.com', database: 'postgres' });
  });

  it('thiếu URL hoặc URL hỏng → CliUsageError', () => {
    expect(() => assertTargetConfirmed(undefined, undefined)).toThrow(/DATABASE_URL/);
    expect(() => assertTargetConfirmed('không phải url', undefined)).toThrow(/URL/);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/api && pnpm test -- src/database/master-data/verify.spec.ts src/database/master-data/cli-args.spec.ts`
Expected: FAIL — không import được hai module.

- [ ] **Step 3: Viết `verify.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { contractProblems, countContractBlockers } from './contract-preconditions';

export interface DbSnapshot {
  takenAt: string;
  /** Số dòng mọi bảng cơ sở trong schema `examcollect`. */
  tables: Record<string, number>;
  checksums: Record<string, string>;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
/** Đổi theo bản chất của việc chạy migration, không phải dữ liệu nghiệp vụ. */
const IGNORED_TABLES = new Set(['migrations']);
/** Bảng điểm: mở rộng, backfill và thu hẹp KHÔNG được đụng một byte (spec §8.5 mục 2, T-GR-2). */
const CHECKSUM_TABLES = ['grading_result', 'score_computation'];

export async function takeSnapshot(ds: DataSource): Promise<DbSnapshot> {
  const tables: Record<string, number> = {};
  const rows: Array<{ table_name: string }> = await ds.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'examcollect' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  for (const { table_name: name } of rows) {
    if (!IDENTIFIER.test(name)) throw new Error(`Tên bảng lạ: "${name}"`);
    const [row] = await ds.query(`SELECT count(*)::int AS n FROM examcollect."${name}"`);
    tables[name] = row.n;
  }
  const checksums: Record<string, string> = {};
  for (const name of CHECKSUM_TABLES) {
    if (!(name in tables)) continue;
    // `t::text` là chuỗi của CẢ hàng (mọi cột, theo thứ tự cột): bất kỳ byte nào của bất kỳ hàng nào đổi thì md5 đổi.
    const [row] = await ds.query(`SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t.id), '')) AS sum FROM examcollect."${name}" t`);
    checksums[name] = row.sum;
  }
  return { takenAt: new Date().toISOString(), tables, checksums };
}

export interface SnapshotComparison {
  ok: boolean;
  /** Các dòng đáng đọc (bảng đổi hoặc được mong đợi đổi). */
  lines: string[];
  problems: string[];
}

/**
 * So hai bản chụp. Mọi bảng phải đổi ĐÚNG mức mong đợi (mặc định 0 — một bảng không được khai là không được đổi), bảng mới coi như 0 dòng ở bản "trước",
 * và checksum điểm phải GIỐNG HỆT. Một bảng đổi ngoài mong đợi là lỗi, kể cả khi nó "nhỏ".
 */
export function compareSnapshots(before: DbSnapshot, after: DbSnapshot, expectedDelta: Record<string, number> = {}): SnapshotComparison {
  const lines: string[] = [];
  const problems: string[] = [];
  const names = [...new Set([...Object.keys(before.tables), ...Object.keys(after.tables), ...Object.keys(expectedDelta)])]
    .filter((name) => !IGNORED_TABLES.has(name))
    .sort();
  for (const name of names) {
    const was = before.tables[name] ?? 0;
    const now = after.tables[name] ?? 0;
    const delta = now - was;
    const expected = expectedDelta[name] ?? 0;
    if (delta !== 0 || expected !== 0) {
      const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
      lines.push(`${name}: ${was} → ${now} (${signed(delta)}, mong đợi ${signed(expected)}) ${delta === expected ? 'ok' : 'LỆCH'}`);
    }
    if (delta !== expected) problems.push(`${name}: đổi ${delta}, mong đợi ${expected}`);
  }
  for (const [name, sum] of Object.entries(before.checksums)) {
    const other = after.checksums[name];
    if (other !== sum) problems.push(`checksum ${name} KHÁC: ${sum} → ${other ?? '(không có)'}`);
  }
  return { ok: problems.length === 0, lines, problems };
}

/** Những thứ phải đúng khi dữ liệu đã ở hình dạng đích: bốn con số của tiền điều kiện thu hẹp, và mọi lớp đều có nhãn. */
export async function checkInvariants(ds: DataSource): Promise<string[]> {
  const problems = contractProblems(await countContractBlockers(ds));
  const [missingLabel] = await ds.query(
    `SELECT count(*)::int AS n FROM examcollect.class c
       LEFT JOIN examcollect.class_label l ON l.class_id = c.id WHERE l.label IS NULL`,
  );
  if (missingLabel.n > 0) problems.push(`${missingLabel.n} lớp không có nhãn trong view class_label.`);
  return problems;
}

/**
 * Spec §8.5 mục 4: "chèn thử hai phiên chưa kết thúc trùng phòng thì bị chặn theo `room_id`". Làm trong một transaction LUÔN lùi lại, nên không để lại gì.
 * Cần hai lớp của hai giảng viên KHÁC NHAU — nếu cùng lớp hay cùng giảng viên thì ràng buộc chống trùng lớp / giãn cách 30 phút có thể nổ trước và phép thử không
 * nói gì về phòng; chỉ chấp nhận khi chính ràng buộc `ex_exam_session_room_overlap` từ chối (23P01).
 */
export async function proveRoomExclusion(ds: DataSource): Promise<{ status: 'blocked' | 'skipped' | 'FAILED'; detail: string }> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    const classes: Array<{ id: string; teacher_id: string }> = await qr.query(
      `SELECT id, teacher_id FROM examcollect.class ORDER BY id`,
    );
    const first = classes[0];
    const second = classes.find((c) => c.teacher_id !== first?.teacher_id);
    const [room] = await qr.query(`SELECT id, name::text AS name FROM examcollect.room ORDER BY name LIMIT 1`);
    if (!first || !second || !room) {
      return { status: 'skipped', detail: 'Cần ít nhất hai lớp của hai giảng viên khác nhau và một phòng để chứng minh.' };
    }
    const insert = (classId: string, teacherId: string, start: string, end: string) =>
      qr.query(
        `INSERT INTO examcollect.exam_session
           (name, code, class_id, teacher_id, exam_type, start_time, end_time, status, semester_name, course_name, room_name, room_id)
         VALUES ($1, $2, $3, $4, 'TK', $5, $6, 'active', 'HK kiểm thử', 'CTDL&GT', $7, $8)`,
        [`Chứng minh ${randomUUID().slice(0, 8)}`, `P${randomUUID().slice(0, 8)}`, classId, teacherId, start, end, room.name, room.id],
      );
    await insert(first.id, first.teacher_id, '2999-01-01T08:00:00Z', '2999-01-01T10:00:00Z');
    try {
      await insert(second.id, second.teacher_id, '2999-01-01T09:00:00Z', '2999-01-01T11:00:00Z');
    } catch (error) {
      // TypeORM bọc lỗi của driver; lấy `driverError` nếu có để đọc đúng `code`/`constraint` của Postgres.
      const failure = ((error as { driverError?: unknown }).driverError ?? error) as { code?: string; constraint?: string; message?: string };
      return failure.code === '23P01' && failure.constraint === 'ex_exam_session_room_overlap'
        ? { status: 'blocked', detail: `Phòng ${room.name}: phiên thứ hai bị chặn theo room_id (ex_exam_session_room_overlap).` }
        : { status: 'FAILED', detail: `Bị từ chối nhưng không phải vì phòng: ${failure.code} ${failure.constraint ?? ''} ${failure.message ?? ''}` };
    }
    return { status: 'FAILED', detail: 'Hai phiên chưa kết thúc cùng phòng, giờ chồng nhau mà KHÔNG bị chặn.' };
  } finally {
    await qr.rollbackTransaction();
    await qr.release();
  }
}
```

- [ ] **Step 4: Viết `cli-args.ts`**

```ts
import type { ParsedSemester } from './semester-name';

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

export interface CliArgs {
  command: 'snapshot' | 'backfill' | 'verify';
  databaseUrl?: string;
  confirmHost?: string;
  out?: string;
  before?: string;
  dryRun: boolean;
  defaultSemester?: ParsedSemester;
  merges: Array<{ from: string; into: string }>;
  inactiveRooms: string[];
  expect: Record<string, number>;
}

const COMMANDS = ['snapshot', 'backfill', 'verify'] as const;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function parseCliArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command as (typeof COMMANDS)[number])) {
    throw new CliUsageError(`Lệnh phải là một trong: ${COMMANDS.join(', ')}.`);
  }
  const args: CliArgs = { command: command as CliArgs['command'], dryRun: false, merges: [], inactiveRooms: [], expect: {} };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    const value = (): string => {
      const next = rest[(i += 1)];
      if (next === undefined || next.startsWith('--')) throw new CliUsageError(`${flag} cần một giá trị.`);
      return next;
    };
    switch (flag) {
      case '--database-url':
        args.databaseUrl = value();
        break;
      case '--confirm-host':
        args.confirmHost = value();
        break;
      case '--out':
        args.out = value();
        break;
      case '--before':
        args.before = value();
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--default-semester': {
        const match = /^(\d{4}):([123])$/.exec(value());
        if (!match) throw new CliUsageError('--default-semester phải có dạng YYYY:T (T = 1, 2 hoặc 3), vd 2026:1.');
        args.defaultSemester = { year: Number(match[1]), term: Number(match[2]) as 1 | 2 | 3 };
        break;
      }
      case '--merge': {
        const text = value();
        const at = text.indexOf('=');
        if (at <= 0 || at === text.length - 1) throw new CliUsageError('--merge phải có dạng NGUỒN=ĐÍCH (theo `class.name`; tên không chứa dấu "=").');
        args.merges.push({ from: text.slice(0, at), into: text.slice(at + 1) });
        break;
      }
      case '--inactive-room':
        args.inactiveRooms.push(value());
        break;
      case '--expect': {
        const match = /^([a-z_][a-z0-9_]*)=(-?\d+)$/.exec(value());
        if (!match) throw new CliUsageError('--expect phải có dạng bảng=số (số nguyên, có thể âm), vd enrollment=-9.');
        args.expect[match[1]] = Number(match[2]);
        break;
      }
      default:
        throw new CliUsageError(`Cờ lạ: ${flag}`);
    }
  }
  return args;
}

/**
 * Chốt chặn chạy nhầm đích. `apps/api/.env` trỏ Supabase từ xa (memory `cine-migration-hits-supabase`), nên một lệnh ghi chạy với `.env` mặc định là
 * ghi vào DB thật. Máy nào không phải local phải được XÁC NHẬN bằng cách gõ lại đúng host — gõ sai hay không gõ đều từ chối.
 */
export function assertTargetConfirmed(
  databaseUrl: string | undefined,
  confirmHost: string | undefined,
): { host: string; database: string } {
  if (!databaseUrl) throw new CliUsageError('Thiếu DATABASE_URL (hoặc --database-url).');
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new CliUsageError('DATABASE_URL không đọc được thành URL.');
  }
  const host = url.hostname;
  const database = url.pathname.replace(/^\//, '');
  if (!LOCAL_HOSTS.has(host) && confirmHost !== host) {
    throw new CliUsageError(
      `Đích ${host}/${database} KHÔNG phải máy local. Nếu đúng là nơi muốn chạy, thêm --confirm-host ${host}. ` +
        '(apps/api/.env trỏ Supabase từ xa — kiểm tra kỹ trước khi xác nhận.)',
    );
  }
  return { host, database };
}
```

- [ ] **Step 5: Viết `cli.ts` và script**

Create `apps/api/src/database/master-data/cli.ts`:

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../data-source';
import { BackfillBlockedError, runBackfill } from './backfill.runner';
import { assertTargetConfirmed, CliUsageError, parseCliArgs } from './cli-args';
import { checkInvariants, compareSnapshots, proveRoomExclusion, takeSnapshot, type DbSnapshot } from './verify';

/**
 * Công cụ vận hành cho đợt khôi phục master data (xem `docs/runbooks/master-data-cutover.md`):
 *   pnpm master-data snapshot --out before.json
 *   pnpm master-data backfill [--dry-run] [--default-semester 2026:1] [--merge "NGUỒN=ĐÍCH"] [--inactive-room TÊN]
 *   pnpm master-data verify --before before.json [--expect bảng=số …]
 * Mã thoát: 0 đạt · 1 verify không đạt · 2 backfill DỪNG vì không ánh xạ được · 64 dùng sai.
 * Đích luôn được in ra TRƯỚC khi làm gì; máy không phải local đòi --confirm-host.
 */
async function main(): Promise<number> {
  const args = parseCliArgs(process.argv.slice(2));
  const url = args.databaseUrl ?? process.env.DATABASE_URL;
  const target = assertTargetConfirmed(url, args.confirmHost);
  console.log(`Đích: ${target.host}/${target.database}`);

  const ds = new DataSource({ ...dataSourceOptions, url });
  await ds.initialize();
  try {
    if (args.command === 'snapshot') {
      const file = args.out ?? 'master-data-before.json';
      const snapshot = await takeSnapshot(ds);
      await writeFile(file, JSON.stringify(snapshot, null, 2), 'utf8');
      console.log(`Đã ghi ${file}: ${Object.keys(snapshot.tables).length} bảng, checksum ${Object.keys(snapshot.checksums).join(', ')}.`);
      return 0;
    }

    if (args.command === 'backfill') {
      try {
        const report = await runBackfill(
          ds,
          { defaultSemester: args.defaultSemester, merges: args.merges, inactiveRooms: args.inactiveRooms },
          { dryRun: args.dryRun },
        );
        console.log(JSON.stringify(report, null, 2));
        console.log(report.dryRun ? 'DRY-RUN: đã lùi lại, không ghi gì.' : report.complete ? 'Backfill xong, không còn gì thiếu.' : 'Backfill xong NHƯNG còn thiếu — xem "remaining".');
        return 0;
      } catch (error) {
        if (error instanceof BackfillBlockedError) {
          console.error(error.message);
          return 2;
        }
        throw error;
      }
    }

    if (!args.before) throw new CliUsageError('verify cần --before <file> (bản chụp lấy TRƯỚC mọi migration của đợt này).');
    const before = JSON.parse(await readFile(args.before, 'utf8')) as DbSnapshot;
    const comparison = compareSnapshots(before, await takeSnapshot(ds), args.expect);
    const invariants = await checkInvariants(ds);
    const exclusion = await proveRoomExclusion(ds);
    console.log(['--- Số dòng và checksum ---', ...comparison.lines, ...comparison.problems.map((p) => `LỖI ${p}`)].join('\n'));
    console.log(['--- Bất biến ---', ...(invariants.length > 0 ? invariants.map((p) => `LỖI ${p}`) : ['đạt'])].join('\n'));
    console.log(`--- Chống trùng phòng theo room_id --- ${exclusion.status}: ${exclusion.detail}`);
    return comparison.ok && invariants.length === 0 && exclusion.status !== 'FAILED' ? 0 : 1;
  } finally {
    await ds.destroy();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(error instanceof CliUsageError ? 64 : 1);
  },
);
```

Trong `apps/api/package.json`, thêm vào `scripts` (sau `"rehearsal"`):

```json
    "master-data": "node -r ts-node/register -r dotenv/config -r tsconfig-paths/register src/database/master-data/cli.ts",
```

- [ ] **Step 6: Chạy để thấy xanh**

Run: `cd apps/api && pnpm test -- src/database/master-data && pnpm exec tsc --noEmit -p tsconfig.json && pnpm exec eslint src/database/master-data`
Expected: PASS; `tsc` và ESLint sạch. Rồi thử CLI trên DB local (e2e) — `snapshot` rồi `verify` ngay với cùng bản chụp phải **đạt** (không đổi gì):

```powershell
cd apps/api
$env:DATABASE_URL = "<giá trị trong .env.test>"   # local, localhost:5442
pnpm master-data snapshot --out $env:TEMP/md-before.json
pnpm master-data verify --before $env:TEMP/md-before.json
```

Expected: `Đích: localhost/...`, mã thoát 0; phần "Chống trùng phòng" là `blocked` (hoặc `skipped` kèm lý do nếu DB e2e chưa có hai lớp của hai giảng viên và một phòng). Rồi thử chốt chặn: `pnpm master-data snapshot --database-url postgresql://u:p@db.example.com:5432/x` phải **từ chối** với mã thoát 64 và nhắc `--confirm-host db.example.com`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/database/master-data apps/api/package.json
git commit -m "feat(api): công cụ chụp/đối chiếu/backfill cho cutover master data (từ chối đích từ xa nếu thiếu --confirm-host, so checksum điểm và số dòng)"
```

---

### Task 4: Viết lại `scripts/reset-dev-data.sql`

**Files:**
- Modify (viết lại): `scripts/reset-dev-data.sql`

**Interfaces:** không.

Vì sao nằm trước migration thu hẹp: DB **dev/e2e local** đầy dữ liệu hình dạng cũ (lớp không có học kỳ, phiên không có phòng, enrollment không có sinh viên — mọi suite e2e từng để lại và không bao giờ dọn). Tiền điều kiện của migration thu hẹp dừng ở những hàng đó, nên DB local phải được đưa về sạch **trước** khi áp migration thu hẹp lên nó (Task 5). Script cũ còn xoá bảng `course`/`semester` không tồn tại từ 20/09 nên chạy là lỗi.

- [ ] **Step 1: Viết lại script**

Thay **toàn bộ** nội dung `scripts/reset-dev-data.sql` bằng:

```sql
-- Đưa DB DEV (cả DB e2e local) về trạng thái "vừa dựng xong": giữ các tài khoản demo, xoá MỌI thứ còn lại — lớp, phiên thi, bài nộp, kết quả chấm,
-- rubric, và dữ liệu nền (học kỳ, phòng, lớp danh nghĩa, sinh viên).
--
-- Vì sao cần: các bộ e2e dựng học kỳ, phòng, lớp danh nghĩa, lớp, sinh viên, phiên thi và tài khoản MỖI LẦN CHẠY mà không bao giờ dọn (không thể: mỗi lần cần
-- giá trị riêng, và dọn sau một lần chạy hỏng sẽ phá fixture của lần sau). Sau vài tuần, danh sách chỉ còn rác — và, từ khi có migration thu hẹp
-- (`ContractMasterDataEntities`), rác ở HÌNH DẠNG CŨ (lớp không học kỳ, phiên không phòng) làm migration đó dừng ở tiền điều kiện.
--
--   docker exec -i cine-postgres-1 psql -U examcollect_admin -d examcollect < scripts/reset-dev-data.sql
--
-- AN TOÀN KHI CHẠY LẠI. CHỈ dùng cho DB dev: nó xoá theo "gốc rồi lan theo khoá ngoại" (TRUNCATE … CASCADE), nên mọi bảng phụ thuộc cũng sạch. ĐỌC các dòng
-- NOTICE nó in ra — đó là danh sách bảng đã bị xoá sạch.
--
-- `audit_log` KHÔNG nằm trong danh sách và không có khoá ngoại tới các bảng dưới đây: trigger append-only của nó từ chối DELETE (Security rule 4), nên nó không
-- bao giờ reset được bằng script này; muốn rỗng thì dựng lại DB.
--
-- Cấu hình AI/chi phí của admin (`grading_pipeline_config`, `cost_budget`) và tài khoản giữ nguyên.

BEGIN;

-- ---- Gốc dữ liệu thi + chấm + nền: mọi bảng phụ thuộc (bài nộp, điểm, danh sách dự thi, enrollment, deliverable …) bị cuốn theo ---------
TRUNCATE
  examcollect.exam_session,
  examcollect.class,
  examcollect.student,
  examcollect.semester,
  examcollect.room,
  examcollect.administrative_class,
  examcollect.rubric,
  examcollect.calibration_run
RESTART IDENTITY CASCADE;

-- ---- Tài khoản: giữ hai tài khoản demo DEMO-RUNBOOK.md nhắc tới --------
-- demo-admin giữ có chủ ý: kiểm route chỉ-cho-giảng-viên cần một đăng nhập admin thật, và từ đợt khôi phục master data, admin là người tạo học kỳ, phòng,
-- lớp và giao lớp cho giảng viên — reset mà mất nó thì không còn cách dựng lại dữ liệu nền.
DELETE FROM examcollect.account
WHERE email NOT IN (
  'demo-teacher@example.com',
  'demo-admin@example.com'
);

COMMIT;

SELECT 'account' AS t, count(*) FROM examcollect.account
UNION ALL SELECT 'semester', count(*) FROM examcollect.semester
UNION ALL SELECT 'room', count(*) FROM examcollect.room
UNION ALL SELECT 'administrative_class', count(*) FROM examcollect.administrative_class
UNION ALL SELECT 'class', count(*) FROM examcollect.class
UNION ALL SELECT 'student', count(*) FROM examcollect.student
UNION ALL SELECT 'enrollment', count(*) FROM examcollect.enrollment
UNION ALL SELECT 'exam_session', count(*) FROM examcollect.exam_session
UNION ALL SELECT 'submission', count(*) FROM examcollect.submission
ORDER BY 1;
```

- [ ] **Step 2: Kiểm bằng một DB dùng một lần (KHÔNG chạy lên DB đang dùng)**

```powershell
# Dựng một database trống trong container local, áp mọi migration, chạy script, rồi bỏ nó đi.
docker exec -i cine-postgres-1 psql -U examcollect_admin -d postgres -c "CREATE DATABASE examcollect_reset_check"
$env:DATABASE_URL = "postgresql://<user>:<mật khẩu>@localhost:<cổng>/examcollect_reset_check"   # cùng user/mật khẩu/cổng như .env.test, đổi tên database
cd apps/api; pnpm migration:run
docker exec -i cine-postgres-1 psql -U examcollect_admin -d examcollect_reset_check < ../../scripts/reset-dev-data.sql
```

Expected: script chạy **không lỗi**, in các dòng `NOTICE: truncate cascades to table …`, bảng cuối cùng toàn `0` trừ `account` (còn `0` hoặc hai tài khoản demo nếu DB có). Rồi chạy **lần hai** — vẫn không lỗi (an toàn chạy lại). Cuối cùng `docker exec -i cine-postgres-1 psql -U examcollect_admin -d postgres -c "DROP DATABASE examcollect_reset_check"`. Nếu `TRUNCATE` báo bảng nào đó "cannot truncate a table referenced in a foreign key constraint" thì thêm bảng đó vào danh sách gốc (đừng bỏ `CASCADE`).

- [ ] **Step 3: Commit**

```bash
git add scripts/reset-dev-data.sql
git commit -m "chore(scripts): viết lại reset-dev-data.sql cho schema có học kỳ/phòng/lớp danh nghĩa/sinh viên (bản cũ còn xoá bảng course/semester đã bỏ từ 20/09)"
```

---

### Task 5: PR2 — migration thu hẹp và gỡ mọi thứ của giai đoạn chuyển tiếp

> **Nhánh/PR riêng.** Chỉ merge **sau khi** backfill đã chạy thật xong trên môi trường dùng thật (runbook mục 3.7). Code ở đây không đọc `class.name`/`enrollment.student_name` nên chạy được trên schema trước thu hẹp; migration là bước cuối, chạy **sau** khi code này đã deploy.

**Files:**
- Create: `apps/api/src/database/migrations/1789700000000-ContractMasterDataEntities.ts`, `apps/api/test/master-data-contract.e2e-spec.ts`
- Modify: các entity/service/test của giai đoạn chuyển tiếp (xem Step 1), `apps/api/test/helpers/seed.ts`
- Delete: `apps/api/test/master-data-backfill.e2e-spec.ts`

**Interfaces:**
- Consumes: `contractProblems`, `countContractBlockers` (Task 1).
- Produces: schema đích — `class.semester_id`, `class.administrative_class_id`, `exam_session.room_id` `NOT NULL`; `fk_enrollment_student`; không còn `class.name`, `enrollment.student_name`, `ex_exam_session_room_overlap_legacy`; view `class_label` không còn nhánh dự phòng; `down()` ném lỗi.

- [ ] **Step 1: Kiểm kê mọi chỗ còn dùng cột cũ và cờ chuyển tiếp**

```powershell
cd apps/api
Get-ChildItem src,test -Recurse -Include *.ts | Select-String -Pattern 'student_name\b|studentName\b|c\.name\b|class\.name|legacyName|withoutRoom|chưa backfill|trước backfill|ex_exam_session_room_overlap_legacy' |
  Where-Object { $_.Line -notmatch 'session_roster|student_name_input|ảnh chụp|snapshot' } |
  ForEach-Object { "$($_.Path.Replace((Get-Location).Path + '\', '')):$($_.LineNumber): $($_.Line.Trim())" }
```

Đây là **danh sách việc** — mỗi dòng rơi vào một dòng của bảng dưới. Không dòng nào được bỏ qua; chạy lại lệnh cho tới khi chỉ còn những chỗ **nói về bản chụp** (`session_roster.student_name`, `submission.student_name_input`, chú thích lịch sử).

| Dòng tìm thấy trông như | Việc |
|---|---|
| SQL thô `COALESCE(st.full_name, e.student_name)` hoặc `COALESCE(s.full_name, e.student_name, '')` (plan D1: `recollect.service`, `submission-overview.service`, `roster.service`, `attendance.service`, `session-roster.service`…) | → `st.full_name`; `LEFT JOIN examcollect.student` → `JOIN` (nay mọi enrollment đều có sinh viên, khoá ngoại ép). Cập nhật chú thích đầu hàm nếu còn nhắc cột cũ. |
| `SELECT student_name … FROM examcollect.enrollment` (`access-request.gateway`, plan D1 Task 8) | → `SELECT s.full_name AS student_name … FROM enrollment e JOIN student s ON s.mssv = e.student_mssv` |
| `ClassEntity.name`, `EnrollmentEntity.studentName` | xoá cột khỏi entity; trong `ClassEntity` đổi `semesterId`, `administrativeClassId` và trong `ExamSessionEntity` đổi `roomId` sang `nullable: false` (kiểu TS bỏ `\| null`) — `pnpm exec tsc --noEmit` chỉ ra mọi chỗ gán/đọc cần sửa |
| `class_label` COALESCE về `c.name` (nằm trong **view** do migration mở rộng dựng) | không đổi code; migration thu hẹp dựng lại view |
| Cờ `legacyName` (`seedClass`, `seedEnrollment`), `withoutRoom` (`seedExamSession`), kiểu `string \| null` của `SeededClass.semesterId/administrativeClassId`, `SeedClassOptions.semesterId/administrativeClassId` nhận `null` | gỡ khỏi `test/helpers/seed.ts` |
| Test dựng "lớp cũ" (`semesterId: null`, `administrativeClassId: null`, `withoutRoom: true`, `legacyName`) — plan D1 (`roster-import`, `student-name-readers`: ca "dòng enrollment chưa có sinh viên", ca "đầu độc cột cũ"), D3 (`exam-session`: ca "lớp chưa có học kỳ → 409"), F (`exam-session-edit`: nhóm "phiên cũ chưa có room_id"), `master-data-backfill.e2e-spec.ts` | **xoá ca** (hình dạng đó không còn tồn tại và khoá ngoại/NOT NULL từ chối dựng nó); riêng `master-data-backfill.e2e-spec.ts` xoá **cả file** — công cụ backfill vẫn nằm đó cho lần chạy lại ở cutover và đã có test thuần; phép thử thật của nó là diễn tập trên bản sao |
| Nhánh code chỉ phục vụ hình dạng cũ: 409 "lớp chưa có học kỳ" ở `ExamSessionService.create` (D3), nhánh "phiên cũ chưa có `room_id`" ở `ExamSessionEditService.update` (F), nhánh dự phòng cho nhãn `NULL` (nếu có) | xoá nhánh (không còn đường tới); giữ test của đường chính |

- [ ] **Step 2: Viết test trạng thái đích (đỏ)**

Create `apps/api/test/master-data-contract.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ContractMasterDataEntities1789700000000 } from '../src/database/migrations/1789700000000-ContractMasterDataEntities';
import { seedTeacher } from './helpers/grading-seed';
import { randomTag } from './helpers/master-data';
import { seedClass, seedEnrollment } from './helpers/seed';

/**
 * Trạng thái ĐÍCH sau migration thu hẹp. Chạy trên DB đã áp migration — sau khi áp, schema ở đây là schema thật; trước khi áp các ca này đỏ (đó là Step 3).
 * Không thử CHÈN hàng sai (guard `e2e-seed-hygiene` cấm SQL thô dựng lớp/enrollment/phiên ngoài helper): kiểm catalog, và kiểm khoá ngoại bằng một câu DELETE.
 */
describe('master data — trạng thái đích sau thu hẹp (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const columnsOf = async (table: string): Promise<string[]> =>
    (await ds.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'examcollect' AND table_name = $1`, [table])).map(
      (r: { column_name: string }) => r.column_name,
    );
  const nullable = async (table: string, column: string): Promise<boolean> => {
    const [row] = await ds.query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'examcollect' AND table_name = $1 AND column_name = $2`,
      [table, column],
    );
    return row.is_nullable === 'YES';
  };
  const constraintNames = async (): Promise<string[]> =>
    (await ds.query(`SELECT conname FROM pg_constraint WHERE connamespace = 'examcollect'::regnamespace`)).map((r: { conname: string }) => r.conname);

  it('hai cột cũ đã bỏ: class.name và enrollment.student_name', async () => {
    expect(await columnsOf('class')).not.toContain('name');
    expect(await columnsOf('enrollment')).not.toContain('student_name');
  });

  it('bản chụp tên (session_roster.student_name, submission.student_name_input) VẪN còn — chúng là ảnh chụp lúc thi, không phải bản sao của student', async () => {
    expect(await columnsOf('session_roster')).toContain('student_name');
    expect(await columnsOf('submission')).toContain('student_name_input');
  });

  it('NOT NULL: class.semester_id, class.administrative_class_id, exam_session.room_id', async () => {
    expect(await nullable('class', 'semester_id')).toBe(false);
    expect(await nullable('class', 'administrative_class_id')).toBe(false);
    expect(await nullable('exam_session', 'room_id')).toBe(false);
  });

  it('chống trùng phòng chỉ còn theo room_id: bản theo TÊN (legacy) đã bỏ, bản mới còn', async () => {
    const names = await constraintNames();
    expect(names).not.toContain('ex_exam_session_room_overlap_legacy');
    expect(names).toContain('ex_exam_session_room_overlap');
  });

  it('khoá ngoại enrollment → student có mặt và RESTRICT: xoá một sinh viên còn enrollment bị từ chối (23503)', async () => {
    expect(await constraintNames()).toContain('fk_enrollment_student');
    const teacherId = await seedTeacher(ds, `ct-${randomTag(6)}`);
    const klass = await seedClass(ds, { teacherId });
    const mssv = `CT${randomTag(8)}`;
    await seedEnrollment(ds, { classId: klass.id, teacherId, mssv, name: 'Sinh viên kiểm thử' });
    await expect(ds.query(`DELETE FROM examcollect.student WHERE mssv = $1`, [mssv])).rejects.toMatchObject({ code: '23503' });
  });

  it('view class_label không còn nhánh dự phòng về class.name, và mọi lớp đều có nhãn', async () => {
    const [view] = await ds.query(`SELECT pg_get_viewdef('examcollect.class_label'::regclass) AS def`);
    expect(view.def).not.toMatch(/\bc\.name\b/);
    const [missing] = await ds.query(
      `SELECT count(*)::int AS n FROM examcollect.class c LEFT JOIN examcollect.class_label l ON l.class_id = c.id WHERE l.label IS NULL`,
    );
    expect(missing.n).toBe(0);
  });

  it('migration thu hẹp KHÔNG đảo ngược được: down() ném lỗi trỏ tới bản dump', async () => {
    await expect(new ContractMasterDataEntities1789700000000().down()).rejects.toThrow(/dump|sao lưu/i);
  });
});
```

- [ ] **Step 3: Chạy để thấy đỏ**

Run: `cd apps/api && pnpm test:e2e -- --runInBand master-data-contract`
Expected: FAIL — không import được migration, và (nếu import được) schema chưa thu hẹp.

- [ ] **Step 4: Viết migration**

Create `apps/api/src/database/migrations/1789700000000-ContractMasterDataEntities.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';
import { contractProblems, countContractBlockers } from '../master-data/contract-preconditions';

/**
 * Nửa THU HẸP của đợt khôi phục master data (spec 2026-10-04 §8.4 bước 4) — và là điểm KHÔNG QUAY LẠI ĐƯỢC.
 *
 * Làm bốn việc, theo thứ tự bắt buộc:
 *   1. DỪNG nếu còn dữ liệu hình dạng cũ (cùng hàm đếm với backfill — "backfill xong" và "thu hẹp được phép" không thể nói hai điều khác nhau).
 *   2. Bỏ view `class_label` (nó đọc `class.name`), thu hẹp `class`/`exam_session`/`enrollment`, rồi DỰNG LẠI view không còn nhánh dự phòng.
 *   3. `NOT NULL` cho `class.semester_id`, `class.administrative_class_id`, `exam_session.room_id`; bỏ ràng buộc chống trùng phòng theo TÊN (chỉ còn theo
 *      `room_id`).
 *   4. Khoá ngoại `enrollment.student_mssv → student.mssv`, và bỏ hai cột cũ `class.name`, `enrollment.student_name`.
 *
 * Bỏ `class.name` kéo theo chỉ mục `uq_class_teacher_course_name` (nó có cột đó); khoá duy nhất thay thế `uq_class_semester_admin_group` đã có từ migration
 * mở rộng. Cột `room_name`/`semester_name` trên `exam_session` GIỮ NGUYÊN: chúng là BẢN CHỤP lúc tạo phiên (bảng điểm, tên file `{PHONG}`), không phải bản sao.
 *
 * Code PR2 không đọc hai cột cũ, nên thứ tự deploy là CODE TRƯỚC, MIGRATION SAU — chạy migration này trước khi deploy PR2 làm code cũ (còn
 * `COALESCE(…, e.student_name)`) hỏng ở từng câu truy vấn.
 *
 * `down()` KHÔNG khôi phục được dữ liệu và không giả vờ ngược lại (như `ContractMasterData`): tên lớp và tên sinh viên trong hai cột bị bỏ không suy ra được từ
 * chỗ nào còn lại.
 */
export class ContractMasterDataEntities1789700000000 implements MigrationInterface {
  name = 'ContractMasterDataEntities1789700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.startTransaction();
    try {
      const problems = contractProblems(await countContractBlockers(q));
      if (problems.length > 0) {
        throw new Error(`Không thu hẹp được — DỪNG, không đoán và không "tạm gán":\n  - ${problems.join('\n  - ')}`);
      }

      await q.query(`DROP VIEW "examcollect"."class_label"`);

      await q.query(`
        ALTER TABLE "examcollect"."class"
          ALTER COLUMN "semester_id" SET NOT NULL,
          ALTER COLUMN "administrative_class_id" SET NOT NULL,
          DROP COLUMN "name"
      `);

      await q.query(`ALTER TABLE "examcollect"."exam_session" ALTER COLUMN "room_id" SET NOT NULL`);
      await q.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "ex_exam_session_room_overlap_legacy"`);

      await q.query(`ALTER TABLE "examcollect"."enrollment" DROP COLUMN "student_name"`);
      await q.query(`
        ALTER TABLE "examcollect"."enrollment"
          ADD CONSTRAINT "fk_enrollment_student" FOREIGN KEY ("student_mssv")
              REFERENCES "examcollect"."student"("mssv") ON DELETE RESTRICT
      `);
      // Khoá ngoại cần chỉ mục ở phía tham chiếu để kiểm tra xoá sinh viên không quét cả bảng; cũng là chỉ mục cho "lớp nào có sinh viên này".
      await q.query(`CREATE INDEX "idx_enrollment_student_mssv" ON "examcollect"."enrollment" ("student_mssv")`);

      // Nhãn lớp — MỘT nguồn duy nhất (spec §2.5). Nay mọi lớp đều có mã danh nghĩa và học kỳ nên không còn nhánh dự phòng về `class.name`.
      await q.query(`
        CREATE VIEW "examcollect"."class_label" AS
        SELECT c.id AS class_id,
               ac.code::text || CASE WHEN c.group_name = '' THEN '' ELSE ' – ' || c.group_name END AS label,
               ac.code::text || CASE WHEN c.group_name = '' THEN '' ELSE ' – ' || c.group_name END
                 || ' · ' || examcollect.semester_label(sem.academic_year_start, sem.term) AS label_with_semester
          FROM examcollect.class c
          JOIN examcollect.administrative_class ac ON ac.id = c.administrative_class_id
          JOIN examcollect.semester sem ON sem.id = c.semester_id
      `);

      await q.commitTransaction();
    } catch (error) {
      await q.rollbackTransaction();
      throw error;
    }
  }

  public async down(): Promise<void> {
    throw new Error(
      'ContractMasterDataEntities không quay ngược được. Hai cột class.name và enrollment.student_name đã bị bỏ cùng nội dung của chúng, và ' +
        'phòng/lớp đã được gắn bằng khoá ngoại. Khôi phục từ bản dump chụp trước cutover (docs/runbooks/master-data-cutover.md, mục 1) và deploy ' +
        'lại tag pre-master-data-restore.',
    );
  }
}
```

- [ ] **Step 5: Gỡ giai đoạn chuyển tiếp (theo bảng ở Step 1)**

Làm lần lượt, mỗi nhóm một lần chạy kiểm:

1. Entity: `ClassEntity` (bỏ `name`, `semesterId`/`administrativeClassId` không-null), `EnrollmentEntity` (bỏ `studentName`), `ExamSessionEntity` (`roomId` không-null). Chạy `cd apps/api && pnpm exec tsc --noEmit` — mọi lỗi biên dịch là một chỗ cần sửa; **không** ép kiểu để dập lỗi.
2. SQL thô và service theo bảng Step 1 (đổi `COALESCE`, `LEFT JOIN` → `JOIN`, xoá nhánh chuyển tiếp).
3. `test/helpers/seed.ts`: gỡ `legacyName` (ở `seedClass` và `seedEnrollment`), `withoutRoom`, và kiểu `| null` của hai trường lớp; `seedEnrollment` chỉ còn nhánh ghi `student` (upsert) + `enrollment` không kèm `student_name`.
4. Xoá ca/nhánh test của hình dạng cũ và **xoá file** `test/master-data-backfill.e2e-spec.ts` (xem bảng).
5. Chạy lại lệnh kiểm kê ở Step 1: chỉ còn chỗ nói về bản chụp.

Chạy: `cd apps/api && pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm test` — sạch và xanh (guard `e2e-seed-hygiene` vẫn xanh: không có SQL thô mới).

- [ ] **Step 6: Dựng DB e2e local sạch rồi áp migration, chạy test trạng thái đích và toàn bộ e2e**

```powershell
# 1) Đưa DB e2e local về sạch (Task 4) — rác hình dạng cũ sẽ làm tiền điều kiện của migration dừng.
docker exec -i cine-postgres-1 psql -U examcollect_admin -d <database của .env.test> < ../../scripts/reset-dev-data.sql
# 2) Áp migration lên ĐÚNG DB e2e (không phải Supabase): đặt DATABASE_URL rõ rồi kiểm bằng psql trước/sau.
$env:DATABASE_URL = "<giá trị trong .env.test>"
cd apps/api; pnpm migration:run
docker exec -i cine-postgres-1 psql -U examcollect_admin -d <database của .env.test> -c "SELECT name FROM examcollect.migrations ORDER BY id DESC LIMIT 3"
# 3) Trạng thái đích, rồi TOÀN BỘ e2e (T-GR-1: mọi e2e chấm điểm hiện có xanh; T-RW-1/2: truy vấn SQL thô đọc đúng tên sau khi bỏ cột; T-GR-3: agent join + thi bù).
pnpm test:e2e -- --runInBand master-data-contract
pnpm test:e2e -- --runInBand
```

Expected: `migrations` có `ContractMasterDataEntities1789700000000` trên cùng; `master-data-contract` xanh (7 ca); toàn bộ e2e xanh, **số test mỗi suite khớp baseline** đã ghi ở plan A (một suite mất ca vì xoá nhầm là lỗi, không phải tiến bộ). Nếu migration dừng ở tiền điều kiện trên DB e2e, bước 1 chưa dọn hết — chạy lại script rồi migration.

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(api): migration thu hẹp master data (NOT NULL, khoá ngoại sinh viên, bỏ class.name/enrollment.student_name và ràng buộc phòng theo tên) + gỡ giai đoạn chuyển tiếp"
```

---

### Task 6: Runbook cutover, nghiệm thu và `CLAUDE.md` rev 6

**Files:**
- Create: `docs/runbooks/master-data-cutover.md`
- Modify (cục bộ, **không commit** — bị `.gitignore`): `CLAUDE.md` ở checkout chính

**Interfaces:** không.

- [ ] **Step 1: Viết runbook**

Create `docs/runbooks/master-data-cutover.md` với nội dung dưới đây (đã đối chiếu với spec §8.4–8.5, §11 và các công cụ ở Task 1–5). Giữ nguyên các lệnh; thay chỗ `<…>` bằng giá trị thật.

````markdown
# Cutover master data — diễn tập, chuyển đổi, nghiệm thu, đường lùi

> Spec: `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §8. Công cụ: `pnpm master-data` (`apps/api/src/database/master-data/`).
> **Quy tắc số một:** mọi lệnh ghi dùng `DATABASE_URL` truyền RÕ. `apps/api/.env` trỏ Supabase từ xa — để mặc định là ghi vào DB thật.
> Công cụ từ chối đích từ xa nếu thiếu `--confirm-host <đúng host>`; migration (`pnpm migration:run`) thì **không** có chốt đó, nên **luôn** kiểm host bằng `psql` trước và sau.

## 0. Điều kiện

- [ ] Mọi migration KHÁC đã áp trên Supabase (G1–G5 đã vào `main` và đã chạy — spec §8.6 khuyến nghị; kiểm: `SELECT name FROM examcollect.migrations ORDER BY id DESC LIMIT 5` không còn migration nào chờ ngoài hai migration của đợt này). Lý do: checksum điểm so trước/sau, mà migration của G1–G5 có thể thêm cột vào bảng điểm.
- [ ] PR1 (A–G) đã sẵn sàng deploy; PR2 (Task 5) đã review, chưa merge.
- [ ] Đã ghi số test baseline (unit + e2e) và `pnpm test:e2e -- --runInBand` xanh trên nhánh PR2.
- [ ] Có `pg_dump`/`pg_restore` đúng phiên bản (cùng hoặc mới hơn server). Cách không cần cài gì: chạy trong container `cine-postgres-1`.
- [ ] Chọn cửa sổ bảo trì (vài phút, giờ không có phiên thi nào đang diễn ra) và báo ba giảng viên.

## 1. Sao lưu — đường lùi DUY NHẤT

Bước thu hẹp **không đảo ngược được**; khôi phục bản dump là cách lùi duy nhất.

```powershell
$dump = "$HOME\examcollect-backups\pre-master-data-restore-$(Get-Date -Format yyyyMMdd-HHmm).dump"
New-Item -ItemType Directory -Force (Split-Path $dump) | Out-Null
# pg_dump chạy trong container local (có sẵn công cụ). Nếu báo "server version mismatch", dùng image postgres:<đúng phiên bản của Supabase>.
docker exec cine-postgres-1 pg_dump "$env:SUPABASE_DATABASE_URL" --format=custom --no-owner --no-privileges --schema=examcollect -f /tmp/pre-md.dump
docker cp cine-postgres-1:/tmp/pre-md.dump $dump
docker exec cine-postgres-1 pg_restore --list /tmp/pre-md.dump | Select-Object -First 5     # đọc được = dump hợp lệ
git tag pre-master-data-restore 4cb6bca ; git push origin pre-master-data-restore
```

Ghi lại đường dẫn dump và kích thước. **Không tiếp tục** nếu `pg_restore --list` lỗi.

## 2. Diễn tập trên bản sao (spec §8.5) — làm TRƯỚC, lặp tới khi sạch

2.1 **Dựng bản sao** trong Postgres local (không bao giờ trên Supabase):

```powershell
docker exec cine-postgres-1 psql -U examcollect_admin -d postgres -c "CREATE DATABASE examcollect_rehearsal"
# Extension nằm ngoài schema examcollect nên KHÔNG có trong dump. Kiểm trên Supabase: SELECT extname, extnamespace::regnamespace FROM pg_extension;
docker exec cine-postgres-1 psql -U examcollect_admin -d examcollect_rehearsal -c 'CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS btree_gist; CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'
docker exec cine-postgres-1 pg_restore -U examcollect_admin -d examcollect_rehearsal --no-owner --no-privileges /tmp/pre-md.dump
$env:REHEARSAL_URL = "postgresql://<user>:<mật khẩu>@localhost:<cổng>/examcollect_rehearsal"
```

2.2 **Đối soát lịch sử migration (spec §8.4 bước 0b)** — Supabase có 46 dòng trong `examcollect.migrations` dù repo có 48 file; `AddAiUsage` và `AddArchiveContentCheck` được áp ngoài đường TypeORM. Không đối soát thì `migration:run` **dừng ở `AddAiUsage` với lỗi "đã tồn tại"** và chặn mọi migration sau:

```sql
-- (a) 46 dòng, và hai tên thiếu:
SELECT count(*) FROM examcollect.migrations;
-- (b) Đối tượng của hai migration có thật — đọc hai file migration, so cột/kiểu/ràng buộc/chỉ mục với \d trong psql, rồi xác nhận:
SELECT to_regclass('examcollect.ai_usage') IS NOT NULL AS ai_usage,
       to_regclass('examcollect.required_deliverable_entry') IS NOT NULL AS entries,
       EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE n.nspname = 'examcollect' AND t.typname = 'archive_check_status') AS archive_enum;
-- (c) CHỈ khi cả ba là true và nội dung khớp — thêm hai dòng (tương đương --fake):
INSERT INTO examcollect.migrations (timestamp, name) VALUES
  (1789360000000, 'AddAiUsage1789360000000'),
  (1789400000000, 'AddArchiveContentCheck1789400000000');
```

Ghi lại **vì sao** hai migration được áp ngoài đường TypeORM (chạy tay trong SQL Editor?) để máy dev và Railway không lặp lại (spec §13 mục 8).

2.3 **Chụp bản "trước"** — SAU 2.2, TRƯỚC mọi migration của đợt này:

```powershell
cd apps/api
pnpm master-data snapshot --database-url $env:REHEARSAL_URL --out $env:TEMP\md-before.json
```

2.4 **Migration mở rộng** (chỉ thêm; code cũ vẫn chạy được):

```powershell
$env:DATABASE_URL = $env:REHEARSAL_URL
pnpm migration:run        # áp 1789600000000-ExpandMasterDataEntities (và migration khác nếu còn chờ)
```

2.5 **Backfill — thử khô rồi chạy thật.** Với dữ liệu thật (spec §8.1–8.3): học kỳ HK1 2026-2027; lớp "Hệ Quản Trị Dữ Liệu MongoDB" gộp vào `DHKTPM18ATT`; lớp `DHKTPM18CTT` không có phiên nào nên dùng kỳ mặc định (**giả định cần admin xác nhận**); phòng `TEST-KHONG-PHONG` ngừng hoạt động:

```powershell
pnpm master-data backfill --database-url $env:REHEARSAL_URL --dry-run `
  --default-semester 2026:1 --merge "Hệ Quản Trị Dữ Liệu MongoDB=DHKTPM18ATT" --inactive-room "TEST-KHONG-PHONG"
# đọc báo cáo; nếu có "Backfill DỪNG" thì xử lý từng điều được nêu (mã thoát 2), rồi chạy lại. Khi sạch, bỏ --dry-run:
pnpm master-data backfill --database-url $env:REHEARSAL_URL `
  --default-semester 2026:1 --merge "Hệ Quản Trị Dữ Liệu MongoDB=DHKTPM18ATT" --inactive-room "TEST-KHONG-PHONG"
```

Báo cáo phải có: `created` {semesters 1, administrativeClasses 2, rooms 4, students 54}, `merged[0].moved` {`exam_session.class_id` 5, `session_roster.home_class_id` 45, `submission.home_class_id` 45} và `enrollmentsRemoved` 9, `remaining` toàn 0 và `complete: true`. **Chạy lại** lệnh thật: mọi số `created`/`assigned` phải về 0 và `merged` rỗng (T-MIG-2).

2.6 **Đối chiếu (T-GR-2)** — số dòng đổi đúng thứ đã biết, điểm không đổi một byte:

```powershell
pnpm master-data verify --database-url $env:REHEARSAL_URL --before $env:TEMP\md-before.json `
  --expect class=-1 --expect enrollment=-9 --expect student=54 --expect semester=1 --expect room=4 --expect administrative_class=2
```

(Spec §8.5 mục 1 liệt kê `enrollment 63→54`, `student +54`, `semester +1`, `room +4`, `administrative_class +2`; còn `class 3→2` do gộp lớp MongoDB, nên có thêm `class=-1`.) Phải thoát 0, kèm `Chống trùng phòng theo room_id … blocked`. Bất kỳ dòng `LỖI` nào = **dừng**, không cutover.

2.7 **Thu hẹp** trên bản sao: checkout nhánh PR2, rồi `pnpm migration:run` (áp `1789700000000-ContractMasterDataEntities`), chạy lại `verify` với **cùng** `--expect` — phải vẫn đạt. Rồi trỏ API vào bản sao và đi qua màn chính bằng trình duyệt (mục 4.3). Lặp lại 2.1–2.7 từ bản dump mới nếu có gì sửa.

## 3. Cutover trên Supabase (cửa sổ bảo trì)

Trước mỗi bước ghi, in đích: `psql "$env:SUPABASE_DATABASE_URL" -c "SELECT current_database(), inet_server_addr()"`. Công cụ `master-data` đòi thêm `--confirm-host <host Supabase>` ở **mọi** lệnh.

| # | Việc | Dừng nếu |
|---|---|---|
| 3.0 | Báo giảng viên; không còn phiên đang chạy. | còn phiên `active`/`collecting` |
| 3.1 | Sao lưu lại (mục 1) ngay trước giờ G; tag đã có. | `pg_restore --list` lỗi |
| 3.2 | Đối soát lịch sử migration (2.2) trên Supabase. | đối tượng không khớp |
| 3.3 | `snapshot --out before.json` trên Supabase. | |
| 3.4 | `pnpm migration:run` với `DATABASE_URL` Supabase → áp migration **mở rộng**. Kiểm bằng `psql`: `migrations` có `ExpandMasterDataEntities1789600000000`. | lỗi migration |
| 3.5 | `backfill --dry-run` rồi `backfill` (cùng tuỳ chọn đã diễn tập). | `Backfill DỪNG` — xử lý, không ép |
| 3.6 | **Deploy PR1** (Railway + Vercel). Đăng nhập admin, mở danh sách lớp/phiên. | trang lỗi |
| 3.7 | **Chạy lại backfill** (bắt phiên tạo bởi code cũ trong khoảng chờ) → `complete: true`. | `remaining` khác 0 |
| 3.8 | **Merge và deploy PR2** (code không còn đọc cột cũ; chạy được trên schema chưa thu hẹp). Kiểm nhanh: tạo/sửa/huỷ một phiên thử, mở "Lớp của tôi". Máy dev nào trỏ Supabase phải chuyển sang nhánh mới. | trang lỗi |
| 3.9 | **Migration thu hẹp**: `pnpm migration:run` với `DATABASE_URL` Supabase. Tự dừng nếu còn dữ liệu cũ (đọc câu báo, chạy lại 3.7). | báo tiền điều kiện |
| 3.10 | `verify --before before.json --expect …` (cùng như 2.6) → **điều kiện báo xong**. | bất kỳ dòng `LỖI` |

Chạy migration thu hẹp **trước** khi deploy PR2 làm code PR1 hỏng ở từng câu truy vấn đọc `student_name` — đừng đảo thứ tự 3.8 và 3.9.

## 4. Nghiệm thu bằng chấm thật (spec §11)

4.1 Admin tạo phòng **"Phòng diễn tập"** (hoạt động) trên màn Phòng thi; ghi `roomId`. Không dùng lại `TEST-KHONG-PHONG` (đã ngừng).
4.2 Chạy diễn tập trên Railway với cùng kịch bản và cùng model như lượt trước (`pnpm rehearsal -- …`, CLI đã đổi sang `roomId`/`classId` ở plan D3), rồi **ghi bản ghi và bảng so sánh với lượt trước** vào lịch sử benchmark (`apps/api/eval/rehearsals/`). Điểm số lệch so với lượt trước = lỗi cần điều tra, không phải ghi chú.
4.3 Lượt duyệt bằng trình duyệt (Playwright MCP local: `docs/superpowers/tools/pw-mcp.mjs` trong repo CINE) trên bản sao hoặc Supabase sau cutover:
   - [ ] Admin: tạo học kỳ, phòng, mã lớp danh nghĩa, lớp (giao giảng viên); nhập file cho từng loại (dryRun trước); trang audit hiện các thao tác đó.
   - [ ] Giảng viên: "Lớp của tôi" chỉ đọc, bộ lọc năm học → học kỳ; chưa có lớp thì thấy "Chưa có lớp nào được giao cho bạn" và **không** có nút tạo lớp.
   - [ ] Giảng viên: tạo phiên (phòng chọn từ danh sách, học kỳ chỉ-xem); phiên của lớp kỳ cũ vẫn tạo được; sửa phòng/giờ trước giờ bắt đầu; "Sửa" bị chặn kèm lý do sau giờ bắt đầu; huỷ phiên chưa ai vào; huỷ phiên đã có người vào thấy câu 409 trong hộp thoại.
   - [ ] Danh sách Kỳ thi / Bài thu / Chấm điểm lọc theo năm học → học kỳ; lớp trùng nhãn giữa hai kỳ phân biệt được bằng học kỳ.
   - [ ] Agent: sinh viên lớp khác `NOT_ENROLLED` rồi xin phép được (T-GR-3).

## 5. Đường lùi

| Đang ở | Lùi bằng | Mất gì |
|---|---|---|
| Trước 3.4 | Không cần lùi. | — |
| Sau 3.4–3.7 (mở rộng + backfill, chưa thu hẹp) | **Khôi phục bản dump** rồi deploy lại tag `pre-master-data-restore`. Gộp lớp (xoá lớp MongoDB) và viết lại chuỗi học kỳ không đảo được bằng tay. | Dữ liệu phát sinh sau giờ dump |
| Sau 3.9 (đã thu hẹp) | Như trên — **duy nhất** cách. `down()` của migration thu hẹp ném lỗi có chủ ý. | Dữ liệu phát sinh sau giờ dump |

Khôi phục (thử trên bản sao trước, vì nó ghi đè): `pg_restore --clean --if-exists --no-owner --no-privileges -d "$env:SUPABASE_DATABASE_URL" <dump>`, rồi `git checkout pre-master-data-restore` và deploy lại Railway + Vercel. Ba giảng viên và một cửa sổ bảo trì ngắn làm mức mất dữ liệu này chấp nhận được (spec §12 mục 5).

## 6. Sau nghiệm thu

- [ ] Báo admin: **ngày học kỳ là số tạm** (01/09 → 31/01) — sửa trên màn Học kỳ; **kỳ của `DHKTPM18CTT` là giả định** (lớp không có phiên để suy) — xác nhận hoặc sửa.
- [ ] Lịch sử của `DHKTPM18ATT` giờ có các phiên chồng giờ do gộp lớp MongoDB (spec §12 mục 4) — nhìn thấy được, không hỏng ràng buộc nào.
- [ ] Công cụ MỘT LẦN: `master-data/backfill.*`, `semester-name.*` và script `master-data` đọc cột đã bỏ nên không chạy được trên schema đích. Xoá chúng ở một PR dọn dẹp riêng (giữ `verify.ts`/`cli-args.ts` nếu muốn dùng lại cho đợt sau).
- [ ] Cập nhật `CLAUDE.md` rev 6 (Task 6 Step 2 của plan H) và ghi kết quả cutover vào memory dự án.

## 7. Sự cố thường gặp

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| `migration:run` dừng ở `AddAiUsage`: "đã tồn tại" | Chưa làm 2.2/3.2 (đối soát lịch sử migration). |
| `backfill` thoát 2 với `[CLASS_CODE_UNMAPPABLE]` | Tên lớp không thành mã danh nghĩa: gộp bằng `--merge`, đổi tên lớp, hoặc gán tay. |
| `backfill` thoát 2 với `[CLASS_SEMESTER_UNKNOWN]` | Lớp không có phiên nào đọc ra học kỳ: `--default-semester YYYY:T` (một giả định) hoặc gán tay. |
| `backfill` báo `MERGE_STUDENT_NOT_IN_TARGET` | Lớp nguồn có sinh viên chưa ở lớp đích — gộp sẽ làm họ biến mất; thêm họ vào lớp đích trước. |
| `verify` báo `checksum … KHÁC` | Điểm bị đụng — **dừng cutover**, so với dump, điều tra trước khi làm gì tiếp. |
| `verify` báo bảng đổi ngoài mong đợi | Mức đổi của bảng đó chưa được khai bằng `--expect`, hoặc backfill làm điều không định làm — đọc `lines`. |
| Migration thu hẹp: "Còn N phiên thi chưa gắn phòng" | Phiên tạo bởi code cũ sau lần backfill trước — chạy lại 3.7 rồi 3.9. |
| Mọi lệnh từ chối: "KHÔNG phải máy local" | Đúng ý: thêm `--confirm-host <host>` **sau khi** đã kiểm đích. |
````

- [ ] **Step 2: Sửa `CLAUDE.md` thành rev 6 (làm tay, không commit)**

`CLAUDE.md` nằm ở checkout chính (`CINE/CLAUDE.md`), **bị `.gitignore`**; sửa tại chỗ. Làm đúng các thay đổi sau (spec §9); mỗi cái thay **nguyên một mục** bằng nội dung đã cho, giữ nguyên phần còn lại của file.

1. **Đầu mục "Academic Structure & Ownership Model":** đổi hai dòng `**Cập nhật:**` và `**Vai trò của mục này:**` thành:

```markdown
**Cập nhật:** <ngày cutover> (rev 6 — đợt khôi phục master data, spec `2026-10-04-master-data-restoration-design.md`)
**Vai trò của mục này:** nguồn sự thật về model dữ liệu, role và luồng nghiệp vụ cho tầng học vụ. Thay thế rev 5 (2026-09-20), vốn nói hệ thống "không quản lý dữ liệu nền" — **không còn đúng**.

> **Đọc §0 trước.** Rev 6 đảo lại một phần rev 5: học kỳ, phòng và lớp trở lại thành **thực thể có khoá ngoại do admin quản lý**. Môn học thì KHÔNG trở lại. Spec/plan viết trong khoảng 2026-09-20 → 2026-10-04 nói "không có bảng Semester/Room" đều đang mô tả một hệ thống đã không còn.
```

2. **§0** — thay **toàn bộ** từ dòng `### 0. Thay đổi lớn nhất: …` đến hết danh sách "Cái giá, đã chấp nhận có ý thức" bằng:

```markdown
### 0. Dữ liệu nền có phân tầng, do admin quản lý

> **Học kỳ, phòng thi và lớp là thực thể có khoá ngoại; admin khai và kiểm chứng, giảng viên chỉ CHỌN.**

Đợt thu hẹp 2026-09-20 (`ContractMasterData1789330000000`) bỏ `course`, `room`, `semester` để giải phóng rubric khỏi bảng `class`. Đợt khôi phục (cutover <ngày>) đưa ba thứ **trở lại** — nhưng cố ý **không** đưa `course` trở lại:

| Thực thể | Bảng | Ai quản lý | Ghi chú |
|---|---|---|---|
| Học kỳ | `semester` | admin | `(academic_year_start, term)` duy nhất, có `start_date`/`end_date`; **không có cờ "hiện tại"** |
| Phòng thi | `room` | admin | tên duy nhất (citext), `is_active`; phiên chỉ chọn được phòng đang hoạt động |
| Lớp danh nghĩa | `administrative_class` | admin | mã (`DHKTPM18A`) — Danh mục mà lớp học phần tham chiếu |
| Lớp (học phần) | `class` | admin | `(semester_id, administrative_class_id, group_name)` duy nhất; giao cho một giảng viên |
| Sinh viên | `student` | từ danh sách lớp | một MSSV một tên; `enrollment.student_mssv` có khoá ngoại tới đây |

Môn học vẫn là MỘT hằng số (CTDL&GT): `class.course_name` và `exam_session.course_name` là chữ server điền, không phải bảng. `exam_session.room_name`/`semester_name` là **bản chụp** lúc tạo phiên (bảng điểm, tên file `{PHONG}`), không đổi khi admin đổi tên phòng hay sửa ngày học kỳ.

**Vì sao đảo lại:** bỏ phòng và học kỳ làm chống trùng lịch phòng tụt xuống "nỗ lực tốt nhất" (so chuỗi), bộ lọc học kỳ phải dựng từ các dòng đã tải, và hai cách viết một học kỳ thành hai mục lọc. Xem spec §0.

**Cái giá, đã chấp nhận có ý thức** (spec §12): giảng viên không tự tạo lớp được — admin là điểm nghẽn; mã lớp danh nghĩa vẫn do con người đưa vào (cảnh báo "gần giống" giảm xác suất sai, không loại bỏ); một sinh viên chỉ có một tên; bước thu hẹp không đảo ngược được.
```

3. **§1.1** — thay bảng "Hai loại dữ liệu" và hai đoạn sau nó bằng:

```markdown
| Loại | Gồm | Vai trò của hệ thống |
|---|---|---|
| **Tham chiếu** | `Semester`, `Room`, `AdministrativeClass`, `Class`, `Student`, `Account`, `Enrollment` | Dữ liệu nền để tạo được phiên thi. Admin sở hữu; chỉ giữ những trường mà phiên thi thực sự tiêu thụ |
| **Sở hữu** | `ExamSession`, bài nộp, rubric, kết quả chấm, điểm bài thi, audit | **Nguồn sự thật duy nhất.** Không nơi nào khác biết những dữ liệu này |

Đường biên nằm ở `ExamSession`. Từ đó trở xuống là lõi của đồ án; phía trên chỉ là hạ tầng bắt buộc để lõi chạy được.

**Hệ quả cho việc ưu tiên:** khi cân nhắc làm gì trước, việc ở tầng sở hữu thắng việc ở tầng tham chiếu, trừ khi việc ở tầng tham chiếu đang chặn hệ thống chạy được.
```

4. **§1.2** — thay **toàn bộ** mục `#### 1.2 Học kỳ là một CHUỖI trên phiên thi` (đến trước `#### 1.3`) bằng:

```markdown
#### 1.2 Học kỳ là một THỰC THỂ — nhưng không bao giờ là một TRẠNG THÁI

Từng là một bảng, rồi suýt thành một trạng thái, rồi một chuỗi; nay lại là một bảng (`semester`).

- **Được phép:** học kỳ là khoá lọc (Năm học → Học kỳ, lọc bằng `semester_id`), là nhãn hiển thị (`HK1 2026-2027`), sống trong `WHERE`/`GROUP BY`.
- **Không được phép:** học kỳ là trạng thái. Không có `is_current`, không có API set-current, không có luật "chỉ thao tác được trong kỳ hiện hành".

**Bài test:** hệ thống có bao giờ *từ chối* một thao tác vì lý do liên quan tới học kỳ không? Câu trả lời đúng là **không bao giờ** — ngoại lệ duy nhất là ràng buộc toàn vẹn dữ liệu (không đổi kỳ của lớp đã có phiên; không đổi năm/kỳ của học kỳ đã có lớp), không phải luật nghiệp vụ theo ngày. Ngay khi học kỳ xuất hiện trong một câu `if` để chặn hành động, nó đã đổi vai và cần bị chặn ở review.

**Học kỳ có ngày nhưng không có cờ.** `start_date`/`end_date` để admin quản lý và để tránh hai học kỳ chồng ngày; chúng KHÔNG dùng để suy "kỳ hiện tại". Mọi màn hình mở ra ở **Tất cả học kỳ** (một bộ lọc mặc định đã từng che mất bài chưa chấm của kỳ cũ).

> **Lịch sử, giữ lại để không lặp:** bản trước từng xây `is_current` + banner toàn cục + bộ lọc kỳ hiện hành, phình thành 13 commit, và **đã được revert có chủ đích ngày 2026-09-10**. Rev 6 đưa học kỳ trở lại như thực thể **không có** chỗ để nó thành trạng thái.
```

5. **§1.3** — thay đoạn "Từ chối mặc định …" và đoạn "Và một phép thử mới, mạnh hơn" bằng:

```markdown
Từ chối mặc định mọi thứ có dáng dấp SIS: **catalog môn học**, phê duyệt, `is_current`, lịch học hàng tuần, số tín chỉ, tiên quyết. Học kỳ, phòng và lớp danh nghĩa được chấp nhận **vì phiên thi và bộ lọc tiêu thụ chúng**, không vì "trường có chúng".

Cách kiểm tra một trường dữ liệu có được vào schema không: **phiên thi, bài nộp, hay điểm tiêu thụ nó ở đâu?** Không trả lời được thì không thêm.

**Phép thử cho dữ liệu nền:** admin có khai được và kiểm chứng được nó không? Nếu là thứ chỉ trường biết mà admin không có nguồn để kiểm (môn học, tín chỉ), hệ thống không giữ nó.
```

6. **§2** — thay bảng "Hai role" bằng:

```markdown
| Role | Sở hữu gì | Không được |
|---|---|---|
| `admin` | Tài khoản (cả hai role); **học kỳ, phòng thi, lớp (tạo/sửa/xoá và giao giảng viên), Danh mục lớp danh nghĩa**; cấu hình AI, chi phí; **đọc được `audit_log`** | Không tạo phiên thi, không xem bài nộp, không chấm, không sửa điểm |
| `teacher` | Roster của lớp được giao; rubric của mình; phiên thi của lớp mình dạy (tạo, **sửa và huỷ trước giờ bắt đầu**); chấm điểm; export | Không tạo/sửa/xoá lớp; không đụng lớp/rubric/phiên của giảng viên khác; không tạo tài khoản |
```

Và thêm ngay sau đoạn "Sinh viên **không có** dòng nào trong `account`…" một mục:

```markdown
**Luật quản lý phiên.** Sửa phiên (tên, phòng, giờ, loại kỳ thi) và huỷ phiên chỉ khi `status = 'active'` **và** `now < start_time` (huỷ thêm điều kiện: chưa ai vào phòng và chưa có bài `collected`). `cancelled` là trạng thái **có người ghi** từ nay (không còn là giá trị chết) và không khôi phục được. Lý do chặn sau giờ bắt đầu: tên phòng được dựng vào tên file ở hai thời điểm (lúc vào phòng và lúc nộp), nên đổi phòng giữa chừng làm sinh viên đã vào bị kiểm file nén lệch oan.
```

7. **§3.1** — thay sơ đồ quan hệ bằng:

```
Account (role='admin')  ──quản lý──> Semester, Room, AdministrativeClass, Class
Account (role='teacher')
   │
   └──(được giao)──> Class ──1:n──> Enrollment ──n:1──> Student (mssv, full_name)
         │  (semester_id, administrative_class_id, group_name; course_name: text)
         │
         └──1:n──> ExamSession ──1:n──> SessionRoster   ← ai được ngồi (ảnh chụp tên)
                     (room_id → Room; room_name, semester_name, course_name: bản chụp)

Account (teacher) ──1:n──> Rubric ──1:n──> Tiêu chí
                      (teacher_id, name, version — unique cả ba)

ExamSession ──1:n──> Bài nộp ──1:n──> Kết quả chấm ──1:1──> Điểm bài thi
ExamSession ──n:1──> Rubric   (ghim lúc TẠO phiên, không tra lại lúc chấm)
```

8. **§3.2** — thay các dòng `Class`, `Enrollment` của ma trận sở hữu và dòng "**Không còn `semester_id` ở đâu cả.** …" bằng:

```markdown
| `Semester` | `admin` | `unique(academic_year_start, term)`; không chồng ngày; không đổi năm/kỳ khi đã có lớp |
| `Room` | `admin` | tên duy nhất; `is_active`; không xoá khi đã có phiên |
| `AdministrativeClass` | `admin` | mã HOA, 3–30 ký tự; không xoá khi còn lớp dùng |
| `Class` | `admin` (giao cho `teacher_id`) | `unique(semester_id, administrative_class_id, group_name)`; không đổi `semester_id` khi đã có phiên. Nhãn gộp đọc từ view `class_label` |
| `Student` | — (ghi từ danh sách lớp) | `unique(mssv)`; một MSSV một tên (file thắng, kết quả import liệt kê ai bị đổi tên) |
| `Enrollment` | — (vay qua `home_class_id`) | `unique(home_class_id, student_mssv)`; `student_mssv` → `student.mssv` |
```

và thay dòng `**Không còn \`semester_id\` ở đâu cả.** …` ngay sau bảng bằng:

```markdown
**Học kỳ của một phiên là học kỳ của lớp.** Phiên chụp nhãn kỳ (`semester_name`) và nhãn phòng (`room_name`) một lần lúc tạo; lọc theo học kỳ dùng khoá (`class.semester_id`), không dùng chữ chụp.
```

9. **§6 "Cố ý KHÔNG có"** — thay dòng đầu (`Catalog môn học, phòng máy, học kỳ như những bảng …`) bằng dòng dưới; **giữ nguyên** dòng về `is_current` (vẫn cấm) và dòng về tầng khoa; **xoá** dòng "Import lớp hàng loạt từ Excel (`POST /classes/import`)…" vì nay có import do admin cho học kỳ, phòng, Danh mục lớp danh nghĩa và lớp:

```markdown
- Catalog **môn học** như một bảng — môn học là một hằng số (CTDL&GT). Học kỳ, phòng và lớp danh nghĩa là bảng (xem §0).
```

10. **Phần "Database Schema":** thay đoạn comment `-- SUPERSEDED by "## Academic Structure & Ownership Model" … Real today: …` (từ `-- ============ Academic structure ============` đến hết `home_class_id, home_teacher_id).`) bằng:

```sql
-- ============ Academic structure ============
-- Nguồn sự thật: mục "Academic Structure & Ownership Model" ở trên (rev 6). Thực tế hôm nay:
--   Semester(id, academic_year_start, term, start_date, end_date)
--   Room(id, name citext, capacity, is_active)
--   AdministrativeClass(id, code citext)
--   Class(id, semester_id, administrative_class_id, group_name, teacher_id, course_name)   -- nhãn: view class_label
--   Student(id, mssv citext, full_name)
--   Enrollment(id, student_mssv → Student.mssv, home_class_id, home_teacher_id)
-- `Course`, `ClassRoster`, `TeacherAccount` KHÔNG tồn tại (Course bị bỏ 2026-09-20 và cố ý không trở lại).
```

11. **"Monorepo Structure"** (cây thư mục): nếu có dòng mô tả module `course/`, đổi thành `course/   # lớp + học kỳ + phòng + lớp danh nghĩa + sinh viên` (cây hiện chỉ liệt kê `apps/`, `packages/`; thêm một dòng ghi chú dưới cây: `Module \`apps/api/src/course/\` chứa lớp, học kỳ, phòng, lớp danh nghĩa và sinh viên.`).

12. Kiểm: `Select-String CLAUDE.md -Pattern 'không quản lý dữ liệu nền|Semester.*DROPPED|ba bảng biến mất|Không còn .semester_id'` không còn dòng nào mô tả hệ thống cũ như hiện hành (các dòng "Lịch sử" được giữ có chủ ý).

- [ ] **Step 3: Commit runbook**

```bash
git add docs/runbooks/master-data-cutover.md
git commit -m "docs(runbook): cutover master data — diễn tập trên bản sao, trình tự expand→backfill→contract, nghiệm thu bằng chấm thật, đường lùi"
```

---

## Tự kiểm lại plan so với spec

- **§8.1–8.2 (dữ liệu thật, ánh xạ):** học kỳ từ `semester_name` (hai cách viết gộp thành một kỳ), ngày tạm, phòng (kể cả phòng TEST ngừng hoạt động), lớp danh nghĩa, lớp → kỳ (suy từ phiên, mặc định cho lớp không có phiên — **giả định cần admin xác nhận**, nêu ở runbook mục 6), sinh viên, giữ phiên test, viết lại chuỗi học kỳ và giữ nguyên chuỗi TEST: Task 1 (`planBackfill`, test thuần với dữ liệu thật thu nhỏ), Task 2 (áp dụng, e2e). "Migration không đoán, không ánh xạ được thì dừng": `BackfillBlockedError` kèm danh sách, DB nguyên vẹn (T-MIG-1).
- **§8.3 (gộp lớp MongoDB):** `--merge`, kiểm cùng giảng viên và **mọi MSSV nguồn đã ở đích**, ghi lại `exam_session.class_id`, `session_roster.home_class_id`, `submission.home_class_id` và mọi khoá ngoại khác tìm từ catalog, xoá enrollment trùng và lớp nguồn, báo số dòng từng bảng (45 + 45 + 9 là mức thật; e2e dùng 2 + 2 + 2 thu nhỏ — T-MIG-3); khoá ngoại `RESTRICT` là chốt cuối. Điểm "đã kiểm không trigger nào chặn ghi lại `home_class_id`": diễn tập trên bản sao vẫn là bằng chứng cuối (runbook 2.5).
- **§8.4 (expand → backfill → contract), kể cả bước 0b:** runbook mục 1–3; đối soát lịch sử migration có lệnh SQL cụ thể và tên lớp migration đã kiểm với repo; migration thu hẹp `1789700000000` dừng khi còn dữ liệu cũ (T-MIG-4), `NOT NULL`, khoá ngoại sinh viên, bỏ ràng buộc phòng theo tên, bỏ `class.name`/`enrollment.student_name`, dựng lại view; `down()` ném lỗi trỏ tới dump (Task 5). Thứ tự deploy **code trước, migration sau** để không có khoảng hỏng — đây là điều spec chưa nói rõ (nó chỉ nói "bảo trì vài phút").
- **§8.5 (diễn tập):** `snapshot`/`verify` so số dòng mọi bảng với mức đổi mong đợi và checksum `grading_result`, `score_computation` (T-GR-2), kiểm bất biến, và chứng minh chống trùng phòng theo `room_id` trong một transaction luôn lùi (Task 3, runbook 2.3–2.7). Cùng script chạy lại trên Supabase ở bước 3.10 như điều kiện báo xong.
- **§8.6 (quan hệ với G1–G5):** runbook mục 0 đặt "mọi migration khác đã áp" làm điều kiện (để checksum điểm so được); khuyến nghị chờ G1–G5 giữ nguyên.
- **§9 (`CLAUDE.md`):** Task 6 Step 2 liệt kê từng mục sửa (§0, §1.1, §1.2, §1.3, §2 + luật quản lý phiên, §3.1, §3.2, §6, đoạn schema, cây thư mục). **`CLAUDE.md` bị `.gitignore`**: việc làm tay ở checkout chính, không có commit — nêu để user biết nó không nằm trong PR. Ghi chú đầu `2026-09-20-master-data-scope-cut-design.md` đã có từ trước.
- **§10 bước 4–6:** Task 1–3 (backfill + diễn tập), runbook (cutover, nghiệm thu), Task 6 (`CLAUDE.md`). **§11:** T-MIG-1 (Task 1, 2), T-MIG-2 (Task 2), T-MIG-3 (Task 2), T-MIG-4 (Task 1, 5), T-GR-1 (Task 5 Step 6: toàn bộ e2e xanh, số test khớp baseline), T-GR-2 (Task 3 + runbook), T-GR-3 (runbook 4.3), T-RW-1/T-RW-2 (chạy lại trong Task 5 Step 6 trên schema đã bỏ cột). "Nghiệm thu bằng chấm thật" (CLI diễn tập đã đổi sang `roomId` ở plan D3; "Phòng diễn tập" hoạt động riêng): runbook mục 4.
- **§13 mục 8 (lịch sử migration lệch DB):** runbook 2.2 có chỗ ghi lại nguyên nhân hai migration được áp ngoài TypeORM.
- **Quyết định mới không có trong spec, nêu để user duyệt:** (a) **thứ tự deploy code PR2 trước, migration thu hẹp sau** (code PR2 không đọc cột cũ); (b) backfill có **`LOCK TABLE … SHARE ROW EXCLUSIVE`** vài giây trên `class`, `exam_session`, `enrollment` — cố ý chặn ghi trong lúc chạy; (c) **CLI từ chối đích không phải local nếu thiếu `--confirm-host`** (migration vẫn không có chốt đó — `migration:run` đọc `.env`; runbook bắt kiểm host bằng `psql`); (d) `verify` cần thêm `--expect class=-1` so với danh sách trong spec §8.5 (gộp lớp MongoDB làm `class` 3→2); (e) chuỗi học kỳ trên phiên được **viết lại về dạng chuẩn** `HK1 2026-2027` chỉ khi đọc được (đúng spec), chuỗi TEST giữ nguyên; (f) **công cụ backfill là công cụ một lần**, xoá ở PR dọn dẹp sau nghiệm thu; (g) `scripts/reset-dev-data.sql` viết lại dùng `TRUNCATE … CASCADE` từ các bảng gốc (bản cũ liệt kê tay và đã lỗi thời từ 20/09) — chỉ dùng cho DB dev, đã kiểm trên DB dùng một lần; (h) DB e2e local **phải reset trước khi áp migration thu hẹp** (rác hình dạng cũ của các suite e2e làm tiền điều kiện dừng).
- **Không làm ở plan này:** kênh "yêu cầu admin" (spec §1.2, để sau); tách bảng audit hay thêm chỉ mục `audit_log` (spec §13 mục 11); đổi kiểu `semesterId: string | null` ở web sang không-null (vô hại, để nguyên); gỡ `master-data/backfill.*` (sau nghiệm thu, một PR riêng).
