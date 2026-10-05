# Plan G1 — Nền web: client, lớp API/hook cho dữ liệu nền, bộ lọc Năm học → Học kỳ, mô tả audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng phần **nền** mà ba plan web sau (G2 trang admin, G3 màn hình giảng viên, G4 form phiên thi) cùng dùng: (1) sinh lại client OpenAPI **một lần** cho toàn bộ API của plan A–F, (2) lớp `lib/api` + hook TanStack cho học kỳ, phòng, Danh mục lớp danh nghĩa, lớp (admin), giảng viên, tra sinh viên, (3) **một** bộ lọc Năm học → Học kỳ lọc bằng **khoá** thay cho ba bản lọc chuỗi hiện có, (4) câu tiếng Việt cho mọi hành động audit mới, (5) khung cảnh báo "gần giống" khi nhập tay.

**Architecture:** Chỉ **thêm** file (không sửa trang hiện có), nên plan này tự đứng được và `vitest` của mọi trang cũ vẫn xanh. Phần thuần (chọn năm/kỳ, so khớp một dòng với lựa chọn, tham số truy vấn) tách khỏi hook và component để test đầy đủ không cần DOM. Hook đọc dùng khoá truy vấn từ `hooks/master-data-keys.ts` (plan E2) để làm mới sau import và sau mọi lần ghi. Cảnh báo "gần giống" là một lớp lỗi riêng (`NearDuplicateError`) mà trang bắt được để hiện lời nhắc và gửi lại với `confirmSimilar: true`.

**Tech Stack:** Next.js 15, React 19, TanStack Query 5, openapi-fetch (client sinh), Radix Select (shadcn), vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §5.3 (sinh lại client), §7 (bộ lọc năm học + học kỳ: §7.1 hiện trạng, §7.2 thiết kế, §7.3 không bao giờ chặn thao tác), §6.2 nguyên tắc 4 và §2.2 (cảnh báo gần giống khi nhập tay), §4.2 (câu tiếng Việt cho từng hành động, quy ước `targetLabel`), §2.6 (tra tên theo MSSV), §11: T-FLT-1, T-FLT-2, T-AUD-5.

**Phụ thuộc:** plan A–F (toàn bộ API) đã xong; plan B (`lib/audit-describe.ts`, trang audit) đã xong; plan E2 (`hooks/master-data-keys.ts`, `ImportDialog`).

## Global Constraints

- **Sinh lại `packages/shared/src/api/schema.d.ts` đúng MỘT lần, ở Task 1 của plan này**, sau khi API của plan A–F đã xong và đã build (cách làm: plan B Task 3). Từ bước đó cho tới hết **plan G4**, `apps/web` **không qua `tsc`/`next build`** ở một danh sách file đã biết — đây là hệ quả của việc **đổi hợp đồng** (`POST /exam-sessions` đổi `roomName`/`semesterName` → `roomId`; `GET /exam-sessions` và `/submissions/overview` đổi `className` → `classLabel`; `/classes` đổi quyền và hình dạng) và là lý do cả đợt đi trong **một PR**. `vitest` **không** kiểm kiểu nên vẫn xanh suốt. Danh sách file đỏ được ghi vào `docs/superpowers/plans/md-restore-web-tsc-red.txt` ở Task 1; mỗi plan G xoá các mục nó sửa; **G4 kết thúc với danh sách rỗng và `tsc`/`build` sạch**.
- **Pages và component gọi HOOK, không gọi `lib/api` trực tiếp** (CLAUDE.md, quy tắc phân lớp gọi API): `lib/api/*.ts` → `hooks/*.ts` → trang. Mọi hàm `lib/api` mới của plan này dùng chung `throwIfFailed` ở `lib/api/http-error.ts` để câu báo lỗi **của server** (409 nêu mục nào gây lỗi) tới được người dùng nguyên văn.
- **Khoá truy vấn lấy từ `MASTER_DATA_KEYS`** (plan E2), không gõ chuỗi tay: lớp là gốc `['classes', …]` (`['classes','teaching',…]` đã có từ trước, `['classes','admin',…]` mới). Ghi một **học kỳ** hoặc một **mã lớp danh nghĩa** làm mới cả danh sách lớp (nhãn lớp hiện học kỳ và mã); ghi một **phòng** làm mới phòng.
- **Bộ lọc năm học → học kỳ** (spec §7.2): lựa chọn lấy từ **bảng `semester`** (`GET /semesters`), **không** dựng từ dữ liệu đã tải; **mặc định "Tất cả"**; chọn năm học không chọn kỳ = cả ba kỳ; đổi năm học thì ô kỳ về "tất cả" nếu kỳ đang chọn không thuộc năm mới; chọn thẳng một kỳ thì năm học đi theo; lọc bằng **khoá** (`semesterId` hoặc `academicYear`), trang đã tải sẵn lọc trong trình duyệt bằng `semesterId`/`academicYear` trên từng dòng; mỗi màn hình giữ bộ lọc **riêng** và trở về mặc định khi chuyển màn hình (quyết định hiện tại). Bộ lọc **chỉ hẹp tầm nhìn, không bao giờ chặn thao tác** (CLAUDE.md §1.2; spec §7.3).
- **Một lựa chọn bị mồ côi** (học kỳ vừa bị admin xoá) tự về "Tất cả": không bao giờ để một bộ lọc trỏ vào thứ không còn và cho ra danh sách rỗng khó hiểu.
- **Cảnh báo "gần giống" khi nhập tay** (spec §2.2, §6.2 nguyên tắc 4): server trả `409 { error: 'NEAR_DUPLICATE', similar }`; web hiện **lời nhắc nêu từng mục gần giống** và một nút "Vẫn thêm" gửi lại với `confirmSimilar: true`. Đây là lời nhắc, không phải lệnh cấm; trùng **cứng** (409 thường) hiện nguyên văn câu của server.
- **Mô tả audit** (spec §4.2): mỗi hành động mới có **một** mục trong `DESCRIBERS` kèm test; quy ước `targetLabel` của plan B; câu tiếng Việt **không** chứa tên người thực hiện (cột "Người thực hiện" của trang audit đã có); không in nội dung riêng tư. Ngày hiện `dd/mm/yyyy`, thời điểm hiện `dd/mm/yyyy HH:mm` theo múi giờ Việt Nam (không theo máy người xem — một dòng audit đọc ở hai nơi phải cho cùng một giờ).
- Không đổi hành vi hay giao diện của trang nào hiện có; `useSemesterFilter`/`SemesterFilter` (theo chuỗi) **ở lại** tới plan G3 thay hết nơi dùng.

## Review Focus

1. **Bộ lọc cho ra danh sách rỗng khó hiểu** vì một lựa chọn trỏ vào học kỳ đã xoá, hoặc kỳ không thuộc năm đang chọn. → `reconcileSelection` và `selectYear` có test; hook tự dọn khi danh sách học kỳ đổi (Task 5).
2. **Bộ lọc giấu mất việc tồn đọng của kỳ cũ** (lý do mặc định phải là "Tất cả": bản 10/09 từng phải thêm riêng "nhắc việc tồn đọng"). → mặc định `ALL_SEMESTERS` ở mọi màn hình; test khẳng định trạng thái đầu và khi chuyển màn hình (Task 5).
3. **Dòng của lớp chưa có học kỳ (dữ liệu cũ) lọt qua hoặc nổ khi lọc.** → `matchesSemester` coi `null` là **không khớp** khi có lọc, và khớp khi không lọc (Task 4).
4. **Danh sách làm mới thiếu sau khi ghi** (đổi mã lớp danh nghĩa mà trang Lớp còn nhãn cũ). → mỗi mutation làm mới đúng các khoá bị ảnh hưởng, ghim bằng test (Task 3).
5. **Lời của server bị nuốt** — admin thấy "Yêu cầu thất bại" mà không biết vì sao xoá phòng không được. → `throwIfFailed` mang `message` của server (cả dạng mảng của `ValidationPipe`); test (Task 2).
6. **Cảnh báo gần giống bị nhầm với trùng cứng** (hai loại 409). → chỉ `error === 'NEAR_DUPLICATE'` mới thành `NearDuplicateError`; 409 khác là lỗi thường; test (Task 2).
7. **Câu audit nói sai** (ngày lệch múi giờ, tên trường tiếng Anh, `[object Object]`). → test từng hành động với giá trị thật; thời điểm cố định theo `Asia/Ho_Chi_Minh` (Task 6).

---

## File Structure

| File | Việc |
|---|---|
| `packages/shared/src/api/schema.d.ts` | Sinh lại (Task 1). |
| `docs/superpowers/plans/md-restore-web-tsc-red.txt` | **Mới.** Danh sách file `tsc` đỏ có chủ ý, giảm dần qua G1→G4. |
| `apps/web/src/lib/api/http-error.ts` (+ test) | **Mới.** `throwIfFailed`, `NearDuplicateError`. |
| `apps/web/src/lib/api/{semesters,rooms,administrative-classes,admin-classes,students}.ts` (+ test) | **Mới.** |
| `apps/web/src/lib/api/accounts.ts` | Thêm `listTeacherOptions`. |
| `apps/web/src/hooks/{useSemesters,useRooms,useAdministrativeClasses,useAdminClasses,useTeacherOptions,useStudentLookup}.ts` (+ test) | **Mới.** |
| `apps/web/src/lib/semester-filter.ts` (+ test) | **Mới.** Phần thuần của bộ lọc. |
| `apps/web/src/hooks/useSemesterYearFilter.ts` (+ test) | **Mới.** Trạng thái bộ lọc. |
| `apps/web/src/components/layout/semester-year-filter.tsx` (+ test) | **Mới.** Hai ô liên kết. |
| `apps/web/src/components/resource/near-duplicate-notice.tsx` (+ test) | **Mới.** Lời nhắc "gần giống". |
| `apps/web/src/lib/audit-describe.ts` (+ test) | Thêm mục cho mọi hành động mới. |

---

### Task 1: Sinh lại client một lần và ghi danh sách `tsc` đỏ có chủ ý

**Files:**
- Modify: `packages/shared/src/api/schema.d.ts`
- Create: `docs/superpowers/plans/md-restore-web-tsc-red.txt`

**Interfaces:** không có.

- [ ] **Step 1: Dừng mọi tiến trình thừa rồi build API**

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'jest|nest|dist/src/main' } | Select-Object ProcessId, CommandLine
cd apps/api
pnpm build
```

Expected: build sạch; không còn tiến trình `jest`/`nest` mồ côi (xem memory "stale jest processes").

- [ ] **Step 2: Chạy API với DB test và sinh client**

Làm đúng Task 3 của plan B (chạy `DOTENV_CONFIG_PATH=.env.test node -r dotenv/config dist/src/main.js` nền, rồi `API_URL=http://localhost:4000/api-docs-json pnpm --filter @cine/shared generate:api-client`, rồi tắt **đúng** tiến trình đã mở bằng PID của nó). Docker `cine-postgres-1`/`cine-redis-1`/`cine-minio-1` phải đang chạy và migration mở rộng `1789600000000` đã áp vào DB test.

- [ ] **Step 3: Kiểm diff**

```bash
git diff --stat packages/shared/src/api/schema.d.ts
git diff packages/shared/src/api/schema.d.ts | grep -E '^\+\s+"/(semesters|rooms|administrative-classes|students|audit-log|classes)' | head -20
git diff packages/shared/src/api/schema.d.ts | grep -E '^[-+].*(roomName|roomId|classLabel|semesterNames)' | head -20
```

Expected: có đường dẫn `/semesters`, `/rooms`, `/administrative-classes`, `/students/{mssv}`, `/classes` (+ `/classes/import`), `/exam-sessions/{id}` (PATCH) và `/exam-sessions/{id}/cancel`, bốn `…/import`; `CreateExamSessionDto` mất `roomName`/`semesterName`, có `roomId`. **Nếu diff có hunk không liên quan tới các route trên** (đổi thứ tự khoá, cột không do chuỗi plan này), dừng và tách commit riêng như plan B.

- [ ] **Step 4: Ghi danh sách `tsc` đỏ**

```powershell
cd apps/web
pnpm exec tsc --noEmit 2>&1 | Select-String -Pattern '^src/' | ForEach-Object { ($_ -split '\(')[0] } | Sort-Object -Unique | Out-File -Encoding utf8 ../../docs/superpowers/plans/md-restore-web-tsc-red.txt
Get-Content ../../docs/superpowers/plans/md-restore-web-tsc-red.txt
```

Expected: danh sách **không rỗng** và chỉ gồm file thuộc các vùng sẽ được sửa ở G2–G4 (dự kiến: `lib/api/exam-session.ts`, `lib/api/teaching.ts`, `hooks/useTeaching.ts`, `app/teacher/classes/**`, `app/teacher/exam-sessions/**`, `app/teacher/submissions/**`, `app/teacher/grading/**`, `app/teacher/exam-authoring/**`, `app/(exam-live)/**/AccessRequestPanel.tsx`, `lib/session-list*.ts`, `lib/submission-*.ts`). **Nếu có file ngoài các vùng đó** (vd một trang admin cũ), đó là lỗi bất ngờ: tìm nguyên nhân trước khi đi tiếp, đừng ghi nó vào danh sách.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/api/schema.d.ts docs/superpowers/plans/md-restore-web-tsc-red.txt
git commit -m "chore(shared): sinh lại client OpenAPI một lần cho toàn bộ API dữ liệu nền; ghi danh sách tsc đỏ có chủ ý của web"
```

---

### Task 2: `throwIfFailed`, `NearDuplicateError` và các hàm `lib/api`

**Files:**
- Create: `apps/web/src/lib/api/http-error.ts`, `semesters.ts`, `rooms.ts`, `administrative-classes.ts`, `admin-classes.ts`, `students.ts`
- Modify: `apps/web/src/lib/api/accounts.ts`
- Test: `apps/web/src/lib/api/http-error.test.ts`, `master-data-api.test.ts`

**Interfaces:**
- Consumes: `apiClient`; các route của plan C, D1, D2.
- Produces:

```ts
// http-error.ts
export class NearDuplicateError extends Error { similar: Array<{ id: string; name: string }> }
export function throwIfFailed(error: unknown, response: { ok: boolean; status: number }): Promise<void>;
// semesters.ts
export interface Semester { id: string; academicYearStart: number; term: number; label: string; startDate: string; endDate: string; classCount?: number }
export interface SemesterInput { academicYearStart: number; term: number; startDate: string; endDate: string }
export function listSemesters(): Promise<Semester[]>;
export function createSemester(body: SemesterInput): Promise<Semester>;
export function updateSemester(id: string, body: Partial<SemesterInput>): Promise<Semester>;
export function deleteSemester(id: string): Promise<void>;
// rooms.ts
export interface Room { id: string; name: string; capacity: number | null; isActive: boolean; sessionCount?: number }
export interface RoomInput { name: string; capacity?: number; confirmSimilar?: boolean }
export interface RoomUpdate { name?: string; capacity?: number | null; isActive?: boolean; confirmSimilar?: boolean }
export function listRooms(options?: { activeOnly?: boolean }): Promise<Room[]>;
export function createRoom(body: RoomInput): Promise<Room>;
export function updateRoom(id: string, body: RoomUpdate): Promise<Room>;
export function deleteRoom(id: string): Promise<void>;
// administrative-classes.ts
export interface AdministrativeClass { id: string; code: string; classCount: number }
export interface AdministrativeClassInput { code: string; confirmSimilar?: boolean }
export function listAdministrativeClasses(): Promise<AdministrativeClass[]>;
export function createAdministrativeClass(body: AdministrativeClassInput): Promise<AdministrativeClass>;
export function updateAdministrativeClass(id: string, body: Partial<AdministrativeClassInput>): Promise<AdministrativeClass>;
export function deleteAdministrativeClass(id: string): Promise<void>;
// admin-classes.ts
export interface AdminClass { id: string; label: string; labelWithSemester: string; semesterId: string | null; academicYear: number | null; term: number | null; administrativeClassId: string | null; administrativeClassCode: string | null; groupName: string; teacherId: string; teacherName: string; studentCount: number; sessionCount: number }
export interface AdminClassFilters { semesterId?: string; academicYear?: number; teacherId?: string; q?: string }
export interface AdminClassInput { semesterId: string; administrativeClassId: string; groupName?: string; teacherId: string }
export function listAdminClasses(filters?: AdminClassFilters): Promise<AdminClass[]>;
export function createAdminClass(body: AdminClassInput): Promise<AdminClass>;
export function updateAdminClass(id: string, body: Partial<AdminClassInput>): Promise<AdminClass>;
export function deleteAdminClass(id: string): Promise<void>;
// accounts.ts (thêm)
export interface TeacherOption { id: string; name: string }
export function listTeacherOptions(): Promise<TeacherOption[]>;
// students.ts
export interface StudentLookup { mssv: string; fullName: string }
export function lookupStudent(mssv: string): Promise<StudentLookup | null>;   // 404 -> null
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/lib/api/http-error.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NearDuplicateError, throwIfFailed } from './http-error';

