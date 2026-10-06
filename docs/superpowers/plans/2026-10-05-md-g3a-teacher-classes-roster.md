# Plan G3a — Giảng viên: "Lớp của tôi" chỉ đọc, thêm sinh viên tự hiện tên, duyệt thi bù theo nhãn lớp

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa màn hình giảng viên về đúng mô hình mới: lớp do **admin** tạo và giao nên "Lớp của tôi" **chỉ đọc** (có bộ lọc Năm học → Học kỳ), tên lớp hiện bằng **nhãn gộp**, ô thêm tay sinh viên **tự hiện tên khi gõ MSSV** (một tên, một chỗ), nhập file danh sách **nêu rõ ai bị đổi tên**, và ô chọn lớp ở duyệt thi bù hiện nhãn kèm học kỳ.

**Architecture:** Đổi `TeachingClass` sang hình dạng của `TeachingClassView` (plan D2) và **gỡ** ba hàm tạo/sửa/xoá lớp khỏi `lib/api/teaching.ts` cùng hook của chúng; viết lại trang Lớp của tôi quanh `useSemesterYearFilter` (plan G1); tách ô thêm tay thành `AddStudentForm` (có test, dùng `useStudentLookup`) và kết quả nhập thành `ImportResultAlert` thay vì nhồi thêm vào `RosterScreen` (đã ~400 dòng); sửa chỗ hiển thị tên lớp ở trang phòng chờ và cập nhật bốn mock trong test của nó.

**Tech Stack:** Next.js 15, React 19, TanStack Query 5, Radix Select (shadcn), vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §5.2 (giảng viên: Lớp của tôi, danh sách sinh viên, chữ ở màn trống), §2.6 (tên sinh viên một chỗ: nhập tay MSSV đã có thì điền sẵn và khoá tên; file khác tên thì file thắng và kết quả liệt kê ai bị đổi), §2.3 mục 3 (duyệt thi bù chọn lớp gốc), §7.2 (Lớp của tôi có bộ lọc năm học + học kỳ), §11: T-OWN-1 (giảng viên không tạo/sửa/xoá lớp — phía web), T-STU-2, T-STU-3 (phần hiển thị), T-FLT-1 (một màn hình).

**Phụ thuộc:** plan G1 (`useSemesterYearFilter`, `SemesterYearFilter`, `useStudentLookup`, `lib/semester-filter.ts`) và plan G2 (`semesterTextOf` ở `lib/master-data-forms.ts`); API của plan D1, D2.

## Global Constraints

- **Giảng viên không còn tạo/sửa/xoá lớp** (spec §4, §5.2): gỡ `createClass`/`updateClass`/`deleteClass`/`ClassInput` khỏi `lib/api/teaching.ts`, `useCreateClass`/`useUpdateClass`/`useDeleteClass` khỏi `hooks/useTeaching.ts`, và xoá `_components/class-form-dialog.tsx`, `_components/delete-class-dialog.tsx`. **Không** còn nút "Tạo lớp" nào ở trang Lớp của tôi (kể cả ở màn trống).
- **Chữ màn trống nguyên văn spec §5.2:** tiêu đề "**Chưa có lớp nào được giao cho bạn**", mô tả "**Lớp do quản trị viên tạo và giao cho bạn. Khi có lớp mới, nó sẽ hiện ở đây.**" Không nút liên hệ admin, không thông báo (spec §1.2: kênh yêu cầu admin để sau). Khi **đang lọc** mà không có lớp thì nói khác ("Không có lớp nào trong bộ lọc này") và cho xoá bộ lọc — một lời mời tạo lớp ở đây là sai.
- **Nhãn lớp:** hiển thị `label` (`DHKTPM18A – Nhóm 1`) ở nơi đã chọn kỳ rồi; `labelWithSemester` (`… · HK1 2026-2027`) ở nơi lớp của nhiều kỳ có thể lẫn trong cùng một danh sách (ô chọn lớp gốc khi duyệt thi bù). Không nối chuỗi mã + nhóm ở chỗ khác.
- **Một tên sinh viên, một chỗ** (spec §2.6): ô tên ở form thêm tay **điền sẵn và khoá** khi MSSV đã có trong hệ thống (kèm câu nói cách sửa: nhập file); MSSV mới thì ô tên **bắt buộc**; lỗi tra cứu (429, mạng) **không chặn** việc thêm — server không ghi đè tên đã lưu bằng tên gõ, nên gõ tên khi tra lỗi là an toàn. Chỉ tra khi MSSV hợp lệ (server giới hạn 30 lần/phút/giảng viên).
- **Nhập file nêu rõ ai bị đổi tên** (spec §2.6, §12 mục 3): `RosterImportResult.renamed` (plan D1) hiện thành một lời báo **riêng** liệt kê `mssv: "cũ" → "mới"`, kèm lời nói tên áp dụng cho **mọi** lớp. Không đổi tên âm thầm.
- **Bộ lọc Năm học → Học kỳ của Lớp của tôi** dùng đúng thành phần G1, mặc định "Tất cả", `scopeKey = 'teacher-classes'`.
- Các hook gọi `useTeachingClasses()` **không đối số** (trang phòng chờ, danh sách phiên, form tạo phiên) giữ nguyên chữ ký: tham số lọc là tuỳ chọn.
- Từ plan này, `apps/web` còn `tsc` đỏ **chỉ ở** các file của G3b/G4 (danh sách trong `md-restore-web-tsc-red.txt` bớt đi `lib/api/teaching.ts`, `hooks/useTeaching.ts`, `app/teacher/classes/**`, `AccessRequestPanel.tsx`).

## Review Focus

1. **Còn một đường tạo/sửa/xoá lớp ở phía giảng viên** (nút ẩn nhưng hàm còn, hoặc dialog còn import). → test trang không có nút nào; `grep` không còn `createClass`/`ClassFormDialog` (Task 2).
2. **Màn trống mời giảng viên TẠO lớp** (chữ cũ), hoặc đang lọc mà nói "chưa có lớp nào". → ba ca chữ riêng (Task 2).
3. **Ô tên bị sửa được khi MSSV đã có** (hai cái tên cho một sinh viên), hoặc bị khoá mãi khi tra cứu lỗi (giảng viên không thêm được ai). → test cả ba nhánh: có, mới, lỗi (Task 3).
4. **Tra cứu bắn theo từng ký tự gõ** (đốt hạn mức 30 lần/phút). → chỉ tra khi MSSV hợp lệ (đã ở `useStudentLookup`); test form không gọi khi MSSV chưa đủ (Task 3).
5. **Đổi tên theo file bị nuốt**: lời báo thành công chỉ đếm "cập nhật N". → `ImportResultAlert` liệt kê từng người (Task 3).
6. **Ô chọn lớp gốc ở duyệt thi bù không phân biệt hai lớp cùng mã khác kỳ.** → dùng `labelWithSemester` (Task 4).
7. **Bộ lọc kỳ làm giảng viên tưởng mất lớp** (lọc kỳ cũ nên danh sách rỗng). → mặc định "Tất cả"; màn trống khi lọc có nút xoá bộ lọc (Task 2).

---

## File Structure

