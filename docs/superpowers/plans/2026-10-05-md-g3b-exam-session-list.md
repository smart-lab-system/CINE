# Plan G3b — "Quản lý kỳ thi": nhãn lớp, bộ lọc Năm học → Học kỳ, dashboard và bộ chọn phiên

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Màn hình danh sách phiên thi của giảng viên (bảng và lịch), dashboard và bộ chọn phiên ở "Soạn đề" theo hợp đồng mới của `GET /exam-sessions` (plan D3): lớp hiện bằng **nhãn gộp** (`classLabel`), học kỳ lọc bằng **khoá** qua bộ lọc Năm học → Học kỳ dùng chung (G1), và danh sách lựa chọn học kỳ **không còn** đến từ `semesterNames` do server dựng từ chuỗi gõ tay.

**Architecture:** Đổi kiểu `ExamSessionListItem` / `SearchExamSessionsParams` ở `lib/api/exam-session.ts` (bỏ `semesterName`, `semesterNames`, `className`; thêm `semesterId`, `academicYear`, `term`, `classLabel`), rồi thay **từng chỗ** trang danh sách dùng bộ lọc theo chuỗi bằng `useSemesterYearFilter` + `SemesterYearFilter`. Dashboard thêm đúng bộ lọc đó cho con số "tổng số phiên" (spec §7.2). Phần **tạo/sửa phiên** (form, nút Sửa/Huỷ, `ExamSessionResponse`) là plan G4 — plan này chỉ đụng hợp đồng **danh sách**.

**Tech Stack:** Next.js 15, React 19, TanStack Query 5, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §4 (`GET /exam-sessions`: `semesterId`/`academicYear`, bỏ `semesterNames`, dòng thêm `semesterId/academicYear/term/classLabel`), §7.2 (bảng "màn hình → bộ lọc": Giảng viên: Kỳ thi = Năm học + học kỳ cùng các bộ lọc có sẵn; Dashboard = tổng số phiên theo bộ lọc; mặc định "Tất cả học kỳ" ở mọi màn hình; mỗi màn hình giữ bộ lọc riêng), §7.3, §11: T-FLT-1, T-FLT-2.

**Phụ thuộc:** plan G1 (`useSemesterYearFilter`, `SemesterYearFilter`, `lib/semester-filter.ts`), plan G3a (`TeachingClass` mới có `label`/`labelWithSemester`); API plan D3.

## Global Constraints

- **Hợp đồng danh sách (D3):** `ExamSessionListItem` mang `classLabel`, `semesterId`, `academicYear`, `term` và **không** còn `className`; **giữ** `semesterName` (bản chụp lúc tạo phiên, để bảng điểm/cột hiển thị). `SearchExamSessionsParams` bỏ `semesterName`, thêm `semesterId?: string` và `academicYear?: number`; phản hồi **không còn** `semesterNames`. Vắng mặt = "tất cả" — gửi `undefined` (không gửi tham số), không bao giờ gửi chuỗi rỗng hay `null` (openapi-fetch serialize chúng thành `?semesterId=` và `@IsUUID` trả 400).
- **Lọc bằng khoá, ở SERVER:** danh sách phân trang ở server nên bộ lọc kỳ đi lên server (`...semesterFilter.params`), không lọc trong trình duyệt trên trang đang xem (cắt 20 dòng và nói dối về tổng số — cùng lý do `classId` đã nêu).
- **Mặc định "Tất cả học kỳ"** (đảo mặc định "kỳ hợp lý nhất hôm nay" của bản cũ): không màn hình nào mở ra đã lọc sẵn theo một kỳ người dùng không chọn. `scopeKey = 'teacher-exam-sessions'` (và `'teacher-dashboard'`): chuyển màn hình thì về "Tất cả".
- **Đổi bộ lọc quay về trang 1** (đã là hành vi của trang cho học kỳ và lớp): trang 3 của bộ lọc này có thể không tồn tại ở bộ lọc kia và bảng hiện ra rỗng như thể không có phiên nào.
- **"Xoá bộ lọc" vẫn KHÔNG đụng tới học kỳ** (hành vi hiện có, test hiện có giữ nguyên ý): học kỳ là **phạm vi đang xem**, không phải một bộ lọc trong phạm vi đó; lối ra là chính bộ lọc năm học/học kỳ và nút "Xem tất cả học kỳ" ở màn trống.
- **Ô lọc lớp** liệt kê lớp bằng `labelWithSemester` (danh sách gồm lớp của nhiều kỳ, hai lớp cùng mã khác kỳ phải phân biệt được); vẫn **ẩn khi chỉ có một lớp**.
- **Tên lớp ở mọi nơi trong phạm vi plan này đọc `classLabel`** (bảng, lịch, bộ chọn phiên); không còn chỗ nào đọc `className` của `ExamSessionListItem`.
- Không đổi: trình tự lịch, phân trang, tìm kiếm, bộ lọc trạng thái/loại kỳ thi; `hooks/useSemesterFilter.ts` và `components/layout/semester-filter.tsx` (theo chuỗi) **ở lại** tới khi plan G3c/G3d thay hết nơi dùng — plan G3d xoá chúng.
- `apps/web` còn `tsc` đỏ chỉ ở các file của G3c, G3d, G4 sau plan này (danh sách `md-restore-web-tsc-red.txt` bớt đi file của plan này).

## Review Focus

