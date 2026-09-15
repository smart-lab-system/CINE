# Plan 2 — Advocate, Anchor, và Calibration

**Spec:** `docs/superpowers/specs/2026-09-14-ai-grading-agent-design.md` (rev 2)
**Baseline:** `53a34fa` (Plan 1 xong đủ 12 task)
**Ngày:** 2026-09-15

---

## 0. Plan này làm gì, và vì sao nó không phải "phần còn lại của Plan 1"

Plan 1 dựng xong **đường chấm một chiều**: đề bài + đáp án mẫu vào context,
model phán đoán, guard tất định kiểm dẫn chứng, server tính điểm, bài không tin
được thì chuyển giảng viên. Nó trả lời được câu *"bài này có khớp rubric
không"*.

Plan 2 trả lời câu còn lại, câu mà chủ đồ án đặt ra và là lý do cả spec này tồn
tại:

> *"mỗi người sẽ có một cách viết rubric khác nhau, nếu dựa vào rubric mà chấm
> điểm thì sẽ rất thiệt thòi cho sinh viên."*

Ba việc, theo đúng thứ tự giá trị:

| | Việc | Trả lời câu |
|---|---|---|
| **A** | **Advocate** — lượt hỏi thứ hai, MÙ RUBRIC | "Bỏ qua rubric, em ấy có đúng không?" |
| **B** | **Anchor** — few-shot từ chính lần sửa của giảng viên, **mặc định TẮT** | "Chuẩn chấm của thầy này là gì?" |
| **C** | **Calibration** — script Python offline | "Ba thứ trên có thật sự giúp không?" |

**A là thứ duy nhất trong ba cái này trực tiếp cứu một sinh viên.** B và C tồn
tại để chứng minh và hiệu chỉnh A. Nếu hết thời gian, làm A đủ tốt rồi dừng còn
hơn làm cả ba nửa vời — và §10.0 của spec đã tự nói điều đó về B.

### 0.1 Ranh giới không được vượt

Nhắc lại từ spec để không phải tra ngược khi đang code:

- **Advocate CHỈ kiến nghị** (§2.2). `ai_total_score` mãi mãi là con số của
  Grader. Không có ngoại lệ nào cho Security rule 6.
- **Advocate mù rubric** (§2.1). Không truyền `criteria` cho nó. Truyền là biến
  nó thành lượt Grader thứ hai đắt tiền.
- **Cùng `claude-opus-5`** cho cả hai lượt. Cache khoá theo model; đổi model cho
  lượt hai là ghi lại toàn bộ tiền tố ở một namespace khác.
- **Anchor mặc định `false`**, trần K=3/tiêu chí và ≤4.000 token, thứ tự tất
  định, đóng băng lúc bấm "Bắt đầu chấm" (§10.0, A1–A5).
- **Calibration là script offline**, không FastAPI, không LangChain, không nằm
  trong đường chạy request (§11.6).
- **UI vẫn hoãn toàn bộ sang spec riêng.** Plan này dừng ở API + dữ liệu. Chỗ
  nào cần UI thì ghi ra là cần, không vẽ.

### 0.2 Một quyết định plan này phải tự chốt (spec để ngỏ)

Spec §2.2 viết *"Advocate ghi vào một khối riêng của `criterion_results`"*.
Đọc code thì cách đó **không chạy được**, và lý do đáng ghi lại:

```sql
-- trg_grading_result_guard_ai_immutable, từ InitialSchema
IF OLD.ai_total_score IS NOT NULL
   AND (NEW.criterion_results IS DISTINCT FROM OLD.criterion_results OR …)
THEN RAISE EXCEPTION …
```

Trigger đóng băng `criterion_results` **ngay khi `ai_total_score` được ghi**.
Nên có đúng hai đường:

| Đường | Cái giá |
|---|---|
| Advocate chạy TRƯỚC khi persist, ghi chung một `UPDATE` | ~20% số bài mất thêm 15–30s trước khi rời `ai_grading`; không migration |
| Cột riêng `advocate_opinion jsonb`, ghi sau | Cần migration; nhưng trigger KHÔNG bảo vệ nó → phải mở rộng trigger, nếu không Advocate thành thứ duy nhất trong bảng sửa được sau khi chốt |