| File | Việc |
|---|---|
| `apps/web/src/lib/api/teaching.ts` | `TeachingClass` mới; gỡ tạo/sửa/xoá; `listTeachingClasses(filters)`. |
| `apps/web/src/lib/api/roster.ts` | `RosterImportResult.renamed`, `RenamedStudent`. |
| `apps/web/src/hooks/useTeaching.ts` | `useTeachingClasses(filters?)`; gỡ ba mutation. |
| `apps/web/src/app/teacher/classes/page.tsx` (+ test viết lại) | Chỉ đọc, có bộ lọc, chữ màn trống mới. |
| `apps/web/src/app/teacher/classes/_components/{class-form-dialog,delete-class-dialog}.tsx` | **Xoá.** |
| `apps/web/src/app/teacher/classes/[id]/roster/page.tsx` | Tiêu đề theo nhãn. |
| `apps/web/src/components/roster/add-student-form.tsx` (+ test) | **Mới.** |
| `apps/web/src/components/roster/import-result-alert.tsx` (+ test) | **Mới.** |
| `apps/web/src/components/roster/roster-screen.tsx` | Dùng hai component mới. |
| `apps/web/src/app/(exam-live)/exam-sessions/[id]/_components/AccessRequestPanel.tsx`, `page.test.tsx` | Nhãn kèm học kỳ ở ô chọn lớp gốc. |

---

### Task 1: `TeachingClass` mới, gỡ tạo/sửa/xoá, và `renamed` của roster

**Files:**
- Modify: `apps/web/src/lib/api/teaching.ts`, `apps/web/src/lib/api/roster.ts`, `apps/web/src/hooks/useTeaching.ts`
- Test: `apps/web/src/lib/api/teaching.test.ts`, `apps/web/src/hooks/useTeaching.test.tsx`

**Interfaces:**
- Consumes: `apiClient`, `throwIfFailed` (G1 `http-error.ts`).
- Produces:

```ts
// lib/api/teaching.ts
export interface TeachingClass { id: string; label: string; labelWithSemester: string; courseName: string; semesterId: string | null; academicYear: number | null; term: number | null; studentCount: number }
export interface TeachingClassFilters { semesterId?: string; academicYear?: number }
export function listTeachingClasses(filters?: TeachingClassFilters): Promise<TeachingClass[]>;
// lib/api/roster.ts (thêm)
export interface RenamedStudent { mssv: string; from: string; to: string }
// RosterImportResult.renamed: RenamedStudent[]
// hooks/useTeaching.ts
export function useTeachingClasses(filters?: TeachingClassFilters): UseQueryResult<TeachingClass[]>;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/lib/api/teaching.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { GET: (...a: unknown[]) => get(...a) } }));

import * as teaching from './teaching';

const ok = (data: unknown) => ({ data, error: undefined, response: { ok: true, status: 200 } });

describe('lib/api/teaching', () => {
  beforeEach(() => get.mockReset());

  it('listTeachingClasses không đối số: không gửi tham số lọc nào', async () => {
    get.mockResolvedValue(ok([{ id: 'c1' }]));
    await expect(teaching.listTeachingClasses()).resolves.toEqual([{ id: 'c1' }]);
    expect(get).toHaveBeenCalledWith('/classes/teaching', { params: { query: {} } });
  });

  it('chỉ gửi bộ lọc có giá trị', async () => {
    get.mockResolvedValue(ok([]));
    await teaching.listTeachingClasses({ semesterId: 's1' });
    expect(get).toHaveBeenLastCalledWith('/classes/teaching', { params: { query: { semesterId: 's1' } } });
    await teaching.listTeachingClasses({ academicYear: 2026 });
    expect(get).toHaveBeenLastCalledWith('/classes/teaching', { params: { query: { academicYear: 2026 } } });
  });

  it('lỗi của server tới được người dùng nguyên văn', async () => {
    get.mockResolvedValue({ data: undefined, error: { message: 'Không tải được lớp' }, response: { ok: false, status: 500 } });
    await expect(teaching.listTeachingClasses()).rejects.toThrow('Không tải được lớp');
  });

  it('Review Focus 1: giảng viên KHÔNG còn hàm tạo/sửa/xoá lớp', () => {
    expect(teaching).not.toHaveProperty('createClass');
    expect(teaching).not.toHaveProperty('updateClass');
    expect(teaching).not.toHaveProperty('deleteClass');
  });
});
```

Create `apps/web/src/hooks/useTeaching.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const list = vi.fn();
vi.mock('@/lib/api/teaching', () => ({ listTeachingClasses: (...a: unknown[]) => list(...a) }));

import * as hooks from './useTeaching';
import { useTeachingClasses } from './useTeaching';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useTeachingClasses', () => {
  beforeEach(() => list.mockReset().mockResolvedValue([]));

  it('gọi không đối số vẫn chạy (trang phòng chờ, danh sách phiên, form tạo phiên)', async () => {
    renderHook(() => useTeachingClasses(), { wrapper: wrapper() });
    await waitFor(() => expect(list).toHaveBeenCalledWith({}));
  });

  it('bộ lọc nằm trong khoá: đổi bộ lọc là một truy vấn mới, dưới gốc `classes` để mọi lần ghi lớp làm mới nó', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const w = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { rerender } = renderHook(({ filters }) => useTeachingClasses(filters), {
      wrapper: w,
      initialProps: { filters: { semesterId: 's1' } as { semesterId?: string } },
    });
    await waitFor(() => expect(list).toHaveBeenCalledWith({ semesterId: 's1' }));
    rerender({ filters: { semesterId: 's2' } });
    await waitFor(() => expect(list).toHaveBeenCalledWith({ semesterId: 's2' }));
    expect(client.getQueryCache().getAll().map((q) => q.queryKey[0])).toEqual(['classes', 'classes']);
  });

  it('Review Focus 1: không còn hook tạo/sửa/xoá lớp', () => {
    expect(hooks).not.toHaveProperty('useCreateClass');
    expect(hooks).not.toHaveProperty('useUpdateClass');
    expect(hooks).not.toHaveProperty('useDeleteClass');
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/lib/api/teaching.test.ts src/hooks/useTeaching.test.tsx`
Expected: FAIL — `listTeachingClasses` hiện không nhận tham số lọc; ba hàm tạo/sửa/xoá còn tồn tại.

- [ ] **Step 3: Viết lại `teaching.ts`**

Replace toàn bộ `apps/web/src/lib/api/teaching.ts` bằng:

```ts
import { apiClient } from '@/lib/api-client';
import { throwIfFailed } from './http-error';

/**
 * Một lớp như CHÍNH giảng viên dạy nó thấy — phản chiếu TeachingClassView (apps/api/src/course/course.types.ts, plan D2).
 *
 * Lớp do ADMIN tạo và giao (spec §2.3): giảng viên chỉ đọc, nên file này không còn hàm tạo/sửa/xoá. Server vẫn giới hạn theo
 * `class.teacher_id`, nên lớp của người khác không bao giờ xuất hiện.
 *
 * `label` là nhãn gộp `DHKTPM18A – Nhóm 1`; `labelWithSemester` thêm ` · HK1 2026-2027` — dùng ở nơi lớp của NHIỀU kỳ có thể lẫn trong
 * một danh sách (ô chọn lớp gốc khi duyệt thi bù). Mọi nơi hiện tên lớp đọc hai trường này, không nối chuỗi mã + nhóm ở chỗ khác.
 *
 * `courseName` vẫn được API trả về nhưng hệ thống phục vụ đúng MỘT môn nên nó là một hằng số; không màn hình nào hiện nó.
 */
export interface TeachingClass {
  id: string;
  label: string;
  labelWithSemester: string;
  courseName: string;
  /** `null` chỉ với lớp cũ chưa backfill. */
  semesterId: string | null;
  academicYear: number | null;
  term: number | null;
  /** 0 nghĩa là chưa nhập danh sách sinh viên cho lớp này. */
  studentCount: number;
}

export interface TeachingClassFilters {
  semesterId?: string;
  academicYear?: number;
}

/** Bộ lọc chỉ HẸP tầm nhìn (CLAUDE.md §1.2): vắng mặt nghĩa là tất cả lớp của giảng viên. */
export async function listTeachingClasses(filters: TeachingClassFilters = {}): Promise<TeachingClass[]> {
  const query = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined));
  const { data, error, response } = await apiClient.GET('/classes/teaching', { params: { query } });
  await throwIfFailed(error, response);
  return data as unknown as TeachingClass[];
}
```

