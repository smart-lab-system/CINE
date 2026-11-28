# Giai đoạn 2, PR 1: thẻ dưới 820px cho hai danh sách chấm điểm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ở viewport ≤ 819px, danh sách phiên chấm và danh sách bài của một phiên hiện mỗi hàng thành một thẻ gom đủ thông tin và nút; từ 820px trở lên giữ nguyên bảng.

**Architecture:** Hook `useMediaQuery` chọn vẽ bảng hay thẻ, mỗi lần chỉ MỘT cách có trong DOM. Phần tính chữ và điều kiện của một hàng rút ra thành hàm thuần (`sessionRowView`, `resultRowView`) mà bảng và thẻ cùng đọc, để hai cách vẽ không lệch nhau. Thẻ là component mới cạnh bảng; bảng chỉ đổi nguồn dữ liệu (cùng DOM).

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind (token HSL), Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-27-grading-flow-phase2-design.md` §5.1 (và §2, §3, §8). Branch `feat/ui-p2-s1-cards` (từ `origin/main`, đã có commit của spec).

## Global Constraints

- Chỉ lớp trình bày: không đổi hook dữ liệu, query, API, route, quyền, validation, và không đổi `lib/session-list.ts` / `lib/session-triage.ts` (chỉ đọc chúng).
- Breakpoint thẻ: `(max-width: 819px)`; từ 820px trở lên ảnh bảng KHÔNG đổi (bằng chứng: `compare.cjs`).
- Thẻ không được thiếu thông tin nào mà hàng bảng có; hai cách vẽ dùng chung hàm mô hình hàng (chữ, nhãn `aria-label`, điều kiện hiện nút).
- Vùng bấm ≥ 40px trên thẻ (ô chọn, nút hành động); thẻ bài cao ≤ 130px ở trường hợp thường; 0 khung cuộn ẩn nội dung ở 390px.
- Bài kiểm mẫu chưa nhận xét (`audit`): điểm hệ thống KHÔNG hiện ở thẻ, như ở bảng ("ẩn" + "chờ nhận xét của bạn").
- Chữ theo `docs/ui-refactor/glossary.md`; sentence case; nhãn nút là động từ; không lộ mã nội bộ.
- Thư mục làm việc `apps/web`. Lệnh: `./node_modules/.bin/vitest run <đường dẫn>`, `./node_modules/.bin/eslint <đường dẫn>`, `./node_modules/.bin/tsc --noEmit -p .`. Mốc có sẵn: tsc 5 lỗi (`classes/page.test`, `preflight.test`, `read-workbook.test`), vitest 5 lỗi (`FinalizePanel` 1, `rules/page` 4); khác đi là mới. Ba file test liên quan hiện đạt 52/52 (SessionTable 13, ResultsTable 16, SessionList 23).
- File nguồn hiện có dùng CRLF ở working tree: sửa nhiều dòng bằng `C:/tmp/crlf-edit.cjs` (`edit(file, [[cũ, mới], ...])`, đòi đúng 1 khớp), file mới tạo bằng Write (LF) là được. `MSYS_NO_PATHCONV=1` khi truyền đối số giống đường dẫn.
- Commit bằng danh tính git hiện có (`ThinhVinhPhat`); KHÔNG `Co-Authored-By`, KHÔNG dòng "Generated with Claude Code". `git push` luôn ghi rõ nhánh đích (`git push -u origin feat/ui-p2-s1-cards`); không merge: PR chờ chủ dự án duyệt.
- Trước khi báo xong: gọi `code-reviewer` và chờ VERDICT.

## Review Focus

Năm đầu vào/điều kiện spec ngụ ý mà dễ làm hỏng nhất; mỗi dòng có test ở task sở hữu mã:
1. Hàng chưa biết trạng thái (`status === null`, bảng tóm tắt chưa tải): thẻ phải hiện "-" và liên kết "Mở", không lỗi (Task 3).
2. Tên phiên rất dài, không có dấu cách: thẻ không được tràn ngang trang (Task 3, đo `hOverflow` ở Task 7).
3. Nhóm đã thu gọn: thẻ của nhóm không hiện, ô chọn cả nhóm vẫn chọn đúng các phiên trong nhóm (Task 3).
4. Đổi viewport qua 820px khi đang mở trang: chuyển bảng ↔ thẻ mà vẫn giữ các phiên đã chọn (Task 4).
5. Bài kiểm mẫu chưa nhận xét: thẻ không để lộ điểm hệ thống (Task 6).

---

### Task 1: Hook `useMediaQuery` và bộ giả `matchMedia` cho test

**Files:**
- Create: `apps/web/src/hooks/useMediaQuery.ts`
- Create: `apps/web/src/hooks/useMediaQuery.test.ts`
- Create: `apps/web/src/test-utils/match-media.ts`

**Interfaces:**
- Produces (`useMediaQuery.ts`): `export const NARROW_LIST_QUERY = '(max-width: 819px)'` và `export function useMediaQuery(query: string): boolean`.
- Produces (`test-utils/match-media.ts`, thư mục mới ngoài `lib/` và `hooks/` để cổng tĩnh không coi là đổi logic; KHÔNG import `vitest` hay Testing Library vì `tsc`/build quét file này):
  ```ts
  export interface MatchMediaMock { setMatches(next: boolean): void; listenerCount(): number; restore(): void }
  export function mockMatchMedia(initial: boolean): MatchMediaMock
  ```
  `mockMatchMedia` thay `window.matchMedia` bằng hàm trả đối tượng giống `MediaQueryList` (`matches` hiện tại, `addEventListener`/`removeEventListener` cho `'change'`); `setMatches` đổi giá trị và gọi các listener; `restore` trả lại hàm gốc (stub của `vitest.setup.ts`).

- [ ] **Step 1: Viết test thất bại** `useMediaQuery.test.ts` (dùng `renderHook`, `act` của Testing Library; `afterEach(() => mock.restore())`):
  - `'reports the current match after mount'`: `mockMatchMedia(true)` → `renderHook(() => useMediaQuery(NARROW_LIST_QUERY)).result.current === true`.
  - `'follows later changes'`: `mock.setMatches(false)` trong `act` → `false`; lại `true` → `true`.
  - `'removes its listener on unmount'`: `listenerCount()` là 1 sau mount, 0 sau `unmount()`.
  - `'is false when matchMedia does not exist'`: `delete (window as { matchMedia?: unknown }).matchMedia` rồi render → `false` (khôi phục trong `afterEach`).
  - `'NARROW_LIST_QUERY is the 819px breakpoint'`: `expect(NARROW_LIST_QUERY).toBe('(max-width: 819px)')`.
- [ ] **Step 2: Chạy, thấy thất bại:** `./node_modules/.bin/vitest run src/hooks/useMediaQuery.test.ts` → FAIL (module không tồn tại).
- [ ] **Step 3: Cài `useMediaQuery`.** Trạng thái đầu luôn `false` (khớp SSR); trong `useEffect`: nếu `typeof window.matchMedia !== 'function'` thì giữ `false`; ngược lại lấy `mql = window.matchMedia(query)`, `setMatches(mql.matches)`, nghe `'change'` (đặt `matches` theo `event.matches`), gỡ listener khi dọn. Phụ thuộc `[query]`. Viết `mockMatchMedia` như mô tả ở Interfaces.
- [ ] **Step 4: Chạy lại:** cùng lệnh → 5 test đạt.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/hooks/useMediaQuery.ts apps/web/src/hooks/useMediaQuery.test.ts apps/web/src/test-utils/match-media.ts
  git commit -m "feat(ui): hook useMediaQuery và bộ giả matchMedia cho test (Giai đoạn 2)"
  ```