**Chốt: cột riêng `advocate_opinion`, ghi trong CÙNG `UPDATE` với Grader, và mở
rộng trigger để guard luôn cột đó.** Được cả hai đầu:

- `criterion_results` giữ nguyên **kiểu mảng**. Nhét một khoá `advocate` vào
  cạnh các phần tử mảng sẽ đổi hình dạng của một JSON mà `listForSession`,
  `teacher-review.service` và một spec UI chưa viết đều đang đọc.
- Advocate cũng **write-once**, cùng luật với Grader. Ý kiến phản biện mà sửa
  được sau khi giảng viên đã đọc thì nó không còn là bằng chứng.
- Không cần status mới → **không đụng `validate_grading_result_lifecycle`**.
  CLAUDE.md cảnh báo thẳng rằng thêm giá trị vào enum vòng đời là việc kéo theo
  trigger, migration và 10 suite e2e.

Cái giá chấp nhận: bài có Advocate nằm ở `ai_grading` lâu gấp đôi. Đổi lại,
thanh tiến độ vẫn chỉ có một khái niệm "đang chấm", và không có trạng thái
trung gian nào mà giảng viên phải học nghĩa.

---

## 1. Ràng buộc kỹ thuật đã biết (đừng tra lại)

- NestJS **10.4.4**, TypeORM 0.3, Postgres 16 (schema `examcollect`), BullMQ 6.3.4
- `@anthropic-ai/sdk` **0.125.0**; `zodOutputFormat` cần zod v4, repo dùng v3 →
  **viết JSON schema bằng tay + `safeParse`**, đúng như `claude-grading.provider.ts`
- `thinking: { type: 'adaptive' }`, **không** `budget_tokens` (Opus 5 trả 400)
- `output_config: { effort, format }`, **không** `output_format` (đã deprecated)
- **Không prefill assistant** — Opus 5 trả 400
- `stop_reason: 'refusal'` là **HTTP 200**, phải kiểm trước khi đọc nội dung
- Migration timestamp phải **lớn hơn `1789230000000`**
- Route API mới → phải chạy `pnpm generate:api-client` (Task 7), nếu không
  `apps/web` build fail
- `pnpm check:cycles` phải in **0**
- e2e chạy **tuần tự** (`maxWorkers: 1`, đã chốt ở `aba918d`) — đừng thêm
  `--maxWorkers` vào lệnh

### 1.1 Chưa kiểm chứng được — khoá API chưa dùng được

`ANTHROPIC_API_KEY` trong `.env` là khoá **cấp tổ chức, chưa gắn workspace**:

```
400 invalid_request_error — This API key is not scoped to a workspace, so this
request must include the anthropic-workspace-id header
```

Hệ quả cho plan này: **T-CACHE-1 và mọi phép đo token thật vẫn chưa chạy được**,
và §2.3 của spec (bảng chi phí) vẫn là số tính tay. Task 0 dưới đây xử lý.
Không chặn Task 1–6: toàn bộ chúng test bằng SDK mock, đúng như Plan 1.

---

## Task 0: Mở đường gọi model thật (chặn mọi phép đo, không chặn code)

- [ ] **Step 1: Chọn một trong hai đường**

**Khuyến nghị — tạo khoá gắn workspace trong Console.** Không đổi code, không
thêm biến môi trường, và khoá bị giới hạn chi tiêu trong đúng một workspace —
hợp với `CostBudget` đã có sẵn trong schema.

Đường còn lại, nếu muốn giữ khoá hiện tại: thêm `ANTHROPIC_WORKSPACE_ID` vào
`.env` + `.env.example`, và sửa **một chỗ duy nhất**:

```ts
// claude-grading.provider.ts — KHÔNG rải header này ra nhiều nơi
private readonly client = new Anthropic({
  defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID
    ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID }
    : {},
});
```

