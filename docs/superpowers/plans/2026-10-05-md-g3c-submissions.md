# Plan G3c — "Quản lý bài thu": nhãn lớp và bộ lọc Năm học → Học kỳ theo khoá

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang `/teacher/submissions` theo hợp đồng mới của `GET /submissions/overview` (plan D3): lớp hiện/gom/lọc bằng **nhãn gộp** (`classLabel`), học kỳ lọc bằng **khoá** (`semesterId`/`academicYear` trên từng dòng) qua bộ lọc Năm học → Học kỳ dùng chung, thay cho ô học kỳ theo chuỗi dựng từ các dòng đã tải.

**Architecture:** Trang này lọc **trong trình duyệt** (cả danh sách phiên được tải một lần) nên khác trang Kỳ thi: `FilterState.semesterName: string | null` đổi thành `semester: SemesterSelection` (G1), `passesGroups` dùng `matchesSemester`, và `buildFacets` **bỏ** nhóm `semesters` (lựa chọn đến từ bảng học kỳ, không từ các dòng). Trạng thái lọc vẫn nằm ở `useState` của trang (như hiện nay) và `FilterRail` dùng các hàm thuần `selectYear`/`selectSemester` của G1; một lựa chọn trỏ vào học kỳ vừa bị xoá được `reconcileSelection` dọn ở bước dẫn xuất. Tên lớp: `SessionOverviewItem.className` → `classLabel`, `SessionGroup.className` → `classLabel`.

**Tech Stack:** Next.js 15, React 19, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §4 (`GET /submissions/overview`: dòng thêm `semesterId/academicYear/term`, `classLabel`), §7.1 (`FilterRail.tsx` là một trong ba bản lọc theo chuỗi cần gom), §7.2 (Bài thu = Năm học + học kỳ cùng các bộ lọc có sẵn; trang đã tải sẵn lọc trong trình duyệt theo `semesterId`/`academicYear` trên từng dòng; mặc định "Tất cả"), §11: T-FLT-1, T-FLT-2.

**Phụ thuộc:** plan G1 (`SemesterYearFilter`, `lib/semester-filter.ts`, `useSemesters`), plan G3b (không phụ thuộc trực tiếp; cùng mẫu); API plan D3.

## Global Constraints

- **Hợp đồng (D3):** `SessionOverviewItem` thêm `semesterId: string | null`, `academicYear: number | null`, `term: number | null`; **đổi** `className: string | null` → `classLabel: string | null`; **giữ** `semesterName` (bản chụp, bảng điểm). Các phản hồi nhúng tên lớp khác (`AttendanceView.className`, `homeClassName`) **giữ tên trường** — giá trị là nhãn nhưng hình dạng không đổi — nên **không** động tới `lib/api/attendance.ts` hay các fixture điểm danh (`submission-rows.test.ts`, `[sessionId]/page.test.tsx`).
- **Lọc bằng khoá, trong trình duyệt:** `applyFilters` khớp `matchesSemester(f.semester, item)` — dòng chưa có học kỳ (lớp cũ) **không khớp** khi đang lọc và khớp khi không lọc. `buildFacets` **không còn** trả `semesters`.
- **Mặc định "Tất cả"**; khi mở trang `filters.semester = ALL_SEMESTERS`. "Xoá tất cả bộ lọc" **giữ** học kỳ (hành vi hiện có: học kỳ là phạm vi đang xem, không tính vào `hasActive`).
- **Ô lọc học kỳ luôn hiện** (kể cả khi giảng viên mới có một kỳ): cùng lý do cũ — là chỗ duy nhất nói ra rằng trang đang hẹp về một kỳ. Lựa chọn lấy từ `useSemesters()`, KHÔNG từ các dòng.
- **Lựa chọn mồ côi** (học kỳ bị admin xoá) về "Tất cả" ở bước dẫn xuất (`reconcileSelection`), chỉ khi danh sách học kỳ ĐÃ tải xong.
- **Nhóm theo lớp vẫn khoá bằng `classId`** (hai lớp trùng nhãn vẫn là hai nhóm); chỉ NHÃN hiển thị đổi nguồn.
- `SemesterYearFilter` thêm prop tuỳ chọn `stacked` (xếp dọc, ô rộng hết bề ngang) cho cột lọc 205px — thay đổi nhỏ, có test, mặc định giữ nguyên hành vi của G1.
- `hooks/useSemesterFilter.ts` và `components/layout/semester-filter.tsx` còn người dùng (trang Chấm điểm, G3d) — **chưa xoá**.
- `apps/web` còn `tsc` đỏ chỉ ở file của G3d, G4 sau plan này.

## Review Focus