### Task 2: Mô hình hàng của danh sách phiên, dùng chung

**Files:**
- Create: `apps/web/src/app/teacher/grading/_components/session-list/session-row-view.ts`
- Create: `apps/web/src/app/teacher/grading/_components/session-list/session-row-view.test.ts`
- Modify: `apps/web/src/app/teacher/grading/_components/session-list/SessionTable.tsx` (`Row`, và nhóm tiêu đề: dùng mô hình hàng; DOM không đổi)

**Interfaces:**
- Consumes: `SessionRow`, `RowGroup`, `RowAction`, `rowActionOf`, `rowNote`, `formatSessionDate`, `submittedCount`, `sessionHref` từ `@/lib/session-list`; `EXAM_TYPE_LABELS` từ `@/lib/exam-session-display`.
- Produces:
  ```ts
  export interface SessionRowView {
    id: string; name: string; href: string;           // href = sessionHref(id)
    meta: string;                                     // [className, roomName].filter(Boolean).join(' · ')
    typeLabel: string;                                // EXAM_TYPE_LABELS[examType] ?? examType
    date: string; time: string;                       // formatSessionDate(startTime)
    submitted: string;                                // String(submittedCount(session))
    expected: string;                                 // `/${expectedCount}` khi rosterKnown && expectedCount > 0, ngược lại ''
    note: { text: string; tone: 'warn' | 'ok' } | null;   // rowNote(row, now)
    action: RowAction;                                // rowActionOf(row)
    actionLabel: string;                              // `${action.label}: ${name}${className ? `, ${className}` : ''}`
    selectLabel: string;                              // `Chọn phiên ${name}${className ? `, ${className}` : ''}`
  }
  export function sessionRowView(row: SessionRow, now: number): SessionRowView
  export function groupSummary(g: RowGroup): { total: number; attention: number; ready: number }
  ```
  `groupSummary`: `total` = số hàng, `attention`/`ready` = số hàng có `status` đó (đúng phép đếm ở tiêu đề nhóm của `SessionTable`).

