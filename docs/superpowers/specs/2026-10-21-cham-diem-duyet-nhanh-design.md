# Chấm điểm: tự chốt có cầu dao, duyệt nhanh và hồ sơ lỗi có dẫn chứng — thiết kế tổng thể

**Ngày:** 2026-10-21 · **Trạng thái:** bản 3 — gộp ba phần vào một spec: (1) tự chốt giữ bật và cầu dao, (2) duyệt nhanh và xác nhận hàng loạt, (3) hồ sơ lỗi có dẫn chứng ở trang chi tiết một bài. Chờ chủ đồ án duyệt bản 3 · **Nhánh mã:** `main` @ `bdde467`
**Liên quan:** `docs/danh-gia-he-thong-cham-diem-2026-10-20.md` (đánh giá đối chiếu); `2026-09-20-grading-agent-investigator-design.md` (bị thay một phần ở mục tự chốt); `2026-10-12-multi-problem-grading-design.md` (bất biến kiểm mẫu theo sinh viên của P1b).

**Lịch sử sửa:** bản 1 tắt mọi tự chốt cho tới khi đo đủ 72 ca — sai, vì hệ thống hôm nay đã đẩy khoảng 80% bài về giảng viên (§1.1). Bản 2 đảo mặc định: bật, đo liên tục, tự tắt theo luật. Bản 3 (i) giữ bài **không lỗi** tự chốt như hôm nay và thêm cầu dao cấp lớp cho riêng nó, thay vì đóng lớp này; (ii) thêm phần hồ sơ lỗi có dẫn chứng, vì giảng viên không xác nhận nhanh được thứ mà họ không thấy bằng chứng.

---

## 1. Lý do và mục tiêu

Hệ thống chấm sẵn bài code, gom bài theo lỗi và để giảng viên xác nhận. Tự chốt chưa được đo với nhãn giảng viên thật; mọi số chất lượng hiện có đến từ bộ bài nhóm tự viết (5 bài diễn tập, 34 ca cấy lỗi, 15 bài `ngan-xep-v2`). Chưa có bài sinh viên thật.

**Mục tiêu:** giảm thời gian giảng viên chấm một phiên xuống còn khoảng 20% so với chấm tay (giảm 80%), mà không để sinh viên bị chấm oan nhiều hơn giảng viên.
**Chưa chứng minh được:** con số 80% và chất lượng tự chốt. Cả hai là **mục tiêu đo được**, không phải kết quả. Thời gian giảng viên chưa từng được đo (không có số nào trong repo).
**Không phải mục tiêu:** chứng minh hệ thống thay thế giảng viên trước khi có bài thật.

### 1.1 Hiện trạng đo được (lượt `ngan-xep-v2` 15 bài, 18/10, `74aae81`)

| | Lượt 1 | Lượt 2 |
|---|---|---|
| Tự chốt (`auto_approved`) | 3/15 (20%) | 3/15 và 1 `audit_pending` |
| Nhóm tự gắn nhãn "đáng lẽ tự chốt" | 7/15 (47%) | — |
| Tự chốt sai (`wrongAuto`) | 0 | — |
| Lý do gắn cờ, trong 12 bài bị chuyển | `investigation_flag` 9 (7 bài chỉ có cờ này), `challenge_suspected` 3, `low_confidence` 2 | `investigation_flag` 7, `low_confidence` 2, `challenge_suspected` 2 |

- 4 bài nhóm gắn nhãn "tự chốt" bị chuyển giảng viên: HS2410019 (đúng hoàn toàn), 022, 023, 031.
- Chi tiết cờ chỉ được lưu ở các lượt 19/10 (lượt 18/10 không lưu): HS2410019 (bài đúng hoàn toàn) bị `investigation_flag = injection_suspected` ở cả 4 lượt có lưu chi tiết. Đây là cờ giả đã xác nhận trên **một** bài sạch. Nút thắt **không** là θ.
- **Không kết luận cả nhóm cờ này là giả.** Trong lượt 1, 6 bài được hệ thống phán "không lỗi" thì chỉ 2 bài thật sự sạch (HS2410019, 023); 3 bài có điểm sai (HS2410021: 10 thay vì 9,5; HS2410028 và 029: bỏ sót lỗi phong cách) và HS2410027 hard-code. Cả 4 bài đó chỉ không bị tự chốt nhờ các cờ; riêng HS2410028 chỉ có `investigation_flag` chặn lại. Nghĩa là phán "không lỗi" là phán quyết kém tin cậy nhất trong bộ này (mật độ lỗi cấy cao nên không ngoại suy được), và cờ `injection_suspected` vừa chặn oan bài sạch vừa vô tình chặn bài sai.
- **Gom theo lỗi (§5.4) trên đúng 12 bài bị chuyển ở lượt 1:** 2 bài `ro_ri_bo_nho` (HS2410022, 025), 1 bài `sai_ca_co_ban` (031), 3 bài nhiều lỗi (018, 030, 032) và 6 bài "không lỗi" nhưng bị gắn cờ (019, 021, 023, 027, 028, 029). Chỉ 3/12 bài xác nhận hàng loạt được. Trên bộ này, gom theo lỗi không đủ để đạt 80%; nút thắt vẫn là các cờ ở nhóm "không lỗi" (xem §5.7).
- Giới hạn của số đo: bộ bài do nhóm tự dựng, mật độ lỗi cấy cao (8/15 bài được nhóm gắn nhãn "cần duyệt" từ đầu). Không ngoại suy được sang đề thật.

### 1.2 Mô hình thời gian (minh hoạ, **không phải số đo**)

Gọi `a` là tỉ lệ tự chốt, `t` là thời gian xác nhận một bài đã chấm sẵn so với chấm tay (= 1), kiểm mẫu 20% số bài tự chốt, mỗi bài kiểm mẫu mất `t`. Thời gian còn lại = `(1−a)·t + a·0,2·t`.

| `a` | `t` | Giảm |
|---|---|---|
| 20% (hôm nay) | 0,3 | khoảng 75% |
| 20% | 0,5 | khoảng 58% |
| 47% (trần theo nhãn nhóm) | 0,3 | khoảng 81% |
| 0% (bản 1) | 0,2 | 80% |

80% cần `a` đủ lớn **và** `t` nhỏ; hai số này chưa đo. Mốc mở bài (§5.5) đo `t`. Hồ sơ lỗi có dẫn chứng (§5.8, §5.9) nhắm trực tiếp vào `t`: giảng viên mất thời gian vì phải tự dò bằng chứng.

### 1.3 Vấn đề giao diện chi tiết một bài (từ ảnh chụp bài HS2410018, 4 lỗi, confidence 0,71)

- Thẻ lỗi chỉ có tên luật, nhãn nguồn ("Máy quyết", "Chỉ mô hình"), một dòng mô tả của model và dòng "Tính đúng: Xác nhận / Quá tay: Xác nhận" không kèm lý do.
- Banner "confidence 0,71 < θ 0,85" không nói con số đến từ đâu. Tính lại từ ảnh: (1,5×1,0 + 2,0×0,5) / 3,5 = 0,714, tức trung bình có trọng số theo mức trừ (`confidence.ts:25-32`).
- Giảng viên không biết vì sao luật áp dụng, bằng chứng nằm ở đâu, và hai nhãn nguồn khác nhau thế nào về hệ quả cho tự chốt.

## 2. Nền tự chốt chung và hai nhánh dữ liệu

