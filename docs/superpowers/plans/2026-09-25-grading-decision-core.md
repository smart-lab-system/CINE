# Bước 3a — Lõi quyết định: nguồn gốc lỗi, trần theo nguồn gốc, sàn, tự quyết — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biến một `InvestigationResult` của bước 2 thành một QUYẾT ĐỊNH chấm điểm — lỗi mang nguồn gốc, điểm do code tính, sàn bằng chứng, luật chống mâu thuẫn, và đúng một công thức tự quyết — bằng một hàm thuần, rồi đo nó bằng runner eval.

**Architecture:** Một module mới, thuần, không DB, không model, không sandbox: `apps/api/src/grading/decision/`. `investigate()` của bước 2 vẫn là người điều tra; `decide()` là người phán, chạy SAU nó trên kết quả đã lưu. Vì thuần, cùng một hàm dùng được cho lượt chấm đầu, cho lượt tính lại khi đổi giá (T-TIER-1/2), và cho runner eval. Nối vào pipeline chấm thật có DB là plan 3d, không phải plan này.

**Tech Stack:** NestJS 10 / TypeScript 5.9, Jest 29 (ts-jest, type-check), zod 3. Không thêm dependency.

**Spec:** `docs/superpowers/specs/2026-09-20-grading-agent-investigator-design.md` — §0.3, §4.1–§4.5, §9 mục 3, §10 (các mã test dưới), §12.3, §15.1 dòng bước 3, §15.2. Plan bước 2: `docs/superpowers/plans/2026-09-24-grading-investigator-loop.md`. Ledger bước 2: `.superpowers/sdd/2026-09-24-grading-investigator-loop/progress.md`.

**Đầu vào:** PR #45 (bước 2) — chưa merge. Plan này chạy trên một nhánh tách TỪ `feature/grading-investigator`, không từ `main`.

---

## Bước 3 được chia thành sáu plan — plan này là 3a

§9 mục 3 gộp năm khối độc lập (lõi quyết định; mô hình dữ liệu §14 + merge nhánh plan-1; bảng lỗi có uuid + bảng giá có phiên bản; nối vào pipeline thật + chấm lại + dựng thước + kiểm mẫu; bảy màn UI). Một plan cho cả năm là một plan không ai duyệt nổi. Mỗi plan dưới đây tự cho ra phần mềm chạy được, test được.

| Plan | Phạm vi | Mã test (§15.1) | Phụ thuộc |
|---|---|---|---|
| **3a — lõi quyết định (plan này)** | §4.1 nguồn gốc + `predicate` do code quyết, §4.2 trần + confidence + công thức tự quyết, §4.3, §4.4 sàn, eval đo tự quyết | `T-SRC-1/2`, `T-POL-2/3`, `T-FLOOR-1…6`, `T-CONF-1`, `T-AUTO-1`, `T-EMPTY-1`, `T-COMPILE-1`, `T-TIER-1/2` (phần thuần) | PR #45 |
| 3b — mô hình dữ liệu §14 + merge phần còn lại của plan-1 | Bảng, trigger, máy trạng thái §14; viết lại migration của plan-1 | `T-MERGE-1`, `T-IMM-1`, `T-LIFE-1`, `T-FREEZE-3`, `T-ARCH-1`, `T-LEGACY-1`; sửa `T-FREEZE-1`, ca 409 của `session-rubric.e2e-spec.ts`, `T-ATT-2` | 3a không cần; 3c–3e cần |
| 3c — bảng lỗi uuid + bảng giá phiên bản + áp lại luật (§2.1, §2.2) | `error_rule` có uuid, phiên bản bảng giá, ghim lúc chốt, đánh dấu *"không có luật trừ"*, tính lại không gọi model | `T-RULE-1…3`, `T-RULEREV-1`, `T-KEY-1`, `T-VER-1/2`, `T-EXC-1/2`, `T-PIN-1`, `T-FIN-1/2`, `T-POL-1/4…8`, `T-TIER-1/2` (phần DB), `T-WAIVER-1` | 3a, 3b |
| 3d — nối vào pipeline chấm thật | `gradeOne` → `investigate()` + `decide()` cho bài code; chấm lại bài chưa có điểm (§2.3); dựng thước khi thiếu gói test (§2.1) | `T-PIPE-1`, `T-FAIR-1`, `T-ESSAY-1`, `T-REVIEW-1`, `T-REGRADE-1…5`, `T-RULER-1…4/7`, `T-NORM-1/3` | 3a, 3b, 3c |
| 3e — kiểm mẫu (§8.1) | Rút mẫu nhóm đã tự quyết, hạ bậc khi mẫu sai | `T-SAMP-1…5`, `T-AUDIT-1/2`, `T-DEMOTE-1` | 3d |
| 3f — UI của bước 3 | Bảng lỗi, chuẩn bị chấm, đang chấm, danh sách bài, hồ sơ một bài, kiểm mẫu, chốt điểm | `T-UI-1…21` | các API của 3c–3e |

**Việc riêng, nhỏ, làm lúc nào cũng được:** Advocate (`openai-compatible-advocate.provider.ts`) trên các route không ép `json_schema` — prompt không tả `evidence` là mảng, không tả `suggestedVerdicts`/`injectionAttempt`; `required` của schema thiếu `quote` (strict mode có thể trả 400); Advocate mù rubric mà bị bắt trả `criterionId`. Ghi ở ledger bước 2, review lần 5. Đường chấm thật hôm nay GỌI Advocate, nên đây là lỗi production, không chờ bước 6.

---

## Câu hỏi chủ đồ án phải duyệt trước khi chạy plan (có khuyến nghị)

Các task dưới viết theo **khuyến nghị**. Chọn khác thì sửa đúng task ghi bên cạnh.

| # | Câu hỏi | Khuyến nghị | Task |
|---|---|---|---|
| **Q1** | Luật có `predicate` mà công cụ đo chưa có — `complexity_exceeds_required` (cần `run_scaled`, bước 4), `calls_function` và `no_recursion` (cần `ast_query`, bước 5). §4.1 luật 2 cấm model đề xuất luật có `predicate`, nhưng viết với giả định công cụ đã có. | **(A)** Cho model phán đoán những luật này như luật không `predicate` (nguồn gốc `llm_with_tools`/`llm_only`, để điểm không mất lỗi M5), **nhưng** tiêu chí chứa chúng tính là **chưa chạm tới** → không tự quyết, gắn cờ nêu đích danh. **Hệ quả phải biết trước:** cả hai đề trong fixture có tiêu chí `hieu_nang` chỉ gồm một luật độ phức tạp, nên **tỉ lệ tự quyết của 3a trên fixture hiện có ≈ 0** tới bước 4. (B) Coi phán đoán của model là đã chạm tới → tự quyết được ngay, nhưng đó là mở rộng spec: *"không tìm thấy lỗi"* ≠ *"đã kiểm và không có lỗi"* (§4.2). | 3, 5 |
| **Q2** | *"Tiêu chí được chạm tới"* (T-FLOOR-4) — spec không định nghĩa. | Tiêu chí C chạm tới ⇔ MỌI luật trỏ vào C đều đã được xét: luật `predicate` đo được → kết quả đo là `present` hay `absent` (không phải `unmeasured`); luật không `predicate` → cuộc điều tra có ít nhất một `read_file` thành công trên file `bai-nop/…`. Tiêu chí không luật nào trỏ vào là việc của T-FLOOR-6, không phải ở đây. | 5 |
| **Q3** | Nhóm test mà ca không đạt chỉ là `timeout`. §4.5: một ca hết giờ phải chạy lại ít nhất một lần trước khi thành bằng chứng; tách chậm với treo là bước 4. | Kết quả đo = `unmeasured` (không phải `present`), lý do *"hết giờ — chưa tách được chậm với treo (§4.5)"*. Tiêu chí đó chưa chạm tới → gắn cờ. Không trừ, không tự quyết. | 2 |
| **Q4** | T-FLOOR-1 (*"cạn ngân sách với 0 phát hiện → ungradable"*) viết tuyệt đối. Ca biên: bài đúng, gói test đã chạy đủ và đều pass, nhưng agent chạm trần trước khi tự kết luận. | Theo đúng chữ spec: `ungradable` lớp `system`. "Phát hiện" gồm cả lỗi do code quyết — nên bài có một nhóm test fail thì KHÔNG rơi vào đây. | 5 |
| **Q5** | Cờ của cuộc điều tra có chặn tự quyết không: `injection_suspected`, `replay_mismatch`, `replay_unverified`, `evidence_rejected`, `budget_exhausted`. | Cả năm **chặn** trong 3a, mỗi cờ thành một điều kiện của cả bài nêu đích danh. Nới bằng số liệu của 3e (kiểm mẫu), không nới bằng đoán. | 5 |
| **Q6** | Bảng lỗi model đọc (`bang-loi.md`). §4.1 luật 2: model không đề xuất luật máy kiểm được. | Luật đo được bằng code hiện ra trong mục riêng *"Luật máy kiểm — KHÔNG đề xuất, hệ thống tự quyết"*, kèm nhóm test; luật Q1 hiện ra trong mục thường, kèm ghi chú *"máy chưa đo được — bạn phán đoán"*. Đề xuất của model cho luật máy kiểm bị bỏ qua và GHI LẠI (không lặng lẽ). | 3, 6 |
| **Q7** | Định danh luật: spec dùng uuid `ruleId`, bảng lỗi có uuid là plan 3c. | 3a dùng `ruleKey` làm định danh, đúng như runner eval và fixture hôm nay. 3c thêm uuid và ánh xạ ở tầng DB; `decide()` không đổi chữ ký. | 1 |

---

## Global Constraints

- **Model không bao giờ đặt `deduction`.** Nó chỉ kết luận lỗi có mặt hay không; mức trừ đọc từ bảng lỗi (§4.1).
- **`ruleId` khớp CHÍNH XÁC, không khớp ngữ nghĩa.** Luật không có trong bảng → lỗi bị LOẠI, không đi tìm luật gần nhất (§4.1 luật 1 — bước 2 đã làm, T-AG-2).
- **Luật có `predicate` thì model KHÔNG được đề xuất nó** — code quyết từ kết quả công cụ; đề xuất của model bị bỏ qua và ghi lại (§4.1 luật 2; ngoại lệ tạm theo Q1).
- **Luật không có `predicate` mặc định tụt xuống `llm_with_tools`**, kể cả khi bằng chứng là một lời gọi công cụ chắc chắn (§4.1 luật 3). Bằng chứng chỉ gồm lời gọi đọc (`read_file`, `list_files`) → `llm_only`.
- **Trần confidence theo nguồn gốc:** `deterministic` **1,0** · `llm_with_tools` **0,85** · `llm_only` **0,5 — thấp hơn nữa nếu trần của bậc model thấp hơn**; không lấy trần bậc model làm trần của hai nguồn còn lại (§4.2).
- **Confidence của cả bài là trung bình có trọng số theo mức trừ**, không phải giá trị nhỏ nhất. Bài không lỗi nào → **1,0 khi mọi điều kiện độ phủ của sàn §4.4 đều qua** (§4.2, T-CONF-1).
- **Luật chưa có giá chắc chắn thì bài dính nó không được tự duyệt**, dù nguồn gốc là `deterministic` — gắn cờ ĐÚNG lỗi đó, không gắn cờ cả bài (§4.2, §0.3).
- **Tự quyết là MỘT công thức ở MỘT hàm** (§4.2): bài code ∧ qua sàn §4.4 ∧ §4.3 không bắn ∧ mọi lỗi được tính đều có giá ∧ confidence ≥ θ. Điều kiện phản biện chưa có hiệu lực tới bước 6; `runAdvocate()` cũ **không** được dùng làm điều kiện.
- **θ = 0,85, đọc từ env, giữ nguyên hằng số hôm nay** (`AUTO_APPROVE_CONFIDENCE`). Env rỗng hay không phải số trong (0, 1] → mặc định **kèm cảnh báo**.
- **§4.3:** mọi nhóm test `passed === 0` → `flagged_for_review`, trần **0,5**, kèm lý do. **Không tự động cho 0 điểm.**
- **Sàn đứng TRƯỚC trần** (§4.4). Dưới sàn → `ungradable`, không có con số nào cả. `ungradable_class` có **đúng hai** giá trị: `system`, `submission`.
- **T-COMPILE-1:** bài không biên dịch → gói test tính là **đã chạy**, mọi ca `compile_error`, gắn cờ theo §4.3, **không** `ungradable`.
- **Không gộp §4.3 vào sàn §4.4** trong bất kỳ đợt dọn dẹp nào: hai luật bắt hai ca khác nhau (§4.5).
- **Số học điểm bằng số nguyên phần trăm điểm** (`hundredths`), không qua float (§13.2). Confidence là số thực trong [0, 1].
- **`investigate()` và `decide()` thuần** (§12.5): không DB, không gọi model, không gọi sandbox. `decide()` còn không nhận cổng nào — chữ ký là bằng chứng.
- **Eval không nằm trong `pnpm test`** (§12.5 luật 1). Lượt đo thật tốn tiền và cần chủ đồ án duyệt.
- **Môi trường phiên worktree:** harness chặn lệnh có chữ `eval`, `cd` trước git, script qua biến, heredoc có `${}`. Dùng `x.sh` / `jt.sh` với `@E@`, hoặc ghi script ra file rồi chạy. Python: `python3`, `PYTHONIOENCODING=utf-8`. **Không** dùng Write/Edit để ghi escape `\uXXXX` vào mã nguồn — dựng bằng `String.fromCharCode` hay bằng Python với `chr(92)`, rồi quét byte.