Đánh đổi phải biết: khoá cấp tổ chức trong `.env` có tầm với rộng hơn thứ dự án
này cần.

- [ ] **Step 2: Smoke test một lần, chạy tay, KHÔNG vào bộ test tự động**

Script dùng lại (đã viết, nằm ở scratchpad phiên 2026-09-15): ping → chấm 2 bài
với rubric **cỡ thật** → in usage. Ba điều nó trả lời:

1. khoá + model id + SDK gọi được
2. đường chấm thật chạy hết (adaptive thinking → json_schema → parse →
   `enforceScoring` → `applyGuards`)
3. **T-CACHE-1** — bài 2 phải có `cacheReadTokens > 0`

> **Cảnh báo đo lường, đã tính trước:** rubric 1 tiêu chí cho tiền tố
> **~450 token**, dưới ngưỡng cache **1024 token** của Opus. Đo bằng rubric đồ
> chơi sẽ ra `cacheReadTokens = 0` và kết luận sai rằng caching hỏng. Rubric
> trong script có 5 tiêu chí mô tả như giảng viên viết thật, tiền tố ~1.400
> token. **Đây cũng là một phát hiện phải ghi vào báo cáo:** với rubric ngắn và
> không có tài liệu tham chiếu, prompt caching **không kích hoạt**, và bảng chi
> phí §2.3 không áp dụng.

Chi phí ước lượng cả smoke test: **~$0,05**.

- [ ] **Step 3: Ghi số đo thật vào spec §15**, thay cho các dòng "chưa kiểm
  chứng". Số đo, không phải "đã chạy OK".

---

## Task 1: Cột `advocate_opinion` + mở rộng trigger bất biến

- [ ] **Step 1: Migration** `apps/api/src/database/migrations/1789240000000-AddAdvocateOpinion.ts`

```ts
// up()
await queryRunner.query(`
  ALTER TABLE "examcollect"."grading_result"
  ADD COLUMN "advocate_opinion" jsonb
`);
```

`NULL` là trạng thái đúng và có nghĩa: **"Advocate không chạy cho bài này"** —
khác hẳn `'{}'::jsonb` ("chạy và không nói gì"). ~80% số bài sẽ ở `NULL`, và
phân biệt được hai thứ đó là thứ cho phép đo tỉ lệ kích hoạt cổng Advocate mà
không cần cột đếm riêng.

Rồi thay hàm trigger — **`CREATE OR REPLACE`, cùng migration**:

```sql
CREATE OR REPLACE FUNCTION examcollect.guard_grading_result_ai_immutable()
RETURNS trigger AS $$
BEGIN
    IF OLD.ai_total_score IS NOT NULL
       AND (
            NEW.ai_total_score     IS DISTINCT FROM OLD.ai_total_score
            OR NEW.criterion_results IS DISTINCT FROM OLD.criterion_results
            OR NEW.model_used        IS DISTINCT FROM OLD.model_used
            OR NEW.confidence        IS DISTINCT FROM OLD.confidence
            OR NEW.advocate_opinion  IS DISTINCT FROM OLD.advocate_opinion
       ) THEN
        RAISE EXCEPTION
            'GradingResult %''s AI output is immutable once set; edit via TeacherReview instead',
            OLD.id USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

> **Tra tên hàm thật trước khi viết migration** — tên ở trên lấy từ
> `pg_proc` ngày 2026-09-15, nhưng `CREATE OR REPLACE` sai tên sẽ **tạo một hàm
> mới** và trigger cũ vẫn chạy bản cũ. Không lỗi, không cảnh báo, guard thủng.
> ```bash
> docker exec cine-postgres-1 psql -U examcollect_admin -d examcollect -tAc \
>   "select p.proname from pg_trigger t join pg_proc p on p.oid=t.tgfoid
>     where t.tgname='trg_grading_result_guard_ai_immutable';"
> ```

`down()` phải khôi phục **bản hàm cũ nguyên văn** rồi mới `DROP COLUMN`. Thứ tự
ngược lại sẽ để lại một hàm tham chiếu cột không còn tồn tại.

- [ ] **Step 2: Entity**

```ts
/**
 * Ý kiến của Advocate — CHỈ KIẾN NGHỊ, không bao giờ đổi `aiTotalScore`.
 *
 * `null` = Advocate không chạy cho bài này (cổng ở `applyGuards` không mở),
 * KHÁC với `{}` = chạy và không kiến nghị gì. ~80% số bài ở `null`, và chính
 * sự phân biệt đó là nguồn đo tỉ lệ kích hoạt cổng cho §11.
 *
 * Bất biến cùng luật với output của Grader (Security rule 6) — được ép ở
 * `trg_grading_result_guard_ai_immutable`, không chỉ hứa ở comment này.
 */