- [ ] **Step 4: Viết lại `useTeaching.ts`**

Replace toàn bộ `apps/web/src/hooks/useTeaching.ts` bằng:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { listTeachingClasses, type TeachingClassFilters } from '@/lib/api/teaching';
import { MASTER_DATA_KEYS } from './master-data-keys';

/**
 * Lớp mà giảng viên này được giao, tuỳ chọn lọc theo năm học/học kỳ. Gọi không đối số là mọi lớp (trang phòng chờ, danh sách phiên, form
 * tạo phiên): bộ lọc chỉ hẹp tầm nhìn, không bao giờ chặn thao tác (CLAUDE.md §1.2).
 *
 * Khoá `['classes', 'teaching', filters]` nằm DƯỚI gốc `classes` — cùng gốc với danh sách của admin — nên mọi lần ghi lớp (admin tạo,
 * giao lại, import) và mọi lần đổi roster làm mới nó. Giảng viên không còn mutation nào ở đây: lớp do admin quản lý.
 */
export function useTeachingClasses(filters: TeachingClassFilters = {}) {
  return useQuery({
    queryKey: [MASTER_DATA_KEYS.classes, 'teaching', filters],
    queryFn: () => listTeachingClasses(filters),
  });
}
```

Trong `apps/web/src/lib/api/roster.ts`, thay khối `RosterImportResult` (đầu file) bằng:

```ts
/** Một sinh viên mà file đã ĐỔI TÊN (spec §2.6: một tên duy nhất, file mới nhất thắng). */
export interface RenamedStudent {
  mssv: string;
  from: string;
  to: string;
}