## Review Focus

1. **Nhóm của `predicate` không có trong gói test** (gõ `co-ban` thay `co_ban`) → kết quả đo phải là `unmeasured` nêu lý do, **không** phải `absent` — `absent` là trọn điểm im lặng. Test ở Task 2.
2. **`run_tests` chỉ chạy một nhóm** → `predicate` của nhóm KHÁC không được coi là `absent` vì "không thấy ca nào fail". Test ở Task 2.
3. **Model đề xuất đúng luật mà code cũng tìm ra** → trừ MỘT lần, nguồn gốc `deterministic`, đề xuất của model vào danh sách bị bỏ qua. Test ở Task 3.
4. **Tiêu chí có trần 0** → không đòi luật, không chặn tự quyết (T-FLOOR-6 chỉ nói *"tiêu chí có trần"*). Test ở Task 5.
5. **Một ca vừa pass vừa fail giữa hai lần `run_tests`** (bài không tất định) → `unmeasured` *"kết quả không ổn định"*, không phải `present` hay `absent`. Test ở Task 2.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| Create `apps/api/src/grading/decision/types.ts` | `RulePredicate`, `ErrorRule`, `VerdictSource`, `DiagnosedError`, `PredicateOutcome`, `Diagnosis`, `DecisionInput`, `Decision`, mã cờ |
| Create `apps/api/src/grading/decision/predicates.ts` | `isMachineChecked()`, `evaluatePredicate()` — `test_group_failed` từ `run_tests` đã lưu |
| Create `apps/api/src/grading/decision/diagnose.ts` | `diagnose()` — lỗi do code quyết + lỗi model đề xuất, nguồn gốc, danh sách bị bỏ qua |
| Create `apps/api/src/grading/decision/confidence.ts` | `SOURCE_CAP`, `capOf()`, `caseConfidence()` |
| Create `apps/api/src/grading/decision/threshold.ts` | `readAutoThreshold(env)` — θ từ env, mặc định `AUTO_APPROVE_CONFIDENCE` kèm cảnh báo |
| Create `apps/api/src/grading/decision/decide.ts` | `decide()` — sàn, §4.3, giá, confidence, MỘT công thức tự quyết |
| Create `apps/api/src/grading/decision/testing/result.ts` | Builder `InvestigationResult` cho test đơn vị |
| Create `apps/api/src/grading/decision/*.spec.ts`, `decision.import-scan.spec.ts` | Test |
| Modify `apps/api/src/grading/investigator/protocol.ts` | Nhánh `final` bỏ qua `calls` (minor bước 2) |
| Modify `apps/api/src/grading/investigator/types.ts` | `RuleEntry.checkedBy` thay `hasPredicate` |
| Modify `apps/api/src/grading/investigator/workspace.ts` | `renderRulesFile()` tách luật máy kiểm |
| Modify `apps/api/src/grading/investigator/model-pool.ts` | `ModelTier.ceiling` |
| Modify `apps/api/src/eval/manifest.schema.ts` | `waivedCriteria` (tuỳ chọn, mặc định `[]`) |
| Modify `apps/api/src/eval/context-from-fixture.ts` | `checkedBy`; `errorRulesOf(de)` |
| Modify `apps/api/src/eval/investigator-runner.ts` | Chạy `decide()` sau `investigate()` |
| Modify `apps/api/src/eval/runner-core.ts` | `CaseRecord.deductionBySource`; `RunSummary.autoDecision`, `machineDeductionShare` |
| Modify `apps/api/src/eval/cli.ts`, `compare.ts` | In tự quyết của investigator; gỡ `n/a (Q4)` |

---

### Task 0: Nhánh và workspace

**Files:** không có file code.

- [ ] **Step 1: Worktree mới từ nhánh bước 2**

PR #45 chưa merge, nên tách từ `feature/grading-investigator`:

```bash
git fetch origin
git worktree add ".claude/worktrees/grading-decision-core" -b feature/grading-decision-core origin/feature/grading-investigator
```

Chạy từ thư mục gốc repo (cây chính). Khi PR #45 merge vào `main`, rebase nhánh này lên `main` trước khi mở PR của nó.

- [ ] **Step 2: Workspace và wrapper**

Tạo `.superpowers/sdd/2026-09-25-grading-decision-core/` trong worktree mới; chép `jt.sh`, `x.sh`, `wait-worker.sh`, `wait-early.sh` từ workspace bước 2 (`.superpowers/sdd/2026-09-24-grading-investigator-loop/`). Chép `apps/api/.env` của worktree bước 2 (đã có hai model `cnb/glm-5.3`, `spd/glm-5.3-flash`; KHÔNG có `SANDBOX_*REDIS_URL`). Tạo `progress.md` rỗng.

- [ ] **Step 3: Kiểm nền xanh**

```bash
pnpm install
bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh
```

