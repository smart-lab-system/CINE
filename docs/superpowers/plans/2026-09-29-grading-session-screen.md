# Phiên chấm (chuẩn bị · đang chấm · danh sách bài · chốt điểm · áp giá mới) — Implementation Plan (Plan C)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, native). Steps use checkbox syntax. Every task is TDD: write the failing test, watch it fail for the right reason, implement, watch it pass, `tsc`, lint the touched dir, commit.

**Goal:** Replace the old `/teacher/grading` (session picker + ReadinessStrip + ConfidenceTiles + AnomalyPanel + ReviewWorkspace + FinalizeGradesButton) and `/teacher/grading/matrix` with the spec's **one route, three states** — *chuẩn bị chấm* → *đang chấm* → *danh sách bài* — plus the separate **chốt điểm** page and the **"Áp giá mới cho phiên đã chốt"** action, then delete the old components in the same branch.

**Architecture:** Same layering as the rest of `apps/web` (page → hook → `lib/api` → `apiClient`). Pure logic in `lib/` with unit tests (`session-triage`, `progress-rate`, `preflight`, `grading-reference-form`); components small and colocated under `app/teacher/grading/_components/`. **No backend changes.** Every control whose route does not exist is `disabled` + the shared `NeedsBackend` badge and never sends a request.

**Tech Stack:** Next.js 15 App Router, TanStack Query, Tailwind tokens, Vitest + RTL. No Playwright (user decision 2026-09-29; may run after A/B/C).

**Spec:** `docs/superpowers/specs/2026-09-23-grading-ui-rebuild-design.md` §1, §2.1–2.2, §3.3, §3.7, §3.8, §3.10, §3.11, §4, §6 (T-UI-1, 5, 7, 10–13, 16, 17, 20, 21). Backend contract: `apps/api/src/grading/grading.controller.ts`, `scoring/score.service.ts` (`ReapplyPlan`), `lifecycle/grading-transitions.ts` (`BLOCKS_FINALIZE`), `grading-lock.ts`.

## Verified backend facts this plan is built on

- `GET /exam-sessions/:id/grading-results` (`GradingResultView`) carries **no** breakdown, error counts or "why you are needed". Those live in `GET /grading-results/:id/investigation` (`useResultInvestigation`, cached under `investigationQueryKey`). The list's "vì sao cần bạn" and the leverage line therefore read the dossier of each `flagged_for_review` row (`useQueries`), and say nothing until it is loaded.
- `grading-progress` = `{ total, pending, done, byStatus, queue{waiting,active,failed} }`; `queue` is **system-wide**, so "running vs waiting" for one session is not knowable → the bar has *đã có kết quả · đang chấm · không chấm được/dừng*; the per-call "Đang chạy ngay lúc này" block is *cần backend* (spec §3.8 says so).
- `flagged_for_review` + `ungradableReason !== null` = *không chấm được* (spec §4.4). `audit_pending` = *kiểm mẫu* (status exists; the audit flow itself is out of scope).
- `BLOCKS_FINALIZE = ai_grading, ai_graded, flagged_for_review, audit_pending`. `finalize-grades` → `{reviewedByHand, acceptedAsProposed}`; 409 with the server's Vietnamese message when blocked or when a result has no score under the current rules.
- Grading-reference writes are locked by `isGradingLocked` (any result that is grading, has a score, a review score or a computation). The UI cannot ask that directly: it shows the prepare screen when there are no results (and when every result is *không chấm được*), and shows the server's 409 message verbatim if the write is refused.
- `POST /exam-sessions/:id/reapply-prices/preview` → `{ changes:[{resultId, oldScore:string, newScore:string, changedRules:[{ruleId,ruleKey,oldDeduction,newDeduction}]}], skipped:[{resultId, reason:'unpriced', ruleKeys}] }`; `POST …/reapply-prices` → `{changed:n}`, **409** when the session is not fully published or `skipped` is non-empty.
- Test bundles: `useTestBundles/useCreateTestBundle/useApproveTestBundle/usePinTestBundle` exist; `TestBundleDetail.cases[].autoDroppedReason` exists.