1. **Mặc định vẫn lọc sẵn một kỳ** (che mất phiên của kỳ cũ). → test: render lần đầu không gửi `semesterId`/`academicYear` (Task 2).
2. **Gửi `semesterId=` rỗng / `null` lên server** → 400 và trang hiện lỗi thay vì "tất cả". → test khẳng định tham số **vắng mặt**, không phải `undefined`-có-khoá-hay-chuỗi-rỗng (Task 2).
3. **Danh sách phiên hiển thị `undefined`/`null` ở cột Lớp** vì còn đọc `className`. → fixture mới không có `className`; test đòi `classLabel` hiện (Task 2, 3).
4. **Ô học kỳ chỉ liệt kê kỳ có phiên trên trang đang xem** (hành vi cũ). → lựa chọn lấy từ `useSemesterYearFilter` (bảng học kỳ); test: kỳ không có phiên nào vẫn chọn được (Task 2).
5. **Đổi kỳ không về trang 1.** → test (Task 2).
6. **Dashboard đếm toàn bộ phiên dù người dùng đã chọn kỳ** (hoặc ngược lại: lọc sẵn một kỳ). → hai ca: mặc định không tham số; chọn kỳ thì có tham số và lời chú thích đổi (Task 4).
7. **Lịch tuần không đi kèm bộ lọc kỳ.** → test: truy vấn lịch nhận cùng `params` (Task 2).

---

## File Structure

| File | Việc |
|---|---|
| `apps/web/src/lib/api/exam-session.ts` (+ `exam-session-list.test.ts` mới) | Kiểu danh sách, tham số tìm, bỏ `semesterNames`. |
| `apps/web/src/app/teacher/exam-sessions/page.tsx`, `page.test.tsx` | Bộ lọc dùng chung, `classLabel`, ô lọc lớp theo `labelWithSemester`. |
| `apps/web/src/app/teacher/exam-sessions/_components/session-calendar.tsx` | `classLabel`. |
| `apps/web/src/app/teacher/exam-authoring/_components/session-picker.tsx`, `page.test.tsx` | `classLabel` (và fixture). |
| `apps/web/src/app/teacher/dashboard/page.tsx` (+ `page.test.tsx` mới) | Bộ lọc năm học → học kỳ cho tổng số phiên. |

---

### Task 1: Kiểu và hàm API của danh sách phiên

**Files:**
- Modify: `apps/web/src/lib/api/exam-session.ts`
- Test: `apps/web/src/lib/api/exam-session-list.test.ts`

**Interfaces:**
- Consumes: `apiClient.GET('/exam-sessions')` (client đã sinh lại ở G1).
- Produces:

```ts
export interface ExamSessionListItem {
  id: string; name: string; code: string; courseName: string;
  classLabel: string;                       // thay `className`
  semesterId: string | null; academicYear: number | null; term: number | null;
  roomName: string;
  semesterName: string;                     // bản chụp lúc tạo phiên — giữ
  examType: ExamType; startTime: string; endTime: string; status: string;
}
export interface SearchExamSessionsParams {
  page: number; pageSize: number; search?: string; status?: ExamSessionStatusFilter; examType?: ExamType;
  semesterId?: string; academicYear?: number;   // thay `semesterName`
  classId?: string; from?: string; to?: string;
}
export function listExamSessions(params: SearchExamSessionsParams): Promise<{ items: ExamSessionListItem[]; total: number }>;
export function listExamSessionsInRange(params: SearchExamSessionsParams & { from: string; to: string }): Promise<{ items: ExamSessionListItem[]; total: number }>;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/lib/api/exam-session-list.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { GET: (...a: unknown[]) => get(...a), POST: vi.fn() } }));

import { listExamSessions, listExamSessionsInRange } from './exam-session';

const ok = (data: unknown) => ({ data, error: undefined, response: { ok: true, status: 200 } });

describe('listExamSessions', () => {
  beforeEach(() => get.mockReset());

  it('trả items và total; KHÔNG còn semesterNames (danh sách kỳ lấy từ bảng học kỳ)', async () => {
    get.mockResolvedValue(ok({ items: [{ id: 's1', classLabel: 'DHKTPM18A – Nhóm 1' }], total: 1 }));
    const result = await listExamSessions({ page: 1, pageSize: 20 });
    expect(result).toEqual({ items: [{ id: 's1', classLabel: 'DHKTPM18A – Nhóm 1' }], total: 1 });
    expect(result).not.toHaveProperty('semesterNames');
  });

  it('truyền nguyên tham số lên query, gồm semesterId và academicYear', async () => {
    get.mockResolvedValue(ok({ items: [], total: 0 }));
    await listExamSessions({ page: 2, pageSize: 20, semesterId: 's1', academicYear: 2026, classId: 'c1' });
    expect(get).toHaveBeenCalledWith('/exam-sessions', {
      params: { query: { page: 2, pageSize: 20, semesterId: 's1', academicYear: 2026, classId: 'c1' } },
    });
  });

  it('listExamSessionsInRange là cùng endpoint với from/to', async () => {
    get.mockResolvedValue(ok({ items: [], total: 0 }));
    await listExamSessionsInRange({ page: 1, pageSize: 20, from: '2026-10-05T00:00:00.000Z', to: '2026-10-12T00:00:00.000Z' });
    expect(get).toHaveBeenCalledWith('/exam-sessions', expect.objectContaining({
      params: { query: expect.objectContaining({ from: '2026-10-05T00:00:00.000Z', to: '2026-10-12T00:00:00.000Z' }) },
    }));
  });

  it('lỗi của server được ném lại', async () => {
    get.mockResolvedValue({ data: undefined, error: new Error('Không tải được'), response: { ok: false, status: 500 } });
    await expect(listExamSessions({ page: 1, pageSize: 20 })).rejects.toThrow('Không tải được');
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/lib/api/exam-session-list.test.ts`
Expected: FAIL ở ca đầu — hàm hiện còn ép kiểu về `{ items; total; semesterNames }` nhưng **giá trị** trả về là `data` nguyên văn, nên ca này có thể xanh; ca còn lại đỏ/xanh tuỳ cách `query` được tạo. Mục đích của test là khoá **kiểu** (qua `tsc`) và hành vi gọi — nếu cả bốn ca xanh ngay, vẫn tiếp tục: bước 3 sửa kiểu để `tsc` (không phải vitest) bắt người dùng `semesterNames`/`className`.

- [ ] **Step 3: Sửa kiểu và chữ ký**