1. **Còn một chỗ lọc theo `semesterName`** (chuỗi) — hai tên cùng một kỳ vẫn là hai mục. → `grep semesterName` ở vùng bài thu chỉ còn là trường hiển thị của item; test lọc bằng khoá (Task 1).
2. **Dòng chưa có học kỳ nổ hoặc lọt qua bộ lọc.** → ca `semesterId: null` (Task 1).
3. **Hai lớp trùng nhãn bị trộn nhóm** khi đổi tên → khoá. → test hiện có đổi tên trường nhưng vẫn khẳng định theo `classId` (Task 1).
4. **Ô học kỳ chỉ liệt kê kỳ có phiên trong danh sách đang tải.** → test: kỳ không có dòng nào vẫn chọn được (Task 2).
5. **Bộ lọc kỳ trỏ vào học kỳ đã xoá cho ra danh sách rỗng khó hiểu.** → test `reconcileSelection` ở trang (Task 2).
6. **Xoá bộ lọc làm mất phạm vi kỳ đang xem.** → test link xoá giữ `semester` (Task 2).
7. **Cột lọc 205px bị tràn bởi hai ô cạnh nhau.** → `stacked` (Task 2).

---

## File Structure

| File | Việc |
|---|---|
| `apps/web/src/lib/api/submissions.ts` | `SessionOverviewItem`: `classLabel`, `semesterId/academicYear/term`. |
| `apps/web/src/lib/submission-attention.ts` (+ test) | `SessionGroup.classLabel`. |
| `apps/web/src/lib/submission-filters.ts` (+ test) | `FilterState.semester`; bỏ facet `semesters`; nhãn lớp. |
| `apps/web/src/components/layout/semester-year-filter.tsx` (+ test) | Prop `stacked`. |
| `apps/web/src/app/teacher/submissions/_components/FilterRail.tsx` (+ test) | Dùng `SemesterYearFilter`. |
| `apps/web/src/app/teacher/submissions/_components/SessionTable.tsx` (+ test) | `group.classLabel`. |
| `apps/web/src/app/teacher/submissions/page.tsx` (+ test) | `useSemesters`, `reconcileSelection`, `classLabel`. |

---

### Task 1: Kiểu, gom nhóm và lọc (hàm thuần)

**Files:**
- Modify: `apps/web/src/lib/api/submissions.ts`, `apps/web/src/lib/submission-attention.ts`, `apps/web/src/lib/submission-filters.ts`
- Test: `apps/web/src/lib/submission-attention.test.ts`, `apps/web/src/lib/submission-filters.test.ts`

**Interfaces:**
- Consumes: `SemesterSelection`, `ALL_SEMESTERS`, `matchesSemester` (G1 `lib/semester-filter.ts`).
- Produces:

```ts
// SessionOverviewItem: classLabel: string | null; semesterId: string | null; academicYear: number | null; term: number | null  (bỏ className)
// SessionGroup: classLabel: string | null  (bỏ className)
// FilterState: semester: SemesterSelection  (bỏ semesterName)
// buildFacets(...) trả: { kinds, examTypes, rooms, classes, archivedCount, closedCount }   // KHÔNG còn `semesters`
```

- [ ] **Step 1: Đổi tên và thêm trường trong test (đỏ)**

Chạy đoạn script sau từ gốc repo để đổi **đúng các fixture của kiểu tổng quan** (bảo toàn kết thúc dòng và UTF-8):

```bash
python3 - <<'PY'
import re, pathlib
root = pathlib.Path('apps/web/src')

def edit(path, *subs):
    p = root / path
    s = p.read_bytes().decode('utf-8')
    for pattern, repl in subs:
        s, n = re.subn(pattern, repl, s)
        assert n > 0, (path, pattern)
    p.write_bytes(s.encode('utf-8'))
    print('ok', path)

SEMESTER_KEYS = (r"([ \t]*)(semesterName: 'Học kỳ 1 2026-2027',)", r"\1\2\1semesterId: 'sem-1', academicYear: 2026, term: 1,")

# `.ts` thuần: mọi `className` ở đây là trường của SessionOverviewItem/SessionGroup, không có JSX.
edit('lib/submission-attention.test.ts', (r'\bclassName\b', 'classLabel'), SEMESTER_KEYS)
edit('lib/submission-filters.test.ts', (r'\bclassName\b', 'classLabel'), SEMESTER_KEYS)

# `.tsx`: chỉ đổi thuộc tính đối tượng `className: '…'`/`className: null`, không đụng JSX `className=`.
edit('app/teacher/submissions/_components/SessionTable.test.tsx', (r"\bclassName: ('|null)", r'classLabel: \1'), SEMESTER_KEYS)
edit('app/teacher/submissions/page.test.tsx', (r"\bclassName: ('|null)", r'classLabel: \1'), SEMESTER_KEYS)
PY
```

Rồi thêm vào cuối `apps/web/src/lib/submission-filters.test.ts` (đổi dòng import đầu thành `import { EMPTY_FILTERS, applyFilters, buildFacets, detectRoomFailure } from './submission-filters';` nếu chưa có, và thêm `import { ALL_SEMESTERS } from './semester-filter';`):

