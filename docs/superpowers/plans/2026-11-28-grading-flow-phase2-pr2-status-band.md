# Giai đoạn 2, PR 2: một băng tình trạng ở đầu phiên đang chấm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đầu màn một phiên đang chấm chỉ còn MỘT tình trạng (tiêu đề tóm tắt, thanh tiến độ, số đếm, ước tính tốc độ) và MỘT thông báo sự cố tối đa ba dòng, thay cho sáu khối nói về cùng vài bài.

**Architecture:** Một component mới `SessionIncidents` vẽ thông báo sự cố từ ba mẩu dữ liệu đã tính sẵn (lỗi dịch vụ AI, bài bị kẹt, bài đã dừng); `RunningPanel` tính cả ba rồi đưa cho nó, còn `page.tsx` chỉ đưa mẩu "lỗi dịch vụ AI" khi `RunningPanel` không hiện. `AiServiceBand`, băng "bị kẹt", khối "đã dừng" và khối "Đang chạy ngay lúc này" bị xoá.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind (token HSL), Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-27-grading-flow-phase2-design.md` §5.2 (và §2, §3, §8). Nhánh `feat/ui-p2-s2-status-band`, tách từ `origin/main` 5f752753 (đã có PR 1).

## Global Constraints

- Chỉ lớp trình bày: không đổi hook dữ liệu, query, API, route, quyền, và không đổi `lib/progress-rate.ts`, `lib/regrade-triage.ts`, `lib/session-triage.ts`, `_components/stuck.ts` (chỉ đọc chúng). Số đếm lấy từ cùng nguồn như hiện nay.
- Giữ nguyên: băng mất mạng ("Máy bạn đang mất mạng") và băng "Máy chủ không trả lời" (khác nguyên nhân, có nút riêng); điều kiện `isStuck`; công thức `withResult`/`stopped` của `RunningPanel`; chỉ MỘT nút chấm lại, đặt ở đầu trang (`SessionHeader`).
- Thông báo sự cố: một `Alert variant="warning"` duy nhất, tối đa ba dòng (lỗi dịch vụ AI, bài bị kẹt, bài đã dừng), mỗi dòng chỉ hiện khi có; không dòng nào thì không có `Alert`; một câu "Bấm nút chấm lại ở đầu trang để xếp lại các bài này." ở cuối, chỉ khi có dòng mà nút đó giải quyết được (lỗi dịch vụ AI, bài bị kẹt, hoặc bài đã dừng có ít nhất 1 bài chấm lại được).
- Khi phiên KHÔNG đang chấm, giữ hành vi hôm nay: chỉ dòng "lỗi dịch vụ AI" (dòng "đã dừng" chỉ có khi đang chấm). [Spec §5.2 ghi "dòng (a) và (c)"; câu kế đó ghi "giữ hành vi đó" — thắng câu sau; sửa spec ở Task 4.]
- Chữ theo `docs/ui-refactor/glossary.md`; sentence case; không lộ mã nội bộ. Danh sách dùng `<ul role="list">` (Tailwind bỏ `list-style` làm Safari/VoiceOver mất vai trò danh sách; bài học của review PR 1).
- Thư mục làm việc `apps/web`. Lệnh: `./node_modules/.bin/vitest run <đường dẫn>`, `./node_modules/.bin/eslint <đường dẫn>`, `./node_modules/.bin/tsc --noEmit -p .`. Mốc có sẵn: tsc 5 lỗi (`classes/page.test` 2, `preflight.test` 1, `read-workbook.test` 2); vitest 5 lỗi (`FinalizePanel` 1, `rules/page` 4). Bốn file test của PR này hiện đạt 73/73 (RunningPanel 19, AiServiceBand 6, page 43, stuck 5).
- File nguồn hiện có dùng CRLF: sửa nhiều dòng bằng `C:/tmp/crlf-edit.cjs` (`edit(file, [[cũ, mới], ...])`, đòi đúng 1 khớp); `Write` vào file đã bị script sửa phải `Read` lại trước. File mới tạo bằng Write (LF) là được. `MSYS_NO_PATHCONV=1` khi truyền đối số giống đường dẫn.
- Commit bằng danh tính git hiện có; KHÔNG `Co-Authored-By`, KHÔNG "Generated with Claude Code". `git push` ghi rõ nhánh đích (`git push -u origin feat/ui-p2-s2-status-band`). Không merge: PR chờ chủ dự án duyệt.
- Trước khi báo xong: `code-reviewer` và VERDICT (quy tắc `CLAUDE.md`); sau lượt sửa, nhờ cùng reviewer kiểm lại phần sửa.

## Review Focus

Năm điều kiện mà test dễ bỏ sót; mỗi dòng có test ở task sở hữu mã:
1. Phiên đang chấm không có sự cố nào: không có `Alert` rỗng, chỉ có phần tình trạng (Task 2).
2. Máy giảng viên mất mạng khi đang có lỗi dịch vụ AI: dòng lỗi dịch vụ AI vẫn hiện, còn dòng "bị kẹt" và "đã dừng" không hiện (không khẳng định điều không biết) (Task 2).
3. Mọi bài dừng thuộc lớp `submission` (không chấm lại được): dòng "đã dừng" hiện nhưng KHÔNG có mệnh đề "chấm lại được" và KHÔNG có câu chỉ tới nút chấm lại (Task 1 và 2).
4. Màn không đang chấm (chuẩn bị, danh sách bài) có từ hai bài cùng lý do lỗi: vẫn có đúng một thông báo lỗi dịch vụ AI, đúng một nút chấm lại, và không có thông báo thứ hai khi `RunningPanel` hiện (Task 3).
5. Số bài dừng nhiều hơn số bài đã xong mà API báo (danh sách chạy trước tiến độ): số đếm không âm, tiêu đề tóm tắt khớp chú giải (Task 2).

---

### Task 0: Đo TRƯỚC khi sửa mã

**Files:**
- Create (ngoài repo, không commit): `C:/tmp/ui-evidence/phase2-pr2/probe-gap.mjs`

- [ ] **Step 1: Dựng stack** như skill `cine-verify-ui` mục 2 (API 4011 từ `apps/api` của worktree chính, web 3011 từ worktree này; Docker đã có Postgres/Redis/MinIO; DB `examcollect_ui` giữ nguyên, id phiên trong `seed/MANIFEST.md`).
- [ ] **Step 2: Viết `probe-gap.mjs`** (playwright-core như `probe.mjs` của PR 1, đăng nhập GV chủ lực). Với phiên "Sắp xếp và tìm kiếm" (`/teacher/grading?sessionId=d2ceaad1-80e2-46b5-bf2f-747b766aa17f`) ở 1280px và 390px, in JSON gồm: `gap = section[aria-label="Danh sách bài"].getBoundingClientRect().top − header.getBoundingClientRect().bottom`, với `header = document.querySelector('h1').closest('div.gap-6').firstElementChild`; số phần tử `[role="alert"]`; số `section[aria-label="Đang chạy ngay lúc này"]`; chiều cao trang.
- [ ] **Step 3: Chạy và chụp.** Mong đợi ở mã chưa sửa: `gap` khoảng 490px ở 1280px, 2 `alert`, 1 khối "Đang chạy ngay lúc này". Chụp 17 route bằng `shoot.mjs` (cấu hình `C:/tmp/ui-shots/routes-phase2-grading.json`) vào `C:/tmp/ui-evidence/phase2-pr2/before`. Lưu kết quả `probe-gap` ra `before-gap.json`. Không có gì để commit; ghi số đo vào sổ.

### Task 1: `SessionIncidents` và `aiServiceIncident`

**Files:**
- Create: `apps/web/src/app/teacher/grading/_components/SessionIncidents.tsx`
- Test: `apps/web/src/app/teacher/grading/_components/SessionIncidents.test.tsx`

**Interfaces:**
- Consumes: `groupByUngradableReason` từ `@/lib/regrade-triage`; `Alert`, `AlertDescription` từ `@/components/ui/alert`; `GradingResult` từ `@/lib/api/grading`.
- Produces:
  ```ts
  export interface AiServiceIncident { count: number; reason: string }
  export interface StuckIncident { count: number; stall: string | null }   // stall = "2 phút" (describeStall) hoặc null
  export interface StoppedIncident { count: number; regradable: number }
  export function aiServiceIncident(results: GradingResult[]): AiServiceIncident | null
  export function SessionIncidents(props: {
    aiService?: AiServiceIncident | null; stuck?: StuckIncident | null; stopped?: StoppedIncident | null;
  }): JSX.Element | null
  ```
  `aiServiceIncident`: nhóm lớn nhất của `groupByUngradableReason(results)`, và chỉ khi `count >= 2` (đúng luật của `AiServiceBand` hiện tại); ngược lại `null`.

Chữ (cố định, để test khẳng định):
- Dòng lỗi dịch vụ AI: `<strong>Dịch vụ AI lỗi - {count} bài không chấm được cùng một lý do:</strong> “{reason}”. Đếm trong danh sách hiện tại, không đo được khoảng thời gian; chờ dịch vụ ổn rồi chấm lại.`
- Dòng bị kẹt: `<strong>{count} bài đang bị kẹt</strong> - không còn tiến trình chấm nào xử lý chúng.` kèm ` Không có bài nào hoàn thành trong {stall}.` khi `stall !== null`.
- Dòng đã dừng: `<strong>{count} bài đã dừng.</strong> Bài dừng vì lỗi hệ thống chưa có điểm nào` rồi ` - {regradable} bài trong số đó chấm lại được.` khi `regradable > 0`, ngược lại `.`
- Câu cuối (`text-caption`): `Bấm nút chấm lại ở đầu trang để xếp lại các bài này.`

Cấu trúc: `Alert variant="warning"` → `AlertDescription` chứa `<ul role="list">` (mỗi dòng một `<li>`) và câu cuối. Không có nút nào.

- [ ] **Step 1: Viết test thất bại** `SessionIncidents.test.tsx` (hàm `result()` như `AiServiceBand.test.tsx`: `ungradableClass: 'system'`, lý do `'Dịch vụ AI không phản hồi.'`):
  - `'aiServiceIncident: two system-class results with the same reason → count and reason'` (`{ count: 2, reason: 'Dịch vụ AI không phản hồi.' }`).
  - `'aiServiceIncident: one stopped result, two with different reasons, or submission-class / class-less results → null'` (bốn ca, mỗi ca `toBeNull()`; sao chép dữ liệu từ `AiServiceBand.test.tsx`).
  - `'aiServiceIncident: names the LARGEST group'` (3 "Hết giờ" thắng 2 "AI lỗi" → `count: 3, reason: 'Hết giờ'`).
  - `'renders nothing when there is no incident'`: `render(<SessionIncidents />)` và `render(<SessionIncidents aiService={null} stuck={null} stopped={null} />)` → `container` rỗng (`toBeEmptyDOMElement()`).
  - `'AI service line quotes the reason, says what it measures, and has no button'` (khớp `/Dịch vụ AI lỗi - 2 bài không chấm được cùng một lý do/`, `/“Dịch vụ AI không phản hồi\.”/`, `/không đo được khoảng thời gian/`, `queryByRole('button')` là `null`).
  - `'stuck line says how many, and how long when it is known'` (với `stall: '2 phút'` có `/Không có bài nào hoàn thành trong 2 phút/`; với `stall: null` không có câu đó).
  - `'stopped line with regradable ones says how many can be regraded and points to the one button'`: `stopped={{ count: 2, regradable: 2 }}` → `/2 bài đã dừng/`, `/2 bài trong số đó chấm lại được/`, và câu cuối `Bấm nút chấm lại ở đầu trang để xếp lại các bài này.` (Review Focus 3, nửa đầu).
  - `'stopped line with nothing regradable (all submission-class) has no regrade clause and no pointer to the button'`: `stopped={{ count: 1, regradable: 0 }}` → có `/1 bài đã dừng/`, KHÔNG có `/chấm lại được/`, KHÔNG có `/Bấm nút chấm lại/` (Review Focus 3).
  - `'all three incidents share ONE alert, one list of three items and one closing sentence'`: `getAllByRole('alert')` dài 1; `within(alert).getAllByRole('listitem')` dài 3; `getAllByText(/Bấm nút chấm lại ở đầu trang/)` dài 1.
  - `'the list keeps its role for VoiceOver'`: `screen.getByRole('list')` có `role="list"` thật (`toHaveAttribute('role', 'list')`).
- [ ] **Step 2: Chạy, thấy thất bại:** `./node_modules/.bin/vitest run src/app/teacher/grading/_components/SessionIncidents.test.tsx` → FAIL (không tìm thấy module).
- [ ] **Step 3: Cài `SessionIncidents.tsx`** theo Interfaces và Chữ ở trên (chuyển nguyên phép nhóm từ `AiServiceBand`: dùng `groupByUngradableReason(results)[0]`).
- [ ] **Step 4: Chạy lại** cùng lệnh → toàn bộ đạt; `./node_modules/.bin/eslint src/app/teacher/grading/_components/SessionIncidents.tsx src/app/teacher/grading/_components/SessionIncidents.test.tsx` → 0 lỗi.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/app/teacher/grading/_components/SessionIncidents.tsx apps/web/src/app/teacher/grading/_components/SessionIncidents.test.tsx
  git commit -m "feat(ui): thông báo sự cố gộp một khối cho phiên đang chấm (Giai đoạn 2)"
  ```