Trong `apps/web/src/lib/api/exam-session.ts`:

1. Thay `ExamSessionListItem` bằng:

```ts
// Mirrors ExamSessionListItemDto — deliberately leaner than
// ExamSessionResponse (no requiredDeliverables), matching the list
// endpoint's own lean query.
export interface ExamSessionListItem {
  id: string;
  name: string;
  code: string;
  courseName: string;
  /**
   * Nhãn gộp của lớp, `DHKTPM18A – Nhóm 1` (view `class_label` ở server). Từng là `className` — tên lớp là một cột, nay là biểu thức của
   * mã lớp danh nghĩa + nhóm, nên đổi mã một lần là mọi nơi đổi theo.
   */
  classLabel: string;
  /**
   * Học kỳ HIỆN TẠI của lớp (`class.semester_id`), nguồn của bộ lọc Năm học → Học kỳ. `null` chỉ với lớp cũ chưa backfill. KHÁC
   * `semesterName` bên dưới: cái này là khoá để LỌC, cái kia là chữ đã chụp để IN.
   */
  semesterId: string | null;
  academicYear: number | null;
  term: number | null;
  roomName: string;
  /** Nhãn học kỳ CHỤP lúc tạo phiên (CLAUDE.md §7.1.5) — bảng điểm in chữ này; không đổi khi admin sửa học kỳ. */
  semesterName: string;
  examType: ExamType;
  startTime: string;
  endTime: string;
  status: string;
}
```

2. Trong `SearchExamSessionsParams` thay trường `semesterName?: string;` (cùng khối chú thích của nó) bằng:

```ts
  /**
   * Học kỳ của LỚP (khoá), không phải chữ đã chụp trên phiên. Bỏ trống = tất cả học kỳ.
   *
   * `undefined`, KHÔNG phải `null`: openapi-fetch serialize null thành `?semesterId=` và `@IsUUID` ở backend sẽ trả 400 cho chuỗi rỗng đó.
   */
  semesterId?: string;
  /** Năm học (2026 nghĩa là 2026-2027): cả ba kỳ của năm đó. AND với `semesterId` nếu cả hai có mặt. */
  academicYear?: number;
```

3. Thay hai chữ ký trả về có `semesterNames` bằng `{ items: ExamSessionListItem[]; total: number }`:

```ts
export async function listExamSessionsInRange(
  params: SearchExamSessionsParams & { from: string; to: string },
): Promise<{ items: ExamSessionListItem[]; total: number }> {
  return listExamSessions(params);
}

export async function listExamSessions(
  params: SearchExamSessionsParams,
): Promise<{ items: ExamSessionListItem[]; total: number }> {
  const { data, error, response } = await apiClient.GET('/exam-sessions', {
    params: { query: params },
  });
  await throwIfFailed(error, response);
  return data as unknown as { items: ExamSessionListItem[]; total: number };
}
```

(Khối chú thích dài về `semesterNames` bị xoá cùng: danh sách lựa chọn học kỳ nay đến từ `GET /semesters`, không còn từ phản hồi này.)

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/lib/api/exam-session-list.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api/exam-session.ts apps/web/src/lib/api/exam-session-list.test.ts
git commit -m "feat(web): hợp đồng danh sách phiên thi — classLabel, semesterId/academicYear/term, bỏ semesterNames"
```

---

### Task 2: Trang "Quản lý kỳ thi" dùng bộ lọc dùng chung và nhãn lớp

**Files:**
- Modify: `apps/web/src/app/teacher/exam-sessions/page.tsx`, `apps/web/src/app/teacher/exam-sessions/page.test.tsx`

**Interfaces:**
- Consumes: Task 1; `useSemesterYearFilter`, `SemesterYearFilter`, `isFiltering` (G1); `TeachingClass.labelWithSemester` (G3a).

- [ ] **Step 1: Cập nhật test (đỏ)**

Trong `apps/web/src/app/teacher/exam-sessions/page.test.tsx`:

**1a.** Thay toàn bộ khối từ dòng chú thích `// Bộ lọc học kỳ đọc \`useSemesterFilter\`…` đến hết `function semesterState(...) {…}` (gồm cả `CURRENT_SEMESTER`, `OLD_SEMESTER`, `setSemesterName`, `useSemesterFilterMock`) bằng:

```tsx
// Bộ lọc Năm học → Học kỳ DÙNG CHUNG (plan G1): trang đọc `useSemesterYearFilter`, hook đó đọc bảng học kỳ qua `useSemesters`. Mock chỉ cần
// điều khiển lựa chọn hiện tại và ghi nhận lời gọi — danh sách lựa chọn đến từ `semesters` của chính mock, KHÔNG từ các phiên đã tải
// (một kỳ không có phiên nào vẫn phải chọn được).
const useFilterMock = vi.fn();
const setYear = vi.fn();
const setSemester = vi.fn();
const clearSemester = vi.fn();

vi.mock('@/hooks/useSemesterYearFilter', () => ({
  useSemesterYearFilter: (...args: unknown[]) => useFilterMock(...args),
}));

const SEMESTERS = [
  { id: 's2', academicYearStart: 2026, term: 2, label: 'HK2 2026-2027' },
  { id: 's1', academicYearStart: 2026, term: 1, label: 'HK1 2026-2027' },
  { id: 'old', academicYearStart: 2025, term: 2, label: 'HK2 2025-2026' },
];

function filterState(selection = { academicYear: null as number | null, semesterId: null as string | null }) {
  const params: { semesterId?: string; academicYear?: number } = {};
  if (selection.semesterId !== null) params.semesterId = selection.semesterId;
  else if (selection.academicYear !== null) params.academicYear = selection.academicYear;
  return {
    semesters: SEMESTERS,
    isLoading: false,
    selection,
    setYear,
    setSemester,
    clear: clearSemester,
    params,
    matches: () => true,
  };
}

/** Phiên mà server trả cho giảng viên: nhãn lớp gộp, học kỳ của lớp theo khoá, và bản chụp nhãn học kỳ. */
const SEMESTER_SNAPSHOT = 'HK1 2026-2027';
```