```ts
describe('lọc theo HỌC KỲ — bằng khoá, không bằng chuỗi (Review Focus 1, 2)', () => {
  // Hai phiên CÙNG học kỳ nhưng bản chụp tên viết khác nhau (gõ tay thời trước): bộ lọc theo chuỗi coi là hai mục, bộ lọc theo khoá thì không.
  const bySemester = [
    make({ id: 'a', semesterId: 'sem-1', academicYear: 2026, term: 1, semesterName: 'HK1 2026-2027' }),
    make({ id: 'b', semesterId: 'sem-1', academicYear: 2026, term: 1, semesterName: 'Học kỳ 1 2026-2027' }),
    make({ id: 'c', semesterId: 'sem-2', academicYear: 2026, term: 2, semesterName: 'HK2 2026-2027' }),
    make({ id: 'd', semesterId: 'old', academicYear: 2025, term: 2, semesterName: 'HK2 2025-2026' }),
    make({ id: 'legacy', semesterId: null, academicYear: null, term: null, semesterName: 'Học kỳ lạ' }),
  ];
  const ids = (f: Partial<typeof EMPTY_FILTERS>) =>
    applyFilters(bySemester, { ...EMPTY_FILTERS, ...f }, NOW).map((i) => i.id).sort();

  it('mặc định là TẤT CẢ: mọi phiên, kể cả phiên của lớp chưa có học kỳ', () => {
    expect(EMPTY_FILTERS.semester).toEqual(ALL_SEMESTERS);
    expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'legacy']);
  });

  it('chọn một kỳ: so bằng semesterId — hai cách viết tên của cùng một kỳ đều khớp', () => {
    expect(ids({ semester: { academicYear: 2026, semesterId: 'sem-1' } })).toEqual(['a', 'b']);
  });

  it('chọn một NĂM (không chọn kỳ): cả các kỳ của năm đó', () => {
    expect(ids({ semester: { academicYear: 2026, semesterId: null } })).toEqual(['a', 'b', 'c']);
    expect(ids({ semester: { academicYear: 2025, semesterId: null } })).toEqual(['d']);
  });

  it('Review Focus 2: phiên của lớp chưa có học kỳ KHÔNG khớp khi đang lọc, và không làm nổ', () => {
    expect(ids({ semester: { academicYear: 2026, semesterId: 'sem-1' } })).not.toContain('legacy');
    expect(ids({ semester: { academicYear: 2099, semesterId: null } })).toEqual([]);
  });

  it('giữa các nhóm là AND: kỳ VÀ phòng', () => {
    const mixed = [
      make({ id: 'x', semesterId: 'sem-1', academicYear: 2026, term: 1, roomName: 'A3-01' }),
      make({ id: 'y', semesterId: 'sem-1', academicYear: 2026, term: 1, roomName: 'A3-02' }),
      make({ id: 'z', semesterId: 'sem-2', academicYear: 2026, term: 2, roomName: 'A3-01' }),
    ];
    const result = applyFilters(
      mixed,
      { ...EMPTY_FILTERS, semester: { academicYear: 2026, semesterId: 'sem-1' }, rooms: ['A3-01'] },
      NOW,
    ).map((i) => i.id);
    expect(result).toEqual(['x']);
  });

  it('buildFacets KHÔNG còn nhóm `semesters` — lựa chọn học kỳ đến từ bảng học kỳ, không từ các dòng đã tải', () => {
    expect(buildFacets(bySemester, EMPTY_FILTERS, NOW)).not.toHaveProperty('semesters');
  });
});
```

Trong `describe('lọc theo LỚP')` đã có test "lọc theo ID chứ không theo TÊN" — giữ nguyên (đã đổi tên trường sang `classLabel` ở bước script): nó chính là ca Review Focus 3.

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/lib/submission-filters.test.ts src/lib/submission-attention.test.ts`
Expected: FAIL — `EMPTY_FILTERS.semester` chưa có; `groupByClass` còn trả `className`; `buildFacets` còn trả `semesters`.

- [ ] **Step 3: Sửa kiểu và hàm thuần**

Trong `apps/web/src/lib/api/submissions.ts`, trong `SessionOverviewItem`: thay `className: string | null;` bằng

```ts
  /**
   * Nhãn gộp của lớp, `DHKTPM18A – Nhóm 1` (view `class_label` ở server). Từng là `className`. `null` chỉ với phiên không gắn lớp.
   */
  classLabel: string | null;
```

và thêm ngay trên `semesterName: string;`:

```ts
  /**
   * Học kỳ HIỆN TẠI của lớp — khoá để LỌC (spec §7.2). `null` chỉ với lớp cũ chưa backfill. Khác `semesterName` bên dưới: cái đó là chữ đã
   * CHỤP lúc tạo phiên (bảng điểm in chữ này), không dùng để lọc.
   */
  semesterId: string | null;
  academicYear: number | null;
  term: number | null;
```

Trong `apps/web/src/lib/submission-attention.ts`: trong `SessionGroup` đổi `className: string | null;` thành `classLabel: string | null;` và trong `groupByClass` đổi `className: item.className,` thành `classLabel: item.classLabel,`.

Trong `apps/web/src/lib/submission-filters.ts`:

1. Thêm import `import { ALL_SEMESTERS, matchesSemester, type SemesterSelection } from './semester-filter';`.
2. Trong `FilterState` thay `/** null = tất cả học kỳ. */ semesterName: string | null;` bằng
```ts
  /**
   * Học kỳ/năm học đang xem, so bằng KHOÁ (`semesterId`/`academicYear` trên từng dòng) — không bằng chữ. `ALL_SEMESTERS` = tất cả: mặc định ở mọi màn
   * hình, vì một bộ lọc mặc định đã che mất việc tồn đọng của kỳ cũ.
   */
  semester: SemesterSelection;