Expected: `Tests: 7 skipped, 890 passed, 897 total` (số của PR #45). Docker phải chạy — không thì vài spec Docker không được đếm (đã gặp ở bước 2).

---

### Task 1: Kiểu của lõi quyết định + minor còn lại của bước 2

**Files:**
- Create: `apps/api/src/grading/decision/types.ts`
- Modify: `apps/api/src/grading/investigator/protocol.ts` (nhánh `final` của `replySchema`)
- Test: `apps/api/src/grading/investigator/protocol.spec.ts`

**Interfaces:**
- Produces: mọi kiểu dưới — Task 2–7 dùng nguyên.

- [ ] **Step 1: Test đỏ cho minor của bước 2**

Review `b0bd340` (ledger bước 2): lượt `final` kèm `calls` thừa sai khuôn bị bỏ cả lượt dù verdict hợp lệ — `investigate()` không đọc `calls` của lượt kết luận. Thêm vào `protocol.spec.ts`, trong `describe('giao thức một lượt')`:

```ts
  it('lượt kết luận kèm calls thừa SAI KHUÔN vẫn đọc được — calls của lượt kết luận không ai dùng', () => {
    const reply = parseReply(
      '{"action":"final","calls":[{"tool":"run"}],"verdict":{"errors":[],"missingRules":[],' +
        '"injectionAttempt":{"detected":false,"excerpt":null}}}',
    );
    expect(reply?.action).toBe('final');
  });
```

- [ ] **Step 2: Chạy, xác nhận đỏ**

Run: `bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh src/grading/investigator/protocol`
Expected: FAIL ở test mới (`parseReply` trả `null`).

- [ ] **Step 3: Sửa**

Trong `protocol.ts`, nhánh `final` của `replySchema`:

```ts
  // `calls` của lượt kết luận bị bỏ qua — model hay trả kèm một mảng thừa, và một phần tử sai
  // khuôn trong mảng thừa đó không được vứt một verdict hợp lệ (review b0bd340).
  z.object({ action: z.literal('final'), calls: z.array(z.unknown()), verdict: verdictSchema }),
```

`ModelReply` đổi kiểu `calls` của nhánh `final` thành `unknown[]` — `investigate.ts` không đọc nó ở nhánh này (kiểm: `grep -n "reply.calls" apps/api/src/grading/investigator/investigate.ts` chỉ ra dòng của nhánh `call`).

- [ ] **Step 4: Kiểu của lõi quyết định**

Create `apps/api/src/grading/decision/types.ts`:

```ts
import { InvestigationResult } from '../investigator/types';

/**
 * Đúng bốn mẫu điều kiện của spec UI mục 3.2 (§4.1). Không có mẫu thứ năm nào ngoài code:
 * mỗi mẫu được lập trình sẵn cho từng ngôn ngữ (rủi ro 10). Cùng hình dạng với
 * `eval/manifest.schema.ts` — module này không import từ `eval/`.
 */
export type RulePredicate =
  | { kind: 'test_group_failed'; group: string }
  | { kind: 'calls_function'; name: string }
  | { kind: 'complexity_exceeds_required' }
  | { kind: 'no_recursion'; functionName?: string };

/**
 * Một luật của bảng lỗi, đúng những gì `decide()` cần (§4.1). Định danh là `ruleKey` cho tới
 * plan 3c (bảng lỗi có uuid) — Q7.
 */
export interface ErrorRule {
  ruleKey: string;
  criterionKey: string;
  /** null = chưa có giá (§2.1). Số nguyên phần trăm điểm (§13.2). */
  deductionHundredths: number | null;
  predicate: RulePredicate | null;
}

export type VerdictSource = 'deterministic' | 'llm_with_tools' | 'llm_only';

export interface DiagnosedError {
  ruleKey: string;
  criterionKey: string;
  /** Lấy TỪ BẢNG, không do model đặt (§4.1). */
  deductionHundredths: number | null;
  source: VerdictSource;
  toolCallIds: string[];
}

export interface PredicateOutcome {
  /** `unmeasured`: không kết luận được — không bao giờ được đọc như `absent`. */
  state: 'present' | 'absent' | 'unmeasured';
  toolCallIds: string[];
  reason: string | null;
}

export interface Diagnosis {
  errors: DiagnosedError[];
  /** Đề xuất của model bị bỏ qua — luật máy kiểm được (§4.1 luật 2). Ghi, không lặng lẽ. */
  ignored: { ruleKey: string; reason: 'machine_checked_rule' }[];
  /** Kết quả đo của mọi luật có `predicate`, kể cả `absent` và `unmeasured`. */
  measurements: { ruleKey: string; criterionKey: string; outcome: PredicateOutcome }[];
}

/** Điều kiện của CẢ BÀI trượt → gắn cờ cả bài, nêu đích danh (§0.3). */
export type CaseFlagCode =
  | 'criterion_untouched'
  | 'criterion_without_rules'
  | 'nothing_passed'
  | 'investigation_flag'
  | 'low_confidence'
  | 'not_code_pipeline';

export interface CaseFlag {
  code: CaseFlagCode;
  detail: string;
}

/** Điều kiện gắn với MỘT lỗi trượt → gắn cờ đúng lỗi đó (§0.3, §6.3). */
export interface ErrorFlag {
  ruleKey: string;
  code: 'unpriced';
}

export interface DecisionInput {
  pipeline: 'investigator' | 'one_shot';
  result: InvestigationResult;
  bundle: { cases: { name: string; group: string }[] };
  rubric: { key: string; maxHundredths: number }[];
  rules: ErrorRule[];
  /** Tiêu chí giảng viên đánh dấu *"không có luật trừ"* (§4.2, T-FLOOR-6). */
  waivedCriteria: string[];
  /** Trần thấp nhất của các bậc model đã trả lời — chỉ kéo được `llm_only` xuống (§4.2). */
  modelCeiling: number;
  theta: number;
}

export interface Decision {
  /** `auto` = tự quyết; `flagged` = về giảng viên; `ungradable` = dưới sàn, không có điểm. */
  outcome: 'auto' | 'flagged' | 'ungradable';
  ungradable: { class: 'system' | 'submission'; reason: string } | null;
  scoreHundredths: number | null;
  maxHundredths: number;
  errors: DiagnosedError[];
  confidence: number | null;
  caseFlags: CaseFlag[];
  errorFlags: ErrorFlag[];
  diagnosis: Diagnosis | null;
}
```

- [ ] **Step 5: Chạy, xác nhận xanh; build**

Run: `bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh src/grading/investigator/` rồi `pnpm --filter api build`
Expected: PASS; build OK (file kiểu mới chưa ai dùng — build bắt lỗi cú pháp).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grading/decision/types.ts apps/api/src/grading/investigator/protocol.ts apps/api/src/grading/investigator/protocol.spec.ts
git commit -m "feat(decision): kiểu của lõi quyết định bước 3a; lượt final không vứt verdict vì calls thừa sai khuôn"
```

---

### Task 2: Đánh giá `predicate` bằng code — `test_group_failed`

**Files:**
- Create: `apps/api/src/grading/decision/predicates.ts`
- Create: `apps/api/src/grading/decision/testing/result.ts`
- Test: `apps/api/src/grading/decision/predicates.spec.ts`

**Interfaces:**
- Consumes: `RulePredicate`, `PredicateOutcome` (Task 1); `ToolCall`, `StructuredResult` (`investigator/types.ts`).
- Produces:
  - `isMachineChecked(p: RulePredicate | null): boolean` — `true` chỉ khi code đo được `p` ở bước này.
  - `evaluatePredicate(p: RulePredicate, bundle: { cases: { name: string; group: string }[] }, toolCalls: ToolCall[], structured: Record<string, StructuredResult>): PredicateOutcome`
  - `testing/result.ts`: `runTestsCall(id, group, cases, opts?)`, `readFileCall(id, path)`, `resultWith(over)`.

- [ ] **Step 1: Builder cho test**

Create `apps/api/src/grading/decision/testing/result.ts`:

```ts
import { DEFAULT_BUDGET } from '../../investigator/budget';
import { InvestigationResult, StopReason, StructuredResult, TestCaseResult, ToolCall } from '../../investigator/types';

type Case = Pick<TestCaseResult, 'name' | 'group' | 'status'>;

/** Một lời gọi `run_tests` thành công và phần có cấu trúc của nó. */
export function runTestsCall(
  id: string,
  group: string | null,
  cases: Case[],
  opts: { compileOk?: boolean; aborted?: boolean } = {},
): { call: ToolCall; structured: StructuredResult } {
  return {
    call: {
      id, tool: 'run_tests', args: { group }, status: 'ok', output: '', structuredRef: id,
      startedAt: '2026-09-25T00:00:00.000Z', wallMs: 10, injectionSuspected: false,
    },
    structured: {
      kind: 'run_tests',
      compile: { ok: opts.compileOk ?? true, log: opts.compileOk === false ? 'lỗi' : '', ms: 5 },
      cases: opts.compileOk === false ? [] : cases.map((c) => ({ ...c, diff: null, ms: 3 })),
      aborted: opts.aborted ?? false,
      host: null,
    },
  };
}

export function readFileCall(id: string, path: string): ToolCall {
  return {
    id, tool: 'read_file', args: { path, fromLine: null, toLine: null }, status: 'ok', output: '', structuredRef: null,
    startedAt: '2026-09-25T00:00:00.000Z', wallMs: 1, injectionSuspected: false,
  };
}

/** Một kết quả điều tra kết luận được, dựng từ các lời gọi đã cho. */
export function resultWith(over: {
  calls?: ({ call: ToolCall; structured?: StructuredResult } | ToolCall)[];
  errors?: { ruleKey: string; toolCallIds: string[] }[];
  kind?: InvestigationResult['kind'];
  ungradable?: InvestigationResult['ungradable'];
  flags?: InvestigationResult['flags'];
  stopReason?: StopReason;
  confidenceCap?: number;
} = {}): InvestigationResult {
  const toolCalls: ToolCall[] = [];
  const structuredResults: Record<string, StructuredResult> = {};
  for (const x of over.calls ?? []) {
    if ('call' in x) {
      toolCalls.push(x.call);
      if (x.structured) structuredResults[x.call.id] = x.structured;
    } else toolCalls.push(x);
  }
  const kind = over.kind ?? 'verdict';
  return {
    kind,
    verdict: kind === 'verdict'
      ? { errors: (over.errors ?? []).map((e) => ({ ...e, note: null })), missingRules: [], injectionAttempt: { detected: false, excerpt: null } }
      : null,
    rejected: [],
    ungradable: over.ungradable ?? null,
    flags: over.flags ?? [],
    confidenceCap: over.confidenceCap ?? 1,
    replay: null,
    summary: '',
    investigation: {
      toolCalls, structuredResults, complexity: null, minimalFailingCase: null, approach: null, peerCluster: null,
      budget: { toolCalls: toolCalls.length, wallMs: 0, tokens: 0, rounds: 1, forcedFinal: false, stopReason: over.stopReason ?? 'verdict', limits: DEFAULT_BUDGET },
      modelsUsed: ['m'], tierRotations: [],
    },
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}
```

- [ ] **Step 2: Test đỏ**

Create `apps/api/src/grading/decision/predicates.spec.ts`:

```ts
import { evaluatePredicate, isMachineChecked } from './predicates';
import { runTestsCall } from './testing/result';

const BUNDLE = {
  cases: [
    { name: 'cb1', group: 'co_ban' }, { name: 'cb2', group: 'co_ban' },
    { name: 'tl1', group: 'trung_lap' },
  ],
};
const P = { kind: 'test_group_failed' as const, group: 'co_ban' };
const run = (...xs: ReturnType<typeof runTestsCall>[]) => ({
  calls: xs.map((x) => x.call),
  structured: Object.fromEntries(xs.map((x) => [x.call.id, x.structured])),
});
const evalOn = (p: typeof P, r: ReturnType<typeof run>) => evaluatePredicate(p, BUNDLE, r.calls, r.structured);

describe('evaluatePredicate — test_group_failed (T-POL-3: lỗi phát hiện được bằng test → verdict lấy từ test)', () => {
  it('một ca của nhóm fail → present, bằng chứng là đúng lời gọi đó', () => {
    const r = run(runTestsCall('tc-1', null, [
      { name: 'cb1', group: 'co_ban', status: 'pass' }, { name: 'cb2', group: 'co_ban', status: 'fail' },
      { name: 'tl1', group: 'trung_lap', status: 'pass' },
    ]));
    expect(evalOn(P, r)).toEqual({ state: 'present', toolCallIds: ['tc-1'], reason: null });
  });

  it('mọi ca của nhóm đã chạy và pass → absent', () => {
    const r = run(runTestsCall('tc-1', 'co_ban', [
      { name: 'cb1', group: 'co_ban', status: 'pass' }, { name: 'cb2', group: 'co_ban', status: 'pass' },
    ]));
    expect(evalOn(P, r).state).toBe('absent');
  });

  it('runtime_crash, recursion_limit, output_limit đều là fail của nhóm', () => {
    for (const status of ['runtime_crash', 'recursion_limit', 'output_limit'] as const) {
      const r = run(runTestsCall('tc-1', 'co_ban', [
        { name: 'cb1', group: 'co_ban', status: 'pass' }, { name: 'cb2', group: 'co_ban', status },
      ]));
      expect(evalOn(P, r).state).toBe('present');
    }
  });

  it('T-COMPILE-1 — bài không biên dịch: run_tests phủ nhóm đó → present (mọi ca compile_error)', () => {
    const r = run(runTestsCall('tc-1', null, [], { compileOk: false }));
    expect(evalOn(P, r)).toEqual({ state: 'present', toolCallIds: ['tc-1'], reason: 'bài không biên dịch' });
    // Lời gọi chỉ cho nhóm KHÁC không nói gì về nhóm này.
    const other = run(runTestsCall('tc-1', 'trung_lap', [], { compileOk: false }));
    expect(evalOn(P, other).state).toBe('unmeasured');
  });

  it('Review Focus 1 — nhóm không có trong gói test → unmeasured nêu lý do, KHÔNG phải absent', () => {
    const r = run(runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status: 'pass' }]));
    const out = evalOn({ kind: 'test_group_failed', group: 'co-ban' }, r);
    expect(out.state).toBe('unmeasured');
    expect(out.reason).toMatch(/không có trong gói test/);
  });

  it('Review Focus 2 — run_tests chỉ chạy nhóm khác → nhóm này unmeasured, không phải absent', () => {
    const r = run(runTestsCall('tc-1', 'trung_lap', [{ name: 'tl1', group: 'trung_lap', status: 'pass' }]));
    expect(evalOn(P, r).state).toBe('unmeasured');
  });

  it('chạy dở (aborted) thiếu một ca của nhóm → unmeasured', () => {
    const r = run(runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status: 'pass' }], { aborted: true }));
    expect(evalOn(P, r).state).toBe('unmeasured');
  });

  it('Q3 — ca không đạt chỉ là timeout → unmeasured (§4.5: chưa tách được chậm với treo)', () => {
    const r = run(runTestsCall('tc-1', 'co_ban', [
      { name: 'cb1', group: 'co_ban', status: 'pass' }, { name: 'cb2', group: 'co_ban', status: 'timeout' },
    ]));
    const out = evalOn(P, r);
    expect(out.state).toBe('unmeasured');
    expect(out.reason).toMatch(/hết giờ/);
  });

  it('một ca fail thật cộng một ca timeout → present (ca fail là đủ bằng chứng)', () => {
    const r = run(runTestsCall('tc-1', 'co_ban', [
      { name: 'cb1', group: 'co_ban', status: 'fail' }, { name: 'cb2', group: 'co_ban', status: 'timeout' },
    ]));
    expect(evalOn(P, r).state).toBe('present');
  });

  it('Review Focus 5 — một ca pass ở lần này, fail ở lần khác → unmeasured "không ổn định"', () => {
    const r = run(
      runTestsCall('tc-1', 'co_ban', [{ name: 'cb1', group: 'co_ban', status: 'pass' }, { name: 'cb2', group: 'co_ban', status: 'pass' }]),
      runTestsCall('tc-2', 'co_ban', [{ name: 'cb1', group: 'co_ban', status: 'fail' }, { name: 'cb2', group: 'co_ban', status: 'pass' }]),
    );
    const out = evalOn(P, r);
    expect(out.state).toBe('unmeasured');
    expect(out.reason).toMatch(/không ổn định/);
  });

  it('lời gọi không thành công (unavailable, error) không phải bằng chứng', () => {
    const x = runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status: 'fail' }]);
    const r = { calls: [{ ...x.call, status: 'unavailable' as const }], structured: { 'tc-1': x.structured } };
    expect(evaluatePredicate(P, BUNDLE, r.calls, r.structured).state).toBe('unmeasured');
  });

  it('Q1 — complexity, calls_function, no_recursion: chưa có công cụ ở bước này → unmeasured, nêu công cụ cần', () => {
    const r = run(runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status: 'pass' }]));
    expect(evalOn({ kind: 'complexity_exceeds_required' } as never, r)).toMatchObject({ state: 'unmeasured', reason: expect.stringMatching(/run_scaled/) });
    expect(evalOn({ kind: 'calls_function', name: 'sort' } as never, r)).toMatchObject({ state: 'unmeasured', reason: expect.stringMatching(/ast_query/) });
    expect(isMachineChecked({ kind: 'test_group_failed', group: 'x' })).toBe(true);
    expect(isMachineChecked({ kind: 'complexity_exceeds_required' })).toBe(false);
    expect(isMachineChecked(null)).toBe(false);
  });
});
```

- [ ] **Step 3: Chạy, xác nhận đỏ**

Run: `bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh src/grading/decision/`
Expected: FAIL — `Cannot find module './predicates'`.

- [ ] **Step 4: Cài**

Create `apps/api/src/grading/decision/predicates.ts`:

```ts
import { CaseStatus } from '../../sandbox/contract';
import { StructuredResult, ToolCall } from '../investigator/types';
import { PredicateOutcome, RulePredicate } from './types';

/** Kết cục "không đạt" của một ca. `timeout` KHÔNG ở đây — §4.5, Q3. */
const FAILED: ReadonlySet<CaseStatus> = new Set<CaseStatus>(['fail', 'runtime_crash', 'recursion_limit', 'output_limit']);

/** Công cụ mà mẫu điều kiện cần, cho các mẫu chưa đo được ở bước 3 (Q1). */
const NEEDS: Record<Exclude<RulePredicate['kind'], 'test_group_failed'>, string> = {
  complexity_exceeds_required: 'cần run_scaled (bước 4) — máy chưa đo được',
  calls_function: 'cần ast_query (bước 5) — máy chưa đo được',
  no_recursion: 'cần ast_query (bước 5) — máy chưa đo được',
};

const unmeasured = (reason: string): PredicateOutcome => ({ state: 'unmeasured', toolCallIds: [], reason });

/** Code đo được mẫu này ở bước này — và chỉ khi đó model mới bị cấm đề xuất luật (§4.1 luật 2, Q1). */
export function isMachineChecked(p: RulePredicate | null): boolean {
  return p !== null && p.kind === 'test_group_failed';
}

/**
 * Kết quả đo một `predicate` trên kết quả công cụ ĐÃ LƯU — không chạy gì (§2.2 bậc 2, T-TIER-2).
 * `absent` chỉ khi MỌI ca của nhóm đã có kết quả và đều pass: không thấy ca nào fail không phải
 * là "không có lỗi" (§4.2). Không kết luận được thì `unmeasured`, kèm lý do — không bao giờ đoán.
 */