**Nền (cả hai nhánh):**
1. Bài có lỗi tự chốt khi đạt điều kiện hôm nay (confidence ≥ θ, cờ sạch). Không đổi.
2. Bài **không lỗi** vẫn tự chốt khi cờ sạch, như hôm nay. Có cầu dao cấp lớp riêng (§5.3).
3. Mọi quyết định kiểm mẫu ghi nhãn; cầu dao tự tắt tự chốt khi giảng viên bất đồng quá mức, theo từng luật hoặc theo lớp bài không lỗi.
4. Phần còn lại đi qua duyệt nhanh và xác nhận hàng loạt (§5.4), trên hồ sơ lỗi có dẫn chứng (§5.8).

**Nhánh có bài thật:** chạy chế độ bóng để đo độ khớp theo luật, dùng ngưỡng §6 để **tuyên bố** kết quả trong báo cáo.
**Nhánh không có bài thật trước bảo vệ:** hệ thống vẫn chạy như nền. Báo cáo trình bày tự chốt như **giả thuyết kèm phương án đo** (§6), kèm số đo thật duy nhất có (§1.1) và giới hạn của nó.

Hai nhánh không khác nhau về tính năng; khác về mức tuyên bố.

## 3. Trạng thái mã (đã kiểm ngày 21/10, kể cả review Opus)

| Thành phần | Trạng thái | Bằng chứng |
|---|---|---|
| Duyệt hàng loạt theo luật | Có, **chỉ cho tự luận** | `bulk-review.service.ts`; `BulkAcceptEssays.tsx`. Bài điều tra bị bỏ với lý do `not_reviewable` (`bulk-review.service.ts:84-87`, `teacher-review.service.ts:118-121`) |
| `BulkBar.tsx` | Không liên quan | Chỉ là thanh thao tác danh sách phiên |
| Đường xác nhận bài điều tra | **Không có** | Giao diện chỉ có bỏ/giữ lỗi và chấm tay (`ErrorList.tsx:109-170`); API chỉ có `error-exceptions` và `manual-score` (`grading.controller.ts:280, 287`) |
| Điểm hiện tại của bài điều tra | Bỏ qua dòng duyệt không phải `manual_score` (`current-score.ts:28-33`) | Danh sách phiên hiển thị `finalScore` của dòng duyệt mới nhất bất kể pipeline (`grading.service.ts:726-740, 800`). Sau lượt tính lại hai con số có thể lệch |
| Ngưỡng θ | Đọc từ env, chỉ nhận (0, 1] | `decision/threshold.ts`; `decide()` nhận θ qua tham số; env đọc một lần ở `ScoreService` (`score.service.ts:91`) |
| Lỗi làm tròn θ | Có | `decide.ts:206`. `(0.85*13)/13` = `0.8499999999999999`; 109/1000 mức trừ rơi vào vùng này |
| Cầu dao tự chốt | **Chưa có** | Không có công tắc nào. θ = 1 vẫn tự chốt bài có confidence 1,0 |
| Tự chốt bài không lỗi | Có | Bài không lỗi thoả điều kiện một cách rỗng (`decide.spec.ts:36-39`). Sự cố HS2410021 (hai lăng kính hết giờ) đã vá 19/10 bằng cờ `challenge_incomplete` (`decide.ts:177-187`) |
| Cờ `injection_suspected` | Bắn trên bài sạch | `investigate.ts:313-319`: ba nguồn gộp một cờ (`submissionSuspected`, `toolCalls[].injectionSuspected`, lời khai của model — kể cả khi không có đoạn trích). Bản ghi không phân biệt nguồn |
| Kiểm mẫu | Có, rút **theo sinh viên** (P1b) | `audit-sampling.ts:76`; `score.service.ts:575-586`; chỉ ở quyết định đầu tiên của từng bài (`score.service.ts:281-291`) |
| Nhãn kiểm mẫu theo luật | Tính được, **không lưu** | `compareAudit` cho `both`/`teacher_only`/`system_only` từng luật (`audit-compare.ts:20-52`), chỉ trả về lúc tiết lộ (`audit-review.service.ts:99-137`); bảng chỉ lưu `picked_rule_ids` và `extra_errors` |
| Hạ bậc theo luật | Có | `recomputeForTeacher(..., { ruleId })` (`score.service.ts:302-344`); `compute()` đọc cấu hình từ `m` (`score.service.ts:518-537`); `auto_approved → flagged_for_review` và `audit_pending → flagged_for_review` được phép (`grading-transitions.ts:23-24`) |
| Lý do lượt tính (`score_computation_reason`) | enum DB | Thêm giá trị bằng `ALTER TYPE ... ADD VALUE` (tiền lệ `1789470000000`, `1789490000000`) |
| Trigger `guard_grading_result_ai_immutable` | Chỉ so các cột AI cụ thể | `1789250000000-AddGradingContextUsed.ts:50-56`; cột mới không thuộc danh sách (cần xác minh định nghĩa mới nhất trước khi làm) |
| `teacher_review.kind` | `review`, `error_exception`, `manual_score`, `bulk_accept` | enum và CHECK `ck_teacher_review_score_by_kind` (`1789430000000-GradingResultReviewSessionColumns.ts:64, 77`) |
| Mốc mở bài | **Không có** | `teacher_review` chỉ có `reviewed_at` |
| Đo khớp với giảng viên | **Chưa có** | `calibration_run` chỉ có schema, không có nơi ghi |
| Gói test do model sinh tự được duyệt | **Không có đường tự duyệt trên main** | Duyệt chỉ qua `approve` (`test-bundle.controller.ts:60`) |
| Thẻ lỗi ở trang chi tiết một bài | Chỉ tên luật, nhãn nguồn, một dòng `note`, nhãn lăng kính | `ErrorList.tsx:61-107`. `toolCallIds` của lỗi có trong dữ liệu (`result-detail.ts:19-28`) nhưng không được dùng; mục "Đường điều tra" nằm riêng ở cuối trang (`InvestigatorDossier.tsx:176`), không nối với từng lỗi |
| Lý do của lăng kính per-error | Chỉ có khi `unverified` | `challenge.ts:23`; kết luận hôm nay chỉ có `status` và `toolCallIds` (`lens-protocol.ts:60-81`) |
| Dẫn chứng mã của lỗi `llm_only` | **Không có** | `VerdictError` chỉ có `ruleKey`, `toolCallIds`, `note` (`investigator/types.ts:59-63`) |
| Định nghĩa luật | Có ở DB, chưa tới giao diện | `error_rule_revision.description` và `.predicate` (bốn mẫu: `test_group_failed`, `calls_function`, `complexity_exceeds_required`, `no_recursion`; null = luật bằng lời); `ResultDetailError` không mang chúng |
| Kết quả có cấu trúc của lời gọi (ca test, diff) | Có trong hồ sơ lưu | `structuredResults` trong `Investigation`; `ResultDetail.investigation` trả nguyên `InvestigationResult` nhưng kiểu phía web chỉ khai báo `toolCalls`. Tôi chưa kiểm payload thật |
| Che mù kiểm mẫu | Ở tầng API | `loadResultDetail` trả `blindResultDetail` ngay đầu hàm khi `audit_pending` (`result-detail.ts`, `audit-blind.ts`) |

## 4. Phạm vi

