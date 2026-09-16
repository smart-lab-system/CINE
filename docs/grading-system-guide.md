# Hệ thống chấm điểm AI — hướng dẫn cho người tiếp nhận

**Cập nhật:** 2026-09-16 · **Trạng thái code:** nhánh `feature/grading-pipeline-hardening` (PR #32) · **Baseline:** `main` = `c50caf4`

Tài liệu này dành cho người **sẽ sửa code này sau tôi**. Nó mô tả hệ thống **như đang có**, không phải như thiết kế mong muốn. Chỗ nào chưa có, nó nói thẳng là chưa có.

> **Ba tài liệu, ba vai trò khác nhau — đừng nhầm:**
>
> | File | Là gì | Khi nào đọc |
> |---|---|---|
> | `docs/superpowers/specs/2026-09-14-ai-grading-agent-design.md` | **Spec.** Vì sao mọi thứ được quyết như vậy, kèm §14 (21 ca test bắt buộc) và §15 (đã đo / chưa đo) | Trước khi đổi một quyết định thiết kế |
> | **File này** | **Bản đồ.** Cái gì nằm ở đâu, luồng chạy ra sao, sửa gì thì sửa ở đâu | Ngày đầu tiên |
> | `docs/AI-grading-architecture.md` | **Bản phác trước khi code.** Có những thứ *chưa bao giờ được xây* (Docker sandbox, semantic clustering, bi-directional highlighting) | Chỉ để hiểu ý định ban đầu — **không** dùng làm mô tả hệ thống |

---

## 1. Hệ thống làm gì

> Nhận một bài nộp đã thu, chấm theo rubric bằng LLM, và trả về **đề xuất điểm** kèm dẫn chứng nguyên văn để giảng viên duyệt.

Nó **không** chấm thay giảng viên. Bước duyệt của con người là ràng buộc thiết kế, không phải tính năng có thể bỏ khi thiếu thời gian.

### 1.1 Bốn ranh giới không được vượt

Đây là phần quan trọng nhất của tài liệu. Vi phạm bất kỳ điều nào dưới đây đều **không làm đỏ test một cách hiển nhiên** nếu bạn cũng sửa test — nên chúng phải được hiểu, không chỉ được kiểm.

**① Model phán đoán, code đếm.**
Provider chỉ được trả `verdict` (`met` / `partially_met` / `not_met`) và `evidence` (trích nguyên văn). **Mọi con số tính lại ở server** trong `enforceScoring()`. Một model thật trả `verdict: 'not_met'` kèm `points: 10` là chuyện *sẽ* xảy ra — model làm số học kém — và không có lớp này thì con số đó đi thẳng vào bảng điểm sinh viên.

**② `confidence` do guard quyết, không do model tự chấm.**
Model tự đánh giá độ tin cậy của chính nó là tín hiệu hiệu chỉnh kém nhất có thể. `applyGuards()` tính `confidence` từ việc **đối chiếu dẫn chứng nguyên văn với bài làm** — một phép đo cơ học, lặp lại được. Provider chỉ được đặt **trần** (`confidenceCeiling`), tức "cơ chế của tôi không biện minh nổi mức cao hơn thế này", và server lấy `Math.min` của hai giá trị.

**③ Advocate không bao giờ chạm vào điểm.**
Lượt hỏi thứ hai ("bỏ qua rubric, em ấy có đúng không?") chỉ sinh **ý kiến**. Ba lớp chặn độc lập: kiểu `AdvocateOpinion` không có trường điểm nào; JSON schema gửi cho model cũng không có; và trigger `trg_grading_result_guard_ai_immutable` ở tầng DB.

**④ `ai_total_score` ghi một lần, không bao giờ sửa.**
Giảng viên sửa điểm thì tạo dòng `teacher_review` mới. Đây là Security rule 6 của CLAUDE.md, và là **bằng chứng dữ liệu cho luận điểm cốt lõi của đồ án** ("AI đề xuất, người quyết định") — thứ phải trình ra khi bảo vệ. Ép ở tầng DB, không chỉ ở code.

---

## 2. Một bài đi qua hệ thống

```
   Giảng viên bấm "Bắt đầu chấm"
        │  POST /exam-sessions/:id/start-grading        (grading.controller.ts)
        ▼
   GradingRunService.startGrading()
        │  • tạo TRƯỚC dòng grading_result ở trạng thái `ai_grading`, ĐỒNG BỘ
        │  • chụp ảnh anchor cho cả phiên MỘT LẦN (AnchorService.freezeFor)
        │  • đẩy MỘT job mỗi bài vào BullMQ
        ▼
   GradingProcessor.process()                            concurrency 5, 10 job/giây
        │  • phân loại lỗi trước khi để BullMQ retry
        │  • trần một job: GRADE_JOB_TIMEOUT_MS (mặc định 300s)
        ▼
   GradingService.gradeOneById() → gradeOne()
        │
        ├─ 1. Đọc file          storage.getObject() → ContentResolverRegistry.for(type)
        │                       Bộ định tuyến TẤT ĐỊNH theo `deliverable_type` đã KHAI,
        │                       không đoán từ tên file. 0 token, ~0ms.
        │
        ├─ 2. Nạp ngữ cảnh      GradingReferenceService.loadForGrading()
        │                       đề bài + đáp án mẫu. Đáp án mẫu KHÔNG BAO GIỜ tới agent.
        │
        ├─ 3. Nạp anchor        AnchorService.loadFor() — đọc ẢNH CHỤP, không dựng lại
        │                       (mặc định TẮT, xem §5)
        │
        ├─ 4. Gọi model         provider.grade()  ← FallbackGradingProvider (chuỗi bậc)
        │      │
        │      └─ applyGuards() → không tin được? → gọi LẠI ĐÚNG MỘT LẦN → guard lại
        │                         (khoá bằng grading-regrade.spec.ts)
        │
        ├─ 5. Lượt phản biện    GradingService.runAdvocate()
        │                       chỉ chạy khi có tiêu chí `not_met` VÀ có đề bài
        │
        ├─ 6. Tính điểm         enforceScoring() — server tính, không tin số của model
        │
        └─ 7. Ghi, hai lượt     `ai_grading → ai_graded` rồi
                                `ai_graded → auto_approved | flagged_for_review`
                                Trigger DB ép đi từng bước một, không nhảy cóc được.
```

**Vì sao dòng `grading_result` được tạo *đồng bộ* trước khi xếp hàng:** để `progress()` đếm được ngay, và để job là **idempotent** — worker thấy `ai_total_score !== null` thì bỏ qua job lặp thay vì chấm lại và tính tiền hai lần.

---

## 3. Bản đồ file

`apps/api/src/grading/` — 47 file, ~6.600 dòng (chưa tính test).

| Đường dẫn | Trách nhiệm | Ghi chú |
|---|---|---|
| `grading.controller.ts` | 12 route, toàn bộ `@Roles('teacher')` | Không có business logic. `admin` **không** có route nào ở đây — cố ý |
| `grading-run.service.ts` | Bắt đầu chấm, tiến độ, đối soát bài treo | Tách khỏi `grading.service.ts` vì file kia đã vượt trần 500 dòng |
| `grading.service.ts` | Vòng đời chấm MỘT bài | Đường vào duy nhất là `gradeOneById` |
| `grading.queue.ts` / `grading.processor.ts` | BullMQ | `concurrency`, rate limit, trần job đều đọc từ env |
| `grading-reference.service.ts` | Đề bài + đáp án mẫu, readiness, đóng băng | Không được import `grading.service.ts` — vòng lặp |
| `anchor.service.ts` | Dựng / đóng băng / đọc anchor | `freezeFor` dùng `ON CONFLICT DO NOTHING` rồi đọc lại |
| `harness/submission-envelope.ts` | Bọc bài làm, nonce, phát hiện injection | **Server-side**, không tin model tự báo |
| `harness/evidence-check.ts` | Đối chiếu dẫn chứng nguyên văn | Chịu được hoa/thường, dấu cong, elision `…` |
| `harness/grading-guards.ts` | G1/G2/G3 → `confidence` + `status` + `needsAdvocate` | **Hàm thuần.** Test rẻ, và đó là lý do nó là hàm thuần |
| `ai-provider/ai-grading-provider.ts` | Interface + `enforceScoring` + `pointsFor` | Leaf. Nghiệp vụ không bao giờ import SDK trực tiếp |
| `ai-provider/tier-chain.ts` | Chuỗi bậc + circuit breaker | Dùng chung cho cả Grader và Advocate — một bản, không hai |
| `ai-provider/provider-failure.ts` | Phân loại lỗi ba rổ | Leaf, không import gì |
| `ai-provider/grader-prompt.ts` | Dựng prompt + 3 lớp cache + render anchor | Đổi một byte ở đây là đổi chi phí toàn hệ thống |
| `content-resolver/` | Chọn cách đọc file theo `deliverable_type` | **Seam** cho nhánh ảnh và nhánh code (§8) |
| `grading.module.ts` | Dựng chuỗi provider từ env | `selectGradingProvider` export ra để test được |

### 3.1 Vì sao ranh giới file nằm ở đó

- **`harness/` là hàm thuần, không phải service.** Guard và evidence-check không chạm DB, không chạm mạng. Nhờ vậy 30 ca test của chúng chạy trong mili giây và không cần Nest. Đừng biến chúng thành `@Injectable`.
- **`provider-failure.ts`, `env.ts`, `advocate.types.ts`, `anchor.types.ts` là leaf module** — không import gì. CLAUDE.md cấm vòng lặp import sau một sự cố thật: `@Matches(undefined)` không ném lỗi, class-validator đăng ký rồi chấp nhận **mọi** giá trị, và `../etc/passwd` qua được validation. Chạy `pnpm check:cycles`; nó phải in **0**.
- **`grading-run.service.ts` tách khỏi `grading.service.ts`** vì trần 500 dòng, và vì "điều phối một lượt chấm" khác trách nhiệm với "chấm một bài".

---

## 4. Chuỗi model dự phòng

`GradingService` chỉ thấy một interface `AIGradingProvider`. Việc model nào chấm được quyết ở **đúng một chỗ**: `selectGradingProvider()` trong `grading.module.ts`.

```
tầng 1-2   endpoint tương thích OpenAI, khai trong .env      (trần: GRADING_TIERn_CEILING, mặc định 0.5)
tầng 3     Claude, nếu có ANTHROPIC_API_KEY                   (trần: 1)
sàn        KeywordGradingProvider — luôn có, không cần config (trần: 0.2, hoặc 0 nếu file không đọc được)
```

Một bậc chỉ bật khi **đủ cả ba** biến `BASE_URL` + `MODEL` + `API_KEY`. Thiếu một biến thì bỏ qua bậc đó **và ghi log** — đoán một `baseUrl` là cách chắc chắn nhất để có một bậc luôn trả 404 mà không ai hiểu vì sao.

**Hệ quả quan trọng của bảng trần trên:** `AUTO_APPROVE_CONFIDENCE = 0.85`, mà trần của mọi bậc dự phòng là 0.5. Nghĩa là **khi không có Claude thì không bài nào tự duyệt được** — mọi bài đều qua tay giảng viên. Đó là hành vi đã chọn, không phải tác dụng phụ. Muốn đổi thì đổi `GRADING_TIERn_CEILING`, và hiểu rằng bạn đang cho một model chưa được calibration quyền tự kết thúc việc chấm một sinh viên.

### 4.1 Circuit breaker

Lỗi được phân ba rổ trong `provider-failure.ts`:

| Rổ | Nghĩa | Xử lý |
|---|---|---|
| `transient` | mạng chập, 429, 5xx | thử lại trong cùng bậc |
| `tier_dead` | 401, hết credit, model không tồn tại | **mở breaker**, nghỉ `BREAKER_COOLDOWN_MS` (60s), rơi bậc |
| `bad_output` | JSON sai schema, bị cắt cụt | rơi bậc ngay — bậc này *sống* nhưng *không dùng được* |

Breaker có **thăm dò half-open**: hết 60s thì một lời gọi được thử; hỏng thì nghỉ thêm 60s (đã từng có lỗi `probing` không bao giờ được xoá → bậc chết vĩnh viễn, không log — xem `tier-chain.ts`).

---

## 5. Cấu hình

| Biến | Mặc định | Tác dụng |
|---|---|---|
| `GRADING_TIER1_BASE_URL` / `_MODEL` / `_API_KEY` | — | Bậc 1. Cần đủ ba |
| `GRADING_TIER2_*` | — | Bậc 2 |
| `GRADING_TIERn_CEILING` | `0.5` | Trần `confidence` của bậc đó |
| `ANTHROPIC_API_KEY` | — | Bật bậc Claude |
| `GRADE_CONCURRENCY` | `5` | Job song song |
| `GRADE_RATE_MAX` / `GRADE_RATE_DURATION_MS` | `10` / `1000` | **Throughput**, không phải concurrency |
| `GRADE_JOB_TIMEOUT_MS` | `300_000` | Trần một job. 120s **không đủ** — advocate đo được 61,4s cho bài ngắn |
| `GRADING_ADVOCATE_TIMEOUT_MS` | `150_000` | Trần một lời gọi advocate |
| `GRADING_ANCHORS_ENABLED` | `false` | Xem cảnh báo dưới |

> ⚠️ **`GRADING_ANCHORS_ENABLED` mặc định TẮT, và phải giữ vậy cho tới khi calibration chứng minh anchor giúp.** Cơ chế đã xây đủ và có test, nhưng chưa ai đo được nó cải thiện hay làm loãng chú ý của model. Bật nó dựa trên trực giác là đúng cái sai lầm mà cả §11 (calibration) tồn tại để tránh.

> ⚠️ **`=== 'true'` chứ không `Boolean(...)`.** `Boolean('false')` là `true`. Repo này đã mất một buổi vì đúng họ lỗi đó. Tương tự: `Number('')` là `0`, nên một biến rỗng từng làm hàng đợi đứng im với `concurrency = 0` — dùng `envPositiveInt()` trong `grading/env.ts`.

---

## 6. Dữ liệu

### 6.1 Bảng

| Bảng | Vai trò |
|---|---|
| `rubric` / `rubric_criterion` | `unique(course_id, version)`. **Không có route update** — chỉ tạo version mới |
| `grading_reference` | Đề bài + đáp án mẫu của một phiên. Đóng băng khi đã có kết quả chấm |
| `grading_result` | Một dòng mỗi bài. Chứa `criterion_results` (jsonb), `ai_total_score`, `confidence`, `advocate_opinion`, `context_used_*` |
| `teacher_review` | Sửa của giảng viên. **Không bao giờ** ghi đè `grading_result` |
| `grading_anchor_snapshot` | Ảnh chụp anchor của một phiên. `unique(exam_session_id)`, `update: false` |
| `grade_export` | **Chỉ có entity, chưa có service/controller** — xem §8 |

### 6.2 Ba trigger phải biết

1. **`validate_grading_result_lifecycle`** — INSERT chỉ nhận `ai_grading`; UPDATE đi **từng bước một**. Muốn dựng một dòng `finalized` trong test thì phải đi hết chuỗi bằng nhiều UPDATE, không `INSERT ... VALUES ('finalized')` được. Xem `GRADING_PATHS` trong `department-class-counts.e2e-spec.ts`.
2. **`guard_grading_result_ai_immutable`** — đóng băng `ai_total_score`, `criterion_results`, `advocate_opinion`, `context_used_*` **ngay khi `ai_total_score` được ghi**. Hệ quả thực tế: mọi trường đó phải ghi trong **cùng một `update()`**, không thể ghi làm hai lần.
3. **`guard_rubric_criteria_immutable`** — chặn sửa/xoá tiêu chí khi đã có `grading_result` trỏ tới version đó.

> **Thêm một cột AI mới?** Phải thêm nó vào danh sách của trigger ② *trong cùng migration*, và ghi nó trong cùng `update()` với `ai_total_score`. Quên bước đầu thì cột mới sửa được sau khi chấm — phá Security rule 6 mà không ai thấy. Quên bước sau thì DB từ chối lượt ghi thứ hai.

---

## 7. Test

```bash
cd apps/api
npx tsc --noEmit
npx jest                                 # unit — 294 pass, 1 skip
npx jest --config test/jest-e2e.json     # e2e  — 347 pass / 35 suite, ~90s
npx eslint src test --ext .ts            # 0 error
node ../../scripts/find-import-cycles.js src   # phải in 0
```

**e2e chạy TUẦN TỰ (`maxWorkers: 1`) và con số đó không được nâng.** Ba suite lái `ExamSessionScheduler.sweep()` với đồng hồ nhanh một tiếng, mà sweep là **toàn cục** — chạy song song thì nó finalize phiên của suite khác, và lỗi nhảy chỗ giữa các lần chạy, đọc ra như bug trong code chứ không phải trong harness. Muốn song song thật thì phải một database mỗi worker, không phải nhiều worker hơn.

**Điều kiện chạy e2e:** Postgres + MinIO + Redis đang chạy (`docker compose up -d postgres minio redis`) **và** bucket `examcollect-submissions` đã tạo. Thiếu bucket cho ra lỗi trông y hệt lỗi nghiệp vụ. Docker Desktop có thể tự tắt giữa phiên — triệu chứng là hàng nghìn lỗi Redis trông như code hỏng.

### 7.1 §14 là gì và tại sao phải quan tâm

Spec §14 liệt kê **21 ca test bắt buộc**, mỗi ca có mã (`T-SEC-2`, `T-G2-1b`, …), và bảng đó giờ có cột **Trạng thái** + **Nơi chạy** trỏ tới file chạy nó.

Hiện tại: **20 ✅ · 1 ⏸**. Ca `T-CACHE-1` (đo prompt caching) chưa chạy lần nào vì tài khoản Anthropic hết credit; test đã viết sẵn và `describe.skip` cho tới khi đặt `RUN_PAID_INTEGRATION=true`.

> Khi sửa code vùng này, **đối chiếu lại bảng §14**. Chính việc dựng cột trạng thái cho nó là thứ tìm ra hai lỗi: một dòng trỏ nhầm file, và một dòng chỉ phủ được nửa ca trong khi vẫn được tick ✅.

---

## 8. Muốn làm X thì sửa ở đâu

| Muốn | Sửa ở đâu | Cảnh báo |
|---|---|---|
| Thêm một model / đổi thứ tự bậc | `selectGradingProvider()` + `.env` | Đúng một chỗ. Đừng để nghiệp vụ biết tên model |
| Đổi cách tính `confidence` | `harness/grading-guards.ts` | Hàm thuần — viết test trước. `AUTO_APPROVE_CONFIDENCE` là **lớp chặn thứ hai**, sửa một chỗ là chưa đủ |
| Hỗ trợ loại bài mới (ảnh / code) | `content-resolver/` — thêm một `SubmissionContentResolver` | **Seam đã dựng sẵn từ Plan 1 Task 4.** Registry ném lỗi nếu không có resolver cho loại đó, cố ý: rơi âm thầm về `document` cho ra điểm trông hợp lệ từ một đường xử lý sai |
| Đổi prompt | `ai-provider/grader-prompt.ts` | Prompt caching là **khớp tiền tố**. Đổi một byte ở lớp ① là trả giá đầy đủ cho ~6.300 token × 40 bài × mọi phiên |
| Thêm cột AI vào `grading_result` | migration + trigger bất biến + cùng một `update()` | Xem §6.2 |
| Thêm route | controller + regenerate `schema.d.ts` | `packages/shared/src/api/schema.d.ts` generate **từ API đang chạy**, không từ source. Quên bước này thì `apps/web` fail typecheck ở đúng dòng gọi API mới |

---

## 9. Những cái bẫy đã tốn thời gian thật

Danh sách này là lý do tài liệu tồn tại. Mỗi dòng đã tốn ít nhất một buổi.

1. **Test gọi API tính tiền.** Khoá thật xuất hiện trong `.env` → binding đọc "có khoá" là "dùng Claude" → 5 suite e2e bắt đầu gọi API thật. Hôm đó nó lộ ra *vì tài khoản chưa có credit*; nếu có credit thì test vẫn xanh và chỉ âm thầm tiêu tiền mỗi lần chạy. Giờ có guard `NODE_ENV === 'test'` trong `selectGradingProvider`.
2. **Dev server nuốt job của test.** Queue BullMQ là **toàn cục theo Redis**, không theo tiến trình. Một `pnpm start:dev` đang chạy sẽ nhận job mà test vừa đẩy. Dấu hiệu: `stacktrace` của job trỏ vào `dist/`. `app.module.ts` dùng prefix `bull-test` khi `NODE_ENV=test`.
3. **Prompt caching im lặng không chạy.** Breakpoint của Opus cần tiền tố **tối thiểu 1024 token**. Rubric một tiêu chí cho ~450 token → `cacheReadTokens = 0`, đọc ra y hệt "caching hỏng". Đó vừa là bẫy đo lường vừa là một **phát hiện phải ghi vào báo cáo**.
4. **`max_tokens` không phải trần cứng** trên gateway bậc 1 — đặt 40 vẫn nhận 5840 token. Cắt cụt phải bắt bằng `finish_reason === 'length'`.
5. **Shim Anthropic nhận nhưng bỏ qua.** Gateway bậc 1 khai hỗ trợ cả hai kiểu endpoint; endpoint kiểu Anthropic **nhận** `output_config` / `thinking` và trả usage đúng hình dạng — rồi **bỏ qua** chúng. Tái dùng `ClaudeGradingProvider` qua shim sẽ trông như chạy tốt trong khi âm thầm mất guard mạnh nhất của thiết kế.
6. **Guard tính rồi vứt đi.** `applyGuards` tính `check` cho mọi tiêu chí của mọi bài — miễn phí — rồi *vứt* cho tới 2026-09-15, trong khi spec §11.5 tuyên bố chỉ số đó "chạy sẵn trên 100% số bài". Bài học: một chỉ số chỉ tồn tại nếu nó được **ghi lại**.
7. **`LEFT JOIN teacher_review` nhân bản dòng.** Không có unique constraint trên đó, nên một bài được duyệt hai lần đếm thành hai. Dùng `LEFT JOIN LATERAL … ORDER BY reviewed_at DESC LIMIT 1`.
8. **File trong repo là CRLF.** Script sửa file bằng `indexOf('\n…')` sẽ im lặng không khớp. `C:\Python312` trên máy dev hỏng — dùng `%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe`.

---

## 10. Cái CHƯA có

Ghi ra để không ai tưởng chúng đã tồn tại.

| Chưa có | Ghi chú |
|---|---|
| **Toàn bộ UI** cho advocate / anchor / readiness | Backend trả dữ liệu đầy đủ, không màn hình nào hiển thị. Đây là khoảng trống lớn nhất |
| **Nhánh ảnh** (bài viết tay chụp lại) | Seam resolver đã sẵn, chưa có resolver |
| **Nhánh code** (Docker sandbox) | Seam đã sẵn. Sandbox là **yêu cầu bảo mật bắt buộc**, không phải tối ưu |
| **`GradeExport`** — ghi điểm ngược vào file bảng điểm của giảng viên | Chỉ có entity. Security rule 9: cột MSSV và cột điểm **do giảng viên chỉ định**, không bao giờ đoán |
| **Cohen's kappa với người chấm độc lập** | Script đã sẵn (`scripts/calibration/`), chưa có buổi chấm mù nào |
| **T-CACHE-1** | Chờ credit Anthropic |
| **Dashboard chi phí AI** | `usage` đã đi vào log, chưa lưu vào bảng nào |
| **Batch API** | Chấm không cần thời gian thực — đây là đường giảm chi phí chưa dùng |

---

## 11. Đọc thêm

- `CLAUDE.md` — mô hình vai trò, 9 Security rule, quy tắc tổ chức file
- Spec `docs/superpowers/specs/2026-09-14-ai-grading-agent-design.md` — **§14** (bảng test), **§15.0** (đã đo), **§15.1** (chưa đo)
- Plan `docs/superpowers/plans/2026-09-14-grading-agent-context.md` (12 task) và `2026-09-15-advocate-anchors-calibration.md` (8 task) — có cả phần "vì sao không làm cách kia"
- `scripts/calibration/README.md` — cách chạy đo AI-vs-người