## Global Constraints

- Copy is Vietnamese; comma decimals via `lib/format.ts`; `tabular-nums`; U+2212 minus.
- Spec §2.2 vocabulary: *môi trường chạy bài* (never "sandbox"), *góc kiểm* (never "lăng kính"), *Mô hình + công cụ*, *không chấm được*, *tạm tính*.
- Status/source labels are icon **and** words (spec §2.1 rule 1). Empty states say so and give an action (rule 2).
- Every score shown comes from `currentScore` (§14.2 / T-UI-9). Never `aiTotalScore`, never `finalScore`.
- A control with no backing route: `disabled` + `<NeedsBackend />`, never sends a request (T-UI-10).
- Every mutation error renders the server's message verbatim in an inline destructive `Alert`.
- Only send the fields of the grading reference the teacher changed (absent = keep, `null` = clear).
- Do not touch `pipeline === 'one_shot'` dossier code (`CriterionCard`, `ManualCriterionCard`, `AdvocatePanel`, `AnswerPane`) or the investigator dossier.
- Branch `feat/grading-ui-rebuild`; commit per task; **no push/PR/merge** until all plans are done and the whole-branch review passes.

## Review Focus

1. **A "cần backend" control that still sends a request** (regrade-system, samples, generate bundle, language declaration, running-now block). → every such control has a test that clicking it calls nothing.
2. **Start grading while the reference is unsaved or the bundle is not approved** locks documents/rubric for good (`isGradingLocked`). → Task 5 tests: start disabled with a reason until saved / approved / rubric pinned; no `start-grading` request before.
3. **Stopped-by-system results counted as "đã có kết quả"** (T-UI-13). → Task 1 + Task 4 tests.
4. **Leverage line making a claim from partial data** ("8 of 9 only wait for prices" while some dossiers are still loading). → Task 3: nothing is said until every flagged dossier is loaded.
5. **Finalize confirm dialog numbers not adding up** (T-UI-16) and export offered before finalizing. → Task 7.
6. **Deleting a still-imported module** (`grading-triage` has three live importers: `AdvocatePanel`, `CriterionCard`, `submission-rows`; `grading-groups` is used by the CSV export). → Task 8: delete by import graph, not by file name; `grep` before and after.
7. **Losing "gắn rubric sau"** (RubricPicker promises it) when `SessionRubricCard` goes. → Task 5 `RubricRow`.
8. **Losing the CSV export** with `ExportCsvButton`'s old home. → Task 7 keeps it, after finalize only.

---

## Task 1: Session triage (pure logic)

**Files:** Create `lib/session-triage.ts` + `.test.ts`.

**Produces:**
- `type SessionState = 'needsYou'|'audit'|'ungradable'|'grading'|'auto'|'reviewed'|'finalised'`; `STATE_ORDER` (needsYou, audit, ungradable, grading, auto, reviewed, finalised — "cần bạn và kiểm mẫu trước, tự quyết sau"); `STATE_LABEL` (Cần bạn xem · Kiểm mẫu · Không chấm được · Đang chấm · Tự quyết · Đã duyệt · Đã chốt).
- `stateOf(r)`: `ai_grading|ai_graded`→grading; `finalized|exported`→finalised; `teacher_reviewed`→reviewed; `audit_pending`→audit; `auto_approved`→auto; `flagged_for_review` with `ungradableReason !== null`→ungradable else needsYou; unknown→grading (safe default: still visible, still blocks).
- `countStates(results)`, `sortByState(results)` (state order, then MSSV numeric).
- `scoreCell(r, state)` → `{ text: string; tag: 'tạm tính'|'chấm tay'|'đã chốt'|'chưa có điểm'|null }`: `currentScore===null` → `{text:'—', tag:'chưa có điểm'}`; finalised → `đã chốt`; `currentScoreSource==='manual'` → `chấm tay`; else `tạm tính`. Number via `formatVnPoints`.
- `blockers(results)` → `{ needsYou, audit, ungradable, grading, remaining }` (remaining = exactly what `BLOCKS_FINALIZE` blocks).
- `finalizeCounts(results)` → `{ acceptedUnopened: #auto, reviewed: #reviewed, alreadyFinal: #finalised }` (T-UI-16: with nothing blocking and nothing final, `acceptedUnopened + reviewed === results.length`).
- `errorCounts(detail)` → `{ counted, unpriced, refuted, unverified }` from `breakdown.errors`/`errorFlags`.
- `reasonOf(r, detail?)`: ungradable → `ungradableReason` verbatim; `one_shot` needsYou → "Bài tự luận — luôn do bạn duyệt"; investigator needsYou with detail → sentence from `caseFlagLabel` for each caseFlag + "N luật chưa có giá" + "N lỗi chưa kiểm được" / "N lỗi bị bác bỏ", joined with " · "; without detail → `null`.
- `leverageOf(needsYou, detailsById)` → `null` unless **every** investigator needsYou dossier is loaded; else `{ waiting, total, ruleKeys }` where `waiting` = results whose ONLY blockers are unpriced rules (no caseFlags, no unverified/refuted flags).