### Task 2: `RunningPanel` dùng `SessionIncidents`, tiêu đề tóm tắt, bỏ hai khối thừa

**Files:**
- Modify: `apps/web/src/app/teacher/grading/_components/RunningPanel.tsx`
- Test: `apps/web/src/app/teacher/grading/_components/RunningPanel.test.tsx`

**Interfaces:**
- Consumes: `SessionIncidents`, `aiServiceIncident` (Task 1); `isStuck` (`./stuck`); `describeStall`, `stalledSeconds`, `describeRate`, `estimate` (`@/lib/progress-rate`); `countSystemUngradable` (`@/lib/regrade-triage`).
- Produces: `RunningPanel` giữ nguyên chữ ký props.

Thứ tự trong `RunningPanel` (khi đã có `progress`): băng mất mạng → băng "máy chủ không trả lời" → `SessionIncidents` (cả ba mẩu) → khối tình trạng (`data-stale`): tiêu đề tóm tắt, thanh tiến độ, chú giải ba phần, dòng ước tính, câu "Bài đã có kết quả mở được ngay trong danh sách bên dưới - không phải đợi hết lượt." Xoá: `Alert` "bị kẹt" cục bộ, `section` "Đang chạy ngay lúc này", khối "đã dừng".
- Tiêu đề tóm tắt (`<p className="font-semibold tabular-nums">`): `{withResult}/{progress.total} bài đã có kết quả · {progress.pending} đang chấm`, dùng ĐÚNG `withResult` đã có (không tính bài dừng), để số khớp chú giải. (Khối cũ viết "38 trên 40 đã có kết quả" dùng `progress.done`, lệch chú giải "Đã có kết quả 36".)
- Mẩu dữ liệu: `aiService = aiServiceIncident(results)`; `stuck = stuck ? { count: stuckCount, stall: stall === null ? null : describeStall(stall) } : null`; `stopped = online && stoppedCount > 0 ? { count: stopped, regradable: Math.min(systemStopped, stopped) } : null` (đúng điều kiện `online && stopped > 0` cũ; `Math.min` để dòng không bao giờ nói "1 bài đã dừng - 3 bài trong số đó chấm lại được" khi danh sách chạy trước tiến độ).