```
3. `EMPTY_FILTERS`: `semesterName: null,` → `semester: ALL_SEMESTERS,`.
4. Trong `passesGroups` thay `if (f.semesterName !== null && item.semesterName !== f.semesterName) return false;` bằng
```ts
  // Dòng chưa có học kỳ (lớp cũ chưa backfill) KHÔNG khớp khi đang lọc, và khớp khi không lọc — không bao giờ nổ vì `null`.
  if (!matchesSemester(f.semester, item)) return false;
```
5. Trong `buildFacets`: xoá dòng `const semesters = countBy(items, (i) => i.semesterName, (i) => i.semesterName);` và khối chú thích `// \`semesters\` KHÔNG qua \`meaningful\` …` cùng dòng `semesters,` trong đối tượng trả về; đổi `(i) => i.className ?? 'Không gắn lớp',` thành `(i) => i.classLabel ?? 'Không gắn lớp',`. Thêm một chú thích ngắn tại chỗ đối tượng trả về: "Không còn nhóm `semesters`: lựa chọn học kỳ đến từ bảng học kỳ (`useSemesters`), không từ các dòng đã tải."

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/lib/submission-filters.test.ts src/lib/submission-attention.test.ts`
Expected: PASS. (Các ca `groupByClass` đã đổi sang `classLabel` ở bước script; ca "phiên không gắn lớp" khẳng định `groups[0].classLabel` là `null`.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib
git commit -m "feat(web): bài thu lọc học kỳ bằng khoá (FilterState.semester), nhãn lớp gộp; bỏ facet học kỳ theo chuỗi"
```

---

### Task 2: Cột lọc, bảng, trang

**Files:**
- Modify: `apps/web/src/components/layout/semester-year-filter.tsx`, `apps/web/src/app/teacher/submissions/_components/FilterRail.tsx`, `apps/web/src/app/teacher/submissions/_components/SessionTable.tsx`, `apps/web/src/app/teacher/submissions/page.tsx`
- Test: `apps/web/src/components/layout/semester-year-filter.test.tsx`, `apps/web/src/app/teacher/submissions/_components/FilterRail.test.tsx`, `apps/web/src/app/teacher/submissions/_components/SessionTable.test.tsx`, `apps/web/src/app/teacher/submissions/page.test.tsx`

**Interfaces:**
- Consumes: Task 1; `SemesterYearFilter` (G1), `selectYear`, `selectSemester`, `reconcileSelection` (G1), `useSemesters` (G1).
- Produces: `FilterRail` nhận thêm `semesters: readonly SemesterRef[]`; `SemesterYearFilter` nhận thêm `stacked?: boolean`.

- [ ] **Step 1: Viết test (đỏ)**

**1a. `semester-year-filter.test.tsx`** — thêm vào cuối `describe`:

```tsx
  it('stacked: hai ô xếp dọc và rộng hết bề ngang (cho cột lọc hẹp), mặc định giữ nguyên bố cục ngang', () => {
    const { container, rerender } = render(
      <SemesterYearFilter semesters={SEMESTERS} selection={ALL_SEMESTERS} onYearChange={vi.fn()} onSemesterChange={vi.fn()} />,
    );
    expect(container.firstElementChild).toHaveClass('sm:flex-row');

    rerender(
      <SemesterYearFilter semesters={SEMESTERS} selection={ALL_SEMESTERS} onYearChange={vi.fn()} onSemesterChange={vi.fn()} stacked />,
    );
    expect(container.firstElementChild).not.toHaveClass('sm:flex-row');
    expect(screen.getByRole('combobox', { name: 'Lọc theo năm học' })).toHaveClass('w-full');
    expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toHaveClass('w-full');
  });
```

**1b. `FilterRail.test.tsx`** — các bước sau (đầu file thêm `import { ALL_SEMESTERS } from '@/lib/semester-filter';`):

1. Xoá khối `semesters: [ … ],` khỏi hằng `facets` và thêm ngay dưới `facets`:
```tsx
const SEMESTERS = [
  { id: 'sem-2', academicYearStart: 2026, term: 2, label: 'HK2 2026-2027' },
  { id: 'sem-1', academicYearStart: 2026, term: 1, label: 'HK1 2026-2027' },
  { id: 'sem-0', academicYearStart: 2025, term: 2, label: 'HK2 2025-2026' },
];
```
2. Thêm prop `semesters={SEMESTERS}` cho **mọi** `<FilterRail …/>` trong file: chạy `python3 -c "import pathlib,re;p=pathlib.Path('apps/web/src/app/teacher/submissions/_components/FilterRail.test.tsx');s=p.read_bytes().decode('utf-8');s=re.sub(r'<FilterRail(\s)', r'<FilterRail semesters={SEMESTERS}\1', s);p.write_bytes(s.encode('utf-8'))"`.
3. Thay hai ca `ô chọn học kỳ vẫn hiện khi giảng viên CHỈ dạy một kỳ` và `chọn "Tất cả học kỳ" trả semesterName về null` bằng:

```tsx
  it('Review Focus 4: ô chọn học kỳ LUÔN hiện, kể cả khi bảng học kỳ chỉ có một kỳ — và liệt kê kỳ KHÔNG có phiên nào', () => {
    // Danh sách lấy từ BẢNG học kỳ (`semesters`), không từ `facets`: một kỳ mà giảng viên chưa có phiên nào vẫn phải chọn được.
    render(
      <FilterRail
        semesters={[SEMESTERS[1]]}
        facets={facets}
        filters={EMPTY_FILTERS}
        onChange={onChange}
        attentionTotal={6}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Lọc theo năm học' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    expect(screen.getByRole('option', { name: 'HK1 2026-2027' })).toBeInTheDocument();
  });

  it('chọn một kỳ gọi onChange với semester { academicYear, semesterId } — năm đi theo kỳ', () => {
    render(<FilterRail semesters={SEMESTERS} facets={facets} filters={EMPTY_FILTERS} onChange={onChange} attentionTotal={6} />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    fireEvent.click(screen.getByRole('option', { name: 'HK2 2025-2026' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ semester: { academicYear: 2025, semesterId: 'sem-0' } }),
    );
  });

  it('chọn một năm: cả ba kỳ của năm đó (semesterId null); đổi năm thì kỳ không thuộc năm mới về "tất cả"', () => {
    render(
      <FilterRail
        semesters={SEMESTERS}
        facets={facets}
        filters={{ ...EMPTY_FILTERS, semester: { academicYear: 2026, semesterId: 'sem-2' } }}
        onChange={onChange}
        attentionTotal={6}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo năm học' }));
    fireEvent.click(screen.getByRole('option', { name: '2025-2026' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ semester: { academicYear: 2025, semesterId: null } }),
    );
  });

  it('chọn "Tất cả học kỳ" giữ năm đang chọn và bỏ kỳ', () => {
    render(
      <FilterRail
        semesters={SEMESTERS}
        facets={facets}
        filters={{ ...EMPTY_FILTERS, semester: { academicYear: 2026, semesterId: 'sem-2' } }}
        onChange={onChange}
        attentionTotal={6}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    fireEvent.click(screen.getByRole('option', { name: 'Tất cả học kỳ' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ semester: { academicYear: 2026, semesterId: null } }),
    );
  });

  it('Review Focus 6: "Xoá tất cả bộ lọc" GIỮ học kỳ — học kỳ là phạm vi đang xem, không phải một bộ lọc trong phạm vi đó', () => {
    const semester = { academicYear: 2026, semesterId: 'sem-1' };
    render(
      <FilterRail
        semesters={SEMESTERS}
        facets={facets}
        filters={{ ...EMPTY_FILTERS, semester, rooms: ['A3-01'] }}
        onChange={onChange}
        attentionTotal={5}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Xoá tất cả bộ lọc/ }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, semester });
  });

  it('chỉ chọn học kỳ KHÔNG làm hiện link xoá bộ lọc (không tính vào `hasActive`)', () => {
    render(
      <FilterRail
        semesters={SEMESTERS}
        facets={facets}
        filters={{ ...EMPTY_FILTERS, semester: { academicYear: 2026, semesterId: 'sem-1' } }}
        onChange={onChange}
        attentionTotal={6}
      />,
    );
    expect(screen.queryByRole('button', { name: /Xoá tất cả bộ lọc/ })).not.toBeInTheDocument();
  });
```

(Dùng `ALL_SEMESTERS` ở nơi cần — nếu không còn chỗ dùng thì bỏ import để ESLint không kêu.)

**1c. `page.test.tsx`** — thay khối chú thích + mock `useCurrentSemester` + hằng `CURRENT_SEMESTER` (dòng ~17–40) bằng:

```tsx
// Danh sách học kỳ của bộ lọc đến từ BẢNG học kỳ qua `useSemesters` (không từ các dòng đã tải). Mock ở mức hook, giống `useSessionOverview`
// ngay trên — không mock thì nó gọi useQuery thật và nổ vì không có QueryClientProvider.
const useSemestersMock = vi.fn();

vi.mock('@/hooks/useSemesters', () => ({
  useSemesters: () => useSemestersMock(),
}));

const SEMESTERS = [
  { id: 'sem-2', academicYearStart: 2026, term: 2, label: 'HK2 2026-2027', startDate: '', endDate: '' },
  { id: 'sem-1', academicYearStart: 2026, term: 1, label: 'HK1 2026-2027', startDate: '', endDate: '' },
];
```