**Tests first:** each status→state incl. unknown and the ungradable split; order; counts; `scoreCell` (null ⇒ "—", never "0", manual, finalised); `blockers` equals the server set on a mixed list; `finalizeCounts` adds up (T-UI-16); `reasonOf` for the three kinds + unloaded; `leverageOf` = null while one dossier missing, correct counts when loaded, ignores one_shot rows for the "only prices" test but counts them in `total`, deduplicated rule keys, null when `waiting === 0`.

- [ ] Steps: tests → RED → implement → GREEN → tsc → commit `feat(grading): session triage logic`.

## Task 2: Data hooks

**Files:** `hooks/useGrading.ts` (+`useResultDetails(ids)`), `hooks/useOnlineStatus.ts`, `lib/progress-rate.ts`, `hooks/useReapply.ts` + `lib/api/grading.ts` (`previewReapplyPrices`, `reapplyPrices`, types `ReapplyPlan`), each with tests.

- `useResultDetails(ids)`: `useQueries` on `investigationQueryKey(id)` → `{ byId: Map<string, ResultDetail>, loading: number, failed: number }`. Reuses the dossier's cache key.
- `useOnlineStatus()`: `navigator.onLine` + `online/offline` events.
- `progress-rate.ts`: `addSample(samples, {t, done})` (keeps last ~10 min), `estimate(samples, pending)` → `{ perMinute, minutesLeft } | null`; `null` unless ≥2 samples spanning ≥ 20 s with `done` increasing. Text helper says "Chưa ước tính được" when null and states the window when not.
- `previewReapplyPrices(sessionId)`, `reapplyPrices(sessionId)` (409/400 messages via `fail`); `useReapplyPreview` (mutation, no cache), `useReapplyPrices` (invalidates results + progress).

- [ ] Steps: tests → RED → implement → GREEN → commit `feat(grading): detail queries, online status, throughput estimate, reapply API`.

## Task 3: Overview bar, leverage line, results table, essay bulk-accept

**Files:** `_components/OverviewBar.tsx`, `LeverageLine.tsx`, `ResultsTable.tsx`, `BulkAcceptEssays.tsx` (+ tests).