- [ ] **Step 1: Viết test thất bại** (`rowsOf`, `session`, `summary`, `NOW` từ `@/lib/session-list.fixtures`):
  - `'builds the strings the table and the cards both show'`: phiên `session({ id: 'a', name: 'Kiểm tra giữa kỳ', className: 'DHKTPM18ATT', roomName: 'Phòng máy A1' })` với `summary('a', { flagged_for_review: 11, ai_grading: 4, auto_approved: 23 })` → `meta === 'DHKTPM18ATT · Phòng máy A1'`, `date === '28/09/2026'`, `time === '07:30'`, `typeLabel === 'Giữa kỳ'`, `submitted === '38'`, `expected === '/40'`, `action` là `{ kind: 'link', label: 'Xem xét', href: '/teacher/grading?sessionId=a&state=needsYou' }`, `actionLabel === 'Xem xét: Kiểm tra giữa kỳ, DHKTPM18ATT'`, `selectLabel === 'Chọn phiên Kiểm tra giữa kỳ, DHKTPM18ATT'`, `href === '/teacher/grading?sessionId=a'`.
  - `'drops "/M" when the roster is unknown or empty'`: `session({ rosterKnown: false })` và `session({ expectedCount: 0 })` → `expected === ''`.
  - `'labels carry no class when there is none'`: `session({ className: null })` → `actionLabel` không có `', '` và `selectLabel === 'Chọn phiên Kiểm tra giữa kỳ'`.
  - `'a row with unknown status still has a plain open action and no note'`: `rowsOf([session()], undefined)` → `action.kind === 'link'`, `action.label` khớp `/^Mở/`, `note === null`.
  - `'groupSummary counts rows and the two highlighted statuses'`: dùng `groupRows(rows, 'class')` từ fixture 3 phiên ở `SessionTable.test.tsx` (a: attention; b: todo; c: done) → nhóm `DHKTPM18ATT` có `total: 2, attention: 1, ready: 0`.
- [ ] **Step 2: Chạy:** `./node_modules/.bin/vitest run src/app/teacher/grading/_components/session-list/session-row-view.test.ts` → FAIL.
- [ ] **Step 3: Cài `sessionRowView` và `groupSummary`** đúng công thức ở Interfaces (chuyển nguyên phần tính từ `Row` của `SessionTable`, không viết lại logic).
- [ ] **Step 4: Đổi `Row` và tiêu đề nhóm của `SessionTable.tsx` dùng `sessionRowView` / `groupSummary`.** DOM, class và `aria-label` giữ nguyên từng ký tự.
- [ ] **Step 5: Chạy hồi quy:** `./node_modules/.bin/vitest run src/app/teacher/grading/_components/session-list` → toàn bộ đạt (SessionTable 13, SessionList 23 và các test còn lại trong thư mục).
- [ ] **Step 6: Commit**
  ```bash
  git add apps/web/src/app/teacher/grading/_components/session-list/session-row-view.ts apps/web/src/app/teacher/grading/_components/session-list/session-row-view.test.ts apps/web/src/app/teacher/grading/_components/session-list/SessionTable.tsx
  git commit -m "refactor(ui): rút mô hình hàng của danh sách phiên ra hàm thuần (Giai đoạn 2)"
  ```

### Task 3: `SessionCards`

**Files:**
- Create: `apps/web/src/app/teacher/grading/_components/session-list/TriCheckbox.tsx` (chuyển `TriCheckbox` ra khỏi `SessionTable.tsx`, `export`, nội dung giữ nguyên)
- Modify: `apps/web/src/app/teacher/grading/_components/session-list/SessionTable.tsx` (nhập `TriCheckbox` từ file mới)
- Create: `apps/web/src/app/teacher/grading/_components/session-list/SessionCards.tsx`
- Create: `apps/web/src/app/teacher/grading/_components/session-list/SessionCards.test.tsx`

**Interfaces:**
- Consumes: `SessionTableProps` (từ `./SessionTable`), `sessionRowView`, `groupSummary` (Task 2), `StatusPill`, `SessionProgress`, `TriCheckbox`.
- Produces: `export type SessionCardsProps = Omit<SessionTableProps, 'view' | 'onSort'>` và `export function SessionCards(props: SessionCardsProps): JSX.Element`.