/** The server's own account of what an import did. */
export interface RosterImportResult {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  missing: RosterEntry[];
  /**
   * MỌI sinh viên trong file bị đổi tên — kể cả em vừa vào lớp này nhưng đã có tên khác ở lớp khác. Tên chỉ có MỘT chỗ nên đổi áp dụng
   * cho mọi lớp; vì vậy kết quả phải nói rõ ai bị đổi thay vì đổi âm thầm.
   */
  renamed: RenamedStudent[];
}
```

- [ ] **Step 5: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/lib/api/teaching.test.ts src/hooks/useTeaching.test.tsx`
Expected: PASS. (Các trang đang import `useCreateClass`… sẽ đỏ ở bước sau — chúng bị xoá/viết lại ở Task 2.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api/teaching.ts apps/web/src/lib/api/teaching.test.ts apps/web/src/lib/api/roster.ts apps/web/src/hooks/useTeaching.ts apps/web/src/hooks/useTeaching.test.tsx
git commit -m "feat(web): TeachingClass theo nhãn gộp + học kỳ, lọc năm học/học kỳ; gỡ tạo/sửa/xoá lớp của giảng viên; roster trả danh sách đổi tên"
```

---

### Task 2: Trang "Lớp của tôi" chỉ đọc

**Files:**
- Modify (viết lại): `apps/web/src/app/teacher/classes/page.tsx`, `apps/web/src/app/teacher/classes/page.test.tsx`
- Modify: `apps/web/src/app/teacher/classes/[id]/roster/page.tsx`
- Delete: `apps/web/src/app/teacher/classes/_components/class-form-dialog.tsx`, `apps/web/src/app/teacher/classes/_components/delete-class-dialog.tsx`

**Interfaces:**
- Consumes: `useTeachingClasses`, `useSemesterYearFilter`, `SemesterYearFilter`, `semesterTextOf`, `isFiltering`.
- Produces: route `/teacher/classes` (không còn thao tác ghi).

- [ ] **Step 1: Viết lại test (đỏ)**

Replace toàn bộ `apps/web/src/app/teacher/classes/page.test.tsx` bằng:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TeacherClassesPage from './page';

const useTeachingClassesMock = vi.fn();
const useFilterMock = vi.fn();

vi.mock('@/hooks/useTeaching', () => ({ useTeachingClasses: (...args: unknown[]) => useTeachingClassesMock(...args) }));
vi.mock('@/hooks/useSemesterYearFilter', () => ({ useSemesterYearFilter: (...args: unknown[]) => useFilterMock(...args) }));

const filterState = (overrides: Record<string, unknown> = {}) => ({
  semesters: [
    { id: 's2', academicYearStart: 2026, term: 2, label: 'HK2 2026-2027' },
    { id: 's1', academicYearStart: 2026, term: 1, label: 'HK1 2026-2027' },
  ],
  isLoading: false,
  selection: { academicYear: null, semesterId: null },
  setYear: vi.fn(),
  setSemester: vi.fn(),
  clear: vi.fn(),
  params: {},
  matches: () => true,
  ...overrides,
});

const klass = (overrides: Record<string, unknown> = {}) => ({
  id: 'k1',
  label: 'DHKTPM18A – Nhóm 1',
  labelWithSemester: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027',
  courseName: 'CTDL&GT',
  semesterId: 's1',
  academicYear: 2026,
  term: 1,
  studentCount: 40,
  ...overrides,
});

/**
 * Trang "Lớp của tôi" sau khi lớp về tay ADMIN (spec §2.3, §5.2).
 *
 * Bộ test này khoá lại một thay đổi QUYỀN, giống hệt chiều ngược lại của lần trước (21/09, khi lớp về tay giảng viên): lần này
 * giảng viên KHÔNG tạo, sửa hay xoá lớp được nữa — route ghi là `@Roles('admin')` và trả 403 cho họ — nên bất kỳ nút ghi nào còn sót
 * trên trang này là một nút bấm ra 403.
 */
describe('TeacherClassesPage', () => {
  beforeEach(() => {
    useTeachingClassesMock.mockReset().mockReturnValue({ data: [klass()], isLoading: false, isError: false });
    useFilterMock.mockReset().mockReturnValue(filterState());
  });

  it('hiện nhãn lớp, học kỳ và sĩ số, kèm đường vào danh sách sinh viên', () => {
    render(<TeacherClassesPage />);

    const row = screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ });
    expect(row).toHaveTextContent('HK1 2026-2027');
    expect(row).toHaveTextContent('40 sinh viên');
    expect(within(row).getByRole('link', { name: /danh sách sv/i })).toHaveAttribute('href', '/teacher/classes/k1/roster');
  });

  it('Review Focus 1: KHÔNG có nút tạo, sửa hay xoá lớp nào', () => {
    render(<TeacherClassesPage />);

    expect(screen.queryByRole('button', { name: /tạo lớp/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sửa lớp/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /xoá lớp/i })).not.toBeInTheDocument();
  });

  it('lớp chưa có sinh viên cảnh báo ngay trên bảng (không đợi tới ngày thi)', () => {
    useTeachingClassesMock.mockReturnValue({ data: [klass({ studentCount: 0 })], isLoading: false, isError: false });
    render(<TeacherClassesPage />);
    expect(screen.getByText('chưa có danh sách')).toBeInTheDocument();
  });

  it('lớp cũ chưa có học kỳ hiện "Chưa gán học kỳ", không hiện "HK null"', () => {
    useTeachingClassesMock.mockReturnValue({
      data: [klass({ semesterId: null, academicYear: null, term: null })],
      isLoading: false,
      isError: false,
    });
    render(<TeacherClassesPage />);
    expect(screen.getByText('Chưa gán học kỳ')).toBeInTheDocument();
  });

  describe('màn trống (Review Focus 2)', () => {
    it('chưa được giao lớp nào: chữ nguyên văn spec §5.2, không có nút tạo lớp', () => {
      useTeachingClassesMock.mockReturnValue({ data: [], isLoading: false, isError: false });
      render(<TeacherClassesPage />);

      expect(screen.getByText('Chưa có lớp nào được giao cho bạn')).toBeInTheDocument();
      expect(screen.getByText('Lớp do quản trị viên tạo và giao cho bạn. Khi có lớp mới, nó sẽ hiện ở đây.')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument(); // không nút nào, kể cả "liên hệ admin" (spec §1.2)
      expect(screen.queryByText(/bạn chưa có lớp nào/i)).not.toBeInTheDocument(); // chữ cũ mời TẠO lớp
    });

    it('rỗng vì đang lọc: nói khác, và cho xoá bộ lọc (Review Focus 7)', () => {
      const clear = vi.fn();
      useFilterMock.mockReturnValue(
        filterState({ selection: { academicYear: 2025, semesterId: null }, params: { academicYear: 2025 }, clear }),
      );
      useTeachingClassesMock.mockReturnValue({ data: [], isLoading: false, isError: false });
      render(<TeacherClassesPage />);

      expect(screen.getByText('Không có lớp nào trong bộ lọc này')).toBeInTheDocument();
      expect(screen.queryByText('Chưa có lớp nào được giao cho bạn')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Xem tất cả học kỳ' }));
      expect(clear).toHaveBeenCalled();
    });
  });

  describe('bộ lọc năm học → học kỳ', () => {
    it('mặc định không lọc gì; tham số của bộ lọc đi vào truy vấn', () => {
      render(<TeacherClassesPage />);
      expect(useTeachingClassesMock).toHaveBeenLastCalledWith({});

      useFilterMock.mockReturnValue(filterState({ params: { semesterId: 's1' } }));
      render(<TeacherClassesPage />);
      expect(useTeachingClassesMock).toHaveBeenLastCalledWith({ semesterId: 's1' });
    });

    it('hai ô lọc có mặt và dùng đúng scopeKey của màn hình', () => {
      render(<TeacherClassesPage />);
      expect(screen.getByRole('combobox', { name: 'Lọc theo năm học' })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toBeInTheDocument();
      expect(useFilterMock).toHaveBeenCalledWith('teacher-classes');
    });
  });

  it('đang tải và lỗi tải', () => {
    useTeachingClassesMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { unmount } = render(<TeacherClassesPage />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    unmount();

    useTeachingClassesMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('Không tải được lớp') });
    render(<TeacherClassesPage />);
    expect(screen.getByText('Không tải được lớp')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/app/teacher/classes`
Expected: FAIL — trang cũ còn nút tạo/sửa/xoá và chữ màn trống cũ.

- [ ] **Step 3: Viết lại trang**

Replace toàn bộ `apps/web/src/app/teacher/classes/page.tsx` bằng:

```tsx
'use client';

import Link from 'next/link';
import { GraduationCap, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { SemesterYearFilter } from '@/components/layout/semester-year-filter';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSemesterYearFilter } from '@/hooks/useSemesterYearFilter';
import { useTeachingClasses } from '@/hooks/useTeaching';
import { semesterTextOf } from '@/lib/master-data-forms';
import { isFiltering } from '@/lib/semester-filter';

/**
 * Các lớp bạn được giao, và đường vào danh sách sinh viên của từng lớp.
 *
 * CHỈ ĐỌC. Lớp do quản trị viên tạo và giao (spec §2.3, §5.2) — đảo lại thay đổi 21/09, khi giảng viên tự tạo lớp của mình. Route ghi lớp
 * là `@Roles('admin')` nên một nút "Tạo lớp" còn sót ở đây là một nút bấm ra 403. Thứ giảng viên vẫn tự làm là DANH SÁCH SINH VIÊN của
 * lớp (tải file hoặc thêm tay), vì họ là người biết ai thật sự học.
 *
 * Bộ lọc Năm học → Học kỳ mặc định "Tất cả": một giảng viên dạy qua nhiều kỳ không được mất lớp của kỳ cũ chỉ vì bộ lọc chọn sẵn một kỳ
 * khác. Bộ lọc chỉ hẹp tầm nhìn, không bao giờ chặn thao tác (CLAUDE.md §1.2).
 */
export default function TeacherClassesPage() {
  const filter = useSemesterYearFilter('teacher-classes');
  const classes = useTeachingClasses(filter.params);
  const filtering = isFiltering(filter.selection);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Lớp của tôi"
        description="Các lớp bạn được giao. Mỗi lớp có một danh sách sinh viên — đó là thứ quyết định ai vào được phiên thi."
      />

      <SemesterYearFilter
        semesters={filter.semesters}
        selection={filter.selection}
        onYearChange={filter.setYear}
        onSemesterChange={filter.setSemester}
      />

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {classes.isLoading ? (
            <div className="flex flex-col gap-3 p-6">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : classes.isError ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertDescription>{classes.error.message}</AlertDescription>
              </Alert>
            </div>
          ) : (classes.data?.length ?? 0) === 0 ? (
            // Hai câu chuyện khác nhau, không được nói chung một câu: "bạn chưa được giao lớp nào" (không có việc gì để làm — chờ admin)
            // và "bộ lọc này không có lớp nào" (nới bộ lọc). Chữ cũ mời giảng viên TẠO lớp — giờ là một lời mời sai.
            filtering ? (
              <EmptyState
                icon={GraduationCap}
                title="Không có lớp nào trong bộ lọc này"
                description="Thử chọn học kỳ khác, hoặc xem tất cả lớp bạn được giao."
                tone="muted"
                action={
                  <Button type="button" variant="outline" onClick={filter.clear}>
                    Xem tất cả học kỳ
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={GraduationCap}
                title="Chưa có lớp nào được giao cho bạn"
                description="Lớp do quản trị viên tạo và giao cho bạn. Khi có lớp mới, nó sẽ hiện ở đây."
                tone="muted"
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">Lớp</TableHead>
                    <TableHead scope="col">Học kỳ</TableHead>
                    <TableHead scope="col">Sĩ số</TableHead>
                    <TableHead scope="col" className="text-right">
                      <span className="sr-only">Hành động</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classes.data!.map((klass) => (
                    <TableRow key={klass.id}>
                      <TableCell className="font-medium">{klass.label}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {semesterTextOf(klass)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {klass.studentCount === 0 ? (
                          // Không phải ô trống: một lớp chưa có danh sách thì không sinh viên nào vào được phiên thi, và giảng viên
                          // nên thấy điều đó ở đây chứ không phải vào hôm thi.
                          <span className="text-warning-strong">chưa có danh sách</span>
                        ) : (
                          `${klass.studentCount} sinh viên`
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/teacher/classes/${klass.id}/roster`}>
                            <Users className="h-4 w-4" aria-hidden="true" />
                            Danh sách SV
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Xoá hai hộp thoại và sửa tiêu đề trang roster**