**Trong phạm vi:**
- **Tự chốt và cầu dao:** cờ chặn luật và cờ lớp không lỗi (§5.2); cầu dao theo luật và cầu dao cấp lớp không lỗi (§5.3); sửa θ sau cầu dao (§5.1).
- **Duyệt nhanh:** đường xác nhận bài điều tra và gom bài (§5.4); mốc mở bài và view đo thời gian (§5.5); kiểm mẫu có số mẫu tối thiểu (§5.6).
- **Chẩn đoán:** ghi nguồn của cờ `injection_suspected` (§5.7).
- **Hồ sơ lỗi có dẫn chứng:** giai đoạn E1 (giao diện, cộng vài trường API, không đổi agent; §5.8) và giai đoạn E2 (agent trả dẫn chứng và lý do, có cổng đo; §5.9).

**Ngoài phạm vi:**
- Đo độ phức tạp (`run_scaled`).
- Sổ điểm, xuất điểm, chấm lại hàng loạt.
- Nới cờ `injection_suspected` hay bất kỳ cờ nào **trước khi** biết nguồn của nó (§5.7).
- Tự chốt bài chỉ có lỗi `llm_only`, hạ θ.
- Trình xem mã đầy đủ trong trang chi tiết (E1 chỉ hiện đoạn trích và đầu ra lời gọi).
- Đổi hành động trên thẻ lỗi (bỏ lỗi, chấm tay giữ nguyên).

**Chống mục tiêu (anti-goals):**
- Tuyên bố tự chốt "đạt" dựa trên bộ cấy lỗi tự viết.
- Hạ θ hoặc đổi p0/α của cầu dao sau khi xem số đo.
- Đếm bài tự chốt đúng mà bỏ qua bài giảng viên đã sửa.
- Nới cờ chặn trong cùng đợt với việc bật cầu dao cấp lớp (nới cờ là bước sau, có số đo).
- Để dẫn chứng mới lộ ra ở bài `audit_pending` (làm mất tính mù của nhãn kiểm mẫu).
- Để dẫn chứng do model tự khai làm đổi điểm hay quyết định tự chốt (E2 chỉ hiển thị).

## 5. Thiết kế

### 5.1 Ngưỡng θ
- Sửa so sánh trong `decide()` thành `confidence < input.theta − AUTO_THETA_EPSILON` với `AUTO_THETA_EPSILON = 1e-9`, export từ `decision/threshold.ts`.
- Sửa này **làm tăng** số bài tự chốt (bài có lỗi `llm_with_tools` với giá lẻ). Chỉ triển khai **sau** khi cầu dao (§5.3) đã chạy.
- Công thức confidence không đổi.

### 5.2 Cờ lớp không lỗi và danh sách luật bị chặn
- Hai trường mới trong `DecisionInput`, **truyền qua tham số**, không đọc env trong `decide()` (giữ hàm thuần, như θ). Cả hai có mặc định giữ nguyên hành vi hôm nay khi vắng mặt:
  - `autoNoErrorEnabled?: boolean` — mặc định **`true`**. Bài không lỗi và cờ `false` → cờ `no_error_auto_disabled`.
  - `autoBlockedRuleKeys?: ReadonlySet<string>` — mặc định **rỗng**. Mỗi lỗi có `ruleKey` thuộc tập → cờ `type_auto_disabled` (một cờ cho mỗi khoá).
- Nguồn giá trị, do `ScoreService.compute()` dựng cho từng giảng viên:
  - `autoNoErrorEnabled` = env `GRADING_AUTO_NO_ERROR` (mặc định `true`) **và** cầu dao lớp không lỗi của giảng viên đó không mở;
  - `autoBlockedRuleKeys` = hợp của cầu dao theo luật đang mở của giảng viên đó và env `GRADING_AUTO_BLOCK_RULE_KEYS` (rỗng = không chặn; công tắc khẩn cấp, áp cho mọi giảng viên).
- Giá trị env vô nghĩa → mặc định kèm cảnh báo, như `readAutoThreshold`.
- Đọc env ở `ScoreService` lúc khởi tạo (như θ, `score.service.ts:91`), và ở `eval/cli.ts` và `investigator-runner.ts` để eval đo đúng đường production.
- **Hệ quả:** khi mới triển khai hành vi không đổi so với hôm nay; mọi thay đổi chỉ xảy ra khi cầu dao mở hoặc khi quản trị đặt env.

### 5.3 Cầu dao
**Hai phạm vi:** (a) **một luật** lỗi của một giảng viên (`error_rule`, `UNIQUE (teacher_id, rule_key)`; `ruleKey` chỉ có nghĩa trong phạm vi giảng viên); (b) **lớp bài không lỗi** của một giảng viên (bài mà lượt tính mới nhất có `breakdown.errors` rỗng).

**Nhãn (bảng mới, chỉ thêm), ghi trong cùng giao dịch với `audit_sample_review`** (`AuditReviewService.record`), từ kết quả `compareAudit`:
- `examcollect.audit_rule_label(grading_result_id, rule_id, verdict, recorded_at)`, khoá chính `(grading_result_id, rule_id)`, `verdict ∈ {both, teacher_only, system_only}`: một dòng cho mỗi luật trong `perRule`. Lỗi giảng viên tự viết ngoài bảng lỗi (`extra_errors`) không gắn được vào luật, không vào bảng này.
- `examcollect.audit_no_error_label(grading_result_id, teacher_id, agree, recorded_at)`: chỉ ghi khi lượt tính mới nhất của bài được kiểm có `breakdown.errors` rỗng. `agree = true` khi giảng viên không chọn luật nào và không ghi lỗi nào ngoài bảng lỗi.

**Quy tắc tắt (ghi trước, §6):** với một phạm vi, xét các nhãn ghi sau lần bật lại gần nhất (hoặc toàn bộ nếu chưa từng bị tắt). `n` = số nhãn; `d` = số nhãn bất đồng (`verdict ≠ both` ở phạm vi luật; `agree = false` ở phạm vi lớp không lỗi). Tắt khi `P(X ≥ d | n, p0) < α`, với `p0 = 0,05` và `α = 0,05`: số bất đồng quá nhiều để còn phù hợp với mức bất đồng chấp nhận 5% ở độ tin cậy 95%.
- Ví dụ để kiểm: (n=1, d=1) không tắt; (n=2, d=2) tắt; (n=5, d=1) không tắt; (n=5, d=2) tắt; (n=20, d=3) không tắt; (n=20, d=4) tắt.
- Thiên lệch có chủ đích: `teacher_only` (hệ thống bỏ sót lỗi) tính vào luật bị bỏ sót, nên cầu dao ưu tiên tắt sớm (thêm việc, không cho điểm sai).

**Trạng thái:** bảng `auto_rule_breaker(id, teacher_id, scope, rule_id, tripped_at, evidence, reset_at, reset_by)` với `scope ∈ {rule, no_error}`; `rule_id` bắt buộc khi `scope = rule`, rỗng khi `scope = no_error`; tối đa một dòng mở (`reset_at IS NULL`) cho mỗi (giảng viên, phạm vi, luật).

**Khi tắt (trong cùng giao dịch ghi nhãn):**
1. Ghi một dòng `auto_rule_breaker` (evidence: `n`, `d`, `pValue`, `p0`, `alpha`).
2. Gọi `recomputeForTeacher(m, teacherId, 'auto_rule_tripped', null, scope)` với `scope = { ruleId }` hoặc `{ noErrors: true }`, và `exceptResultId` là bài vừa được kiểm. Mọi bài chưa chốt thuộc phạm vi được quyết lại; bài `auto_approved` bị hạ về `flagged_for_review` vì phạm vi nay bị chặn (`autoBlockedRuleKeys` hoặc `autoNoErrorEnabled = false`). Bài đã `finalized` không đổi. `recomputeForTeacher` được mở rộng thêm điều kiện `noErrors` (`jsonb_array_length(breakdown -> 'errors') = 0`).
3. Lý do lượt tính mới `auto_rule_tripped` (migration thêm giá trị enum).

