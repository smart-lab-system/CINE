# Bảng lỗi (đổi tên, tạo/sửa luật, trần điểm, bỏ trang Rubric) — Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, native). Steps use checkbox syntax. Every task is TDD: write the failing test, watch it fail for the right reason, implement, watch it pass, `tsc`, lint the touched dir, commit.

**Goal:** Turn `/teacher/rules` from the half-built, mislabeled "Trang kiến thức" into the spec's **Bảng lỗi**: the one place a teacher enters what the AI must know — a rule table with prices and impact preview, a way to create/revise a rule (including from "Luật còn thiếu"), the per-criterion ceiling (replacing the Rubric page, which is then removed), and the "tiêu chí này không có luật trừ" mark.

**Architecture:** Same layering as the rest of `apps/web` (page → hook → `lib/api` → `apiClient`). New pure logic lives in `lib/` with unit tests; components are small and colocated under `app/teacher/rules/_components/`. **No backend changes**: every route already exists (`GET/POST /rules`, `PATCH /rules/:id`, `POST /rules/:id/state`, `POST /rules/preview`, `POST /rules/:id/price/preview`, `PUT /rules/:id/price`, `GET/POST /rubrics`, criterion-waiver routes).

**Tech Stack:** Next.js 15 App Router, TanStack Query, Tailwind tokens, Vitest + RTL. No Playwright in this plan (user decision 2026-09-29; may be run after A/B/C).

**Spec:** `docs/superpowers/specs/2026-09-23-grading-ui-rebuild-design.md` §1, §2.1–2.2, §3.1, §3.2, §4 (rubrics row); `docs/superpowers/specs/2026-09-20-grading-agent-investigator-design.md` §2.1, §2.2, §4.2, §4.6, §14.1. Mockup: canvas artboards `Main.dc.html`, `RuleEditor.dc.html` (digest: `scratchpad/digest-mockup.md` §2.1–2.2 — session scratch, not in repo). Backend contract: `scratchpad/digest-be.md` §2.

## Global Constraints

- Copy is Vietnamese; comma decimals via `lib/format.ts`; `tabular-nums` on number columns; real minus U+2212 for deductions.
- The screen name is **"Bảng lỗi"** everywhere (nav label, h1). Never "Trang kiến thức".
- Wording per spec §2.2: `checkedBy='machine'` → **Máy kiểm**; a rule that HAS a `predicate` but `checkedBy='model'` → **Máy chưa đo được** (with its consequence, §4.6); no predicate → **Bằng lời**. Source of a rule: `origin` `teacher` → **của bạn**, `seed` → **luật mồi**, `agent_reported` → **agent đề xuất**.
- Deductions/prices go to the API as **decimal strings** (`"1.50"`) or `null` (unpriced) — never JSON numbers (server 400). UI accepts comma or dot and normalises.
- A control with no backing route is disabled + dashed "cần backend" badge and never sends a request.
- Every mutation error renders the server's Vietnamese message verbatim in an inline destructive `Alert`.
- Rubric saves always create a NEW version (no update route). The ceiling editor MUST round-trip each existing criterion's `key` (the server re-derives `key` from the description when omitted, which would silently re-point rules) and only let the user type a key for a NEW criterion.
- Do not touch `pipeline === 'one_shot'` code, the grading pages, or anything under `teacher/grading/**` (Plan C).
- Branch `feat/grading-ui-rebuild`; commit per task; no push/PR/merge until all of A/B/C are done.

## Review Focus

1. **Saving a rubric silently changes a criterion `key`** (edit a description → server derives a different key → every rule pointing at the old key becomes `mismatchedRules`). → Task 6 test: saving after editing only a description sends the ORIGINAL `key`.
2. **Price/deduction typed with a comma** ("1,5") or with spaces must be accepted and sent as `"1.5"`; garbage ("abc", negative, 3 decimals) blocked on blur with the message beside the field, and nothing sent. Empty = explicit `null` (unpriced), not omitted. → Task 3 + Task 5 tests.
3. **The impact preview must be shown before a price is saved and must reset when the number changes** (a stale preview for the old number must not enable "Lưu"). The current dialog also never initialised its input from the rule (`useState(rule?.deduction)` on an always-mounted component) and never showed a save error. → Task 3.
4. **A rule with a predicate the machine cannot measure yet** (`calls_function`, `no_recursion`, `complexity_exceeds_required`) must never be presented as "Máy quyết / độ tin 1,0" — label it *máy chưa đo được* and say the consequence. → Task 1 + Task 5.
5. **"Không phải lỗi" / marking "không có luật trừ" change scores of unfinalised sessions** — must ask for confirmation stating the consequence in words, then show the server's recompute summary in words. → Task 4 + Task 6.
6. **Deleting the Rubric page must not orphan its callers** (`RubricPicker` link, `SessionRubricCard` links, nav, bookmarks). → Task 7 (redirect + grep).