Trong `beforeEach` thay khối `useCurrentSemesterMock…` bằng `useSemestersMock.mockReset(); useSemestersMock.mockReturnValue({ data: SEMESTERS, isLoading: false, isSuccess: true });`. Fixture `make()` đã được script ở Step 1 đổi `classLabel` và thêm `semesterId: 'sem-1', academicYear: 2026, term: 1`. Thêm một `describe` mới cuối file:

```tsx
describe('SubmissionsPage — bộ lọc học kỳ theo khoá', () => {
  function twoSemesters() {
    useSessionOverviewMock.mockReturnValue({
      data: [
        make({ id: 'k1', name: 'Phiên kỳ 1', semesterId: 'sem-1', academicYear: 2026, term: 1 }),
        make({ id: 'k2', name: 'Phiên kỳ 2', semesterId: 'sem-2', academicYear: 2026, term: 2, classId: 'class-2', classLabel: 'N02' }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  }

  it('Review Focus 1: mặc định TẤT CẢ — hiện phiên của cả hai kỳ; chọn một kỳ thì phiên kỳ kia rơi ra', () => {
    twoSemesters();
    render(<SubmissionsPage />);
    expect(screen.getByText('Phiên kỳ 1')).toBeInTheDocument();
    expect(screen.getByText('Phiên kỳ 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    fireEvent.click(screen.getByRole('option', { name: 'HK2 2026-2027' }));

    expect(screen.queryByText('Phiên kỳ 1')).not.toBeInTheDocument();
    expect(screen.getByText('Phiên kỳ 2')).toBeInTheDocument();
  });

  it('Review Focus 4: kỳ KHÔNG có phiên nào trong danh sách vẫn chọn được (lựa chọn từ bảng học kỳ)', () => {
    render(<SubmissionsPage />); // chỉ có phiên của sem-1; sem-2 không có dòng nào
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    expect(screen.getByRole('option', { name: 'HK2 2026-2027' })).toBeInTheDocument();
  });

  it('Review Focus 5: học kỳ vừa bị xoá thì lựa chọn tự về "Tất cả" thay vì cho ra danh sách rỗng', () => {
    twoSemesters();
    const view = render(<SubmissionsPage />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    fireEvent.click(screen.getByRole('option', { name: 'HK2 2026-2027' }));
    expect(screen.queryByText('Phiên kỳ 1')).not.toBeInTheDocument();

    useSemestersMock.mockReturnValue({ data: [SEMESTERS[1]], isLoading: false, isSuccess: true }); // sem-2 biến mất
    view.rerender(<SubmissionsPage />);

    expect(screen.getByText('Phiên kỳ 1')).toBeInTheDocument();
    expect(screen.getByText('Phiên kỳ 2')).toBeInTheDocument();
  });

  it('danh sách học kỳ đang tải: KHÔNG dọn lựa chọn (rỗng vì chưa tải không phải bằng chứng kỳ đã xoá)', () => {
    twoSemesters();
    const view = render(<SubmissionsPage />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    fireEvent.click(screen.getByRole('option', { name: 'HK2 2026-2027' }));

    useSemestersMock.mockReturnValue({ data: undefined, isLoading: true, isSuccess: false });
    view.rerender(<SubmissionsPage />);

    expect(screen.queryByText('Phiên kỳ 1')).not.toBeInTheDocument();
  });

  it('nhóm theo lớp hiện NHÃN GỘP', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [make({ classLabel: 'DHKTPM18A – Nhóm 1' })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);
    expect(screen.getByText('DHKTPM18A – Nhóm 1')).toBeInTheDocument();
  });
});
```

**1d. `SessionTable.test.tsx`:** không cần thêm ca (script đã đổi fixture); thêm một ca mới trong `describe('SessionTable — cấu trúc')`:

```tsx
  it('tiêu đề nhóm hiện nhãn lớp gộp, hoặc "Không gắn lớp" khi không có', () => {
    renderTable([make({ id: 'a', classLabel: 'DHKTPM18A – Nhóm 1' }), make({ id: 'b', classId: 'k-none', classLabel: null })]);
    expect(screen.getByText('DHKTPM18A – Nhóm 1')).toBeInTheDocument();
    expect(screen.getByText('Không gắn lớp')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/components/layout/semester-year-filter.test.tsx src/app/teacher/submissions`
Expected: FAIL — `stacked` chưa có; `FilterRail` chưa nhận `semesters` và còn đọc `facets.semesters`; trang và bảng còn đọc `className`.

- [ ] **Step 3: Thêm `stacked` cho `SemesterYearFilter`**

Trong `apps/web/src/components/layout/semester-year-filter.tsx`: thêm vào `SemesterYearFilterProps` `/** Xếp dọc, ô rộng hết bề ngang — cho cột lọc hẹp. Mặc định: hai ô cạnh nhau từ màn hình sm trở lên. */ stacked?: boolean;`, thêm `stacked = false,` vào destructuring, đổi `<div className="flex flex-col gap-2 sm:flex-row">` thành

```tsx
    <div className={stacked ? 'flex flex-col gap-2' : 'flex flex-col gap-2 sm:flex-row'}>
```

và hai `SelectTrigger`: `className={stacked ? 'w-full' : 'sm:w-44'}` (năm) và `className={stacked ? 'w-full' : 'sm:w-52'}` (kỳ).