Cấu trúc: bọc ngoài `<div data-density={density} className="group …">` (để `SessionProgress` đọc `group-data-[density=compact]`), trong đó `<ul aria-label="Danh sách phiên chấm">`. Tiêu đề nhóm là một `<li>` với `TriCheckbox` (nhãn `Chọn cả nhóm ${label}`) và nút `aria-expanded` giống bảng (cùng `groupSummary`). Mỗi phiên là một `<li data-selected>` gồm 5 dòng theo spec §5.1: (1) ô chọn trong `<label>` có class `h-10 w-10` (40px), nhập `aria-label={selectLabel}`, và liên kết tên (`href`, `title={name}`, `line-clamp-2`, `break-words`, `min-w-0`); (2) chữ phụ `date time · typeLabel · {submitted}{expected} bài nộp`; (3) `StatusPill` và `note` (cùng biểu tượng/màu như bảng); (4) `SessionProgress`; (5) nút hành động canh phải, `Button` cỡ mặc định (class `h-10`, 40px), `aria-label={actionLabel}`; `action.kind === 'start'` gọi `onStart(row)`. Chế độ `density === 'compact'` chỉ ẩn `note` (như bảng); dòng 2 vẫn hiện.

**Sai khác so với spec (cần sửa spec ở Task 7):** spec §5.1 viết chế độ Gọn "ẩn dòng 2 phụ và ghi chú"; bảng ở chế độ Gọn vẫn giữ ngày và số bài nộp, nên ẩn dòng 2 sẽ làm thẻ thiếu thông tin mà bảng có (vi phạm điều không được xảy ra ở spec §2). Thẻ chỉ ẩn ghi chú.

- [ ] **Step 1: Chuyển `TriCheckbox`** ra `TriCheckbox.tsx`; chạy `./node_modules/.bin/vitest run src/app/teacher/grading/_components/session-list/SessionTable.test.tsx` → vẫn 13 đạt.
- [ ] **Step 2: Viết test thất bại** `SessionCards.test.tsx` (cùng fixture `rows` và hàm `props()` như `SessionTable.test.tsx`, bỏ `view`/`onSort`; `cardOf = (name) => screen.getByRole('link', { name }).closest('li')`):
  - `'shows name, class · room, date, count, status, note and progress for each session'`: thẻ `Kiểm tra giữa kỳ` có `/DHKTPM18ATT/`, `/Phòng máy A1/`, `28/09/2026`, `07:30`, `Giữa kỳ`, `38/40`, `Cần bạn xem`, `11 cần xem · 4 đang chấm`, và `getByRole('img', { name: /11 cần xem, 4 đang chấm, 23 chờ chốt/ })`.
  - `'the name is a link that keeps the session in the URL'` (href `/teacher/grading?sessionId=a`) và `'a long name keeps its full text in title'` (`TEST dien tap - xoa sau 1790588688826`).
  - `'each card has the action its status calls for'`: `Xem xét` (href `…sessionId=a&state=needsYou`), `Chuẩn bị`, `Mở kết quả`; và thẻ `Thiếu rubric` nói lý do không bắt đầu được.
  - `'a todo session with no blocker gets a button that calls onStart'` (như `SessionTable.test.tsx`).
  - `'the checkbox toggles exactly that session'`: `onToggleRows` gọi với `(['a'], true)`.
  - `'tap targets are at least 40px'`: jsdom không đo được bố cục nên khẳng định lớp: `checkbox.closest('label')` có class `h-10` và `w-10`; nút/liên kết hành động có class `h-10` (cỡ mặc định của `Button`). Con số 40px thật được đo ở Task 7.
  - `'grouped: a header per group; collapsing hides its cards; the group checkbox selects the group'` (Review Focus 3): như test của bảng (`aria-expanded="false"`, không còn link `Kiểm tra giữa kỳ`, `onToggleRows` gọi `(['a', 'c'], true)`).
  - `'unknown status: dashes and a plain open link, no crash'` (Review Focus 1): `rowsOf([session({ id: 'u', name: 'Chưa rõ' })], undefined)` → có `-` và liên kết `/^Mở/`.
  - `'an 80-character name without spaces does not widen the card'` (Review Focus 2): liên kết tên có class `break-words` và cha có `min-w-0`.
  - `'compact density hides the note but keeps date and count'`: với `density: 'cozy'`, thẻ `TEST dien tap - xoa sau 1790588688826` có chữ `Thiếu rubric`; với `density: 'compact'` thì `queryByText('Thiếu rubric')` là `null`, còn thẻ `Kiểm tra giữa kỳ` vẫn có `28/09/2026` và `38/40`.