export function evaluatePredicate(
  p: RulePredicate,
  bundle: { cases: { name: string; group: string }[] },
  toolCalls: ToolCall[],
  structured: Record<string, StructuredResult>,
): PredicateOutcome {
  if (p.kind !== 'test_group_failed') return unmeasured(NEEDS[p.kind]);
  const expected = bundle.cases.filter((c) => c.group === p.group).map((c) => c.name);
  if (expected.length === 0) return unmeasured(`nhóm "${p.group}" không có trong gói test`);

  const compileFailed: string[] = [];
  /** tên ca → mọi kết cục đã thấy, và lời gọi đã thấy nó fail */
  const seen = new Map<string, { statuses: Set<CaseStatus>; failedIn: Set<string> }>();
  for (const t of toolCalls) {
    if (t.tool !== 'run_tests' || t.status !== 'ok' || !t.structuredRef) continue;
    const s = structured[t.structuredRef];
    if (s?.kind !== 'run_tests') continue;
    const scope = typeof t.args.group === 'string' ? t.args.group : null;
    if (s.compile && !s.compile.ok) {
      // T-COMPILE-1: thước ĐÃ đo — mọi ca lời gọi đó yêu cầu là compile_error.
      if (scope === null || scope === p.group) compileFailed.push(t.id);
      continue;
    }
    for (const c of s.cases) {
      if (c.group !== p.group) continue;
      const e = seen.get(c.name) ?? { statuses: new Set<CaseStatus>(), failedIn: new Set<string>() };
      e.statuses.add(c.status);
      if (FAILED.has(c.status)) e.failedIn.add(t.id);
      seen.set(c.name, e);
    }
  }
  if (compileFailed.length > 0) return { state: 'present', toolCallIds: compileFailed, reason: 'bài không biên dịch' };

  const solid = [...seen.values()].filter((e) => e.failedIn.size > 0 && !e.statuses.has('pass'));
  if (solid.length > 0) {
    return { state: 'present', toolCallIds: [...new Set(solid.flatMap((e) => [...e.failedIn]))].sort(), reason: null };
  }
  if ([...seen.values()].some((e) => e.failedIn.size > 0 && e.statuses.has('pass'))) {
    return unmeasured('kết quả không ổn định giữa các lần chạy');
  }
  if ([...seen.values()].some((e) => e.statuses.has('timeout'))) {
    return unmeasured('hết giờ — chưa tách được chậm với treo (§4.5)');
  }
  if (expected.every((name) => seen.get(name)?.statuses.has('pass'))) {
    const ids = toolCalls.filter((t) => t.tool === 'run_tests' && t.status === 'ok').map((t) => t.id);
    return { state: 'absent', toolCallIds: ids, reason: null };
  }
  return unmeasured('chưa chạy đủ các ca của nhóm');
}
```

- [ ] **Step 5: Chạy, xác nhận xanh**

Run: `bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh src/grading/decision/`
Expected: PASS (12 test).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grading/decision/predicates.ts apps/api/src/grading/decision/predicates.spec.ts apps/api/src/grading/decision/testing/result.ts
git commit -m "feat(decision): test_group_failed do code quyết từ run_tests đã lưu — không đo được thì unmeasured, không bao giờ absent (§4.1, T-POL-3, T-COMPILE-1)"
```

---

### Task 3: `diagnose()` — lỗi mang nguồn gốc

**Files:**
- Create: `apps/api/src/grading/decision/diagnose.ts`
- Test: `apps/api/src/grading/decision/diagnose.spec.ts`

**Interfaces:**
- Consumes: `evaluatePredicate`, `isMachineChecked` (Task 2); `ErrorRule`, `DiagnosedError`, `Diagnosis` (Task 1); `InvestigationResult` (bước 2).
- Produces: `diagnose(input: { rules: ErrorRule[]; bundle: { cases: { name: string; group: string }[] }; result: InvestigationResult }): Diagnosis`

- [ ] **Step 1: Test đỏ**

Create `apps/api/src/grading/decision/diagnose.spec.ts`:

```ts
import { diagnose } from './diagnose';
import { readFileCall, resultWith, runTestsCall } from './testing/result';
import { ErrorRule } from './types';

const BUNDLE = { cases: [{ name: 'cb1', group: 'co_ban' }, { name: 'tl1', group: 'trung_lap' }] };
const RULES: ErrorRule[] = [
  { ruleKey: 'sai_ca_co_ban', criterionKey: 'tinh_dung', deductionHundredths: 300, predicate: { kind: 'test_group_failed', group: 'co_ban' } },
  { ruleKey: 'khong_xu_ly_trung', criterionKey: 'tinh_dung', deductionHundredths: 150, predicate: { kind: 'test_group_failed', group: 'trung_lap' } },
  { ruleKey: 'do_phuc_tap', criterionKey: 'hieu_nang', deductionHundredths: 300, predicate: { kind: 'complexity_exceeds_required' } },
  { ruleKey: 'chu_thich_sai', criterionKey: 'trinh_bay', deductionHundredths: 50, predicate: null },
];
const failCoBan = runTestsCall('tc-2', null, [
  { name: 'cb1', group: 'co_ban', status: 'fail' }, { name: 'tl1', group: 'trung_lap', status: 'pass' },
]);

describe('diagnose — nguồn gốc của từng lỗi (§4.1)', () => {
  it('luật máy kiểm: code quyết, nguồn gốc deterministic — model không cần nhắc tới', () => {
    const d = diagnose({ rules: RULES, bundle: BUNDLE, result: resultWith({ calls: [failCoBan] }) });
    expect(d.errors).toEqual([
      { ruleKey: 'sai_ca_co_ban', criterionKey: 'tinh_dung', deductionHundredths: 300, source: 'deterministic', toolCallIds: ['tc-2'] },
    ]);
    expect(d.measurements.map((m) => [m.ruleKey, m.outcome.state])).toEqual([
      ['sai_ca_co_ban', 'present'], ['khong_xu_ly_trung', 'absent'], ['do_phuc_tap', 'unmeasured'],
    ]);
  });

  it('Review Focus 3 — model đề xuất đúng luật máy kiểm → trừ MỘT lần, deterministic; đề xuất vào danh sách bỏ qua', () => {
    const r = resultWith({ calls: [failCoBan], errors: [{ ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-2'] }] });
    const d = diagnose({ rules: RULES, bundle: BUNDLE, result: r });
    expect(d.errors.filter((e) => e.ruleKey === 'sai_ca_co_ban')).toHaveLength(1);
    expect(d.errors[0].source).toBe('deterministic');
    expect(d.ignored).toEqual([{ ruleKey: 'sai_ca_co_ban', reason: 'machine_checked_rule' }]);
  });

  it('§4.1 luật 2 — model đề xuất luật máy kiểm mà code KHÔNG thấy → không thành lỗi (code thắng model)', () => {
    const allPass = runTestsCall('tc-2', null, [{ name: 'cb1', group: 'co_ban', status: 'pass' }, { name: 'tl1', group: 'trung_lap', status: 'pass' }]);
    const r = resultWith({ calls: [allPass], errors: [{ ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-2'] }] });
    const d = diagnose({ rules: RULES, bundle: BUNDLE, result: r });
    expect(d.errors).toEqual([]);
    expect(d.ignored).toEqual([{ ruleKey: 'sai_ca_co_ban', reason: 'machine_checked_rule' }]);
  });

  it('§4.1 luật 3 — luật không predicate có bằng chứng run/run_tests → llm_with_tools, dù bằng chứng chắc chắn', () => {
    const r = resultWith({ calls: [failCoBan], errors: [{ ruleKey: 'chu_thich_sai', toolCallIds: ['tc-2'] }] });
    expect(diagnose({ rules: RULES, bundle: BUNDLE, result: r }).errors.find((e) => e.ruleKey === 'chu_thich_sai')?.source).toBe('llm_with_tools');
  });

  it('bằng chứng chỉ là lời gọi đọc (read_file, list_files) → llm_only: không công cụ nào chống lưng phán đoán', () => {
    const r = resultWith({ calls: [readFileCall('tc-1', 'bai-nop/main.cpp')], errors: [{ ruleKey: 'chu_thich_sai', toolCallIds: ['tc-1'] }] });
    expect(diagnose({ rules: RULES, bundle: BUNDLE, result: r }).errors).toEqual([
      { ruleKey: 'chu_thich_sai', criterionKey: 'trinh_bay', deductionHundredths: 50, source: 'llm_only', toolCallIds: ['tc-1'] },
    ]);
  });

  it('Q1 — luật predicate chưa đo được (độ phức tạp): model được phán đoán, nguồn gốc theo bằng chứng, không deterministic', () => {
    const r = resultWith({ calls: [failCoBan], errors: [{ ruleKey: 'do_phuc_tap', toolCallIds: ['tc-2'] }] });
    const e = diagnose({ rules: RULES, bundle: BUNDLE, result: r }).errors.find((x) => x.ruleKey === 'do_phuc_tap');
    expect(e?.source).toBe('llm_with_tools');
  });

  it('kết quả không kết luận được (ungradable) → không lỗi nào, kể cả lỗi code đo được', () => {
    const r = resultWith({ kind: 'ungradable', ungradable: { class: 'system', reason: 'x' }, calls: [failCoBan] });
    expect(diagnose({ rules: RULES, bundle: BUNDLE, result: r }).errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy, xác nhận đỏ**

Run: `bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh src/grading/decision/diagnose`
Expected: FAIL — `Cannot find module './diagnose'`.

- [ ] **Step 3: Cài**

Create `apps/api/src/grading/decision/diagnose.ts`:

```ts
import { InvestigationResult, ToolName } from '../investigator/types';
import { evaluatePredicate, isMachineChecked } from './predicates';
import { Diagnosis, DiagnosedError, ErrorRule, VerdictSource } from './types';

/** Công cụ mà kết quả của nó CHỐNG LƯNG một phán đoán — chạy thật, chạy lại được. */
const BACKING_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>(['run', 'run_tests']);

/**
 * Lỗi mang nguồn gốc (§4.1). Luật máy kiểm được → code quyết từ kết quả đã lưu, model không
 * tham gia; đề xuất của model cho luật đó bị bỏ qua và ghi lại. Luật còn lại → đề xuất của model
 * (đã lọc T-AG-2 ở bước 2), nguồn gốc tụt theo bằng chứng. Thuần: chạy lại được trên hồ sơ đã
 * lưu với một bảng lỗi mới mà không gọi model hay sandbox (T-TIER-1/2).
 */
export function diagnose(input: {
  rules: ErrorRule[];
  bundle: { cases: { name: string; group: string }[] };
  result: InvestigationResult;
}): Diagnosis {
  const { rules, bundle, result } = input;
  const { toolCalls, structuredResults } = result.investigation;
  const errors: DiagnosedError[] = [];
  const ignored: Diagnosis['ignored'] = [];
  const measurements: Diagnosis['measurements'] = [];
  if (result.kind !== 'verdict') return { errors, ignored, measurements };

  for (const r of rules) {
    if (!r.predicate) continue;
    const outcome = evaluatePredicate(r.predicate, bundle, toolCalls, structuredResults);
    measurements.push({ ruleKey: r.ruleKey, criterionKey: r.criterionKey, outcome });
    if (isMachineChecked(r.predicate) && outcome.state === 'present') {
      errors.push({
        ruleKey: r.ruleKey, criterionKey: r.criterionKey, deductionHundredths: r.deductionHundredths,
        source: 'deterministic', toolCallIds: outcome.toolCallIds,
      });
    }
  }

  const byKey = new Map(rules.map((r) => [r.ruleKey, r]));
  const toolOf = new Map(toolCalls.map((t) => [t.id, t.tool]));
  const seen = new Set(errors.map((e) => e.ruleKey));
  for (const e of result.verdict?.errors ?? []) {
    const rule = byKey.get(e.ruleKey);
    if (!rule) continue; // T-AG-2 đã loại; phòng thủ
    if (isMachineChecked(rule.predicate)) {
      ignored.push({ ruleKey: e.ruleKey, reason: 'machine_checked_rule' });
      continue;
    }
    if (seen.has(e.ruleKey)) continue;
    seen.add(e.ruleKey);
    const backed = e.toolCallIds.some((id) => BACKING_TOOLS.has(toolOf.get(id) as ToolName));
    const source: VerdictSource = backed ? 'llm_with_tools' : 'llm_only';
    errors.push({ ruleKey: e.ruleKey, criterionKey: rule.criterionKey, deductionHundredths: rule.deductionHundredths, source, toolCallIds: e.toolCallIds });
  }
  return { errors, ignored, measurements };
}
```

- [ ] **Step 4: Chạy, xác nhận xanh**

Run: `bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh src/grading/decision/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading/decision/diagnose.ts apps/api/src/grading/decision/diagnose.spec.ts
git commit -m "feat(decision): diagnose() — lỗi mang nguồn gốc; code thắng model ở luật máy kiểm, đề xuất bị bỏ qua được ghi (§4.1)"
```

---

### Task 4: Confidence theo nguồn gốc + ngưỡng θ

**Files:**
- Create: `apps/api/src/grading/decision/confidence.ts`, `apps/api/src/grading/decision/threshold.ts`
- Test: `apps/api/src/grading/decision/confidence.spec.ts`, `apps/api/src/grading/decision/threshold.spec.ts`

**Interfaces:**
- Consumes: `DiagnosedError`, `VerdictSource` (Task 1); `AUTO_APPROVE_CONFIDENCE` (`grading/grading.types.ts`).
- Produces:
  - `SOURCE_CAP: Record<VerdictSource, number>`; `capOf(source: VerdictSource, modelCeiling: number): number`
  - `caseConfidence(errors: DiagnosedError[], opts: { modelCeiling: number; coverageComplete: boolean }): number`
  - `readAutoThreshold(env: NodeJS.ProcessEnv): { theta: number; warning: string | null }`

- [ ] **Step 1: Test đỏ**

Create `apps/api/src/grading/decision/confidence.spec.ts`:

```ts
import { capOf, caseConfidence } from './confidence';
import { DiagnosedError } from './types';

const err = (source: DiagnosedError['source'], deductionHundredths: number | null): DiagnosedError => ({
  ruleKey: `r-${source}-${deductionHundredths}`, criterionKey: 'c', deductionHundredths, source, toolCallIds: ['tc-1'],
});