const ok = { ok: true, status: 200 };
const failed = (status: number) => ({ ok: false, status });

describe('throwIfFailed', () => {
  it('không ném khi thành công', async () => {
    await expect(throwIfFailed(undefined, ok)).resolves.toBeUndefined();
  });

  it('ném Error mang chữ của SERVER (Review Focus 5)', async () => {
    await expect(
      throwIfFailed({ message: 'Phòng "H3.03" đã có 4 phiên thi nên không xoá được.' }, failed(409)),
    ).rejects.toThrow('Phòng "H3.03" đã có 4 phiên thi nên không xoá được.');
  });

  it('message dạng mảng của ValidationPipe được nối', async () => {
    await expect(
      throwIfFailed({ message: ['name must be a string', 'capacity must not be greater than 1000'] }, failed(400)),
    ).rejects.toThrow('name must be a string; capacity must not be greater than 1000');
  });

  it('không có thân: câu mặc định nêu mã HTTP', async () => {
    await expect(throwIfFailed(undefined, failed(502))).rejects.toThrow('Yêu cầu thất bại (HTTP 502)');
  });

  it('409 NEAR_DUPLICATE thành NearDuplicateError mang danh sách mục gần giống', async () => {
    const similar = [{ id: 'r1', name: 'Phòng H3.03' }];
    const error = await throwIfFailed(
      { error: 'NEAR_DUPLICATE', message: 'Phòng "H303" gần giống "Phòng H3.03".', similar },
      failed(409),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NearDuplicateError);
    expect(error).toMatchObject({ message: 'Phòng "H303" gần giống "Phòng H3.03".', similar });
  });

  it('Review Focus 6: 409 THƯỜNG (trùng cứng) không phải NearDuplicateError', async () => {
    const error = await throwIfFailed({ message: 'Phòng "H3.03" đã tồn tại.' }, failed(409)).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(NearDuplicateError);
    expect((error as Error).message).toBe('Phòng "H3.03" đã tồn tại.');
  });

  it('NEAR_DUPLICATE mà không phải 409 cũng không thành NearDuplicateError', async () => {
    const error = await throwIfFailed({ error: 'NEAR_DUPLICATE', message: 'x' }, failed(400)).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(NearDuplicateError);
  });
});
```

Create `apps/web/src/lib/api/master-data-api.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NearDuplicateError } from './http-error';

const calls = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() };
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    GET: (...a: unknown[]) => calls.GET(...a),
    POST: (...a: unknown[]) => calls.POST(...a),
    PATCH: (...a: unknown[]) => calls.PATCH(...a),
    DELETE: (...a: unknown[]) => calls.DELETE(...a),
  },
}));

import { listTeacherOptions } from './accounts';
import {
  createAdministrativeClass,
  deleteAdministrativeClass,
  listAdministrativeClasses,
  updateAdministrativeClass,
} from './administrative-classes';
import { createAdminClass, deleteAdminClass, listAdminClasses, updateAdminClass } from './admin-classes';
import { createRoom, deleteRoom, listRooms, updateRoom } from './rooms';
import { createSemester, deleteSemester, listSemesters, updateSemester } from './semesters';
import { lookupStudent } from './students';

const ok = (data: unknown) => ({ data, error: undefined, response: { ok: true, status: 200 } });
const noContent = () => ({ data: undefined, error: undefined, response: { ok: true, status: 204 } });
const failed = (status: number, error: unknown) => ({ data: undefined, error, response: { ok: false, status } });

describe('semesters', () => {
  beforeEach(() => Object.values(calls).forEach((c) => c.mockReset()));

  it('list / create / update / delete gọi đúng route và truyền nguyên thân', async () => {
    calls.GET.mockResolvedValue(ok([{ id: 's1' }]));
    await expect(listSemesters()).resolves.toEqual([{ id: 's1' }]);
    expect(calls.GET).toHaveBeenCalledWith('/semesters');

    const body = { academicYearStart: 2026, term: 1, startDate: '2026-09-01', endDate: '2027-01-31' };
    calls.POST.mockResolvedValue(ok({ id: 's1' }));
    await createSemester(body);
    expect(calls.POST).toHaveBeenCalledWith('/semesters', { body });

    calls.PATCH.mockResolvedValue(ok({ id: 's1' }));
    await updateSemester('s1', { endDate: '2027-02-15' });
    expect(calls.PATCH).toHaveBeenCalledWith('/semesters/{id}', {
      params: { path: { id: 's1' } },
      body: { endDate: '2027-02-15' },
    });

    calls.DELETE.mockResolvedValue(noContent());
    await deleteSemester('s1');
    expect(calls.DELETE).toHaveBeenCalledWith('/semesters/{id}', { params: { path: { id: 's1' } } });
  });

  it('xoá học kỳ còn lớp: câu của server tới được người dùng', async () => {
    calls.DELETE.mockResolvedValue(failed(409, { message: 'HK1 2026-2027 còn 3 lớp nên không xoá được.' }));
    await expect(deleteSemester('s1')).rejects.toThrow('HK1 2026-2027 còn 3 lớp nên không xoá được.');
  });
});