**Bật lại:** giảng viên sở hữu luật (hoặc chính giảng viên đó với lớp không lỗi) gọi `POST auto-breakers/:id/reset`; ghi `reset_at`, `reset_by`. Không tính lại bài (các bài đã về duyệt giữ nguyên tới khi được tính lại hay duyệt). Các nhãn trước lần bật lại không còn được đếm.
**Xem:** `GET auto-breakers` → danh sách cầu dao đang mở của giảng viên (phạm vi, luật, `n`, `d`, `tripped_at`).

**Vì sao không có vòng chết:** cầu dao là chốt, bật lại do người. Một phạm vi bị tắt sẽ không được tự chốt nên không có nhãn mới; không cần cửa sổ trượt tự phục hồi.

**Giới hạn phải nói rõ:**
- Cầu dao chỉ thấy bất đồng trên bài **được kiểm mẫu** (20%, sàn 5%). Bài tự chốt sai mà không được rút mẫu vẫn tồn tại cho tới khi cầu dao kịp tắt; với p0 = 5% và rút 20%, còn một tỉ lệ nhỏ bài tự chốt sai trước khi cầu dao tắt. p0 là **giả thuyết**, không phải cam kết chất lượng.
- Hướng sai lệch của lớp không lỗi là **cho điểm cao hơn đáng được** (sinh viên được lợi), nhưng có rủi ro gian lận không bị phát hiện (hard-code). Lớp này tin cậy thấp nhất trong số đo (§1.1) và hiện chỉ không lọt nhờ các cờ. Vì vậy **nới cờ là bước riêng, sau khi biết nguồn cờ** (§5.7), không cùng đợt với cầu dao.
- Nhãn lấy từ kiểm mẫu mù (`audit_sample_review`), không từ duyệt nhanh bài bị cờ; không có thiên lệch chọn mẫu do cờ.

### 5.4 Đường xác nhận bài điều tra và gom bài
Phục vụ phần còn lại (bài bị gắn cờ):
- **Kind mới `system_confirm`** trong `teacher_review_kind`: ghi "giảng viên chấp nhận điểm của lượt tính này". Migration: thêm giá trị enum; thêm cột `confirmed_computation_id uuid NULL REFERENCES score_computation(id)`; CHECK: `kind = 'system_confirm'` yêu cầu `confirmed_computation_id` và `final_score` khác NULL, với `final_score` bằng tổng của lượt tính đó.
- `system_confirm` **không** khoá bài khỏi lượt tính lại (chỉ `manual_score` khoá, `score.service.ts:319-320, 468-469`).
- **Gom theo `ruleId` lấy từ lượt tính mới nhất** (`score-core.ts:30-41`): bài có đúng một lỗi → nhóm theo khoá `${rubric_id_version}:${ruleId}`; nhiều lỗi → nhóm `multi`; không lỗi → nhóm `none`. Cùng luật ở hai phiên bản rubric là hai nhóm. Lý do (ghi lại 21/10, sau review Task 6): luật thuộc GIÁO VIÊN (`uq_error_rule_teacher_key`), không thuộc rubric, nên gom chỉ theo `ruleId` sẽ gộp hai phiên bản có tiêu chí hoặc độ trừ khác nhau thành một nhóm mà giảng viên xác nhận một lần.
- **Endpoint mới** (không dùng `BulkAcceptEssays`, chỉ dành cho tự luận):
  - `GET exam-sessions/:id/review-groups` → danh sách nhóm: khoá, nhãn, mô tả luật, nguồn lỗi, số bài, danh sách bài, bài mẫu (tối đa 3, theo thứ tự xác định), `multi`/`none`.
  - `POST exam-sessions/:id/review-groups/confirm` `{ key, resultIds? }` → trong **một** giao dịch: với mỗi bài `flagged_for_review`, pipeline `investigator`, có lượt tính: ghi `system_confirm` và chuyển `flagged_for_review → teacher_reviewed`. Bài bị bỏ ghi lý do: `not_flagged`, `has_manual`, `ungradable`, `no_computation`, `not_investigator`.
- UI: `ReviewGroupsPanel` cạnh `BulkAcceptEssays` (mock-up: artboard "Xác nhận theo lỗi" và "Hộp xác nhận hàng loạt"). Mỗi nhóm hiện mô tả luật, nhãn nguồn và liên kết tới bài mẫu (mở hồ sơ có dẫn chứng, §5.8), để giảng viên không xác nhận hàng loạt thứ mình chưa thấy. **Chỉ nhóm một lỗi có nút xác nhận hàng loạt**; nhóm `multi` và `none` chỉ có "Xem từng bài" (endpoint vẫn nhận khoá `multi`/`none`, nhưng giao diện không đưa ra). Nhóm `none` hiện lý do cờ (nguồn từ §5.7) và cảnh báo "không có lỗi là kết luận kém chắc chắn nhất". Hộp xác nhận liệt kê từng bài kèm điểm hệ thống và trạng thái "chưa xem"; cảnh báo nếu chưa mở bài nào nhưng **không chặn**. Thêm khối "Tự chốt đang tạm dừng" kèm nút bật lại (§5.3). Route mới cần sinh lại `schema.d.ts` OpenAPI.

### 5.5 Nhãn đo thời gian
- **Mốc mở bài:** cột `opened_at timestamptz NULL` trên **`grading_result`**, không trên `teacher_review` (lúc mở bài chưa có dòng nào, CHECK cấm dòng không điểm). Ghi một lần (`WHERE opened_at IS NULL`) qua `POST grading-results/:id/opened`. Phải xác minh trigger `guard_grading_result_ai_immutable` không chặn cột này.
- **View SQL `examcollect.review_label_v`** (không thêm bảng): mỗi bài một dòng với `result_id`, `pipeline`, `status`, `system_total` (lượt tính mới nhất), `decision_kind` (`auto` nếu không có dòng giảng viên; còn lại là kind của dòng mới nhất), `teacher_total`, `opened_at`, `reviewed_at`, `review_seconds`. `review_seconds` cho `t` ở §1.2.
- Bài chốt thẳng (`auto_approved → finalized`) có nhãn `auto` và được đo bằng kiểm mẫu, không bằng quyết định giảng viên.

### 5.6 Kiểm mẫu
- **Giữ rút theo sinh viên** (`drawnForStudentAudit`): bất biến P1b là "mọi câu tự duyệt của một sinh viên cùng được rút"; đổi sang theo bài làm đỏ `multi-problem-p1b-audit.e2e-spec.ts:72-118`.
- **Thêm số mẫu tối thiểu theo phiên:** `AUDIT_MIN_PER_SESSION` (mặc định 2, chờ chủ đồ án quyết), thực hiện ở một bước cấp phiên khi mọi bài đã chấm xong. **Bắt buộc:** tự chốt đang bật và cầu dao chỉ có mắt khi có mẫu; ở sàn 5% với 40 bài, xác suất không rút được mẫu nào là khoảng 12,9% (tính toán, đánh giá 20/10 §5.2).