---

## Task 1: Vocabulary helpers, nav rename, typed predicate

**Files:** Create `apps/web/src/lib/rules-vocab.ts` + `rules-vocab.test.ts`. Modify `apps/web/src/lib/nav-config.ts` (label `Trang kiến thức` → `Bảng lỗi`, remove the `Rubric` item) and its test if one asserts the nav; `apps/web/src/lib/api/rules.ts` (add `RulePredicate` union type).

**Interfaces — Produces:**
- `type RulePredicate = {kind:'test_group_failed'; group:string} | {kind:'calls_function'; name:string} | {kind:'complexity_exceeds_required'} | {kind:'no_recursion'; functionName?:string}`
- `matchKindOf(rule: Pick<Rule,'checkedBy'|'revision'>): 'machine'|'unmeasured'|'words'`
- `MATCH_KIND_LABEL: Record<'machine'|'unmeasured'|'words', string>` = Máy kiểm / Máy chưa đo được / Bằng lời
- `originLabel(origin: string): string`
- `formatDeductionString(d: string|null): string` — `"1.50"` → `"−1,5"`, `null` → `'—'`
- `parseDeductionInput(raw: string): {ok:true; value:string|null} | {ok:false; message:string}` — trims, accepts `,`/`.`, ≤2 decimals, ≥0, ≤4 integer digits (matches server regex `/^(\d{1,4})(?:\.(\d{1,2}))?$/`), empty → `{ok:true,value:null}`; message for bad input = `Mức trừ: số không âm, tối đa hai chữ số lẻ.`
- `slugifyRuleKey(name: string): string` — strip Vietnamese diacritics (incl. đ), lowercase, non-alnum → `_`, collapse/trim `_`, ≤64 chars; matches `/^[a-z0-9_]{1,64}$/`; empty result → `'luat_moi'`.

**Tests to write first:** `matchKindOf` for the 3 cases (incl. `checkedBy:'model'` + predicate ⇒ `unmeasured`, spec §2.2); `parseDeductionInput` table: `"1,5"→"1.5"`, `" 2 "→"2"`, `""→null`, `"abc"`, `"-1"`, `"1.234"`, `"12345"` rejected, `"0"→"0"`; `formatDeductionString("1.50")==='−1,5'`; `slugifyRuleKey("Tên biến không nói lên vai trò")==='ten_bien_khong_noi_len_vai_tro'`, a 200-char input ≤ 64, `"???"→'luat_moi'`; nav has `Bảng lỗi`, has no `Trang kiến thức`, has no `Rubric`.

- [ ] Steps: tests → RED → implement → GREEN → `tsc` → commit `feat(rules): vocabulary helpers, rename nav to Bang loi`.

## Task 2: Rule table, summary cards, filters, page shell

**Files:** Modify `app/teacher/rules/page.tsx`, `_components/RuleTable.tsx`; create `_components/RuleSummary.tsx`, `_components/RuleToolbar.tsx`, `lib/rules-filter.ts` (+ tests for each); update `page.test.tsx`.

