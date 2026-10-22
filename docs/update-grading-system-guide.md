# Hệ thống chấm điểm — hướng dẫn cho người tiếp nhận (rev 4)

**Cập nhật:** 2026-10-22 (rev 4 — thay rev 3 ngày 2026-09-29) · **Trạng thái code:** `main` = `a643cae` (merge PR #92, nhánh `feat/cham-diem-duyet-nhanh-p1`, ngày 2026-10-21) · **Baseline của rev 3:** `main` = `4cb6bca` (332 commit trước đó)

Tài liệu này dành cho người **sẽ sửa code này sau tôi**. Nó mô tả hệ thống **như đang có** trên `main`, không phải thiết kế mong muốn. Chỗ nào chưa làm, nó nói thẳng là chưa làm. Chỗ nào chưa kiểm lại trong lượt này, nó ghi *(chưa xác minh)*.

**Tài liệu này được làm ra thế nào — để bạn biết tin tới đâu:**

- Đọc trực tiếp code của `apps/api/src/grading/` (195 file không tính test, 21.863 dòng), `grade-export/`, `calibration/`, và các controller. Các khẳng định về luật, ngưỡng, cờ, trạng thái, route và biến môi trường đều lấy từ mã nguồn hiện tại, không từ rev 3.
- **Đã chạy lại trong lượt này:** unit API (`npx jest`, `apps/api`): 1.897 pass · 7 skip. Vitest web (`apps/web`): 1.788 pass · **8 fail**, nằm ở 2 file (§9.2).
- **Chưa chạy lại:** e2e API, `test:sandbox`, `eval`, `rehearsal`. Số liệu của các mục đó lấy từ bản ghi đã có, và ghi rõ ngày.
- Không dùng GitNexus trong lượt này. Đường đi của luật và của điểm được đọc từ file (§10 bẫy 17 vẫn đúng: luôn truyền đường dẫn tuyệt đối nếu dùng).

> **Bốn tài liệu, bốn vai trò — đừng nhầm:**
>
> | File | Là gì | Khi nào đọc |
> |---|---|---|
> | `docs/superpowers/specs/2026-09-20-grading-agent-investigator-design.md` | **Spec đường điều tra.** Nguồn của mọi ký hiệu `§x.y` và mã test `T-…` trong code | Trước khi đổi một quyết định thiết kế |
> | `docs/superpowers/specs/2026-09-23-grading-ui-rebuild-design.md` | **Spec giao diện** (mã `T-UI-…`) | Trước khi đổi một màn hình |
> | `docs/superpowers/plans/2026-10-21-cham-diem-duyet-nhanh-p1.md` | **Plan của đợt duyệt nhanh** (tự chốt có cầu dao, kiểm mẫu, gom nhóm) | Khi đụng vào tự chốt, kiểm mẫu, cầu dao |
> | **File này** | **Bản đồ.** Cái gì nằm ở đâu, luồng ra sao, sửa gì thì sửa ở đâu, cái gì còn thiếu | Ngày đầu tiên |
>
> `docs/grading-system-guide.md` (rev 2) là bản đồ **đã lỗi thời** cho mọi phần trừ đường tự luận. `docs/AI-grading-architecture.md` vẫn là bản phác trước khi code.

---

## 0. Tóm tắt cho người quản lý sản phẩm

**Hệ thống làm gì.** Nhận một bài đã thu và ra **điểm bài thi**. Có hai đường chấm, gán một lần lúc bắt đầu chấm:

- **Bài code (C++, Python):** một agent điều tra chạy mã trong sandbox, tìm lỗi theo **bảng lỗi** của giảng viên. Code (không phải model) tính điểm theo **bảng giá** của giảng viên. Hệ thống **tự chốt** những bài đủ điều kiện, phần còn lại về giảng viên.
- **Bài tự luận:** một lượt chấm một-phát, đóng băng từ rev 2. Kết cục **luôn** về giảng viên duyệt.

**Chính sách hiện tại — khác rev 2 ở chỗ này.** Rev 2 nói "không chấm thay giảng viên". Câu đó **không còn đúng cho bài code**. Hệ thống tự chốt có điều kiện, và có ba lớp giám sát chạy song song:

1. **Điều kiện tự chốt** (`decision/decide.ts`): bài phải qua sàn bằng chứng, không có cờ nào, mọi lỗi đều có giá, và độ tin cậy đạt ngưỡng 0,85.
2. **Kiểm mẫu mù** (`grading/audit/`, `audit-sampling.ts`): một phần bài đã tự chốt bị rút ra (mặc định 20%, sàn 5%, rút theo sinh viên). Các bài này phải được giảng viên chấm mù trước khi chốt điểm.
3. **Cầu dao tự tắt** (`auto-breaker/`): khi giảng viên bất đồng với hệ thống trên một luật hoặc trên lớp bài không lỗi vượt mức thống kê cho phép, việc tự chốt cho phạm vi đó bị tắt. Chỉ giảng viên bật lại.

**Đã làm (kiểm bằng code):** đường điều tra, sàn bằng chứng, công thức tự chốt, bảng lỗi và bảng giá có phiên bản, gói test có phiên bản, lăng kính phản biện (4 cái), kiểm mẫu, cầu dao, gom nhóm xác nhận hàng loạt, chấm lại bài lỗi hệ thống, nhiều câu trong một phiên (file riêng; P1b chưa nghiệm thu, §11), xuất điểm ra file (không đổi trạng thái).

**Chưa làm (kiểm bằng code):** công cụ đo độ phức tạp cho agent; hiệu chỉnh (`calibration_run` không ai ghi); nhánh bài ảnh; trạng thái `exported` (không ai đặt); chi phí AI theo bài (`grading_attempt.cost_usd` không ai ghi). Chi tiết ở §11.

**Việc cần người có quyền quyết (§12):** chính sách số mẫu tối thiểu mỗi phiên (đang là đề xuất 2, chờ chủ đồ án); p0 và α của cầu dao (đang là giả thuyết 0,05 và 0,05); có đưa nhánh cải tiến lăng kính (A và E của đợt 1) vào `main` không — khuyến nghị hiện tại là không; xử lý 8 test web đang đỏ.

---

## 1. Ranh giới không được vượt

Rev 2 có bốn ranh giới. Bây giờ có sáu, và hai cái đã đổi nghĩa.

**① Model phán đoán, code đếm.**
- `one_shot`: provider chỉ trả `verdict` + `evidence`; điểm tính ở `enforceScoring()`.
- `investigator`: model chỉ trả `verdict = { errors: [{ ruleKey, toolCallIds }], missingRules, injectionAttempt }`. **Không có điểm, không có giá.** Mức trừ lấy từ bảng giá ở `computeScore()`. Luật **máy kiểm được** (`predicate = test_group_failed`) do code quyết từ kết quả `run_tests` đã lưu; đề xuất của model cho luật đó bị bỏ qua và ghi lại.

**② `confidence` do code quyết, không do model tự chấm.**
- `one_shot`: `applyGuards()` đo bằng đối chiếu dẫn chứng nguyên văn; trần bậc model là `Math.min`.
- `investigator`: trần theo **nguồn của từng lỗi** (§2.1), lấy trung bình có trọng số theo mức trừ (`decision/confidence.ts`).

**③ Phản biện — đổi nghĩa so với rev 2.**

| | `one_shot` Advocate | `investigator` lăng kính |
|---|---|---|
| Chạm vào điểm? | **Không bao giờ.** Ba lớp chặn: kiểu không có trường điểm · JSON schema không có · trigger `trg_grading_result_guard_ai_immutable` | **Có, một chiều.** Lăng kính `refuted` **loại lỗi khỏi điểm** (giữ trong hồ sơ, `counted: 'refuted'`) |
| Rào chặn | — | (a) `refuted` phải kèm **lần chạy thật** (`run`/`run_tests`) của chính lăng kính, không thì bị bỏ · (b) lỗi của luật **máy kiểm được miễn nhiễm**: không gửi cho lăng kính, và `decide()` cũng lọc lại · (c) im lặng **không phải đồng ý**: không lăng kính nào kết luận được → `unverified`, lỗi giữ trong điểm nhưng trần `confidence` 0,5 và gắn cờ · (d) hai lăng kính cấp bài (`bo_sot`, `gian_lan`) **chỉ gắn cờ**, không đổi điểm |
| Kết cục | Ý kiến, giảng viên quyết | Bài có lỗi `refuted` hoặc `unverified` **vẫn về giảng viên** (cờ lỗi không rỗng → không tự chốt) |

**④ `ai_total_score` ghi một lần, không bao giờ sửa** — nhưng "điểm hiện tại" là một **hàm**, không phải một ô.
- Trigger `guard_grading_result_ai_immutable` đóng băng 8 cột (§8.2). Với `investigator`, `ai_total_score` là điểm của **lượt tính đầu**.
- Đổi giá, sửa luật, bỏ một lỗi, cầu dao tắt… đều **thêm một dòng `score_computation`** (bảng chỉ-thêm). Điểm hiện tại đọc qua `scoring/current-score.ts::currentScore()`.
- `aiTotalScore` không bao giờ là điểm hiện tại của bài `investigator`. Màn nào đọc thẳng cột đó là bug.
- Security rule 6 vẫn giữ: sửa điểm bài = thêm dòng `teacher_review`, không ghi đè `grading_result`.

**⑤ Không có bằng chứng thì không có con số.** Một cuộc điều tra hỏng không cho điểm tối đa. Sàn bằng chứng (spec §4.4) được cài ở **hai** chỗ độc lập (`investigate()` và `decide()`), vì `decide()` được gọi lại trên hồ sơ đã lưu. Dưới sàn = `ungradable`, `confidence = 0`, **không dòng điểm**.

**⑥ Giá là của giảng viên, và model không thấy nó.** `bang-loi.md` trong workspace của agent chỉ có `rule_key`, mô tả, tiêu chí, và nhãn `[chưa có giá]`. Lăng kính `qua_tay` đo mức nặng bằng lời, không bằng số. Khoá ghép `(…, teacher_id)` ngăn một giá trỏ vào luật của giảng viên khác ở tầng DB.

---

## 2. Kiến trúc hiện tại

Sơ đồ này vẽ từ code. Đọc các đường nối giữa các hộp, không chỉ các hộp.

```
WEB (Next.js, apps/web)
  /teacher/grading               danh sách phiên → chuẩn bị → đang chạy → kết quả
  /teacher/grading/finalize      chốt điểm · xuất file điểm
  /teacher/grading/export        xuất điểm (G5)
  /teacher/grading/[resultId]    investigator → hồ sơ điều tra · one_shot → bàn chấm tự luận
  /teacher/rules · new · [id]    bảng lỗi, giá, trần tiêu chí, luật thiếu
  /teacher/rubrics               chỉ còn redirect sang /teacher/rules
        │
        ▼
API (NestJS) — 61 route khai báo trong 7 controller của grading/, @Roles('teacher')
  Chấm / tiến độ · điều tra · sửa điểm · chốt · kiểm mẫu · cầu dao · nhóm xác nhận
  Bảng lỗi · giá · waiver · gói test · đề nhiều câu · chấm lại · tham chiếu/đáp án
  (xuất điểm: grade-export/, 6 route riêng; nhật ký admin: 1 route, ngoài grading/)
        │
        ▼
HÀNG ĐỢI (BullMQ, Redis) — GradingProcessor
  concurrency 5 · 10 job/giây · attempts 3 · jobId = grade-{submissionId}
  Trần một job = investigate (300 s) + 60 s + pha phản biện (330 s) = 690 s (§7)
  Hết lượt thử → markUngradable(system) · 4xx (trừ 408/429) không thử lại
        │
        ▼
GradingService.gradeOneById() — rẽ nhánh theo grading_result.pipeline (gán một lần lúc startGrading)
  ├─ investigator (code_project + cpp/python):
  │    1. startAttempt — khoá giảng viên RỒI khoá hàng; nối lại lượt dở nếu có
  │    2. build context — đề bài, file mã, bảng lỗi, gói test đã ghim, ngôn ngữ, đề của câu
  │    3. investigate() — hàm thuần, ≤25 lời gọi công cụ · 12 vòng · 300 s · 150k token
  │    4. challenge — 4 lăng kính song song (tinh_dung, qua_tay | bo_sot, gian_lan)
  │    5. finishAttempt — MỘT transaction: computeScore → decide → ghi
  │         → auto_approved | audit_pending (rút mẫu) | flagged_for_review | ungradable
  └─ one_shot (mọi thứ còn lại, đóng băng): đọc file → prompt → guard → Advocate → enforceScoring → flagged_for_review
        │
        ▼
SAU CHẤM — giảng viên
  flagged_for_review  → xem từng bài, hoặc xác nhận cả nhóm (§3.4)
  audit_pending       → chấm mù, rồi xác nhận nhãn → teacher_reviewed → cầu dao (§3.2, §3.3)
  auto_approved       → không cần ai xem, trừ khi bị rút mẫu hoặc bị cầu dao tắt
        │
        ▼
CHỐT — finalizeGrades: từ chối (409) nếu còn bài ở BLOCKS_FINALIZE
  → finalized · xuất file điểm (grade_export_row, chỉ thêm; trạng thái `exported` chưa có người ghi)

TIER MODEL — hai cơ chế, không phải một
  TierChain (one_shot + Advocate): GRADING_TIER1…5 → Claude (nếu có ANTHROPIC_API_KEY) → sàn từ khoá
  ModelPool (điều tra + 4 lăng kính): CHỈ GRADING_TIER1…5, không Claude, không sàn

SANDBOX — worker riêng (apps/api/src/sandbox-worker), nói chuyện với API qua Redis
  C++17 (-O2, ASan+UBSan) · Python 3.12 · mỗi ca một container · không mạng khi chạy
  Runtime mặc định runc; runsc đã trượt buổi thử 2026-09-24 (§10 bẫy 5)

LƯU TRỮ — PostgreSQL schema examcollect · MinIO/S3 (bài nộp, đề, đáp án mẫu) · Redis (hàng đợi, sandbox, heartbeat)
```

### 2.1 `decide()` — một công thức tự chốt, ở một hàm

`apps/api/src/grading/decision/decide.ts`. Thuần: không DB, không model, không sandbox, không đọc env. Gọi lại được trên hồ sơ đã lưu khi bảng lỗi đổi. Hai tham số mới nhận từ nơi gọi là `autoNoErrorEnabled` và `autoBlockedRuleKeys` (cầu dao và công tắc khẩn cấp, §3.3).

```
tự chốt ⇔ bài code ∧ qua sàn ∧ mọi luật của mọi tiêu chí đã được xét
         ∧ không cờ cả bài ∧ không cờ lỗi ∧ confidence ≥ θ        (θ mặc định 0,85)
```

**Thứ tự kiểm là luật:**

1. Cuộc điều tra đã `ungradable` → `ungradable`.
2. Sàn gói test (chỉ đường điều tra): gói **rỗng**, hoặc còn ca **chưa có kết quả** → `ungradable`. *"Không có gì để trừ" không phải "không có gì sai".*
3. Cạn ngân sách (`max_tool_calls` · `max_rounds` · `max_wall` · `max_tokens`) mà **0 phát hiện** → `ungradable` (T-FLOOR-1).
4. `diagnose()` → danh sách lỗi có nguồn gốc. Từ phản biện: lỗi bị `refuted` loại khỏi điểm; lỗi `unverified` giữ trong điểm nhưng hạ trần.
5. `computeDeductionScore()` — số nguyên phần trăm điểm.
6. Cờ cả bài, cờ lỗi, `confidence`, cổng cầu dao.
7. Tự chốt chỉ khi `caseFlags` và `errorFlags` đều rỗng **và** `confidence ≥ θ − 1e-9`.

**Cờ cả bài (`caseFlags`)** — bài về `flagged_for_review`, nêu đích danh:

| Mã | Nghĩa |
|---|---|
| `criterion_untouched` | Tiêu chí có luật nhưng chưa xét hết: luật máy không đo được · luật lời tạo sau cuộc điều tra · luật máy bị dặn không đề xuất · agent chưa đọc file bài nộp nào |
| `criterion_without_rules` | Tiêu chí không có luật nào trỏ vào và giảng viên chưa đánh dấu "không có luật trừ" (waiver). Chấm trừ mà không luật thì tiêu chí luôn trọn điểm (T-FLOOR-6) |
| `nothing_passed` | Mọi ca đều không đạt (kể cả không biên dịch). Mâu thuẫn với chẩn đoán → giảng viên xem, không tự cho 0 (§4.3). Trần `confidence` 0,5 |
| `investigation_flag` | Cờ của cuộc điều tra: `replay_mismatch` · `replay_unverified` · `budget_exhausted` · `injection_suspected` · `evidence_rejected`. Cả năm chặn tự chốt. Cờ injection ghi kèm nguồn đã khớp (`injection_suspected:<nguồn>`) |
| `challenge_suspected` | Lăng kính cấp bài (`bo_sot` / `gian_lan`) nghi ngờ |
| `challenge_incomplete` | Lăng kính cấp bài **không kết luận được** (hết giờ, hết bậc model). Không phải "không có gì đáng ngờ": bài chưa được xét xong nên không tự chốt |
| `ruler_unverified` | Đáp án mẫu của đề chưa được kiểm chứng bằng chạy thử (§6.3b). Bài không tự chốt dù bằng chứng đủ |
| `not_code_pipeline` | Bài tự luận — không bao giờ tự chốt |
| `type_auto_disabled` | Lỗi thuộc luật đang bị cầu dao hoặc công tắc khẩn cấp chặn (một cờ cho mỗi khoá) |
| `no_error_auto_disabled` | Bài không lỗi trong khi tự chốt lớp bài không lỗi đang tắt |
| `low_confidence` | `confidence < θ` — chỉ thêm khi **không còn cờ nào khác** |

**Cờ lỗi (`errorFlags`)** — cũng đẩy cả bài về giảng viên, kèm luật đích danh:

| Mã | Nghĩa |
|---|---|
| `unpriced` | Luật chưa có giá. Lỗi vẫn thật, chỉ chưa có mức trừ; lỗi chưa giá không được quyết điểm |
| `refuted` | Lăng kính bác bỏ. Loại khỏi điểm, giữ trong hồ sơ |
| `unverified` | Không lăng kính nào kết luận được. Giữ trong điểm, trần `confidence` 0,5 |

**`confidence`** (`decision/confidence.ts`): trung bình có trọng số theo **mức trừ** của các lỗi có giá. Mỗi lỗi mang trần theo nguồn:

| Nguồn | Khi nào | Trần |
|---|---|---|
| `deterministic` | Luật máy kiểm, code quyết từ `run_tests` đã lưu | 1,0 |
| `llm_with_tools` | Model đề xuất, và trích ít nhất một lời gọi `run`/`run_tests` | 0,85 |
| `llm_only` | Model đề xuất, chỉ trích `read_file`/`list_files` | `min(0,5, trần bậc model)` |

Không lỗi nào có giá → `1` nếu độ phủ đầy đủ, `0` nếu không. Sau đó `min` với `confidenceCap` của cuộc điều tra (replay lệch → 0,5), với `nothing_passed` (0,5), và với `unverified` (0,5).

> **Hệ quả của trung bình có trọng số:** một lỗi chắc chắn có thể che một lỗi do model. Ví dụ có thật trong diễn tập: sai ca biên (deterministic) + thiếu chú thích (`llm_only`) cho ra độ tin cậy 0,875 ≥ 0,85, nên bài được tự chốt. Đây là điểm để cân nhắc khi đổi chính sách (§12), không phải lỗi cài đặt.

### 2.2 Điểm là **hàm** của chẩn đoán, bảng giá và rubric

`scoring/score-core.ts::computeScore()` thuần. `scoring/score.service.ts::ScoreService` là **chỗ duy nhất ghi `score_computation`**. Mọi thao tác của giảng viên gọi vào đây, trong transaction của chính nó.

| Giảng viên làm | `reason` của dòng tính | Tính lại cho |
|---|---|---|
| Tạo luật **máy kiểm** | `tier2_rule` | mọi bài chưa chốt của giảng viên (đo lại trên kết quả đã lưu) |
| Tạo luật **lời** | *(không)* | Không tính lại — luật lời chỉ được xét với bài có nó trong bảng lỗi **của chính bài đó** lúc điều tra bắt đầu (T-FAIR-1) |
| Sửa luật: tiêu chí hoặc điều kiện | `rule_revision` | mọi bài chưa chốt |
| Sửa luật: chỉ tên / mô tả | *(không)* | không |
| Đổi trạng thái luật | `rule_revision` | mọi bài chưa chốt |
| Đặt giá | `price_change` | bài chưa chốt có lỗi của luật đó |
| Waiver "tiêu chí không có luật trừ" | `criterion_waiver` | bài của rubric đó |
| Bỏ / giữ một lỗi cho riêng một bài | `error_exception` | chỉ bài đó; bài sang `teacher_reviewed` |
| Chấm tay cả bài | `teacher_review` kind `manual_score` | từ đó không lượt tính lại nào đổi điểm bài này |
| Áp giá mới cho phiên đã chốt | `finalized_reapply` | các bài đã chốt của phiên — chỉ đổi giá, cùng tập lỗi |
| *(nội bộ)* luật lời mà mọi bài của phiên đều đã thấy | `session_rule_set` | các bài còn lại của phiên |
| **Cầu dao tắt một phạm vi** | `auto_rule_tripped` | bài chưa chốt trong phạm vi bị tắt (trừ bài vừa được kiểm mẫu) |

Ba điều dễ sai:

- **Phiên đã chốt không đổi theo giá mới** — trừ khi có `reapply-prices`. Lượt tính lại tầng luật chỉ chọn bài ở `auto_approved`, `audit_pending`, `flagged_for_review`, `teacher_reviewed`. Bài `finalized` có `finalized_computation_id` trỏ đúng dòng đã công bố.
- **`exam_session.pinned_price_version_id` chỉ được ghi, không được đọc.** Hai chỗ ghi (`score.service.ts`, `teacher-review.service.ts`); chưa thấy chỗ đọc nào trong `src/`. Đừng dựa vào nó như cơ chế ghim giá.
- **Tính lại có thể đổi trạng thái.** `ruleLayerTransition`: lượt mới ra `auto` thì `flagged_for_review → auto_approved`; không thì `auto_approved → flagged_for_review`. Sửa một giá có thể đưa cả loạt bài sang "đã tự chốt" — §10 bẫy 15.

`tier3_rule` và `case_dropped` có trong enum nhưng không code nào ghi *(đã grep)*.

---

## 3. Tự chốt, kiểm mẫu, cầu dao, gom nhóm

Đây là phần mới nhất và ít người đọc nhất. Đọc trước khi đụng vào bất cứ thứ gì liên quan đến "tự chốt".

### 3.1 Rút mẫu kiểm (`grading/audit-sampling.ts`, `score.service.ts`)

- **Khi nào:** lúc bài có quyết định `auto` **lần đầu** (đường `writeInitial`). Bài được rút đi `auto_approved → audit_pending`. Bài thành tự chốt **sau** khi bị gắn cờ (`ruleLayerTransition`) không đi qua đường này, nên không bao giờ vào khung mẫu.
- **Quyết định rút là tất định:** `hash(seed phiên : MSSV chữ thường) < N × 100` (SHA-256). Không phụ thuộc điểm, để không ai chọn bài dễ. Bài cũ rút theo id bài (`auditBucket`) vẫn giữ nguyên cờ của nó.
- **Tỉ lệ:** `GRADING_AUDIT_SAMPLE_PERCENT`, mặc định **20**. Dưới **5** thì nâng lên 5 (sàn — dưới đây bộ hiệu chỉnh mất nguồn nhãn). Không hợp lệ thì mặc định kèm cảnh báo. **Dưới `NODE_ENV=test` thì tắt**, trừ khi biến được đặt tường minh.
- **Tối thiểu mỗi phiên:** `topUpSessionAudit` bảo đảm có ít nhất `AUDIT_MIN_PER_SESSION` sinh viên trong mẫu (mặc định **2**). Mã nguồn ghi rõ: *"Đề xuất 2, chờ chủ đồ án xác nhận"*. Chưa được xác nhận.
- **Bài rút mẫu:** `audit_pending`. Giảng viên phải chấm mù (§3.2) trước khi chốt — `BLOCKS_FINALIZE` chứa `audit_pending`.

### 3.2 Chấm mù và nhãn (`grading/audit/`, `audit-blind.ts`, `audit-compare.ts`)

1. Giảng viên mở bài `audit_pending` ở màn chấm mù: thấy bài nộp và các luật của bảng lỗi, **không thấy** kết luận của hệ thống. Route `POST grading-results/:id/audit-review`, và tải bài nộp qua `GET grading-results/:id/submission-download`.
2. Sau khi nộp nhận xét, hệ thống mở **bản tiết lộ** và so nhãn của giảng viên với chẩn đoán của hệ thống theo từng luật (`audit-compare.ts`, hàm thuần).
3. Bài chuyển `audit_pending → teacher_reviewed`. Nhãn được ghi vào bảng chỉ-thêm: `audit_rule_label` (một dòng cho mỗi luật được so) và `audit_no_error_label` (cho bài không lỗi, `agree` = giảng viên không chọn luật nào và không ghi lỗi khác).
4. Ngay trong cùng transaction, hệ thống chạy cầu dao (§3.3).

Nhãn kiểm mẫu được **giấu** khỏi danh sách và hồ sơ bài kiểm mẫu ở tầng API, và loại khỏi xem trước luật, xem trước giá, và số đếm luật.

### 3.3 Cầu dao tự chốt (`grading/auto-breaker/`)

**Cầu dao là chốt:** tắt rồi chỉ giảng viên bật lại. Không có bộ đếm nào tự mở lại.

- **Hai phạm vi:** `rule` (một luật của một giảng viên) và `no_error` (lớp bài không lỗi của một giảng viên).
- **Quy tắc tắt** (`breaker-verdict.ts`, hàm thuần): với `n` nhãn đã đếm từ lần bật lại gần nhất và `d` nhãn bất đồng, tính `P(X ≥ d | n, p0)` với `X ~ Binomial(n, p0)`, kiểm một phía. Tắt khi `p < α` (so sánh nghiêm ngặt). Hiện `p0 = 0,05` và `α = 0,05`, là **giả thuyết, chưa phải cam kết chất lượng** (spec §5.3). Một nhãn bất đồng đơn lẻ không đủ để tắt (ca n=1, d=1 cho p đúng 0,05 và không tắt).
- **Khi tắt:** ghi dòng `auto_rule_breaker` (phạm vi, luật, `n`, `d` lúc tắt), rồi tính lại mọi bài chưa chốt trong phạm vi đó bằng lý do `auto_rule_tripped`. Bài vừa được kiểm mẫu được trừ ra khỏi lượt tính lại.
- **Hiệu lực:** `decide()` nhận `autoBlockedRuleKeys` và `autoNoErrorEnabled` đã gồm cầu dao đang mở. Bài có lỗi thuộc luật bị tắt nhận cờ `type_auto_disabled`; bài không lỗi trong lớp bị tắt nhận `no_error_auto_disabled`.
- **Bật lại:** `POST auto-breakers/:id/reset`, chỉ giảng viên sở hữu cầu dao (người khác nhận 404). Bài đã về duyệt giữ nguyên tới khi được tính lại hoặc được duyệt. Nhãn trước lần bật lại không còn đếm.
- **Công tắc khẩn cấp (env):** `GRADING_AUTO_BLOCK_RULE_KEYS` (danh sách khoá luật, áp cho mọi giảng viên) và `GRADING_AUTO_NO_ERROR` (`true`/`false`, mặc định `true`). Đặt giá trị vô nghĩa thì mặc định kèm cảnh báo, không im lặng.

### 3.4 Gom nhóm và xác nhận hàng loạt (`grading/review-group/`)

- Bài `flagged_for_review` được gom theo **luật**, khoá `${rubric_id_version}:${ruleId}` — cùng luật ở hai rubric là hai nhóm. Ngoài các nhóm theo luật có hai nhóm đặc biệt: **"Bài có nhiều lỗi"** và **"Hệ thống không tìm thấy lỗi nào"**.
- Mỗi nhóm hiện tối đa **3 bài mẫu** (`REVIEW_GROUP_SAMPLE_SIZE`) để giảng viên xem trước khi xác nhận cả nhóm.
- `POST exam-sessions/:id/review-groups/confirm`: xác nhận hàng loạt chuyển `flagged_for_review → teacher_reviewed`, ghi một dòng `teacher_review` kind `bulk_accept`. Xác nhận nhóm **không khoá** bài khỏi lượt tính lại; chỉ `manual_score` khoá (§2.2).

### 3.5 Bộ kiểm tra tất định cho luật phong cách (`grading/style-checks/`) — chưa nối

Hai luật phong cách (`thieu_chu_thich`, `ten_bien_vo_nghia`) hiện do model đánh giá (`llm_only`). Có sẵn hàm `shadowStyleVerdict()` để chạy **chế độ bóng**: chỉ ghi để đo, không ảnh hưởng điểm hay tự chốt. **Hàm này chưa có người gọi trong `src/`** *(đã grep)*. Muốn đo thì phải gắn nó vào đường chấm — quyết định cần người có quyền chốt.

---

## 4. Một bài đi qua hệ thống

```
Giảng viên bấm "Bắt đầu chấm"
  POST /exam-sessions/:id/start-grading
  │  • cần rubric đã ghim vào phiên (400 nếu chưa)
  │  • phiên có bài code mà chưa ghim gói test → 400 TRƯỚC khi ghi dòng nào
  │  • cổng đề cương: cần `blueprint_confirmed_at` của phiên (kiểm trong grading-run.service.ts; cổng mới từ b5ec52e)
  │  • tạo ĐỒNG BỘ một dòng grading_result (ai_grading) cho mỗi bài collected,
  │    gán pipeline = pipelineFor(loại, ngôn ngữ khai) MỘT lần
  │  • đẩy MỘT job mỗi bài (jobId = grade-{submissionId})
  ▼
GradingProcessor → GradingService.gradeOneById()
  │  thoát sớm nếu dòng đã có ai_total_score (job lặp)
  ├─ one_shot → gradeOne()  — đóng băng, luôn flagged_for_review
  └─ investigator → InvestigatorRunService.run(resultId)
       1. startAttempt      khoá giảng viên RỒI khoá hàng; mở lượt, hoặc nối lượt dở
       2. kiểm cấu hình     thiếu sandbox / bậc model → finishUngradable(system)
       3. build context     ngôn ngữ, gói test đã ghim, đề bài (chữ), file mã, bảng lỗi,
                            đề của câu (resolveProblemConfig) → bang-loi.md
       4. investigate()     vòng lặp có công cụ; hồ sơ = toolCalls + structuredResults
       5. challenge         4 lăng kính song song; mỗi lăng kính ≤300 s, 6 vòng, 8 lời gọi
       6. finishAttempt     MỘT transaction: computeScore → decide → ghi
            score_computation 'initial' → ai_total_score → ai_grading → ai_graded
            → auto_approved | audit_pending (rút mẫu) | flagged_for_review | ungradable
            + topUpSessionAudit (đủ sinh viên tối thiểu trong mẫu)
```

**Vì sao `grading_result` được tạo đồng bộ trước khi xếp hàng:** để `progress()` đếm được ngay, để `finalizeGrades` không bỏ sót bài chưa được nhặt (`BLOCKS_FINALIZE` chứa `ai_grading`), và để job idempotent. Cũng là lý do tiến độ sống sót khi Redis mất sạch — `regrade-stuck` đọc Postgres.

**Vì sao khoá giảng viên trước khoá hàng:** mọi lượt tính của một giảng viên xếp hàng qua `lockTeacherScoring` (advisory lock). Không có nó, một lượt tính đầu đọc bảng giá cũ trong lúc một lượt sửa giá chưa commit. Thứ tự khoá là luật — §10 bẫy 16.

### 4.1 Kết cục của một bài code

| Kết cục | Trạng thái | Điểm | Giảng viên thấy |
|---|---|---|---|
| **Tự chốt** | `auto_approved` | có | Không cần xem; chốt thẳng (`finalizedDirectly`) |
| **Rút mẫu kiểm** | `audit_pending` | có | Phải chấm mù trước khi chốt (§3.2) |
| **Cần bạn xem** | `flagged_for_review`, `ungradable_class = null` | có | Kèm cờ nêu đích danh; xem từng bài hoặc theo nhóm (§3.4) |
| **Không chấm được — lớp `system`** | `flagged_for_review` + `system` | **không** | Lỗi hạ tầng hoặc cấu hình. Sửa xong thì **chấm lại được** (`POST grading-results/:id/regrade`, hoặc cả phiên qua `regrade-ungradable`) |
| **Không chấm được — lớp `submission`** | `flagged_for_review` + `submission` | **không** | Lỗi của bài. Chấm lại ra đúng kết quả cũ → chấm tay |

`ck_grading_result_ungradable`: một dòng mang điểm **hoặc** mang lớp lý do, không cả hai. Bài được chấm lại thì lớp lý do bị xoá.

### 4.2 Bài không chấm được — lý do và lớp

Danh sách rút gọn. Cái nào là `submission` thì chấm lại vô ích; cái nào là `system` thì sửa rồi chấm lại được.

| Lớp | Lý do | Sinh ở |
|---|---|---|
| `system` | Chưa cấu hình `SANDBOX_REDIS_URL` và/hoặc bậc `GRADING_TIER*` | `investigator-run.service.ts` |
| `system` | Ngôn ngữ khai không phải `cpp`/`python` (phòng thủ — `pipelineFor` đã đưa bài đó sang `one_shot`) | `investigation-context.service.ts` |
| `system` | Phiên chưa ghim gói test | `investigation-context.service.ts` |
| `system` | Đề bài chưa đọc được thành chữ — cần DOCX hoặc TXT (§10 bẫy 11) | `investigation-context.service.ts` |
| `system` | Bài nộp chưa có file / không đọc được từ kho lưu trữ | `investigation-context.service.ts` |
| `system` | Bài nộp không gửi được sang sandbox — tên file có dấu, file quá lớn, tên ca test quá dài (§10 bẫy 12) | `investigator/tools.ts::programProblem` |
| `system` | Gói test: nhóm > 200 ca · gói rỗng · chưa chạy đủ ca | `tools.ts`, `investigate.ts`, `decide.ts` |
| `system` | 0 lời gọi công cụ thành công · mọi bậc model hỏng · hết giờ hoặc vòng trước khi có kết luận đọc được | `investigate.ts` |
| `system` | Cạn ngân sách mà 0 phát hiện (T-FLOOR-1) | `decide.ts` |
| `system` | Job hết lượt thử (`attempts: 3`) | `grading.service.ts::markUngradable` |
| `submission` | Bài rỗng (T-EMPTY-1) | `tools.ts::programProblem` |
| `submission` | Bài nộp dạng RAR (chỉ đọc ZIP) · không phải file văn bản | `pipeline/source-files.ts` |
| `submission` | File nén bị từ chối (đường dẫn thoát ra ngoài, symlink, quá lớn, bom giải nén) · không có file mã nguồn · Python nhiều file mà không có `main.py` | `pipeline/source-files.ts` |

---

## 5. Bản đồ file

`apps/api/src/grading/` — **195 file, 21.863 dòng** (không tính test). Rev 3: 133 file, 15.592 dòng.

| Thư mục / file | File | Trách nhiệm | Ghi chú |
|---|---|---|---|
| `grading.controller.ts` | 31 route | Chấm, tiến độ, điều tra, sửa điểm, chốt, kiểm mẫu, nhóm xác nhận, đề, cầu dao | `admin` không có route nào ở đây — cố ý |
| `audit/` | 2 route | Chấm mù, tải bài nộp kiểm mẫu | `audit-review.service.ts`, `audit-compare.ts` |
| `auto-breaker/` | — (route nằm ở `grading.controller.ts`: GET và reset) | Cầu dao: đếm nhãn, quy tắc tắt, hạ bậc, bật lại | `breaker-verdict.ts` thuần |
| `review-group/` | — (route nằm ở `grading.controller.ts`: GET và confirm) | Gom nhóm, xác nhận hàng loạt | `review-group.ts` thuần |
| `problem/` | 3 route | Nhiều câu trong một phiên: thêm, bỏ, xác nhận đề cương | `resolve-problem-config.ts`, `student-total.ts` |
| `regrade.controller.ts` | 2 route | Chấm lại bài lỗi hệ thống | `regrade.service.ts` — dùng UPDATE trực tiếp, không qua `advanceStatus` (§10 bẫy 20) |
| `rules/rules.controller.ts` | 8 route | Luật, tách luật, trạng thái, waiver | |
| `rules/rubric-errors.controller.ts` | 8 route | Bảng lỗi theo rubric: gán, sao chép, giá | Nền của bảng lỗi hiện tại |
| `test-bundle/` | 7 route | Gói test: tạo, duyệt, ghim, chạy thử, bỏ ca | `test-run.service.ts` |
| `grading-run.service.ts` | — | `startGrading`, `regradeStuck`, `progress` | Tạo dòng đồng bộ, gán `pipeline`, chặn phiên code thiếu gói test |
| `grading.service.ts` | — | Bộ rẽ nhánh `gradeOneById`, `gradeOne` (one_shot), `markUngradable`, `listForSession` | Đã vượt trần 500 dòng của CLAUDE.md; phần one_shot là ứng viên tách |
| `pipeline.ts` | 17 dòng | `pipelineFor()` — luật gán đường chấm | `INVESTIGATOR_LANGUAGES = {cpp, python}` |
| `pipeline/` | 6 file | Context điều tra, sandbox, bảng lỗi → `bang-loi.md`, đọc bài nộp | |
| `investigator/` | 31 file | Vòng điều tra, công cụ, prompt, `ModelPool`, ngân sách, phản biện, lăng kính | `LENS_BUDGET` là hằng số trong `lens-loop.ts` |
| `decision/` | 7 file | `decide.ts`, `diagnose.ts`, `predicates.ts`, `confidence.ts`, `threshold.ts`, `types.ts` | **Thuần.** Đọc trước tiên |
| `scoring/` | 11 file | `score-core.ts`, `score.service.ts` (chỗ duy nhất ghi `score_computation`), `current-score.ts`, `score-inputs.ts` | |
| `lifecycle/` | 2 file | `grading-transitions.ts` (bản code của trigger), `advance.ts` | |
| `rules/` | 17 file | Bảng lỗi, giá, waiver, đề xuất luật, đếm, tách luật | Luật của người khác → 404 (T-POL-8) |
| `review/` | 3 file | Bỏ/giữ một lỗi, chấm tay | |
| `teacher-review.service.ts` | — | `review()` (one_shot), `finalizeGrades()` (cả hai đường) | |
| `bulk-review.service.ts` · `bulk-rules.ts` | — | Luật hàng loạt | Chỉ one_shot; bài code bị bỏ qua |
| `audit-sampling.ts` · `audit-blind.ts` | — | Rút mẫu (thuần); làm mù kết quả | |
| `content-resolver/` | 3 file | Đọc đề và bài nộp (tài liệu, bài nộp) | Chưa có resolver ảnh |
| `style-checks/` | 4 file | Bộ kiểm tra tất định cho luật phong cách | Chưa nối (§3.5) |
| `ai-provider/` | 18 file | Provider OpenAI-compatible, Claude, TierChain, phân loại lỗi | `select-grading-provider.ts` |
| `harness/` | 3 file | Guard G1–G3, envelope, evidence-check | `wrapSubmission` bọc cả đầu ra công cụ |
| `grade-export/` (ngoài `grading/`) | nhiều | Xuất điểm: kế hoạch, diff, ghi, file | `grade_export_row` chỉ thêm |
| `calibration/` (ngoài `grading/`) | 1 entity | `calibration_run` | **Chỉ có entity**, không ai ghi (§11) |
| `sandbox/` · `sandbox-worker/` (ngoài) | — | Hợp đồng và client · worker chạy trên máy khác | |
| `eval/` · `eval/rehearsal/` (ngoài) | — | Bộ đo và diễn tập | §9 |

### 5.1 Vì sao ranh giới file nằm ở đó

- **`decision/` và `score-core.ts` là hàm thuần.** Đó là thứ cho phép tính lại điểm trên hồ sơ đã lưu và cho eval chạy không cần DB. `decision.import-scan.spec.ts` khoá điều đó bằng test.
- **`sandbox/contract.ts` chỉ import `zod`.** Worker chạy trên máy khác và không được mang theo cả API.
- **`investigate()` tách khỏi `challenge()`:** phản biện ghép bên ngoài, nên eval tiêm được lỗi giả vào giữa.
- **`score.service.ts` là chỗ duy nhất ghi `score_computation`.** Nếu bạn thấy mình sắp `INSERT INTO score_computation` ở chỗ khác, dừng lại.
- **`provider-failure.ts`, `env.ts` và các file kiểu là leaf** — không import gì. `pnpm check:cycles` phải in 0 (đã chạy lại: 0 vòng).

---

## 6. Chuỗi model

Việc model nào chấm được quyết ở **hai** chỗ:

| | `one_shot` + Advocate | `investigator` + bốn lăng kính |
|---|---|---|
| Cơ chế | `TierChain` (`ai-provider/tier-chain.ts`) qua `selectGradingProvider()` | `ModelPool` (`investigator/model-pool.ts`) qua `buildInvestigatorTiers()` |
| Bậc | `GRADING_TIER1…5_*` → Claude (nếu có `ANTHROPIC_API_KEY`) → sàn từ khoá | **Chỉ** `GRADING_TIER1…5_*`. Không Claude, không sàn |
| Hết bậc | Không xảy ra — sàn luôn có | `ungradable(system)`. Không rơi về đếm từ |
| Trần `ceiling` | Trần của bậc đã trả lời → `Math.min` với guard | **Chỉ** kéo nguồn `llm_only` xuống (`min(0,5, ceiling)`). Trần model không áp cho `deterministic` hay `llm_with_tools` |
| Bậc chết | Breaker nghỉ 60s, thăm dò half-open | Loại **trong vòng lặp đó**. Điều tra và từng lăng kính mỗi bên dựng `ModelPool` riêng |
| Lỗi thoáng qua | Ném cho BullMQ chạy lại cả job | Thử lại trong bậc ≤2 lần (nghỉ 1s, 2s) |
| Đồng hồ | Trần job | `deadline` cứng: mỗi lượt thử chỉ được `min(timeout, phần còn lại)`; còn < 1s thì ném `DeadlineExceeded` |

Hệ quả đáng biết:

- **Không có Claude vẫn có tự chốt** — nếu có luật máy kiểm (`deterministic`, trần 1,0) hoặc lỗi có lời gọi công cụ chống lưng (`llm_with_tools`, 0,85).
- **Bốn lăng kính dùng lại các bậc của đường chấm,** nghĩa là cùng họ model chấm và phản biện. `model-family.ts::warnIfSameFamily` cảnh báo lúc khởi động. Đây là đánh đổi có ý thức cho một demo, không phải sự cố.
- **Cảnh báo "không có bài nào được tự duyệt" lúc khởi động** (`select-grading-provider.ts`, khi trần cao nhất của các bậc < 0,85) nằm trong logic của đường một-phát. Trong diễn tập 22/10 cảnh báo này xuất hiện nhưng đường điều tra vẫn tự chốt 7–8 bài mỗi lượt. Đọc từ code: đường điều tra không dùng trần đó. *(chưa xác minh đầy đủ)*
- `GRADING_TIERn_*` khai thiếu một trong ba biến → bậc đó bị bỏ qua và ghi log.
- Dưới `NODE_ENV=test`, `buildInvestigatorTiers()` trả `[]` và `selectGradingProvider` trả sàn từ khoá — test **không bao giờ** gọi API tính tiền.

Circuit breaker và ba rổ lỗi (`transient` / `tier_dead` / `bad_output`, `provider-failure.ts`) giữ nguyên như rev 2. `ModelPool` dùng đúng `classifyProviderFailure`.

---

## 7. Cấu hình

Tất cả biến đọc từ `process.env` trong code chạy thật (không tính test). Giá trị mặc định lấy từ code.

**Chấm điểm và hàng đợi**

| Biến | Mặc định | Tác dụng |
|---|---|---|
| `GRADING_TIERn_BASE_URL` / `_MODEL` / `_API_KEY` | — | Một bậc. Cần đủ ba; thiếu thì bỏ qua bậc và ghi log. Tối đa 5 bậc |
| `GRADING_TIERn_CEILING` | `0.5` | Trần `confidence` của bậc. Chỉ kéo được `llm_only`. Giá trị không hợp lệ → `0.5` |
| `ANTHROPIC_API_KEY` | — | Bật bậc Claude của đường một-phát và Advocate |
| `CLAUDE_GRADER_MODEL` · `CLAUDE_ADVOCATE_MODEL` | `occ/claude-sonnet-4-6` · `occ/claude-opus-5` | Model của bậc Claude |
| `GRADE_CONCURRENCY` | `5` | Job song song |
| `GRADE_RATE_MAX` / `GRADE_RATE_DURATION_MS` | `10` / `1000` | Thông lượng |
| `GRADE_JOB_TIMEOUT_MS` | *tính:* `INVESTIGATE_MAX_WALL_MS + 60 000 + CHALLENGE_PHASE_BUDGET_MS` = **690 000** | Trần một job. Đặt tay thì không đi theo các số kia (§10 bẫy 10) |
| `GRADING_ADVOCATE_TIMEOUT_MS` | `150000` | Trần một lời gọi Advocate (one_shot) |
| `GRADING_AUTO_THRESHOLD` | `0.85` | θ của công thức tự chốt. Không hợp lệ (không phải số trong (0, 1]) → mặc định kèm cảnh báo |
| `GRADING_AUTO_NO_ERROR` | `true` | Công tắc khẩn cấp: `false` = bài không lỗi luôn về giảng viên. Giá trị khác `true`/`false` → mặc định kèm cảnh báo |
| `GRADING_AUTO_BLOCK_RULE_KEYS` | rỗng | Công tắc khẩn cấp: danh sách khoá luật, phân tách bằng dấu phẩy, bị chặn tự chốt cho mọi giảng viên |
| `GRADING_AUDIT_SAMPLE_PERCENT` | `20` (sàn `5`) | Tỉ lệ rút mẫu kiểm. Dưới `NODE_ENV=test` tắt, trừ khi đặt tường minh |
| `AUDIT_MIN_PER_SESSION` | `2` | Số sinh viên tối thiểu trong mẫu mỗi phiên. **Chờ chủ đồ án xác nhận** |
| `GRADING_ANCHORS_ENABLED` | `false` | Anchor (one_shot). `=== 'true'` |

**Cuộc điều tra** (`investigator/budget.ts`)

| Biến | Mặc định |
|---|---|
| `INVESTIGATE_MAX_TOOL_CALLS` | `25` |
| `INVESTIGATE_MAX_WALL_MS` | `300000` |
| `INVESTIGATE_MAX_TOKENS` | `150000` |
| `INVESTIGATE_MAX_ROUNDS` | `12` |

**Lăng kính phản biện** (hằng số trong `investigator/lens-loop.ts`, không đọc env): `maxRounds` 6 · `maxToolCalls` 8 · `maxWallMs` 300 000 · `maxTokens` 30 000. Pha phản biện cộng `CHALLENGE_PHASE_BUDGET_MS` = 330 000 vào trần job.

**Sandbox** (`sandbox-worker/config.ts`; phía API chỉ đọc hai biến đầu)

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `SANDBOX_REDIS_URL` | — | API: không đặt → `sandbox: null`, bài code ra `ungradable(system)`. Worker: không khởi động |
| `SANDBOX_PREFIX` | `cine-sbx` | Tiền tố khoá; ACL giới hạn user vào `~cine-sbx:*` |
| `SANDBOX_RUNTIME` | `runc` | `runc` hoặc `runsc`. `runsc` trượt buổi thử 2026-09-24 |
| `SANDBOX_TIMING_CPUSETS` | — | Không đặt → không ghim lõi, kèm cảnh báo |
| `SANDBOX_GENERAL_CPUSET` · `SANDBOX_CONCURRENCY` | phần còn lại · `max(1, …)` | |
| `SANDBOX_IMAGE_CPP` · `SANDBOX_IMAGE_PYTHON` | `cine-sandbox-cpp:1` · `cine-sandbox-python:1` | |
| `SANDBOX_WORK_DIR` · `SANDBOX_ALLOWED_DOWNLOAD_HOSTS` · `SANDBOX_ALLOW_HTTP_DOWNLOADS` | `<tmp>/cine-sandbox` · rỗng · `false` | |
| `SANDBOX_EVAL_REDIS_URL` · `SANDBOX_EVAL_PREFIX` · `SANDBOX_TRUSTED_HOSTS` | — | Của eval. Eval từ chối chạy dưới `NODE_ENV=test` |

Worker thoát mã 2 nếu env có (giá trị không rỗng) `ANTHROPIC_*`, `OPENAI_*`, `GRADING_TIER<n>_API_KEY`, `DATABASE_*`, khoá kho lưu trữ, `*_TOKEN_SECRET`, `REDIS_URL/HOST/PASSWORD/USERNAME`, `GITHUB_TOKEN`/`GH_TOKEN`. Máy chạy bài của sinh viên không được cầm chìa nào.

> ⚠️ **`apps/api/.env.example` lệch với mặc định:** dòng 137–143 ghi `GRADE_JOB_TIMEOUT_MS=450000` (7,5 phút). Mặc định thật là 690 000. Nếu copy file mẫu thành cấu hình thật, job sẽ bị giết trước khi pha phản biện kịp ghi ý kiến (§10 bẫy 10).

> ⚠️ **`=== 'true'` chứ không `Boolean(...)`; `Number('')` là `0`.** Dùng `envPositiveInt()` (`grading/env.ts`) cho số nguyên dương.

---

## 8. Dữ liệu

### 8.1 Bảng

| Bảng | Vai trò |
|---|---|
| `rubric` / `rubric_criterion` | `unique(teacher_id, name, version)`. Tiêu chí có `key` (`^[a-z0-9_]{1,64}$`), đặt lúc tạo, không sửa. Không route update: chỉ tạo version mới |
| `exam_problem` | **Một dòng mỗi câu** của phiên (`unique(exam_session_id, ordinal)`). Mỗi câu có rubric riêng (co giãn từ rubric mẫu) và gói test riêng. Phiên cũ được gán câu mặc định bằng backfill |
| `grading_reference` | Đề bài + đáp án mẫu của phiên. Cột `ruler_trust` (`teacher` / `verified` / `unverified`, migration 1789600000000). `model_answer_origin` ∈ `teacher` / `authoring` / `generated`; `model_answer_unverified` khi đề do model sinh và chưa chạy thử |
| `grading_test_bundle` / `grading_test_case` | Gói test có phiên bản, duyệt một lần, ghim vào phiên. Ca chỉ thêm. `origin` ∈ `teacher` / `from_model_answer` / `generated` |
| `grading_test_run` | Kết quả chạy thử một ca hoặc cả gói (có `cost_usd`) |
| `grading_result` | Một dòng mỗi bài. Có `pipeline`, `current_attempt_id`, `ungradable_class`, `audit_sampled(_at)`, `finalized_computation_id`, `finalized_by/at`, mốc mở bài (`opened_at`, ghi một lần, migration 1789700000000) |
| `grading_attempt` | Một lần chạy = một dòng. Chứa `investigation` (jsonb), `model_used`, `tokens_in/out`, `sandbox_host`, `prompt_version`, `usage_by_model`. Bất biến sau khi có `outcome`. **`cost_usd` có cột, chưa thấy người ghi** |
| `score_computation` | Chỉ thêm. Mỗi lần tính một dòng: `reason`, `score` (NULL nếu dưới sàn), `breakdown` (jsonb), `price_table_version_id`, `test_bundle_id` |
| `error_rule` / `error_rule_revision` | Luật của giảng viên. `state` ∈ `proposed` / `active` / `dismissed` / `retired`. Không xoá; sửa = bản sửa mới. `predicate` (jsonb) là một trong bốn mẫu đóng |
| `rubric_error` (và bảng áp dụng) | Gán luật vào tiêu chí của một rubric cụ thể. Nền của màn Bảng lỗi theo rubric (migration 1789550000000) |
| `price_table_version` / `rule_price` | Bảng giá có phiên bản; `deduction` NULL = chưa có giá. Sửa một giá = chép cả bảng + giá đổi |
| `criterion_waiver` | "Tiêu chí này không có luật trừ". Gỡ được một lần |
| `teacher_review` | `kind` ∈ `review` / `error_exception` / `manual_score` / `bulk_accept` |
| `audit_sample_review` | Nhận xét kiểm mẫu (chấm mù) |
| `audit_rule_label` | Nhãn kiểm mẫu theo luật (chỉ thêm). Đầu vào của cầu dao |
| `audit_no_error_label` | Nhãn kiểm mẫu cho bài không lỗi (chỉ thêm). Đầu vào của cầu dao lớp không lỗi |
| `auto_rule_breaker` | Cầu dao: phạm vi (`rule` / `no_error`), luật, `evidence` (n, d lúc tắt), `tripped_at`, `reset_at`, `reset_by`. Có ràng buộc `reset_after_trip` |
| `grade_export_row` | Dòng điểm đã làm tròn và xác nhận cho xuất file (chỉ thêm). Migration 1789530000000 |
| `ai_usage` | Vết chi phí AI — hiện thuộc soạn đề (`exam-authoring`), không phải chấm điểm |
| `calibration_run` | **Chỉ có entity** — không ai ghi |

### 8.2 Trigger và ràng buộc ép ở tầng DB

| Trigger / hàm | Ép điều gì |
|---|---|
| `validate_grading_result_lifecycle` | Đi đúng 15 cặp trạng thái của §8.3. Sang `finalized` phải có `finalized_by`; `flagged_for_review → ai_grading` chỉ cho bài lớp `system` và chưa có điểm; `pipeline` không bao giờ đổi |
| `guard_grading_result_ai_immutable` | Đóng băng 8 cột ngay khi `ai_total_score` có giá trị: `ai_total_score`, `criterion_results`, `model_used`, `confidence`, `advocate_opinion`, `advocate_outcome`, `context_used_question`, `context_used_model_answer` |
| `guard_rubric_criteria_immutable` | Cấm sửa/xoá tiêu chí khi đã có `grading_result` trỏ tới version đó |
| `guard_grading_attempt_immutable` | Lượt đã có `outcome` thì bất biến; cấm DELETE |
| `guard_append_only` | Ca gói test, `score_computation`, bản sửa luật, phiên bản giá, giá, nhãn kiểm mẫu, và các bảng chỉ-thêm khác |
| `guard_no_delete` | `error_rule`, `criterion_waiver`, `grading_test_bundle` |
| `guard_test_bundle_approve_once` · `guard_criterion_waiver_revoke_once` | Gói chỉ đổi một lần khi duyệt; waiver chỉ gỡ một lần |
| **Khoá ngoại ghép** | `rule_price → (…, teacher_id)` · `exam_session → (test_bundle_id, id)` · `grading_result → (current_attempt_id, id)` · `score_computation → (attempt_id, grading_result_id)` · `exam_session.pinned_price_version_id → (…, teacher_id)` |

> Mã lỗi `object_not_in_prerequisite_state` mà các guard ném **không được `PostgresExceptionFilter` map** — chạm tới nó là một 500. Vì thế các service tự kiểm điều kiện trước khi ghi, và trigger chỉ là lưới cuối.

### 8.3 Máy trạng thái của `grading_result`

Tám trạng thái, mười lăm cặp. Bản code: `lifecycle/grading-transitions.ts`. Bản DB: `validate_grading_result_lifecycle` (`1789460000000`). `grading-lifecycle-v2.e2e-spec.ts` đi qua mọi cặp.

| # | Cặp | Ai đi cạnh này |
|---|---|---|
| 1 | `ai_grading → ai_graded` | `ScoreService.writeInitial` · `gradeOne` (one_shot) |
| 2 | `ai_grading → flagged_for_review` | `closeUngradable` · `markUngradable` |
| 3 | `ai_graded → auto_approved` | `writeInitial` — kết quả tự chốt |
| 4 | `ai_graded → flagged_for_review` | `writeInitial` · `gradeOne` (one_shot, luôn) |
| 5 | `auto_approved → audit_pending` | `writeInitial` và `topUpSessionAudit` (rút mẫu, §3.1) |
| 6 | `audit_pending → teacher_reviewed` | `AuditReviewService.record` (chấm mù, §3.2) |
| 7 | `auto_approved → flagged_for_review` | `ruleLayerTransition` — tụt cấp khi luật/giá đổi, hoặc cầu dao tắt |
| 8 | `audit_pending → flagged_for_review` | `ruleLayerTransition` — bài rút mẫu không còn tự chốt |
| 9 | `flagged_for_review → auto_approved` | `ruleLayerTransition` — thăng cấp (không có `ungradable_class`) |
| 10 | `flagged_for_review → ai_grading` | `RegradeService` — UPDATE trực tiếp có điều kiện, không qua `advanceStatus` (chấm lại lớp `system`) |
| 11 | `auto_approved → teacher_reviewed` | `setErrorException` · `setManualScore` · `review` (one_shot) |
| 12 | `flagged_for_review → teacher_reviewed` | như #11 · `ReviewGroupConfirmService` (xác nhận nhóm) |
| 13 | `auto_approved → finalized` | `finalizeGrades` — bài tự chốt, không qua review |
| 14 | `teacher_reviewed → finalized` | `finalizeGrades` |
| 15 | `finalized → exported` | **không ai** — xuất file (`grade_export`) không đổi trạng thái |

`BLOCKS_FINALIZE` = `ai_grading` · `ai_graded` · `flagged_for_review` · `audit_pending`. `finalizeGrades` từ chối (409) nếu còn bài ở đó.

### 8.4 Thêm một cột AI mới?

Phải thêm nó vào `AI_OUTPUT_COLUMNS` trong `database/migrations/support/ai-immutable-guard.ts` và dựng lại trigger bằng `rebuildAiImmutableGuardSql()` — không viết cứng danh sách cột trong migration (bài học `AddCodeGradingSchema`). Và ghi cột đó trong cùng `update()` với `ai_total_score`.

---

## 9. Test và đo chất lượng

### 9.1 Bảng số

| Tầng | Lệnh (trong `apps/api` hoặc `apps/web`) | Kết quả | Đo lúc |
|---|---|---|---|
| Unit API | `npx jest` | **179 suite pass · 2 skip · 1.897 test pass · 7 skip**, 145 s | 2026-10-22, trên `a643cae`, chạy lại trong lượt này |
| Web | `npx vitest run` | **151 file pass · 2 fail** · **1.788 test pass · 8 fail** (1.796), 112 s | 2026-10-22, chạy lại trong lượt này — **đang đỏ** (§9.2) |
| Vòng import | `pnpm check:cycles` | 0 vòng | 2026-09-29, không chạy lại |
| e2e API | `npx jest --config test/jest-e2e.json` | 62 file `*.e2e-spec.ts` | **chưa chạy lại** |
| Sandbox | `pnpm --filter api test:sandbox` (`--runInBand`) | 6 file | **chưa chạy lại** |
| e2e web | `apps/web-e2e` (Playwright) | 1 file spec (`investigator-dossier.spec.ts`) | *(chưa xác minh có chạy thật không)* |

**e2e chạy tuần tự (`maxWorkers: 1`)** và con số đó không được nâng: sweep của `ExamSessionScheduler` là toàn cục.

**Điều kiện chạy e2e:** `docker compose up -d postgres minio redis` **và** bucket `examcollect-submissions` đã tạo tay. Kill hết `node` jest/nest mồ côi trước khi tin một lượt chạy.

**Điều kiện chạy đường điều tra thật** (demo hoặc diễn tập) — thiếu một thứ là bài ra `ungradable(system)`:

1. Ít nhất một bậc `GRADING_TIERn_*` đủ ba biến.
2. `SANDBOX_REDIS_URL` ở API; worker chạy riêng, env sạch, có `SANDBOX_TIMING_CPUSETS`; hai image đã build (`pnpm --filter api sandbox:images`).
3. Phiên có deliverable `code_project` và khai `language` (`cpp`/`python`).
4. Đề bài đã chọn, dạng DOCX hoặc TXT.
5. Gói test đã tạo → duyệt → ghim. Chưa ghim thì `start-grading` trả 400.
6. Rubric ghim vào phiên; giảng viên có bảng lỗi và ít nhất luật `test_group_failed` cho các nhóm test.

### 9.2 Vitest web đang đỏ (chưa điều tra)

Hai file, tám test:

- `apps/web/src/app/teacher/exam-authoring/page.test.tsx` — 4 test "gắn vào phiên thi". Lỗi: không tìm thấy `radio` có tên "đã lên lịch".
- `apps/web/src/app/teacher/rules/page.test.tsx` — 4 test "Bảng lỗi". Lỗi: `No QueryClient set, use QueryClientProvider` trong một số test.

Chưa rõ đây là lỗi test hay lỗi giao diện thật. Chưa kiểm xem đỏ từ khi nào. Đây là việc đầu tiên nên làm trước khi tin số liệu web.

### 9.3 Đo chất lượng: `eval/` và diễn tập

Hai công cụ, hai câu hỏi khác nhau:

**`pnpm --filter api eval`** (`src/eval/`) — *"tốt hơn hay tệ hơn lượt trước, trên sự thật dựng sẵn"*. Chạy đúng `gradeOneShot` (baseline) hoặc đúng `investigate` + `challenge` + `decide` (investigator). Bộ dữ liệu: hai đề, 17 ca. Ba cổng cứng: `tru_oan`, `diem_toi_da`, `injection`. `apps/api/eval/runs/` có 18 lượt: 1 lượt ngày 23/09, 4 lượt ngày 25/09, 13 lượt ngày 19/10. Lượt investigator `20260925T175216Z-eef17b1` đạt precision và recall luật 1,000 / 1,000 trên nhóm 1 (số liệu rev 3). **13 lượt ngày 19/10 chưa được đọc trong lượt viết tài liệu này.**

**`pnpm --filter api rehearsal`** (`src/eval/rehearsal/`) — *"hệ thống đã deploy có làm đúng không, từ đầu đến cuối"*. Lái một phiên qua socket + HTTP như agent thật, chạy model và sandbox thật, rồi chấm kết quả theo kỳ vọng dựng sẵn. Cần `REHEARSAL_BASE_URL`, `REHEARSAL_EMAIL`, `REHEARSAL_PASSWORD`, `REHEARSAL_CLASS_ID`. Lịch sử tự động ở `apps/api/eval/rehearsals/README.md` — **đừng sửa tay**.

Kịch bản hiện tại: `ngan-xep-v2` (15 bài, dựng 2026-10-19; `HS2410031` đổi kỳ vọng sang `review` ngày 2026-10-19 vì lăng kính `bo_sot` thấy lỗi ngoài ba luật; `HS2410021` sửa 2026-10-19 theo đúng luật).

**Số đo gần nhất (2026-10-22), bốn lượt đối chứng code E2 (`a643cae`) và đợt 1 (`94e865b`).** Chạy tuần tự trên EC2, cùng kịch bản, cùng máy. Bản ghi gốc nằm trên EC2 trong `apps/api/eval/rehearsals/`, và README tự động trên EC2 đã có đủ 4 dòng. Bản sao local (`run.json`, `submissions.jsonl`) nằm trong `eval/rehearsals/` của hai worktree, **chưa commit**; README local chưa được cập nhật.

| Chỉ số | E2 lượt 1 | E2 lượt 2 | Đợt 1 lượt 1 | Đợt 1 lượt 2 |
|---|---|---|---|---|
| Quyết định đúng | 13/15 | 11/15 | 12/15 | 13/15 |
| Lỗi bắt được | 16/20 | 18/20 | 16/20 | 18/20 |
| Lỗi thừa / cờ sai | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| Cờ bỏ sót | 1 | 2 | 1 | 0 |
| Bài bị ẩn vì kiểm mẫu | 2 | 0 | 4 | 2 |
| Tự chốt sai | 2 | 3 | 3 | 2 |
| Lăng kính hỏng | 0 | 3 | 0 | 0 |
| Bài chậm nhất | 268 s | 354 s | 280 s | 172 s |

Gộp các lượt hợp lệ của mỗi bên trên cùng code:

- **Lăng kính hỏng:** E2 — 0, 0, 1, 0, 3 (5 lượt, trung bình 0,8). Đợt 1 — 5, 2, 6, 0, 0 (5 lượt hợp lệ, trung bình 2,6). Phương sai lớn, mẫu nhỏ: chưa đủ để kết luận.
- **Tự chốt:** E2 — 38/75 bài (51%). Đợt 1 — 33/75 (44%). Kịch bản chỉ kỳ vọng 5/15 bài tự chốt.
- **Tự chốt mà điểm sai:** E2 — 3 lần (đều HS2410028, sót `ten_bien_vo_nghia`, điểm 10 thay vì 9,5). Đợt 1 — 1 lần (cùng bài).
- **Recall theo luật** (chỉ bài hiển thị): E2 34/38 (89%); đợt 1 34/34 (100%). Số bài hiển thị khác nhau (28 so với 24), nên không so trực tiếp được. **Lưu ý về bản ghi:** `recallByRule` chỉ có trong `run.json` của đợt 1 (code có thay đổi D). Số recall của E2 được tính lại từ `submissions.jsonl` sau khi chạy, không có sẵn trong bản ghi.

Hai bài "tự chốt sai" theo kỳ vọng ở mọi lượt: **HS2410031** (một lỗi `sai_ca_co_ban`, deterministic, bị tự chốt; kỳ vọng `review`) và **HS2410032** (`sai_ca_bien` deterministic + `thieu_chu_thich` `llm_only`, độ tin cậy 0,875; kỳ vọng `review`). Hai bài này không gây sai điểm — chỉ lệch kỳ vọng về quyết định. Xem §12.

**Lượt 08:09 (`20261022T080937Z-94e865b`) KHÔNG phải số liệu của đợt 1:** lượt này chạy trên API khác đang giữ cổng 4000 (xem `KHONG-DUNG.md` cạnh bản ghi), nên không dùng để so sánh. Số liệu của nó chỉ để tham khảo: quyết định đúng 12/15 · lỗi bắt 16/20 · lỗi thừa 0 · cờ oan 0 · cờ bỏ sót 2 · tự chốt sai 3 · lăng kính hỏng 0 · bài chậm nhất 135 s. Bản ghi `run.json` và `submissions.jsonl` đủ, và README trên EC2 có thêm một dòng.
**Kết luận của lượt đối chứng:** chưa đủ để giữ hay bỏ nhánh cải tiến lăng kính (A và E của đợt 1). Khuyến nghị hiện tại: không đưa vào `main`, giữ `main` ở E2; nhánh `fix/wave1-mo-ta-luat` giữ nguyên, chưa push. Chờ người có quyền xác nhận.

**Mốc diễn tập trên `main` gần nhất đã commit:** `20261019T144727Z-beb6ee6` (main `beb6ee6`, Railway success), lượt 2/2 đo độ dao động. Lượt 1/2 cùng ngày có cảnh báo injection giả và lăng kính hết giờ. Kể từ đó chưa có lượt diễn tập nào được ghi vào README.

**Quy ước của repo:** một bản sửa chỉ được coi là có tác dụng khi lượt chạy sau nó tốt hơn lượt trước trên bảng này. Mỗi lượt chạy = một bản ghi + một dòng so sánh.

### 9.4 Hỏi đồ thị (GitNexus)

Chạy từ thư mục gốc repo. **Luôn truyền `--repo` bằng đường dẫn tuyệt đối** — §10 bẫy 17.

```bash
R='C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE'
gitnexus status
gitnexus context decide --repo "$R" --file apps/api/src/grading/decision/decide.ts
gitnexus impact ScoreService --direction upstream --repo "$R"
gitnexus check --cycles --repo "$R"
```

---

## 10. Những cái bẫy đã tốn thời gian thật

Mỗi dòng đã tốn ít nhất một buổi.

**Từ rev 2 và rev 3 (còn đúng):**

1. **Test gọi API tính tiền.** Khoá thật trong `.env` → e2e âm thầm tiêu tiền. Có guard `NODE_ENV === 'test'` ở `selectGradingProvider`, `selectAdvocateProvider` và `buildInvestigatorTiers` (trả `[]`).
2. **Dev server nuốt job của test.** Queue BullMQ là toàn cục theo Redis. `app.module.ts` dùng prefix `bull-test` khi `NODE_ENV=test`.
3. **Prompt caching im lặng không chạy** khi tiền tố < 1024 token (đường một-phát).
4. **`max_tokens` không phải trần cứng** trên gateway bậc 1 — bắt cắt cụt bằng `finish_reason === 'length'`.
5. **Sandbox `runsc` trượt buổi thử** (9 đỏ, 10 xanh, 2026-09-24). Mặc định `runc`. Đừng đổi cờ mà không chạy lại `test:sandbox`.
6. **Guard tính rồi vứt đi.** Một chỉ số chỉ tồn tại nếu nó được ghi lại.
7. **`LEFT JOIN teacher_review` nhân bản dòng** — dùng `DISTINCT ON` hoặc `LEFT JOIN LATERAL … LIMIT 1`.
8. **File trong repo là CRLF**; script sửa file bằng `indexOf('\n…')` sẽ im lặng không khớp. Trên máy dev này gọi `python3`, **không** `python`.
9. **`context_used_question` không nói phiên có đề hay không** — nói bậc model đã trả lời có dùng đề không.

**Mới từ rev 3 — đã xử lý hoặc vẫn đúng:**

10. **Trần job và `.env.example` lệch nhau — và giờ lệch lớn hơn.** Mặc định thật = `INVESTIGATE_MAX_WALL_MS (300 s) + 60 s + CHALLENGE_PHASE_BUDGET_MS (330 s)` = **690 s**. Rev 3 ghi 490 s vì lúc đó `LENS_BUDGET` còn 130 s. `.env.example` (dòng 137–143) vẫn ghi `450000`. Copy nguyên file mẫu thành cấu hình thật là job bị giết trước khi pha phản biện kịp ghi ý kiến, và ý kiến mất trắng. Đặt tay `GRADE_JOB_TIMEOUT_MS` thì nó không còn đi theo ngân sách điều tra.
11. **Đề bài PDF làm cả phiên code ra `ungradable(system)`.** Đường một-phát gửi PDF nguyên bản cho Claude; đường điều tra cần chữ (`extractText`), mà PDF/DOC/ảnh cho chuỗi rỗng có chủ đích. Kết quả: "đề bài chưa đọc được thành chữ" cho mọi bài của phiên. `grading-readiness` báo theo cấu hình, không đọc file.
12. **Tên file có dấu → `ungradable(system)`, dù lỗi là của sinh viên.** Sandbox chỉ nhận tên Latin không dấu, số, `_ . -` và `/` (`safePath` trong `sandbox/contract.ts`). File đơn không nén được đặt tên `main.cpp`/`main.py`. Trần giải nén: 500 file · 8 MiB tổng · 1 MiB mỗi file. Cùng nhóm: RAR không đọc được; Python nhiều file bắt buộc có `main.py`; mọi ca chạy qua stdin/stdout — `ctx.driver` luôn `null`, nên bài dạng "hàm + driver của đề" chưa nối.
13. **Luật với mẫu chưa đo được làm mọi bài dính tiêu chí đó bị gắn cờ.** `complexity_exceeds_required`, `calls_function`, `no_recursion` luôn ra `unmeasured` → `criterion_untouched` cho mọi bài → không bài nào tự chốt. Trang Bảng lỗi phân biệt ba loại (`matchKindOf`) nhưng không cảnh báo hậu quả này. Muốn tự chốt thì luật phải là `test_group_failed` hoặc luật lời (không predicate).
14. **θ và phép so số thực — ĐÃ SỬA** (`e5d22ca`, 2026-10-21): `AUTO_THETA_EPSILON = 1e-9` trong `decision/threshold.ts`. Trước đó, một lỗi `llm_with_tools` mức trừ 13 cho 0,8499999999999999 < 0,85 và bị gắn `low_confidence` oan. Công thức `confidence` không đổi, chỉ phép so sánh.
15. **Sửa một giá / một luật là thao tác tác động rộng.** Nó tính lại mọi bài chưa chốt của giảng viên, trong một transaction giữ khoá giảng viên, và có thể thăng cả loạt `flagged_for_review → auto_approved`. Bài đó rồi chốt thẳng, không ai xem (nếu không rơi vào mẫu kiểm). Web có khối "Lưu thì áp vào đâu" (`POST rules/preview`, `…/price/preview`) — dùng nó, và đừng gọi `PriceService.setPrice` trong vòng lặp.
16. **Thứ tự khoá.** `lockTeacherScoring` (advisory lock theo giảng viên) phải xin trước mọi `FOR UPDATE` một dòng `grading_result`. Ngược lại thì ôm chết. `finalizeGrades`, `markUngradable`, `startAttempt`, cầu dao và xác nhận nhóm đều tuân thủ.
17. **GitNexus: hai repo cùng tên `CINE`.** Luôn truyền đường dẫn tuyệt đối. `gitnexus clean --force` xoá cả `.gitnexus/`. Lỗi `file_fts inconsistent` tái diễn sau `analyze` tăng dần — `clean --force` rồi analyze lại.
18. **`code_project` khai thiếu ngôn ngữ, hoặc khai `java`/`node`, không còn "đọc như văn bản".** `DECLARED_LANGUAGES` = `python`, `cpp`, `java`, `node`; form web chỉ mời cpp/python nhưng API nhận cả bốn. `java`/`node` là ngôn ngữ của phần soạn đề, sandbox không chạy. Các trường hợp này đi `one_shot`, và ở đó bài đi tới model với nội dung rỗng → `flagged_for_review`. Nhánh G1 đã merge (`48a3b57`): khai ngôn ngữ được sau khi phiên đã tạo.
19. **UI đang hứa vài thứ backend chưa làm.** Xem §11. Nhãn `needsBackend` chỉ nằm cạnh một phần trong số đó.

**Mới từ rev 4:**

20. **Chấm lại không đi qua `advanceStatus`.** `RegradeService` dùng UPDATE có điều kiện để đưa `flagged_for_review → ai_grading` (không qua `AdvanceExtra`). Ai thêm trường mới vào đường này phải nhớ nó không đi qua hàm chung.
21. **`finalized → exported` không ai đi.** Xuất file điểm (`grade_export`) không đổi trạng thái bài. Đừng coi "đã xuất" là trạng thái trong DB.
22. **Bản ghi lăng kính hỏng chỉ có tên lăng kính, không có lý do.** Lý do ("phản hồi không đọc được", "hết giờ", "hết ngân sách") chỉ có trong log API. Khi đo, lưu `api.log` riêng cho từng lượt, theo tên lượt. Trong đợt đối chứng 22/10, log E2 bị ghi đè khi khởi động API đợt 1, nên không so được tần suất lỗi định dạng giữa hai bên.
23. **Cảnh báo khởi động về trần tin cậy** (§6) nói "không có bài nào được tự duyệt", nhưng đường điều tra vẫn tự chốt. Đừng dùng cảnh báo đó làm bằng chứng. *(chưa xác minh đầy đủ)*
24. **Kiểm mẫu tắt dưới `NODE_ENV=test`.** E2E khẳng định `auto_approved` ngay sau `computeInitial` vẫn đúng vì mẫu bị tắt. Đặt `GRADING_AUDIT_SAMPLE_PERCENT` tường minh trong test thì phải sửa các khẳng định đó.
25. **Nhãn kiểm mẫu và cầu dao là chỉ thêm.** Sửa nhãn sai không xoá được; phải ghi nhãn đúng mới. Bật lại cầu dao không tính lại các nhãn cũ — chúng không còn đếm.
26. **Đề bài theo câu chưa đi tới agent.** `investigation-context.service.ts` đọc đề qua `loadForGrading(sessionId)`, mà hàm này chọn tham chiếu của câu mặc định. Bài của câu khác vẫn đúng gói test và rubric của chính câu đó, nhưng đề chữ là của câu 1 (§11 mục 12). Đừng kết luận gì về nhiều câu từ một lượt chạy trước khi sửa điểm này.

---

## 11. Cái CHƯA có

Ghi ra để không ai tưởng chúng đã tồn tại.

| # | Chưa có | Bằng chứng | Hệ quả |
|---|---|---|---|
| **1** | **Công cụ bước 4–5 của agent:** `run_scaled`, `probe`, `ast_query`, `compare_peers` | `TOOL_NAMES` vẫn chỉ có 4 tên: `run`, `run_tests`, `read_file`, `list_files`. `SandboxClient.measure()` và `handle-measure.ts` có nhưng không có người gọi ngoài test. `requiredComplexity` và `driver` viết cứng `null` trong `InvestigationContextService` | Luật dạng độ phức tạp luôn `unmeasured` (§10 bẫy 13). Đo độ phức tạp — phần độc đáo nhất của đồ án theo spec §9 — chưa có dòng nào chạy |
| **2** | **Hiệu chỉnh (spec §8):** bộ ra quyết định "có nên để hệ thống tự chốt bài này" và số đo α/κ công bố được | `calibration_run` chỉ có entity; không ai `INSERT`. Chưa có buổi chấm mù nào đủ lớn. Eval nhóm 5 (bài sinh viên thật) = 0 ca | Bar "nhất quán hơn nền người thật" (spec §0.1) chưa có số để chứng minh |
| **3** | **Ghi điểm vào sổ điểm có trạng thái:** `finalized → exported` | Xuất file đã có (`grade-export/`, route `grade-exports`), nhưng không đổi trạng thái bài. UI: ghi sổ điểm "tính năng dự kiến" | Điểm chốt ra khỏi hệ thống qua file, không có dấu vết trạng thái |
| **4** | **Nhánh ảnh** (bài viết tay chụp lại) | `content-resolver/` chỉ có `document-resolver.ts` và `submission-content-resolver.ts`. `DeliverableType` có `image` | Bài ảnh → nội dung rỗng → về giảng viên |
| **5** | **Chế độ bóng cho luật phong cách** (§3.5) | `shadowStyleVerdict()` có sẵn, không ai gọi | Hai luật phong cách vẫn là `llm_only` và không được đo độc lập |
| **6** | **Chi phí AI theo bài** | `grading_attempt.cost_usd` có cột, không thấy người ghi *(đã grep)*. `ai_usage` chỉ phục vụ soạn đề. Dashboard chi phí không có | Không biết một lượt chấm tốn bao nhiêu tiền |
| **7** | **Tài liệu vận hành sandbox** | `docs/deploy/` có 4 file (database, frontend, storage, backend), không có `sandbox-worker.md`; repo không có Dockerfile hay compose cho worker | Dựng lại worker phụ thuộc vào người đã dựng nó lần đầu |
| **8** | **e2e giao diện** | `apps/web-e2e` có một spec. Chưa xác minh có chạy thật không | Vùng UI có nhiều test vitest nhưng ít luồng chạy trên trình duyệt thật |
| **9** | **Batch API** cho lượt chấm không cần thời gian thực | Chưa dùng | Không giảm được chi phí chấm lượt lớn |
| **10** | **Tự động dựng thước từ đề — chất lượng** | Có (G2b): sinh đáp án và gói test từ đề và từ đáp án của giảng viên, có kiểm chứng (`ruler_unverified`). **Chưa đo chất lượng trên bài thật** | Gói test vẫn có thể sai mà chưa ai biết |
| **11** | **Phần nhỏ của UI** | Chưa kiểm lại trong lượt này | — |
| **12** | **Nhiều câu: đề đúng câu cho agent** | `investigation-context.service.ts` gọi `loadForGrading(exam_session_id)`, hàm này đọc tham chiếu của **câu mặc định** (`resolveProblemConfig`), không phải câu của kết quả. `exam_problem.statement` không được đường điều tra đọc | Câu 2 và câu 3 bị chấm với đề của câu 1, sinh lỗi giả. Đã sửa trên nhánh `fix/multi-question-routing`, chưa chạy diễn tập (xem §9.3) |
| **13** | **Nhiều câu trong file nén (P2)** | Không có `ProblemSourceResolver` và `exam_problem_binding`; unique `uq_grading_result_submission` vẫn là `submission_id` | Một file nén chứa nhiều câu không sinh được nhiều kết quả. Chỉ đường file riêng chạy |
| **14** | **Gói test theo câu** | Trước nhánh `fix/multi-question-routing`, mọi route gói test ghi vào câu mặc định và bị chặn khi phiên có nhiều câu: không có đường nào ghim gói cho câu 2 trở đi, nên bài các câu đó ra `ungradable(system)` | Đã thêm `problemId` vào tạo gói, chặn theo gói (`assertBundleRouteAllowed`) thay cho chặn cả phiên, ghim theo câu (`setProblemTestBundle`), và `GET exam-sessions/:id/problems`. `test-run` (chạy thử gói) vẫn đọc câu mặc định — chưa sửa |

**Đã xong kể từ rev 3 (gạch khỏi danh sách cũ):** kiểm mẫu (G4, P1); chấm lại bài lỗi hệ thống (G3); xuất điểm ra file (G5); tự động dựng thước (G2b, đo chất lượng còn thiếu); cầu dao tự chốt (P1); gom nhóm xác nhận hàng loạt (P1); nhiều câu trong một phiên (P1a và P1b đã vào main, P1b chưa nghiệm thu); bảng lỗi theo rubric (rubric-errors, 2026-10-08); đường khai loại bài và ngôn ngữ (G1); lăng kính cấp bài không kết luận được không tự chốt (`challenge_incomplete`, 2026-10-19).

---

## 12. Quyết định đang treo

Những việc này không phải kỹ thuật. Cần người có quyền chốt, không nên để người tiếp nhận tự quyết.

| # | Quyết định | Hiện trạng | Đánh đổi |
|---|---|---|---|
| 1 | **Số sinh viên tối thiểu mỗi phiên trong mẫu kiểm** (`AUDIT_MIN_PER_SESSION`) | Mặc định 2, mã nguồn ghi "chờ chủ đồ án xác nhận" | Nhiều hơn → giảng viên xem nhiều hơn, bớt tự chốt |
| 2 | **p0 và α của cầu dao** (`BREAKER_P0`, `BREAKER_ALPHA`, đều 0,05) | Giả thuyết, chưa có số đo | Chặt hơn → cầu dao tắt sớm, tự chốt giảm. Lỏng hơn → bất đồng thật bị bỏ qua |
| 3 | **Tỉ lệ rút mẫu kiểm** (`GRADING_AUDIT_SAMPLE_PERCENT`, mặc định 20, sàn 5) | Mặc định 20 | Cao hơn → an toàn hơn, giảng viên làm nhiều hơn |
| 4 | **Có tự chốt bài bị lỗi do nguồn model (`llm_only`) hay không** — tức là có cho một lỗi `llm_only` che lỗi chắc chắn trong trung bình hay không (§2.1) | Hiện: trung bình có trọng số, nên HS2410032 bị tự chốt (độ tin cậy 0,875) | Chặt hơn: mọi lỗi `llm_only` đưa về giảng viên, GV làm nhiều hơn. Lỏng hơn: giữ như hiện tại |
| 5 | **Lỗi "tự chốt sai theo kỳ vọng"** của HS2410031 và HS2410032 | Kỳ vọng hiện là `review`. Hệ thống tự chốt cả hai ở mọi lượt. HS2410031 cần một cờ từ lăng kính `bo_sot` (ngoài bảng luật) để về review. HS2410032 cần chính sách ở mục 4 | Đổi kỳ vọng sang `auto` thì số đo khớp hơn nhưng không chứng minh được gì. Giữ `review` thì số đo luôn đỏ cho đến khi có chính sách |
| 6 | **Nhánh cải tiến lăng kính** (`fix/wave1-mo-ta-luat`: A, D, E) | Chưa push. Khuyến nghị: không đưa vào `main` | Số đo chưa đủ để kết luận; mẫu 5 lượt mỗi bên |
| 7 | **Bộ kiểm tra tất định cho luật phong cách** (§3.5) | Có hàm, chưa nối vào đường chấm | Nối vào để đo: thêm việc. Không nối: hai luật phong cách vẫn chỉ là ý kiến của model |
| 8 | **Web vitest đang đỏ** (§9.2) | Chưa điều tra | Không biết số liệu web có tin được không |
| 9 | **Hiện trạng `.env.example`** (§7) | Lệch với mặc định | Copy nguyên file mẫu thành cấu hình thật → lỗi như §10 bẫy 10 |
| 10 | **Chạy kịch bản `ngan-xep-3cau`** (P1b Task 11 Step 3) | Kịch bản và CLI đã viết, build được trên `cine-api`. Chưa chạy được: API thứ hai dùng chung pooler Supabase (giới hạn 15 kết nối) gây lỗi `EMAXCONNSESSION` trên `cine-main` | Cần người vận hành quyết: dừng `cine-main` tạm, hoặc chạy khi không ai dùng API đó |

---

## 13. Muốn làm X thì sửa ở đâu

| Muốn | Sửa ở đâu | Cảnh báo |
|---|---|---|
| Đổi công thức tự chốt, thêm một loại cờ | `decision/decide.ts` (+ mã cờ ở `decision/types.ts`) | Hàm thuần — viết test trước. Thêm mã cờ là thêm **cả nhãn ở web** (`lib/grading-vocab.ts`), không thì UI hiện mã thô. Sửa xong chạy `eval` |
| Đổi θ | env `GRADING_AUTO_THRESHOLD` (`decision/threshold.ts`) | Đọc một lần lúc dựng `ScoreService`. Đọc §10 bẫy 14 |
| Đổi chính sách cầu dao (p0, α) | `auto-breaker/breaker-verdict.ts` (hằng số `BREAKER_P0`, `BREAKER_ALPHA`) | Hàm thuần, có test. Đổi số mà không đổi cách đếm nhãn thì không đổi được hành vi thật |
| Đổi tỉ lệ rút mẫu hoặc số tối thiểu mỗi phiên | env `GRADING_AUDIT_SAMPLE_PERCENT` · `AUDIT_MIN_PER_SESSION` (`audit-sampling.ts`) | Mẫu theo sinh viên: đổi tỉ lệ chỉ ảnh hưởng quyết định mới. Dưới `NODE_ENV=test` tắt |
| Thêm một mẫu điều kiện máy đo được | `RulePredicate` ở `decision/types.ts` · `evaluatePredicate` và `isMachineChecked` ở `decision/predicates.ts` · `investigator/rule-note.ts` · `rules/rule-input.ts` · DTO · web `lib/rules-vocab.ts` · `eval/manifest.schema.ts` | Bốn mẫu là đóng. Hôm nay chỉ `test_group_failed` đo được |
| Thêm một công cụ cho agent | `TOOL_NAMES` (`investigator/types.ts`) · `ToolRunner.dispatch` (`tools.ts`) · `REPLY_JSON_SCHEMA` + zod + `argsFor` + prompt (`protocol.ts`) · `ALL_COMPONENTS` (`investigate.ts`) · `lens-protocol.ts` | Thêm một tên là một quyết định thiết kế, không phải một dòng vào mảng. Prompt là lớp cache ① |
| Thêm một ngôn ngữ | `sandboxLanguage` (`sandbox/contract.ts`) · image ở `sandbox-images/` · `sandbox-worker/{config,programs}.ts` · `SOURCE_EXTENSIONS` (`pipeline/source-files.ts`) · `INVESTIGATOR_LANGUAGES` (`pipeline.ts`) · `exam-session/declared-language.ts` · check DB `ck_required_deliverable_language` | Spec §1.1: ba tầng đa ngôn ngữ, chỉ tầng parse là miễn phí |
| Đổi ngân sách điều tra | env `INVESTIGATE_*` | Trần job đi theo, nhưng chỉ khi bạn **không** đặt `GRADE_JOB_TIMEOUT_MS` |
| Thêm một lăng kính | `investigator/lenses/` (implement `Challenger` hoặc `CaseLens`) · khai ở `pipeline/investigator-deps.ts` | Chạy song song. Không được gửi lỗi luật máy kiểm cho `Challenger`. `refuted` phải có lần chạy thật |
| Thêm trạng thái vòng đời | `lifecycle/grading-transitions.ts` **và** một migration viết lại `validate_grading_result_lifecycle` cùng lúc | `ALTER TYPE … ADD VALUE` phải ở migration riêng. e2e đòi hai bản khớp |
| Thêm lý do tính điểm | `SCORE_COMPUTATION_REASONS` (`grading-model.types.ts`) + migration `ALTER TYPE` riêng | |
| Thêm cột AI vào `grading_result` | Xem §8.4 | |
| Ghi vào `grading_result` của đường điều tra | Qua `ScoreService` hoặc `advanceStatus`; xin `lockTeacherScoring` trước `FOR UPDATE` | Sai thứ tự khoá là ôm chết (§10 bẫy 16). Chấm lại là ngoại lệ có chủ đích (§10 bẫy 20) |
| Đổi giá hoặc luật bằng script | Dùng `PriceService` / `ErrorRuleService` | `INSERT` thẳng bỏ qua tính lại **và** khoá giảng viên |
| Nối bộ kiểm tra phong cách vào đường chấm | `style-checks/shadow-verdict.ts` → gọi từ `investigator/` hoặc `scoring/` | Chỉ để đo trước. Không đổi điểm cho đến khi có quyết định (§12 mục 7) |
| Hỗ trợ loại bài ảnh | `content-resolver/` — thêm resolver | Chỉ đường `investigator` có công thức tự chốt. Một resolver ảnh cho ra bài one_shot, luôn về giảng viên |
| Thêm route | Controller + regenerate `packages/shared/src/api/schema.d.ts` từ API đang chạy + thêm vào `lib/api/*.ts` và hook | Quên bước regenerate thì `apps/web` fail typecheck ở đúng dòng gọi API mới |

---

## 14. Đọc thêm

- **Đọc code theo thứ tự này** (mỗi file đều thuần hoặc gần thuần): `decision/decide.ts` → `decision/confidence.ts` → `auto-breaker/breaker-verdict.ts` → `audit-sampling.ts` → `scoring/score-core.ts` → `scoring/score.service.ts` → `investigator/investigate.ts` → `investigator/protocol.ts` → `lifecycle/grading-transitions.ts`.
- **Spec** `2026-09-20-grading-agent-investigator-design.md`: §0.3 (chính sách tự chủ), §2.2–2.3 (áp lại luật, chấm lại), §3.5 (sandbox), §4 (nguồn gốc điểm, sàn), §6 (phản biện), §8.1 (kiểm mẫu — đọc trước khi đổi), §14 (mô hình dữ liệu), §15 (ma trận nghiệm thu).
- **Plan đợt duyệt nhanh** `docs/superpowers/plans/2026-10-21-cham-diem-duyet-nhanh-p1.md`: tự chốt có cầu dao, nhãn kiểm mẫu, gom nhóm, lăng kính có dẫn chứng (E1, E2).
- **Báo cáo** `docs/superpowers/reports/2026-09-24-sandbox-isolation-spike.md` — vì sao `runc`, vì sao `K = 1`, và runsc trượt ở đâu.
- **Plan** trong `docs/superpowers/plans/` — mỗi plan có phần "vì sao không làm cách kia". Các plan quan trọng từ rev 3: `2026-09-25-grading-decision-core`, `2026-09-27-investigator-challenge-lenses`, `2026-09-29-audit-sampling`, `2026-09-29-regrade-ungradable`, `2026-10-14-multi-problem-p1a-expand`, `2026-10-17-multi-problem-p1b`.
- `apps/api/eval/rehearsals/README.md` — bảng diễn tập, sinh tự động.
- `CLAUDE.md` — mô hình vai trò, 9 Security rule, quy tắc tổ chức file. File này nằm trong `.gitignore`, nên spec và plan là bản ghi duy nhất trong git của chính sách tự chốt (spec §0.3 tự nói điều này).