describe('rooms', () => {
  beforeEach(() => Object.values(calls).forEach((c) => c.mockReset()));

  it('listRooms gửi ?active=true khi activeOnly, không gửi gì khi vắng', async () => {
    calls.GET.mockResolvedValue(ok([]));
    await listRooms();
    expect(calls.GET).toHaveBeenLastCalledWith('/rooms', { params: { query: {} } });
    await listRooms({ activeOnly: true });
    expect(calls.GET).toHaveBeenLastCalledWith('/rooms', { params: { query: { active: 'true' } } });
  });

  it('create/update/delete gọi đúng route; confirmSimilar đi cùng thân', async () => {
    calls.POST.mockResolvedValue(ok({ id: 'r1' }));
    await createRoom({ name: 'H303', capacity: 40, confirmSimilar: true });
    expect(calls.POST).toHaveBeenCalledWith('/rooms', { body: { name: 'H303', capacity: 40, confirmSimilar: true } });

    calls.PATCH.mockResolvedValue(ok({ id: 'r1' }));
    await updateRoom('r1', { isActive: false });
    expect(calls.PATCH).toHaveBeenCalledWith('/rooms/{id}', { params: { path: { id: 'r1' } }, body: { isActive: false } });

    calls.DELETE.mockResolvedValue(noContent());
    await deleteRoom('r1');
    expect(calls.DELETE).toHaveBeenCalledWith('/rooms/{id}', { params: { path: { id: 'r1' } } });
  });

  it('thêm phòng gần giống: NearDuplicateError mang mục bị so', async () => {
    calls.POST.mockResolvedValue(
      failed(409, { error: 'NEAR_DUPLICATE', message: 'gần giống', similar: [{ id: 'r1', name: 'Phòng H3.03' }] }),
    );
    const error = await createRoom({ name: 'H303' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NearDuplicateError);
    expect((error as NearDuplicateError).similar).toEqual([{ id: 'r1', name: 'Phòng H3.03' }]);
  });
});

describe('administrative classes', () => {
  beforeEach(() => Object.values(calls).forEach((c) => c.mockReset()));

  it('đủ bốn thao tác trên /administrative-classes', async () => {
    calls.GET.mockResolvedValue(ok([{ id: 'a1', code: 'DHKTPM18A', classCount: 2 }]));
    await expect(listAdministrativeClasses()).resolves.toEqual([{ id: 'a1', code: 'DHKTPM18A', classCount: 2 }]);
    expect(calls.GET).toHaveBeenCalledWith('/administrative-classes');

    calls.POST.mockResolvedValue(ok({ id: 'a1' }));
    await createAdministrativeClass({ code: 'DHKTPM18A' });
    expect(calls.POST).toHaveBeenCalledWith('/administrative-classes', { body: { code: 'DHKTPM18A' } });

    calls.PATCH.mockResolvedValue(ok({ id: 'a1' }));
    await updateAdministrativeClass('a1', { code: 'DHKTPM18B', confirmSimilar: true });
    expect(calls.PATCH).toHaveBeenCalledWith('/administrative-classes/{id}', {
      params: { path: { id: 'a1' } },
      body: { code: 'DHKTPM18B', confirmSimilar: true },
    });

    calls.DELETE.mockResolvedValue(noContent());
    await deleteAdministrativeClass('a1');
    expect(calls.DELETE).toHaveBeenCalledWith('/administrative-classes/{id}', { params: { path: { id: 'a1' } } });
  });
});

describe('admin classes', () => {
  beforeEach(() => Object.values(calls).forEach((c) => c.mockReset()));

  it('listAdminClasses chỉ gửi các bộ lọc có giá trị', async () => {
    calls.GET.mockResolvedValue(ok([]));
    await listAdminClasses({ academicYear: 2026, q: 'DHKTPM' });
    expect(calls.GET).toHaveBeenCalledWith('/classes', { params: { query: { academicYear: 2026, q: 'DHKTPM' } } });
    await listAdminClasses();
    expect(calls.GET).toHaveBeenLastCalledWith('/classes', { params: { query: {} } });
  });

  it('create/update/delete', async () => {
    const body = { semesterId: 's1', administrativeClassId: 'a1', groupName: 'Nhóm 1', teacherId: 't1' };
    calls.POST.mockResolvedValue(ok({ id: 'c1' }));
    await createAdminClass(body);
    expect(calls.POST).toHaveBeenCalledWith('/classes', { body });

    calls.PATCH.mockResolvedValue(ok({ id: 'c1' }));
    await updateAdminClass('c1', { teacherId: 't2' });
    expect(calls.PATCH).toHaveBeenCalledWith('/classes/{id}', { params: { path: { id: 'c1' } }, body: { teacherId: 't2' } });

    calls.DELETE.mockResolvedValue(noContent());
    await deleteAdminClass('c1');
    expect(calls.DELETE).toHaveBeenCalledWith('/classes/{id}', { params: { path: { id: 'c1' } } });
  });

  it('xoá lớp còn sinh viên/phiên: câu của server tới được người dùng', async () => {
    calls.DELETE.mockResolvedValue(failed(409, { message: 'Lớp DHKTPM18A còn 40 sinh viên nên không xoá được.' }));
    await expect(deleteAdminClass('c1')).rejects.toThrow('Lớp DHKTPM18A còn 40 sinh viên nên không xoá được.');
  });
});

describe('teachers và tra sinh viên', () => {
  beforeEach(() => Object.values(calls).forEach((c) => c.mockReset()));

  it('listTeacherOptions đọc /accounts/teachers', async () => {
    calls.GET.mockResolvedValue(ok([{ id: 't1', name: 'GV A' }]));
    await expect(listTeacherOptions()).resolves.toEqual([{ id: 't1', name: 'GV A' }]);
    expect(calls.GET).toHaveBeenCalledWith('/accounts/teachers');
  });

  it('lookupStudent: có thì trả { mssv, fullName }; 404 thì trả null (MSSV mới), không phải lỗi', async () => {
    calls.GET.mockResolvedValueOnce(ok({ mssv: 'SV01', fullName: 'Nguyễn Văn A' }));
    await expect(lookupStudent('SV01')).resolves.toEqual({ mssv: 'SV01', fullName: 'Nguyễn Văn A' });
    expect(calls.GET).toHaveBeenCalledWith('/students/{mssv}', { params: { path: { mssv: 'SV01' } } });

    calls.GET.mockResolvedValueOnce(failed(404, { message: 'Không có sinh viên này.' }));
    await expect(lookupStudent('SV99')).resolves.toBeNull();
  });

  it('lookupStudent: 429 (giới hạn tốc độ) và lỗi khác là lỗi thật, không bị nuốt thành "MSSV mới"', async () => {
    calls.GET.mockResolvedValueOnce(failed(429, { message: 'Tra cứu quá nhanh, hãy thử lại sau ít phút.' }));
    await expect(lookupStudent('SV01')).rejects.toThrow('Tra cứu quá nhanh');
    calls.GET.mockResolvedValueOnce(failed(500, undefined));
    await expect(lookupStudent('SV01')).rejects.toThrow('HTTP 500');
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/lib/api/http-error.test.ts src/lib/api/master-data-api.test.ts`
Expected: FAIL — không import được các module.

- [ ] **Step 3: Viết `http-error.ts`**

Create `apps/web/src/lib/api/http-error.ts`:

```ts
/**
 * 409 "gần giống" (spec §2.2, §6.2 nguyên tắc 4): server báo mục vừa gõ giống mục đã có và liệt kê chúng; client hiện lời nhắc và
 * gửi lại với `confirmSimilar: true`. Lớp riêng thay vì một cờ trên `Error` thường vì HAI loại 409 cần hai cách xử lý khác hẳn: trùng
 * cứng chỉ có thể sửa, còn "gần giống" có thể xác nhận bỏ qua.
 */
export class NearDuplicateError extends Error {
  constructor(
    message: string,
    readonly similar: Array<{ id: string; name: string }>,
  ) {
    super(message);
    this.name = 'NearDuplicateError';
  }
}

/**
 * Mọi hàm `lib/api` của dữ liệu nền kết thúc ở đây. openapi-fetch chỉ điền `error` từ thân phản hồi và có lỗi để trống, nên
 * cũng xét `response.ok`. Chữ của server được giữ NGUYÊN VĂN: một 409 nêu mục nào gây lỗi ("Phòng X đã có 4 phiên thi…") và đó là cách
 * duy nhất admin biết vì sao thao tác không được — `Yêu cầu thất bại` chung chung là thất bại của cả màn hình.
 */
export async function throwIfFailed(
  error: unknown,
  response: { ok: boolean; status: number },
): Promise<void> {
  if (!error && response.ok) return;
  const body = (error ?? {}) as {
    error?: string;
    message?: string | string[];
    similar?: Array<{ id: string; name: string }>;
  };
  const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
  if (response.status === 409 && body.error === 'NEAR_DUPLICATE') {
    throw new NearDuplicateError(message ?? 'Mục này gần giống một mục đã có.', body.similar ?? []);
  }
  throw new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
}
```

- [ ] **Step 4: Viết các hàm `lib/api`**

Create `apps/web/src/lib/api/semesters.ts`:

```ts
import { apiClient } from '@/lib/api-client';
import { throwIfFailed } from './http-error';

// Phản chiếu SemesterView (apps/api/src/course/course.types.ts, plan C). `classCount` chỉ có với admin: giảng viên đọc danh
// sách này để lọc nhưng số lớp là thông tin tổng hợp của người khác.
export interface Semester {
  id: string;
  academicYearStart: number;
  term: number;
  /** `HK1 2026-2027` — server dựng từ (năm học, kỳ); không có cột tên riêng. */
  label: string;
  /** `yyyy-mm-dd`. */
  startDate: string;
  endDate: string;
  classCount?: number;
}

export interface SemesterInput {
  academicYearStart: number;
  term: number;
  startDate: string;
  endDate: string;
}

// `body as never`: chỗ DUY NHẤT kiểu của hàm này gặp kiểu sinh ra. Khoá trường khớp DTO được ghim bằng e2e của server, không bằng
// kiểu — nếu để kiểu sinh ra tự kiểm, một khác biệt vô hại (`null` vs `undefined`) làm đỏ cả trang.
export async function listSemesters(): Promise<Semester[]> {
  const { data, error, response } = await apiClient.GET('/semesters');
  await throwIfFailed(error, response);
  return data as unknown as Semester[];
}

export async function createSemester(body: SemesterInput): Promise<Semester> {
  const { data, error, response } = await apiClient.POST('/semesters', { body: body as never });
  await throwIfFailed(error, response);
  return data as unknown as Semester;
}

export async function updateSemester(id: string, body: Partial<SemesterInput>): Promise<Semester> {
  const { data, error, response } = await apiClient.PATCH('/semesters/{id}', {
    params: { path: { id } },
    body: body as never,
  });
  await throwIfFailed(error, response);
  return data as unknown as Semester;
}

/** Học kỳ còn lớp thì server từ chối (409) kèm số lớp — câu đó tới thẳng người dùng. */
export async function deleteSemester(id: string): Promise<void> {
  const { error, response } = await apiClient.DELETE('/semesters/{id}', { params: { path: { id } } });
  await throwIfFailed(error, response);
}
```

Create `apps/web/src/lib/api/rooms.ts`:

```ts
import { apiClient } from '@/lib/api-client';
import { throwIfFailed } from './http-error';

// Phản chiếu RoomView (plan C). `sessionCount` chỉ có với admin.
export interface Room {
  id: string;
  name: string;
  capacity: number | null;
  /** `false` = ngừng hoạt động: không chọn được cho phiên MỚI, phiên cũ vẫn tham chiếu được. */
  isActive: boolean;
  sessionCount?: number;
}

export interface RoomInput {
  name: string;
  /** Không bắt buộc: chưa biết sức chứa không được chặn việc ghi nhận phòng. */
  capacity?: number;
  /** Admin đã thấy cảnh báo "gần giống" và vẫn muốn thêm. */
  confirmSimilar?: boolean;
}

export interface RoomUpdate {
  name?: string;
  /** `null` xoá sức chứa. */
  capacity?: number | null;
  isActive?: boolean;
  confirmSimilar?: boolean;
}

/** `activeOnly` cho form tạo/sửa phiên thi: chỉ những phòng chọn được. */
export async function listRooms(options: { activeOnly?: boolean } = {}): Promise<Room[]> {
  const { data, error, response } = await apiClient.GET('/rooms', {
    params: { query: options.activeOnly ? { active: 'true' } : {} },
  });
  await throwIfFailed(error, response);
  return data as unknown as Room[];
}

export async function createRoom(body: RoomInput): Promise<Room> {
  const { data, error, response } = await apiClient.POST('/rooms', { body: body as never });
  await throwIfFailed(error, response);
  return data as unknown as Room;
}

export async function updateRoom(id: string, body: RoomUpdate): Promise<Room> {
  const { data, error, response } = await apiClient.PATCH('/rooms/{id}', {
    params: { path: { id } },
    body: body as never,
  });
  await throwIfFailed(error, response);
  return data as unknown as Room;
}

/** Phòng đã có phiên thi thì server từ chối và bảo tắt hoạt động thay vì xoá. */
export async function deleteRoom(id: string): Promise<void> {
  const { error, response } = await apiClient.DELETE('/rooms/{id}', { params: { path: { id } } });
  await throwIfFailed(error, response);
}
```

Create `apps/web/src/lib/api/administrative-classes.ts`:

```ts
import { apiClient } from '@/lib/api-client';
import { throwIfFailed } from './http-error';

/** Một mã trong Danh mục lớp danh nghĩa (chỉ admin thấy). `classCount` là số lớp học phần đang dùng mã này. */
export interface AdministrativeClass {
  id: string;
  code: string;
  classCount: number;
}

export interface AdministrativeClassInput {
  /** Chưa chuẩn hoá: server viết hoa, cắt khoảng trắng rồi kiểm 3–30 ký tự chữ/số. */
  code: string;
  confirmSimilar?: boolean;
}

export async function listAdministrativeClasses(): Promise<AdministrativeClass[]> {
  const { data, error, response } = await apiClient.GET('/administrative-classes');
  await throwIfFailed(error, response);
  return data as unknown as AdministrativeClass[];
}

export async function createAdministrativeClass(body: AdministrativeClassInput): Promise<AdministrativeClass> {
  const { data, error, response } = await apiClient.POST('/administrative-classes', { body: body as never });
  await throwIfFailed(error, response);
  return data as unknown as AdministrativeClass;
}

/** Đổi mã lan tới nhãn của MỌI lớp dùng nó, kể cả lớp của kỳ cũ — đó là mục đích của việc sửa lỗi gõ. */
export async function updateAdministrativeClass(
  id: string,
  body: Partial<AdministrativeClassInput>,
): Promise<AdministrativeClass> {
  const { data, error, response } = await apiClient.PATCH('/administrative-classes/{id}', {
    params: { path: { id } },
    body: body as never,
  });
  await throwIfFailed(error, response);
  return data as unknown as AdministrativeClass;
}

/** Mã còn lớp dùng thì server từ chối và nêu số lớp. */
export async function deleteAdministrativeClass(id: string): Promise<void> {
  const { error, response } = await apiClient.DELETE('/administrative-classes/{id}', {
    params: { path: { id } },
  });
  await throwIfFailed(error, response);
}
```

Create `apps/web/src/lib/api/admin-classes.ts`:

```ts
import { apiClient } from '@/lib/api-client';
import { throwIfFailed } from './http-error';

// Phản chiếu ClassAdminView (apps/api/src/course/course.types.ts, plan D2): lớp như ADMIN thấy. Giảng viên đọc lớp của mình qua
// `lib/api/teaching.ts`, một hình dạng khác (không có sĩ số/phiên của người khác).
export interface AdminClass {
  id: string;
  /** Nhãn gộp `DHKTPM18A – Nhóm 1`. */
  label: string;
  /** Nhãn gộp kèm học kỳ: `DHKTPM18A – Nhóm 1 · HK1 2026-2027`. */
  labelWithSemester: string;
  /** `null` chỉ với lớp cũ chưa backfill. */
  semesterId: string | null;
  academicYear: number | null;
  term: number | null;
  administrativeClassId: string | null;
  administrativeClassCode: string | null;
  groupName: string;
  teacherId: string;
  teacherName: string;
  studentCount: number;
  sessionCount: number;
}

export interface AdminClassFilters {
  semesterId?: string;
  academicYear?: number;
  teacherId?: string;
  /** Tìm theo mã lớp danh nghĩa. */
  q?: string;
}

/**
 * Lớp: CHỌN, không gõ. `administrativeClassId` đến từ ô chọn trong Danh mục lớp danh nghĩa (server vẫn nhận `administrativeClassCode`
 * cho script/import, form không dùng). `courseName` không có: một môn duy nhất, server điền hằng số.
 */
export interface AdminClassInput {
  semesterId: string;
  administrativeClassId: string;
  groupName?: string;
  teacherId: string;
}

export async function listAdminClasses(filters: AdminClassFilters = {}): Promise<AdminClass[]> {
  const query = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
  );
  const { data, error, response } = await apiClient.GET('/classes', { params: { query } });
  await throwIfFailed(error, response);
  return data as unknown as AdminClass[];
}

export async function createAdminClass(body: AdminClassInput): Promise<AdminClass> {
  const { data, error, response } = await apiClient.POST('/classes', { body: body as never });
  await throwIfFailed(error, response);
  return data as unknown as AdminClass;
}

/** Đổi giảng viên đi theo cùng một đường với nhập tay (server đổi `enrollment.home_teacher_id`, phiên đã có giữ giảng viên cũ). */
export async function updateAdminClass(id: string, body: Partial<AdminClassInput>): Promise<AdminClass> {
  const { data, error, response } = await apiClient.PATCH('/classes/{id}', {
    params: { path: { id } },
    body: body as never,
  });
  await throwIfFailed(error, response);
  return data as unknown as AdminClass;
}

/** Lớp còn sinh viên hoặc phiên thi thì server từ chối và nêu số lượng. */
export async function deleteAdminClass(id: string): Promise<void> {
  const { error, response } = await apiClient.DELETE('/classes/{id}', { params: { path: { id } } });
  await throwIfFailed(error, response);
}
```

Create `apps/web/src/lib/api/students.ts`:

```ts
import { apiClient } from '@/lib/api-client';
import { throwIfFailed } from './http-error';

export interface StudentLookup {
  mssv: string;
  fullName: string;
}

/**
 * Tra tên theo ĐÚNG một MSSV (spec §2.6): có thì ô tên được điền sẵn và khoá, KHÔNG có (404) thì là MSSV mới và giảng viên nhập
 * tên. 404 vì thế trả `null` chứ không ném — nó là câu trả lời bình thường của một MSSV chưa có. Mọi lỗi KHÁC (429 giới hạn
 * tốc độ 30 lần/phút, 5xx) là lỗi thật: nuốt chúng thành "MSSV mới" sẽ cho giảng viên gõ một cái tên rồi bị server bác vì
 * MSSV đó đã có.
 */
export async function lookupStudent(mssv: string): Promise<StudentLookup | null> {
  const { data, error, response } = await apiClient.GET('/students/{mssv}', {
    params: { path: { mssv } },
  });
  if (response.status === 404) return null;
  await throwIfFailed(error, response);
  return data as unknown as StudentLookup;
}
```

Trong `apps/web/src/lib/api/accounts.ts` thêm (cuối file, dùng `apiClient` đã import ở đầu file; nếu file chưa import `throwIfFailed`, thêm `import { throwIfFailed } from './http-error';`):

```ts
/** Giảng viên để GIAO LỚP (admin). Chỉ `id` và `name` — route cố ý không trả gì khác. */
export interface TeacherOption {
  id: string;
  name: string;
}

export async function listTeacherOptions(): Promise<TeacherOption[]> {
  const { data, error, response } = await apiClient.GET('/accounts/teachers');
  await throwIfFailed(error, response);
  return data as unknown as TeacherOption[];
}
```

- [ ] **Step 5: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/lib/api/http-error.test.ts src/lib/api/master-data-api.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api
git commit -m "feat(web): lớp API cho học kỳ, phòng, Danh mục lớp danh nghĩa, lớp (admin), giảng viên, tra sinh viên; NearDuplicateError"
```

---

### Task 3: Hook TanStack cho dữ liệu nền

**Files:**
- Create: `apps/web/src/hooks/useSemesters.ts`, `useRooms.ts`, `useAdministrativeClasses.ts`, `useAdminClasses.ts`, `useTeacherOptions.ts`, `useStudentLookup.ts`
- Test: `apps/web/src/hooks/master-data-hooks.test.tsx`

**Interfaces:**
- Consumes: Task 2; `MASTER_DATA_KEYS` (E2).
- Produces:

```ts
// mỗi hook đọc trả UseQueryResult; mỗi mutation trả UseMutationResult (mutateAsync)
useSemesters(): UseQueryResult<Semester[]>
useCreateSemester() / useUpdateSemester() / useDeleteSemester()
useRooms(options?: { activeOnly?: boolean }): UseQueryResult<Room[]>
useCreateRoom() / useUpdateRoom() / useDeleteRoom()
useAdministrativeClasses(): UseQueryResult<AdministrativeClass[]>
useCreateAdministrativeClass() / useUpdateAdministrativeClass() / useDeleteAdministrativeClass()
useAdminClasses(filters: AdminClassFilters): UseQueryResult<AdminClass[]>
useCreateAdminClass() / useUpdateAdminClass() / useDeleteAdminClass()
useTeacherOptions(): UseQueryResult<TeacherOption[]>
useStudentLookup(mssv: string): UseQueryResult<StudentLookup | null>   // chỉ chạy khi MSSV hợp lệ
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/hooks/master-data-hooks.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const api = {
  listSemesters: vi.fn(),
  createSemester: vi.fn(),
  updateSemester: vi.fn(),
  deleteSemester: vi.fn(),
  listRooms: vi.fn(),
  createRoom: vi.fn(),
  updateRoom: vi.fn(),
  deleteRoom: vi.fn(),
  listAdministrativeClasses: vi.fn(),
  createAdministrativeClass: vi.fn(),
  updateAdministrativeClass: vi.fn(),
  deleteAdministrativeClass: vi.fn(),
  listAdminClasses: vi.fn(),
  createAdminClass: vi.fn(),
  updateAdminClass: vi.fn(),
  deleteAdminClass: vi.fn(),
  listTeacherOptions: vi.fn(),
  lookupStudent: vi.fn(),
};
vi.mock('@/lib/api/semesters', () => ({
  listSemesters: (...a: unknown[]) => api.listSemesters(...a),
  createSemester: (...a: unknown[]) => api.createSemester(...a),
  updateSemester: (...a: unknown[]) => api.updateSemester(...a),
  deleteSemester: (...a: unknown[]) => api.deleteSemester(...a),
}));
vi.mock('@/lib/api/rooms', () => ({
  listRooms: (...a: unknown[]) => api.listRooms(...a),
  createRoom: (...a: unknown[]) => api.createRoom(...a),
  updateRoom: (...a: unknown[]) => api.updateRoom(...a),
  deleteRoom: (...a: unknown[]) => api.deleteRoom(...a),
}));
vi.mock('@/lib/api/administrative-classes', () => ({
  listAdministrativeClasses: (...a: unknown[]) => api.listAdministrativeClasses(...a),
  createAdministrativeClass: (...a: unknown[]) => api.createAdministrativeClass(...a),
  updateAdministrativeClass: (...a: unknown[]) => api.updateAdministrativeClass(...a),
  deleteAdministrativeClass: (...a: unknown[]) => api.deleteAdministrativeClass(...a),
}));
vi.mock('@/lib/api/admin-classes', () => ({
  listAdminClasses: (...a: unknown[]) => api.listAdminClasses(...a),
  createAdminClass: (...a: unknown[]) => api.createAdminClass(...a),
  updateAdminClass: (...a: unknown[]) => api.updateAdminClass(...a),
  deleteAdminClass: (...a: unknown[]) => api.deleteAdminClass(...a),
}));
vi.mock('@/lib/api/accounts', () => ({ listTeacherOptions: (...a: unknown[]) => api.listTeacherOptions(...a) }));
vi.mock('@/lib/api/students', () => ({ lookupStudent: (...a: unknown[]) => api.lookupStudent(...a) }));

import { useAdminClasses, useCreateAdminClass, useDeleteAdminClass, useUpdateAdminClass } from './useAdminClasses';
import {
  useAdministrativeClasses,
  useCreateAdministrativeClass,
  useDeleteAdministrativeClass,
  useUpdateAdministrativeClass,
} from './useAdministrativeClasses';
import { useCreateRoom, useDeleteRoom, useRooms, useUpdateRoom } from './useRooms';
import { useCreateSemester, useDeleteSemester, useSemesters, useUpdateSemester } from './useSemesters';
import { useStudentLookup } from './useStudentLookup';
import { useTeacherOptions } from './useTeacherOptions';

function setup<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(hook, { wrapper }), invalidate };
}

const roots = (invalidate: { mock: { calls: unknown[][] } }) =>
  invalidate.mock.calls.map((call) => (call[0] as { queryKey: string[] }).queryKey[0]).sort();

describe('hook đọc', () => {
  beforeEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

  it('useSemesters / useAdministrativeClasses / useTeacherOptions trả dữ liệu của lớp API', async () => {
    api.listSemesters.mockResolvedValue([{ id: 's1' }]);
    api.listAdministrativeClasses.mockResolvedValue([{ id: 'a1' }]);
    api.listTeacherOptions.mockResolvedValue([{ id: 't1', name: 'GV A' }]);

    const semesters = setup(() => useSemesters());
    const codes = setup(() => useAdministrativeClasses());
    const teachers = setup(() => useTeacherOptions());

    await waitFor(() => expect(semesters.result.current.data).toEqual([{ id: 's1' }]));
    await waitFor(() => expect(codes.result.current.data).toEqual([{ id: 'a1' }]));
    await waitFor(() => expect(teachers.result.current.data).toEqual([{ id: 't1', name: 'GV A' }]));
  });

  it('useRooms truyền activeOnly; hai chế độ có hai khoá riêng (không dùng lẫn cache của nhau)', async () => {
    api.listRooms.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

    renderHook(() => useRooms({ activeOnly: true }), { wrapper });
    renderHook(() => useRooms(), { wrapper });

    await waitFor(() => expect(api.listRooms).toHaveBeenCalledTimes(2));
    expect(api.listRooms).toHaveBeenCalledWith({ activeOnly: true });
  });

  it('useAdminClasses đưa bộ lọc vào khoá: đổi bộ lọc là một truy vấn mới', async () => {
    api.listAdminClasses.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

    const { rerender } = renderHook(({ filters }) => useAdminClasses(filters), {
      wrapper,
      initialProps: { filters: { academicYear: 2026 } as { academicYear?: number; teacherId?: string } },
    });
    await waitFor(() => expect(api.listAdminClasses).toHaveBeenCalledWith({ academicYear: 2026 }));
    rerender({ filters: { academicYear: 2026, teacherId: 't1' } });
    await waitFor(() => expect(api.listAdminClasses).toHaveBeenCalledWith({ academicYear: 2026, teacherId: 't1' }));
  });
});

describe('hook ghi làm mới đúng khoá (Review Focus 4)', () => {
  beforeEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

  interface MutationCase {
    label: string;
    hook: () => { mutateAsync: (variables: never) => Promise<unknown> };
    fn: keyof typeof api;
    input: unknown;
    refreshes: string[];
  }
  const CASES: MutationCase[] = [
    { label: 'tạo học kỳ', hook: () => useCreateSemester(), fn: 'createSemester', input: { academicYearStart: 2026 }, refreshes: ['classes', 'semesters'] },
    { label: 'sửa học kỳ', hook: () => useUpdateSemester(), fn: 'updateSemester', input: { id: 's1', body: {} }, refreshes: ['classes', 'semesters'] },
    { label: 'xoá học kỳ', hook: () => useDeleteSemester(), fn: 'deleteSemester', input: 's1', refreshes: ['classes', 'semesters'] },
    { label: 'tạo phòng', hook: () => useCreateRoom(), fn: 'createRoom', input: { name: 'A' }, refreshes: ['rooms'] },
    { label: 'sửa phòng', hook: () => useUpdateRoom(), fn: 'updateRoom', input: { id: 'r1', body: { isActive: false } }, refreshes: ['rooms'] },
    { label: 'xoá phòng', hook: () => useDeleteRoom(), fn: 'deleteRoom', input: 'r1', refreshes: ['rooms'] },
    { label: 'tạo mã lớp danh nghĩa', hook: () => useCreateAdministrativeClass(), fn: 'createAdministrativeClass', input: { code: 'ABC' }, refreshes: ['administrative-classes'] },
    // Đổi mã làm đổi NHÃN của mọi lớp dùng nó: danh sách lớp phải làm mới theo.
    { label: 'sửa mã lớp danh nghĩa', hook: () => useUpdateAdministrativeClass(), fn: 'updateAdministrativeClass', input: { id: 'a1', body: { code: 'XYZ' } }, refreshes: ['administrative-classes', 'classes'] },
    { label: 'xoá mã lớp danh nghĩa', hook: () => useDeleteAdministrativeClass(), fn: 'deleteAdministrativeClass', input: 'a1', refreshes: ['administrative-classes'] },
    { label: 'tạo lớp', hook: () => useCreateAdminClass(), fn: 'createAdminClass', input: { semesterId: 's1' }, refreshes: ['administrative-classes', 'classes'] },
    { label: 'sửa lớp', hook: () => useUpdateAdminClass(), fn: 'updateAdminClass', input: { id: 'c1', body: {} }, refreshes: ['classes'] },
    { label: 'xoá lớp', hook: () => useDeleteAdminClass(), fn: 'deleteAdminClass', input: 'c1', refreshes: ['administrative-classes', 'classes'] },
  ];

  it.each(CASES)('$label', async ({ hook, fn, input, refreshes }) => {
    api[fn].mockResolvedValue({});
    const { result, invalidate } = setup(hook);

    await act(async () => {
      await result.current.mutateAsync(input as never);
    });

    expect(roots(invalidate)).toEqual([...refreshes].sort());
  });

  it('mutation thất bại không làm mới gì và giữ lỗi của server cho trang hiện', async () => {
    api.deleteRoom.mockRejectedValue(new Error('Phòng "H3.03" đã có 4 phiên thi nên không xoá được.'));
    const { result, invalidate } = setup(() => useDeleteRoom());

    await act(async () => {
      await result.current.mutateAsync('r1').catch(() => undefined);
    });

    expect(invalidate).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.error?.message).toMatch(/4 phiên thi/));
  });
});

describe('useStudentLookup', () => {
  beforeEach(() => api.lookupStudent.mockReset());

  it('MSSV hợp lệ thì tra; kết quả null nghĩa là MSSV mới', async () => {
    api.lookupStudent.mockResolvedValue(null);
    const { result } = setup(() => useStudentLookup('SV20120001'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(api.lookupStudent).toHaveBeenCalledWith('SV20120001');
  });

  it.each(['', 'SV1', 'SV 2012', 'x'.repeat(21), 'SV-2012'])('MSSV không hợp lệ (%j) thì KHÔNG gọi server', (mssv) => {
    setup(() => useStudentLookup(mssv));
    expect(api.lookupStudent).not.toHaveBeenCalled();
  });

  it('cắt khoảng trắng trước khi tra', async () => {
    api.lookupStudent.mockResolvedValue({ mssv: 'SV20120001', fullName: 'A' });
    setup(() => useStudentLookup('  SV20120001 '));
    await waitFor(() => expect(api.lookupStudent).toHaveBeenCalledWith('SV20120001'));
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/hooks/master-data-hooks.test.tsx`
Expected: FAIL — không import được các hook.

- [ ] **Step 3: Viết hook**

Create `apps/web/src/hooks/useSemesters.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSemester,
  deleteSemester,
  listSemesters,
  updateSemester,
  type SemesterInput,
} from '@/lib/api/semesters';
import { MASTER_DATA_KEYS } from './master-data-keys';

/**
 * Học kỳ, nguồn DUY NHẤT của bộ lọc Năm học → Học kỳ (spec §7.2) và của trang quản trị. `staleTime` ngắn vì danh sách nhỏ và
 * admin có thể vừa thêm một kỳ ở tab khác; `invalidateQueries` sau mỗi lần ghi lo phần còn lại.
 */
export function useSemesters() {
  return useQuery({
    queryKey: [MASTER_DATA_KEYS.semesters],
    queryFn: listSemesters,
    staleTime: 60 * 1000,
  });
}

/**
 * Ghi một học kỳ làm mới CẢ danh sách lớp: nhãn lớp ở nhiều nơi kèm học kỳ (`label_with_semester`), và `classCount` của học kỳ
 * chính là số dòng của danh sách lớp.
 */
function useSemesterMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.semesters] }),
        queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.classes] }),
      ]),
  });
}

export function useCreateSemester() {
  return useSemesterMutation((body: SemesterInput) => createSemester(body));
}

export function useUpdateSemester() {
  return useSemesterMutation((args: { id: string; body: Partial<SemesterInput> }) =>
    updateSemester(args.id, args.body),
  );
}

export function useDeleteSemester() {
  return useSemesterMutation((id: string) => deleteSemester(id));
}
```

Create `apps/web/src/hooks/useRooms.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRoom,
  deleteRoom,
  listRooms,
  updateRoom,
  type RoomInput,
  type RoomUpdate,
} from '@/lib/api/rooms';
import { MASTER_DATA_KEYS } from './master-data-keys';

/**
 * Phòng. `activeOnly` cho form tạo/sửa phiên thi (chỉ phòng chọn được); trang quản trị đọc cả phòng đã ngừng. Hai chế độ có hai
 * khoá riêng để cache của một chế độ không bao giờ trả lời cho chế độ kia.
 */
export function useRooms(options: { activeOnly?: boolean } = {}) {
  const activeOnly = options.activeOnly === true;
  return useQuery({
    queryKey: [MASTER_DATA_KEYS.rooms, { activeOnly }],
    queryFn: () => listRooms(options),
    staleTime: 60 * 1000,
  });
}

function useRoomMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.rooms] }),
  });
}

export function useCreateRoom() {
  return useRoomMutation((body: RoomInput) => createRoom(body));
}

export function useUpdateRoom() {
  return useRoomMutation((args: { id: string; body: RoomUpdate }) => updateRoom(args.id, args.body));
}

export function useDeleteRoom() {
  return useRoomMutation((id: string) => deleteRoom(id));
}
```

Create `apps/web/src/hooks/useAdministrativeClasses.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAdministrativeClass,
  deleteAdministrativeClass,
  listAdministrativeClasses,
  updateAdministrativeClass,
  type AdministrativeClassInput,
} from '@/lib/api/administrative-classes';
import { MASTER_DATA_KEYS } from './master-data-keys';

/** Danh mục lớp danh nghĩa — nguồn của ô chọn trong form lớp (chỉ admin). */
export function useAdministrativeClasses() {
  return useQuery({
    queryKey: [MASTER_DATA_KEYS.administrativeClasses],
    queryFn: listAdministrativeClasses,
    staleTime: 60 * 1000,
  });
}

/**
 * Làm mới cả Danh mục lẫn danh sách lớp. Danh sách lớp vì hai lý do khác nhau: ĐỔI mã làm đổi nhãn của mọi lớp dùng nó, và thêm/xoá
 * làm đổi `classCount` ở ô chọn. Làm mới cả hai cho MỌI mutation rẻ hơn việc phân biệt, và không bao giờ sai.
 */
function useCatalogMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>, alsoClasses: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.administrativeClasses] }),
        ...(alsoClasses ? [queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.classes] })] : []),
      ]),
  });
}

export function useCreateAdministrativeClass() {
  return useCatalogMutation((body: AdministrativeClassInput) => createAdministrativeClass(body), false);
}

export function useUpdateAdministrativeClass() {
  return useCatalogMutation(
    (args: { id: string; body: Partial<AdministrativeClassInput> }) => updateAdministrativeClass(args.id, args.body),
    true,
  );
}

export function useDeleteAdministrativeClass() {
  return useCatalogMutation((id: string) => deleteAdministrativeClass(id), false);
}
```

Create `apps/web/src/hooks/useAdminClasses.ts`:

```ts
'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAdminClass,
  deleteAdminClass,
  listAdminClasses,
  updateAdminClass,
  type AdminClassFilters,
  type AdminClassInput,
} from '@/lib/api/admin-classes';
import { MASTER_DATA_KEYS } from './master-data-keys';

/**
 * Lớp cho trang quản trị. Khoá `['classes', 'admin', filters]` nằm DƯỚI gốc `['classes']` — cùng gốc với `['classes','teaching']` của
 * "Lớp của tôi" — nên một lần ghi làm mới cả hai (lý do đã nêu ở `useTeaching.ts`: sĩ số xuất hiện ở nhiều nơi).
 * `keepPreviousData`: đổi bộ lọc không nháy sang khung xương mỗi lần bấm.
 */
export function useAdminClasses(filters: AdminClassFilters = {}) {
  return useQuery({
    queryKey: [MASTER_DATA_KEYS.classes, 'admin', filters],
    queryFn: () => listAdminClasses(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Ghi một lớp làm mới danh sách lớp VÀ Danh mục lớp danh nghĩa: `classCount` của mã nằm ở Danh mục và đổi theo mỗi lớp thêm/xoá,
 * mà ô chọn trong form đang hiện nó.
 */
function useClassMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>, alsoCatalog: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.classes] }),
        ...(alsoCatalog
          ? [queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.administrativeClasses] })]
          : []),
      ]),
  });
}

export function useCreateAdminClass() {
  return useClassMutation((body: AdminClassInput) => createAdminClass(body), true);
}

export function useUpdateAdminClass() {
  return useClassMutation(
    (args: { id: string; body: Partial<AdminClassInput> }) => updateAdminClass(args.id, args.body),
    false,
  );
}

export function useDeleteAdminClass() {
  return useClassMutation((id: string) => deleteAdminClass(id), true);
}
```

Create `apps/web/src/hooks/useTeacherOptions.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { listTeacherOptions } from '@/lib/api/accounts';

/** Giảng viên để giao lớp (admin). Khoá riêng, không dính `MASTER_DATA_KEYS`: tài khoản đổi ở trang tài khoản, không ở đây. */
export function useTeacherOptions() {
  return useQuery({
    queryKey: ['accounts', 'teacher-options'],
    queryFn: listTeacherOptions,
    staleTime: 60 * 1000,
  });
}
```

Create `apps/web/src/hooks/useStudentLookup.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { lookupStudent } from '@/lib/api/students';

// Cùng luật với STUDENT_MSSV_REGEX của server (apps/api/src/common/student-mssv.ts) và `MSSV_REGEX` của roster-file.ts: 4–20 chữ
// hoặc số. Khớp từng ký tự — lệch ở đây thì hoặc gọi server vô ích (rồi 400), hoặc không bao giờ tra cho một MSSV hợp lệ.
const MSSV_REGEX = /^[A-Za-z0-9]{4,20}$/;

/**
 * Tra tên sinh viên theo MSSV đang gõ (spec §2.6). CHỈ chạy khi MSSV hợp lệ: server giới hạn 30 lần/phút/giảng viên để không ai quét
 * được danh sách, nên mỗi lần gọi thừa (MSSV chưa gõ xong) là một lần trừ vào hạn mức. `data === null` nghĩa là MSSV mới — giảng
 * viên nhập tên; có dữ liệu nghĩa là tên đã lưu, ô tên được điền sẵn và khoá. Không thử lại khi lỗi: 429 thử lại là tự làm hết hạn mức.
 */
export function useStudentLookup(rawMssv: string) {
  const mssv = rawMssv.trim();
  return useQuery({
    queryKey: ['students', 'lookup', mssv.toLowerCase()],
    queryFn: () => lookupStudent(mssv),
    enabled: MSSV_REGEX.test(mssv),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/hooks/master-data-hooks.test.tsx`
Expected: PASS. Ca bảng "làm mới đúng khoá": `tạo học kỳ` kỳ vọng `['classes','semesters']` (sắp xếp) vì `useSemesterMutation` làm mới cả hai gốc; `tạo lớp` kỳ vọng `['administrative-classes','classes']` vì `classCount` của mã.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks
git commit -m "feat(web): hook đọc/ghi học kỳ, phòng, Danh mục lớp danh nghĩa, lớp (admin), giảng viên, tra sinh viên"
```

---

### Task 4: Phần thuần của bộ lọc Năm học → Học kỳ

**Files:**
- Create: `apps/web/src/lib/semester-filter.ts`
- Test: `apps/web/src/lib/semester-filter.test.ts`

**Interfaces:**
- Consumes: không.
- Produces:

```ts
export interface SemesterRef { id: string; academicYearStart: number; term: number; label: string }
export interface SemesterSelection { academicYear: number | null; semesterId: string | null }
export const ALL_SEMESTERS: SemesterSelection;
export function academicYearLabel(start: number): string;                       // 2026 -> '2026-2027'
export function academicYearOptions(semesters: readonly SemesterRef[]): Array<{ value: number; label: string }>;  // giảm dần
export function termOptions(semesters: readonly SemesterRef[], academicYear: number | null): SemesterRef[];
export function selectYear(current: SemesterSelection, year: number | null, semesters: readonly SemesterRef[]): SemesterSelection;
export function selectSemester(semesterId: string | null, current: SemesterSelection, semesters: readonly SemesterRef[]): SemesterSelection;
export function reconcileSelection(selection: SemesterSelection, semesters: readonly SemesterRef[]): SemesterSelection;
export function matchesSemester(selection: SemesterSelection, item: { semesterId: string | null; academicYear: number | null }): boolean;
export function toQueryParams(selection: SemesterSelection): { semesterId?: string; academicYear?: number };
export function isFiltering(selection: SemesterSelection): boolean;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/lib/semester-filter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ALL_SEMESTERS,
  academicYearLabel,
  academicYearOptions,
  isFiltering,
  matchesSemester,
  reconcileSelection,
  selectSemester,
  selectYear,
  termOptions,
  toQueryParams,
  type SemesterRef,
} from './semester-filter';

const sem = (id: string, year: number, term: number): SemesterRef => ({
  id,
  academicYearStart: year,
  term,
  label: `HK${term} ${year}-${year + 1}`,
});
// Cố ý để lộn xộn: bộ lọc không được dựa vào thứ tự đầu vào.
const SEMESTERS = [sem('b2', 2026, 2), sem('a1', 2025, 1), sem('b1', 2026, 1), sem('b3', 2026, 3)];

describe('academicYearLabel', () => {
  it('2026 → 2026-2027', () => expect(academicYearLabel(2026)).toBe('2026-2027'));
});

describe('academicYearOptions', () => {
  it('mỗi năm một lần, mới nhất trước', () => {
    expect(academicYearOptions(SEMESTERS)).toEqual([
      { value: 2026, label: '2026-2027' },
      { value: 2025, label: '2025-2026' },
    ]);
  });

  it('không có học kỳ nào thì không có năm nào', () => {
    expect(academicYearOptions([])).toEqual([]);
  });
});

describe('termOptions', () => {
  it('năm đã chọn: các kỳ của năm đó, kỳ 1 trước', () => {
    expect(termOptions(SEMESTERS, 2026).map((s) => s.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('chưa chọn năm: MỌI kỳ, mới nhất trước (chọn thẳng một kỳ vẫn được)', () => {
    expect(termOptions(SEMESTERS, null).map((s) => s.id)).toEqual(['b3', 'b2', 'b1', 'a1']);
  });

  it('năm không có kỳ nào thì rỗng', () => {
    expect(termOptions(SEMESTERS, 1999)).toEqual([]);
  });
});

describe('selectYear', () => {
  it('chọn năm không chọn kỳ = cả ba kỳ: semesterId là null', () => {
    expect(selectYear(ALL_SEMESTERS, 2026, SEMESTERS)).toEqual({ academicYear: 2026, semesterId: null });
  });

  it('đổi năm: kỳ đang chọn KHÔNG thuộc năm mới thì về "tất cả"', () => {
    const current = { academicYear: 2026, semesterId: 'b2' };
    expect(selectYear(current, 2025, SEMESTERS)).toEqual({ academicYear: 2025, semesterId: null });
  });

  it('đổi năm: kỳ đang chọn thuộc năm mới thì GIỮ', () => {
    // Trường hợp: đang ở "tất cả năm" với kỳ b2 (do chọn thẳng kỳ), rồi chọn đúng năm của nó.
    const current = { academicYear: null, semesterId: 'b2' };
    expect(selectYear(current, 2026, SEMESTERS)).toEqual({ academicYear: 2026, semesterId: 'b2' });
  });

  it('về "tất cả năm" xoá luôn kỳ đang chọn — một kỳ không có năm đi kèm là trạng thái không hiểu được', () => {
    expect(selectYear({ academicYear: 2026, semesterId: 'b2' }, null, SEMESTERS)).toEqual(ALL_SEMESTERS);
  });
});

describe('selectSemester', () => {
  it('chọn thẳng một kỳ thì năm học đi theo', () => {
    expect(selectSemester('a1', ALL_SEMESTERS, SEMESTERS)).toEqual({ academicYear: 2025, semesterId: 'a1' });
  });

  it('chọn "tất cả kỳ" giữ nguyên năm: quay về "cả năm"', () => {
    expect(selectSemester(null, { academicYear: 2026, semesterId: 'b2' }, SEMESTERS)).toEqual({
      academicYear: 2026,
      semesterId: null,
    });
  });

  it('id không có trong danh sách thì về "tất cả" thay vì lưu một id mồ côi', () => {
    expect(selectSemester('khong-co', ALL_SEMESTERS, SEMESTERS)).toEqual(ALL_SEMESTERS);
  });
});

describe('reconcileSelection (Review Focus 1)', () => {
  it('lựa chọn còn hợp lệ thì giữ nguyên', () => {
    const selection = { academicYear: 2026, semesterId: 'b2' };
    expect(reconcileSelection(selection, SEMESTERS)).toBe(selection);
  });

  it('học kỳ đã bị xoá thì về "tất cả"', () => {
    expect(reconcileSelection({ academicYear: 2026, semesterId: 'da-xoa' }, SEMESTERS)).toEqual(ALL_SEMESTERS);
  });

  it('năm không còn kỳ nào thì bỏ năm', () => {
    expect(reconcileSelection({ academicYear: 1999, semesterId: null }, SEMESTERS)).toEqual(ALL_SEMESTERS);
  });

  it('kỳ còn nhưng không thuộc năm đang ghi thì chỉnh năm theo kỳ', () => {
    expect(reconcileSelection({ academicYear: 2025, semesterId: 'b2' }, SEMESTERS)).toEqual({
      academicYear: 2026,
      semesterId: 'b2',
    });
  });

  it('danh sách học kỳ rỗng (chưa tải hoặc chưa có) KHÔNG làm mất lựa chọn trống', () => {
    expect(reconcileSelection(ALL_SEMESTERS, [])).toEqual(ALL_SEMESTERS);
  });
});

describe('matchesSemester', () => {
  const row = (semesterId: string | null, academicYear: number | null) => ({ semesterId, academicYear });

  it('không lọc thì khớp mọi dòng — kể cả dòng chưa có học kỳ', () => {
    expect(matchesSemester(ALL_SEMESTERS, row('b1', 2026))).toBe(true);
    expect(matchesSemester(ALL_SEMESTERS, row(null, null))).toBe(true);
  });

  it('lọc theo kỳ: so bằng KHOÁ', () => {
    const selection = { academicYear: 2026, semesterId: 'b2' };
    expect(matchesSemester(selection, row('b2', 2026))).toBe(true);
    expect(matchesSemester(selection, row('b1', 2026))).toBe(false);
  });

  it('lọc theo năm (không chọn kỳ): cả ba kỳ của năm đó', () => {
    const selection = { academicYear: 2026, semesterId: null };
    expect(matchesSemester(selection, row('b1', 2026))).toBe(true);
    expect(matchesSemester(selection, row('b3', 2026))).toBe(true);
    expect(matchesSemester(selection, row('a1', 2025))).toBe(false);
  });

  it('Review Focus 3: dòng chưa có học kỳ (dữ liệu cũ) KHÔNG khớp khi đang lọc — và không nổ', () => {
    expect(matchesSemester({ academicYear: 2026, semesterId: null }, row(null, null))).toBe(false);
    expect(matchesSemester({ academicYear: 2026, semesterId: 'b2' }, row(null, null))).toBe(false);
  });
});

describe('toQueryParams / isFiltering', () => {
  it('không lọc: không gửi tham số nào (vắng mặt = tất cả, không phải lỗi)', () => {
    expect(toQueryParams(ALL_SEMESTERS)).toEqual({});
    expect(isFiltering(ALL_SEMESTERS)).toBe(false);
  });

  it('có kỳ: chỉ gửi semesterId (chính xác hơn năm)', () => {
    expect(toQueryParams({ academicYear: 2026, semesterId: 'b2' })).toEqual({ semesterId: 'b2' });
    expect(isFiltering({ academicYear: 2026, semesterId: 'b2' })).toBe(true);
  });

  it('chỉ có năm: gửi academicYear', () => {
    expect(toQueryParams({ academicYear: 2026, semesterId: null })).toEqual({ academicYear: 2026 });
    expect(isFiltering({ academicYear: 2026, semesterId: null })).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/lib/semester-filter.test.ts`
Expected: FAIL — không import được `./semester-filter`.

- [ ] **Step 3: Viết phần thuần**

Create `apps/web/src/lib/semester-filter.ts`:

```ts
/**
 * Phần THUẦN của bộ lọc Năm học → Học kỳ dùng chung (spec §7.2). Thay ba bản lọc theo CHUỖI (`semester-filter.tsx`,
 * `FilterRail.tsx`, `lib/session-list.ts`), đều dựng danh sách lựa chọn từ các dòng đã tải — nên "HK1 2026-2027" và "Học kỳ 1
 * 2026-2027" là hai mục lọc, và kỳ không có dòng nào trên trang đang xem thì không thể chọn.
 *
 * Ở đây lựa chọn đến từ bảng `semester` và lọc bằng KHOÁ. Bộ lọc chỉ hẹp tầm nhìn, không bao giờ chặn thao tác (CLAUDE.md §1.2).
 */

/** Phần của một học kỳ mà bộ lọc cần — `Semester` của `lib/api/semesters` thoả kiểu này. */
export interface SemesterRef {
  id: string;
  academicYearStart: number;
  term: number;
  label: string;
}

/**
 * `academicYear = null` và `semesterId = null` là "Tất cả". `semesterId` khác null luôn đi kèm `academicYear` của nó
 * (`selectSemester` và `reconcileSelection` giữ bất biến đó) — một kỳ không có năm là trạng thái không hiểu được trên hai ô liên kết.
 */
export interface SemesterSelection {
  academicYear: number | null;
  semesterId: string | null;
}

/** MẶC ĐỊNH ở mọi màn hình: bản học kỳ 10/09 từng phải thêm riêng "nhắc việc tồn đọng của kỳ trước" vì bộ lọc mặc định che mất bài chưa chấm của kỳ cũ. */
export const ALL_SEMESTERS: SemesterSelection = { academicYear: null, semesterId: null };

export function academicYearLabel(start: number): string {
  return `${start}-${start + 1}`;
}

/** Mỗi năm một lần, năm mới nhất trước. */
export function academicYearOptions(
  semesters: readonly SemesterRef[],
): Array<{ value: number; label: string }> {
  const years = [...new Set(semesters.map((s) => s.academicYearStart))].sort((a, b) => b - a);
  return years.map((value) => ({ value, label: academicYearLabel(value) }));
}

/**
 * Các kỳ để chọn ở ô thứ hai. Đã chọn năm: các kỳ của năm đó, kỳ 1 trước (thứ tự đọc). Chưa chọn năm: MỌI kỳ, mới nhất trước — để
 * chọn thẳng một kỳ vẫn được mà không phải chọn năm trước.
 */
export function termOptions(semesters: readonly SemesterRef[], academicYear: number | null): SemesterRef[] {
  if (academicYear === null) {
    return [...semesters].sort((a, b) => b.academicYearStart - a.academicYearStart || b.term - a.term);
  }
  return semesters.filter((s) => s.academicYearStart === academicYear).sort((a, b) => a.term - b.term);
}

/**
 * Đổi năm học. Chọn năm không chọn kỳ là cả ba kỳ; đổi năm thì ô kỳ về "tất cả" nếu kỳ đang chọn không thuộc năm mới (spec §7.2);
 * về "tất cả năm" xoá luôn kỳ.
 */
export function selectYear(
  current: SemesterSelection,
  year: number | null,
  semesters: readonly SemesterRef[],
): SemesterSelection {
  if (year === null) return ALL_SEMESTERS;
  const keep = semesters.some((s) => s.id === current.semesterId && s.academicYearStart === year);
  return { academicYear: year, semesterId: keep ? current.semesterId : null };
}

/** Chọn một kỳ: năm học đi theo kỳ. `null` là "tất cả kỳ" — quay về "cả năm" đang chọn. Id lạ về "tất cả" thay vì lưu id mồ côi. */
export function selectSemester(
  semesterId: string | null,
  current: SemesterSelection,
  semesters: readonly SemesterRef[],
): SemesterSelection {
  if (semesterId === null) return { academicYear: current.academicYear, semesterId: null };
  const found = semesters.find((s) => s.id === semesterId);
  return found ? { academicYear: found.academicYearStart, semesterId } : ALL_SEMESTERS;
}

/**
 * Dọn một lựa chọn trỏ vào thứ không còn (học kỳ vừa bị admin xoá) hoặc không nhất quán. Trả về CHÍNH đối tượng nếu không có gì
 * phải sửa, để `useMemo`/`useEffect` ở hook không chạy lại vô ích. Danh sách rỗng không làm mất lựa chọn trống.
 */
export function reconcileSelection(
  selection: SemesterSelection,
  semesters: readonly SemesterRef[],
): SemesterSelection {
  if (selection.semesterId !== null) {
    const found = semesters.find((s) => s.id === selection.semesterId);
    if (!found) return ALL_SEMESTERS;
    return selection.academicYear === found.academicYearStart
      ? selection
      : { academicYear: found.academicYearStart, semesterId: selection.semesterId };
  }
  if (selection.academicYear !== null) {
    return semesters.some((s) => s.academicYearStart === selection.academicYear) ? selection : ALL_SEMESTERS;
  }
  return selection;
}

/**
 * Một dòng đã tải có khớp lựa chọn không — cho các trang lọc trong trình duyệt (spec §7.2). Lọc bằng KHOÁ trên dòng, không bằng chữ.
 * Dòng chưa có học kỳ (lớp cũ chưa backfill) khớp khi KHÔNG lọc và KHÔNG khớp khi đang lọc — không bao giờ nổ vì `null`.
 */
export function matchesSemester(
  selection: SemesterSelection,
  item: { semesterId: string | null; academicYear: number | null },
): boolean {
  if (selection.semesterId !== null) return item.semesterId === selection.semesterId;
  if (selection.academicYear !== null) return item.academicYear === selection.academicYear;
  return true;
}

/**
 * Tham số cho các truy vấn lọc ở server. Có kỳ thì chỉ gửi `semesterId` (chính xác hơn năm); không lọc thì KHÔNG gửi gì — vắng mặt
 * là "tất cả", không phải lỗi.
 */
export function toQueryParams(selection: SemesterSelection): { semesterId?: string; academicYear?: number } {
  if (selection.semesterId !== null) return { semesterId: selection.semesterId };
  if (selection.academicYear !== null) return { academicYear: selection.academicYear };
  return {};
}

export function isFiltering(selection: SemesterSelection): boolean {
  return selection.semesterId !== null || selection.academicYear !== null;
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/lib/semester-filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/semester-filter.ts apps/web/src/lib/semester-filter.test.ts
git commit -m "feat(web): phần thuần của bộ lọc Năm học → Học kỳ (lọc bằng khoá, mặc định tất cả, dọn lựa chọn mồ côi)"
```

---

### Task 5: Hook trạng thái và component hai ô liên kết

**Files:**
- Create: `apps/web/src/hooks/useSemesterYearFilter.ts`, `apps/web/src/components/layout/semester-year-filter.tsx`
- Test: `apps/web/src/hooks/useSemesterYearFilter.test.tsx`, `apps/web/src/components/layout/semester-year-filter.test.tsx`

**Interfaces:**
- Consumes: Task 3 (`useSemesters`), Task 4.
- Produces:

```ts
export interface SemesterYearFilterState {
  semesters: SemesterRef[];
  isLoading: boolean;
  selection: SemesterSelection;
  setYear: (year: number | null) => void;
  setSemester: (semesterId: string | null) => void;
  clear: () => void;
  /** Tham số cho truy vấn lọc ở server. */
  params: { semesterId?: string; academicYear?: number };
  /** Một dòng đã tải có khớp không — cho trang lọc trong trình duyệt. */
  matches: (item: { semesterId: string | null; academicYear: number | null }) => boolean;
}
export function useSemesterYearFilter(scopeKey: string): SemesterYearFilterState;
export function SemesterYearFilter(props: {
  semesters: readonly SemesterRef[];
  selection: SemesterSelection;
  onYearChange: (year: number | null) => void;
  onSemesterChange: (semesterId: string | null) => void;
}): JSX.Element;
```

- [ ] **Step 1: Viết test hook (đỏ)**

Create `apps/web/src/hooks/useSemesterYearFilter.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const useSemestersMock = vi.fn();
vi.mock('./useSemesters', () => ({ useSemesters: () => useSemestersMock() }));

import { useSemesterYearFilter } from './useSemesterYearFilter';

const sem = (id: string, year: number, term: number) => ({
  id,
  academicYearStart: year,
  term,
  label: `HK${term} ${year}-${year + 1}`,
  startDate: '',
  endDate: '',
});
const LIST = [sem('b1', 2026, 1), sem('b2', 2026, 2), sem('a1', 2025, 1)];
const loaded = (data = LIST) => ({ data, isLoading: false, isSuccess: true });

describe('useSemesterYearFilter', () => {
  beforeEach(() => useSemestersMock.mockReset());

  it('Review Focus 2: mặc định là TẤT CẢ — không chọn hộ ai một kỳ nào', () => {
    useSemestersMock.mockReturnValue(loaded());
    const { result } = renderHook(() => useSemesterYearFilter('trang-a'));

    expect(result.current.selection).toEqual({ academicYear: null, semesterId: null });
    expect(result.current.params).toEqual({});
    expect(result.current.matches({ semesterId: null, academicYear: null })).toBe(true);
  });

  it('chọn năm rồi chọn kỳ: params đổi từ academicYear sang semesterId', () => {
    useSemestersMock.mockReturnValue(loaded());
    const { result } = renderHook(() => useSemesterYearFilter('trang-a'));

    act(() => result.current.setYear(2026));
    expect(result.current.params).toEqual({ academicYear: 2026 });
    expect(result.current.matches({ semesterId: 'b2', academicYear: 2026 })).toBe(true);
    expect(result.current.matches({ semesterId: 'a1', academicYear: 2025 })).toBe(false);

    act(() => result.current.setSemester('b2'));
    expect(result.current.params).toEqual({ semesterId: 'b2' });
    expect(result.current.matches({ semesterId: 'b1', academicYear: 2026 })).toBe(false);
  });

  it('đổi năm: kỳ đang chọn không thuộc năm mới thì về "tất cả kỳ"', () => {
    useSemestersMock.mockReturnValue(loaded());
    const { result } = renderHook(() => useSemesterYearFilter('trang-a'));

    act(() => result.current.setSemester('b2'));
    act(() => result.current.setYear(2025));

    expect(result.current.selection).toEqual({ academicYear: 2025, semesterId: null });
  });

  it('chuyển màn hình (scopeKey đổi) thì về mặc định — bộ lọc KHÔNG rò rỉ giữa các trang', () => {
    useSemestersMock.mockReturnValue(loaded());
    const { result, rerender } = renderHook(({ scope }) => useSemesterYearFilter(scope), {
      initialProps: { scope: 'trang-a' },
    });
    act(() => result.current.setSemester('b2'));
    expect(result.current.selection.semesterId).toBe('b2');

    rerender({ scope: 'trang-b' });

    expect(result.current.selection).toEqual({ academicYear: null, semesterId: null });
  });

  it('cùng scopeKey render lại thì GIỮ lựa chọn', () => {
    useSemestersMock.mockReturnValue(loaded());
    const { result, rerender } = renderHook(({ scope }) => useSemesterYearFilter(scope), {
      initialProps: { scope: 'trang-a' },
    });
    act(() => result.current.setSemester('b2'));

    rerender({ scope: 'trang-a' });

    expect(result.current.selection.semesterId).toBe('b2');
  });

  it('Review Focus 1: học kỳ vừa bị admin xoá thì lựa chọn tự về "tất cả"', () => {
    useSemestersMock.mockReturnValue(loaded());
    const { result, rerender } = renderHook(() => useSemesterYearFilter('trang-a'));
    act(() => result.current.setSemester('b2'));

    useSemestersMock.mockReturnValue(loaded([sem('b1', 2026, 1), sem('a1', 2025, 1)])); // b2 biến mất
    rerender();

    expect(result.current.selection).toEqual({ academicYear: null, semesterId: null });
    expect(result.current.params).toEqual({});
  });

  it('đang tải danh sách học kỳ: không dọn lựa chọn (danh sách rỗng chỉ vì chưa tải)', () => {
    useSemestersMock.mockReturnValue(loaded());
    const { result, rerender } = renderHook(() => useSemesterYearFilter('trang-a'));
    act(() => result.current.setSemester('b2'));

    useSemestersMock.mockReturnValue({ data: undefined, isLoading: true, isSuccess: false });
    rerender();

    expect(result.current.selection.semesterId).toBe('b2');
    expect(result.current.isLoading).toBe(true);
    expect(result.current.semesters).toEqual([]);
  });

  it('clear() đưa về "tất cả"', () => {
    useSemestersMock.mockReturnValue(loaded());
    const { result } = renderHook(() => useSemesterYearFilter('trang-a'));
    act(() => result.current.setSemester('b2'));
    act(() => result.current.clear());
    expect(result.current.selection).toEqual({ academicYear: null, semesterId: null });
  });
});
```

- [ ] **Step 2: Viết test component (đỏ)**

Create `apps/web/src/components/layout/semester-year-filter.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ALL_SEMESTERS } from '@/lib/semester-filter';
import { SemesterYearFilter } from './semester-year-filter';

const sem = (id: string, year: number, term: number) => ({
  id,
  academicYearStart: year,
  term,
  label: `HK${term} ${year}-${year + 1}`,
});
const SEMESTERS = [sem('b1', 2026, 1), sem('b2', 2026, 2), sem('a1', 2025, 1)];

function setup(selection = ALL_SEMESTERS) {
  const onYearChange = vi.fn();
  const onSemesterChange = vi.fn();
  render(
    <SemesterYearFilter
      semesters={SEMESTERS}
      selection={selection}
      onYearChange={onYearChange}
      onSemesterChange={onSemesterChange}
    />,
  );
  return { onYearChange, onSemesterChange };
}

describe('SemesterYearFilter', () => {
  it('hai ô liên kết, mặc định "Tất cả"', () => {
    setup();
    expect(screen.getByRole('combobox', { name: 'Lọc theo năm học' })).toHaveTextContent('Tất cả năm học');
    expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toHaveTextContent('Tất cả học kỳ');
  });

  it('ô năm liệt kê năm học từ bảng học kỳ, mới nhất trước; chọn năm gọi onYearChange(năm)', () => {
    const { onYearChange } = setup();

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo năm học' }));
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Tất cả năm học', '2026-2027', '2025-2026']);

    fireEvent.click(screen.getByRole('option', { name: '2026-2027' }));
    expect(onYearChange).toHaveBeenCalledWith(2026);
  });

  it('chọn "Tất cả năm học" gọi onYearChange(null)', () => {
    const { onYearChange } = setup({ academicYear: 2026, semesterId: null });

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo năm học' }));
    fireEvent.click(screen.getByRole('option', { name: 'Tất cả năm học' }));

    expect(onYearChange).toHaveBeenCalledWith(null);
  });

  it('đã chọn năm: ô kỳ chỉ liệt kê các kỳ của năm đó; chọn một kỳ gọi onSemesterChange(id)', () => {
    const { onSemesterChange } = setup({ academicYear: 2026, semesterId: null });

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Tất cả học kỳ',
      'HK1 2026-2027',
      'HK2 2026-2027',
    ]);

    fireEvent.click(screen.getByRole('option', { name: 'HK2 2026-2027' }));
    expect(onSemesterChange).toHaveBeenCalledWith('b2');
  });

  it('chưa chọn năm: ô kỳ liệt kê MỌI kỳ để chọn thẳng', () => {
    setup();
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Tất cả học kỳ',
      'HK2 2026-2027',
      'HK1 2026-2027',
      'HK1 2025-2026',
    ]);
  });

  it('hiện giá trị đang chọn', () => {
    setup({ academicYear: 2026, semesterId: 'b2' });
    expect(screen.getByRole('combobox', { name: 'Lọc theo năm học' })).toHaveTextContent('2026-2027');
    expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toHaveTextContent('HK2 2026-2027');
  });

  it('chưa có học kỳ nào: vẫn vẽ, chỉ có "Tất cả" — bộ lọc không bao giờ chặn thao tác', () => {
    render(
      <SemesterYearFilter semesters={[]} selection={ALL_SEMESTERS} onYearChange={vi.fn()} onSemesterChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo năm học' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Tất cả năm học']);
  });
});
```

- [ ] **Step 3: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/hooks/useSemesterYearFilter.test.tsx src/components/layout/semester-year-filter.test.tsx`
Expected: FAIL — không import được hai module.

- [ ] **Step 4: Viết hook và component**

Create `apps/web/src/hooks/useSemesterYearFilter.ts`:

```ts
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALL_SEMESTERS,
  matchesSemester,
  reconcileSelection,
  selectSemester,
  selectYear,
  toQueryParams,
  type SemesterRef,
  type SemesterSelection,
} from '@/lib/semester-filter';
import { useSemesters } from './useSemesters';

export interface SemesterYearFilterState {
  semesters: SemesterRef[];
  isLoading: boolean;
  selection: SemesterSelection;
  setYear: (year: number | null) => void;
  setSemester: (semesterId: string | null) => void;
  clear: () => void;
  /** Tham số cho truy vấn lọc ở server. Không lọc thì rỗng (vắng mặt = tất cả). */
  params: { semesterId?: string; academicYear?: number };
  /** Một dòng đã tải có khớp không — cho trang lọc trong trình duyệt. */
  matches: (item: { semesterId: string | null; academicYear: number | null }) => boolean;
}

/**
 * Trạng thái của bộ lọc Năm học → Học kỳ cho MỘT màn hình (spec §7.2). Thay `useSemesterFilter` (theo chuỗi).
 *
 * - **Mặc định "Tất cả" ở mọi màn hình.** Không đoán hộ ai "kỳ hiện tại": một bộ lọc mặc định đã che mất bài chưa chấm của kỳ cũ.
 * - **Mỗi màn hình giữ bộ lọc riêng** (`scopeKey`): sang màn hình khác thì về mặc định, về lại cùng trang thì giữ — quyết định hiện tại.
 * - **Lựa chọn mồ côi tự về "Tất cả"**: học kỳ vừa bị admin xoá không để lại một bộ lọc trỏ vào thứ không còn. Chỉ dọn khi danh sách ĐÃ
 *   tải xong — danh sách rỗng vì chưa tải không phải bằng chứng rằng kỳ đã xoá.
 */
export function useSemesterYearFilter(scopeKey: string): SemesterYearFilterState {
  const query = useSemesters();
  const semesters = useMemo<SemesterRef[]>(() => query.data ?? [], [query.data]);
  const [raw, setRaw] = useState<SemesterSelection>(ALL_SEMESTERS);
  const scopedTo = useRef(scopeKey);

  useEffect(() => {
    if (scopedTo.current === scopeKey) return;
    scopedTo.current = scopeKey;
    setRaw(ALL_SEMESTERS);
  }, [scopeKey]);

  // Giá trị DẪN XUẤT, không phải effect ghi ngược vào state: `selection` luôn nhất quán với danh sách học kỳ ở mọi lần render, không có
  // một khung hình trung gian trỏ vào kỳ đã xoá.
  const selection = useMemo(
    () => (query.isSuccess ? reconcileSelection(raw, semesters) : raw),
    [raw, semesters, query.isSuccess],
  );

  const setYear = useCallback(
    (year: number | null) => setRaw((current) => selectYear(current, year, semesters)),
    [semesters],
  );
  const setSemester = useCallback(
    (semesterId: string | null) => setRaw((current) => selectSemester(semesterId, current, semesters)),
    [semesters],
  );
  const clear = useCallback(() => setRaw(ALL_SEMESTERS), []);
  const matches = useCallback(
    (item: { semesterId: string | null; academicYear: number | null }) => matchesSemester(selection, item),
    [selection],
  );

  return {
    semesters,
    isLoading: query.isLoading,
    selection,
    setYear,
    setSemester,
    clear,
    params: toQueryParams(selection),
    matches,
  };
}
```

Create `apps/web/src/components/layout/semester-year-filter.tsx`:

```tsx
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  academicYearOptions,
  termOptions,
  type SemesterRef,
  type SemesterSelection,
} from '@/lib/semester-filter';

interface SemesterYearFilterProps {
  semesters: readonly SemesterRef[];
  selection: SemesterSelection;
  onYearChange: (year: number | null) => void;
  onSemesterChange: (semesterId: string | null) => void;
}

/**
 * Hai ô liên kết Năm học → Học kỳ cho MỌI màn hình có lọc theo học kỳ (spec §7.2), thay `semester-filter.tsx` (một ô, theo chuỗi).
 * Lựa chọn lấy từ bảng học kỳ chứ không từ các dòng đã tải. "Tất cả" luôn có mặt và là mặc định.
 *
 * Nhãn `aria-label="Lọc theo học kỳ"` của ô kỳ GIỮ NGUYÊN so với component cũ, để các test trang chuyển sang bộ lọc mới ở plan G3 chỉ
 * phải đổi nguồn dữ liệu chứ không phải đổi cách tìm ô.
 *
 * Bộ lọc chỉ hẹp tầm nhìn, không bao giờ chặn thao tác (CLAUDE.md §1.2) — nên không có trạng thái disabled hay xác nhận gì, và vẫn vẽ
 * đủ hai ô khi chưa có học kỳ nào (chỉ còn "Tất cả").
 */
export function SemesterYearFilter({
  semesters,
  selection,
  onYearChange,
  onSemesterChange,
}: SemesterYearFilterProps) {
  const years = academicYearOptions(semesters);
  const terms = termOptions(semesters, selection.academicYear);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select
        value={selection.academicYear === null ? 'all' : String(selection.academicYear)}
        onValueChange={(value) => onYearChange(value === 'all' ? null : Number(value))}
      >
        <SelectTrigger className="sm:w-44" aria-label="Lọc theo năm học">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả năm học</SelectItem>
          {years.map((year) => (
            <SelectItem key={year.value} value={String(year.value)}>
              {year.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selection.semesterId ?? 'all'}
        onValueChange={(value) => onSemesterChange(value === 'all' ? null : value)}
      >
        <SelectTrigger className="sm:w-52" aria-label="Lọc theo học kỳ">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả học kỳ</SelectItem>
          {terms.map((semester) => (
            <SelectItem key={semester.id} value={semester.id}>
              {semester.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 5: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/hooks/useSemesterYearFilter.test.tsx src/components/layout/semester-year-filter.test.tsx`
Expected: PASS. Hai ca dễ trượt: ca "học kỳ vừa bị xoá" cần `reconcileSelection` chạy ở bước **dẫn xuất** (`useMemo`) — nếu viết thành `useEffect` ghi ngược, `selection` còn mang id cũ ở render đầu sau khi danh sách đổi; và ca "đang tải" đòi `query.isSuccess` là điều kiện để dọn.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useSemesterYearFilter.ts apps/web/src/hooks/useSemesterYearFilter.test.tsx apps/web/src/components/layout/semester-year-filter.tsx apps/web/src/components/layout/semester-year-filter.test.tsx
git commit -m "feat(web): bộ lọc Năm học → Học kỳ dùng chung (hook trạng thái + hai ô liên kết), thay cho các bản lọc theo chuỗi"
```

---

### Task 6: Khung cảnh báo "gần giống" và câu audit cho mọi hành động mới

**Files:**
- Create: `apps/web/src/components/resource/near-duplicate-notice.tsx`
- Modify: `apps/web/src/lib/audit-describe.ts`
- Test: `apps/web/src/components/resource/near-duplicate-notice.test.tsx`, `apps/web/src/lib/audit-describe.test.ts`

**Interfaces:**
- Consumes: `NearDuplicateError` (Task 2); `describeAuditEntry`, `DESCRIBERS`, `format`, `diff`, `FIELD_LABELS` (plan B).
- Produces:

```tsx
export function NearDuplicateNotice(props: {
  error: NearDuplicateError;
  /** Danh từ trong lời nhắc: "phòng", "mã lớp danh nghĩa". */
  noun: string;
  onConfirm: () => void;
  confirming: boolean;
}): JSX.Element;
```

- [ ] **Step 1: Viết test cho khung cảnh báo (đỏ)**

Create `apps/web/src/components/resource/near-duplicate-notice.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NearDuplicateError } from '@/lib/api/http-error';
import { NearDuplicateNotice } from './near-duplicate-notice';

const error = new NearDuplicateError('Phòng "H303" gần giống "Phòng H3.03".', [
  { id: 'r1', name: 'Phòng H3.03' },
  { id: 'r2', name: 'Phòng H3-03' },
]);

describe('NearDuplicateNotice', () => {
  it('nêu từng mục gần giống và câu của server', () => {
    render(<NearDuplicateNotice error={error} noun="phòng" onConfirm={vi.fn()} confirming={false} />);

    expect(screen.getByText(/gần giống/i)).toBeInTheDocument();
    expect(screen.getByText('Phòng H3.03')).toBeInTheDocument();
    expect(screen.getByText('Phòng H3-03')).toBeInTheDocument();
  });

  it('nút xác nhận nêu đúng loại và gọi onConfirm', () => {
    const onConfirm = vi.fn();
    render(<NearDuplicateNotice error={error} noun="phòng" onConfirm={onConfirm} confirming={false} />);

    fireEvent.click(screen.getByRole('button', { name: /vẫn thêm phòng này/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('đang gửi lại: nút bị khoá để không bấm hai lần', () => {
    render(<NearDuplicateNotice error={error} noun="mã lớp danh nghĩa" onConfirm={vi.fn()} confirming />);
    expect(screen.getByRole('button', { name: /vẫn thêm mã lớp danh nghĩa này/i })).toBeDisabled();
  });

  it('không có mục nào trong danh sách (server không gửi) thì vẫn hiện câu và nút', () => {
    render(
      <NearDuplicateNotice
        error={new NearDuplicateError('Có mục gần giống.', [])}
        noun="phòng"
        onConfirm={vi.fn()}
        confirming={false}
      />,
    );
    expect(screen.getByText('Có mục gần giống.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /vẫn thêm/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Viết test mô tả audit (đỏ)**

Trong `apps/web/src/lib/audit-describe.test.ts`, thêm vào cuối file (dùng `describeAuditEntry` đã import ở đầu file):

```ts
/**
 * Câu cho các hành động dữ liệu nền và hai hành động sửa/huỷ phiên (plan C, D, E1, F). Mỗi hành động ghi audit PHẢI có một câu ở đây:
 * hành động chưa có câu vẫn đọc được qua nhánh dự phòng, nhưng "room.update · room 9f8e7d6c…" không giúp ai điều tra gì (spec §4.2).
 */
const entry = (
  action: string,
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
  targetType = action.split('.')[0],
) => ({ action, targetType, targetId: '9f8e7d6c-1111-4222-8333-444455556666', oldValue, newValue });

describe('describeAuditEntry — dữ liệu nền', () => {
  describe('học kỳ', () => {
    it('semester.create nêu nhãn và khoảng ngày dd/mm/yyyy', () => {
      expect(
        describeAuditEntry(
          entry('semester.create', null, {
            targetLabel: 'HK1 2026-2027',
            startDate: '2026-09-01',
            endDate: '2027-01-31',
          }),
        ),
      ).toBe('Tạo học kỳ HK1 2026-2027 (01/09/2026–31/01/2027)');
    });

    it('semester.update nêu nhãn và từ → đến của đúng các trường đổi', () => {
      expect(
        describeAuditEntry(
          entry('semester.update', { endDate: '2027-01-31' }, { targetLabel: 'HK1 2026-2027', endDate: '2027-02-15' }),
        ),
      ).toBe('Sửa học kỳ HK1 2026-2027: ngày kết thúc 31/01/2027 → 15/02/2027');
    });

    it('semester.delete đọc nhãn từ oldValue', () => {
      expect(describeAuditEntry(entry('semester.delete', { targetLabel: 'HK3 2025-2026' }, null))).toBe(
        'Xoá học kỳ HK3 2025-2026',
      );
    });
  });

  describe('phòng', () => {
    it('room.create nêu tên và sức chứa', () => {
      expect(
        describeAuditEntry(entry('room.create', null, { targetLabel: 'Phòng H3.03', capacity: 40, isActive: true })),
      ).toBe('Thêm phòng Phòng H3.03 (sức chứa 40)');
    });

    it('room.create không có sức chứa thì không nói về nó', () => {
      expect(describeAuditEntry(entry('room.create', null, { targetLabel: 'Phòng H3.04', capacity: null, isActive: true }))).toBe(
        'Thêm phòng Phòng H3.04',
      );
    });

    it('room.update: ví dụ trong spec — đổi sức chứa 40 → 45', () => {
      expect(
        describeAuditEntry(entry('room.update', { capacity: 40 }, { targetLabel: 'H3.03', capacity: 45 })),
      ).toBe('Sửa phòng H3.03: sức chứa 40 → 45');
    });

    it('room.update tắt hoạt động đọc được bằng chữ có/không', () => {
      expect(
        describeAuditEntry(entry('room.update', { isActive: true }, { targetLabel: 'H3.03', isActive: false })),
      ).toBe('Sửa phòng H3.03: đang hoạt động có → không');
    });

    it('room.delete', () => {
      expect(describeAuditEntry(entry('room.delete', { targetLabel: 'H3.03', capacity: 40 }, null))).toBe('Xoá phòng H3.03');
    });
  });

  describe('Danh mục lớp danh nghĩa', () => {
    it('create / update / delete', () => {
      expect(describeAuditEntry(entry('administrative_class.create', null, { targetLabel: 'DHKTPM18A', code: 'DHKTPM18A' }))).toBe(
        'Thêm mã lớp danh nghĩa DHKTPM18A vào Danh mục',
      );
      expect(
        describeAuditEntry(
          entry('administrative_class.update', { code: 'DHKTPM18A' }, { targetLabel: 'DHKTPM18B', code: 'DHKTPM18B' }),
        ),
      ).toBe('Đổi mã lớp danh nghĩa DHKTPM18A → DHKTPM18B (nhãn của mọi lớp dùng mã này đổi theo)');
      expect(describeAuditEntry(entry('administrative_class.delete', { targetLabel: 'DHKTPM18A', code: 'DHKTPM18A' }, null))).toBe(
        'Xoá mã lớp danh nghĩa DHKTPM18A khỏi Danh mục',
      );
    });
  });

  describe('lớp', () => {
    it('class.create nêu nhãn kèm học kỳ và giảng viên', () => {
      expect(
        describeAuditEntry(
          entry('class.create', null, {
            targetLabel: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027',
            teacherName: 'Nguyễn Văn A',
          }),
        ),
      ).toBe('Tạo lớp DHKTPM18A – Nhóm 1 · HK1 2026-2027, giảng viên Nguyễn Văn A');
    });

    it('class.update nêu các trường đổi bằng nhãn tiếng Việt', () => {
      expect(
        describeAuditEntry(
          entry('class.update', { groupName: 'Nhóm 1' }, { targetLabel: 'DHKTPM18A – Nhóm 2 · HK1 2026-2027', groupName: 'Nhóm 2' }),
        ),
      ).toBe('Sửa lớp DHKTPM18A – Nhóm 2 · HK1 2026-2027: nhóm Nhóm 1 → Nhóm 2');
    });

    it('class.reassign_teacher nêu A → B', () => {
      expect(
        describeAuditEntry(
          entry(
            'class.reassign_teacher',
            { teacherName: 'Nguyễn Văn A' },
            { targetLabel: 'DHKTPM18A · HK1 2026-2027', teacherName: 'Trần Thị B' },
          ),
        ),
      ).toBe('Đổi giảng viên lớp DHKTPM18A · HK1 2026-2027: Nguyễn Văn A → Trần Thị B');
    });

    it('class.delete', () => {
      expect(describeAuditEntry(entry('class.delete', { targetLabel: 'DHKTPM18A · HK1 2026-2027' }, null))).toBe(
        'Xoá lớp DHKTPM18A · HK1 2026-2027',
      );
    });
  });

  describe('nhập từ file', () => {
    it.each([
      ['semester.import', 'học kỳ'],
      ['room.import', 'phòng thi'],
      ['administrative_class.import', 'mã lớp danh nghĩa'],
      ['class.import', 'lớp'],
    ])('%s nêu loại và số lượng thêm / cập nhật / giữ nguyên', (action, noun) => {
      expect(describeAuditEntry(entry(action, null, { targetLabel: 'x', added: 3, updated: 1, unchanged: 6 }))).toBe(
        `Nhập ${noun} từ file: thêm 3, cập nhật 1, giữ nguyên 6`,
      );
    });

    it('class.import nêu số lớp đổi giảng viên', () => {
      expect(
        describeAuditEntry(
          entry('class.import', null, {
            targetLabel: 'Lớp (nhập từ file)',
            added: 0,
            updated: 2,
            unchanged: 5,
            reassignedTotal: 2,
            reassigned: [{ label: 'A', from: 'X', to: 'Y' }],
          }),
        ),
      ).toBe('Nhập lớp từ file: thêm 0, cập nhật 2, giữ nguyên 5 — đổi giảng viên 2 lớp');
    });
  });

  describe('phiên thi (plan F)', () => {
    it('exam_session.update nêu phiên và các trường đổi; thời điểm theo giờ Việt Nam, không theo máy người xem', () => {
      expect(
        describeAuditEntry(
          entry(
            'exam_session.update',
            { room: 'Phòng A1', startTime: '2026-10-20T01:00:00.000Z' },
            {
              targetLabel: 'Cuối kỳ CTDL',
              code: 'AB12CD',
              room: 'Phòng B2',
              startTime: '2026-10-20T02:30:00.000Z',
            },
          ),
        ),
      ).toBe('Sửa phiên thi Cuối kỳ CTDL (AB12CD): phòng Phòng A1 → Phòng B2; giờ bắt đầu 20/10/2026 08:00 → 20/10/2026 09:30');
    });

    it('exam_session.cancel nêu phiên và lý do nếu có', () => {
      expect(
        describeAuditEntry(
          entry('exam_session.cancel', { status: 'active' }, { targetLabel: 'Cuối kỳ CTDL', code: 'AB12CD', status: 'cancelled', reason: 'Nhầm phòng' }),
        ),
      ).toBe('Huỷ phiên thi Cuối kỳ CTDL (AB12CD) — lý do: Nhầm phòng');
      expect(
        describeAuditEntry(entry('exam_session.cancel', { status: 'active' }, { targetLabel: 'Cuối kỳ CTDL', code: 'AB12CD', status: 'cancelled' })),
      ).toBe('Huỷ phiên thi Cuối kỳ CTDL (AB12CD)');
    });
  });

  it('thiếu targetLabel thì dùng 8 ký tự đầu của id thay vì "undefined" hay "[object Object]" (Review Focus 7)', () => {
    expect(describeAuditEntry(entry('room.delete', {}, null))).toBe('Xoá phòng 9f8e7d6c…');
  });

  it('giá trị bị cắt ở API (null) không làm nổ câu mô tả', () => {
    expect(describeAuditEntry(entry('room.update', null, null))).toBe('Sửa phòng 9f8e7d6c…');
  });
});
```

- [ ] **Step 3: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/components/resource/near-duplicate-notice.test.tsx src/lib/audit-describe.test.ts`
Expected: FAIL — không import được `./near-duplicate-notice`; các ca mới của `audit-describe` rơi vào nhánh dự phòng nên sai chữ.

- [ ] **Step 4: Viết khung cảnh báo**

Create `apps/web/src/components/resource/near-duplicate-notice.tsx`:

```tsx
'use client';

import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { NearDuplicateError } from '@/lib/api/http-error';

interface NearDuplicateNoticeProps {
  error: NearDuplicateError;
  /** Danh từ trong nút xác nhận: "phòng", "mã lớp danh nghĩa". */
  noun: string;
  onConfirm: () => void;
  confirming: boolean;
}

/**
 * Lời nhắc khi nhập TAY một phòng hoặc một mã lớp danh nghĩa gần giống mục đã có (spec §2.2, §6.2 nguyên tắc 4): nêu các mục bị so rồi để
 * admin xác nhận gửi lại với `confirmSimilar: true`. Đây là lời nhắc, KHÔNG phải lệnh cấm — hệ thống không biết đó là cùng một thứ
 * hay hai thứ khác nhau (`A1`/`B1`, `ATT`/`CTT` đều là thật), nên hỏi chứ không quyết thay.
 *
 * Khác lỗi trùng CỨNG (409 thường, hiện ở `ResourceFormDialog` như mọi lỗi): trùng cứng chỉ sửa được, không có gì để xác nhận.
 * Component này đặt TRONG form, cạnh các ô nhập, để người dùng thấy lời nhắc trong khi vẫn thấy cái mình vừa gõ.
 */
export function NearDuplicateNotice({ error, noun, onConfirm, confirming }: NearDuplicateNoticeProps) {
  return (
    <Alert variant="warning">
      <TriangleAlert />
      <AlertDescription className="flex flex-col gap-3">
        <span>{error.message}</span>
        {error.similar.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {error.similar.map((entry) => (
              <li key={entry.id} className="text-small font-medium">
                {entry.name}
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button type="button" size="sm" variant="outline" onClick={onConfirm} disabled={confirming}>
            Vẫn thêm {noun} này
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
```

- [ ] **Step 5: Thêm câu audit**

Trong `apps/web/src/lib/audit-describe.ts` (plan B), thực hiện bốn thay đổi:

1. Thêm nhãn trường vào `FIELD_LABELS` (giữ các khoá đã có, thêm các khoá sau):

```ts
  academicYearStart: 'năm học',
  term: 'kỳ',
  semester: 'học kỳ',
  administrativeClass: 'lớp danh nghĩa',
  room: 'phòng',
  status: 'trạng thái',
```

2. Thay hàm `format` bằng bản hiểu ngày và thời điểm (giữ nguyên các nhánh còn lại), và thêm hai hàm định dạng ngay trên nó:

```ts
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** `2026-09-01` → `01/09/2026`. Không đi qua `Date`: một ngày thuần không có múi giờ để lệch. */
function formatDmy(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Thời điểm → `dd/mm/yyyy HH:mm` theo giờ VIỆT NAM, không theo máy người xem: một dòng audit đọc ở hai nơi phải cho cùng một giờ,
 * và "giờ bắt đầu" của một phiên thi chỉ có nghĩa ở nơi phòng thi đặt.
 */
const INSTANT_FORMAT = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  // `h23`, không phải `hour12: false`: một số bản ICU in nửa đêm là "24:00" với `hour12: false`.
  hourCycle: 'h23',
});
function formatInstant(iso: string): string {
  const parts = Object.fromEntries(INSTANT_FORMAT.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

function format(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'có' : 'không';
  if (typeof value === 'string') {
    if (ISO_DATE.test(value)) return formatDmy(value);
    if (ISO_INSTANT.test(value)) return formatInstant(value);
    return UUID.test(value) ? `${value.slice(0, 8)}…` : value;
  }
  if (typeof value === 'number') return String(value);
  const json = JSON.stringify(value);
  return json.length > 40 ? `${json.slice(0, 40)}…` : json;
}
```

3. Thêm hai hàm trợ giúp dưới `diff` (trước `scoreChange`):

```ts
/** Tên đọc được của đối tượng: `targetLabel` ở `newValue` (hoặc `oldValue` với hành động xoá); không có thì 8 ký tự đầu của id. */
function targetOf(entry: DescribableEntry): string {
  const label = entry.newValue?.targetLabel ?? entry.oldValue?.targetLabel;
  return typeof label === 'string' && label !== '' ? label : short(entry.targetId);
}

/** `Sửa {loại} {tên}` kèm danh sách "nhãn cũ → mới" của các trường đổi (nếu có). */
function updateSentence(noun: string, entry: DescribableEntry): string {
  const changes = diff(entry.oldValue, entry.newValue);
  const head = `Sửa ${noun} ${targetOf(entry)}`;
  return changes ? `${head}: ${changes}` : head;
}

/** "thêm N, cập nhật N, giữ nguyên N" của một lần nhập từ file. */
function importSentence(noun: string, entry: DescribableEntry): string {
  const v = entry.newValue ?? {};
  const base = `Nhập ${noun} từ file: thêm ${format(v.added)}, cập nhật ${format(v.updated)}, giữ nguyên ${format(v.unchanged)}`;
  const reassigned = typeof v.reassignedTotal === 'number' && v.reassignedTotal > 0 ? ` — đổi giảng viên ${v.reassignedTotal} lớp` : '';
  return base + reassigned;
}
```

4. Thêm vào `DESCRIBERS` (trước dấu `};` đóng đối tượng):

```ts
  // ---- Dữ liệu nền (plan C, D, E1) ---------------------------------------------------------------------------

  'semester.create': (e) =>
    `Tạo học kỳ ${targetOf(e)} (${format(e.newValue?.startDate)}–${format(e.newValue?.endDate)})`,
  'semester.update': (e) => updateSentence('học kỳ', e),
  'semester.delete': (e) => `Xoá học kỳ ${targetOf(e)}`,
  'semester.import': (e) => importSentence('học kỳ', e),

  'room.create': (e) => {
    const capacity = e.newValue?.capacity;
    return `Thêm phòng ${targetOf(e)}` + (typeof capacity === 'number' ? ` (sức chứa ${capacity})` : '');
  },
  'room.update': (e) => updateSentence('phòng', e),
  'room.delete': (e) => `Xoá phòng ${targetOf(e)}`,
  'room.import': (e) => importSentence('phòng thi', e),

  'administrative_class.create': (e) => `Thêm mã lớp danh nghĩa ${targetOf(e)} vào Danh mục`,
  'administrative_class.update': (e) =>
    `Đổi mã lớp danh nghĩa ${format(e.oldValue?.code)} → ${format(e.newValue?.code)} (nhãn của mọi lớp dùng mã này đổi theo)`,
  'administrative_class.delete': (e) => `Xoá mã lớp danh nghĩa ${targetOf(e)} khỏi Danh mục`,
  'administrative_class.import': (e) => importSentence('mã lớp danh nghĩa', e),

  'class.create': (e) => {
    const teacher = e.newValue?.teacherName;
    return `Tạo lớp ${targetOf(e)}` + (typeof teacher === 'string' ? `, giảng viên ${teacher}` : '');
  },
  'class.update': (e) => updateSentence('lớp', e),
  'class.reassign_teacher': (e) =>
    `Đổi giảng viên lớp ${targetOf(e)}: ${format(e.oldValue?.teacherName)} → ${format(e.newValue?.teacherName)}`,
  'class.delete': (e) => `Xoá lớp ${targetOf(e)}`,
  'class.import': (e) => importSentence('lớp', e),

  // ---- Sửa và huỷ phiên thi (plan F) -------------------------------------------------------------------------

  'exam_session.update': (e) => {
    const code = e.newValue?.code;
    const head = `Sửa phiên thi ${targetOf(e)}` + (typeof code === 'string' ? ` (${code})` : '');
    // `code` và `targetLabel` là NHÃN của đối tượng, không phải trường đã đổi — `diff` chỉ lọc `targetLabel`, nên bỏ `code` ở đây.
    const before = { ...(e.oldValue ?? {}) };
    const after = { ...(e.newValue ?? {}) };
    delete before.code;
    delete after.code;
    const changes = diff(before, after);
    return changes ? `${head}: ${changes}` : head;
  },
  'exam_session.cancel': (e) => {
    const code = e.newValue?.code;
    const reason = e.newValue?.reason;
    return (
      `Huỷ phiên thi ${targetOf(e)}` +
      (typeof code === 'string' ? ` (${code})` : '') +
      (typeof reason === 'string' && reason !== '' ? ` — lý do: ${reason}` : '')
    );
  },
```

Và trong hàm `fallback` đổi dòng tính `target` thành `const target = targetOf(entry);` (cùng một quy tắc, một nơi).

- [ ] **Step 6: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/components/resource/near-duplicate-notice.test.tsx src/lib/audit-describe.test.ts`
Expected: PASS cả ca cũ của plan B lẫn ca mới. Hai ca dễ trượt: (1) ca `exam_session.update` cần `Intl` có dữ liệu `vi-VN` — Node 18+ có `full-icu` mặc định; nếu chạy ra `20/10/2026, 08:00` có dấu phẩy, thay `formatToParts` đúng như code trên (nó dựng chuỗi từ các phần nên không phụ thuộc dấu phân cách của locale); (2) `diff` xuất ra theo thứ tự khoá của `oldValue` rồi `newValue` nên câu "phòng … ; giờ bắt đầu …" đúng thứ tự trong test vì `room` đứng trước `startTime` trong cả hai đối tượng.

- [ ] **Step 7: Chạy cả bộ web và cập nhật danh sách đỏ**

```powershell
cd apps/web
npx vitest run
npx eslint src/lib/api src/hooks src/lib/semester-filter.ts src/lib/semester-filter.test.ts src/components/layout/semester-year-filter.tsx src/components/resource/near-duplicate-notice.tsx src/lib/audit-describe.ts
pnpm exec tsc --noEmit 2>&1 | Select-String -Pattern '^src/' | ForEach-Object { ($_ -split '\(')[0] } | Sort-Object -Unique | Out-File -Encoding utf8 C:/tmp/tsc-red-after-g1.txt
Compare-Object (Get-Content ../../docs/superpowers/plans/md-restore-web-tsc-red.txt) (Get-Content C:/tmp/tsc-red-after-g1.txt)
```

Expected: toàn bộ vitest xanh; ESLint sạch; `Compare-Object` **không có dòng nào** (plan này chỉ thêm file và không sửa file nào đang đỏ — nếu xuất hiện một file MỚI trong danh sách đỏ thì nó là file của plan này: sửa kiểu trong file đó, đừng thêm vào danh sách).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/resource/near-duplicate-notice.tsx apps/web/src/components/resource/near-duplicate-notice.test.tsx apps/web/src/lib/audit-describe.ts apps/web/src/lib/audit-describe.test.ts docs/superpowers/plans/2026-10-05-md-e2-import-web-kit.md
git commit -m "feat(web): khung cảnh báo gần giống khi nhập tay và câu audit cho mọi hành động dữ liệu nền, sửa/huỷ phiên"
```

---

## Tự kiểm lại plan so với spec

- §5.3 (sinh lại client): Task 1, **một lần**, kèm danh sách `tsc` đỏ có chủ ý — spec nói "bỏ bước này thì `apps/web` fail typecheck ở đúng dòng gọi route cũ"; thực tế đảo ngược khi **có** bước này (đổi hợp đồng), nên plan nói rõ cửa sổ đỏ kéo tới hết G4 và đóng nó bằng danh sách tường minh thay vì để người thực thi tự đoán.
- §7.1–7.3 (bộ lọc): một component + một hook dùng chung (Task 4, 5), lựa chọn từ `GET /semesters` (`useSemesters`), mặc định "Tất cả" (`ALL_SEMESTERS`, test hook), chọn năm không chọn kỳ = cả ba kỳ, đổi năm thì kỳ về "tất cả" nếu không thuộc năm mới (`selectYear`), lọc bằng khoá (`toQueryParams`, `matchesSemester`), mỗi màn hình giữ bộ lọc riêng và về mặc định khi chuyển màn hình (`scopeKey`), không bao giờ chặn thao tác (không có trạng thái disabled; vẫn vẽ khi chưa có học kỳ). **Áp dụng vào từng màn hình** (Kỳ thi, Bài thu, Chấm điểm, Lớp của tôi, Dashboard, Admin: Lớp) là việc của G2/G3 — plan này dựng bộ lọc, không thay chỗ dùng. T-FLT-1 (không có bộ lọc theo chuỗi nào còn sót) kiểm ở G3 sau khi thay hết; T-FLT-2 (lọc bằng khoá) ở Task 4–5.
- §2.2/§6.2 nguyên tắc 4 (nhập tay có cảnh báo gần giống): `NearDuplicateError` + `NearDuplicateNotice` (Task 2, 6); trùng cứng tách riêng (Review Focus 6). §2.6 (tra tên theo MSSV): `lookupStudent` (404 → `null`, 429/5xx là lỗi thật) + `useStudentLookup` chỉ chạy khi MSSV hợp lệ để không đốt hạn mức 30 lần/phút; ô tên điền sẵn/khoá là việc của G3. §4.2 (mô tả hành động): Task 6, mọi hành động `semester|room|administrative_class|class.*`, bốn `…import`, `exam_session.update|cancel`; T-AUD-5 (mỗi hành động có câu) ghim bằng bảng ca.
- Quyết định mới, nêu để user duyệt: (a) **`reconcileSelection` dẫn xuất ở render** thay vì effect ghi ngược — tránh một khung hình trỏ vào kỳ đã xoá; (b) `GET /accounts/teachers` trả cả giảng viên đã bị vô hiệu hoá (route chỉ chọn `id`, `name`) nên ô chọn giảng viên ở G2 có thể liệt kê một người mà server sẽ từ chối giao lớp (400 nêu lý do) — chấp nhận ở đợt này, thêm `isActive` vào route là một thay đổi API riêng nếu muốn; (c) khoá lớp là **gốc `['classes']`** (khớp `useTeaching.ts` đang dùng) thay vì hai khoá phẳng — E2 đã sửa theo.
- Placeholder scan: không có "TBD"; mọi bước có mã/lệnh. Kiểu nhất quán: `Semester`/`SemesterRef` (Task 2/4) thoả cấu trúc của nhau; `SemesterYearFilterState.matches` và `params` là thứ G3 dùng; `MASTER_DATA_KEYS` (E2) dùng trong mọi hook; `NearDuplicateNotice` nhận đúng `NearDuplicateError` của `http-error.ts`; G2 dùng `useCreateRoom().mutateAsync` và bắt `NearDuplicateError` từ `create.error`.