**Behaviour (spec §3.1, mockup Main):**
- `PageHeader` title **Bảng lỗi** + the mockup description; right action link **Thêm luật** → `/teacher/rules/new`.
- `RuleSummary` four cards: (1) *Luật đã có giá* `x / y luật`; (2) *Chưa có giá — đang chặn* `N luật` (amber) — **the "M bài chờ" figure is omitted**: `appliedTo.results` summed over unpriced rules double-counts a bài that hits two of them and the API has no distinct count (ledger this); (3) *Luật còn thiếu* `missing.length`; (4) *Mức trừ do máy quyết* — no API → dashed card with "cần backend", disabled semantics, never a made-up percentage.
- `filterRules(rules, filter, query)`: filters `all | unpriced | machine | words` (machine = `checkedBy==='machine'` only; `unmeasured` rules appear under *Tất cả* and *Mô tả bằng lời*? **No** — spec §3.1: they only appear in *Tất cả*); search matches `ruleKey`, `revision.name`, `revision.criterionKey` case-insensitively and without diacritics. Chips show `label · count`, `aria-pressed`.
- Table columns: **Lỗi** (name + mono `ruleKey · nguồn`), **Tiêu chí**, **Cách khớp** (pill + text, icon not colour alone), **Mức trừ** (`−1,5` or amber *Chưa có giá*), **Đang áp vào** (`N bài · M phiên`), **cảnh báo** (`N bài lệch tiêu chí` + link *Sửa luật này*), action: *Đặt giá* (unpriced, teal) / *Sửa giá* (outline) and *Sửa luật* link → `/teacher/rules/[id]`.
- Empty filter result: `Không có luật nào ở bộ lọc này. Chọn "Tất cả" để xem toàn bộ bảng.`; loading skeleton; list error → destructive Alert with message.

**Tests first:** `filterRules` (each filter, unmeasured only in `all`, search diacritics `"tên"` finds `Tên biến…`); summary numbers from a fixture; table renders `−1,5` / *Chưa có giá* / *Máy chưa đo được* label; *Đặt giá* vs *Sửa giá*; empty-state text; page has h1 `Bảng lỗi` and does NOT contain `Trang kiến thức`; the *cần backend* card exists and no percentage figure.

- [ ] Steps: tests → RED → implement → GREEN → `tsc` → eslint dir → commit `feat(rules): Bang loi table, summary, filters`.

## Task 3: Price sheet (fixes the old dialog's bugs)

**Files:** Replace `_components/PriceEditDialog.tsx` with `_components/PriceSheet.tsx` (+ test); delete the old file/test; wire in `page.tsx`.

**Behaviour (spec §3.1 "Bảng đặt giá", luật 4 & 7):** right-hand `Sheet` opened per rule, keyed by `rule.id` so state cannot leak between rules; input initialised from `rule.deduction` (comma decimals); help text with the criterion ceiling when known (*Giá cao hơn trần vẫn lưu được…*); **on blur** validate with `parseDeductionInput` (message beside the field) and, if valid, run `usePreviewPrice`; changing the text clears the preview; *Lưu và tính lại N bài* disabled until a preview for the CURRENT text exists, N = Σ `openSessions[].affected`; impact box: per open session `affected`, `autoAfter` (*đủ điều kiện tự quyết*), `blockedByOtherUnpriced`; for `finalizedSessions` the note *"N bài thuộc phiên đã chốt: giữ nguyên điểm, vì bảng giá đã ghim lúc chốt."*; empty text = price `null` (*để trống = chưa có giá*, allowed, says the consequence); save error (mutation `.error.message`) and preview error shown inline; success closes.

**Tests first (Review Focus 2, 3):** initial value shown; `"1,5"` sends `deduction:"1.5"`; `"abc"` shows the message and calls neither preview nor save; typing after a preview disables save again; empty input sends `null`; save error text visible; finalized note shown with the count.

- [ ] Steps: tests → RED → implement → GREEN → tsc/eslint → commit `feat(rules): price sheet with preview-before-save`.

## Task 4: "Luật còn thiếu" cards

**Files:** Rewrite `_components/MissingRulesPanel.tsx` (+ test).

**Behaviour:** section *Luật còn thiếu* with the note *"…Lỗi này đã bị **loại khỏi điểm** — hệ thống không đoán luật gần nhất."*; one card per proposed rule showing its description (API gives no per-session counts for proposed rules — do not invent them); buttons **Tạo luật từ đây** (link → `/teacher/rules/new?from=<ruleId>`) and **Không phải lỗi** which opens a confirm dialog stating *"Bài nào đang chờ luật này sẽ được tính lại; lỗi này sẽ không xuất hiện ở bài nữa."*, then `useSetRuleState({ruleId,state:'dismissed'})`, showing the server error inline and, on success, the recompute summary in words (`recomputed`/`promoted`/`demoted`) — the state hook must return the API's `{recompute}` (extend `setRuleState` return type).