```bash
git rm apps/web/src/app/teacher/classes/_components/class-form-dialog.tsx apps/web/src/app/teacher/classes/_components/delete-class-dialog.tsx
```

(Thư mục `_components` rỗng thì Git bỏ nó; không còn gì import hai file này sau khi trang được viết lại — `grep -rn "class-form-dialog\|delete-class-dialog" apps/web/src` phải trống.)

Trong `apps/web/src/app/teacher/classes/[id]/roster/page.tsx` thay khối `PageHeader` bằng:

```tsx
      <PageHeader
        title={klass ? `Danh sách lớp — ${klass.label}` : 'Danh sách lớp'}
        description={
          klass
            ? `Lớp ${klass.labelWithSemester}. Đây là danh sách quyết định ai được vào phiên thi của lớp này.`
            : 'Danh sách quyết định ai được vào phiên thi của lớp này.'
        }
```

và sửa chú thích đầu hàm `TeacherRosterPage` thành: "The lecturer's own class list. Lớp do admin tạo và giao; từ đó danh sách là của giảng viên, và họ có thể nạp file hoặc gõ từng sinh viên."

- [ ] **Step 5: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/app/teacher/classes`
Expected: PASS. Ca "màn trống" đòi **không có button nào** (`queryByRole('button')` null): hai ô lọc là `combobox`, không phải `button`, và EmptyState không có `action`.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src/app/teacher/classes
git commit -m "feat(web): Lớp của tôi chỉ đọc (nhãn gộp, học kỳ, bộ lọc năm học→học kỳ, chữ màn trống mới); gỡ hộp thoại tạo/xoá lớp"
```

---

### Task 3: Thêm sinh viên tự hiện tên và lời báo kết quả nhập

**Files:**
- Create: `apps/web/src/components/roster/add-student-form.tsx`, `apps/web/src/components/roster/import-result-alert.tsx`
- Modify: `apps/web/src/components/roster/roster-screen.tsx`
- Test: `apps/web/src/components/roster/add-student-form.test.tsx`, `apps/web/src/components/roster/import-result-alert.test.tsx`

**Interfaces:**
- Consumes: `useStudentLookup` (G1), `RosterEntry`, `RosterImportResult`.
- Produces:

```tsx
export function AddStudentForm(props: {
  onSubmit: (student: RosterEntry) => Promise<unknown>;
  submitting: boolean;
  error: Error | null;
}): JSX.Element;
export function ImportResultAlert(props: { result: RosterImportResult }): JSX.Element;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/components/roster/add-student-form.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AddStudentForm } from './add-student-form';

const useLookupMock = vi.fn();
vi.mock('@/hooks/useStudentLookup', () => ({ useStudentLookup: (...args: unknown[]) => useLookupMock(...args) }));

const idle = { data: undefined, isFetching: false, isError: false, isSuccess: false, error: null };
const known = (fullName: string) => ({ ...idle, data: { mssv: 'SV20120001', fullName }, isSuccess: true });
const unknown = { ...idle, data: null, isSuccess: true };

function setup(props: Partial<React.ComponentProps<typeof AddStudentForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<AddStudentForm onSubmit={onSubmit} submitting={false} error={null} {...props} />);
  return { onSubmit };
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('AddStudentForm', () => {
  beforeEach(() => useLookupMock.mockReset().mockReturnValue(idle));

  it('Review Focus 4: tra cứu nhận ĐÚNG chuỗi đang gõ (hook tự chặn khi MSSV chưa hợp lệ)', () => {
    setup();
    type('MSSV', 'SV2');
    expect(useLookupMock).toHaveBeenLastCalledWith('SV2');
  });

  it('MSSV đã có: tên được ĐIỀN SẴN và KHOÁ, kèm cách sửa (nhập file)', () => {
    useLookupMock.mockReturnValue(known('Nguyễn Văn A'));
    setup();
    type('MSSV', 'SV20120001');

    const name = screen.getByLabelText('Họ và tên');
    expect(name).toHaveValue('Nguyễn Văn A');
    expect(name).toBeDisabled();
    expect(screen.getByText(/nhập file danh sách/i)).toBeInTheDocument();
  });

  it('Review Focus 3: MSSV đã có thì gửi tên ĐÃ LƯU, kể cả khi trước đó giảng viên đã gõ một tên khác', async () => {
    useLookupMock.mockReturnValue(idle);
    const { onSubmit } = setup();
    type('MSSV', 'SV2012000'); // chưa đủ → chưa tra
    type('Họ và tên', 'Tên gõ tay');

    useLookupMock.mockReturnValue(known('Nguyễn Văn A')); // gõ nốt MSSV → tra ra tên đã lưu
    type('MSSV', 'SV20120001');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ mssv: 'SV20120001', name: 'Nguyễn Văn A' }));
  });

  it('MSSV mới: ô tên mở và BẮT BUỘC; nút Thêm tắt cho tới khi có tên', () => {
    useLookupMock.mockReturnValue(unknown);
    setup();
    type('MSSV', 'SV20129999');

    expect(screen.getByLabelText('Họ và tên')).toBeEnabled();
    expect(screen.getByText(/mssv mới: nhập họ và tên/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeDisabled();

    type('Họ và tên', '  Trần Thị B ');
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeEnabled();
  });

  it('MSSV mới: gửi tên đã cắt khoảng trắng rồi xoá form', async () => {
    useLookupMock.mockReturnValue(unknown);
    const { onSubmit } = setup();
    type('MSSV', ' SV20129999 ');
    type('Họ và tên', '  Trần Thị B ');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ mssv: 'SV20129999', name: 'Trần Thị B' }));
    await waitFor(() => expect(screen.getByLabelText('MSSV')).toHaveValue(''));
    expect(screen.getByLabelText('Họ và tên')).toHaveValue('');
  });

  it('đang tra cứu: ô tên khoá và nút Thêm tắt (đừng để gõ tên trước khi biết MSSV đã có chưa)', () => {
    useLookupMock.mockReturnValue({ ...idle, isFetching: true });
    setup();
    type('MSSV', 'SV20120001');

    expect(screen.getByLabelText('Họ và tên')).toBeDisabled();
    expect(screen.getByText(/đang tra tên/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeDisabled();
  });

  it('Review Focus 3: tra cứu LỖI không chặn — ô tên mở, có lời báo, vẫn thêm được (server không ghi đè tên đã lưu)', async () => {
    useLookupMock.mockReturnValue({ ...idle, isError: true, error: new Error('Tra cứu quá nhanh, hãy thử lại sau ít phút.') });
    const { onSubmit } = setup();
    type('MSSV', 'SV20120001');

    expect(screen.getByLabelText('Họ và tên')).toBeEnabled();
    expect(screen.getByText(/tra cứu quá nhanh/i)).toBeInTheDocument();
    type('Họ và tên', 'Lê Văn C');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ mssv: 'SV20120001', name: 'Lê Văn C' }));
  });

  it('MSSV chưa nhập: nút Thêm tắt', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeDisabled();
  });

  it('lỗi của server (vd sinh viên đang ở lớp khác cùng môn) hiện nguyên văn và KHÔNG xoá form', async () => {
    useLookupMock.mockReturnValue(unknown);
    const { onSubmit } = setup({ error: new Error('Sinh viên SV20129999 đang ở lớp DHKTPM18B.') });
    onSubmit.mockRejectedValue(new Error('x'));
    type('MSSV', 'SV20129999');
    type('Họ và tên', 'Trần Thị B');

    expect(screen.getByText('Sinh viên SV20129999 đang ở lớp DHKTPM18B.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.getByLabelText('MSSV')).toHaveValue('SV20129999');
  });
});
```