- [ ] **Step 1: Viết test thất bại** — sửa `RunningPanel.test.tsx`:
  - Thêm `'headline says results out of total and how many are grading, from the same numbers as the legend'`: props mặc định (tổng 10, đang chấm 4, đã xong 6, 2 bài dừng) → `getByText('4/10 bài đã có kết quả · 4 đang chấm')`; chú giải "Đã có kết quả" vẫn `4`.
  - Thêm `'there is no "Đang chạy ngay lúc này" block any more'`: `queryByRole('region', { name: 'Đang chạy ngay lúc này' })` là `null` (thay test cũ `'"Đang chạy ngay lúc này" shows the count…'`, xoá test đó).
  - Thêm `'a running session with no incident has no alert at all'` (Review Focus 1): `results: [result()]`, tiến độ có hàng đợi còn việc sống (`queue.active: 2`) → `queryByRole('alert')` là `null`; vẫn có `progressbar`.
  - Thêm `'AI service, stuck and stopped share ONE alert inside the panel'`: `results: finished` (2 bài lớp system cùng lý do `'Môi trường chạy bài hết giờ'`) và tiến độ kẹt (`pending: 3, done: 7, byStatus: { ai_grading: 3 }, queue: { waiting: 0, active: 0, failed: 0 }`) → đúng 1 `alert`; trong đó `/Dịch vụ AI lỗi - 2 bài không chấm được cùng một lý do/`, `/3 bài đang bị kẹt/`, `/2 bài đã dừng/`, và đúng một câu `/Bấm nút chấm lại ở đầu trang/`.
  - Sửa các test cũ cho khớp chữ mới (mỗi chỗ liệt kê trong mô tả PR): `'says how many are stuck…'` và `'says how long the count has stood still'` tìm `alert` bằng `screen.getByText(/đang bị kẹt/).closest('[role="alert"]')` (vì giờ có thể có cả băng khác); `'the stopped-results note points…'` đổi `getByText(/chấm lại được bằng nút ở đầu trang/)` thành `getByText(/2 bài trong số đó chấm lại được/)` và khẳng định đúng một `/Bấm nút chấm lại ở đầu trang/`; `'a stopped result of class "submission" is not regradable…'` giữ `getByText(/1 bài đã dừng/)` và thêm `queryByText(/chấm lại được/)` là `null`, `queryByText(/Bấm nút chấm lại/)` là `null` (Review Focus 3); `'SERVER not answering…'` đổi `getByRole('alert')` thành `getByText(/Không biết việc chấm có chạy tiếp không/).closest('[role="alert"]')` (giờ có thể có hai `alert`).
  - Thêm `'offline: the AI service incident stays, but stuck and stopped are not claimed'` (Review Focus 2): `online: false` với `results: finished` và tiến độ kẹt → có `/Dịch vụ AI lỗi - 2 bài/`, không có `/đang bị kẹt/`, không có `/bài đã dừng/`.
  - Thêm `'a stopped count larger than the done count never goes negative and the headline matches the legend'` (Review Focus 5): `progress({ total: 10, pending: 4, done: 1 })` với `results` có 3 bài dừng → chú giải "Không chấm được / dừng" là `1`, "Đã có kết quả" là `0`, tiêu đề `0/10 bài đã có kết quả · 4 đang chấm`, và dòng đã dừng nói `/1 bài đã dừng/` cùng `/1 bài trong số đó chấm lại được/` (không phải 3).