### 5.7 Chẩn đoán cờ `injection_suspected`
- Cờ này là nguyên nhân lớn nhất khiến bài sạch bị chuyển (§1.1) và gộp ba nguồn (`investigate.ts:313-319`); bản ghi không phân biệt nguồn nên chưa biết nguồn nào bắn trên bài sạch.
- Chỉ làm phần **ghi nguồn**: `detail` của cờ nêu một hoặc nhiều trong `submission_pattern`, `tool_output`, `model_claim_with_quote`, `model_claim_without_quote`. Không đổi điều kiện bắn cờ.
- Sau một lượt diễn tập/đo thật với nguồn được ghi, quyết định nới điều kiện nào (ví dụ bỏ `model_claim_without_quote`) là một thay đổi riêng, kèm số đo và lượt chạy lại, và phải đi sau cầu dao cấp lớp (§5.3); nằm ngoài phạm vi này.

### 5.8 Hồ sơ lỗi có dẫn chứng — giai đoạn E1 (giao diện, không đổi agent)
Áp dụng cho trang chi tiết một bài (`InvestigatorDossier`). Mỗi thẻ lỗi có khối **"Vì sao lỗi này"**, mở sẵn với bài `flagged_for_review`:

1. **Luật.** Tên và mô tả của luật (`description`). Điều kiện theo `predicate`, bằng tiếng Việt thường:
   - `test_group_failed` → "Có ca kiểm thử thuộc nhóm “{group}” không đạt";
   - `calls_function` → "Bài gọi hàm “{name}”";
   - `complexity_exceeds_required` → "Độ phức tạp đo được vượt mức đề yêu cầu";
   - `no_recursion` → "Bài không dùng đệ quy" kèm tên hàm nếu có;
   - `null` → "Luật bằng lời: model đọc bài và phán, không có phép đo".
2. **Cách phát hiện.** Nhãn nguồn kèm một câu giải thích và hệ quả cho tự chốt: "Máy quyết" = đo bằng chạy bài trong sandbox (confidence 1,0); "Có công cụ" = model phán dựa trên kết quả chạy (0,85); "Chỉ mô hình" = model đọc code, không có phép đo (0,5; bài có lỗi này khó tự chốt).
3. **Bằng chứng**, theo thứ tự có thì hiện:
   - **Ca kiểm thử** (từ kết quả có cấu trúc của các lời gọi trong `toolCallIds` của lỗi): tên ca, nhóm, trạng thái, diff rút gọn; ca không đạt đứng trước.
   - **Lời gọi bằng chứng:** `#N`, tên công cụ, đầu ra rút gọn mở rộng được; liên kết neo tới đúng dòng trong "Đường điều tra" thay vì để giảng viên tự dò.
   - **Đoạn mã** (có từ E2, §5.9): `file:dòng–dòng` và trích đoạn, kèm trạng thái "đã kiểm chứng trong bài" hoặc "chưa kiểm chứng được".
   - Lỗi không có bằng chứng nào → nói thẳng: "Không có bằng chứng kèm theo; chỉ có nhận định của model".
   - **Lỗi dạng thiếu** (không có đoạn mã để trích, như thiếu chú thích): hiện phạm vi model đã đọc (file, số dòng, lời gọi `read_file`) và liên kết để tự kiểm toàn bộ file.
   - **Đoạn trích dài:** hiện đầu và cuối, thu gọn phần giữa kèm nút "Hiện cả đoạn".
   - **Chưa kiểm chứng được** (`verified = false`): hiện kiểu cảnh báo, ghi rõ là lời model và không dùng làm bằng chứng.
   - Mỗi lời gọi trong "Đường điều tra" ghi ngược lại nó là căn cứ của lỗi nào.
4. **Mức trừ.** Số trừ, nguồn "bảng lỗi", và ghi rõ khi bị trần tiêu chí (`perCriterion.capped`).
5. **Phản biện.** Mỗi lăng kính: kết luận, lý do (có từ E2; trước đó ghi "không kèm lý do" thay vì nhãn rỗng) và các lời gọi căn cứ.
6. **Banner `low_confidence` và thẻ điểm.** Bảng đóng góp: từng lỗi, nguồn, trần, mức trừ; trung bình có trọng số; dòng "giới hạn khác kéo xuống {confidence}" khi tính lại khác giá trị đã lưu.
7. **Quyết định.** Cột phải có khối "Quyết định của bạn" (dính khi cuộn): nút "Chấp nhận điểm X" và "Chấm tay…". "Chấp nhận" dùng cùng endpoint xác nhận của §5.4 với `resultIds` là một bài (kind `system_confirm`).

Mock-up: Artifact "Hồ sơ lỗi dẫn chứng" (artboard "Chi tiết một bài" và "Thẻ lỗi: các trạng thái"); dữ liệu trong đó là minh hoạ dựa trên bài diễn tập HS2410018.

**API cộng thêm (không đổi tính điểm):**
- `ResultDetailError` thêm `ruleDescription: string | null` và `predicate: RulePredicate | null` (từ `error_rule_revision` hiện hành, cùng cách lấy `ruleName` hôm nay).
- `ChallengeVerdictDetail` thêm `toolCallIds: string[]` (đã có trong `perError`).
- `ResultDetail` thêm `confidenceTerms: { ruleKey: string; source: VerdictSource; cap: number; deductionHundredths: number }[]`, tính lúc đọc từ `breakdown.errors` và `modelCeiling` đã lưu, dùng `capOf` (không đổi hình dạng `score_computation.breakdown`).
- Kiểu phía web khai báo thêm kết quả có cấu trúc của lời gọi. Tôi chưa kiểm payload thật có gửi đủ không; nếu thiếu thì cộng vào API.

**Che mù:** mọi trường mới nằm sau nhánh `blindResultDetail`; `blindResultDetail` trả giá trị rỗng cho các trường mới và có test khẳng định bài `audit_pending` không rò bằng chứng, định nghĩa luật hay `confidenceTerms`.

### 5.8a Từ ngữ giao diện (viết cho giảng viên, không dùng từ của AI)
Nguyên tắc: nói như một đồng nghiệp. Dùng "hệ thống" thay cho "model", "AI", "agent"; đặt câu hỏi trực tiếp thay cho tên kỹ thuật; dùng phần trăm thay cho số thập phân khi nói về độ chắc chắn. Chỉ đổi **nhãn hiển thị**, không đổi mã nội bộ. Mã khoá luật như `ro_ri_bo_nho` vẫn hiện nguyên vì do chính giảng viên đặt trong Bảng lỗi.

| Thuật ngữ nội bộ | Giao diện |
|---|---|
| Máy quyết (`deterministic`) | Chạy bài kiểm tra · chắc chắn 100% |
| Có công cụ (`llm_with_tools`) | Đọc code + chạy thử · chắc chắn 85% |
| Chỉ mô hình (`llm_only`) | Đọc code, nhận định · chắc chắn 50% |
| Độ tin cậy, ngưỡng tự quyết θ | Mức chắc chắn; "cần từ 85% mới tự chốt" |
| Luật, điều kiện | Quy tắc trừ điểm, cách nhận biết |
| Cách phát hiện | Cách hệ thống tìm ra lỗi |
| Mức trừ | Điểm bị trừ |
| Lỗi chẩn đoán được | Lỗi hệ thống tìm thấy |
| Vì sao lỗi này | Vì sao bị trừ điểm |
| Phản biện: Tính đúng, Quá tay | Hệ thống tự kiểm tra lại: "Lỗi có thật không?", "Trừ vậy có nặng quá không?" |
| Phản biện cấp bài: Bỏ sót, Gian lận | Hệ thống kiểm tra toàn bài: "Có bỏ sót lỗi nào không?", "Có dấu hiệu gian lận không?" |
| Bác bỏ, đồng ý bác bỏ | Hệ thống đề nghị bỏ lỗi này, đồng ý bỏ lỗi này |
| Chưa xác minh (`unverified`) | Chưa kiểm tra lại được |
| Đường điều tra, lời gọi | Các bước hệ thống đã làm, bước |
| Đoạn trích đã kiểm chứng (`verified`) | Đã đối chiếu: đoạn này đúng là có trong bài |
| hard-code | in sẵn đáp án |
| `injection_suspected` | bài có chỗ giống lời dặn gửi cho hệ thống chấm |
| Kiểm mẫu, cầu dao | Kiểm tra ngẫu nhiên, tạm dừng tự chốt điểm |
| Xác nhận hàng loạt | Duyệt nhanh theo nhóm lỗi; nút "Duyệt N bài" |
| Độ phủ điều tra | Hệ thống đã kiểm tra những gì |
| Mức chắc chắn của bài không có lỗi nào (giá trị nội bộ 1,0) | Chưa đo được |
| Độ khớp (nhãn kiểm mẫu) | Độ khớp với bạn: "Bạn đồng ý N/M lần" |