@Column({ name: 'advocate_opinion', type: 'jsonb', nullable: true })
advocateOpinion!: AdvocateOpinion | null;
```

- [ ] **Step 3: Test — e2e, vì đây là hành vi của DB**

`apps/api/test/grading-lifecycle.e2e-spec.ts`, thêm:

- ghi `advocate_opinion` **cùng lúc** với `ai_total_score` → OK
- ghi `advocate_opinion` **sau** khi `ai_total_score` đã có → **ném**, khớp
  `/immutable/`
- dòng chưa từng chấm (`ai_total_score IS NULL`) → ghi được, không bị chặn

- [ ] **Step 4: Chạy + commit**

```bash
cd apps/api && pnpm migration:run && npx tsc --noEmit && \
  npx jest --config test/jest-e2e.json --testPathPattern "grading-lifecycle"
```

---

## Task 2: `AdvocateProvider` — lượt hỏi thứ hai, mù rubric

- [ ] **Step 1:** `apps/api/src/grading/ai-provider/advocate.types.ts` (leaf, không import gì)

```ts
export type AdvocateCorrectness = 'yes' | 'partially' | 'no';

export interface AdvocateSuggestion {
  criterionId: string;
  suggestedVerdict: 'met' | 'partially_met' | 'not_met';
  why: string;
}