- [ ] **Step 4: Sửa `FilterRail`**

Trong `apps/web/src/app/teacher/submissions/_components/FilterRail.tsx`:

1. Imports: xoá `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` khỏi dòng import `@/components/ui/select` **chỉ khi** không còn dùng (không còn — xoá cả dòng) và thêm
```tsx
import { SemesterYearFilter } from '@/components/layout/semester-year-filter';
import { selectSemester, selectYear, type SemesterRef } from '@/lib/semester-filter';
```
2. `FilterRailProps`: xoá `semesters: FacetOption[];` khỏi `facets`; thêm prop `semesters: readonly SemesterRef[];` (trên `filters`) với chú thích "Từ bảng học kỳ (`useSemesters`), KHÔNG từ các dòng đã tải".
3. Chữ ký hàm: `export function FilterRail({ semesters, facets, filters, onChange, attentionTotal }: FilterRailProps) {`.
4. Thay toàn bộ khối `{/* Ngưỡng là > 0 … */} {facets.semesters.length > 0 && ( <Section title="Học kỳ"> … </Section> )}` bằng:
```tsx
      {/* LUÔN hiện, không theo luật "một lựa chọn là nhiễu" của `rooms`/`examTypes`: học kỳ là chiều THỜI GIAN mà giảng viên đang đứng trong
          đó, và ô này là chỗ duy nhất nói ra rằng trang đang hẹp về một kỳ (học kỳ cố ý không tính vào `hasActive` bên dưới và nút "Xoá tất
          cả bộ lọc" cố ý giữ nó lại). Lựa chọn lấy từ BẢNG học kỳ, nên một kỳ chưa có phiên nào vẫn chọn được. */}
      <Section title="Học kỳ">
        <SemesterYearFilter
          stacked
          semesters={semesters}
          selection={filters.semester}
          onYearChange={(year) =>
            onChange({ ...filters, semester: selectYear(filters.semester, year, semesters) })
          }
          onSemesterChange={(id) =>
            onChange({ ...filters, semester: selectSemester(id, filters.semester, semesters) })
          }
        />
      </Section>
```
5. Dòng xoá bộ lọc: `onClick={() => onChange({ ...EMPTY_FILTERS, semesterName: filters.semesterName })}` → `onClick={() => onChange({ ...EMPTY_FILTERS, semester: filters.semester })}`.

- [ ] **Step 5: Sửa `SessionTable` và trang**

`SessionTable.tsx`: đổi `{group.className ?? 'Không gắn lớp'}` thành `{group.classLabel ?? 'Không gắn lớp'}`.

`page.tsx`:
1. Imports: thêm `import { useSemesters } from '@/hooks/useSemesters';` và `import { reconcileSelection } from '@/lib/semester-filter';`.
2. Đổi `{item.className ?? 'Không gắn lớp'}` (trong `SearchResultRow`) thành `{item.classLabel ?? 'Không gắn lớp'}`.
3. Ngay sau dòng `const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);` thêm:
```tsx
  // Lựa chọn học kỳ lấy từ BẢNG học kỳ, không từ các dòng đã tải: một kỳ chưa có phiên nào vẫn phải chọn được. `reconcileSelection` là phép dẫn
  // xuất (không phải effect ghi ngược): học kỳ vừa bị admin xoá tự về "Tất cả", và chỉ dọn khi danh sách ĐÃ tải — rỗng vì chưa tải không phải
  // bằng chứng kỳ đã xoá.
  const semesterQuery = useSemesters();
  const semesterList = useMemo(() => semesterQuery.data ?? [], [semesterQuery.data]);
  const effectiveFilters = useMemo<FilterState>(
    () =>
      semesterQuery.isSuccess
        ? { ...filters, semester: reconcileSelection(filters.semester, semesterList) }
        : filters,
    [filters, semesterList, semesterQuery.isSuccess],
  );
```
4. Thay `buildFacets(items, filters, now)` → `buildFacets(items, effectiveFilters, now)` và `applyFilters(items, filters, now)` → `applyFilters(items, effectiveFilters, now)` (và mảng phụ thuộc tương ứng).
5. Trong JSX `FilterRail`: thêm `semesters={semesterList}` và đổi `filters={filters}` thành `filters={effectiveFilters}`.
6. Xoá khối chú thích `// KHÔNG gieo học kỳ mặc định nữa, …` (không còn đúng: bộ lọc nay đến từ bảng học kỳ, mặc định "Tất cả") và thay bằng: "Mặc định 'Tất cả' ở mọi màn hình (spec §7.2): một bộ lọc mặc định đã che mất việc tồn đọng của kỳ cũ."

- [ ] **Step 6: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/components/layout/semester-year-filter.test.tsx src/lib src/app/teacher/submissions`
Expected: PASS (toàn bộ vùng bài thu, gồm `[sessionId]/page.test.tsx` và `submission-rows.test.ts` không đổi — chúng dùng `Attendance.className`, không phải kiểu tổng quan).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/layout apps/web/src/app/teacher/submissions apps/web/src/lib
git commit -m "feat(web): Quản lý bài thu lọc học kỳ bằng khoá qua bộ lọc dùng chung (lựa chọn từ bảng học kỳ), nhãn lớp gộp"
```