describe('confidence theo nguồn gốc (§4.2)', () => {
  it('T-SRC-1 — deterministic KHÔNG bị trần bậc model kéo xuống', () => {
    expect(capOf('deterministic', 0.5)).toBe(1);
    expect(caseConfidence([err('deterministic', 300)], { modelCeiling: 0.3, coverageComplete: true })).toBe(1);
  });

  it('T-SRC-2 — llm_only chịu trần 0,5 kể cả khi bậc model khai trần 1; thấp hơn nữa nếu bậc thấp hơn', () => {
    expect(capOf('llm_only', 1)).toBe(0.5);
    expect(capOf('llm_only', 0.3)).toBe(0.3);
    expect(capOf('llm_with_tools', 0.3)).toBe(0.85); // trần bậc model không chạm tới llm_with_tools
  });

  it('T-AUTO-1 (phần số) — 60% mức trừ máy quyết + 40% llm_only → 0,80', () => {
    expect(caseConfidence([err('deterministic', 600), err('llm_only', 400)], { modelCeiling: 1, coverageComplete: true })).toBeCloseTo(0.8);
  });

  it('trung bình có trọng số THEO MỨC TRỪ, không phải giá trị nhỏ nhất', () => {
    const c = caseConfidence([err('deterministic', 300), err('llm_only', 50)], { modelCeiling: 1, coverageComplete: true });
    expect(c).toBeCloseTo((300 * 1 + 50 * 0.5) / 350);
  });

  it('T-CONF-1 — bài không lỗi nào → từ độ phủ, không chia cho 0', () => {
    expect(caseConfidence([], { modelCeiling: 1, coverageComplete: true })).toBe(1);
    expect(caseConfidence([], { modelCeiling: 1, coverageComplete: false })).toBe(0);
  });

  it('lỗi chưa có giá không có trọng số — confidence tính trên phần có giá; chỉ có lỗi chưa giá → như bài không lỗi', () => {
    expect(caseConfidence([err('llm_only', null)], { modelCeiling: 1, coverageComplete: true })).toBe(1);
    expect(caseConfidence([err('deterministic', 300), err('llm_only', null)], { modelCeiling: 1, coverageComplete: true })).toBe(1);
  });
});
```

Create `apps/api/src/grading/decision/threshold.spec.ts`:

```ts
import { AUTO_APPROVE_CONFIDENCE } from '../grading.types';
import { readAutoThreshold } from './threshold';

describe('readAutoThreshold — θ (§4.2)', () => {
  it('không đặt → hằng số hôm nay, không cảnh báo', () => {
    expect(readAutoThreshold({})).toEqual({ theta: AUTO_APPROVE_CONFIDENCE, warning: null });
    expect(AUTO_APPROVE_CONFIDENCE).toBe(0.85);
  });

  it('đọc được từ env', () => {
    expect(readAutoThreshold({ GRADING_AUTO_THRESHOLD: '0.9' }).theta).toBe(0.9);
  });

  it('rỗng, chữ, 0, âm, > 1 → mặc định KÈM cảnh báo', () => {
    for (const raw of ['', 'abc', '0', '-0.5', '1.5']) {
      const r = readAutoThreshold({ GRADING_AUTO_THRESHOLD: raw });
      expect(r.theta).toBe(AUTO_APPROVE_CONFIDENCE);
      expect(r.warning).toMatch(/GRADING_AUTO_THRESHOLD/);
    }
  });

  it('T-AUTO-1 — trong decision/ và eval/, CHỈ threshold.ts đọc hằng số; mọi chỗ khác đi qua θ được truyền vào', () => {
    const { readdirSync, readFileSync } = jest.requireActual<typeof import('node:fs')>('node:fs');
    const { join } = jest.requireActual<typeof import('node:path')>('node:path');
    const E = String.fromCharCode(101, 118, 97, 108);
    const dirs = [__dirname, join(__dirname, '..', '..', E)];
    const readers: string[] = [];
    for (const dir of dirs) {
      for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.spec.ts'))) {
        if (readFileSync(join(dir, f), 'utf8').includes('AUTO_APPROVE_CONFIDENCE')) readers.push(f);
      }
    }
    expect(readers).toEqual(['threshold.ts']);
  });
});
```

- [ ] **Step 2: Chạy, xác nhận đỏ**

Run: `bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh src/grading/decision/`
Expected: FAIL — hai module chưa có.

- [ ] **Step 3: Cài**

Create `apps/api/src/grading/decision/confidence.ts`:

```ts
import { DiagnosedError, VerdictSource } from './types';

/** Trần confidence theo NGUỒN GỐC, không theo bậc model (§4.2). */
export const SOURCE_CAP: Record<VerdictSource, number> = {
  deterministic: 1,
  llm_with_tools: 0.85,
  llm_only: 0.5,
};

/**
 * Trần bậc model chỉ kéo được `llm_only` xuống (§4.2): lấy nó làm trần của hai nguồn còn lại thì
 * một provider khai trần 1 làm "chỉ mô hình" được tin HƠN "mô hình + công cụ".
 */
export function capOf(source: VerdictSource, modelCeiling: number): number {
  return source === 'llm_only' ? Math.min(SOURCE_CAP.llm_only, modelCeiling) : SOURCE_CAP[source];
}

/**
 * Trung bình có trọng số theo MỨC TRỪ (§4.2). Không có lỗi nào có giá → trọng số 0: confidence
 * đến từ độ phủ của cuộc điều tra — 1,0 khi mọi điều kiện độ phủ của sàn qua (T-CONF-1). Điều
 * kiện độ phủ trượt thì bài đã bị gắn cờ bởi chính điều kiện đó; 0 ở đây chỉ để không ai đọc nhầm.
 */
export function caseConfidence(errors: DiagnosedError[], opts: { modelCeiling: number; coverageComplete: boolean }): number {
  const priced = errors.filter((e) => e.deductionHundredths !== null && e.deductionHundredths > 0);
  const weight = priced.reduce((s, e) => s + e.deductionHundredths!, 0);
  if (weight === 0) return opts.coverageComplete ? 1 : 0;
  return priced.reduce((s, e) => s + capOf(e.source, opts.modelCeiling) * e.deductionHundredths!, 0) / weight;
}
```

Create `apps/api/src/grading/decision/threshold.ts`:

```ts
import { AUTO_APPROVE_CONFIDENCE } from '../grading.types';

const KEY = 'GRADING_AUTO_THRESHOLD';

/**
 * θ của công thức tự quyết (§4.2): đọc từ env, mặc định là hằng số hôm nay. Chỉ `decide()` gọi
 * hàm này — không chỗ nào khác của đường chấm mới đọc thẳng hằng số (T-AUTO-1). Env CÓ đặt mà
 * rỗng hay vô nghĩa → mặc định KÈM cảnh báo: im lặng là giấu một lần gõ nhầm.
 */
export function readAutoThreshold(env: NodeJS.ProcessEnv): { theta: number; warning: string | null } {
  const set = env[KEY];
  if (set === undefined) return { theta: AUTO_APPROVE_CONFIDENCE, warning: null };
  const value = set.trim() === '' ? NaN : Number(set);
  if (Number.isFinite(value) && value > 0 && value <= 1) return { theta: value, warning: null };
  return {
    theta: AUTO_APPROVE_CONFIDENCE,
    warning: `${KEY}=${JSON.stringify(set)} không phải số trong (0, 1] — dùng mặc định ${AUTO_APPROVE_CONFIDENCE}`,
  };
}
```

- [ ] **Step 4: Chạy, xác nhận xanh**

Run: `bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh src/grading/decision/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading/decision/confidence.ts apps/api/src/grading/decision/confidence.spec.ts apps/api/src/grading/decision/threshold.ts apps/api/src/grading/decision/threshold.spec.ts
git commit -m "feat(decision): confidence theo nguồn gốc, trung bình theo mức trừ, bài không lỗi lấy từ độ phủ; θ từ env (§4.2, T-SRC-1/2, T-CONF-1)"
```

---

### Task 5: `decide()` — sàn, §4.3, giá, MỘT công thức tự quyết

**Files:**
- Create: `apps/api/src/grading/decision/decide.ts`
- Create: `apps/api/src/grading/decision/decision.import-scan.spec.ts`
- Test: `apps/api/src/grading/decision/decide.spec.ts`

**Interfaces:**
- Consumes: `diagnose` (Task 3), `caseConfidence` (Task 4), `computeDeductionScore` (`grading/scoring/deduction-score.ts`), mọi kiểu Task 1.
- Produces: `decide(input: DecisionInput): Decision`; hằng số `BUDGET_STOPS`.

- [ ] **Step 1: Test đỏ**

Create `apps/api/src/grading/decision/decide.spec.ts`:

```ts
import { decide } from './decide';
import { readFileCall, resultWith, runTestsCall } from './testing/result';
import { DecisionInput, ErrorRule } from './types';

const BUNDLE = { cases: [{ name: 'cb1', group: 'co_ban' }, { name: 'tl1', group: 'trung_lap' }] };
const RUBRIC = [{ key: 'tinh_dung', maxHundredths: 700 }, { key: 'trinh_bay', maxHundredths: 300 }];
const RULES: ErrorRule[] = [
  { ruleKey: 'sai_ca_co_ban', criterionKey: 'tinh_dung', deductionHundredths: 300, predicate: { kind: 'test_group_failed', group: 'co_ban' } },
  { ruleKey: 'khong_xu_ly_trung', criterionKey: 'tinh_dung', deductionHundredths: 150, predicate: { kind: 'test_group_failed', group: 'trung_lap' } },
  { ruleKey: 'chu_thich_sai', criterionKey: 'trinh_bay', deductionHundredths: 50, predicate: null },
];
const allPass = runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status: 'pass' }, { name: 'tl1', group: 'trung_lap', status: 'pass' }]);
const failCoBan = runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status: 'fail' }, { name: 'tl1', group: 'trung_lap', status: 'pass' }]);
const read = readFileCall('tc-2', 'bai-nop/main.cpp');
const input = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  pipeline: 'investigator', result: resultWith({ calls: [allPass, read] }), bundle: BUNDLE, rubric: RUBRIC, rules: RULES,
  waivedCriteria: [], modelCeiling: 0.5, theta: 0.85, ...over,
});