export interface AdvocateOpinion {
  isCorrect: AdvocateCorrectness;
  /** Viết cho GIẢNG VIÊN đọc, không phải cho máy parse. */
  reasoning: string;
  /** Cũng bị kiểm nguyên văn bằng `verifyEvidence`. */
  evidence: string[];
  suggestedVerdicts: AdvocateSuggestion[];
  /** Dẫn chứng nào không định vị được — hiện cho giảng viên, không tự hạ điểm. */
  unverifiedEvidence: string[];
  usage: GradingUsage;
}
```

File **leaf**: CLAUDE.md có nguyên tắc riêng về việc hằng số dùng trong decorator
không được nằm trong vòng import, và repo này đã dính một lần
(`@Matches(undefined)`, 2026-09-11).

- [ ] **Step 2:** `advocate-prompt.ts` — tiền tố dùng chung với Grader

Ba lớp cache **giống hệt Grader về byte** ở phần dùng chung, vì đó là toàn bộ
lý do dùng cùng một model:

| Lớp | Nội dung | Advocate có? |
|---|---|---|
| ① | `SYSTEM_DELIMITER_RULE` + luật | **Luật khác** → tiền tố khác từ đây |
| ② | rubric | **KHÔNG** — mù rubric là điểm cốt lõi |
| ③ | đề bài + đáp án mẫu | **CÓ** — đây là thứ Advocate đối chiếu |
| — | bài làm (không cache) | CÓ |

> **Phải tự đo, đừng giả định:** vì lớp ① khác và lớp ② vắng, **tiền tố Advocate
> là một tiền tố KHÁC** — nó có cache namespace riêng, ghi riêng, đọc riêng.
> Nghĩa là bài đầu tiên cần Advocate trong phiên phải **ghi** ~2.500–5.000 token
> tiền tố (đề + đáp án). Với ~20% của 40 bài = 8 lượt, chi phí ghi đó chia cho 8
> chứ không phải 40. Bảng §2.3 chưa tính riêng khoản này — đo ở Task 0 rồi sửa
> spec, đừng đoán.

Câu hỏi đóng khung cho Advocate, viết thẳng vào system prompt:

> *Đây là bài làm của một sinh viên cho đề bài kèm theo. **Bạn không được thấy
> rubric, và đó là cố ý.** Hãy đọc bài làm và đề bài, rồi trả lời: em ấy có trả
> lời đúng không — kể cả khi em ấy đi theo một hướng mà người ra đề không lường
> trước? Nếu có, hãy chỉ ra CHÍNH XÁC chỗ nào trong bài chứng minh điều đó,
> trích nguyên văn.*

- [ ] **Step 3:** `advocate.provider.ts` — cùng khuôn với `claude-grading.provider.ts`

Dùng lại nguyên các quyết định đã tranh luận ở Plan 1, không phát minh lại:
`stop_reason: 'refusal'` kiểm trước; `safeParse`; message lỗi **không** nêu nội
dung model trả về (nó chứa bài làm của sinh viên và đi vào `failedReason` trong
Redis); `usage` phải trả về đủ bốn con số; **không trạng thái trên instance**
(singleton + `concurrency: 5`).

Khác Grader đúng một chỗ có ý nghĩa: **Advocate ĐƯỢC phép trả `suggestedVerdict`
— một phán đoán, vẫn không phải một con số.** Ranh giới "model phán đoán, code
đếm" giữ nguyên: không có `points`, không có `totalScore`, không có `confidence`
trong schema.

- [ ] **Step 4: Unit test** `advocate.provider.spec.ts` (mock SDK, $0)

- không có `criteria` trong bất kỳ khối prompt nào — **test này là thứ giữ cho
  "mù rubric" không bị ai đó "sửa cho tiện" sau này**
- schema không chứa `points` / `totalScore` / `confidence`
- `refusal` → ném 422
- `usage` map đủ bốn trường
- hai bài liên tiếp trên CÙNG instance không lẫn tài liệu của nhau

---

## Task 3: Nối Advocate vào `gradeOne` (T-ADV-1)

- [ ] **Step 1: Chỗ nối đã có sẵn, chưa ai đi qua**

`applyGuards` đã trả `needsAdvocate` từ Plan 1 và **chưa có ai đọc nó** — giống
hệt ca `markUngradable` ở Plan 1 Task 1 (mở cửa mà không ai đi qua). Đây là chỗ
đi qua nó.

```ts
// grading.service.ts, SAU guard, TRƯỚC `this.results.update(...)`
let advocate: AdvocateOpinion | null = null;
if (guards.needsAdvocate && reference.loadedLevel !== 'rubric_only') {
  advocate = await this.advocateProvider.advocate({ … }).catch((e) => {
    // Advocate hỏng KHÔNG được làm hỏng lượt chấm. Bài vẫn có điểm của
    // Grader, vẫn sang flagged_for_review, chỉ là thiếu ý kiến thứ hai —
    // và dòng log này là thứ nói ra điều đó.
    this.logger.warn(`submission ${submission.id}: Advocate hỏng — ${e.message}`);
    return null;
  });
}
```

Hai điều kiện, cả hai đều có lý do:

- `guards.needsAdvocate` — cổng cố ý **RỘNG** (§7.1): đọc `verdict`, không đọc
  `uncoveredContent`. Kích hoạt thừa tốn $0,05; bỏ sót là một sinh viên âm thầm
  mất điểm.
- `loadedLevel !== 'rubric_only'` — **không có đề bài thì Advocate không có gì
  để đối chiếu**, và sẽ chỉ đọc lại bài làm rồi đoán. Đây chính là T-DEGRADE-1
  đã có từ Plan 1, giờ mới có thứ để nó điều khiển.

- [ ] **Step 2: Persist — MỘT `UPDATE`, không phải hai**

`advocateOpinion` phải nằm trong đúng cái `update()` đang ghi `aiTotalScore`.
Ghi thành hai lần là đâm vào trigger ở Task 1, và **test của Task 1 sẽ đỏ** —
cố ý như vậy.

Trạng thái cuối: có Advocate → **luôn** `flagged_for_review`. Một bài đã cần ý
kiến phản biện thì không có đường nào tự duyệt.

- [ ] **Step 3: Kiểm dẫn chứng của Advocate cũng bằng `verifyEvidence`**

Advocate bịa dẫn chứng thì nguy hiểm **hơn** Grader bịa: nó đang lập luận để
**nâng** điểm cho sinh viên, và một giảng viên đang mệt sẽ có xu hướng đồng ý.
Dẫn chứng không định vị được → vào `unverifiedEvidence`, hiện cho giảng viên
thấy, **không tự động loại bỏ kiến nghị** (loại bỏ là thay giảng viên quyết).

- [ ] **Step 4: T-ADV-1 (e2e)** — `grading-advocate.e2e-spec.ts`

> Advocate kiến nghị 9/10 trong khi Grader chấm 4/10 → `ai_total_score` **vẫn là
> 4**, bài sang `flagged_for_review`, `advocate_opinion` có kiến nghị.

Đây là **test quan trọng nhất của cả plan**: nó khoá §2.2 ở dạng chạy được. Ngày
nào có ai "cải tiến" bằng cách cho Advocate sửa điểm, test này đỏ.

Kèm: Advocate ném lỗi → bài **vẫn** có điểm Grader và **vẫn** flagged (Step 1).

---

## Task 4: Anchor — xây cơ chế, **không bật** (T-ANCHOR-0)

- [ ] **Step 1: Cờ, đọc ở đúng một chỗ**

```ts
// grading.types.ts — leaf
export const GRADING_ANCHORS_ENABLED = process.env.GRADING_ANCHORS_ENABLED === 'true';
export const ANCHOR_MAX_PER_CRITERION = 3;   // K, §10.0
export const ANCHOR_MAX_TOKENS = 4000;       // trần tổng, §10.0
```

`=== 'true'` chứ không `Boolean(...)`: `Boolean('false')` là `true`, và Plan 1
đã dính đúng họ lỗi này một lần (`Number('')` → `0` giết queue).

Thêm vào `.env.example` **kèm dòng giải thích vì sao mặc định tắt** — ai đọc
file đó phải hiểu ngay rằng bật nó là bật một **thí nghiệm** (§10.0), không phải
bật một tính năng.

- [ ] **Step 2: `anchor.service.ts` — truy vấn, với A1 + A2 ép ở SQL**

```sql
SELECT gr.criterion_results, tr.edited_criteria, tr.reviewed_at, tr.id
  FROM examcollect.teacher_review tr
  JOIN examcollect.grading_result gr ON gr.id = tr.grading_result_id
 WHERE gr.rubric_id_version = $1              -- A1
   AND tr.edited_criteria IS DISTINCT FROM '{}'::jsonb
 ORDER BY tr.reviewed_at ASC, tr.id ASC       -- A4: tất định
