# UI acceptance — Bảng lỗi theo rubric (2026-10-07 mock-up)

Branch: `feature/rules-summary-copy`. Plan B tasks B1–B12 committed. Manual walkthrough of mock-up states 1–13 is **deferred** (same blockers as `2026-10-08-rules-by-rubric.md`: no grading model keys / sandbox for live seed data; Playwright MCP not driven this session).

## Automated pass (B13 Step 1)

| Check | Result |
|---|---|
| `vitest` `src/app/teacher/rules` | **180/180** pass |
| `vitest` grading + `useRulesLink` + exam-sessions | **414/414** pass |
| `vitest` whole `apps/web` | **1328 pass / 6 fail** — failures only in `admin/accounts/page.test.tsx` (`useRouter` not mocked; pre-existing, outside Plan B) |
| `tsc --noEmit` | 3 errors in `roster-screen.tsx` / `read-workbook.test.ts` — pre-existing, outside Plan B |
| `eslint .` / `pnpm build` | fail on `admin/course-sections` (missing `react-hooks/exhaustive-deps` rule def) + unused imports in `submissions/page.tsx` — pre-existing |
| `pnpm check:cycles` | **0** cycles (api + agent) |
| Leftover old names (`CeilingCard`, `PriceSheet`, `MissingRulesPanel`, `lib/rule-form`, `rules-filter`, `useRules()`) | **none** in product code |
| Old API paths `/rules/preview`, `/rules/{id}/price` | **none** in web/shared |

## Mock-up states 1–13

| # | State (mock-up) | How reached in the product | Matches? | Difference / follow-up |
|---|---|---|---|---|
| 1 | Cần làm tiếp | rubric with unpriced error, empty criterion, proposals | deferred | needs live seed / UI e2e |
| 2 | Sẵn sàng | every criterion covered and priced | deferred | |
| 3 | Rubric mới (trống) | create blank rubric | deferred | covered by unit: ReadinessBanner + page tests |
| 4 | Chưa có rubric nào | fresh teacher | deferred | covered by Onboarding + page tests |
| 5 | Thêm lỗi | "Thêm lỗi vào …" | deferred | covered by AddErrorDrawer tests |
| 6 | Lỗi AI đề xuất | proposals tab | deferred | covered by ProposalsTab tests |
| 7 | Thư viện lỗi | library tab | deferred | covered by LibraryTab tests |
| 8 | Tạo rubric từ rubric cũ | copy-from source | deferred | covered by RubricDialog create tests |
| 9 | Sửa điểm trừ | click deduction | deferred | covered by PricePopover tests |
| 10 | Sửa lỗi dùng chung | ⋯ → Sửa | deferred | covered by EditErrorDrawer tests |
| 11 | Nhiều rubric (≥ 5) | picker closed | deferred | covered by RubricSwitcher tests |
| 12 | Nhiều rubric — đang tìm | picker open | deferred | covered by RubricSwitcher tests |
| 13 | Nhiều rubric — lọc học kỳ | semester filter | deferred | covered by RubricSwitcher + page tests |

Hand checks (a)–(f) from the plan: **not run** this session (no browser drive against seeded stack).

## Hand-off

- Plan A (API A0–A11) and Plan B (web B1–B12) both on this branch; no separate worktree.
- Plan A rehearsal gate: `docs/rehearsals/2026-10-08-rules-by-rubric.md` (blocked local).
- Q1/Q2 locked before implementation (Q1: D9 — no creation of three "máy chưa đo được" templates; Q2: mock-up defaults `MANY` / `RECENT_SHOWN` in `lib/rubric-board.ts`).
- Deliberately **not** changed: grading-screen link/body copy still says "giá/luật" (`CaseFlagsBanner`, `LeverageLine`, `ReapplyPricesPanel`, `ErrorList`, `RubricRow`); Bảng lỗi uses "điểm trừ/lỗi". Spec 5.8 only required `?rubric=` on those links (B12). Vocabulary pass over grading screens is a separate task if wanted.
- Do **not** push or open a PR from this session.