**Tests first (Review Focus 5):** confirm dialog appears before any request; confirm calls `dismissed` with the id; cancel sends nothing; link href; error message shown; renders nothing when list empty.

- [ ] Steps: tests → RED → implement → GREEN → commit `feat(rules): missing-rules cards with create/dismiss`.

## Task 5: Rule editor (`/teacher/rules/new`, `/teacher/rules/[ruleId]`)

**Files:** Create `lib/rule-form.ts` (+test), `app/teacher/rules/new/page.tsx`, `app/teacher/rules/[ruleId]/page.tsx`, `_components/RuleForm.tsx`, `_components/ApplyPreview.tsx` (+ tests). Extend `lib/api/rules.ts` (`updateRuleState` returns `{recompute}`; `createRule` returns `recompute`), `hooks/useRules.ts` if needed.

**`lib/rule-form.ts` — Produces:** `RuleFormState = {name; description; criterionKey; mode:'machine'|'words'; template:'tests'|'call'|'complexity'|'recursion'; param:string; price:string}`; `formFromRule(rule)`; `predicateFromForm(state): RulePredicate|null`; `tierOf(state): 2|3|4` (machine+`tests` → 2; machine+other → 3; words → 4); `saveLabelOf(tier, matched?: number)` → `Lưu và áp cho N bài` / `Lưu luật — áp từ phiên chưa chấm` (tier 3 in this version = same label as tier 4 because the API only returns a reason and does not re-run — spec §3.2 "Bậc 3 ở bản này"); `validateRuleForm(state): Record<string,string>` (name 1–200, description ≤2000 non-blank, criterion required, `tests` needs a group, `call` needs an identifier `/^[A-Za-z_][A-Za-z0-9_]{0,63}$/`); `buildCreateInput(state)` → `{ruleKey: slugifyRuleKey(name), name, description, criterionKey, predicate}`.

**Behaviour (spec §3.2, mockup RuleEditor):** breadcrumb *Bảng lỗi › Tạo luật / Sửa luật*; four fieldsets *1. Lỗi là gì* (name, description) · *2. Thuộc tiêu chí nào* (single-select pills from the teacher's ACTIVE rubric versions' criteria, `key · trần`; note about the ceiling) · *3. Hệ thống nhận ra lỗi này bằng cách nào* (two mode cards, `aria-pressed`; machine shows the four templates with their parameter input; the three templates the machine cannot measure yet carry **máy chưa đo được** + consequence text — never "Máy quyết/độ tin 1,0" for them; words shows the sign textarea + note) · *4. Mức trừ* (blank allowed with the *không tự quyết được* note). Scope note. Right column: 4-tier list with the current tier highlighted, and `ApplyPreview` calling `usePreviewRule` (debounced, only when name/criterion valid): tier 2 → table *Bài / Hiện tại / Sau khi lưu / chạm trần* (`before` is a decimal STRING, `after` is integer HUNDREDTHS — convert separately), tier 3 → the API `reason` verbatim + *cần backend* on the "lời gọi sẽ chạy lại · ước lượng" part, tier 4 → sessions table *Sẽ xét / Không xét*. `?from=<ruleId>` prefills from the proposed rule (looked up in `useMissingRules`), and saving = `reviseRule` then `setRuleState('active')` then price; `/[ruleId]` prefills from `useRules` and saving = `reviseRule` (+ price if changed). New rule = `createRule` then `setPrice` if a price was typed (a new rule starts unpriced). 409 (key exists) → the server message inline.