- [ ] **Step 3: Chạy, thấy thất bại:** `./node_modules/.bin/vitest run src/app/teacher/grading/_components/session-list/SessionCards.test.tsx` → FAIL.
- [ ] **Step 4: Cài `SessionCards`** theo mô tả cấu trúc ở trên; chữ, nhãn và điều kiện chỉ lấy từ `sessionRowView`.
- [ ] **Step 5: Chạy lại:** cùng lệnh → đạt; rồi `./node_modules/.bin/eslint src/app/teacher/grading/_components/session-list` → 0 lỗi.
- [ ] **Step 6: Commit**
  ```bash
  git add apps/web/src/app/teacher/grading/_components/session-list
  git commit -m "feat(ui): thẻ phiên chấm cho viewport hẹp (Giai đoạn 2)"
  ```

### Task 4: Nối `SessionCards` vào `SessionList`

**Files:**
- Modify: `apps/web/src/app/teacher/grading/_components/session-list/SessionList.tsx` (chỗ vẽ `<SessionTable …/>`)
- Test: `apps/web/src/app/teacher/grading/_components/session-list/SessionList.test.tsx`

**Interfaces:**
- Consumes: `useMediaQuery`, `NARROW_LIST_QUERY` (Task 1), `SessionCards` (Task 3).

- [ ] **Step 1: Viết test thất bại**: thêm `describe('narrow viewport')` vào `SessionList.test.tsx` (dùng cách dựng và mock hook dữ liệu sẵn có trong file; `mockMatchMedia(true)` trong `beforeEach`, `restore()` trong `afterEach`):
  - `'renders cards, not a table, below 820px'`: `screen.queryByRole('table')` là `null`; có `getByRole('list', { name: 'Danh sách phiên chấm' })`; tên phiên vẫn là liên kết.
  - `'selecting a card opens the bulk bar'`: tick `getAllByRole('checkbox', { name: /^Chọn phiên/ })[0]` → có `region` `Thao tác trên phiên đã chọn`.
  - `'crossing 820px keeps the selection'` (Review Focus 4): tick một thẻ, `act(() => mock.setMatches(false))` → có `table`, và ô chọn của phiên đó vẫn `checked`.
  - `'wide viewport still renders the table'`: `mockMatchMedia(false)` → `getByRole('table')`.
