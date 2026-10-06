# Plan G3d — "Chấm điểm": danh sách phiên theo khoá học kỳ và nhãn lớp, gỡ bộ lọc học kỳ theo chuỗi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Danh sách phiên của trang `/teacher/grading` lọc học kỳ bằng **khoá** qua cặp ô Năm học → Học kỳ dùng chung (thay cho menu nhiều lựa chọn theo tên kỳ), hiện/gom/tìm lớp bằng **nhãn gộp** (`classLabel`), rồi **xoá** hai bản lọc theo chuỗi cuối cùng (`hooks/useSemesterFilter.ts`, `components/layout/semester-filter.tsx`).

**Architecture:** `ListFilters.semesters: string[]` đổi thành `ListFilters.semester: SemesterSelection` (G1). Phần thuần (`lib/session-list.ts`) lọc bằng `matchesSemester` trên `semesterId`/`academicYear` của từng dòng; nhóm "Học kỳ" không còn là một facet có đếm. URL đổi từ `sem=<tên kỳ>` (lặp) sang `year=<năm>` + `sem=<uuid>`; giá trị lạ bị bỏ, nên URL cũ về "Tất cả" thay vì giữ một bộ lọc không ai thấy. `SessionList` lấy danh sách kỳ từ `useSemesters()` và dọn lựa chọn mồ côi bằng `reconcileSelection` ở bước **dẫn xuất** (như trang bài thu, G3c). Vì cùng một lớp học ở hai học kỳ là hai lớp **trùng nhãn**, menu "Lớp" và tiêu đề nhóm theo lớp gắn học kỳ vào nhãn **chỉ khi nhãn trùng**. Cuối cùng một test chốt (T-FLT-1) giữ cho không ai nhập lại bản lọc cũ.

**Tech Stack:** Next.js 15, React 19, vitest + Testing Library (Radix Select: `fireEvent.click(combobox)` rồi `fireEvent.click(option)`).

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §4 (`GET /submissions/overview`: dòng thêm `semesterId/academicYear/term`, `classLabel`), §7.1 (`lib/session-list.ts` là một trong ba bản lọc theo chuỗi cần gom), §7.2 (Chấm điểm = Năm học + học kỳ cùng các bộ lọc có sẵn: lớp, phòng, loại kỳ thi; lọc bằng khoá; mặc định "Tất cả"), §11: T-FLT-1, T-FLT-2.

**Phụ thuộc:** plan G1 (`SemesterYearFilter`, `lib/semester-filter.ts`, `useSemesters`, `Semester`), plan G2 (`semesterTextOf` ở `lib/master-data-forms.ts`), plan G3c (`SessionOverviewItem` đã đổi kiểu: `classLabel`, `semesterId/academicYear/term`), plan G3b (đã bỏ người dùng `useSemesterFilter` ở trang Kỳ thi); API plan D3.

## Global Constraints

- **Hợp đồng (D3, đã vào kiểu ở G3c Task 1):** `SessionOverviewItem` có `classLabel: string | null`, `semesterId: string | null`, `academicYear: number | null`, `term: number | null`; **giữ** `semesterName` (bản chụp). Plan này **không** sửa `lib/api/submissions.ts`.
- **Lọc bằng khoá:** `matchesFilters` gọi `matchesSemester(f.semester, session)`. Dòng chưa có học kỳ (lớp cũ chưa backfill) **không khớp** khi đang lọc và khớp khi không lọc — không bao giờ nổ vì `null`.
- **Mặc định "Tất cả"** (`EMPTY_LIST_FILTERS.semester = ALL_SEMESTERS`).
- **"Xoá bộ lọc" xoá cả học kỳ**, và `hasActiveFilters` đếm học kỳ. Khác trang Kỳ thi/Bài thu (ở đó học kỳ là "phạm vi đang xem", cố ý không bị xoá): ở đây học kỳ từ trước đã là một bộ lọc thường nằm trong `ListFilters` và bị nút này xoá, và nút ở trạng thái rỗng ("Không có phiên nào khớp") **phải là đường thoát** khỏi mọi bộ lọc đã làm danh sách rỗng, kể cả học kỳ.
- **URL:** `year` (đúng bốn chữ số, 2000–2999) và `sem` (uuid). Mọi giá trị khác bị **bỏ**, không ném. Ghi `year` trước `sem`; chỉ ghi cái đang chọn. `sem` không kèm `year` được giữ — `reconcileSelection` điền năm khi danh sách kỳ đã tải.
- **Lựa chọn từ bảng học kỳ** (`useSemesters`), không từ các phiên đã tải; kỳ chưa có phiên nào vẫn chọn được. Lựa chọn trỏ vào học kỳ không còn tồn tại về "Tất cả" **chỉ khi** danh sách kỳ đã tải xong; trong lúc tải, khoá trên URL vẫn lọc ngay.
- **Menu học kỳ không còn số đếm theo kỳ** (cặp ô dùng chung không có). Số đếm của tab trạng thái và của menu Lớp/Loại kỳ thi/Phòng vẫn **theo kỳ đang chọn**.
- **Nhãn lớp trùng** (cùng lớp danh nghĩa + nhóm ở hai kỳ): menu "Lớp" và tiêu đề nhóm theo lớp thêm ` · HKx yyyy-yyyy` **chỉ khi** nhãn trùng; nhãn gọn là mặc định. Khoá nhóm/lựa chọn vẫn là `classId`.
- **Nhóm theo học kỳ:** khoá `semesterId` (chưa có → khoá cố định `NO_SEMESTER_KEY`), nhãn `semesterTextOf` (`HK1 2026-2027` / `Chưa gán học kỳ`), sắp theo (năm, kỳ) giảm dần, nhóm chưa có học kỳ cuối.
- **Tìm kiếm** vẫn quét `classLabel`, phòng, `semesterName` (bản chụp), mã, loại kỳ thi.
- Sau plan này `hooks/useSemesterFilter.ts` và `components/layout/semester-filter.tsx` **không còn**; `apps/web` còn `tsc` đỏ chỉ ở file của plan G4.

## Review Focus

1. **Bộ lọc học kỳ làm danh sách rỗng mà nút thoát không gỡ được nó.** → ca trang: `sem=<kỳ cũ>&status=done` ra "Không có phiên nào khớp", nút "Xoá bộ lọc" ở trạng thái rỗng đưa URL về trần (Task 2).
2. **URL cũ hoặc hỏng làm trắng trang hoặc giữ một bộ lọc vô hình** (`sem=HK1 2026-2027`, `year=abc`, `sem=` trống, hai `sem=` kiểu nhiều lựa chọn cũ). → ca parse (Task 1) và ca trang đọc URL cũ vẫn ra đủ danh sách (Task 2).
3. **Học kỳ trong URL đã bị admin xoá (hoặc dán từ môi trường khác) cho ra danh sách rỗng khó hiểu**, và ngược lại: **dọn nhầm khi danh sách kỳ còn đang tải.** → hai ca trang (Task 2).
4. **Hai lớp cùng nhãn ở hai học kỳ không phân biệt được** trong menu Lớp và tiêu đề nhóm (cùng "DHKTPM18A – Nhóm 1" ở HK1 và HK2 là chuyện thường kỳ nào cũng có). → ca `facetOptions`/`groupRows` (Task 1) và ca bảng (Task 2).
5. **Phiên của lớp chưa có học kỳ (dữ liệu cũ chưa backfill)** nổ, lọt qua bộ lọc kỳ, hoặc vào một nhóm vô danh. → ca khớp/nhóm "Chưa gán học kỳ" (Task 1).
6. **Đổi tab trạng thái/bộ lọc khác làm rơi học kỳ đang chọn khỏi URL.** → ca trang: bấm tab "Chưa chấm" giữ `year`/`sem` (Task 2).

---

## File Structure

| File | Việc |
|---|---|
| `apps/web/src/lib/session-list.ts` (+ test) | `ListFilters.semester`; bỏ facet `semesters`; `classLabel`; `tellApart` (nhãn trùng); nhóm theo học kỳ bằng khoá. |
| `apps/web/src/lib/session-list-url.ts` (+ test) | `year` + `sem`(uuid) thay `sem` lặp. |
| `apps/web/src/lib/session-list.fixtures.ts` | `classLabel`, trường học kỳ; `SEM_*`, `SEMESTERS`, `IN_HK2_2025`. |
| `apps/web/src/app/teacher/grading/_components/session-list/FilterBar.tsx` (+ test) | `SemesterYearFilter`, prop `semesters`. |
| `apps/web/src/app/teacher/grading/_components/session-list/SessionList.tsx` (+ test) | `useSemesters`, `reconcileSelection`. |
| `apps/web/src/app/teacher/grading/_components/session-list/SessionTable.tsx` (+ test), `BulkDialog.tsx` (+ test), `apps/web/src/app/teacher/grading/_components/SessionHeader.tsx` | `className` → `classLabel`. |
| `apps/web/src/app/teacher/grading/page.test.tsx` | Fixture + mock `useSemesters`. |
| `apps/web/src/hooks/useSemesterFilter.ts`, `apps/web/src/components/layout/semester-filter.tsx` | **Xoá.** |
| `apps/web/src/lib/no-string-semester-filter.test.ts` | **Mới.** T-FLT-1: không ai nhập lại bản lọc cũ. |