**Tests first:** the pure functions (tier mapping, labels, validation table, `predicateFromForm` for all four templates + `words → null`, `buildCreateInput`, `formFromRule` round-trips a rule's predicate); component: changing template moves the highlighted tier and the save label; unmeasured templates show *máy chưa đo được* and never *Máy quyết*; save disabled while invalid, messages beside fields; create sends a decimal-string price via `setPrice` only when typed; `?from=` prefill; server error verbatim; tier-2 preview table converts `after` hundredths (850 → `8,5`) and `before` string.

- [ ] Steps: tests → RED → implement → GREEN → tsc/eslint → commit `feat(rules): rule editor with tiered apply preview`.

## Task 6: Ceiling block + "không có luật trừ" (replaces the Rubric page's job)

**Files:** Create `_components/CeilingCard.tsx`, `_components/RubricDialog.tsx`, `lib/rubric-form.ts` (+ tests). Modify `lib/api/grading.ts` (`Rubric.criteria[].key: string`, `saveRubric(name, criteria[{description,maxPoints,key?}])`) and `hooks/useGrading.ts` (`useSaveRubric` input type). Wire into `page.tsx` aside.

**Behaviour:** aside *Trần điểm theo tiêu chí* for the teacher's rubric (a `Select` when there is more than one rubric name; default the most recently created active one): rows `tiêu chí · trần`, total *Điểm tối đa*, **Sửa trần** opens `RubricDialog` (edit description/cap, add/remove criterion, key input only for NEW rows, existing keys shown read-only) whose save posts the new version — **existing rows send their original `key`** (Review Focus 1) — and says *Mỗi lần lưu tạo một phiên bản mới…*. Under the rows, for every criterion of the active version that no ACTIVE rule points at: label *chưa có luật nào* and a checkbox **Tiêu chí này không có luật trừ** wired to `useWaivers/useSetWaiver/useRevokeWaiver` (keyed by the rubric VERSION id), with a confirm stating *"Từ giờ tiêu chí này luôn trọn điểm cho mọi bài chấm theo rubric này; các phiên chưa chốt được tính lại."* and, after the call, the recompute summary in words. No preview route exists for this → the preview part carries *cần backend*.

**Tests first:** `lib/rubric-form.ts` — existing criterion keeps its `key` after a description edit (**Review Focus 1**), new criterion sends the typed key or omits it when blank, invalid key `/^[a-z0-9_]{1,64}$/` blocked, duplicate keys blocked, ≥1 criterion, cap 0.25–100 step 0.25; card — criteria without an active rule show the waiver checkbox, criteria with a rule do not; toggling asks for confirmation before any request; dialog save calls `saveRubric` with keys; server error inline.

- [ ] Steps: tests → RED → implement → GREEN → tsc/eslint → commit `feat(rules): ceiling card, rubric dialog keeping keys, criterion waiver`.

## Task 7: Remove the Rubric page, redirect, fix callers

**Files:** Delete `app/teacher/rubrics/page.tsx`, `page.test.tsx`, `_components/RubricEditor.tsx` (and its test if any). Create `app/teacher/rubrics/page.tsx` as a server component that `redirect('/teacher/rules')` (+ a tiny test that the module exports a default function which calls `redirect` with that path — mock `next/navigation`). Modify `app/teacher/exam-sessions/new/_components/RubricPicker.tsx` (its link → `/teacher/rules`) and its test.

- [ ] Steps: `grep -rn "teacher/rubrics" apps/web/src` before and after (only the redirect page, `SessionRubricCard` which Plan C deletes, and tests may remain — list them in the ledger) → update tests first → implement → GREEN → commit `feat(rules): redirect /teacher/rubrics to Bang loi, drop Rubric page`.

## Task 8: Regression

- [ ] `pnpm --filter web test` (all green), `pnpm --filter web exec tsc --noEmit` (only the known unrelated `read-workbook.test.ts` typing noise), `pnpm --filter web lint` (0 errors), `pnpm --filter web build`.
- [ ] Smoke with the real API (same approach as Plan A): start the built API with `.env.test`, log in with the seeded teacher, call `GET /rules`, `GET /rules/missing`, `POST /rules` (a new key), `PATCH`, `POST /rules/preview` for all three tiers, `POST /rules/:id/price/preview`, `PUT /rules/:id/price` with `"1.5"`, `POST /rubrics` twice (same name; assert the second version keeps criterion keys when sent), waiver set/revoke; compare shapes with the FE types. Fix any drift.
- [ ] Commit fixes separately if needed.

## Execution note

Inline in this session on `feat/grading-ui-rebuild`; continue straight to Plan C afterwards; final independent review of the whole branch runs once after Plan C (Plan A's review is already running in the background).