describe('decide() — MỘT công thức tự quyết (§4.2)', () => {
  it('T-FLOOR-2 — bài đúng, đủ test và đều pass, đã đọc code → điểm TỐI ĐA, tự quyết, confidence 1', () => {
    const d = decide(input());
    expect(d).toMatchObject({ outcome: 'auto', scoreHundredths: 1000, maxHundredths: 1000, confidence: 1, caseFlags: [], errorFlags: [] });
  });

  it('lỗi do code quyết → điểm do code tính, tự quyết (deterministic, trần 1)', () => {
    const d = decide(input({ result: resultWith({ calls: [failCoBan, read] }) }));
    expect(d).toMatchObject({ outcome: 'auto', scoreHundredths: 700, confidence: 1 });
    expect(d.errors.map((e) => [e.ruleKey, e.source])).toEqual([['sai_ca_co_ban', 'deterministic']]);
  });

  it('T-AUTO-1 — confidence dưới θ → gắn cờ low_confidence', () => {
    const rules: ErrorRule[] = [...RULES.slice(0, 2), { ...RULES[2], deductionHundredths: 200 }];
    const r = resultWith({ calls: [failCoBan, read], errors: [{ ruleKey: 'chu_thich_sai', toolCallIds: ['tc-2'] }] });
    const d = decide(input({ rules, result: r, modelCeiling: 1 }));
    expect(d.confidence).toBeCloseTo((300 + 200 * 0.5) / 500); // 0,80
    expect(d.outcome).toBe('flagged');
    expect(d.caseFlags.map((f) => f.code)).toEqual(['low_confidence']);
  });

  it('T-POL-2 — luật chưa có giá: bài dính nó KHÔNG tự quyết; cờ gắn ĐÚNG lỗi đó, không gắn cả bài', () => {
    const rules = RULES.map((r) => (r.ruleKey === 'sai_ca_co_ban' ? { ...r, deductionHundredths: null } : r));
    const d = decide(input({ rules, result: resultWith({ calls: [failCoBan, read] }) }));
    expect(d.outcome).toBe('flagged');
    expect(d.errorFlags).toEqual([{ ruleKey: 'sai_ca_co_ban', code: 'unpriced' }]);
    expect(d.caseFlags).toEqual([]);
    expect(d.scoreHundredths).toBe(1000); // luật chưa giá không trừ gì
  });

  it('T-COMPILE-1 — bài không biên dịch: gói test ĐÃ chạy, mọi luật nhóm test bắn, §4.3 gắn cờ, KHÔNG ungradable, KHÔNG điểm tối đa', () => {
    const broken = runTestsCall('tc-1', null, [], { compileOk: false });
    const d = decide(input({ result: resultWith({ calls: [broken, read] }) }));
    expect(d.outcome).toBe('flagged');
    expect(d.ungradable).toBeNull();
    expect(d.caseFlags.map((f) => f.code)).toContain('nothing_passed');
    expect(d.errors.map((e) => e.ruleKey).sort()).toEqual(['khong_xu_ly_trung', 'sai_ca_co_ban']);
    expect(d.scoreHundredths).toBe(550);
    expect(d.confidence).toBeLessThanOrEqual(0.5);
  });

  it('§4.3 — mọi ca đều không đạt mà agent chỉ chẩn đoán vài lỗi nhỏ → gắn cờ, trần 0,5, KHÔNG tự cho 0 điểm', () => {
    const allFail = runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status: 'fail' }, { name: 'tl1', group: 'trung_lap', status: 'fail' }]);
    const d = decide(input({ result: resultWith({ calls: [allFail, read] }) }));
    expect(d.caseFlags.map((f) => f.code)).toContain('nothing_passed');
    expect(d.confidence).toBe(0.5);
    expect(d.scoreHundredths).toBe(550);
  });

  it('T-FLOOR-1 — cạn ngân sách với 0 phát hiện → ungradable lớp system, TUYỆT ĐỐI không phải điểm tối đa', () => {
    const d = decide(input({ result: resultWith({ calls: [allPass, read], stopReason: 'max_tool_calls', flags: ['budget_exhausted'] }) }));
    expect(d.outcome).toBe('ungradable');
    expect(d.ungradable).toEqual({ class: 'system', reason: expect.stringMatching(/T-FLOOR-1/) });
    expect(d.scoreHundredths).toBeNull();
  });

  it('Q4 — cạn ngân sách NHƯNG code đã tìm ra lỗi → không phải T-FLOOR-1 (phát hiện gồm cả lỗi do code quyết)', () => {
    const d = decide(input({ result: resultWith({ calls: [failCoBan, read], stopReason: 'max_rounds', flags: ['budget_exhausted'] }) }));
    expect(d.outcome).toBe('flagged');
    expect(d.caseFlags.map((f) => f.code)).toEqual(['investigation_flag']);
  });

  it('T-FLOOR-4 / Q2 — luật không predicate mà agent không đọc file bài nộp nào → tiêu chí chưa chạm tới, nêu đích danh', () => {
    const d = decide(input({ result: resultWith({ calls: [allPass] }) }));
    expect(d.outcome).toBe('flagged');
    expect(d.caseFlags).toEqual([{ code: 'criterion_untouched', detail: expect.stringMatching(/trinh_bay/) }]);
  });

  it('T-FLOOR-4 / Q1 — tiêu chí có luật predicate chưa đo được → chưa chạm tới, nêu luật và công cụ cần', () => {
    const rules: ErrorRule[] = [...RULES, { ruleKey: 'do_phuc_tap', criterionKey: 'hieu_nang', deductionHundredths: 300, predicate: { kind: 'complexity_exceeds_required' } }];
    const rubric = [...RUBRIC, { key: 'hieu_nang', maxHundredths: 300 }];
    const d = decide(input({ rules, rubric }));
    expect(d.outcome).toBe('flagged');
    expect(d.caseFlags).toEqual([{ code: 'criterion_untouched', detail: expect.stringMatching(/hieu_nang.*do_phuc_tap.*run_scaled/) }]);
  });

  it('T-FLOOR-6 — tiêu chí có trần mà không luật nào trỏ vào → không tự quyết; đánh dấu "không có luật trừ" → hết chặn', () => {
    const rubric = [...RUBRIC, { key: 'sang_tao', maxHundredths: 100 }];
    expect(decide(input({ rubric })).caseFlags).toEqual([{ code: 'criterion_without_rules', detail: expect.stringMatching(/sang_tao/) }]);
    expect(decide(input({ rubric, waivedCriteria: ['sang_tao'] })).outcome).toBe('auto');
  });

  it('Review Focus 4 — tiêu chí trần 0 không đòi luật', () => {
    expect(decide(input({ rubric: [...RUBRIC, { key: 'thuong', maxHundredths: 0 }] })).outcome).toBe('auto');
  });

  it('Q5 — cờ của cuộc điều tra chặn tự quyết, nêu đích danh', () => {
    for (const flag of ['injection_suspected', 'replay_mismatch', 'replay_unverified', 'evidence_rejected'] as const) {
      const d = decide(input({ result: resultWith({ calls: [allPass, read], flags: [flag] }) }));
      expect(d.outcome).toBe('flagged');
      expect(d.caseFlags).toEqual([{ code: 'investigation_flag', detail: flag }]);
    }
  });

  it('trần confidence của cuộc điều tra (replay lệch 0,5) được áp', () => {
    const d = decide(input({ result: resultWith({ calls: [allPass, read], confidenceCap: 0.5, flags: ['replay_mismatch'] }) }));
    expect(d.confidence).toBe(0.5);
  });

  it('T-EMPTY-1 / T-FLOOR-5 — kết quả ungradable của cuộc điều tra đi thẳng ra, giữ nguyên lớp', () => {
    const r = resultWith({ kind: 'ungradable', ungradable: { class: 'submission', reason: 'bài nộp không có dòng mã nào (T-EMPTY-1)' } });
    expect(decide(input({ result: r }))).toMatchObject({ outcome: 'ungradable', ungradable: { class: 'submission' }, scoreHundredths: null, confidence: null });
  });

  it('§0.3 — pipeline một-phát (bài tự luận) KHÔNG BAO GIỜ tự quyết', () => {
    const d = decide(input({ pipeline: 'one_shot' }));
    expect(d.outcome).toBe('flagged');
    expect(d.caseFlags.map((f) => f.code)).toContain('not_code_pipeline');
  });

  it('T-TIER-1 — đổi giá một luật: quyết lại trên hồ sơ ĐÃ LƯU, điểm đổi theo, không cần model hay sandbox', () => {
    const stored = resultWith({ calls: [failCoBan, read] });
    const before = decide(input({ result: stored }));
    const after = decide(input({ result: stored, rules: RULES.map((r) => (r.ruleKey === 'sai_ca_co_ban' ? { ...r, deductionHundredths: 100 } : r)) }));
    expect([before.scoreHundredths, after.scoreHundredths]).toEqual([700, 900]);
  });

  it('T-TIER-2 — luật máy kiểm MỚI, đánh giá được trên kết quả đã lưu → áp ngay', () => {
    const stored = resultWith({ calls: [failCoBan, read] });
    const rules: ErrorRule[] = [...RULES, { ruleKey: 'sai_co_ban_moi', criterionKey: 'trinh_bay', deductionHundredths: 50, predicate: { kind: 'test_group_failed', group: 'co_ban' } }];
    expect(decide(input({ result: stored, rules })).errors.map((e) => e.ruleKey)).toContain('sai_co_ban_moi');
  });
});
```

Create `apps/api/src/grading/decision/decision.import-scan.spec.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `decide()` thuần (§12.5; T-TIER-1/2 "không gọi model, không gọi sandbox"): module này không
 * import sandbox client, model pool, provider, DB hay Nest. Chữ ký không nhận cổng nào, và import
 * là bằng chứng thứ hai.
 */