- `OverviewBar({counts})`: proportional bar (`role="img"`, aria-label lists every number) + chips (icon + label + count) for tự quyết · kiểm mẫu · cần bạn xem · không chấm được · đang chấm, plus đã duyệt / đã chốt when > 0. Zero segments omitted from the bar; chips of the five always shown.
- `LeverageLine({leverage})`: renders nothing on `null`; else "*W trong T bài cần xem chỉ chờ bạn đặt giá cho R luật*" + link "Đặt giá" → `/teacher/rules?filter=unpriced`… (the rules page has the "Chưa có giá" chip; link to `/teacher/rules`).
- `ResultsTable({sessionId, sessionClassId, results, details, filter})`: sorted by `sortByState`; columns MSSV (link to `/teacher/grading/${id}?sessionId=…`) + name + "Thi bù" badge; status pill (reuse `StatusPill`); score (`scoreCell`, "—" + "chưa có điểm"); "Lỗi đã trừ / chờ giá" (from `errorCounts`, "—" when not applicable/unloaded); "Vì sao cần bạn" (`reasonOf`, "Đang xem hồ sơ…" while loading, per row); pipeline label for `one_shot` ("Bài tự luận"). Filter chips per state with counts (`aria-pressed`), empty-filter message with action.
- `BulkAcceptEssays({sessionId, results})`: only `one_shot` ∧ `flagged_for_review`; button "Duyệt hàng loạt N bài tự luận" → confirm dialog states exactly N and that each becomes a `bulk_accept` review; `useBulkReview` with `{kind:'keep_ai'}` and the explicit `resultIds`; outcome shows `applied`, `audited`, skipped-with-reasons (`SKIP_LABEL` moves here from the matrix). No essay result ever shows the *Tự quyết* label (T-UI-20).

**Tests first:** bar numbers/aria; the five chips even at 0; leverage null/renders; table sort, link, "—" not 0, reasons, loading, filter; essay confirm says N and sends only those ids; nothing sent on cancel.

- [ ] Steps: tests → RED → implement → GREEN → commit `feat(grading): session overview, leverage line, results table`.

## Task 4: Running panel (spec §3.8)

**Files:** `_components/RunningPanel.tsx` (+ test).

Props: `progress` (query result), `results`, `onRetry`, `onRegradeStuck`, regrade state. Shows: four-part progress (`đã có kết quả` = results not grading and without `ungradableReason`; `đang chấm` = `pending`; `không chấm được / dừng` = ungradable; never counting ungradable as done — Review Focus 3), accessible `progressbar`, throughput sentence from `progress-rate` (or "Chưa ước tính được"), banners by situation: **offline** (`!online`: "Việc chấm vẫn chạy trên máy chủ — không bài nào bị ảnh hưởng", numbers dimmed with "đọc lần cuối lúc HH:mm:ss", no buttons), **server not answering** (`progress.isError` and online: "Không biết việc chấm có chạy tiếp không…" + **Thử lại ngay** → `refetch`), **stuck** (`pending>0 ∧ queue.active===0 ∧ queue.waiting===0`: "N bài không còn ai chấm" + **Chấm tiếp N bài treo** → `regrade-stuck`, result `requeued/stuck`), plus the *cần backend* blocks: "Đang chạy ngay lúc này" and the AI-service-failure banner ("Chấm lại N bài" disabled). Says clearly that the finished results below are already openable.

**Tests first:** parts add up and ungradable is not in "đã có kết quả" (T-UI-13); offline text + no buttons + last-read time (T-UI-12); server-down shows retry and calls refetch; stuck shows the count and calls regrade; not-stuck when the queue is busy; running-now and regrade-system are disabled + badge and send nothing; rate text both ways.

- [ ] Steps: tests → RED → implement → GREEN → commit `feat(grading): running panel with incident banners`.

## Task 5: Prepare panel (spec §3.7)

**Files:** `lib/preflight.ts`, `lib/grading-reference-form.ts` (+tests); `_components/PreparePanel.tsx`, `ReferenceForm.tsx`, `RubricRow.tsx`, `PreflightColumn.tsx` (+tests). Reuses `TestBundleCard`.