- [ ] **Step 2: Chạy:** `./node_modules/.bin/vitest run src/app/teacher/grading/_components/session-list/SessionList.test.tsx` → test mới FAIL, 23 test cũ vẫn đạt.
- [ ] **Step 3: Sửa `SessionList.tsx`**: `const narrow = useMediaQuery(NARROW_LIST_QUERY)`; `narrow ? <SessionCards … /> : <SessionTable … />` với cùng props (thẻ không nhận `view`, `onSort`). Không đổi gì khác.
- [ ] **Step 4: Chạy lại:** cùng lệnh → toàn bộ đạt.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/app/teacher/grading/_components/session-list/SessionList.tsx apps/web/src/app/teacher/grading/_components/session-list/SessionList.test.tsx
  git commit -m "feat(ui): danh sách phiên chấm dùng thẻ dưới 820px (Giai đoạn 2)"
  ```

### Task 5: Mô hình hàng của danh sách bài, dùng chung

**Files:**
- Create: `apps/web/src/app/teacher/grading/_components/result-row-view.ts`
- Create: `apps/web/src/app/teacher/grading/_components/result-row-view.test.ts`
- Modify: `apps/web/src/app/teacher/grading/_components/ResultsTable.tsx` (thân bảng dùng mô hình hàng; `errorsText` chuyển sang file mới)

**Interfaces:**
- Consumes: `GradingResult` từ `@/lib/api/grading`; `stateOf`, `scoreCell`, `errorCounts`, `reasonOf`, `isReadingCode`, `type SessionState`, `type ScoreTag` từ `@/lib/session-triage`; `isMakeupSubmission` từ `@/lib/grading-triage`.
- Produces:
  ```ts
  export interface ResultRowView {
    id: string; href: string;                        // `/teacher/grading/${id}?sessionId=${sessionId}`
    mssv: string; name: string;
    makeup: string | null;                           // `Thi bù - ${homeClassName ?? homeClassId}` khi isMakeupSubmission(homeClassId, sessionClassId)
    method: 'reading-code' | 'essay' | null;         // isReadingCode → 'reading-code'; pipeline 'one_shot' còn lại → 'essay'
    status: GradingResult['status']; ungradableReason: string | null; pipeline: GradingResult['pipeline'];   // cho StatusPill
    state: SessionState;
    score: { text: string; tag: ScoreTag };          // scoreCell(r, state)
    auditHidden: boolean;                            // state === 'audit'
    errors: string;                                  // chuỗi cột "Lỗi" như ResultsTable hiện tại (`errorsText`)
    reason: string;                                  // reasonOf(r) ?? (state === 'needsYou' ? 'Mở hồ sơ để xem lý do.' : '-')
  }
  export function resultRowView(r: GradingResult, ctx: { sessionId: string; sessionClassId: string | null }): ResultRowView
  ```

- [ ] **Step 1: Viết test thất bại** (dựng `GradingResult` bằng hàm `result()` giống đầu `ResultsTable.test.tsx`; copy hàm đó vào file test):
  - `'builds href, mssv, name and the score cell'`: kết quả `id: 'a', studentMssv: '20120010', studentName: 'An', status: 'auto_approved', currentScore: 10`, `ctx { sessionId: 's1', sessionClassId: 'c1' }` → `href === '/teacher/grading/a?sessionId=s1'`, `score` là `{ text: '10,0', tag: 'tạm tính' }`.
  - `'errors: "-" without triage, "Không lỗi nào" with an empty triage, counts with a real one'`: `triage: null` → `'-'`; triage rỗng (như test hiện có) → `'Không lỗi nào'`; `counts: { counted: 1, unpriced: 1, refuted: 0, excluded: 0 }` → `'1 đã trừ · 1 chờ giá'`.
  - `'reason: ungradable keeps the system reason verbatim; a needs-you result without triage points at the dossier; others are "-"'`: `'Môi trường chạy bài hết giờ'`, `'Mở hồ sơ để xem lý do.'`, `'-'`.
  - `'method: a code project graded by reading is "reading-code"; another one-shot is "essay"; investigator is null'`.
  - `'makeup label uses the home class name, falling back to its id'`: `homeClassId: 'other', homeClassName: 'N09'` → `'Thi bù - N09'`; không có tên → `'Thi bù - other'`; cùng lớp → `null`.
  - `'an audit-pending result hides the score and says why'` (Review Focus 5): `status: 'audit_pending', currentScore: 8.63` → `auditHidden === true`, `score` là `{ text: 'ẩn', tag: 'chờ nhận xét của bạn' }`, và `JSON.stringify(view)` không chứa `8,6` hay `8.63`.
- [ ] **Step 2: Chạy:** `./node_modules/.bin/vitest run src/app/teacher/grading/_components/result-row-view.test.ts` → FAIL.
- [ ] **Step 3: Cài `resultRowView`** (chuyển `errorsText` và `reasonCell` từ `ResultsTable.tsx`, không viết lại phép tính).
- [ ] **Step 4: Đổi thân bảng của `ResultsTable.tsx`** đọc từ `resultRowView` (cùng DOM). Chạy hồi quy: `./node_modules/.bin/vitest run src/app/teacher/grading/_components/ResultsTable.test.tsx` → 16 đạt.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/app/teacher/grading/_components/result-row-view.ts apps/web/src/app/teacher/grading/_components/result-row-view.test.ts apps/web/src/app/teacher/grading/_components/ResultsTable.tsx
  git commit -m "refactor(ui): rút mô hình hàng của danh sách bài ra hàm thuần (Giai đoạn 2)"
  ```

### Task 6: `ResultCards`, chuyển bảng ↔ thẻ và câu "đọc mã" một lần

**Files:**
- Create: `apps/web/src/app/teacher/grading/_components/ResultCards.tsx`
- Create: `apps/web/src/app/teacher/grading/_components/ResultCards.test.tsx`
- Modify: `apps/web/src/app/teacher/grading/_components/ResultsTable.tsx` (chọn bảng/thẻ; câu dùng chung)
- Test: `apps/web/src/app/teacher/grading/_components/ResultsTable.test.tsx`

**Interfaces:**
- Consumes: `ResultRowView` (Task 5), `StatusPill` từ `@/components/status-pill`, `Badge`, `useMediaQuery`, `NARROW_LIST_QUERY`.
- Produces: `export function ResultCards({ views, showMethodChip }: { views: ResultRowView[]; showMethodChip: boolean }): JSX.Element`.

Thẻ bài: `<ul aria-label="Danh sách bài">`, mỗi `<li>` gồm: dòng 1 — MSSV (liên kết duy nhất tới hồ sơ, `font-medium text-accent-strong`), tên (được xuống dòng), nhãn `makeup` nếu có (`Badge variant="info"`), chip `method` nếu `showMethodChip` (`'reading-code'` → `Badge info` "Chấm bằng đọc mã, không chạy"; `'essay'` → `Badge outline` "Bài tự luận"); dòng 2 — `StatusPill` và điểm (`score.text` đậm, `score.tag` chữ phụ, cùng một dòng, `whitespace-nowrap`, biểu tượng `EyeOff` khi `auditHidden`); dòng 3 (chữ phụ) — `errors` và `reason` (`reason` tối đa 2 dòng, `line-clamp-2`). Không biến cả thẻ thành liên kết.