**1b.** Trong `session()` đổi `className: 'Nhóm 01',` thành `classLabel: 'Nhóm 01',` và đổi `semesterName: CURRENT_SEMESTER,` thành

```ts
    semesterName: SEMESTER_SNAPSHOT,
    semesterId: 's1',
    academicYear: 2026,
    term: 1,
```

**1c.** Thay `beforeEach` bằng:

```tsx
beforeEach(() => {
  setYear.mockReset();
  setSemester.mockReset();
  clearSemester.mockReset();
  useFilterMock.mockReset();
  // MẶC ĐỊNH "Tất cả" — không chọn hộ ai một kỳ (Review Focus 1).
  useFilterMock.mockReturnValue(filterState());
  useTeachingClassesMock.mockReset();
  // Một lớp là mặc định: ô lọc lớp bị ẩn, nên mọi test cũ không đổi hành vi.
  useTeachingClassesMock.mockReturnValue({
    data: [
      {
        id: 'k1',
        label: 'Nhóm 01',
        labelWithSemester: 'Nhóm 01 · HK1 2026-2027',
        courseName: 'CTDL&GT',
        semesterId: 's1',
        academicYear: 2026,
        term: 1,
        studentCount: 30,
      },
    ],
  });
  useExamSessionsMock.mockReset();
  useExamSessionsMock.mockReturnValue({
    data: { items: [session()], total: 1 },
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  });
  useExamSessionsInRangeMock.mockReset();
  useExamSessionsInRangeMock.mockReturnValue({
    data: { items: [], total: 0 },
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  });
  window.localStorage.clear();
});
```

**1d.** Trong ca `shows a distinct empty state, with a clear-filters action…` xoá dòng `useSemesterFilterMock.mockReturnValue(semesterState(null));` (mặc định đã là "Tất cả") và đổi chú thích trên nó cho khớp; các khẳng định giữ nguyên.

**1e.** Thay ba ca `sends the selected semester to the API…`, `chọn học kỳ khác thì đổi kỳ và quay về trang 1`, `kỳ rỗng nói khác "chưa có phiên thi nào"…` bằng:

```tsx
  it('Review Focus 1, 2: mặc định KHÔNG gửi tham số học kỳ nào; chọn kỳ thì gửi semesterId (khoá), không gửi chuỗi', () => {
    render(<ExamSessionsListPage />);
    const first = useExamSessionsMock.mock.calls.at(-1)?.[0];
    // "Tất cả học kỳ" là KHÔNG gửi tham số, không phải `semesterId: undefined`-hay-chuỗi-rỗng: openapi-fetch serialize chúng thành
    // `?semesterId=` và `@IsUUID` ở backend trả 400.
    expect(first).not.toHaveProperty('semesterId');
    expect(first).not.toHaveProperty('academicYear');
    expect(first).not.toHaveProperty('semesterName');

    useFilterMock.mockReturnValue(filterState({ academicYear: 2026, semesterId: 's2' }));
    render(<ExamSessionsListPage />);
    expect(useExamSessionsMock).toHaveBeenLastCalledWith(expect.objectContaining({ semesterId: 's2' }));
  });

  it('chỉ chọn NĂM học thì gửi academicYear (cả ba kỳ của năm đó)', () => {
    useFilterMock.mockReturnValue(filterState({ academicYear: 2026, semesterId: null }));
    render(<ExamSessionsListPage />);
    expect(useExamSessionsMock).toHaveBeenLastCalledWith(expect.objectContaining({ academicYear: 2026 }));
    expect(useExamSessionsMock.mock.calls.at(-1)?.[0]).not.toHaveProperty('semesterId');
  });

  it('Review Focus 7: truy vấn LỊCH đi kèm cùng bộ lọc học kỳ', () => {
    useFilterMock.mockReturnValue(filterState({ academicYear: 2026, semesterId: 's2' }));
    render(<ExamSessionsListPage />);
    expect(useExamSessionsInRangeMock.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ semesterId: 's2' }));
  });

  it('Review Focus 4, 5: chọn học kỳ khác — kỳ KHÔNG có phiên nào trên trang vẫn chọn được — rồi quay về trang 1', () => {
    // Một phiên duy nhất trong `items`, mà ô kỳ vẫn liệt kê cả "HK2 2025-2026": danh sách lấy từ bảng học kỳ chứ không từ các dòng đã
    // tải — đúng tình huống bản cũ làm sai, khi nó suy danh sách từ trang đang xem nên kỳ cũ biến mất khỏi dropdown.
    useExamSessionsMock.mockReturnValue({
      data: { items: [session()], total: 2 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ExamSessionsListPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    fireEvent.click(screen.getByRole('option', { name: 'HK2 2025-2026' }));

    expect(setSemester).toHaveBeenCalledWith('old');
    // Trang phải reset: đang ở trang 3 của kỳ này rồi đổi kỳ sẽ rơi vào một trang 3 không tồn tại của kỳ kia, và bảng hiện ra rỗng.
    expect(useExamSessionsMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('chọn năm học gọi setYear và quay về trang 1', () => {
    render(<ExamSessionsListPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo năm học' }));
    fireEvent.click(screen.getByRole('option', { name: '2025-2026' }));

    expect(setYear).toHaveBeenCalledWith(2025);
    expect(useExamSessionsMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('kỳ rỗng nói khác "chưa có phiên thi nào", và mở được đường sang tất cả học kỳ', () => {
    // Hai câu chuyện khác nhau, không được nói chung một câu: "bạn chưa tạo phiên nào bao giờ" cần nút Tạo, còn "kỳ này bạn không có
    // phiên" chỉ cần đổi bộ lọc — cùng khuôn với "Lớp của tôi".
    useFilterMock.mockReturnValue(filterState({ academicYear: 2026, semesterId: 's1' }));
    useExamSessionsMock.mockReturnValue({
      data: { items: [], total: 0 },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    render(<ExamSessionsListPage />);

    expect(screen.getByText('Không có phiên thi nào trong học kỳ này')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có phiên thi nào')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xem tất cả học kỳ' }));
    expect(clearSemester).toHaveBeenCalled();
  });

  it('Review Focus 3: cột Lớp hiện nhãn gộp `classLabel`, không phải `undefined`', () => {
    render(<ExamSessionsListPage />);
    expect(within(screen.getByRole('row', { name: /Giữa kỳ Lập trình Web/ })).getByText('Nhóm 01')).toBeInTheDocument();
  });
```