- `grading-reference-form.ts`: `buildReferencePayload({questionTouched, questionId, note, initialNote, storageKey, filename})` — only changed fields (absent/`null`/value semantics of the old dialog, ported with its tests).
- `preflight.ts`: `preflightOf({ session, rubric, readiness, needsBundle, bundleApproved, bundlePinned, rules, criteria, dirty })` → rows `{ key, label, status: 'ok'|'warn'|'block', text }` for trần điểm · đề · đáp án · gói test · bảng lỗi (luật chưa giá = *warn*, tiêu chí chưa có luật = *warn* with the "Đánh dấu không có luật trừ" link) · số bài sẽ chấm (only collected: `fullySubmittedCount + partialCount`, says the number, and how many are absent/partial) · ngôn ngữ (code deliverables without `language` → *warn*, declaration itself *cần backend*); `canStart` = no *block* rows and not `dirty`; `reason` = first blocking text.
- `ReferenceForm`: rows đề bài (radio over `useExamMaterials`, none preselected, "Không dùng đề bài"), đáp án mẫu (file → presigned upload → then save; never shown on the grading screen note), ghi chú; the source-of-document line is *cần backend* (readiness only says yes/no); save = "Lưu tài liệu chấm" with the payload builder; a 409 from a locked session shows verbatim.
- `RubricRow`: shows the pinned rubric (name, version, total, criteria count) or a picker of the teacher's active rubrics + "Gắn rubric" (`useSetSessionRubric`); link to Bảng lỗi to edit ceilings. Replaces `SessionRubricCard` (Review Focus 7).
- `TestBundle` block: `TestBundleCard` for sessions with a `code_project` deliverable; plus *cần backend* buttons "Sinh đáp án mẫu và gói test từ đề" / "Sinh gói test từ đáp án của bạn" and "Chạy thử đáp án mẫu với gói test".
- `PreparePanel`: the four rows + preflight column + the start button "**Bắt đầu chấm N bài**" and the consequence line (documents and ceilings lock; closing the page does not stop grading); disabled with the reason shown next to it; `useStartGrading` only when `canStart`.

**Tests first:** payload builder table (only changed fields; `null` clears; nothing chosen ⇒ `{}`); preflight rows (block: no rubric / code session without approved+pinned bundle / no collected work; warn: unpriced rules, criteria without rules; ok); start disabled with each reason and **no request** sent (T-UI-11); button label carries N; enabled path calls `start.mutate` once; every *cần backend* control disabled + no request; rubric attach flow; unsaved reference disables start with "Lưu tài liệu trước".

- [ ] Steps: tests → RED → implement → GREEN → commit `feat(grading): prepare panel (reference, rubric, bundle, preflight, start)`.

## Task 6: Page assembly — one route, three states

**Files:** rewrite `app/teacher/grading/page.tsx` (+ test); new `_components/SessionPicker.tsx`, `SessionHeader.tsx` (+ tests).

- No `?sessionId` → `SessionPicker`: gradable sessions (`fullySubmittedCount + partialCount > 0`) as link cards (name, class, submitted/expected, rubric state, "chưa gắn rubric" flag) with an empty state.
- With a session: `SessionHeader` (name, class, room, "N/M bài nộp", **Đổi phiên** → `/teacher/grading`, **Chốt điểm phiên** → `/teacher/grading/finalize?sessionId=…`, **Chấm lại N bài lỗi hệ thống** *cần backend*, and the "Luật X thêm sau khi chấm — không xét trong phiên này" line is *cần backend* (needs the rule's creation time vs the session's grading time) — stated, not invented).
- State: `progress.pending > 0` → `RunningPanel` + finished results; else `results.length === 0` or every result is *không chấm được* → `PreparePanel` (banner explaining it can be reopened; results below when any); else list = `OverviewBar` + `LeverageLine` + `BulkAcceptEssays` + `ResultsTable`. `?state=` seeds the filter. Load/error/empty states for results and progress (stale data is called stale).
- The origin line for a system-generated bundle (T-UI-17) needs data the API lacks → not shown; ledger.

**Tests first:** picker (links, empty, no-rubric flag); each of the three states chosen from data; running shows finished rows; all-ungradable reopens prepare; list composes; `?state=` filter; loading/error; **header links** (finalize, change session).

- [ ] Steps: tests → RED → implement → GREEN → commit `feat(grading): one grading route with prepare / running / list`.

## Task 7: Finalize page and "Áp giá mới cho phiên đã chốt" (spec §3.10, §3.1)