Create `apps/web/src/components/roster/import-result-alert.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { RosterImportResult } from '@/lib/api/roster';
import { ImportResultAlert } from './import-result-alert';

const result = (overrides: Partial<RosterImportResult> = {}): RosterImportResult => ({
  added: 3,
  updated: 1,
  unchanged: 20,
  removed: 0,
  missing: [],
  renamed: [],
  ...overrides,
});

describe('ImportResultAlert', () => {
  it('đếm thêm / cập nhật / giữ nguyên; chỉ nói "xoá" khi có xoá', () => {
    const { rerender } = render(<ImportResultAlert result={result()} />);
    expect(screen.getByText('Đã nhập xong: thêm 3, cập nhật 1, giữ nguyên 20.')).toBeInTheDocument();

    rerender(<ImportResultAlert result={result({ removed: 2 })} />);
    expect(screen.getByText('Đã nhập xong: thêm 3, cập nhật 1, giữ nguyên 20, xoá 2.')).toBeInTheDocument();
  });

  it('Review Focus 5: liệt kê TỪNG sinh viên bị đổi tên và nói tên áp dụng cho mọi lớp', () => {
    render(
      <ImportResultAlert
        result={result({
          renamed: [
            { mssv: 'SV20120001', from: 'Nguyen Van A', to: 'Nguyễn Văn A' },
            { mssv: 'SV20120002', from: 'Tran Thi B', to: 'Trần Thị B' },
          ],
        })}
      />,
    );

    expect(screen.getByText(/đổi tên 2 sinh viên/i)).toBeInTheDocument();
    expect(screen.getByText(/mọi lớp/i)).toBeInTheDocument();
    expect(screen.getByText('SV20120001: "Nguyen Van A" → "Nguyễn Văn A"')).toBeInTheDocument();
    expect(screen.getByText('SV20120002: "Tran Thi B" → "Trần Thị B"')).toBeInTheDocument();
  });

  it('không ai bị đổi tên thì không có lời báo đổi tên', () => {
    render(<ImportResultAlert result={result()} />);
    expect(screen.queryByText(/đổi tên/i)).not.toBeInTheDocument();
  });

  it('server cũ chưa trả `renamed` (undefined) không làm nổ trang', () => {
    render(<ImportResultAlert result={{ ...result(), renamed: undefined as unknown as [] }} />);
    expect(screen.getByText(/đã nhập xong/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/components/roster/add-student-form.test.tsx src/components/roster/import-result-alert.test.tsx`
Expected: FAIL — không import được hai component.

- [ ] **Step 3: Viết hai component**

Create `apps/web/src/components/roster/add-student-form.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStudentLookup } from '@/hooks/useStudentLookup';
import type { RosterEntry } from '@/lib/api/roster';

interface AddStudentFormProps {
  onSubmit: (student: RosterEntry) => Promise<unknown>;
  submitting: boolean;
  /** Lỗi của lần thêm trước (vd 409 nêu sinh viên đang ở lớp khác) — hiện nguyên văn, không xoá form. */
  error: Error | null;
}

/**
 * Thêm tay MỘT sinh viên vào danh sách lớp — gõ MSSV là tự hiện tên (spec §2.6).
 *
 * Tên sinh viên chỉ có MỘT chỗ (bảng `student`). Gõ MSSV đã có thì ô tên được điền sẵn và KHOÁ: để giảng viên gõ tên khác sẽ tạo ra hai cái
 * tên cho một sinh viên, và cái nào thắng thì tuỳ thứ tự — đúng lỗi mà tách `student` ra để chấm dứt. Muốn đổi tên thì nhập file danh sách
 * (file mới nhất thắng, và kết quả nêu rõ ai bị đổi). MSSV mới thì tên BẮT BUỘC.
 *
 * Tra cứu LỖI (429 giới hạn tốc độ, mạng) không chặn việc thêm: server không ghi đè tên đã lưu bằng tên gõ, nên gõ tên khi không tra được là
 * an toàn — khoá mãi ô tên ở đây chỉ làm giảng viên không thêm được ai vào đúng lúc đang vội.
 */
export function AddStudentForm({ onSubmit, submitting, error }: AddStudentFormProps) {
  const [mssv, setMssv] = useState('');
  const [name, setName] = useState('');
  const lookup = useStudentLookup(mssv);

  const known = lookup.data ?? null;
  const looking = lookup.isFetching;
  const lookupFailed = lookup.isError;
  const isNew = lookup.isSuccess && known === null;

  // Tên GỬI ĐI: nếu MSSV đã có thì tên đã lưu, bất kể giảng viên từng gõ gì trước khi tra ra.
  const nameValue = known ? known.fullName : name;
  const nameLocked = known !== null || looking;
  const canSubmit = mssv.trim() !== '' && nameValue.trim() !== '' && !looking && !submitting;

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit({ mssv: mssv.trim(), name: nameValue.trim() });
      setMssv('');
      setName('');
    } catch {
      // Lý do đã hiện qua `error`; form giữ nguyên để sửa rồi gửi lại.
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex w-full flex-col gap-1.5 sm:w-52">
          <Label htmlFor="manual-mssv">MSSV</Label>
          <Input
            id="manual-mssv"
            required
            className="font-mono"
            placeholder="vd: SV20120001"
            value={mssv}
            onChange={(event) => setMssv(event.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="manual-name">Họ và tên</Label>
          <Input
            id="manual-name"
            required
            placeholder="vd: Nguyễn Văn A"
            value={nameValue}
            disabled={nameLocked}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button type="submit" loading={submitting} disabled={!canSubmit} className="shrink-0">
          Thêm
        </Button>
      </div>

      {looking && <p className="text-caption text-muted-foreground">Đang tra tên…</p>}
      {known && (
        <p className="text-caption text-muted-foreground">
          Tên đã có trong hệ thống và được giữ nguyên. Muốn đổi tên, hãy nhập file danh sách (file mới nhất thắng).
        </p>
      )}
      {isNew && <p className="text-caption text-muted-foreground">MSSV mới: nhập họ và tên.</p>}
      {lookupFailed && (
        <p className="text-caption text-warning-strong">
          Không tra được tên: {lookup.error?.message}. Bạn vẫn thêm được — nếu MSSV đã có, hệ thống dùng tên đã lưu.
        </p>
      )}
    </form>
  );
}
```

Create `apps/web/src/components/roster/import-result-alert.tsx`:

```tsx
'use client';

import { CircleCheckBig, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { RosterImportResult } from '@/lib/api/roster';

/**
 * Kết quả một lần nhập danh sách. Ngoài các con số, LIỆT KÊ từng sinh viên bị file đổi tên (spec §2.6, §12 mục 3): tên chỉ có một chỗ nên
 * file mới nhất thắng và đổi áp dụng cho MỌI lớp của sinh viên đó — một thay đổi có phạm vi ngoài lớp đang nhập thì không được đổi âm thầm.
 */
export function ImportResultAlert({ result }: { result: RosterImportResult }) {
  const renamed = result.renamed ?? [];
  return (
    <>
      <Alert variant="success">
        <CircleCheckBig />
        <AlertDescription>
          {`Đã nhập xong: thêm ${result.added}, cập nhật ${result.updated}, giữ nguyên ${result.unchanged}${
            result.removed > 0 ? `, xoá ${result.removed}` : ''
          }.`}
        </AlertDescription>
      </Alert>

      {renamed.length > 0 && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription className="flex flex-col gap-2">
            <span>
              File đã đổi tên {renamed.length} sinh viên. Tên chỉ có một chỗ, nên đổi áp dụng cho mọi lớp có sinh viên đó:
            </span>
            <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto font-mono text-small">
              {renamed.map((entry) => (
                <li key={entry.mssv}>{`${entry.mssv}: "${entry.from}" → "${entry.to}"`}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
```

- [ ] **Step 4: Nối vào `RosterScreen`**

Trong `apps/web/src/components/roster/roster-screen.tsx`:

1. **Imports:** xoá dòng `import { Input } from '@/components/ui/input';` (`Input` chỉ còn dùng ở form thêm tay cũ), thay `import { Alert, AlertDescription } from '@/components/ui/alert';` giữ nguyên (còn dùng cho lỗi), và thêm:
```tsx
import { AddStudentForm } from '@/components/roster/add-student-form';
import { ImportResultAlert } from '@/components/roster/import-result-alert';
```
Xoá `CircleCheckBig` khỏi import `lucide-react` nếu không còn dùng nơi nào khác trong file.

2. **State:** xoá dòng `const [manual, setManual] = useState({ mssv: '', name: '' });`.

3. **Lời báo kết quả:** thay khối

```tsx
      {result && (
        <Alert variant="success">
          <CircleCheckBig />
          <AlertDescription>
            Đã nhập xong: thêm {result.added}, cập nhật {result.updated}, giữ nguyên{' '}
            {result.unchanged}
            {result.removed > 0 ? `, xoá ${result.removed}` : ''}.
          </AlertDescription>
        </Alert>
      )}
```

bằng `{result && <ImportResultAlert result={result} />}`.

4. **Form thêm tay:** trong thẻ `Card` "Thêm thủ công một sinh viên", thay toàn bộ `<CardContent className="flex flex-col gap-4"> … </CardContent>` (gồm `Alert` lỗi và `<form …>` cũ) bằng:

```tsx
          <CardContent>
            <AddStudentForm
              submitting={addStudent.isPending}
              error={addStudent.isError ? addStudent.error : null}
              onSubmit={(student) => addStudent.mutateAsync(student)}
            />
          </CardContent>
```

và đổi `CardDescription` của thẻ đó thành: "Cho trường hợp chuyển lớp muộn hoặc sửa sót — không phải gửi lại cả file. Gõ MSSV là tự hiện tên đã lưu."

- [ ] **Step 5: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/components/roster`
Expected: PASS (hai file mới và `roster-file.test.ts` cũ). Ca "gửi tên đã lưu dù trước đó gõ tên khác" dựa vào việc `nameValue` được **dẫn xuất** từ `lookup.data` ở mỗi lần render chứ không sao chép vào state — nếu viết thành effect đồng bộ `name ← fullName` thì tên đã gõ bị mất khi MSSV quay về "mới".

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/roster
git commit -m "feat(web): thêm sinh viên gõ MSSV là tự hiện tên (khoá khi đã có), kết quả nhập nêu ai bị đổi tên"
```

---

### Task 4: Duyệt thi bù chọn lớp gốc theo nhãn kèm học kỳ

**Files:**
- Modify: `apps/web/src/app/(exam-live)/exam-sessions/[id]/_components/AccessRequestPanel.tsx`, `apps/web/src/app/(exam-live)/exam-sessions/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `TeachingClass.labelWithSemester` (Task 1).
- Produces: ô chọn lớp ở hộp thoại duyệt hiện `labelWithSemester`.

- [ ] **Step 1: Cập nhật test (đỏ)**

Trong `apps/web/src/app/(exam-live)/exam-sessions/[id]/page.test.tsx` có **bốn** mock lớp dạng `{ id, name, courseName, studentCount }` (quanh các dòng 969–1030). Thay như sau (mỗi mock cũ → hai trường mới; `courseName` giữ nguyên):

1. Ca `offers EVERY class the lecturer owns…`:
```ts
      useTeachingClassesMock.mockReturnValue({
        data: [
          { id: 'class-mine', label: 'Nhóm 01', labelWithSemester: 'Nhóm 01 · HK1 2026-2027', courseName: 'CTDL&GT', studentCount: 0 },
          // (giữ nguyên đoạn chú thích cũ về dòng dữ liệu cũ)
          { id: 'class-legacy', label: 'Nhóm 02 (dữ liệu cũ)', labelWithSemester: 'Nhóm 02 (dữ liệu cũ)', courseName: 'CTDL & GT', studentCount: 0 },
        ],
      });
```
và hai khẳng định cuối ca đổi thành:
```ts
      expect(await screen.findByText('Nhóm 01 · HK1 2026-2027')).toBeInTheDocument();
      expect(screen.getByText('Nhóm 02 (dữ liệu cũ)')).toBeInTheDocument();
```
(Lớp cũ chưa có học kỳ: server trả `labelWithSemester` không có phần ` · …`, nên nhãn hiện đúng như `label`.)

2. Hai ca `removes the request from the panel once approved` và `shows the server error and keeps the row…`: đổi mock thành
```ts
          { id: 'class-mine', label: 'Nhóm 01', labelWithSemester: 'Nhóm 01 · HK1 2026-2027', courseName: 'CTDL&GT', studentCount: 0 },