**1f.** Trong các ca lớp (`từ hai lớp trở lên…`, `"tất cả lớp" gửi undefined…`, `"Xoá bộ lọc" trả cả bộ lọc LỚP về mặc định`) thay mỗi mock hai lớp bằng:

```ts
      data: [
        { id: 'k1', label: 'Nhóm 01', labelWithSemester: 'Nhóm 01 · HK1 2026-2027', courseName: 'CTDL&GT', semesterId: 's1', academicYear: 2026, term: 1, studentCount: 30 },
        { id: 'k2', label: 'Nhóm 02', labelWithSemester: 'Nhóm 02 · HK1 2026-2027', courseName: 'CTDL&GT', semesterId: 's1', academicYear: 2026, term: 1, studentCount: 28 },
      ],
```

và đổi mọi `screen.getByRole('option', { name: 'Nhóm 02' })` thành `screen.getByRole('option', { name: 'Nhóm 02 · HK1 2026-2027' })`. Trong ca cuối của nhóm đó (`"Xoá bộ lọc" trả cả bộ lọc LỚP…`) đổi `data: { items: [], total: 0, semesterNames: [CURRENT_SEMESTER] }` thành `data: { items: [], total: 0 }`.

**1g.** Ca `một lớp thì KHÔNG hiện ô lọc lớp`: giữ nguyên các khẳng định (`getByRole('combobox', { name: 'Lọc theo học kỳ' })` vẫn đúng — bộ lọc dùng chung giữ nhãn đó) và thêm một dòng `expect(screen.getByRole('combobox', { name: 'Lọc theo năm học' })).toBeInTheDocument();`.

**1h.** Ca cuối của `describe('… — filters')` (`"Xoá bộ lọc" resets every filter back to its default`): đổi `expect(setSemesterName).not.toHaveBeenCalled();` thành `expect(clearSemester).not.toHaveBeenCalled(); expect(setSemester).not.toHaveBeenCalled();` (học kỳ là phạm vi đang xem; "Xoá bộ lọc" vẫn không đụng tới nó).

**1i.** Trong `describe('… — chế độ xem lịch')` đổi hai mock `semesterNames: []` còn lại (`data: { items: [session()], total: 1, semesterNames: [] }` và `data: { items: [ … ], total: 2, semesterNames: [] }`) thành không có khoá `semesterNames`.

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/app/teacher/exam-sessions/page.test.tsx`
Expected: FAIL — trang còn import `useSemesterFilter`/`SemesterFilter` (mock mới không có), còn gửi `semesterName`, còn đọc `className`.

- [ ] **Step 3: Sửa trang**

Trong `apps/web/src/app/teacher/exam-sessions/page.tsx`:

1. **Imports.** Đổi `import { useEffect, useState } from 'react';` thành `import { useState } from 'react';`. Thay hai dòng
```tsx
import { semesterOptions, useSemesterFilter } from '@/hooks/useSemesterFilter';
import { SemesterFilter } from '@/components/layout/semester-filter';
```
bằng
```tsx
import { useSemesterYearFilter } from '@/hooks/useSemesterYearFilter';
import { SemesterYearFilter } from '@/components/layout/semester-year-filter';
import { isFiltering } from '@/lib/semester-filter';
```

2. **Bộ lọc.** Thay `const semesterFilter = useSemesterFilter('teacher-exam-sessions');` bằng `const semesterFilter = useSemesterYearFilter('teacher-exam-sessions');`.

3. **Tham số truy vấn (hai chỗ).** Thay mỗi cặp dòng
```tsx
    // `?? undefined`: null nghĩa là "tất cả kỳ", và cách nói điều đó với
    // API là KHÔNG gửi tham số — xem doc của SearchExamSessionsParams.
    semesterName: semesterFilter.semesterName ?? undefined,
```
(ở `useExamSessions`) và
```tsx
      semesterName: semesterFilter.semesterName ?? undefined,
```
(ở `useExamSessionsInRange`) bằng, theo thứ tự:
```tsx
    // "Tất cả" là KHÔNG gửi tham số (`params` rỗng) — không `undefined`-có-khoá, không chuỗi rỗng. Xem doc của SearchExamSessionsParams.
    ...semesterFilter.params,
```
và
```tsx
      ...semesterFilter.params,
```

4. **Xoá** toàn bộ khối từ dòng chú thích `// Danh sách kỳ đến từ SERVER, tính trên toàn bộ phiên…` đến hết `const semesterChoices = semesterOptions([ … ]);` (gồm `knownSemesters`, `setKnownSemesters` và `useEffect`).

5. **Handler.** Thay hàm `handleSemesterChange` bằng ba hàm:
```tsx
  function handleYearChange(year: number | null) {
    semesterFilter.setYear(year);
    // Đổi phạm vi thì về trang 1: trang 3 của phạm vi này có thể không tồn tại ở phạm vi kia, và bảng hiện ra rỗng như thể không có phiên nào.
    setPage(1);
  }

  function handleSemesterChange(semesterId: string | null) {
    semesterFilter.setSemester(semesterId);
    setPage(1);
  }

  function showAllSemesters() {
    semesterFilter.clear();
    setPage(1);
  }
```