**Files:** `app/teacher/grading/finalize/page.tsx` (+ test), `_components/FinalizePanel.tsx`, `ReapplyPricesPanel.tsx` (+ tests).

- Header says at the top: "Chốt là mốc công bố — chốt không ghi file nào." and that the clicker's name is written on every result.
- **Blocked**: one row per non-zero blocker (cần bạn xem · kiểm mẫu chưa kiểm · không chấm được · đang chấm) with the count and a link to `/teacher/grading?sessionId=…&state=…`; the button is disabled with the reason.
- **Ready**: button → dialog with exactly two numbers (`acceptedUnopened` "theo điểm hệ thống tự quyết mà bạn chưa mở", `reviewed` "bạn đã xem") which add up to the session size (T-UI-16), plus the consequence (from now every change is logged; changing a price in Bảng lỗi does **not** change this session; reapplying is a separate action). `useFinalizeGrades`; server error verbatim.
- **Finalised**: banner; `ReapplyPricesPanel`: "Xem trước" → table (bài, điểm cũ → mới, luật đổi with old→new deduction) and skipped-unpriced list; "Áp giá mới cho N bài" enabled only after a preview with `changes.length > 0` and `skipped.length === 0`, confirm says each changed result gets an audit-log line; result `{changed}`; 409 verbatim (T-UI-21). Export: interim **Xuất CSV** (`ExportCsvButton`, only here, only when finalised) and a dashed "Ghi điểm vào sổ điểm — dự kiến" block *cần backend*.

**Tests first:** the four situations; dialog numbers; nothing sent on cancel; blocked button + reasons + links; reapply preview → apply gating and messages; export absent before finalise; the "sổ điểm" block sends nothing.

- [ ] Steps: tests → RED → implement → GREEN → commit `feat(grading): finalize page and reapply prices`.

## Task 8: Delete the old screens, prune what nothing imports

**Files:** delete `app/teacher/grading/matrix/**`, `_components/{ConfidenceTiles,ReadinessStrip,AnomalyPanel,ReviewWorkspace,SessionRubricCard,NotBuiltYetPanel,FinalizeGradesButton,GradingReferenceDialog}.tsx` (+tests). Prune `lib/grading-triage.ts` to what still has importers (`HIGH_CONFIDENCE`, `pointsForVerdict`, `isMakeupSubmission`), and delete `lib/grading-groups.ts` after moving the CSV export to `stateOf`/`STATE_LABEL` (also fixes `audit_pending` being labelled "Đang chấm" in the CSV). Prune `lib/api/grading.ts` and `hooks/useGrading.ts` of wrappers with no caller **except** those `AdvocatePanel`/`CriterionCard`/the dossier still use. Check `nav-config` and `/teacher/grading/matrix` links.

- [ ] Steps: `grep` import graph before → delete → `tsc` → fix → grep after (ledger the list) → full grading tests → commit `refactor(grading): remove the matrix and the old session screen`.

## Task 9: Regression, real-API smoke, final review, PR

- [ ] `pnpm --filter web test`, `tsc --noEmit` (only the known `read-workbook.test.ts` noise), `lint`, `build` (new route `/teacher/grading/finalize` present, `/teacher/grading/matrix` gone).
- [ ] Smoke with the built API (`.env.test`, seeded teacher, local containers): `GET grading-results`, `GET grading-progress`, `GET grading-readiness`, `GET investigation` for each seeded result, `POST reapply-prices/preview` on a not-finalised session (expect the 409 message the UI shows) and on a finalised one if one can be produced, `POST finalize-grades` blocked-message on the seeded session; compare shapes with `GradingProgress`, `ReapplyPlan`.
- [ ] Final independent whole-branch review (code-reviewer), sort findings, fix Critical/Important with RED→GREEN, ledger the rest.
- [ ] Open the PR (no merge), report rulings and deferred minors; ask the user to review before merge.

## Execution note

Inline in this session on `feat/grading-ui-rebuild`. Plans A and B are done and reviewed; the whole-branch review runs once after this plan.