describe('decision/ — phạm vi import', () => {
  it('không với tới sandbox client, model, provider, DB, Nest', () => {
    const dir = __dirname;
    const forbidden = /sandbox\.client|model-pool|ai-provider|typeorm|@nestjs|\.entity|investigate'/;
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.spec.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      for (const m of src.matchAll(/from\s+'([^']+)'/g)) if (forbidden.test(m[1])) offenders.push(`${f} → ${m[1]}`);
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy, xác nhận đỏ**

Run: `bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh src/grading/decision/`
Expected: FAIL — `Cannot find module './decide'`; import-scan xanh (chưa có file vi phạm).

- [ ] **Step 3: Cài**

Create `apps/api/src/grading/decision/decide.ts`:

```ts
import { computeDeductionScore } from '../scoring/deduction-score';
import { StopReason } from '../investigator/types';
import { caseConfidence } from './confidence';
import { diagnose } from './diagnose';
import { CaseFlag, Decision, DecisionInput, ErrorFlag } from './types';

/** Lý do dừng là CẠN NGÂN SÁCH (§7) — nền của T-FLOOR-1. */
export const BUDGET_STOPS: ReadonlySet<StopReason> = new Set<StopReason>(['max_tool_calls', 'max_rounds', 'max_wall', 'max_tokens']);
const CONTRADICTION_CAP = 0.5;

/**
 * MỘT công thức tự quyết, ở MỘT hàm (§4.2):
 *
 *   tự quyết ⇔ bài code ∧ qua sàn §4.4 ∧ §4.3 không bắn ∧ mọi lỗi được tính đều có giá
 *            ∧ confidence ≥ θ
 *
 * Thứ tự là luật: sàn đứng TRƯỚC trần (§4.4) — dưới sàn thì không có con số nào để hạ
 * confidence. Thuần: không DB, không model, không sandbox — gọi lại được trên hồ sơ đã lưu khi
 * bảng lỗi đổi (T-TIER-1/2). Điều kiện phản biện (§6.2) chưa có hiệu lực tới bước 6.
 */
export function decide(input: DecisionInput): Decision {
  const { result, rubric, rules } = input;
  const maxHundredths = rubric.reduce((s, c) => s + c.maxHundredths, 0);
  const none = { scoreHundredths: null, maxHundredths, errors: [], confidence: null, caseFlags: [], errorFlags: [], diagnosis: null };

  // Sàn — phần của cuộc điều tra (bước 2): chưa bắt đầu, gói test chưa chạy đủ, bài rỗng, …
  if (result.kind === 'ungradable') {
    return { outcome: 'ungradable', ungradable: result.ungradable ?? { class: 'system', reason: 'không có kết luận' }, ...none };
  }

  const diagnosis = diagnose({ rules, bundle: input.bundle, result });
  const { errors } = diagnosis;

  // T-FLOOR-1 (Q4): cạn ngân sách mà không phát hiện gì — kể cả phát hiện do code — không phải bài sạch.
  if (BUDGET_STOPS.has(result.investigation.budget.stopReason) && errors.length === 0) {
    return {
      outcome: 'ungradable',
      ungradable: { class: 'system', reason: `cạn ngân sách (${result.investigation.budget.stopReason}) với 0 phát hiện — không phải bài sạch (T-FLOOR-1)` },
      ...none,
      diagnosis,
    };
  }

  const score = computeDeductionScore(
    rubric.map((c) => ({ key: c.key, maxHundredths: c.maxHundredths })),
    rules.map((r) => ({ ruleKey: r.ruleKey, criterionKey: r.criterionKey, deductionHundredths: r.deductionHundredths })),
    errors.map((e) => e.ruleKey),
  );

  const caseFlags: CaseFlag[] = [];
  const readSubmission = result.investigation.toolCalls.some(
    (t) => t.tool === 'read_file' && t.status === 'ok' && typeof t.args.path === 'string' && t.args.path.startsWith('bai-nop/'),
  );
  const waived = new Set(input.waivedCriteria);
  for (const c of rubric) {
    if (c.maxHundredths <= 0) continue; // Review Focus 4: tiêu chí trần 0 không có gì để trừ
    const own = rules.filter((r) => r.criterionKey === c.key);
    if (own.length === 0) {
      // T-FLOOR-6: chấm trừ mà không có luật thì tiêu chí luôn trọn điểm.
      if (!waived.has(c.key)) caseFlags.push({ code: 'criterion_without_rules', detail: `tiêu chí "${c.key}" không có luật nào trỏ vào` });
      continue;
    }
    // T-FLOOR-4 (Q2): mọi luật của tiêu chí phải đã được xét.
    const gaps: string[] = [];
    for (const r of own) {
      if (r.predicate) {
        const m = diagnosis.measurements.find((x) => x.ruleKey === r.ruleKey);
        if (!m || m.outcome.state === 'unmeasured') gaps.push(`${r.ruleKey}: ${m?.outcome.reason ?? 'chưa đo'}`);
      } else if (!readSubmission) {
        gaps.push(`${r.ruleKey}: agent chưa đọc file bài nộp nào`);
      }
    }
    if (gaps.length > 0) caseFlags.push({ code: 'criterion_untouched', detail: `tiêu chí "${c.key}" chưa chạm tới — ${gaps.join('; ')}` });
  }
  const coverageComplete = caseFlags.length === 0;

  // §4.3: mọi ca đều không đạt (kể cả không biên dịch — T-COMPILE-1). KHÔNG tự cho 0 điểm.
  const runs = result.investigation.toolCalls
    .filter((t) => t.tool === 'run_tests' && t.status === 'ok' && t.structuredRef)
    .map((t) => result.investigation.structuredResults[t.structuredRef!])
    .filter((s) => s?.kind === 'run_tests');
  const ran = runs.some((s) => s.kind === 'run_tests' && ((s.compile && !s.compile.ok) || s.cases.length > 0));
  const anyPass = runs.some((s) => s.kind === 'run_tests' && s.cases.some((c) => c.status === 'pass'));
  const nothingPassed = ran && !anyPass;
  if (nothingPassed) caseFlags.push({ code: 'nothing_passed', detail: 'mọi ca của gói test đều không đạt — mâu thuẫn với chẩn đoán phải do giảng viên xem (§4.3)' });

  // Q5: cờ của cuộc điều tra.
  for (const f of result.flags) caseFlags.push({ code: 'investigation_flag', detail: f });

  if (input.pipeline !== 'investigator') caseFlags.push({ code: 'not_code_pipeline', detail: 'bài tự luận không bao giờ tự quyết (§0.3)' });

  const errorFlags: ErrorFlag[] = score.unpricedRuleKeys.map((ruleKey) => ({ ruleKey, code: 'unpriced' as const }));

  let confidence = caseConfidence(errors, { modelCeiling: input.modelCeiling, coverageComplete });
  confidence = Math.min(confidence, result.confidenceCap);
  if (nothingPassed) confidence = Math.min(confidence, CONTRADICTION_CAP);

  if (caseFlags.length === 0 && errorFlags.length === 0 && confidence < input.theta) {
    caseFlags.push({ code: 'low_confidence', detail: `confidence ${confidence.toFixed(2)} < θ ${input.theta}` });
  }
  const auto = caseFlags.length === 0 && errorFlags.length === 0;
  return {
    outcome: auto ? 'auto' : 'flagged',
    ungradable: null,
    scoreHundredths: score.scoreHundredths,
    maxHundredths,
    errors,
    confidence,
    caseFlags,
    errorFlags,
    diagnosis,
  };
}
```

- [ ] **Step 4: Chạy, xác nhận xanh**

Run: `bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh src/grading/decision/`
Expected: PASS (mọi test của Task 2–5).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading/decision/decide.ts apps/api/src/grading/decision/decide.spec.ts apps/api/src/grading/decision/decision.import-scan.spec.ts
git commit -m "feat(decision): decide() — sàn trước trần, §4.3, luật chưa giá gắn cờ đúng lỗi, MỘT công thức tự quyết (§4.2–§4.4, T-FLOOR-1…6, T-AUTO-1, T-COMPILE-1, T-TIER-1/2)"
```

---

### Task 6: Bảng lỗi model đọc — luật máy kiểm tách riêng (Q6)

**Files:**
- Modify: `apps/api/src/grading/investigator/types.ts` (`RuleEntry`)
- Modify: `apps/api/src/grading/investigator/workspace.ts` (`renderRulesFile`)
- Modify: `apps/api/src/grading/investigator/testing/context.ts`, `apps/api/src/eval/context-from-fixture.ts`
- Test: `apps/api/src/grading/investigator/workspace.spec.ts`

**Interfaces:**
- Consumes: `isMachineChecked` (Task 2).
- Produces: `RuleEntry.checkedBy: 'machine' | 'model'` thay `hasPredicate: boolean`; `RuleEntry.machineNote: string | null` (vd. `nhóm test co_ban`, hay lý do Q1 *"máy chưa đo được"*).

- [ ] **Step 1: Test đỏ**

Hai test hiện có chạm tới hình dạng này:
- `workspace.spec.ts` — *"bảng lỗi ghi mọi rule_key, đánh dấu luật chưa có giá"* — vẫn đúng với định dạng mới, giữ nguyên.
- `eval/context-from-fixture.spec.ts` dòng 17 khớp nguyên văn `hasPredicate: true` — đổi kỳ vọng thành `{ ruleKey: 'sai_co_ban', title: 'Sai ca cơ bản', criterionKey: 'tinh_dung', priced: true, checkedBy: 'machine', machineNote: 'nhóm test co_ban' }`.

Thêm vào `workspace.spec.ts`:

```ts
import { renderRulesFile } from './workspace';

describe('bang-loi.md — §4.1 luật 2', () => {
  it('luật máy kiểm ở mục riêng "KHÔNG đề xuất"; luật model phán đoán ở mục thường; luật chưa đo được có ghi chú', () => {
    const text = renderRulesFile([
      { ruleKey: 'sai_ca_co_ban', title: 'Sai ca cơ bản', criterionKey: 'tinh_dung', priced: true, checkedBy: 'machine', machineNote: 'nhóm test co_ban' },
      { ruleKey: 'do_phuc_tap', title: 'Độ phức tạp vượt yêu cầu', criterionKey: 'hieu_nang', priced: true, checkedBy: 'model', machineNote: 'máy chưa đo được — bạn phán đoán' },
      { ruleKey: 'chu_thich_sai', title: 'Chú thích sai', criterionKey: 'trinh_bay', priced: false, checkedBy: 'model', machineNote: null },
    ]);
    const [modelPart, machinePart] = text.split('# Luật máy kiểm');
    expect(machinePart).toMatch(/KHÔNG đề xuất/);
    expect(machinePart).toContain('sai_ca_co_ban');
    expect(modelPart).not.toContain('sai_ca_co_ban');
    expect(modelPart).toMatch(/do_phuc_tap .*máy chưa đo được/);
    expect(modelPart).toMatch(/chu_thich_sai .*\[chưa có giá\]/);
  });
});
```

- [ ] **Step 2: Chạy, xác nhận đỏ**

Run: `bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh src/grading/investigator/workspace`
Expected: FAIL — lỗi kiểu (`checkedBy` không có trong `RuleEntry`).

- [ ] **Step 3: Cài**

`types.ts` — thay `hasPredicate: boolean;` trong `RuleEntry` bằng:

```ts
  /** `machine`: code quyết từ kết quả công cụ, model KHÔNG đề xuất (§4.1 luật 2). */
  checkedBy: 'machine' | 'model';
  /** Máy kiểm bằng gì, hay vì sao chưa kiểm được (Q1) — model đọc dòng này. */
  machineNote: string | null;
```

`workspace.ts` — thay `renderRulesFile`:

```ts
export function renderRulesFile(rules: RuleEntry[]): string {
  const line = (r: RuleEntry) =>
    `- ${r.ruleKey} — ${r.title} (tiêu chí: ${r.criterionKey})${r.priced ? '' : ' [chưa có giá]'}${r.machineNote ? ` — ${r.machineNote}` : ''}`;
  const model = rules.filter((r) => r.checkedBy === 'model');
  const machine = rules.filter((r) => r.checkedBy === 'machine');
  return [
    '# Bảng lỗi',
    'Mỗi dòng: rule_key — mô tả (tiêu chí). Luật "chưa có giá" vẫn là lỗi thật; chỉ mức trừ chưa có.',
    '',
    ...model.map(line),
    ...(machine.length > 0
      ? ['', '# Luật máy kiểm', 'KHÔNG đề xuất các luật dưới: hệ thống tự quyết chúng từ kết quả run_tests. Đề xuất sẽ bị bỏ qua.', '', ...machine.map(line)]
      : []),
  ].join('\n');
}
```

`testing/context.ts` — hai luật của `CTX`:

```ts
    { ruleKey: 'sai_ca_co_ban', title: 'Sai ca cơ bản', criterionKey: 'tinh_dung', priced: true, checkedBy: 'machine', machineNote: 'nhóm test co_ban' },
    { ruleKey: 'chu_thich_sai', title: 'Chú thích sai', criterionKey: 'trinh_bay', priced: false, checkedBy: 'model', machineNote: null },
```

`eval/context-from-fixture.ts` — thay trường `hasPredicate` và thêm `errorRulesOf`:

```ts
import { isMachineChecked } from '../grading/decision/predicates';
import { ErrorRule } from '../grading/decision/types';
import { parseHundredths } from '../grading/scoring/hundredths';

const noteOf = (p: LoadedDe['manifest']['rules'][number]['predicate']): string | null => {
  if (!p) return null;
  if (p.kind === 'test_group_failed') return `nhóm test ${p.group}`;
  return 'máy chưa đo được — bạn phán đoán';
};
// trong contextFor(): rules: de.manifest.rules.map((r) => ({
//   ruleKey: r.ruleKey, title: r.title, criterionKey: r.criterionKey, priced: r.deduction !== null,
//   checkedBy: isMachineChecked(r.predicate) ? 'machine' : 'model', machineNote: noteOf(r.predicate),
// })),

/** Bảng lỗi của đề cho `decide()` — mức trừ bằng số nguyên phần trăm điểm (§13.2). */
export function errorRulesOf(de: LoadedDe): ErrorRule[] {
  return de.manifest.rules.map((r) => ({
    ruleKey: r.ruleKey,
    criterionKey: r.criterionKey,
    deductionHundredths: r.deduction === null ? null : parseHundredths(r.deduction),
    predicate: r.predicate,
  }));
}
```

Sửa mọi chỗ còn dùng `hasPredicate` (kiểm: `git grep -n hasPredicate -- apps/api/src`) — đổi sang `checkedBy`.

- [ ] **Step 4: Chạy, xác nhận xanh**

Run: `bash .superpowers/sdd/2026-09-25-grading-decision-core/x.sh bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh src/grading/ src/@E@/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading/investigator/types.ts apps/api/src/grading/investigator/workspace.ts apps/api/src/grading/investigator/workspace.spec.ts apps/api/src/grading/investigator/testing/context.ts
bash .superpowers/sdd/2026-09-25-grading-decision-core/x.sh git add apps/api/src/@E@/context-from-fixture.ts
git commit -m "feat(investigator): bang-loi.md tách luật máy kiểm (KHÔNG đề xuất) khỏi luật model phán đoán (§4.1 luật 2, Q6)"
```

---

### Task 7: Runner eval chạy `decide()` — đo tự quyết

**Files:**
- Modify: `apps/api/src/grading/investigator/model-pool.ts` (`ModelTier.ceiling`)
- Modify: `apps/api/src/eval/manifest.schema.ts` (`waivedCriteria`)
- Modify: `apps/api/src/eval/investigator-runner.ts`, `apps/api/src/eval/runner-core.ts`, `apps/api/src/eval/cli.ts`, `apps/api/src/eval/compare.ts`
- Test: `apps/api/src/eval/investigator-runner.spec.ts`

**Interfaces:**
- Consumes: `decide`, `readAutoThreshold` (Task 4–5), `errorRulesOf` (Task 6).
- Produces:
  - `ModelTier.ceiling: number` (từ `GRADING_TIERn_CEILING`, mặc định của `readTier`).
  - `CaseRecord.deductionBySource: Record<VerdictSource, number> | null` (baseline: null).
  - `RunSummary.autoDecision: { count: number; rate: number; precision: number | null }`; `RunSummary.machineDeductionShare: number | null`.
  - `runInvestigator` nhận thêm `theta: number` và `ceilings: Map<string, number>` (model → trần).

- [ ] **Step 1: Test đỏ**

`writeMiniDe` (`eval/testing/mini-de.ts`) đã có đúng thứ 3a cần: rubric một tiêu chí `tinh_dung` 10,00; một luật máy kiểm `sai_co_ban` (−4,00, `test_group_failed` nhóm `co_ban`); ca `A0` (nhóm 2, sạch) và `M1` (nhóm 1, mong đợi `sai_co_ban`); gói test một ca `cb1` nhóm `co_ban`. Không sửa fixture nào.

**Test đầu tiên hiện có** của `investigator-runner.spec.ts` (*"điểm tính từ luật tìm thấy trên bảng ĐÓNG BĂNG…"*) để model đề xuất `sai_co_ban` và kỳ vọng `outcome: 'flagged'`, điểm 600. Sau 3a, đề xuất đó của model bị bỏ qua (luật máy kiểm, §4.1 luật 2) và `flagged` không còn là kết cục cố định (Q4 hết hiệu lực) — **thay** test đó bằng hai test dưới. Các test còn lại của file giữ nguyên, chỉ thêm `theta` và `ceilings` vào lời gọi `runInvestigator`.

```ts
import { resultWith, runTestsCall } from '../grading/decision/testing/result';

const runsCb1 = (status: 'pass' | 'fail') => resultWith({ calls: [runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status }])] });
const opts3a = { theta: 0.85, ceilings: new Map([['m', 0.5]]) };

  it('3a — kết cục và điểm là của decide(): luật máy kiểm do code quyết từ run_tests, model không cần nhắc tới', async () => {
    const { dataset, bundles } = await setup();
    const { records, summary } = await runInvestigator({
      dataset, bundles, tier: 'fast', concurrency: 1, budget: DEFAULT_BUDGET, ...opts3a,
      deps: { models: [], sandbox: { exec: async () => { throw new Error('không dùng'); } } },
      investigateFn: async (ctx) => runsCb1(ctx.submission.files[0].content.includes('return x;') ? 'fail' : 'pass'),
    });
    expect(records.find((r) => r.caseId === 'M1')).toMatchObject({
      outcome: 'graded', scoreHundredths: 600, foundRuleIds: ['sai_co_ban'],
      deductionBySource: { deterministic: 400, llm_with_tools: 0, llm_only: 0 },
    });
    expect(records.find((r) => r.caseId === 'A0')).toMatchObject({ outcome: 'graded', scoreHundredths: 1000, foundRuleIds: [] });
    expect((records[0].investigation as { decision: { outcome: string } }).decision.outcome).toBe('auto');
    // §15.2 — hai lượt tự quyết, cả hai khớp luật lẫn kết cục; §4.2 — mọi mức trừ do máy quyết.
    expect(summary.autoDecision).toEqual({ count: 2, rate: 1, precision: 1 });
    expect(summary.machineDeductionShare).toBe(1);
  });

  it('§15.2 — precision nhóm tự quyết đếm cả lượt tự quyết SAI: M1 chạy qua hết (bài chạy đúng ca duy nhất) → tự quyết mà thiếu luật', async () => {
    const { dataset, bundles } = await setup();
    const { summary } = await runInvestigator({
      dataset, bundles, tier: 'fast', concurrency: 1, budget: DEFAULT_BUDGET, ...opts3a,
      deps: { models: [], sandbox: { exec: async () => { throw new Error('không dùng'); } } },
      investigateFn: async () => runsCb1('pass'),
    });
    expect(summary.autoDecision).toEqual({ count: 2, rate: 1, precision: 0.5 });
    // Không lỗi nào → không mức trừ nào → tỉ lệ máy quyết không định nghĩa được, không phải 0.
    expect(summary.machineDeductionShare).toBeNull();
  });
```

- [ ] **Step 2: Chạy, xác nhận đỏ**

Run: `bash .superpowers/sdd/2026-09-25-grading-decision-core/x.sh bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh src/@E@/`
Expected: FAIL — lỗi kiểu (`theta`, `ceilings`, `autoDecision` chưa có).

- [ ] **Step 3: Cài**

1. `model-pool.ts` — `ModelTier` thêm `ceiling: number`; `buildInvestigatorTiers()` điền `ceiling: config.ceiling`. Sửa các test dựng `ModelTier` tay (`investigate.spec.ts`, `model-pool.spec.ts`, `protocol.spec.ts`) thêm `ceiling: 0.5`.
2. `manifest.schema.ts` — `manifestSchema` thêm `waivedCriteria: z.array(z.string()).default([])` (không đổi fixture nào → `datasetHash` giữ nguyên).
3. `runner-core.ts`:
   - `CaseRecord` thêm `deductionBySource: Record<'deterministic' | 'llm_with_tools' | 'llm_only', number> | null;`
   - `RunSummary` thêm `autoDecision` và `machineDeductionShare`, tính trong `runCases`:

```ts
  const graded = ok.filter((r) => r.outcome === 'graded');
  const same = (a: string[] | null, b: string[]) => a !== null && [...a].sort().join('|') === [...b].sort().join('|');
  const autoDecision = {
    count: graded.length,
    rate: ok.length ? graded.length / ok.length : 0,
    // §15.2 — chỉ số tiêu đề: trong các lượt tự quyết, khớp CẢ luật lẫn kết cục. Baseline không có ruleId → null.
    precision: graded.length && graded.every((r) => r.foundRuleIds !== null)
      ? graded.filter((r) => same(r.foundRuleIds, r.expectedRuleIds) && r.outcome === r.expectedOutcome).length / graded.length
      : null,
  };
  const bySource = ok.map((r) => r.deductionBySource).filter((x): x is NonNullable<typeof x> => x !== null);
  const totalDeduction = bySource.reduce((s, x) => s + x.deterministic + x.llm_with_tools + x.llm_only, 0);
  const machineDeductionShare = bySource.length && totalDeduction > 0
    ? bySource.reduce((s, x) => s + x.deterministic, 0) / totalDeduction
    : null;
```

   - `baseline-runner.ts`: mọi `CaseRecord` thêm `deductionBySource: null`.
4. `investigator-runner.ts` — sau `const result = await run(...)`:

```ts
        const decision = decide({
          pipeline: 'investigator',
          result,
          bundle,
          rubric: de.manifest.rubric.map((c) => ({ key: c.key, maxHundredths: parseHundredths(c.maxPoints) })),
          rules: errorRulesOf(de),
          waivedCriteria: de.manifest.waivedCriteria,
          modelCeiling: Math.min(1, ...result.investigation.modelsUsed.map((m) => opts.ceilings.get(m) ?? 0.5)),
          theta: opts.theta,
        });
        const bySource = { deterministic: 0, llm_with_tools: 0, llm_only: 0 };
        for (const e of decision.errors) bySource[e.source] += e.deductionHundredths ?? 0;
```

   và record:

```ts
          outcome: exhausted ? null : decision.outcome === 'auto' ? 'graded' : decision.outcome,
          scoreHundredths: decision.scoreHundredths,
          foundRuleIds: decision.outcome === 'ungradable' ? null : decision.errors.map((e) => e.ruleKey),
          flags: [...result.flags, ...decision.caseFlags.map((f) => f.code), ...decision.errorFlags.map((f) => `${f.code}:${f.ruleKey}`)],
          deductionBySource: decision.outcome === 'ungradable' ? null : bySource,
          investigation: { ...result.investigation, rejected: result.rejected, decision },
```

   Xoá `scoreOf` (điểm giờ là của `decide()`). `runInvestigator` nhận thêm `theta: number; ceilings: Map<string, number>`.
5. `cli.ts` (nhánh investigator): `const { theta, warning } = readAutoThreshold(process.env); if (warning) console.warn(`⚠ ${warning}`);` · `ceilings: new Map(tiers.map((t) => [t.model, t.ceiling]))` · config ghi `theta`, `ablation: ['−run_scaled', '−probe', '−advocate']`, `predicates: 'test_group_failed'` · in: `Tự quyết: ${n} lượt (${pct(rate)}) · precision nhóm tự quyết ${precision ?? '—'} · mức trừ do máy quyết ${share ?? '—'}` · gỡ `n/a (Q4)` ở dòng từng đề và ở phép so: `bothDecide` luôn đúng (cả hai pipeline đều tự quyết). `compare.ts`: sửa chú thích `outcome_agreement` (Q4 đã hết hiệu lực từ 3a).

- [ ] **Step 4: Chạy, xác nhận xanh**

Run: `bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh` (cả bộ) rồi `pnpm --filter api build`
Expected: PASS; build OK.

- [ ] **Step 5: Commit**

```bash
bash .superpowers/sdd/2026-09-25-grading-decision-core/x.sh git add apps/api/src/@E@/ apps/api/src/grading/investigator/
bash .superpowers/sdd/2026-09-25-grading-decision-core/x.sh git commit -m "feat(@E@): runner chạy decide() — đo tỉ lệ tự quyết, precision nhóm tự quyết, tỉ lệ mức trừ do máy quyết (§15.2, §4.2); gỡ n/a Q4"
```

---

### Task 8: Kiểm toàn bộ, review, lượt đo — **tốn tiền, cần chủ đồ án duyệt**

**Files:** không sửa code; thư mục lượt chạy dưới `apps/api/eval/runs/`.

- [ ] **Step 1: Kiểm toàn bộ**

```bash
bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh
JT_SANDBOX=1 bash .superpowers/sdd/2026-09-25-grading-decision-core/jt.sh
pnpm --filter api build && pnpm --filter api exec eslint "src/**/*.ts"
```

Expected: mọi thứ xanh; eslint 0 lỗi. Docker PHẢI chạy (không thì số test unit thiếu, và `test:sandbox` từ chối chạy).

- [ ] **Step 2: Code-reviewer cả nhánh** — theo luật handoff của `CLAUDE.md`. Không báo xong khi chưa có VERDICT.

- [ ] **Step 3: Ước chi phí và XIN DUYỆT**

Theo số đo bước 2 (`20260925T143704Z-b0bd340`): investigator khoảng 1,2 triệu token / 20 phút; baseline khoảng 0,3 triệu token / 12 phút. `decide()` không gọi thêm model. **Không chạy Step 4 khi chưa có câu "ok" của chủ đồ án.**

- [ ] **Step 4: Hai lượt trên cùng commit**

Worker dev + Redis local như bước 2 (`sandbox:worker:dev` với `SANDBOX_REDIS_URL=redis://localhost:6390 SANDBOX_PREFIX=cine-sbx-@E@`). Lệnh eval khớp luật quyền đã thêm ở bước 2:

```bash
bash .superpowers/sdd/2026-09-25-grading-decision-core/x.sh env ANTHROPIC_API_KEY= pnpm --filter api @E@ -- --pipeline=baseline --tier=full --split=dev --compare-to=20260925T142425Z-b0bd340
bash .superpowers/sdd/2026-09-25-grading-decision-core/x.sh env ANTHROPIC_API_KEY= SANDBOX_@EU@_REDIS_URL=redis://localhost:6390 pnpm --filter api @E@ -- --pipeline=investigator --tier=full --split=dev --compare-to=<mã lượt baseline vừa chạy>
```

- [ ] **Step 5: Nghiệm thu (§15.1 dòng bước 3, phần của 3a)**

- **Ba cổng cứng xanh** — đặc biệt `diem_toi_da` ở `ngoac-can-bang/E2`, `sap-xep/D2` (bài không biên dịch → luật nhóm test bắn → điểm < tối đa).
- **Không thoái lui** so với baseline cùng commit ở điểm và kết cục — khoảng tin cậy 95% của hiệu số ghép cặp không nằm hẳn dưới 0 (giờ `outcome_agreement` so được, Q4 hết hiệu lực).
- **§15.2:** precision luật ≥ 0,95, recall ≥ 0,80 (ước lượng điểm, kèm khoảng tin cậy); precision nhóm tự quyết ≥ 0,95 — **với Q1 = A, số lượt tự quyết trên fixture hiện có có thể là 0** (cả hai đề có tiêu chí độ phức tạp); khi đó ghi *"chưa đo được — mọi bài chặn ở tiêu chí hieu_nang tới bước 4"*, không ghi *"đạt"*.
- Báo **tỉ lệ mức trừ do máy quyết** (§4.2) và tỉ lệ tự quyết (báo cáo, không đặt sàn).

- [ ] **Step 6: Commit hai thư mục lượt chạy; ghi ledger**

```bash
bash .superpowers/sdd/2026-09-25-grading-decision-core/x.sh git add -f apps/api/@E@/runs/<mã baseline> apps/api/@E@/runs/<mã investigator>
bash .superpowers/sdd/2026-09-25-grading-decision-core/x.sh git commit -m "test(@E@): lượt đo bước 3a — lõi quyết định + baseline cùng commit"
```

---

## Self-Review

- **Độ phủ spec (phần của 3a):**

  | Yêu cầu | Task |
  |---|---|
  | §4.1 `DiagnosedError`, nguồn gốc, luật 1–3 | 1, 3 |
  | §4.1 `predicate` do code quyết (`test_group_failed`) | 2 |
  | §4.2 trần theo nguồn gốc, trọng số theo mức trừ, bài không lỗi | 4 |
  | §4.2 luật chưa có giá chặn tự quyết, gắn cờ đúng lỗi | 5 |
  | §4.2 MỘT công thức, θ từ env | 4, 5 |
  | §4.3 `passed === 0` → gắn cờ, trần 0,5, không tự 0 điểm | 5 |
  | §4.4 sàn trước trần; T-FLOOR-1/4/6; lớp `system`/`submission` | 5 (FLOOR-3, FLOOR-5, EMPTY-1 có từ bước 2) |
  | §4.5 hết giờ không phải sai kết quả (phần của 3a: không trừ) | 2 (Q3) |
  | §0.3 bài tự luận không bao giờ tự quyết | 5 |
  | §12.3 / §15.2 precision nhóm tự quyết, tỉ lệ mức trừ do máy quyết | 7 |
  | T-SRC-1/2, T-POL-2/3, T-FLOOR-1…6, T-CONF-1, T-AUTO-1, T-EMPTY-1, T-COMPILE-1, T-TIER-1/2 (phần thuần) | 2–5 |

  Ngoài 3a (đã xếp vào 3b–3f ở bảng đầu): T-MERGE-1, T-POL-1/4…8, T-RULE*, T-VER*, T-PIN-1, T-FIN*, T-REGRADE*, T-RULER*, T-SAMP*, T-AUDIT*, T-DEMOTE-1, T-PIPE-1, T-UI*.
- **Kiểu nhất quán:** `ErrorRule`, `DiagnosedError`, `Diagnosis`, `Decision`, `DecisionInput` định nghĩa một lần ở Task 1; Task 2–7 dùng nguyên. `RuleEntry` (của `investigate()`, cho model đọc) và `ErrorRule` (của `decide()`, có mức trừ và `predicate`) là HAI kiểu có chủ ý: model không bao giờ thấy mức trừ (§4.1).
- **Chỗ tôi không chắc, và cách plan xử lý:**
  - Q1–Q6 là chỗ spec im lặng hoặc viết với giả định công cụ bước 4–5 đã có; mỗi câu có khuyến nghị và task bị ảnh hưởng.
  - Task 7 Step 3 mô tả phần sửa `cli.ts` bằng lời kèm từng biểu thức, không chép lại cả khối in — khối đó dài và chỉ đổi vài dòng; người thực thi đọc `cli.ts` hiện tại (nhánh investigator và phần so) trước khi sửa.
  - Khuyến nghị Q1 = A làm tỉ lệ tự quyết của 3a trên fixture ≈ 0. Nếu chủ đồ án cần một con số tự quyết trước bước 4, cách đúng là thêm một đề fixture không có luật độ phức tạp (đổi `datasetHash` — mọi phép so sau đó phải so trên bộ mới), không phải nới Q1.