6. **JSX bộ lọc.** Thay
```tsx
        <SemesterFilter
          value={semesterFilter.semesterName}
          onChange={handleSemesterChange}
          semesters={semesterChoices}
        />
```
bằng
```tsx
        <SemesterYearFilter
          semesters={semesterFilter.semesters}
          selection={semesterFilter.selection}
          onYearChange={handleYearChange}
          onSemesterChange={handleSemesterChange}
        />
```

7. **Ô lọc lớp.** Trong `classChoices.map((klass) => ( <SelectItem …>{klass.name}</SelectItem> ))` đổi `{klass.name}` thành `{klass.labelWithSemester}` (kèm chú thích: "danh sách gồm lớp của nhiều kỳ — hai lớp cùng mã khác kỳ phải phân biệt được").

8. **Màn trống.** Đổi điều kiện `semesterFilter.semesterName !== null ? (` thành `isFiltering(semesterFilter.selection) ? (` và `onClick={() => handleSemesterChange(null)}` thành `onClick={showAllSemesters}`.

9. **Cột Lớp.** Đổi `{session.className ?? String.fromCharCode(8212)}` thành `{session.classLabel}`.

Cập nhật khối chú thích đầu hàm `ExamSessionsListPage` (đoạn nói "mặc định là kỳ hợp lý nhất hôm nay") thành: "Lọc theo học kỳ bằng KHOÁ qua bộ lọc Năm học → Học kỳ dùng chung (`useSemesterYearFilter`), MẶC ĐỊNH 'Tất cả' — một bộ lọc mặc định đã che mất việc tồn đọng của kỳ cũ (CLAUDE.md §1.2: học kỳ không bao giờ chặn một thao tác)."

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/app/teacher/exam-sessions/page.test.tsx`
Expected: PASS (cả `filters`, `chế độ xem lịch`). Hai ca dễ trượt: `not.toHaveProperty('semesterId')` đòi `...semesterFilter.params` **không** tạo khoá khi rỗng; và ca "kỳ không có phiên nào vẫn chọn được" đòi option `HK2 2025-2026` có mặt dù `items` chỉ có phiên của kỳ khác.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/teacher/exam-sessions/page.tsx apps/web/src/app/teacher/exam-sessions/page.test.tsx
git commit -m "feat(web): Quản lý kỳ thi lọc bằng khoá qua bộ lọc Năm học → Học kỳ dùng chung, nhãn lớp gộp, mặc định Tất cả"
```

---

### Task 3: Lịch tuần và bộ chọn phiên đọc nhãn lớp

**Files:**
- Modify: `apps/web/src/app/teacher/exam-sessions/_components/session-calendar.tsx`, `apps/web/src/app/teacher/exam-authoring/_components/session-picker.tsx`, `apps/web/src/app/teacher/exam-authoring/page.test.tsx`
- Test: `apps/web/src/app/teacher/exam-sessions/_components/session-calendar.test.tsx` (mới), `apps/web/src/app/teacher/exam-authoring/_components/session-picker.test.ts` (thêm ca)

**Interfaces:**
- Consumes: `ExamSessionListItem.classLabel`.

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/app/teacher/exam-sessions/_components/session-calendar.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ExamSessionListItem } from '@/lib/api/exam-session';
import { startOfWeek } from '@/lib/exam-calendar';
import { SessionCalendar } from './session-calendar';

function sessionAt(weekStart: Date, overrides: Partial<ExamSessionListItem> = {}): ExamSessionListItem {
  const start = new Date(weekStart);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(11, 0, 0, 0);
  return {
    id: 's1',
    name: 'Giữa kỳ CTDL',
    code: 'ABC123',
    courseName: 'CTDL&GT',
    classLabel: 'DHKTPM18A – Nhóm 1',
    semesterId: 's1',
    academicYear: 2026,
    term: 1,
    roomName: 'Phòng máy A1',
    semesterName: 'HK1 2026-2027',
    examType: 'GK',
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    status: 'scheduled',
    ...overrides,
  };
}

describe('SessionCalendar', () => {
  it('Review Focus 3: thẻ phiên hiện phòng · NHÃN LỚP · loại kỳ thi (không phải "undefined")', () => {
    const weekStart = startOfWeek(new Date());
    render(<SessionCalendar sessions={[sessionAt(weekStart)]} weekStart={weekStart} />);

    const grid = screen.getByRole('table');
    expect(within(grid).getByText(/Phòng máy A1 · DHKTPM18A – Nhóm 1 ·/)).toBeInTheDocument();
    expect(within(grid).queryByText(/undefined/)).not.toBeInTheDocument();
  });
});
```

Trong `apps/web/src/app/teacher/exam-authoring/_components/session-picker.test.ts` thêm vào `describe` đầu một ca (nếu file chưa export hàm `when`, xem Step 3 — hàm được export để test được):

```ts
import { when } from './session-picker';
// …
it('Review Focus 3: dòng mô tả phiên đọc classLabel', () => {
  const text = when({
    id: 's',
    name: 'Giữa kỳ',
    code: 'ABC123',
    courseName: 'CTDL&GT',
    classLabel: 'DHKTPM18A – Nhóm 1',
    semesterId: 's1',
    academicYear: 2026,
    term: 1,
    roomName: 'B2.07',
    semesterName: 'HK1 2026-2027',
    examType: 'GK',
    startTime: new Date(2026, 9, 20, 8, 30).toISOString(),
    endTime: new Date(2026, 9, 20, 10, 30).toISOString(),
    status: 'active',
  });
  expect(text).toBe('20/10 · 08:30 · B2.07 · DHKTPM18A – Nhóm 1');
});
```

Trong `apps/web/src/app/teacher/exam-authoring/page.test.tsx` đổi fixture `session()` (dòng `className: 'Nhóm 01',`) thành:

```ts
    classLabel: 'Nhóm 01',
    semesterId: 's1',
    academicYear: 2026,
    term: 1,
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/app/teacher/exam-sessions/_components src/app/teacher/exam-authoring`
Expected: FAIL — lịch và bộ chọn còn đọc `className`; `when` chưa được export.

- [ ] **Step 3: Sửa hai component**

Trong `session-calendar.tsx` đổi `{session.roomName} · {session.className} ·{' '}` thành `{session.roomName} · {session.classLabel} ·{' '}`.

Trong `session-picker.tsx`: đổi `return \`${d}/${m} · ${hh}:${mm} · ${session.roomName} · ${session.className}\`;` thành `... ${session.classLabel}\`;` và thêm `export` vào đầu `function when(session: ExamSessionListItem): string {` (thành `export function when(…)`), kèm chú thích "export để test được".

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/app/teacher/exam-sessions/_components src/app/teacher/exam-authoring`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/teacher/exam-sessions/_components apps/web/src/app/teacher/exam-authoring
git commit -m "feat(web): lịch tuần và bộ chọn phiên đọc nhãn lớp gộp"
```