"Tự chốt" giữ nguyên vì đã là từ của sản phẩm. Mock-up đã áp bộ từ ngữ này; khi code, `SOURCE_LABEL`, `VERDICT_LABEL`, `lensLabel` trong `grading-vocab.ts` và các chuỗi trong test phải đổi theo.

### 5.8b Mức chắc chắn và độ khớp với bạn
Giảng viên cần liếc một lần là biết hệ thống chấm bài này đáng tin đến đâu.
- **Hero đầu trang chi tiết:** số % lớn (56px), thanh 0–100% có vạch ngưỡng θ, chip bằng chữ (đạt ngưỡng / vừa đủ ngưỡng / chưa đạt ngưỡng kèm "thiếu N điểm phần trăm" / không có lỗi nào để đo / đã tạm dừng tự chốt), và một dòng nêu lỗi kéo mức thấp nhất. Không chỉ dựa vào màu. Con số cũng hiện ở đầu mỗi thẻ lỗi (trần theo nguồn lỗi), ở khối "Quyết định của bạn" và ở mỗi nhóm trong panel duyệt nhanh.
- **Trung thực về giới hạn của con số.** Mức chắc chắn là confidence tự gán theo nguồn lỗi (§3), **chưa được hiệu chỉnh với nhãn giảng viên**. Ở lượt `ngan-xep-v2` lượt 1, 10 bài có confidence 100% nhưng 3 bài trong số đó điểm sai (HS2410021, 028, 029), cả ba là bài không lỗi (mẫu tự dựng, mật độ lỗi cấy cao; chỉ là cảnh báo, không phải tỉ lệ thật). Vì vậy:
  1. Bài không có lỗi nào **không hiện số %**: thay bằng trạng thái chữ **"Chưa đo được"** (xám), ô thanh viền đứt không có vạch ngưỡng, chip "Bài không có lỗi nào" và cảnh báo "không thấy lỗi không có nghĩa là bài đúng". Hệ thống vẫn dùng giá trị nội bộ 1,0 (theo độ phủ) để quyết định tự chốt; giao diện không trình bày nó như một mức chắc chắn. Bài thuộc loại đã tạm dừng tự chốt cũng hiện "Chưa đo được", kèm chip "Đã tạm dừng tự chốt cho loại bài này".
  2. Luôn đặt **"Độ khớp với bạn"** ngay cạnh số %; đây mới là thước đo chất lượng trên thực tế.
- **Độ khớp với bạn** lấy từ nhãn kiểm mẫu mù (`audit_rule_label`, `audit_no_error_label`, §5.3): "Bạn đồng ý N/M lần" theo từng quy tắc; hero cộng dồn các quy tắc của bài. Chưa có nhãn → "chưa có bài kiểm tra ngẫu nhiên nào". Quy tắc đang bị tạm dừng → chip "Đã tạm dừng tự chốt". Cũng hiện cạnh mỗi quy tắc trong Bảng lỗi.
- **API (cộng thêm, rỗng trong `blindResultDetail`):** `ResultDetailError.agreement: { n: number; disagreements: number; paused: boolean }` (đếm từ lần bật lại gần nhất) và `ResultDetail.noErrorAgreement` cùng dạng cho lớp không lỗi.

### 5.8c Gói test và quy tắc trừ điểm
Giảng viên cần biết **ca nào, trong gói test nào, chạy lỗi, và nó là bằng chứng cho quy tắc nào**. Mục nằm ngay dưới danh sách lỗi (mock-up: artboard "Chi tiết một bài" và "Gói test: các trạng thái").
- **Dòng giới thiệu gói test:** phiên bản, nguồn (bạn tải lên kèm tên file, hay hệ thống sinh từ đề), đã duyệt, số ca và nhóm, số ca bị hệ thống tự bỏ nếu có (`grading_test_bundle.version/origin/filename/approved_at`; `grading_test_case.auto_dropped_reason`).
- **Theo từng nhóm:** số ca không đạt; quy tắc nào dùng nhóm này (`predicate.kind = test_group_failed`, `group`); quy tắc đang trừ điểm hay chưa kích hoạt. Mỗi ca: kết quả (Đạt / Không đạt / Hết giờ / Chưa chạy) và tên ca. Ca không đạt hiện nhãn "bằng chứng cho {quy tắc}", câu của đề mà ca này kiểm tra (`grading_test_case.constraint_quote`), dữ liệu vào, đáp án và bài làm.
- **Ba trạng thái phải nói thẳng:**
  1. **Ca không đạt nhưng chưa thuộc quy tắc nào:** ca không bị trừ điểm; mời thêm quy tắc cho nhóm.
  2. **Quy tắc chưa đo được:** quy tắc dùng một nhóm mà gói test này không có (`PredicateOutcome.state = 'unmeasured'`); không trừ điểm và không có nghĩa là đạt.
  3. **Gói test chưa chạy hết** (kết cục `ungradable`, lớp `system`): chưa chạy không có nghĩa là đạt; mời chấm lại hoặc chấm tay.
- **API (cộng thêm, rỗng trong `blindResultDetail`):** `ResultDetail.testBundle: { id; version; origin: 'uploaded' | 'generated'; filename: string | null; approved: boolean; caseCount: number; droppedCount: number; groups: { group: string; cases: { caseKey: string; status: 'pass' | 'fail' | 'timeout' | 'error' | 'not_run'; ms: number | null; constraintQuote: string | null; input: string; expectedOutput: string; diff: string | null }[]; rules: { ruleId: string; ruleKey: string; deductionHundredths: number | null; triggered: boolean }[] }[]; unmeasuredRules: { ruleId: string; ruleKey: string; group: string }[]; uncoveredFailingCases: string[] } | null`. Dựng lúc đọc từ `grading_test_bundle`, `grading_test_case`, `structuredResults` của lời gọi `run_tests` và `error_rule_revision.predicate`.