```
và dòng chọn option `fireEvent.click(await screen.findByText('Nhóm 01'));` đổi thành `fireEvent.click(await screen.findByText('Nhóm 01 · HK1 2026-2027'));` ở **cả hai** ca.

Thêm một ca mới ngay sau ca `offers EVERY class…` (cùng `describe`):

```ts
    it('Review Focus 6: hai lớp CÙNG mã khác kỳ phân biệt được trong ô chọn lớp gốc', async () => {
      useExamSessionDetailMock.mockReturnValue(activeSessionWithDeliverables());
      useTeachingClassesMock.mockReturnValue({
        data: [
          { id: 'k-2025', label: 'DHKTPM18A – Nhóm 1', labelWithSemester: 'DHKTPM18A – Nhóm 1 · HK1 2025-2026', courseName: 'CTDL&GT', studentCount: 0 },
          { id: 'k-2026', label: 'DHKTPM18A – Nhóm 1', labelWithSemester: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027', courseName: 'CTDL&GT', studentCount: 0 },
        ],
      });
      render(<ExamSessionLobbyPage />);
      trigger('connect');
      trigger('lobby:access_request', accessRequest());
      await waitFor(() => expect(screen.getByText('Người Lạ')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
      fireEvent.click(await screen.findByRole('combobox'));

      // Nếu ô chọn chỉ hiện `label`, hai dòng này giống hệt nhau và người duyệt không biết đang gắn em vào lớp của kỳ nào — và lớp gốc quyết
      // định bài của em về tay ai.
      expect(await screen.findByText('DHKTPM18A – Nhóm 1 · HK1 2025-2026')).toBeInTheDocument();
      expect(screen.getByText('DHKTPM18A – Nhóm 1 · HK1 2026-2027')).toBeInTheDocument();
    });
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run "src/app/(exam-live)/exam-sessions/[id]/page.test.tsx"`
Expected: FAIL ở bốn ca vừa sửa — `AccessRequestPanel` còn hiện `klass.name` (không có trong mock mới nên là `undefined`).

- [ ] **Step 3: Sửa component**

Trong `apps/web/src/app/(exam-live)/exam-sessions/[id]/_components/AccessRequestPanel.tsx`, đổi

```tsx
                <SelectItem key={klass.id} value={klass.id}>
                  {klass.name}
                </SelectItem>
```

thành

```tsx
                <SelectItem key={klass.id} value={klass.id}>
                  {/* Nhãn KÈM học kỳ: danh sách này gồm lớp của MỌI kỳ, và hai lớp cùng mã khác kỳ phải phân biệt được — lớp gốc quyết
                      định bài của em về tay ai. */}
                  {klass.labelWithSemester}
                </SelectItem>
```

và sửa chú thích của prop `classes` thành: "Mọi lớp của giảng viên (không lọc theo môn — hệ thống phục vụ một môn). Mỗi lớp hiện bằng `labelWithSemester`."

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run "src/app/(exam-live)/exam-sessions/[id]/page.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(exam-live)/exam-sessions/[id]"
git commit -m "feat(web): ô chọn lớp gốc khi duyệt thi bù hiện nhãn kèm học kỳ"
```

---

### Task 5: Chạy cả bộ, lint, và cập nhật danh sách `tsc` đỏ

**Files:**
- Modify: `docs/superpowers/plans/md-restore-web-tsc-red.txt`

- [ ] **Step 1: Chạy**

```powershell
cd apps/web
npx vitest run
npx eslint src/app/teacher/classes src/components/roster src/lib/api/teaching.ts src/lib/api/roster.ts src/hooks/useTeaching.ts "src/app/(exam-live)/exam-sessions/[id]/_components/AccessRequestPanel.tsx"
Get-ChildItem src -Recurse -Include *.ts,*.tsx | Select-String -Pattern 'createClass|updateClass|deleteClass|ClassFormDialog|DeleteClassDialog|useCreateClass|useUpdateClass|useDeleteClass' | Select-Object -First 5
pnpm exec tsc --noEmit 2>&1 | Select-String -Pattern '^src/' | ForEach-Object { ($_ -split '\(')[0] } | Sort-Object -Unique | Out-File -Encoding utf8 C:/tmp/tsc-red-after-g3a.txt
Compare-Object (Get-Content ../../docs/superpowers/plans/md-restore-web-tsc-red.txt) (Get-Content C:/tmp/tsc-red-after-g3a.txt)
```

Expected: vitest xanh; ESLint sạch; `Select-String` không tìm thấy gì (Review Focus 1); `Compare-Object` chỉ có các dòng `<=` (file **được sửa** khỏi danh sách): `src/lib/api/teaching.ts`, `src/hooks/useTeaching.ts`, các file dưới `src/app/teacher/classes/`, `AccessRequestPanel.tsx` (nếu chúng có trong danh sách ở Task 1 của G1); **không** có dòng `=>` (không file mới đỏ).

- [ ] **Step 2: Cập nhật danh sách đỏ và commit**

```powershell
Copy-Item C:/tmp/tsc-red-after-g3a.txt ../../docs/superpowers/plans/md-restore-web-tsc-red.txt -Force
```

```bash
git add docs/superpowers/plans/md-restore-web-tsc-red.txt
git commit -m "chore(web): cập nhật danh sách tsc đỏ có chủ ý sau plan G3a"
```

---

## Tự kiểm lại plan so với spec

- §5.2: "Lớp của tôi: trở về chỉ đọc, có bộ lọc năm học + học kỳ. Gỡ `class-form-dialog.tsx` và `delete-class-dialog.tsx`" — Task 1, 2 (gỡ hàm, hook, dialog; trang chỉ đọc; bộ lọc G1). "Danh sách sinh viên của lớp: giữ tải file + thêm tay; ô thêm tay gõ MSSV là tự hiện tên (§2.6)" — Task 3 (`AddStudentForm`: có → điền sẵn + khoá; mới → bắt buộc; lỗi tra → không chặn). Chữ màn trống `teacher/classes/page.tsx:91-92` — **nguyên văn spec** (Task 2, ca "chữ nguyên văn"); chữ ở `teacher/exam-sessions/new/page.tsx:283` thuộc form tạo phiên → plan G4.
- §2.6: "file Excel ghi tên khác tên đã lưu → file mới nhất thắng, kết quả import liệt kê rõ ai bị đổi tên" — Task 3 (`ImportResultAlert` liệt kê `renamed`, nói tên áp dụng mọi lớp). "Nhập tay MSSV đã có: tên điền sẵn và khoá" — Task 3. "Luồng xin phép thi bù" (phía server dùng tên đã lưu) — không có thay đổi web; ô chọn lớp gốc hiện nhãn kèm học kỳ (Task 4) vì danh sách gồm lớp của mọi kỳ.
- §7.2 (Lớp của tôi: Năm học + học kỳ): dùng `useSemesterYearFilter('teacher-classes')`, mặc định "Tất cả", màn trống khi lọc có nút "Xem tất cả học kỳ".
- §11: T-OWN-1 (web: không nút ghi lớp — Task 2 + Review Focus 1), T-STU-2 (ô tên khoá/mới/lỗi), T-STU-3 (phần hiển thị đổi tên), T-FLT-1 (một màn hình; các màn còn lại ở G3b).
- Quyết định mới, nêu để user duyệt: (a) **tra cứu lỗi không chặn** việc thêm — dựa trên bất biến của server (D1: MSSV đã có thì dùng tên đã lưu, không ghi đè bằng tên gõ); nếu muốn nghiêm hơn (chặn khi không tra được) thì đổi `nameLocked`; (b) `labelWithSemester` chỉ ở ô chọn lớp gốc, còn lại dùng `label` + cột Học kỳ; (c) `RosterScreen` giữ prop `canEdit` (vai trò Trưởng khoa đã bỏ, luôn `true`) — dọn riêng nếu muốn.
- Placeholder scan: không có "TBD"; mọi bước có mã/lệnh; các chỗ sửa file có sẵn nêu **khối cũ → khối mới** (hoặc vị trí và nội dung thay thế) cụ thể. Kiểu nhất quán: `TeachingClass` (Task 1) khớp mọi nơi dùng ở Task 2–4 và khớp `TeachingClassView` của plan D2; `AddStudentForm.onSubmit` khớp `addStudent.mutateAsync`; `ImportResultAlert` nhận đúng `RosterImportResult` đã thêm `renamed`; `useTeachingClasses(filters?)` giữ tương thích các callers G3b/G4 không truyền đối số.