---

### Task 4: Dashboard — tổng số phiên theo bộ lọc

**Files:**
- Modify: `apps/web/src/app/teacher/dashboard/page.tsx`
- Test: `apps/web/src/app/teacher/dashboard/page.test.tsx`

**Interfaces:**
- Consumes: `useExamSessions`, `useSemesterYearFilter`, `SemesterYearFilter`, `isFiltering`.

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/app/teacher/dashboard/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TeacherDashboardPage from './page';

const useExamSessionsMock = vi.fn();
const useFilterMock = vi.fn();
vi.mock('@/hooks/useExamSession', () => ({ useExamSessions: (...args: unknown[]) => useExamSessionsMock(...args) }));
vi.mock('@/hooks/useSemesterYearFilter', () => ({ useSemesterYearFilter: (...args: unknown[]) => useFilterMock(...args) }));

const filterState = (selection = { academicYear: null as number | null, semesterId: null as string | null }, params = {}) => ({
  semesters: [{ id: 's1', academicYearStart: 2026, term: 1, label: 'HK1 2026-2027' }],
  isLoading: false,
  selection,
  setYear: vi.fn(),
  setSemester: vi.fn(),
  clear: vi.fn(),
  params,
  matches: () => true,
});

describe('TeacherDashboardPage', () => {
  beforeEach(() => {
    useExamSessionsMock.mockReset().mockReturnValue({ data: { items: [], total: 12 }, isLoading: false, isError: false });
    useFilterMock.mockReset().mockReturnValue(filterState());
  });

  it('Review Focus 6: mặc định đếm TẤT CẢ phiên — không gửi tham số học kỳ', () => {
    render(<TeacherDashboardPage />);

    expect(useExamSessionsMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 1 });
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Tổng số phiên thi bạn đã tạo')).toBeInTheDocument();
    expect(useFilterMock).toHaveBeenCalledWith('teacher-dashboard');
  });

  it('chọn kỳ thì tham số đi lên server và lời chú thích nói đây là số theo bộ lọc', () => {
    useFilterMock.mockReturnValue(filterState({ academicYear: 2026, semesterId: 's1' }, { semesterId: 's1' }));
    render(<TeacherDashboardPage />);

    expect(useExamSessionsMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 1, semesterId: 's1' });
    expect(screen.getByText('Số phiên thi trong bộ lọc đang chọn')).toBeInTheDocument();
    expect(screen.queryByText('Tổng số phiên thi bạn đã tạo')).not.toBeInTheDocument();
  });

  it('có hai ô lọc năm học và học kỳ', () => {
    render(<TeacherDashboardPage />);
    expect(screen.getByRole('combobox', { name: 'Lọc theo năm học' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toBeInTheDocument();
  });

  it('lỗi tải hiện ở thẻ thống kê, không làm mất bộ lọc', () => {
    useExamSessionsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<TeacherDashboardPage />);
    expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/app/teacher/dashboard/page.test.tsx`
Expected: FAIL — trang chưa có bộ lọc.

- [ ] **Step 3: Sửa trang**

Replace `apps/web/src/app/teacher/dashboard/page.tsx` bằng:

```tsx
'use client';

import Link from 'next/link';
import { CalendarClock, Inbox, Plus } from 'lucide-react';
import { useExamSessions } from '@/hooks/useExamSession';
import { useSemesterYearFilter } from '@/hooks/useSemesterYearFilter';
import { PageHeader } from '@/components/layout/page-header';
import { SemesterYearFilter } from '@/components/layout/semester-year-filter';
import { StatCard } from '@/components/layout/stat-card';
import { Button } from '@/components/ui/button';
import { isFiltering } from '@/lib/semester-filter';

// "Bài chờ chấm" needs the submission/grading modules, which are entirely
// out of this rebuild's scope — stays a placeholder (see the design spec's
// out-of-scope section).
export default function TeacherDashboardPage() {
  // Tổng số phiên THEO BỘ LỌC (spec §7.2). Mặc định "Tất cả": con số này không được lọc sẵn một kỳ người dùng không chọn.
  const filter = useSemesterYearFilter('teacher-dashboard');
  // pageSize: 1 — only `total` is read here; the list itself is what
  // /teacher/exam-sessions renders.
  const { data, isLoading, isError } = useExamSessions({ page: 1, pageSize: 1, ...filter.params });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description="Tổng quan các phiên thi bạn phụ trách và bài nộp cần xử lý."
        actions={
          <Button asChild>
            <Link href="/teacher/exam-sessions/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Tạo phiên thi
            </Link>
          </Button>
        }
      />

      <SemesterYearFilter
        semesters={filter.semesters}
        selection={filter.selection}
        onYearChange={filter.setYear}
        onSemesterChange={filter.setSemester}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          icon={CalendarClock}
          label="Phiên thi đã tạo"
          value={isLoading ? null : (data?.total ?? '—')}
          variant="accent"
          hint={
            isFiltering(filter.selection)
              ? 'Số phiên thi trong bộ lọc đang chọn'
              : 'Tổng số phiên thi bạn đã tạo'
          }
          isError={isError}
        />
        <StatCard
          icon={Inbox}
          label="Bài chờ chấm"
          value="—"
          variant="warning"
          hint="Có khi module thu bài và chấm điểm hoàn thiện"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/app/teacher/dashboard/page.test.tsx`
Expected: PASS. `StatCard` hiển thị `hint` dưới dạng văn bản — nếu nó không render `hint` khi `isError`, ca "lỗi tải" vẫn xanh vì chỉ khẳng định ô lọc còn đó.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/teacher/dashboard
git commit -m "feat(web): dashboard giảng viên đếm số phiên thi theo bộ lọc năm học → học kỳ (mặc định tất cả)"
```

---

### Task 5: Chạy cả bộ và cập nhật danh sách `tsc` đỏ

**Files:**
- Modify: `docs/superpowers/plans/md-restore-web-tsc-red.txt`

- [ ] **Step 1: Chạy**

```powershell
cd apps/web
npx vitest run
npx eslint src/lib/api/exam-session.ts src/lib/api/exam-session-list.test.ts src/app/teacher/exam-sessions src/app/teacher/exam-authoring src/app/teacher/dashboard
Get-ChildItem src -Recurse -Include *.ts,*.tsx | Where-Object { $_.FullName -notmatch 'teacher\\(submissions|grading)|\.test\.|fixtures|session-list|submission-' } | Select-String -Pattern '\.className\b|semesterNames' | Select-Object -First 10
pnpm exec tsc --noEmit 2>&1 | Select-String -Pattern '^src/' | ForEach-Object { ($_ -split '\(')[0] } | Sort-Object -Unique | Out-File -Encoding utf8 C:/tmp/tsc-red-after-g3b.txt
Compare-Object (Get-Content ../../docs/superpowers/plans/md-restore-web-tsc-red.txt) (Get-Content C:/tmp/tsc-red-after-g3b.txt)
```

Expected: vitest xanh; ESLint sạch; `Select-String` không còn `.className`/`semesterNames` ngoài vùng submissions/grading (G3c/G3d); `Compare-Object` chỉ có dòng `<=` (file được sửa khỏi danh sách: `lib/api/exam-session.ts` **một phần** — nếu nó còn lỗi ở `createExamSession` thì vẫn đỏ cho tới G4 — cùng các file của Task 2–4), không có dòng `=>`.

- [ ] **Step 2: Cập nhật danh sách và commit**

```powershell
Copy-Item C:/tmp/tsc-red-after-g3b.txt ../../docs/superpowers/plans/md-restore-web-tsc-red.txt -Force
```

```bash
git add docs/superpowers/plans/md-restore-web-tsc-red.txt
git commit -m "chore(web): cập nhật danh sách tsc đỏ có chủ ý sau plan G3b"
```

---

## Tự kiểm lại plan so với spec

- §4 (`GET /exam-sessions`: tham số `semesterId`/`academicYear` thay `semesterName`; bỏ `semesterNames`; dòng thêm `semesterId`, `academicYear`, `term`, `classLabel`): Task 1. §7.2 (Giảng viên: Kỳ thi = Năm học + học kỳ cùng các bộ lọc có sẵn; Dashboard = tổng số phiên theo bộ lọc; mặc định "Tất cả"; lọc bằng **khoá**, danh sách lựa chọn từ bảng học kỳ): Task 2, 4. §7.3 (không bao giờ chặn thao tác): bộ lọc chỉ hẹp tầm nhìn; màn trống có đường sang "tất cả học kỳ". §2.5 (mười một file đọc tên lớp): trong phạm vi plan này — `exam-session.service`'s list → `classLabel` ở bảng, lịch, picker (Task 2, 3); phần còn lại (bài thu, chấm điểm) ở G3c/G3d.
- §11: T-FLT-1 (không còn bộ lọc theo chuỗi ở màn Kỳ thi — `useSemesterFilter` chỉ còn người dùng ở G3c/G3d và bị xoá ở G3d), T-FLT-2 (lọc bằng khoá: ghim bằng `semesterId`/`academicYear` đi lên server và **vắng mặt** khi "Tất cả").
- Quyết định/hệ quả nêu để user duyệt: (a) **mặc định đổi từ "kỳ hợp lý nhất hôm nay" sang "Tất cả"** — spec §7.2 yêu cầu, và bản cũ đã bỏ cơ chế "kỳ hiện tại" khi bảng `semester` bị xoá nên thực ra mặc định hiện nay cũng đã là "Tất cả" ở production; test cũ mock `CURRENT_SEMESTER` chỉ là điều kiện của test; (b) "Xoá bộ lọc" **không** đụng học kỳ (giữ nguyên hành vi và ý nghĩa test cũ); (c) ô lọc lớp dùng `labelWithSemester`; (d) `semesterName` (chụp) vẫn có trên `ExamSessionListItem` nhưng trang **không** hiển thị nó — chỉ bảng điểm in nó (G3c/G3d có thể hiển thị khi cần).
- Không làm ở plan này: form tạo/sửa phiên, nút Sửa/Huỷ, `ExamSessionResponse` (G4); bài thu (G3c); chấm điểm (G3d); xoá `useSemesterFilter`/`SemesterFilter` (G3d, khi người dùng cuối cùng đã chuyển).
- Placeholder scan: không có "TBD"; mọi sửa file có sẵn nêu **khối cũ → khối mới** hoặc đoạn thay thế nguyên văn. Kiểu nhất quán: `ExamSessionListItem` (Task 1) khớp mọi fixture ở Task 2–4 và khớp `ExamSessionListItemDto` của D3; `SearchExamSessionsParams` (Task 1) khớp `...semesterFilter.params` (`{ semesterId?: string; academicYear?: number }` của G1); `TeachingClass.labelWithSemester` (G3a) khớp ô lọc lớp; `useSemesterYearFilter('teacher-exam-sessions' | 'teacher-dashboard')` dùng hai `scopeKey` riêng.