### 5.9 Agent trả dẫn chứng và lý do — giai đoạn E2 (đổi agent, có cổng đo)
Mục đích: lỗi `llm_only` hôm nay không có dữ liệu để chỉ ra đoạn code, và lăng kính xác nhận không kèm lý do.
- `VerdictError` thêm `evidence?: { file: string; startLine: number | null; endLine: number | null; quote: string; verified: boolean }[]`: model trả `file`, dòng và `quote` (tối đa 3 mục, mỗi `quote` tối đa 300 ký tự); **harness** đặt `verified` bằng cách kiểm `quote` có trong nội dung `file` của bài (chuẩn hoá khoảng trắng), dùng lại cơ chế `quoteAppearsInSubmission`. Đoạn không khớp vẫn được lưu với `verified = false` (không ẩn).
- Kết luận của lăng kính per-error thêm `reason?: string` (cắt ở `CASE_NOTE_MAX` = 500) cho cả `confirmed` lẫn `refuted`; ghi vào `perError[].reason`.
- Mọi trường mới là **tuỳ chọn** khi đọc (zod `optional`): model hay bỏ khoá, và không được biến một phản hồi hợp lệ thành `bad_output` (đã gặp, `lens-protocol.ts:78-81`). Hồ sơ cũ không có các trường này; giao diện xử lý vắng mặt.
- Gateway bỏ qua `json_schema` (memory `cine-gateway-ignores-json-schema`), nên khuôn JSON phải được tả trong prompt; nâng phiên bản prompt (`prompt-version.ts`) để benchmark so sánh được.
- **Chỉ hiển thị.** Dẫn chứng và lý do không đổi điểm, không đổi quyết định tự chốt, không đổi cờ.
- **Cổng đo (ghi trước, chờ duyệt), lượt `ngan-xep-v2`, k = 3, so với lượt nền ngay trước:** (i) điểm đúng và lỗi bắt được không giảm; (ii) ít nhất 80% lỗi `llm_only` và `llm_with_tools` có một đoạn `verified`; (iii) token mỗi bài và thời gian mỗi bài không tăng quá 20%. Không đạt thì E2 không merge; ghi mọi lượt vào lịch sử benchmark.

## 6. Ngưỡng và phương án đo

**Định nghĩa "khớp":** cùng quyết định (giữ/bỏ/trừ điểm) và cùng mức trừ, nhãn giảng viên làm chuẩn, cho cùng một luật trên cùng một bài.

**Tham số cầu dao (ghi trước):** `p0 = 0,05`, `α = 0,05`. Đổi tham số phải có lý do trong lịch sử benchmark, và không được đổi sau khi xem số đo của đúng lượt đó.

**Ngưỡng để tuyên bố trong báo cáo (đề xuất, chờ duyệt)** — không còn là điều kiện bật tính năng:
- Precision của tự chốt theo luật ≥ 0,95, cận dưới Clopper–Pearson một phía 97,5%. Không có sai nào cần khoảng **72 ca** tự chốt (ln 0,025 / ln 0,95 ≈ 72; tôi tính).
- Mức "tự chốt có giám sát": cận dưới ≥ 0,90, khoảng **36 ca** không sai (tôi tính).
- Mẫu phải từ bài thật có nhãn giảng viên. Bài cấy lỗi không được tính.

**Số đo phụ:** tỉ lệ trượt oan, tỉ lệ giảng viên đổi điểm trong duyệt nhanh, `t` (giây mỗi bài, `review_seconds`), số lần cầu dao tắt và phạm vi nào, tỉ lệ lỗi có dẫn chứng đã kiểm chứng (E2).

## 7. Thước "hiệu quả"

Hệ thống có hiệu quả khi đồng thời:
1. Thời gian giảng viên mỗi phiên giảm so với chấm tay (mục tiêu giảm 80%; đo bằng `review_seconds` và mốc phiên, cùng giảng viên hoặc cùng loại bài). Ảnh hưởng của hồ sơ có dẫn chứng đọc được bằng cách so `review_seconds` trước và sau E1/E2 (không phải thí nghiệm có đối chứng; chỉ là chỉ báo).
2. Không tăng số bài sinh viên bị chấm oan so với giảng viên (đo bằng nhãn kiểm mẫu và tỉ lệ trượt oan).
3. Với phạm vi được tự chốt: số bất đồng trên kiểm mẫu không làm cầu dao tắt, và khi đủ ca thì đạt ngưỡng §6 để tuyên bố.

Chỉ đạt (1) là công cụ tiết kiệm thời gian. Chỉ đạt (3) mà không đo (1) thì chưa đủ để gọi là hiệu quả.

## 8. Thứ tự triển khai và rủi ro

1. Kiểm trạng thái DB thật: đếm bài `auto_approved`, `audit_pending` chưa chốt theo ba nhóm (không lỗi; có lỗi máy; có lỗi llm). Ghi vào benchmark.
2. Áp migration additive lên Supabase **trước** khi merge (cột `opened_at`, enum `system_confirm` và `auto_rule_tripped`, ba bảng nhãn và cầu dao, view). Railway tự deploy `main` và **không** chạy migration; code có cột/bảng mới mà DB chưa có sẽ làm lỗi các truy vấn qua entity (500), trong khi `/health` vẫn xanh.
3. Lưới an toàn trước: nhãn, cầu dao (cả hai phạm vi) và số mẫu tối thiểu (§5.3, §5.6), rồi hợp nhất cấu hình vào `ScoreService`. Cờ lớp không lỗi và tập chặn mặc định không đổi hành vi.
4. Sửa θ (§5.1) sau bước 3.
5. Đường xác nhận và gom nhóm (§5.4), mốc mở bài (§5.5).
6. **E1** (§5.8): API cộng thêm và giao diện. Độc lập với bước 3–5 (chỉ chung `blindResultDetail`), có thể làm song song.
7. Ghi nguồn cờ (§5.7), chạy một lượt diễn tập thật để đọc nguồn.
8. **E2** (§5.9): sau E1; cần môi trường diễn tập thật và có cổng đo.

**Rủi ro:** cầu dao — TRUNG BÌNH (thêm trạng thái, tính lại trong giao dịch kiểm mẫu; lỗi ở đây làm hỏng việc ghi nhãn kiểm mẫu). Đường xác nhận — TRUNG BÌNH (backend mới). Migration và Railway — TRUNG BÌNH (vận hành). θ — THẤP khi cầu dao đã chạy. Nhãn thời gian — THẤP cho view, TRUNG BÌNH cho mốc mở bài. E1 — THẤP (đọc thêm, không đổi tính điểm) nhưng rủi ro **lộ mù** nếu quên `blindResultDetail`; có test chặn. E2 — TRUNG BÌNH (đổi prompt và khuôn phản hồi của agent; chặn bằng cổng đo và trường tuỳ chọn).

## 9. Ảnh hưởng tới hệ thống hiện tại (tóm tắt)

- **Bài có lỗi và bài không lỗi đang tự chốt hôm nay:** không đổi khi chưa cầu dao nào mở.
- **Bài đã `finalized`:** không đổi.
- **Bài thuộc phạm vi vừa bị cầu dao tắt, chưa chốt:** về `flagged_for_review` ngay trong giao dịch kiểm mẫu gây ra cầu dao.
- **Bài tự luận:** không đổi.
- **Eval và diễn tập:** không đổi kỳ vọng tự chốt khi chưa cầu dao mở. E2 đổi prompt nên là một lượt có phiên bản prompt mới trong lịch sử benchmark.
- **Test:** ít test đỏ — mặc định tham số giữ hành vi cũ. Test mới cho cờ, cầu dao, gom nhóm, xác nhận, nhãn, kiểm mẫu, giao diện bằng chứng, che mù.
- **Kiểm mẫu:** thêm bước số mẫu tối thiểu ở cấp phiên; `AuditReviewService.record` ghi thêm nhãn và có thể tính lại bài trong cùng giao dịch.
- **Trang chi tiết một bài:** thẻ lỗi và banner đổi hình thức; hành động giữ nguyên. Payload API tăng nhẹ (mô tả luật, điều kiện, lời gọi của lăng kính).