---

### Task 1: Hàm thuần — lọc, đếm, nhóm, URL

**Files:**
- Modify: `apps/web/src/lib/session-list.ts`, `apps/web/src/lib/session-list-url.ts`, `apps/web/src/lib/session-list.fixtures.ts`
- Test: `apps/web/src/lib/session-list.test.ts`, `apps/web/src/lib/session-list-url.test.ts`

**Interfaces:**
- Consumes: `SemesterSelection`, `ALL_SEMESTERS`, `isFiltering`, `matchesSemester` (G1 `lib/semester-filter.ts`); `semesterTextOf` (G2 `lib/master-data-forms.ts`); `Semester` (G1 `lib/api/semesters`); `SessionOverviewItem` (G3c).
- Produces:

```ts
// lib/session-list.ts
export interface ListFilters { q: string; status: ListStatus | 'all'; semester: SemesterSelection; classIds: string[]; examTypes: string[]; rooms: string[]; time: 'all' | '7' | '30'; noRubric: boolean }
export type FacetKey = 'classIds' | 'examTypes' | 'rooms';
export const FACET_KEYS: FacetKey[];            // ['classIds', 'examTypes', 'rooms']
export const NO_SEMESTER_KEY = '__no-semester__';
// facetOptions(...) → Record<FacetKey, FacetOption[]>  (KHÔNG còn `semesters`)
// groupRows(rows, 'class' | 'semester' | 'none')  — nhóm 'semester' có key = semesterId ?? NO_SEMESTER_KEY

// lib/session-list.fixtures.ts
export const SEM_HK1_2026: string;   // uuid
export const SEM_HK2_2025: string;   // uuid
export const SEMESTERS: Semester[];  // HK1 2026-2027, HK2 2025-2026
export const IN_HK2_2025: { semesterId; academicYear: 2025; term: 2; semesterName: 'HK2 2025-2026' }  // rải vào session({...})
// session() mặc định: classLabel 'DHKTPM18ATT', học kỳ HK1 2026-2027 (SEM_HK1_2026, 2026, 1)
```

- [ ] **Step 1: Sửa fixture và viết test (đỏ)**

Trong `apps/web/src/lib/session-list.fixtures.ts`:

1. Thêm vào đầu file, sau các dòng `import`:

```ts
import type { Semester } from './api/semesters';

/** Hai học kỳ cố định cho test. Id có HÌNH uuid vì `parseListState` chỉ nhận `sem` có hình uuid. */
export const SEM_HK1_2026 = '11111111-1111-4111-8111-111111111111';
export const SEM_HK2_2025 = '22222222-2222-4222-8222-222222222222';

export const SEMESTERS: Semester[] = [
  { id: SEM_HK1_2026, academicYearStart: 2026, term: 1, label: 'HK1 2026-2027', startDate: '2026-09-01', endDate: '2027-01-15' },
  { id: SEM_HK2_2025, academicYearStart: 2025, term: 2, label: 'HK2 2025-2026', startDate: '2026-02-01', endDate: '2026-06-30' },
];

/** Rải vào `session({ … })` để đặt phiên vào kỳ cũ. */
export const IN_HK2_2025 = { semesterId: SEM_HK2_2025, academicYear: 2025, term: 2, semesterName: 'HK2 2025-2026' } as const;
```

2. Trong `session()` đổi `className: 'DHKTPM18ATT',` thành `classLabel: 'DHKTPM18ATT',` và đổi dòng `semesterName: 'HK1 2026-2027',` thành

```ts
    semesterName: 'HK1 2026-2027',
    semesterId: SEM_HK1_2026,
    academicYear: 2026,
    term: 1,
```

Trong `apps/web/src/lib/session-list.test.ts`:

1. Dòng import fixture đổi thành `import { IN_HK2_2025, NOW, SEM_HK1_2026, rowsOf, session, summary } from './session-list.fixtures';`.
2. Thay **toàn bộ** khối `describe('matchesFilters', …)` (đến dòng `});` đóng của nó, ngay trước `describe('hasActiveFilters'`) bằng:

```ts
describe('matchesFilters', () => {
  const rows = rowsOf(
    [
      session({ id: 'a', name: 'Kiểm tra giữa kỳ', classLabel: 'DHKTPM18ATT', classId: 'c1', roomName: 'Phòng máy A1', examType: 'GK' }),
      session({ id: 'b', name: 'Thực hành đồ thị', classLabel: 'DHKTPM19BTT', classId: 'c2', roomName: 'H3.03', examType: 'TK', ...IN_HK2_2025, startTime: new Date(2026, 5, 12).toISOString(), rubricId: null }),
    ],
    [summary('a', { flagged_for_review: 1 }), summary('b')],
  );
  const ids = (filters: ListFilters) => rows.filter((r) => matchesFilters(r, filters, NOW)).map((r) => r.session.id);

  it('empty filters match everything', () => expect(ids(f())).toEqual(['a', 'b']));
  it('search ignores diacritics: "giua ky" finds "giữa kỳ"', () => expect(ids(f({ q: 'giua ky' }))).toEqual(['a']));
  it('search reaches class, room, semester text and the exam-type label', () => {
    expect(ids(f({ q: 'dhktpm19' }))).toEqual(['b']);
    expect(ids(f({ q: 'h3.03' }))).toEqual(['b']);
    expect(ids(f({ q: 'thuong ky' }))).toEqual(['b']);
    expect(ids(f({ q: '2025-2026' }))).toEqual(['b']);
  });
  it('several words must all match', () => expect(ids(f({ q: 'giua do' }))).toEqual([]));
  it('inside a facet it is OR, between facets AND', () => {
    expect(ids(f({ classIds: ['c1', 'c2'] }))).toEqual(['a', 'b']);
    expect(ids(f({ classIds: ['c1', 'c2'], examTypes: ['TK'] }))).toEqual(['b']);
  });
  it('status filter', () => expect(ids(f({ status: 'attention' }))).toEqual(['a']));
  it('time window counts back from now', () => {
    expect(ids(f({ time: '7' }))).toEqual(['a']);
    expect(ids(f({ time: '30' }))).toEqual(['a']);
  });
  it('"Thiếu rubric" keeps only sessions without one', () => expect(ids(f({ noRubric: true }))).toEqual(['b']));
  it('an unparseable start time never crashes the filter', () => {
    const [bad] = rowsOf([session({ startTime: 'không phải ngày' })], []);
    expect(() => matchesFilters(bad, f({ time: '7' }), NOW)).not.toThrow();
  });

  it('T-FLT-2: the semester filters by KEY — a whole year, or one term of it, ANDed with the other filters', () => {
    expect(ids(f({ semester: { academicYear: 2026, semesterId: null } }))).toEqual(['a']);
    expect(ids(f({ semester: { academicYear: 2025, semesterId: null } }))).toEqual(['b']);
    expect(ids(f({ semester: { academicYear: 2026, semesterId: SEM_HK1_2026 } }))).toEqual(['a']);
    expect(ids(f({ semester: { academicYear: 2026, semesterId: SEM_HK1_2026 }, classIds: ['c2'] }))).toEqual([]);
    expect(ids(f({ semester: { academicYear: 2027, semesterId: null } }))).toEqual([]);
  });

  it('two spellings of the same semester are ONE filter (the key, not the text)', () => {
    const spelled = rowsOf(
      [session({ id: 'x', semesterName: 'HK1 2026-2027' }), session({ id: 'y', semesterName: 'Học kỳ 1 2026-2027' })],
      [],
    );
    const hit = spelled.filter((r) => matchesFilters(r, f({ semester: { academicYear: 2026, semesterId: SEM_HK1_2026 } }), NOW));
    expect(hit.map((r) => r.session.id)).toEqual(['x', 'y']);
  });

  it('a session whose class has no semester yet: matches when not filtering, never when filtering, never throws', () => {
    const [legacy] = rowsOf([session({ id: 'old', semesterId: null, academicYear: null, term: null })], []);
    expect(matchesFilters(legacy, EMPTY_LIST_FILTERS, NOW)).toBe(true);
    expect(matchesFilters(legacy, f({ semester: { academicYear: 2026, semesterId: null } }), NOW)).toBe(false);
    expect(matchesFilters(legacy, f({ semester: { academicYear: 2026, semesterId: SEM_HK1_2026 } }), NOW)).toBe(false);
  });
});
```