```

**A2 (chỉ lấy lần SỬA THẬT) phải lọc ở tầng ứng dụng, không ở SQL.** So sánh
`edited_criteria` với `criterion_results` là so từng tiêu chí, và `jsonb` không
so kiểu đó được bằng một toán tử. Điều kiện `<> '{}'` ở trên chỉ loại được ca
rỗng hiển nhiên.

> A2 là ràng buộc **đắt nhất nếu bỏ qua**: học từ "thầy bấm đồng ý" là dạy AI
> rằng nó đã đúng — vòng lặp tự khen (§10.4), và nó siết dần **trong im lặng**.

A5: anchor ở mức **tiêu chí**, không phải cả bài.

- [ ] **Step 3: Trần token đếm bằng ký tự, và phải cắt TẤT ĐỊNH**

Không gọi API để đếm token. Ước lượng `chars / 3` (tiếng Việt có dấu tốn hơn
tiếng Anh) và cắt theo thứ tự đã sort — cắt ngẫu nhiên là **byte đổi mỗi lời
gọi = cache chết**, đúng cái A4 sinh ra để chặn.

- [ ] **Step 4: T-ANCHOR-0 (unit)**

> `GRADING_ANCHORS_ENABLED=false` (mặc định) → prompt **không chứa khối anchor
> nào**.

Test phải khẳng định trên **prompt đã render**, không phải trên cờ. Khẳng định
`cờ === false` chỉ kiểm tra rằng `false === false`.

Kèm: bật cờ → có anchor, và **thứ tự hai lần build giống nhau từng byte** (A4).

---

## Task 5: Đóng băng tập anchor lúc "Bắt đầu chấm" (A3, T-ANCHOR-1)

- [ ] **Step 1: Vì sao đây là yêu cầu ĐÚNG ĐẮN, không phải hiệu năng**

Thầy duyệt bài 5 trong khi bài 6–40 còn trong hàng đợi. Không đóng băng thì bài
1–5 được chấm theo một chuẩn và bài 6–40 theo chuẩn khác — **trong cùng một
lượt chấm, cùng một lớp**. Cache chết chỉ là triệu chứng; cái hỏng là sự công
bằng trong một phiên.

Cùng nguyên tắc đã áp cho `session_roster` (§7.1.1) và `grading_reference`
(§3.3). Đây là lần thứ ba, và đó là dấu hiệu nó là một nguyên tắc chứ không phải
ba quyết định rời rạc.

- [ ] **Step 2: Chụp ở đâu**

Chụp **một lần** trong `GradingRunService.startGrading`, lưu vào
`grading_reference` (bảng đã đóng băng theo phiên, đã có `uq_grading_reference_session`)
ở một cột `anchor_snapshot jsonb NULL` — hoặc bảng riêng nếu nó vượt vài chục KB.

**Quyết định lúc implement, sau khi đo cỡ thật ở một phiên có dữ liệu.** Đừng
chọn trước: §10.2 ước lượng 20k–60k token cho **cả một rubric version**, và
jsonb inline ở cỡ đó là bình thường, còn ở cỡ MB thì không.

- [ ] **Step 3: T-ANCHOR-1 (e2e)**

> Tập anchor **không đổi** giữa bài 1 và bài 40 của cùng lượt chấm, **dù có
> `teacher_review` mới chen vào giữa**.

Dựng đúng ca đó: start-grading → chấm bài 1 → chèn một `teacher_review` mới →
chấm bài 40 → hai prompt phải chứa **cùng một tập anchor, cùng thứ tự**.

---

## Task 6: Script calibration (Python, offline)

- [ ] **Step 1:** `scripts/calibration/` — **ngoài `apps/`**, vì nó không phải
  một phần của ứng dụng đang chạy

```
scripts/calibration/
├── README.md          # cách chạy, và CẢNH BÁO PHƯƠNG PHÁP §11.1 đặt lên đầu
├── requirements.txt   # pandas, scipy, psycopg2-binary
├── export.py          # Postgres → CSV
└── analyze.py         # kappa + Pearson, PHÂN TẦNG
```

Python 3.12.10 đã kiểm chạy được trên máy dev (2026-09-14).

- [ ] **Step 2: `analyze.py` — phân tầng là BẮT BUỘC, không phải tuỳ chọn**

> **Nếu báo cáo kappa tổng thể, bạn sẽ tự giấu mất kết quả của mình** (§11.1).
> Luận điểm sống ở ~20% bài lệch rubric; gộp với 80% bài thường sẽ pha loãng
> thất bại của nhánh cũ tới mức vô hình.

Script **phải từ chối chạy** nếu cột `is_deviant` chưa được điền — một script in
ra một con số tổng thể là một script sẽ được dùng để kết luận sai. Và cột đó do
**người chấm độc lập đánh dấu mù, trước khi nhìn output AI**, không phải hệ
thống tự phân loại rồi tự chấm điểm mình trên phân loại đó.

Chỉ số: **Cohen's kappa trên verdict từng tiêu chí** + **Pearson trên tổng
điểm**, báo cáo **cả hai** — chênh lệch giữa chúng tự nó là một phát hiện (AI bù
trừ sai số để ra đúng tổng).

- [ ] **Step 3: Hai chỉ số miễn phí, chạy trên 100% bài production**

Tỉ lệ `unverified` và tỉ lệ phủ tiêu chí (§11.5) — **không cần người chấm**, đã
có sẵn trong `criterion_results` của cả học kỳ. Làm **trước** hai chỉ số kia:
chúng cho dữ liệu ngay hôm nay, còn kappa phải chờ tổ chức một buổi chấm mù.

- [ ] **Step 4: Ghi thẳng vào README điểm yếu của tập production**

Dữ liệu production **bị neo** — thầy nhìn đề xuất AI trước khi sửa — nên nó
**không thay thế được** tập chấm mù (§11.3). Báo cáo hai lớp: tập nhỏ chấm mù
(vàng, so 4 nhánh) + tập production lớn (quan sát, nói về quy mô và xu hướng).

Và ghi rằng **chỉ có một người chấm** nên kappa tuyệt đối **không diễn giải
được** — câu hỏi đúng là *nhánh nào gần người chấm hơn*, không phải *0,72 là tốt
hay tệ*.

---

## Task 7: Regenerate `schema.d.ts` + kiểm chứng toàn bộ

Giống Plan 1 Task 12, và **chỉ cần nếu Task 1–6 có thêm route API**. Nếu không
thêm route nào thì bỏ Step 1–2, giữ Step 3.

- [ ] **Step 1–2:** build + chạy API (`dist/src/main.js`, không phải
  `dist/main.js`) → `pnpm generate:api-client` → tắt API

- [ ] **Step 3: Kiểm chứng đầy đủ**

```bash
cd apps/api && npx tsc --noEmit && npx jest && \
  npx jest --config ./test/jest-e2e.json && \
  npx eslint src test --ext .ts