**Câu dùng chung:** trong `ResultsTable`, `sharedReadingCode = shown.length >= 2 && shown.every(isReadingCode)`. Khi đúng: hiện MỘT câu `<p className="text-caption text-muted-foreground">` "Mọi bài trong danh sách này được chấm bằng cách đọc mã, không chạy." giữa hàng chip lọc và phần thân, và KHÔNG hiện chip `'reading-code'` ở từng hàng/thẻ (chip `'essay'` và nhãn thi bù vẫn hiện). Khi sai (một bài, hoặc danh sách lẫn lộn): giữ chip từng hàng như hiện nay. Cả bảng và thẻ theo cùng quy tắc (`showMethodChip = !sharedReadingCode`).

- [ ] **Step 1: Viết test thất bại**
  - `ResultCards.test.tsx` (dựng view bằng `resultRowView`): `'shows mssv link, name, status, score with its tag, errors and reason'`; `'MSSV opens the dossier and keeps the session in the URL'`; `'an ungradable card shows the system reason verbatim and "chưa có điểm", never 0'`; `'a makeup student is flagged'` (`Thi bù - N09`); `'an audit-pending card hides the score behind "ẩn" and shows "chờ nhận xét của bạn" - never the system score'` (Review Focus 5: `li` không chứa `8,6` và `8.63`); `'showMethodChip false drops the reading-code chip but keeps the essay chip'`.
  - `ResultsTable.test.tsx`, thêm: `'two or more rows all graded by reading: says it once and drops the per-row chip'` (2 kết quả `pipeline: 'one_shot', deliverableType: 'code_project'` → đúng 1 phần tử khớp `/Mọi bài trong danh sách này được chấm bằng cách đọc mã/`, `queryByText('Chấm bằng đọc mã, không chạy')` là `null`); `'a mixed list keeps the chip on the code rows and shows no shared sentence'`; (test cũ `'labels a code result graded by reading…'` một bài vẫn giữ chip: không sửa); `'below 820px renders cards, not a table'` (`mockMatchMedia(true)` → `queryByRole('table')` là `null`, có `list` tên `Danh sách bài`, thứ tự bài như bảng: `20120002`, `20120001`, `20120010`); `'the filter chips and the empty-filter message work in card mode too'` (`mockMatchMedia(true)`: `filter: 'auto'` → đúng 1 `li` trong danh sách bài và bấm `Tất cả · 3` gọi `onFilterChange('all')`; `filter: 'audit'` → có `/Không có bài nào ở nhóm này/` và không có danh sách).