3. Trong `describe('hasActiveFilters', …)` thêm một dòng `expect` ngay trước dòng `expect(hasActiveFilters(f({ noRubric: true }))).toBe(true);`:

```ts
    expect(hasActiveFilters(f({ semester: { academicYear: 2026, semesterId: null } }))).toBe(true);
    expect(hasActiveFilters(f({ semester: { academicYear: null, semesterId: SEM_HK1_2026 } }))).toBe(true);
```

4. Thay **toàn bộ** khối `describe('facetOptions and statusCounts', …)` (đến `});` đóng, ngay trước `describe('sortRows'`) bằng:

```ts
describe('facetOptions and statusCounts', () => {
  const rows = rowsOf(
    [
      session({ id: 'a', classId: 'c1', classLabel: 'DHKTPM18ATT', examType: 'GK' }),
      session({ id: 'b', classId: 'c2', classLabel: 'DHKTPM19BTT', examType: 'TK' }),
      session({ id: 'c', classId: 'c3', classLabel: 'DHKTPM20CTT', examType: 'CK', ...IN_HK2_2025, startTime: new Date(2026, 5, 12).toISOString() }),
    ],
    [summary('a', { finalized: 1 }), summary('b', { finalized: 1 }), summary('c', { auto_approved: 1 })],
  );

  it('the semester is not a facet any more — the shared year → semester pair owns it', () => {
    expect(Object.keys(facetOptions(rows, EMPTY_LIST_FILTERS, NOW))).toEqual(['classIds', 'examTypes', 'rooms']);
  });

  it("a facet's own filter does not narrow its own counts (so you can add a second choice)", () => {
    const opts = facetOptions(rows, f({ classIds: ['c1'] }), NOW);
    expect(opts.classIds.map((o) => [o.value, o.count])).toEqual([['c1', 1], ['c2', 1], ['c3', 1]]);
  });

  it("other filters DO narrow a facet's counts — the semester too", () => {
    const byClass = facetOptions(rows, f({ classIds: ['c1'] }), NOW);
    expect(byClass.examTypes.map((o) => [o.value, o.count])).toEqual([['TK', 0], ['GK', 1], ['CK', 0]]);
    const bySemester = facetOptions(rows, f({ semester: { academicYear: 2026, semesterId: null } }), NOW);
    expect(bySemester.classIds.map((o) => [o.value, o.count])).toEqual([['c1', 1], ['c2', 1], ['c3', 0]]);
  });

  it('exam types in TK/GK/CK order, classes by label', () => {
    const opts = facetOptions(rows, EMPTY_LIST_FILTERS, NOW);
    expect(opts.examTypes.map((o) => o.value)).toEqual(['TK', 'GK', 'CK']);
    expect(opts.classIds.map((o) => o.label)).toEqual(['DHKTPM18ATT', 'DHKTPM19BTT', 'DHKTPM20CTT']);
  });

  it('a class with no label is named, not blank', () => {
    const [r] = rowsOf([session({ classLabel: null })], []);
    expect(facetOptions([r], EMPTY_LIST_FILTERS, NOW).classIds[0].label).toBe('Không rõ lớp');
  });

  it('Review Focus 4: two classes with the SAME label (one class again in another semester) are told apart by semester — and only then', () => {
    const twins = rowsOf(
      [
        session({ id: 'x', classId: 'k1', classLabel: 'DHKTPM18A – Nhóm 1' }),
        session({ id: 'y', classId: 'k2', classLabel: 'DHKTPM18A – Nhóm 1', ...IN_HK2_2025 }),
        session({ id: 'z', classId: 'k3', classLabel: 'DHKTPM19B' }),
      ],
      [],
    );
    const opts = facetOptions(twins, EMPTY_LIST_FILTERS, NOW).classIds;
    expect(opts.map((o) => o.label)).toEqual(['DHKTPM18A – Nhóm 1 · HK1 2026-2027', 'DHKTPM18A – Nhóm 1 · HK2 2025-2026', 'DHKTPM19B']);
    expect(opts.map((o) => o.value)).toEqual(['k1', 'k2', 'k3']); // khoá vẫn là classId
  });

  it('status counts follow every other filter but not the status filter itself', () => {
    const counts = statusCounts(rows, f({ status: 'done', classIds: ['c2', 'c3'] }), NOW);
    expect(counts).toEqual({ all: 2, attention: 0, ready: 1, todo: 0, running: 0, done: 1 });
  });

  it('status counts follow the semester', () => {
    const counts = statusCounts(rows, f({ semester: { academicYear: 2025, semesterId: null } }), NOW);
    expect(counts).toEqual({ all: 1, attention: 0, ready: 1, todo: 0, running: 0, done: 0 });
  });
});
```

5. Thay **toàn bộ** khối `describe('groupRows', …)` (đến `});` đóng, ngay trước `describe('bulkPlan'`) bằng:

```ts
describe('groupRows', () => {
  const rows = rowsOf(
    [
      session({ id: 'a', classId: 'c3', classLabel: 'C', ...IN_HK2_2025, startTime: new Date(2026, 5, 1).toISOString() }),
      session({ id: 'b', classId: 'c1', classLabel: 'A' }),
      session({ id: 'c', classId: 'c2', classLabel: 'B' }),
      session({ id: 'd', classId: 'c1', classLabel: 'A' }),
    ],
    [],
  );
  it('none → one unnamed group holding everything, order kept', () => {
    const g = groupRows(rows, 'none');
    expect(g).toHaveLength(1);
    expect(g[0].label).toBeNull();
    expect(g[0].rows.map((r) => r.session.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('class → groups ordered by label, rows keep their order inside', () => {
    const g = groupRows(rows, 'class');
    expect(g.map((x) => x.label)).toEqual(['A', 'B', 'C']);
    expect(g[0].rows.map((r) => r.session.id)).toEqual(['b', 'd']);
  });
  it('Review Focus 4: two classes with the same label are two groups, told apart by semester', () => {
    const twins = rowsOf(
      [
        session({ id: 'x', classId: 'k1', classLabel: 'DHKTPM18A – Nhóm 1' }),
        session({ id: 'y', classId: 'k2', classLabel: 'DHKTPM18A – Nhóm 1', ...IN_HK2_2025 }),
      ],
      [],
    );
    const g = groupRows(twins, 'class');
    expect(g.map((x) => x.key)).toEqual(['k1', 'k2']);
    expect(g.map((x) => x.label)).toEqual(['DHKTPM18A – Nhóm 1 · HK1 2026-2027', 'DHKTPM18A – Nhóm 1 · HK2 2025-2026']);
  });
  it('semester → keyed by the semester, newest (year, term) first, labelled from the keys', () => {
    const g = groupRows(rows, 'semester');
    expect(g.map((x) => x.label)).toEqual(['HK1 2026-2027', 'HK2 2025-2026']);
    expect(g.map((x) => x.key)).toEqual([SEM_HK1_2026, IN_HK2_2025.semesterId]);
    expect(g[0].rows.map((r) => r.session.id)).toEqual(['b', 'c', 'd']);
  });
  it('Review Focus 5: sessions whose class has no semester yet form their own LAST group, never a blank one', () => {
    const legacy = rowsOf([session({ id: 'old', semesterId: null, academicYear: null, term: null }), ...rows.map((r) => r.session)], []);
    const g = groupRows(legacy, 'semester');
    expect(g.map((x) => x.label)).toEqual(['HK1 2026-2027', 'HK2 2025-2026', 'Chưa gán học kỳ']);
    expect(g[2].key).toBe(NO_SEMESTER_KEY);
    expect(g[2].rows.map((r) => r.session.id)).toEqual(['old']);
  });
});
```

và thêm `NO_SEMESTER_KEY,` vào danh sách import từ `./session-list` (giữ thứ tự chữ cái: ngay sau `EMPTY_LIST_FILTERS,`).

Thay **toàn bộ** nội dung `apps/web/src/lib/session-list-url.test.ts` bằng:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, EMPTY_LIST_FILTERS } from './session-list';
import { parseListState, serializeListState, type ListState } from './session-list-url';
import { SEM_HK1_2026, SEM_HK2_2025 } from './session-list.fixtures';