cd ../web && npx tsc --noEmit && npx vitest run && npx next build
cd ../.. && node scripts/find-import-cycles.js apps/api/src
```

Mong đợi: tsc sạch · unit PASS · e2e PASS · lint 0 error · web tsc **chỉ còn 2
lỗi `read-workbook.test.ts` có sẵn** · web build sạch · 0 vòng lặp import.

- [ ] **Step 4: Đối chiếu §14** — sau plan này phải tick thêm **T-ADV-1**,
  **T-ANCHOR-0**, **T-ANCHOR-1**, và **T-CACHE-1** nếu Task 0 xong. Đủ 21/21.

- [ ] **Step 5: Commit + gọi code-reviewer** (CLAUDE.md HANDOFF RULE: không báo
  "done" khi chưa có VERDICT).

---

## Ngoài phạm vi plan này

| Việc | Ở đâu |
|---|---|
| Toàn bộ UI (hiện ý kiến Advocate, bật/tắt anchor, xem readiness) | Spec UI riêng |
| Nhánh ảnh (phiên âm hai lượt), nhánh code (Docker sandbox) | Spec riêng — seam đã sẵn từ Plan 1 Task 4 |
| Cột usage trên `grading_result`, dashboard chi phí | Module admin |
| Chuyển anchor sang RAG | Chỉ khi vượt **100.000 token**/rubric version (§10.2) |
| Bật `GRADING_ANCHORS_ENABLED=true` | **Chỉ sau khi calibration nhánh D chứng minh nó giúp** (§10.0) |

## Thứ tự nếu hết thời gian

1. **Task 1 + 2 + 3** (Advocate) — thứ duy nhất trực tiếp cứu một sinh viên
2. **Task 6 Step 3** (hai chỉ số miễn phí) — có dữ liệu ngay, không cần tổ chức gì
3. **Task 0** (khoá + số đo thật) — cần cho báo cáo, không cần cho code
4. Task 4 + 5 (anchor) — mặc định tắt, nên hoãn được mà không ai mất gì
5. Task 6 phần còn lại (kappa) — cần một buổi chấm mù của người thật