---

### Task 3: Chạy cả bộ và cập nhật danh sách `tsc` đỏ

**Files:**
- Modify: `docs/superpowers/plans/md-restore-web-tsc-red.txt`

- [ ] **Step 1: Chạy**

```powershell
cd apps/web
npx vitest run
npx eslint src/lib/api/submissions.ts src/lib/submission-attention.ts src/lib/submission-filters.ts src/components/layout/semester-year-filter.tsx src/app/teacher/submissions
Get-ChildItem src/app/teacher/submissions, src/lib -Recurse -Include *.ts,*.tsx | Where-Object { $_.Name -match 'submission' -or $_.FullName -match 'teacher\\submissions' } | Select-String -Pattern 'semesterName|\.className\b' | Where-Object { $_.Line -notmatch 'Attendance|attendance|homeClassName' } | Select-Object -First 10
pnpm exec tsc --noEmit 2>&1 | Select-String -Pattern '^src/' | ForEach-Object { ($_ -split '\(')[0] } | Sort-Object -Unique | Out-File -Encoding utf8 C:/tmp/tsc-red-after-g3c.txt
Compare-Object (Get-Content ../../docs/superpowers/plans/md-restore-web-tsc-red.txt) (Get-Content C:/tmp/tsc-red-after-g3c.txt)
```

Expected: vitest xanh; ESLint sạch; lệnh `Select-String` chỉ còn các dòng **hiển thị** `semesterName` của item (nếu có) — không còn chỗ nào **lọc** theo nó và không còn `.className` của kiểu tổng quan; `Compare-Object` chỉ có `<=` (file bài thu được sửa khỏi danh sách), không có `=>`.

- [ ] **Step 2: Cập nhật danh sách và commit**

```powershell
Copy-Item C:/tmp/tsc-red-after-g3c.txt ../../docs/superpowers/plans/md-restore-web-tsc-red.txt -Force
```

```bash
git add docs/superpowers/plans/md-restore-web-tsc-red.txt
git commit -m "chore(web): cập nhật danh sách tsc đỏ có chủ ý sau plan G3c"
```

---

## Tự kiểm lại plan so với spec

- §7.1 ("ba bản cài đặt riêng… `FilterRail.tsx` (bài thu)"): bản thứ hai được gom — `FilterRail` dùng `SemesterYearFilter` và các hàm thuần G1 thay cho facet `semesters` dựng từ chuỗi. §7.2: "Giảng viên: Bài thu = Năm học + học kỳ cùng các bộ lọc có sẵn (lớp, phòng, loại kỳ thi)"; "các trang đã tải sẵn tiếp tục lọc trong trình duyệt theo `semesterId`/`academicYear`/`term` trên mỗi dòng" — `matchesSemester` (Task 1); lựa chọn từ `GET /semesters` — `useSemesters` (Task 2); mặc định "Tất cả" (`EMPTY_FILTERS.semester`). §4: dòng `GET /submissions/overview` thêm `semesterId/academicYear/term`, `classLabel` — Task 1.
- §11: T-FLT-1 (không còn bộ lọc học kỳ theo chuỗi ở bài thu — Review Focus 1, kiểm bằng `grep`), T-FLT-2 (lọc bằng khoá: hai cách viết tên cùng một kỳ khớp cùng bộ lọc).
- Quyết định mới nêu để user duyệt: (a) trạng thái bộ lọc **giữ ở `useState` của trang** (như hiện tại) thay vì chuyển sang `useSemesterYearFilter`: trang đã có `FilterState` gom mọi nhóm lọc và `FilterRail` điều khiển nó, chuyển riêng học kỳ ra hook sẽ tách trạng thái làm hai nơi; đổi lại phải gọi hàm thuần và `reconcileSelection` thủ công (hai chỗ, đều có test); (b) `SemesterYearFilter` thêm `stacked` (sửa file của G1); (c) lớp cũ chưa có học kỳ **ẩn** khi đang lọc một kỳ/năm (không có chỗ nào khác để chúng hiện) — chúng chỉ còn thấy ở "Tất cả"; plan H backfill gán học kỳ cho mọi lớp nên tình huống này chỉ tồn tại tới lúc cutover.
- Không làm ở plan này: trang Chấm điểm (G3d), form phiên (G4); không đụng `[sessionId]/page.tsx`, `lib/api/attendance.ts` (tên trường điểm danh giữ nguyên, D2).
- Placeholder scan: không có "TBD"; mọi sửa file nêu khối cũ → mới hoặc script có lệnh chạy. Kiểu nhất quán: `FilterState.semester` (Task 1) khớp `FilterRail` (Task 2) và `page.tsx`; `SemesterRef` (G1) khớp `useSemesters().data` (`Semester` có `id/academicYearStart/term/label`); `SessionGroup.classLabel` khớp `SessionTable`.