const parse = (qs: string) => parseListState(new URLSearchParams(qs));

describe('parseListState', () => {
  it('no params → the defaults', () => {
    expect(parse('')).toEqual({ filters: EMPTY_LIST_FILTERS, view: DEFAULT_VIEW });
  });

  it('reads every parameter', () => {
    const s = parse(`q=giua+ky&status=attention&year=2026&sem=${SEM_HK1_2026}&cls=c1&type=GK&room=A1&time=7&norubric=1&sort=date%3Aasc&group=class`);
    expect(s.filters).toEqual({
      q: 'giua ky', status: 'attention', semester: { academicYear: 2026, semesterId: SEM_HK1_2026 }, classIds: ['c1'], examTypes: ['GK'], rooms: ['A1'], time: '7', noRubric: true,
    });
    expect(s.view).toEqual({ sortKey: 'date', sortDir: 'asc', group: 'class' });
  });

  it('garbage falls back to defaults instead of throwing', () => {
    const s = parse('status=zzz&time=999&sort=foo%3Abar&group=nope&norubric=yes&sem=&year=');
    expect(s.filters.status).toBe('all');
    expect(s.filters.time).toBe('all');
    expect(s.filters.noRubric).toBe(false);
    expect(s.view).toEqual(DEFAULT_VIEW);
    expect(s.filters.semester).toEqual(EMPTY_LIST_FILTERS.semester);
  });

  it('Review Focus 2: a semester that is not a key is dropped — the old URL named it as text, several times', () => {
    expect(parse('sem=HK1+2026-2027').filters.semester).toEqual(EMPTY_LIST_FILTERS.semester);
    expect(parse('sem=HK1&sem=HK2').filters.semester).toEqual(EMPTY_LIST_FILTERS.semester);
    expect(parse('sem=%3Cscript%3E').filters.semester).toEqual(EMPTY_LIST_FILTERS.semester);
  });

  it('the year must be four digits in 2000–2999; anything else is dropped', () => {
    expect(parse('year=2026').filters.semester.academicYear).toBe(2026);
    for (const bad of ['abc', '1999', '3000', '20266', '2026.5', '-2026', '']) {
      expect(parse(`year=${bad}`).filters.semester.academicYear).toBeNull();
    }
  });

  it('a semester key without a year is kept — the page fills the year in once the semesters have loaded', () => {
    expect(parse(`sem=${SEM_HK2_2025}`).filters.semester).toEqual({ academicYear: null, semesterId: SEM_HK2_2025 });
  });

  it('a valid sort key with a missing or wrong direction takes that key\'s natural direction', () => {
    expect(parse('sort=date').view).toMatchObject({ sortKey: 'date', sortDir: 'desc' });
    expect(parse('sort=name%3Aupwards').view).toMatchObject({ sortKey: 'name', sortDir: 'asc' });
  });

  it('repeated values are de-duplicated and an enormous q is cut', () => {
    expect(parse('cls=a&cls=a&cls=b').filters.classIds).toEqual(['a', 'b']);
    expect(parse(`q=${'x'.repeat(500)}`).filters.q).toHaveLength(100);
  });
});