## 10. Quyết định của chủ đồ án (còn chờ, theo thứ tự quan trọng)

Đã chốt (21/10): tự chốt giữ bật cho bài có lỗi, có cầu dao, không tắt đến khi đo; giao diện hồ sơ lỗi có dẫn chứng làm chung một spec.
**Người viết hiểu là đã đồng ý, xin xác nhận lại:** bài không lỗi giữ tự chốt như hôm nay với cầu dao cấp lớp, và nới cờ là bước sau (§5.3, §5.7).

1. **Ngày bảo vệ và có bài thật không.** Chỉ quyết mức tuyên bố, không quyết tính năng.
2. **Tham số cầu dao:** `p0 = 0,05`, `α = 0,05` có hợp lý? p0 càng nhỏ thì cầu dao tắt càng sớm, thêm việc cho giảng viên; p0 lớn thì chất lượng bị đánh đổi.
3. **Công tắc khẩn cấp:** biến môi trường `GRADING_AUTO_BLOCK_RULE_KEYS` (đổi phải triển khai lại) là đủ, hay cần giao diện cho quản trị?
4. **Kiểm mẫu:** xác nhận giữ rút theo sinh viên và `AUDIT_MIN_PER_SESSION` (đề xuất 2).
5. **Cổng đo của E2** (§5.9): ba điều kiện và ngưỡng 80%/20% có hợp lý?
6. **Phạm vi E2:** có làm E2 trong đợt này, hay dừng ở E1 trước và đo `t` rồi mới quyết?
7. **Ngưỡng §6 và thước §7:** cần trước khi tuyên bố kết quả; không chặn việc làm.
8. **Nhấn mạnh mức chắc chắn dù chưa hiệu chỉnh** (§5.8b): đề xuất chấp nhận kèm ba biện pháp (độ khớp với bạn đặt cạnh số, bài không lỗi hiện "Chưa đo được" thay cho số, chú thích nói rõ con số chưa đo với nhãn của bạn). Nếu không, nên ẩn số % cho tới khi có đủ nhãn.

## 11. Quyết định của người viết (có thể đổi)

- Cờ chặn là tham số của `decide()`, mặc định giữ hành vi hôm nay; nguồn là cầu dao DB và env. Không dùng θ để tắt.
- Cầu dao theo `rule_id` của từng giảng viên và cầu dao cấp lớp không lỗi của từng giảng viên; quy tắc nhị thức một phía; bật lại do giảng viên, không tự phục hồi.
- Nhãn theo luật lấy từ kiểm mẫu mù đã có, ghi bảng riêng chỉ-thêm.
- Đường xác nhận bài điều tra là endpoint và kind mới `system_confirm`; không mở rộng `BulkAcceptEssays`. Gom theo `ruleId` của lượt tính mới nhất.
- Nhãn thời gian: mốc `opened_at` trên `grading_result` (ghi một lần) và một view SQL.
- Kiểm mẫu: giữ rút theo sinh viên, thêm số mẫu tối thiểu theo phiên.
- Sửa θ đi sau cầu dao. Không nới cờ giả khi chưa có nguồn.
- Hồ sơ lỗi: E1 trước (đọc thêm, không đổi agent), E2 sau và chỉ hiển thị; mọi trường dẫn chứng tuỳ chọn.

## 12. Kiểm thử

- Cầu dao (hàm thuần): các ví dụ ở §5.3; `n = 0` → không tắt; `d > n` → lỗi tham số.
- Cờ: bài không lỗi với `autoNoErrorEnabled=false` → `no_error_auto_disabled`, kể cả confidence 1,0; tham số vắng → bài không lỗi vẫn tự chốt như hôm nay; luật thuộc `autoBlockedRuleKeys` → không tự chốt; tập rỗng → bài lỗi máy vẫn tự chốt như hôm nay.
- Nhãn: `audit_rule_label` ghi `both`/`teacher_only`/`system_only` đúng theo `compareAudit`; `audit_no_error_label` chỉ ghi cho bài có `breakdown.errors` rỗng; cùng giao dịch với nhãn kiểm mẫu; giao dịch lùi thì không còn nhãn nào.
- Tắt: sau ghi nhãn làm `P < α`, có đúng một dòng `auto_rule_breaker` mở (theo từng phạm vi); bài `auto_approved` chưa chốt thuộc phạm vi về `flagged_for_review`; bài `finalized` không đổi; bài vừa được kiểm không có lượt tính mới; gọi tiếp không ghi dòng thứ hai.
- Bật lại: chỉ giảng viên sở hữu; nhãn trước lần bật lại không đếm; sau đó tắt lại được.
- θ: biên với một lỗi `llm_with_tools` mức trừ 13 hundredths → không có `low_confidence`.
- Gom: bài một lỗi cùng `ruleId` → cùng nhóm; hai phiên bản rubric → hai nhóm; nhiều lỗi → `multi`; nhóm mang mô tả luật, nguồn và bài mẫu.
- Xác nhận: bài không `flagged_for_review`, có `manual_score`, `ungradable` → bỏ đúng lý do; xác nhận lại không ghi trùng.
- Nhãn thời gian: `opened_at` chỉ ghi một lần; view đúng `decision_kind` từng nhánh.
- Kiểm mẫu: số mẫu tối thiểu tôn trọng khi số sinh viên nhỏ; bất biến P1b giữ nguyên.
- Cờ nguồn: `detail` của `injection_suspected` mang đúng các nguồn khớp; hồ sơ cũ không có nguồn → `detail` như hôm nay.
- E1 (API): `ruleDescription`, `predicate`, `toolCallIds` của lăng kính và `confidenceTerms` đúng; trung bình có trọng số của `confidenceTerms` khớp `confidence` đã lưu trên ca không có giới hạn khác (ca HS2410018: 0,714). **Mù:** bài `audit_pending` không mang bất kỳ trường mới nào có nội dung.
- E1 (giao diện): thẻ lỗi hiện luật, điều kiện bằng lời theo từng loại `predicate`, ca test không đạt trước, lời gọi bằng chứng có neo tới "Đường điều tra"; lỗi không bằng chứng hiện câu nói thẳng; lăng kính không lý do hiện "không kèm lý do"; banner hiện bảng đóng góp.
- E1 (mức chắc chắn): `agreement` đếm đúng từ lần bật lại gần nhất; bài không lỗi không hiện số % mà hiện "Chưa đo được", ô thanh viền đứt và cảnh báo, và không hiện chip "Đạt ngưỡng" (kể cả khi giá trị nội bộ là 1,0); chip theo ba mức (đạt / vừa đủ / chưa đạt) khớp với so sánh θ có dung sai; hero hiện "chưa có bài kiểm tra ngẫu nhiên nào" khi chưa có nhãn.
- E1 (gói test): `testBundle.groups[].rules` đúng theo `predicate.group`; ca không đạt thuộc nhóm không có quy tắc nào vào `uncoveredFailingCases`; quy tắc dùng nhóm không có trong gói vào `unmeasuredRules`; gói chạy dở có ca `not_run` và giao diện nói "chưa chạy ≠ đạt"; `testBundle` rỗng với bài `audit_pending`.
- E2: `quote` có trong file → `verified = true`; không có → `false` và vẫn lưu; thiếu `evidence`/`reason` → vẫn là phản hồi hợp lệ; điểm, cờ và quyết định không đổi khi có hay không có dẫn chứng.
- Mọi test đổi kỳ vọng được ghi rõ là thay đổi chính sách (không phải sửa để xanh).