- [ ] **Step 2: Chạy, thấy thất bại:** `./node_modules/.bin/vitest run src/app/teacher/grading/_components/RunningPanel.test.tsx` → các test mới và các test đã sửa FAIL, các test không đụng tới vẫn đạt.
- [ ] **Step 3: Sửa `RunningPanel.tsx`** theo "Thứ tự", "Tiêu đề tóm tắt" và "Mẩu dữ liệu" ở trên. Không đổi gì ngoài chữ/khung của các khối nêu tên; giữ `data-stale`, `role="progressbar"`, `aria-label` của chú giải.
- [ ] **Step 4: Chạy lại** cùng lệnh → toàn bộ đạt; `./node_modules/.bin/eslint src/app/teacher/grading/_components/RunningPanel.tsx src/app/teacher/grading/_components/RunningPanel.test.tsx` → 0 lỗi.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/app/teacher/grading/_components/RunningPanel.tsx apps/web/src/app/teacher/grading/_components/RunningPanel.test.tsx
  git commit -m "refactor(ui): băng tình trạng của phiên đang chấm gom sự cố vào một khối (Giai đoạn 2)"
  ```

### Task 3: `page.tsx` bỏ `AiServiceBand`, giữ thông báo khi không đang chấm

**Files:**
- Modify: `apps/web/src/app/teacher/grading/page.tsx`
- Delete: `apps/web/src/app/teacher/grading/_components/AiServiceBand.tsx`, `apps/web/src/app/teacher/grading/_components/AiServiceBand.test.tsx`
- Test: `apps/web/src/app/teacher/grading/page.test.tsx`

**Interfaces:**
- Consumes: `SessionIncidents`, `aiServiceIncident` (Task 1).

`page.tsx`: thay `<AiServiceBand results={list} />` bằng `{!runningPanelShown && <SessionIncidents aiService={aiServiceIncident(list)} />}` với `const runningPanelShown = !loading && !showReview && running;` (đúng điều kiện nhánh vẽ `RunningPanel` hiện có). Khi `RunningPanel` hiện, nó tự vẽ sự cố (Task 2), nên không vẽ lần hai.

- [ ] **Step 1: Viết test thất bại** — sửa `describe('AI service band (G3 D12)')` trong `page.test.tsx` (test dùng `RunningPanel` đã được mock; tiến độ mặc định `pending: 0` là KHÔNG đang chấm):
  - Giữ `'is mounted on the session screen, says what is shared, and leaves the regrade to the one button at the top'` (chữ `Dịch vụ AI lỗi - 2 bài không chấm được cùng một lý do` vẫn khớp), và `'is absent when only one result stopped'`.
  - Thêm `'while the running panel is shown it owns the incident - no second one on the page'` (Review Focus 4): `h.progress.data = progress({ pending: 2, done: 1, total: 3 })` và hai bài dừng cùng lý do → `getByTestId('running-panel')` có mặt, `queryByText(/Dịch vụ AI lỗi -/)` là `null`, `h.runningProps` có props `results` chứa hai bài đó.
  - Thêm `'the incident still shows on the prepare screen when every result stopped for the same reason'` (Review Focus 4): mọi kết quả đều dừng cùng lý do, không đang chấm → `getByTestId('prepare-panel')` và `getByText(/Dịch vụ AI lỗi - 3 bài/)` (dựng 3 bài dừng), và đúng một nút `Chấm lại … bài lỗi hệ thống`.
- [ ] **Step 2: Chạy, thấy thất bại:** `./node_modules/.bin/vitest run src/app/teacher/grading/page.test.tsx` → test "running panel owns the incident" FAIL (trang vẫn vẽ `AiServiceBand`); các test khác đạt.
- [ ] **Step 3: Sửa `page.tsx`** như mô tả; xoá `AiServiceBand.tsx` và `AiServiceBand.test.tsx` (ca của nó đã chuyển sang `SessionIncidents.test.tsx` ở Task 1); bỏ import `AiServiceBand`.
- [ ] **Step 4: Chạy:** `./node_modules/.bin/vitest run src/app/teacher/grading` → mọi file đạt trừ `FinalizePanel.test.tsx` (1 lỗi có sẵn); `./node_modules/.bin/eslint src/app/teacher/grading` → 0 lỗi; `./node_modules/.bin/tsc --noEmit -p .` → chỉ 5 lỗi có sẵn (không còn ai import `AiServiceBand`).
- [ ] **Step 5: Commit**
  ```bash
  git add -A apps/web/src/app/teacher/grading/page.tsx apps/web/src/app/teacher/grading/page.test.tsx apps/web/src/app/teacher/grading/_components/AiServiceBand.tsx apps/web/src/app/teacher/grading/_components/AiServiceBand.test.tsx
  git commit -m "refactor(ui): trang phiên chấm bỏ băng dịch vụ AI riêng, dùng thông báo sự cố chung (Giai đoạn 2)"
  ```

### Task 4: Kiểm chứng trên stack thật, sửa tài liệu, review, mở PR

**Files:**
- Modify: `docs/superpowers/specs/2026-11-27-grading-flow-phase2-design.md` (§5.2)

- [ ] **Step 1: Số đo TRƯỚC** đã có từ Task 0 (`C:/tmp/ui-evidence/phase2-pr2/before`, `before-gap.json`); dựng lại stack nếu đã tắt (web dev phải chạy lại sau `next build`).
- [ ] **Step 2: Cổng tĩnh và kiểm toàn cục** (sau Task 3): ở gốc worktree `bash ~/.claude/skills/cine-verify-ui/scripts/static-gates.sh origin/main --full`. Mong đợi: mục 1 không báo file nào (PR này không thêm hook), màu thô/emoji sạch, tsc chỉ 5 lỗi có sẵn, vitest chỉ 5 lỗi có sẵn (số đạt thay đổi đúng bằng số test thêm trừ số test xoá); `./node_modules/.bin/eslint .` exit 0. Chạy riêng `next build` (dừng web dev trước: build và dev dùng chung `.next`) → exit 0.
- [ ] **Step 3: Đo SAU và chụp:** chạy lại `probe-gap.mjs` và `shoot.mjs` (thư mục `phase2-pr2/after`). Mong đợi: `gap ≤ 300px` ở 1280px; đúng 1 `alert` trong khối sự cố (cộng băng mạng nếu có); không còn `section` "Đang chạy ngay lúc này"; `hOverflow` false; console 0, request lỗi 0. Chụp thêm các phiên khác của `routes-phase2-grading.json` và so với TRƯỚC bằng `compare.cjs`: chỉ `s2-session-sort` (và `s2-session-ktlt` nếu nó đang chạy) đổi; các màn khác y nguyên. Tự xem từng ảnh bị ảnh hưởng bằng Read.
- [ ] **Step 4: Phân loại phát hiện** theo skill mục 6; lỗi nghiệp vụ (ví dụ "Đang chấm 2" lệch "Đang chấm · 16", L-08) ghi `docs/ui-refactor/logic-findings.md`, không sửa trong PR này.
- [ ] **Step 5: Sửa spec §5.2** bằng `C:/tmp/crlf-edit.cjs` nếu file là CRLF: (i) khi không đang chấm chỉ có dòng "lỗi dịch vụ AI" (bỏ chữ "và (c)"); (ii) tiêu đề tóm tắt dùng số "có kết quả" không tính bài dừng (ví dụ "36/40", không phải "38/40"); (iii) thứ tự: băng mạng, sự cố, rồi tình trạng. Commit: `docs(ui): spec ghi ba điều chỉnh của PR 2 (Giai đoạn 2)`.
- [ ] **Step 6: Gọi `code-reviewer`** cho cả nhánh (`git diff origin/main...HEAD`) kèm spec, plan, Review Focus ở trên; sửa mọi mục Critical/Important bằng test đỏ → xanh; nhờ cùng reviewer kiểm lại phần sửa; chờ `VERDICT: PASS`.
- [ ] **Step 7: Đẩy nhánh và mở PR** (không merge): `git push -u origin feat/ui-p2-s2-status-band`, rồi `gh pr create --repo smart-lab-system/CINE --base main --head feat/ui-p2-s2-status-band`. Mô tả nêu: mục đích, thay đổi (liệt kê từng chuỗi test đổi), số đo thật trước/sau (gap, số `alert`), lệnh thật (tsc/vitest/eslint/build), điều chỉnh so với spec, việc chưa kiểm. Không đính ảnh có họ tên/MSSV; không dòng "Generated with Claude Code". Dừng và báo chủ dự án.
- [ ] **Step 8: Dọn.** Tắt API/web đã dựng; không commit ảnh; không để họ tên hay MSSV sinh viên trong docs/PR.