describe('serializeListState', () => {
  it('writes nothing for the defaults', () => {
    expect(serializeListState({ filters: EMPTY_LIST_FILTERS, view: DEFAULT_VIEW }).toString()).toBe('');
  });

  it('round-trips a full state', () => {
    const state: ListState = {
      filters: { q: 'đồ thị', status: 'ready', semester: { academicYear: 2025, semesterId: SEM_HK2_2025 }, classIds: ['c1', 'c2'], examTypes: ['TK'], rooms: ['H3.03'], time: '30', noRubric: true },
      view: { sortKey: 'submitted', sortDir: 'asc', group: 'semester' },
    };
    expect(parseListState(serializeListState(state))).toEqual(state);
  });

  it('writes the year and the key as separate parameters, year first, and only what is set', () => {
    const base = { view: DEFAULT_VIEW };
    expect(serializeListState({ ...base, filters: { ...EMPTY_LIST_FILTERS, semester: { academicYear: 2026, semesterId: null } } }).toString()).toBe('year=2026');
    expect(
      serializeListState({ ...base, filters: { ...EMPTY_LIST_FILTERS, semester: { academicYear: 2026, semesterId: SEM_HK1_2026 } } }).toString(),
    ).toBe(`year=2026&sem=${SEM_HK1_2026}`);
  });

  it('never writes a sessionId (the list is what the session screen comes back to)', () => {
    const qs = serializeListState({ filters: { ...EMPTY_LIST_FILTERS, q: 'a' }, view: DEFAULT_VIEW }).toString();
    expect(qs).not.toContain('sessionId');
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/lib/session-list.test.ts src/lib/session-list-url.test.ts`
Expected: FAIL — `NO_SEMESTER_KEY` chưa có, `EMPTY_LIST_FILTERS.semester` là `undefined`, `facetOptions` còn trả `semesters`, `groupRows` còn đọc `className`, URL còn đọc `sem` như chuỗi lặp.

- [ ] **Step 3: Sửa `lib/session-list.ts`**

1. Imports ở đầu file — thay khối import hiện có bằng:

```ts
import type { GradingSessionSummary } from './api/grading';
import type { SessionOverviewItem } from './api/submissions';
import { EXAM_TYPE_LABELS } from './exam-session-display';
import { semesterTextOf } from './master-data-forms';
import { ALL_SEMESTERS, isFiltering, matchesSemester, type SemesterSelection } from './semester-filter';
import { STATE_ORDER, countsFromSummary, type SessionState } from './session-triage';
```

2. Thay khối từ `export interface ListFilters {` đến hết hàm `hasActiveFilters` bằng:

```ts
export interface ListFilters {
  q: string;
  status: ListStatus | 'all';
  /**
   * Lọc bằng KHOÁ học kỳ (`semesterId`/`academicYear` trên từng phiên) — cùng cặp ô Năm học → Học kỳ với các màn hình khác (spec §7.2).
   * Không còn là danh sách TÊN kỳ dựng từ các phiên đã tải: ở đó hai cách viết một kỳ là hai mục, và kỳ chưa có phiên nào thì không chọn được.
   */
  semester: SemesterSelection;
  /** `classId`, không phải tên: tên chỉ để hiện, khoá mới phân biệt hai lớp trùng tên. */
  classIds: string[];
  examTypes: string[];
  rooms: string[];
  time: 'all' | '7' | '30';
  noRubric: boolean;
}

export const EMPTY_LIST_FILTERS: ListFilters = {
  q: '',
  status: 'all',
  semester: ALL_SEMESTERS,
  classIds: [],
  examTypes: [],
  rooms: [],
  time: 'all',
  noRubric: false,
};

export function hasActiveFilters(f: ListFilters): boolean {
  return (
    f.q.trim() !== '' ||
    f.status !== 'all' ||
    isFiltering(f.semester) ||
    f.classIds.length > 0 ||
    f.examTypes.length > 0 ||
    f.rooms.length > 0 ||
    f.time !== 'all' ||
    f.noRubric
  );
}
```

3. Thay khối từ `export type FacetKey = …` đến hết hàm `matchesFilters` bằng:

```ts
/** Học kỳ KHÔNG nằm đây: nó là cặp ô dùng chung, lọc bằng khoá, không có menu đếm theo từng kỳ. */
export type FacetKey = 'classIds' | 'examTypes' | 'rooms';
export const FACET_KEYS: FacetKey[] = ['classIds', 'examTypes', 'rooms'];

const NO_CLASS_LABEL = 'Không rõ lớp';

const FACET_VALUE: Record<FacetKey, (s: SessionOverviewItem) => string> = {
  classIds: (s) => s.classId,
  examTypes: (s) => s.examType,
  rooms: (s) => s.roomName,
};
const FACET_LABEL: Record<FacetKey, (s: SessionOverviewItem) => string> = {
  classIds: (s) => s.classLabel ?? NO_CLASS_LABEL,
  examTypes: (s) => EXAM_TYPE_LABELS[s.examType] ?? s.examType,
  rooms: (s) => s.roomName,
};

/**
 * Cùng một lớp danh nghĩa + nhóm học ở hai học kỳ là hai LỚP (hai `classId`) cùng nhãn — kỳ nào cũng có. Chỉ khi nhãn trùng mới gắn học kỳ vào:
 * nhãn gọn là mặc định, vì phần lớn danh sách không có hai kỳ của cùng một lớp. Sửa tại chỗ các phần tử do hàm gọi vừa dựng.
 */
function tellApart(items: Array<{ label: string | null }>, suffixOf: (index: number) => string): void {
  const seen = new Map<string, number>();
  for (const { label } of items) if (label !== null) seen.set(label, (seen.get(label) ?? 0) + 1);
  items.forEach((item, i) => {
    if (item.label !== null && (seen.get(item.label) ?? 0) > 1) item.label = `${item.label} · ${suffixOf(i)}`;
  });
}

/**
 * `skip` bỏ MỘT bộ lọc ra khỏi phép so — dùng để đếm số lượng của chính bộ lọc đó (đếm theo các bộ lọc KHÁC),
 * và để đếm tab trạng thái. Trong một nhóm: OR. Giữa các nhóm: AND. Nhóm rỗng = không lọc. Học kỳ luôn được áp:
 * không bộ lọc nào đếm theo từng kỳ, nên không có gì để bỏ qua.
 */
export function matchesFilters(row: SessionRow, f: ListFilters, now: number, skip?: FacetKey | 'status'): boolean {
  const s = row.session;
  const words = foldText(f.q).split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    const haystack = foldText(
      [s.name, s.classLabel ?? '', s.roomName, s.semesterName, s.code, EXAM_TYPE_LABELS[s.examType] ?? ''].join(' '),
    );
    if (!words.every((w) => haystack.includes(w))) return false;
  }
  for (const key of FACET_KEYS) {
    if (key !== skip && f[key].length > 0 && !f[key].includes(FACET_VALUE[key](s))) return false;
  }
  // Bằng KHOÁ trên từng phiên. Phiên của lớp chưa có học kỳ: khớp khi không lọc, không khớp khi đang lọc (xem `matchesSemester`).
  if (!matchesSemester(f.semester, s)) return false;
  if (f.time !== 'all') {
    const age = now - Date.parse(s.startTime);
    // Ngày không đọc được → không loại (NaN so sánh luôn sai): giấu phiên vì một ô ngày hỏng đắt hơn hiện thừa.
    if (age > Number(f.time) * DAY_MS) return false;
  }
  if (f.noRubric && s.rubricId !== null) return false;
  // Trạng thái chưa biết (bảng tóm tắt đang tải hoặc lỗi) không phải "trạng thái khác": bộ lọc trạng thái từ
  // URL chưa có gì để so, và giấu mọi hàng vì thế biến một chỗ chưa biết thành một danh sách trống.
  if (skip !== 'status' && f.status !== 'all' && row.status !== null && row.status !== f.status) return false;
  return true;
}
```

4. Thay hàm `facetOptions` (từ `export function facetOptions(` đến `}` đóng của nó) bằng:

```ts
export function facetOptions(rows: SessionRow[], f: ListFilters, now: number): Record<FacetKey, FacetOption[]> {
  const out = {} as Record<FacetKey, FacetOption[]>;
  for (const key of FACET_KEYS) {
    const labels = new Map<string, string>();
    const counts = new Map<string, number>();
    const semesterOf = new Map<string, string>();
    for (const r of rows) {
      const value = FACET_VALUE[key](r.session);
      labels.set(value, FACET_LABEL[key](r.session));
      if (key === 'classIds') semesterOf.set(value, semesterTextOf(r.session));
      if (matchesFilters(r, f, now, key)) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const options = [...labels].map(([value, label]) => ({ value, label, count: counts.get(value) ?? 0 }));
    // Trước khi sắp: thứ tự theo nhãn CUỐI CÙNG, nhãn đã gắn kỳ.
    if (key === 'classIds') tellApart(options, (i) => semesterOf.get(options[i].value) ?? '');
    if (key === 'examTypes') options.sort((a, b) => ['TK', 'GK', 'CK'].indexOf(a.value) - ['TK', 'GK', 'CK'].indexOf(b.value));
    else options.sort((a, b) => a.label.localeCompare(b.label, 'vi', { numeric: true }));
    out[key] = options;
  }
  return out;
}
```

5. Thay hàm `groupRows` (từ `export function groupRows(` đến `}` đóng của nó) bằng:

```ts
/** Khoá của nhóm "chưa có học kỳ" — cố định, không trùng một uuid nào. */
export const NO_SEMESTER_KEY = '__no-semester__';

export function groupRows(rows: SessionRow[], group: ListView['group']): RowGroup[] {
  if (group === 'none') return [{ key: null, label: null, rows }];
  const map = new Map<string, RowGroup>();
  for (const r of rows) {
    const s = r.session;
    const key = group === 'class' ? s.classId : (s.semesterId ?? NO_SEMESTER_KEY);
    const label = group === 'class' ? (s.classLabel ?? NO_CLASS_LABEL) : semesterTextOf(s);
    const entry = map.get(key) ?? { key, label, rows: [] };
    entry.rows.push(r);
    map.set(key, entry);
  }
  const groups = [...map.values()];
  if (group === 'class') {
    // Hai lớp cùng nhãn là hai nhóm — phân biệt bằng học kỳ, chỉ khi trùng.
    tellApart(groups, (i) => semesterTextOf(groups[i].rows[0].session));
    return groups.sort((a, b) => a.label!.localeCompare(b.label!, 'vi', { numeric: true }));
  }
  // Theo (năm, kỳ), không theo ngày thi mới nhất: hai kỳ có thể thi gối nhau, còn (năm, kỳ) thì ổn định. Chưa có học kỳ thì cuối.
  const rankOf = (g: RowGroup): number => {
    const s = g.rows[0].session;
    return s.academicYear === null || s.term === null ? -1 : s.academicYear * 10 + s.term;
  };
  return groups.sort((a, b) => rankOf(b) - rankOf(a));
}
```

- [ ] **Step 4: Sửa `lib/session-list-url.ts`**

1. Thêm vào dòng import: `import { type SemesterSelection } from './semester-filter';` (đặt sau khối `import { … } from './session-list';`, hoặc gộp theo thứ tự của file).
2. Ngay trên hàm `many`, thêm:

```ts
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YEAR = /^2\d{3}$/; // 2000–2999, như bộ lọc `academicYear` ở server (plan D3)
```

3. Ngay dưới hàm `many`, thêm:

```ts
/**
 * `year` + `sem` (khoá). Giá trị lạ BỊ BỎ: URL cũ mang TÊN kỳ (`sem=HK1 2026-2027`, lặp nhiều lần), URL gõ tay, hay một id hỏng đều về "Tất cả" thay vì
 * giữ một bộ lọc không ai thấy. Không kiểm kỳ có tồn tại ở đây (chưa có danh sách kỳ): `SessionList` dọn việc đó bằng `reconcileSelection` khi danh
 * sách đã tải. `sem` không kèm `year` vẫn được giữ — năm được điền theo kỳ ở bước đó.
 */
function semesterOf(params: URLSearchParams): SemesterSelection {
  const year = params.get('year') ?? '';
  const sem = params.get('sem') ?? '';
  return { academicYear: YEAR.test(year) ? Number(year) : null, semesterId: UUID.test(sem) ? sem : null };
}
```

4. Trong `parseListState` đổi dòng `semesters: many(params, 'sem'),` thành `semester: semesterOf(params),`.
5. Trong `serializeListState` đổi dòng `filters.semesters.forEach((v) => p.append('sem', v));` thành

```ts
  if (filters.semester.academicYear !== null) p.set('year', String(filters.semester.academicYear));
  if (filters.semester.semesterId !== null) p.set('sem', filters.semester.semesterId);
```

- [ ] **Step 5: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/lib/session-list.test.ts src/lib/session-list-url.test.ts`
Expected: PASS. Ca dễ trượt: "Review Focus 4" ở `facetOptions` đòi `tellApart` chạy **trước** khi sắp (nếu sắp trước thì thứ tự theo nhãn gốc, hai lớp trùng nhãn nằm cạnh nhau nhưng không theo học kỳ), và ca nhóm "Chưa gán học kỳ" đòi `rankOf` trả `-1` cho dòng chưa có kỳ.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/session-list.ts apps/web/src/lib/session-list.test.ts apps/web/src/lib/session-list-url.ts apps/web/src/lib/session-list-url.test.ts apps/web/src/lib/session-list.fixtures.ts
git commit -m "feat(web): danh sách phiên chấm lọc học kỳ bằng khoá (year + sem), nhãn lớp gộp, phân biệt lớp trùng nhãn giữa hai kỳ"
```

---

### Task 2: Thanh lọc, danh sách, bảng, hộp thoại, tiêu đề phiên

**Files:**
- Modify: `apps/web/src/app/teacher/grading/_components/session-list/FilterBar.tsx`, `SessionList.tsx`, `SessionTable.tsx`, `BulkDialog.tsx`; `apps/web/src/app/teacher/grading/_components/SessionHeader.tsx`
- Test: `…/session-list/FilterBar.test.tsx`, `SessionList.test.tsx`, `SessionTable.test.tsx`, `BulkDialog.test.tsx`; `apps/web/src/app/teacher/grading/page.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`ListFilters.semester`, `FACET_KEYS`, `groupRows`, fixtures `SEMESTERS`/`SEM_HK1_2026`/`SEM_HK2_2025`/`IN_HK2_2025`); G1 `SemesterYearFilter`, `selectYear`, `selectSemester`, `reconcileSelection`, `SemesterRef`, `useSemesters`; G3c `SessionOverviewItem.classLabel`.
- Produces: `FilterBarProps.semesters: readonly SemesterRef[]` (bắt buộc).

- [ ] **Step 1: Sửa test (đỏ)**

**1a. `FilterBar.test.tsx`:**

- Import: đổi dòng `import { NOW, rowsOf, session } from '@/lib/session-list.fixtures';` thành `import { NOW, SEMESTERS, SEM_HK1_2026, SEM_HK2_2025, rowsOf, session } from '@/lib/session-list.fixtures';`.
- Trong `rows`: `className: 'DHKTPM18ATT'` → `classLabel: 'DHKTPM18ATT'`, `className: 'DHKTPM19BTT'` → `classLabel: 'DHKTPM19BTT'`.
- Trong `setup`: thêm dòng `semesters={SEMESTERS}` ngay trên `noRubricCount={1}` (trước `{...over}` để `over` ghi đè được).
- Thêm vào `describe('FilterBar', …)`, ngay trước ca `'"Xoá bộ lọc" appears only when something is filtered'`:

```tsx
  it('has no semester dropdown of its own: the shared year → semester pair is the filter', () => {
    setup();
    expect(screen.getByRole('combobox', { name: 'Lọc theo năm học' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Học kỳ/ })).not.toBeInTheDocument();
  });

  it('choosing a year reports it and leaves the term on "all" (a whole year)', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo năm học' }));
    fireEvent.click(screen.getByRole('option', { name: '2025-2026' }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_LIST_FILTERS, semester: { academicYear: 2025, semesterId: null } });
  });

  it('choosing a term carries its year with it; a term nobody has a session in is still offered', () => {
    const onChange = setup(); // không phiên nào ở HK2 2025-2026 trong `rows`
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    fireEvent.click(screen.getByRole('option', { name: 'HK2 2025-2026' }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_LIST_FILTERS, semester: { academicYear: 2025, semesterId: SEM_HK2_2025 } });
  });

  it('Review Focus 1: a semester alone makes "Xoá bộ lọc" appear, and clearing resets it too', () => {
    const onChange = setup({ ...EMPTY_LIST_FILTERS, semester: { academicYear: 2026, semesterId: SEM_HK1_2026 } });
    fireEvent.click(screen.getByRole('button', { name: /Xoá bộ lọc/ }));
    expect(onChange).toHaveBeenCalledWith(EMPTY_LIST_FILTERS);
  });
```

**1b. `SessionList.test.tsx`:**

- Import: đổi thành `import { IN_HK2_2025, SEMESTERS, SEM_HK1_2026, SEM_HK2_2025, session, summary } from '@/lib/session-list.fixtures';`.
- Trong khối `vi.hoisted` thêm trường `semesters: { data: [] as unknown, isLoading: false, isSuccess: true },` (sau `summaries`), và ngay dưới dòng `vi.mock('@/hooks/useGrading', …)` thêm:

```tsx
// Danh sách kỳ của bộ lọc đến từ BẢNG học kỳ qua `useSemesters` — mock ở mức hook, không thì nó gọi useQuery thật và nổ vì không có QueryClientProvider.
vi.mock('@/hooks/useSemesters', () => ({ useSemesters: () => h.semesters }));
```

- Trong `sessions`: đổi `className:` → `classLabel:` ở ba dòng, và thêm `...IN_HK2_2025,` vào phiên `b` (đặt trước `rubricId: null`):

```tsx
const sessions = [
  session({ id: 'a', name: 'Kiểm tra giữa kỳ', classId: 'c1', classLabel: 'DHKTPM18ATT' }),
  session({ id: 'b', name: 'Thực hành đồ thị', classId: 'c2', classLabel: 'DHKTPM19BTT', ...IN_HK2_2025, rubricId: null, examType: 'TK' }),
  session({ id: 'c', name: 'Kiểm tra cuối kỳ', classId: 'c1', classLabel: 'DHKTPM18ATT', examType: 'CK' }),
  session({ id: 'none', name: 'Chưa thu bài', fullySubmittedCount: 0, partialCount: 0 }),
];
```

- Trong `beforeEach` thêm `h.semesters = { data: SEMESTERS, isLoading: false, isSuccess: true };` (sau `sessionStorage.clear();`).
- Thêm vào cuối `describe('SessionList', …)` (trước dòng `});` đóng của nó, sau ca `selection: only rows that are still visible …`):

```tsx
  it('T-FLT-2: reads the semester from the URL and filters by KEY', () => {
    search = `year=2025&sem=${SEM_HK2_2025}`;
    renderList();
    expect(names().map((l) => l.textContent)).toEqual(['Thực hành đồ thị']);
  });

  it('choosing a semester writes year and key to the URL, after the filters already there', () => {
    search = 'status=attention';
    renderList();
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    fireEvent.click(screen.getByRole('option', { name: 'HK1 2026-2027' }));
    expect(replace).toHaveBeenCalledWith(`/teacher/grading?status=attention&year=2026&sem=${SEM_HK1_2026}`, { scroll: false });
  });

  it('Review Focus 6: changing the status tab keeps the semester in the URL', () => {
    search = `year=2025&sem=${SEM_HK2_2025}`;
    renderList();
    fireEvent.click(screen.getByRole('button', { name: /Chưa chấm/ }));
    expect(replace).toHaveBeenCalledWith(`/teacher/grading?status=todo&year=2025&sem=${SEM_HK2_2025}`, { scroll: false });
  });

  it('Review Focus 2: an old URL that named the semester as text still shows the whole list', () => {
    search = 'sem=HK1+2026-2027&sem=HK2+2025-2026&year=abc';
    renderList();
    expect(names()).toHaveLength(3);
  });

  it('Review Focus 3: a semester that no longer exists falls back to "all" once the semesters have loaded', () => {
    search = 'sem=33333333-3333-4333-8333-333333333333';
    renderList();
    expect(names()).toHaveLength(3);
  });

  it('Review Focus 3: while the semesters are still loading nothing is cleaned up — the key filters at once', () => {
    h.semesters = { data: undefined, isLoading: true, isSuccess: false };
    search = `sem=${SEM_HK2_2025}`;
    renderList();
    expect(names().map((l) => l.textContent)).toEqual(['Thực hành đồ thị']);
  });

  it('Review Focus 1: a semester that leaves nothing shows the way out, and the way out clears the semester too', () => {
    search = `sem=${SEM_HK2_2025}&status=done`; // kỳ cũ chỉ có phiên "b" (chưa chấm) → không còn gì ở "Đã chốt"
    renderList();
    expect(screen.getByText(/Không có phiên nào khớp/)).toBeInTheDocument();
    const clear = screen.getAllByRole('button', { name: /Xoá bộ lọc/ });
    fireEvent.click(clear[clear.length - 1]); // nút ở trạng thái rỗng, không phải nút trên thanh lọc
    expect(replace).toHaveBeenCalledWith('/teacher/grading', { scroll: false });
  });

  it('grouping by semester: a header per semester, newest first', () => {
    search = 'group=semester';
    renderList();
    const headers = screen.getAllByRole('button', { name: /^HK\d 20/ });
    expect(headers[0]).toHaveTextContent('HK1 2026-2027');
    expect(headers[1]).toHaveTextContent('HK2 2025-2026');
  });
```

**1c. `SessionTable.test.tsx`:** đổi dòng import fixture thành `import { IN_HK2_2025, NOW, rowsOf, session, summary } from '@/lib/session-list.fixtures';`; ở khối `rows` đổi `className: 'DHKTPM18ATT'` → `classLabel: 'DHKTPM18ATT'` và `className: 'DHKTPM19BTT'` → `classLabel: 'DHKTPM19BTT'`; thêm ca sau ca `'grouped: a header per group, …'`:

```tsx
  it('Review Focus 4: two classes with the same label are told apart in their group headers', () => {
    const twins = rowsOf(
      [
        session({ id: 'x', classId: 'k1', classLabel: 'DHKTPM18A – Nhóm 1' }),
        session({ id: 'y', classId: 'k2', classLabel: 'DHKTPM18A – Nhóm 1', ...IN_HK2_2025 }),
      ],
      [],
    );
    render(<SessionTable {...props({ groups: groupRows(twins, 'class') })} />);
    expect(screen.getByRole('button', { name: /DHKTPM18A – Nhóm 1 · HK1 2026-2027/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /DHKTPM18A – Nhóm 1 · HK2 2025-2026/ })).toBeInTheDocument();
  });
```

**1d. `BulkDialog.test.tsx`:** đổi mọi `className: 'L1'|'L2'|'L3'|'LỚP-A'|'LỚP-B'` thành `classLabel: …` (năm chỗ: dòng ~18–20 và ~140–141) bằng script an toàn kết thúc dòng:

```bash
python3 - <<'PY'
import re, pathlib
p = pathlib.Path('apps/web/src/app/teacher/grading/_components/session-list/BulkDialog.test.tsx')
s = p.read_bytes().decode('utf-8')
s, n = re.subn(r"\bclassName: '", "classLabel: '", s)
assert n == 5, n
p.write_bytes(s.encode('utf-8'))
print('ok', n)
PY
```

**1e. `apps/web/src/app/teacher/grading/page.test.tsx`:**

- Ngay dưới dòng `vi.mock('@/hooks/useOnlineStatus', …)` thêm:

```tsx
// Danh sách phiên (SessionList) lấy danh sách học kỳ qua `useSemesters`; ở đây không quan tâm tới kỳ, chỉ cần nó không gọi useQuery thật.
vi.mock('@/hooks/useSemesters', () => ({ useSemesters: () => ({ data: [], isLoading: false, isSuccess: true }) }));
```

- Trong hàm `session` cục bộ: đổi `className: 'N01'` thành `classLabel: 'N01'` và `semesterName: 'HK1',` thành `semesterName: 'HK1', semesterId: 'sem-1', academicYear: 2026, term: 1,`; trong `beforeEach` của `describe('/teacher/grading — without a session: the picker'` đổi `className: 'N02'` thành `classLabel: 'N02'`.

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/app/teacher/grading`
Expected: FAIL — `FilterBar` chưa nhận `semesters` và còn vẽ menu "Học kỳ" theo facet; `SessionList` chưa gọi `useSemesters`/`reconcileSelection`; bảng, hộp thoại và tiêu đề còn đọc `className`.

- [ ] **Step 3: Sửa `FilterBar.tsx`**

1. Imports: thêm `import { SemesterYearFilter } from '@/components/layout/semester-year-filter';` và `import { selectSemester, selectYear, type SemesterRef } from '@/lib/semester-filter';`; đổi dòng import `@/lib/session-list` thành `import { EMPTY_LIST_FILTERS, FACET_KEYS, hasActiveFilters, type FacetKey, type FacetOption, type ListFilters } from '@/lib/session-list';`.
2. `FACET_LABEL`: thay bằng `const FACET_LABEL: Record<FacetKey, string> = { classIds: 'Lớp', examTypes: 'Loại kỳ thi', rooms: 'Phòng' };`.
3. `FilterBarProps`: thêm (trên `filters`) `/** Từ bảng học kỳ (`useSemesters`), KHÔNG từ các phiên đã tải: kỳ chưa có phiên nào vẫn chọn được. */ semesters: readonly SemesterRef[];`.
4. Chữ ký hàm: `export function FilterBar({ filters, semesters, options, noRubricCount, onChange, searchRef }: FilterBarProps) {`.
5. Trong JSX, thay khối `{(['semesters', 'classIds', 'examTypes', 'rooms'] as FacetKey[]).map((facet) => ( … ))}` bằng:

```tsx
        {/* Cặp ô Năm học → Học kỳ DÙNG CHUNG (spec §7.2). Menu không còn số phiên theo từng kỳ — số đếm còn ở Lớp/Loại kỳ thi/Phòng và ở tab trạng thái, và đều theo kỳ đang chọn. */}
        <SemesterYearFilter
          semesters={semesters}
          selection={filters.semester}
          onYearChange={(year) => set({ semester: selectYear(filters.semester, year, semesters) })}
          onSemesterChange={(id) => set({ semester: selectSemester(id, filters.semester, semesters) })}
        />

        {FACET_KEYS.map((facet) => (
          <FacetFilter key={facet} facet={facet} options={options[facet]} selected={filters[facet]} onChange={(next) => onChange({ ...filters, [facet]: next } as ListFilters)} />
        ))}
```

- [ ] **Step 4: Sửa `SessionList.tsx`**

1. Imports: thêm `import { useSemesters } from '@/hooks/useSemesters';`, `import { reconcileSelection } from '@/lib/semester-filter';` và `type ListFilters,` vào danh sách import từ `@/lib/session-list` (giữ thứ tự chữ cái: ngay sau `groupRows,`… — đặt `type ListFilters,` cạnh `type SortKey,`).
2. Thay dòng `const { filters, view, setFilters, setView } = useSessionListState();` bằng:

```tsx
  const { filters: listed, view, setFilters, setView } = useSessionListState();
  // Lựa chọn học kỳ lấy từ BẢNG học kỳ (không từ các phiên đã tải): kỳ chưa có phiên nào vẫn chọn được. `reconcileSelection` là phép DẪN XUẤT, không
  // phải effect ghi ngược: một học kỳ trong URL mà admin đã xoá (hay dán từ môi trường khác) tự về "Tất cả" thay vì cho ra danh sách rỗng khó hiểu.
  // Chỉ dọn khi danh sách ĐÃ tải — rỗng vì chưa tải không phải bằng chứng kỳ đã xoá, nên trong lúc chờ, khoá trên URL vẫn lọc ngay.
  const semesterQuery = useSemesters();
  const semesterList = useMemo(() => semesterQuery.data ?? [], [semesterQuery.data]);
  const filters = useMemo<ListFilters>(() => {
    if (!semesterQuery.isSuccess) return listed;
    const semester = reconcileSelection(listed.semester, semesterList);
    return semester === listed.semester ? listed : { ...listed, semester };
  }, [listed, semesterList, semesterQuery.isSuccess]);
```

3. Trong JSX thêm `semesters={semesterList}` vào `FilterBar`: `<FilterBar filters={filters} semesters={semesterList} options={options} noRubricCount={noRubricCount} onChange={setFilters} searchRef={searchRef} />`.

- [ ] **Step 5: Đổi `className` → `classLabel` ở bảng, hộp thoại, tiêu đề**

- `SessionTable.tsx`: ba chỗ — `const actionLabel = \`${action.label}: ${s.name}${s.classLabel ? \`, ${s.classLabel}\` : ''}\`;`, `aria-label={\`Chọn phiên ${s.name}${s.classLabel ? \`, ${s.classLabel}\` : ''}\`}`, và `{[s.classLabel, s.roomName].filter(Boolean).join(' · ')}`.
- `BulkDialog.tsx`: `return s ? [s.classLabel, s.roomName, formatSessionDate(s.startTime).date].filter(Boolean).join(' · ') : '';` và `{r.session.classLabel} · {submittedCount(r.session)} bài`.
- `SessionHeader.tsx`: `{[session.classLabel, session.roomName].filter(Boolean).join(' · ')}`.

- [ ] **Step 6: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/app/teacher/grading src/lib/session-list.test.ts src/lib/session-list-url.test.ts`
Expected: PASS (gồm `useSessionListState.test.tsx`, `PreparePanel.test.tsx`, `finalize/page.test.tsx`, `[resultId]/page.test.tsx` — không đổi). Ca dễ trượt: "Review Focus 3 (đang tải)" đòi điều kiện `semesterQuery.isSuccess` (nếu bỏ điều kiện, danh sách rỗng bị coi là "kỳ đã xoá" và kỳ cũ bị xoá khỏi lọc); và ca "Review Focus 6" đòi `FilterBar`/`StatusTabs` dựng bản lọc mới từ `filters` **đã dẫn xuất** (`setFilters({ ...filters, status })`), không từ `listed`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/teacher/grading
git commit -m "feat(web): Chấm điểm lọc học kỳ bằng cặp ô Năm học → Học kỳ dùng chung (kỳ chưa có phiên vẫn chọn được), nhãn lớp gộp ở bảng/hộp thoại/tiêu đề"
```

---

### Task 3: Gỡ bộ lọc học kỳ theo chuỗi, T-FLT-1, chạy cả bộ

**Files:**
- Delete: `apps/web/src/hooks/useSemesterFilter.ts`, `apps/web/src/components/layout/semester-filter.tsx`
- Create: `apps/web/src/lib/no-string-semester-filter.test.ts`
- Modify: `docs/superpowers/plans/md-restore-web-tsc-red.txt`

- [ ] **Step 1: Viết test chốt T-FLT-1 (đỏ)**

Trước hết xác nhận không còn người dùng nào ngoài chính hai file (G3b, G3c đã chuyển hết):

```powershell
cd apps/web
Get-ChildItem src -Recurse -Include *.ts,*.tsx | Select-String -Pattern "useSemesterFilter|layout/semester-filter'|semesterOptions" | Where-Object { $_.Path -notmatch 'useSemesterFilter\.ts$|layout\\semester-filter\.tsx$' }
```

Expected: **không có dòng nào** (nếu còn: người dùng đó là một chỗ plan G3b/G3c bỏ sót — chuyển nó sang `useSemesterYearFilter`/`SemesterYearFilter` trước khi xoá, theo mẫu của trang Kỳ thi).

Create `apps/web/src/lib/no-string-semester-filter.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** `src/`, tính từ vị trí của chính file này — không phụ thuộc thư mục chạy vitest. */
const SRC = fileURLToPath(new URL('../', import.meta.url));

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
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/lib/no-string-semester-filter.test.ts`
Expected: FAIL với đúng một mục — `hooks/useSemesterFilter.ts — semesterOptions (danh sách kỳ dựng từ các dòng đã tải)` (file hook còn định nghĩa `semesterOptions(`). `components/layout/semester-filter.tsx` không tự nhập ai nên không bị bắt ở đây: test này canh **người nhập** bản cũ, còn bản thân hai file bị xoá ở bước sau.

- [ ] **Step 3: Xoá hai file**

```bash
git rm apps/web/src/hooks/useSemesterFilter.ts apps/web/src/components/layout/semester-filter.tsx
```

- [ ] **Step 4: Chạy cả bộ, kiểm lại phần còn sót, cập nhật danh sách `tsc` đỏ**

```powershell
cd apps/web
npx vitest run
npx eslint src/lib/session-list.ts src/lib/session-list-url.ts src/lib/session-list.fixtures.ts src/lib/no-string-semester-filter.test.ts src/app/teacher/grading
Get-ChildItem src/app/teacher/grading, src/lib -Recurse -Include *.ts,*.tsx | Select-String -CaseSensitive -Pattern '\.className\b|className: ?(''|null)|filters\.semesters|semesters: string\[\]' | Where-Object { $_.Line -notmatch 'Attendance|attendance|homeClassName|\.className\)|\.className\}' } | Select-Object -First 10
pnpm exec tsc --noEmit 2>&1 | Select-String -Pattern '^src/' | ForEach-Object { ($_ -split '\(')[0] } | Sort-Object -Unique | Out-File -Encoding utf8 C:/tmp/tsc-red-after-g3d.txt
Compare-Object (Get-Content ../../docs/superpowers/plans/md-restore-web-tsc-red.txt) (Get-Content C:/tmp/tsc-red-after-g3d.txt)
```

Expected: vitest xanh (cả test T-FLT-1); ESLint sạch; lệnh `Select-String` thứ hai **không còn dòng** (không còn `className` của kiểu tổng quan hay `semesters: string[]` của `ListFilters` ở vùng chấm điểm và `lib/`; hai chỗ `s.className`/`p.className` của thanh tiến độ là thuộc tính của đối tượng khác, đã loại bằng bộ lọc); `Compare-Object` chỉ có dòng `<=` (các file của plan này khỏi danh sách), không có `=>`. Danh sách còn lại phải chỉ gồm file của plan G4 (`lib/api/exam-session.ts` ở `createExamSession`/`ExamSessionResponse`, `app/teacher/exam-sessions/new/*`, và các test của chúng).

- [ ] **Step 5: Cập nhật danh sách và commit**

```powershell
Copy-Item C:/tmp/tsc-red-after-g3d.txt ../../docs/superpowers/plans/md-restore-web-tsc-red.txt -Force
```

```bash
git add apps/web/src/lib/no-string-semester-filter.test.ts docs/superpowers/plans/md-restore-web-tsc-red.txt
git commit -m "refactor(web): gỡ bộ lọc học kỳ theo chuỗi (useSemesterFilter, semester-filter) và chốt T-FLT-1 bằng test"
```

---

## Tự kiểm lại plan so với spec

- §7.1 ("ba bản cài đặt riêng… `lib/session-list.ts` (chấm điểm)"): bản thứ ba được gom — `lib/session-list.ts` lọc bằng `matchesSemester` trên khoá, `FilterBar` dùng `SemesterYearFilter`; sau G3b (`semester-filter.tsx` ở trang Kỳ thi), G3c (`FilterRail.tsx`) và plan này, cả ba bản cũ đã hết, và `semester-filter.tsx` cùng `useSemesterFilter` bị xoá (Task 3). §7.2: "Giảng viên: Chấm điểm = Năm học + học kỳ cùng các bộ lọc có sẵn (lớp, phòng, loại kỳ thi)" — Task 2; lựa chọn từ `GET /semesters` (`useSemesters`); lọc bằng khoá (Task 1); mặc định "Tất cả" (`EMPTY_LIST_FILTERS.semester`). §4: dòng `GET /submissions/overview` thêm `semesterId/academicYear/term` và `classLabel` — kiểu đã đổi ở G3c, plan này dùng chúng.
- §11: **T-FLT-1** (lọc theo năm học, theo học kỳ; đổi năm thì ô kỳ về "tất cả") — logic `selectYear`/`selectSemester` thuộc G1, ở đây là các ca `matchesFilters` (năm cả kỳ / một kỳ), ca FilterBar chọn năm/chọn kỳ, và test chốt không còn bản lọc theo chuỗi (Task 3). **T-FLT-2** (học kỳ chưa có phiên nào vẫn xuất hiện trong danh sách lọc) — ca FilterBar "chọn một kỳ không phiên nào vẫn được đề nghị" (Task 2) và các ca `matchesFilters` lọc bằng khoá (Task 1). T-FLT-3 (e2e: tạo phiên cho lớp kỳ đã kết thúc) thuộc plan D3/F.
- §7.3 (bộ lọc không bao giờ chặn thao tác): bộ lọc chỉ hẹp tầm nhìn; trạng thái rỗng có nút thoát xoá mọi bộ lọc kể cả kỳ (Review Focus 1, có test).
- §2.5 (mười một file đọc tên lớp): phần chấm điểm — `session-list.ts`, `SessionTable`, `BulkDialog`, `SessionHeader` đổi sang `classLabel` (Task 1, 2).
- Quyết định/hệ quả nêu để user duyệt: (a) **menu học kỳ không còn số đếm theo từng kỳ** — cặp ô dùng chung không có; số đếm của tab trạng thái và của Lớp/Loại kỳ thi/Phòng vẫn theo kỳ đang chọn; (b) **"Xoá bộ lọc" ở trang Chấm điểm xoá cả học kỳ** (khác trang Kỳ thi/Bài thu), vì học kỳ ở đây từ trước đã là một bộ lọc thường và nút ở trạng thái rỗng phải là đường thoát; (c) **URL đổi** `sem=<tên kỳ>` → `year`+`sem=<uuid>`; URL cũ (đã dán/đánh dấu) về "Tất cả" chứ không lỗi; (d) **nhãn lớp trùng giữa hai kỳ được gắn học kỳ** chỉ khi trùng, ở menu Lớp và tiêu đề nhóm — trang Kỳ thi dùng `labelWithSemester` của server (G3b), trang bài thu (G3c) hiện chỉ có `classLabel` nên có thể trùng nhãn giữa hai kỳ trong tiêu đề nhóm; nếu muốn đồng nhất, cùng quy tắc `tellApart` có thể đưa vào `submission-attention.ts` (không làm ở plan này); (e) **nhóm theo học kỳ sắp theo (năm, kỳ)** thay vì ngày thi mới nhất.
- Không làm ở plan này: form tạo/sửa phiên, nút Sửa/Huỷ (G4); các màn bên trong một phiên (`[resultId]`, `finalize`, PreparePanel/RunningPanel — không đọc tên lớp, không có lọc kỳ); spec cũ của danh sách chấm (`2026-09-29-grading-session-list-design.md`) nhắc tới facet học kỳ nhiều lựa chọn — không sửa, plan này là nguồn mới cho phần đó.