- [ ] **Step 2: Chạy:** `./node_modules/.bin/vitest run src/app/teacher/grading/_components/ResultCards.test.tsx src/app/teacher/grading/_components/ResultsTable.test.tsx` → test mới FAIL, 16 test cũ đạt.
- [ ] **Step 3: Cài `ResultCards`** và sửa `ResultsTable.tsx`: `useMediaQuery(NARROW_LIST_QUERY)` chọn thẻ hay bảng cho phần thân (khung chip lọc và thông báo "Không có bài nào ở nhóm này" dùng chung); câu dùng chung và `showMethodChip` như mô tả; bảng bỏ chip `'reading-code'` trong ô sinh viên khi `showMethodChip` là `false`.
- [ ] **Step 4: Chạy lại** cùng lệnh → toàn bộ đạt; `./node_modules/.bin/eslint src/app/teacher/grading/_components` → 0 lỗi.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/app/teacher/grading/_components
  git commit -m "feat(ui): thẻ bài cho viewport hẹp và câu đọc mã nói một lần (Giai đoạn 2)"
  ```

### Task 7: Kiểm chứng trên stack thật, sửa tài liệu, review, mở PR

**Files:**
- Modify: `docs/superpowers/specs/2026-11-27-grading-flow-phase2-design.md` (§5.1: chế độ Gọn của thẻ chỉ ẩn ghi chú, dòng 2 vẫn hiện; chip đọc mã chỉ gộp khi từ 2 bài trở lên)
- Modify: `docs/ui-refactor/phase1-plan.md` (WP1, đoạn "Ba file này cần một biến thể bảng riêng": thêm một dòng nói `SessionTable` và `ResultsTable` đã có thẻ dưới 820px ở Giai đoạn 2 PR 1)
- Create (ngoài repo, không commit): `C:/tmp/ui-evidence/phase2-pr1/probe.mjs`

- [ ] **Step 1: Cổng tĩnh và kiểm toàn cục.** Ở gốc worktree (`C:/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE-ui-refactor`) chạy `bash ~/.claude/skills/cine-verify-ui/scripts/static-gates.sh origin/main --full`. Mục 1 của cổng sẽ báo đúng MỘT file cần duyệt: `apps/web/src/hooks/useMediaQuery.ts` (hook mới chỉ đọc media query, không đọc dữ liệu); ghi lý do đó vào mô tả PR. Mọi file khác báo ở mục 1 là lỗi của task. Mong đợi: tsc chỉ 5 lỗi có sẵn, vitest chỉ 5 lỗi có sẵn (và tổng đạt tăng đúng bằng số test mới), eslint 0 lỗi; "diff chạm logic" không báo `lib/session-list.ts`, `lib/session-triage.ts`, hook dữ liệu. Chạy `./node_modules/.bin/next build` → exit 0.
- [ ] **Step 2: Dựng stack** theo skill `cine-verify-ui` mục 2 (API 4011, web 3011 từ worktree; Docker đã có sẵn Postgres/Redis/MinIO; DB `examcollect_ui` giữ nguyên, id trong `seed/MANIFEST.md`).
- [ ] **Step 3: Chụp SAU:** `node ~/.claude/skills/cine-verify-ui/scripts/shoot.mjs C:/tmp/ui-shots/routes-phase2-grading.json C:/tmp/ui-evidence/phase2-pr1/after` (17 route × 2 viewport; cấu hình đã có). Đọc từng ảnh `s1-list`, `s2-session-*`, `s3-result-*`, `s4-*` bằng Read.
- [ ] **Step 4: Đo.** Viết `probe.mjs` (playwright-core như `shoot.mjs`, đăng nhập GV chủ lực) ghi, ở 390px cho `s1-list` và `s2-session-sort`: số `li` của `ul[aria-label="Danh sách phiên chấm"]` / `ul[aria-label="Danh sách bài"]`, chiều cao lớn nhất của một `li`, chiều cao nhỏ nhất của ô chọn và nút hành động, `scrollWidth` của danh sách so với `innerWidth`; rồi ghi đè `textContent` của liên kết tên đầu tiên bằng 80 ký tự `A` liền nhau và kiểm `document.documentElement.scrollWidth <= innerWidth` (Review Focus 2 trên dữ liệu thật). Mong đợi: `scrollers` trong kết quả `shoot.mjs` = 0 cho `s1-list` và ba `s2-session-*` ở 390px; `hOverflow` = false; ô chọn và nút ≥ 40px; thẻ bài trong trường hợp thường ≤ 130px (nếu lớn hơn, ghi số thực vào mô tả PR và ưu tiên không mất thông tin); `pageHeight` của `s2-session-sort` ở 390px < 9699.
- [ ] **Step 5: So với TRƯỚC.** `compare.cjs` giữa `C:/tmp/ui-evidence/phase2-baseline` và `…/phase2-pr1/after` cho các ảnh d1280: không đổi kích thước/chỉ số bố cục của bảng (`pageHeight` d1280 của `s1-list`, `s2-*` không đổi trừ phần câu "đọc mã" nói một lần ở phiên `sort` và `ktlt`, nơi hàng ngắn đi). Console 0, request lỗi 0.
- [ ] **Step 6: Phân loại phát hiện** theo skill mục 6 (lỗi UI / hiện vật seed / lỗi nghiệp vụ); lỗi nghiệp vụ ghi `docs/ui-refactor/logic-findings.md`, không sửa trong PR này.
- [ ] **Step 7: Sửa hai tài liệu ở mục Files** bằng `C:/tmp/crlf-edit.cjs` nếu file là CRLF.
- [ ] **Step 8: Commit tài liệu**
  ```bash
  git add docs/superpowers/specs/2026-11-27-grading-flow-phase2-design.md docs/ui-refactor/phase1-plan.md
  git commit -m "docs(ui): ghi lại hai điều chỉnh của PR 1 vào thiết kế (Giai đoạn 2)"
  ```
- [ ] **Step 9: Gọi `code-reviewer`** cho cả nhánh (`git diff origin/main...HEAD`), kèm spec và plan này; sửa mọi mục 🔴/🟡 rồi chạy lại Step 1 phần liên quan; chờ VERDICT.
- [ ] **Step 10: Đẩy nhánh và mở PR** (không merge): `git push -u origin feat/ui-p2-s1-cards`; mô tả PR nói rõ: mục đích, thay đổi, ảnh trước/sau ở 390px/1280px (đường dẫn thư mục, không đính ảnh có họ tên/MSSV), các chỗ lệch spec đã sửa, kết quả lệnh thật (tsc/vitest/eslint/build), và những gì chưa kiểm (hộp xác nhận bulk trên thẻ nếu chưa bấm thật, 768px). Không thêm dòng "Generated with Claude Code". Dùng `gh api -X PATCH` nếu cần sửa mô tả. Dừng và báo chủ dự án.
- [ ] **Step 11: Dọn.** Tắt API/web đã dựng nếu không còn dùng; không commit ảnh; không để họ tên hay MSSV sinh viên trong docs/PR (dùng `[SV]`/`[MSSV]`).
