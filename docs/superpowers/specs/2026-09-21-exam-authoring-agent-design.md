# Agent soạn đề CTDL&GT — thiết kế

**Ngày:** 2026-09-21 · **Baseline:** `feature/master-data-scope-cut` = `9f06dc6` · **Trạng thái:** spec, chưa implement
**Liên quan:** `2026-09-20-grading-agent-investigator-design.md` (nửa dưới của cùng một vòng)
**Sửa đổi:** 2026-09-23 — §8 ghi lại cách gắn đề đã ship (một route riêng; server tự ghi
file do chính nó sinh); thêm §8.1 (chấm lại bài không chấm được, và chỗ nó đụng luật đóng
băng tài liệu)
**Sửa đổi:** 2026-09-23, lần 2 — thêm §3.1 (chế độ sinh đáp án mẫu và gói test từ một đề
có sẵn, cho spec chấm §2.1)

Agent sinh **đề + đáp án mẫu + gói test**, giảng viên sửa, xuất Word, gắn vào phiên
thi nếu muốn. Không lưu gì vào cơ sở dữ liệu.

---

## 0. Vì sao việc này không phải một tính năng phụ

Đọc lướt thì đây là "AI viết giúp câu hỏi" — một thứ năm 2026 không ai coi là đóng
góp. Nó không phải vậy, và lý do nằm ở spec chấm điểm chứ không nằm ở đây.

Spec `2026-09-20-grading-agent-investigator-design.md` §2.1 viết:

> **Đáp án mẫu hiện chỉ được nhét vào prompt làm văn bản tham chiếu. Nhưng nó là một
> CHƯƠNG TRÌNH.** Chạy nó qua sandbox thì mọi tính chất của nó thành một chuẩn ngầm,
> và mỗi kiểu lệch đo được khỏi chuẩn đó là một lỗi. […] Đây là nguồn mạnh nhất trong
> cả hệ thống và đang bị bỏ phí hoàn toàn.

Agent chấm cần ba thứ để làm việc: **đề bài**, **đáp án mẫu chạy được**, **gói test**.
Hôm nay giảng viên phải tự có cả ba, và trong thực tế họ chỉ có cái thứ nhất.

**Soạn đề là chỗ duy nhất ba thứ đó ra đời một cách tự nhiên.** Nếu phần soạn đề sinh
ra cả bộ ba và tự kiểm bộ ba đó **bằng cách chạy**, thì vòng khép lại:

```
soạn đề ──> đề + đáp án CHẠY ĐƯỢC + gói test ──> chuẩn để chấm ──> chấm
                         ^                                            │
                         └──── cùng một sandbox, cùng một nguyên tắc ──┘
```

Nguyên tắc đó là *"không tin, hãy chạy"*, và điểm đáng nói là nó áp cho **cả hai đầu**:
hệ thống không tin bài sinh viên, và **cũng không tin đề do chính nó sinh ra**.

### 0.1 Phương án C — dựng đường văn bản ngay, mang hình dạng đường kiểm chứng

Ba phương án đã cân, chủ đồ án chốt **C** ngày 2026-09-21:

| | Nội dung | Vì sao không chọn |
|---|---|---|
| A | Sinh đề thuần văn bản, không chạy gì | Đáp án mẫu không ai kiểm — đúng thứ spec chấm dành 900 dòng để đả kích |
| B | Sinh đề có kiểm chứng đầy đủ bằng sandbox | **Bị chặn hoàn toàn**: sandbox mới là hợp đồng kiểu, nằm trên nhánh chưa merge, và câu hỏi hạ tầng chưa chốt |
| **C** | **Dựng A ngay, artefact mang sẵn hình dạng của B** | — |

C nghĩa là: bộ ba được sinh ra ngay từ hôm nay, mang sẵn trường `verification`, và
giao diện **dán nhãn "CHƯA KIỂM CHỨNG"** rõ ràng. Sandbox về thì bật cờ, không viết lại.

> **Nhãn thật thà không phải sáng kiến của spec này — nó là cách dự án đã chọn.** Nhánh
> `feature/code-autograder-plan-1` ship đúng kiểu này: commit `58ffd36` *"CodeProjectResolver
> ghép mã nguồn, **nói rõ CHƯA CHẠY**"*, commit `d640940` *"khai dạng bài khi tạo phiên,
> **nói rõ mã chưa được chạy**"*. Đi theo, không phát minh lại.

Và vì spec chấm §9 đặt sandbox ở **bước 1** rồi, nên khi nó về cho phần chấm thì phần
soạn đề **được kiểm chứng miễn phí** — không tốn thêm hạ tầng nào.

---

## 1. Phạm vi

### 1.1 Trong phạm vi

| Hạng mục | Ghi chú |
|---|---|
| Agent sinh **bộ ba** đề + đáp án mẫu + gói test | §3 |
| Ba nguồn tri thức: prompt, rubric, bảng lỗi | §2 |
| Trạng thái `verification` + nhãn trên giao diện | §4 |
| Giảng viên sửa trực tiếp trước khi xuất | §6 |
| Xuất **hai** file Word tách rời | §7 |
| Gắn vào phiên thi qua đường presigned đã có | §8 |
| Ghi nhận **chi phí** dù không lưu nội dung | §9.1 |

### 1.2 Cố ý KHÔNG trong phạm vi

- **Không có ngân hàng câu hỏi.** Không bảng mới, không dòng nào vào DB cho một đề
  được sinh ra. Bản nháp sống trong `localStorage` và chết cùng trình duyệt. Đây là
  quyết định của chủ đồ án ngày 2026-09-21, và §9 ghi đầy đủ cái giá.
- **Không chấm gì ở đây.** Không `enforceScoring`, không guard, không advocate. Module
  này không bao giờ sinh ra một con số nào gắn với một sinh viên.
- **Không phát đề cho sinh viên từ đây.** Đề đi vào `exam_material` thì chịu Security
  rule 2 như mọi tài liệu khác; module này không có đường tắt nào.
- **Không kiểm tra trùng lặp với Internet.** Hệ thống không có mạng ở tầng sandbox và
  không có cổng tìm kiếm nào. §6 nói rõ cái làm được là gì, và **không được hứa hơn**.
- **Không sinh đề cho môn khác.** Hệ thống là một môn duy nhất (CTDL&GT). Ngôn ngữ lập
  trình thì **không** khoá cứng, cùng lý do với spec chấm §1.1.
- **Không tự động chấm lại khi giảng viên sửa đề.**

---

## 2. Ba nguồn tri thức, và một bài học KHÔNG được bê nguyên

Chủ đồ án chốt cả **(a)** prompt gõ mỗi lần lẫn **(b)** đọc tri thức sẵn có của chính
giảng viên đó. Ba nguồn, và **chỉ hai nguồn tồn tại hôm nay**:

| Nguồn | Có hôm nay? | Cho ra cái gì |
|---|---|---|
| **Prompt của giảng viên**, mỗi lần | ✅ | Ý định lần này: chủ đề, số câu, độ khó, ràng buộc riêng |
| **Rubric** của giảng viên | ✅ `rubric.teacher_id` + `rubric_criterion` | Họ tính điểm cho cái gì — nên đề phải hỏi được cái đó |
| **Bảng lỗi** của giảng viên | ❌ **chưa có dòng code nào** | Lỗi họ thật sự quan tâm — nên đề phải làm lộ được lỗi đó |

Bảng lỗi mới chỉ nằm trong spec chấm §2.1. Nên **thiết kế nguồn tri thức thành danh
sách cắm thêm được**, không phải ba tham số cứng:

```ts
interface KnowledgeSource {
  kind: 'prompt' | 'rubric' | 'error_table';
  /** Nội dung đã render thành văn bản. Rỗng = nguồn chưa tồn tại, KHÔNG phải lỗi. */
  render(): Promise<string>;
}
```

Hôm nay mảng có hai phần tử; ngày bảng lỗi ra đời thì thêm một phần tử, không sửa chỗ
nào khác.

> **Luật quyền sở hữu, giữ nguyên từ spec cắt master data:** mọi nguồn đều lọc theo
> `teacher_id = req.user.sub`. Rubric của giảng viên khác **không bao giờ** được đọc để
> sinh đề cho người này — cùng ranh giới với `unique(teacher_id, name, version)` và với
> cảnh báo ở spec chấm §2.1 về việc khoá theo tên môn.

### 2.1 Lập luận prompt caching của spec chấm KHÔNG áp ở đây

Spec chấm §2.1 cấm nhét bảng lỗi vào system prompt, và cấm rất đúng: **40 bài của một
phiên dùng chung một tiền tố**, nên đặt phần thay đổi theo giảng viên vào tiền tố là
trả giá đầy đủ **bốn mươi lần**.

**Ở đây không có bốn mươi lần.** Soạn đề là **một lượt tương tác, một lần**. Không có
lô nào để chia sẻ tiền tố, nên cache không có gì để tiết kiệm, nên **không có lý do gì
bắt agent đọc rubric qua `read_file`**. Nhét thẳng vào prompt, đơn giản hơn và không
mất gì.

> Ghi ra vì đây đúng là loại lập luận dễ bị bê nguyên si sang chỗ không thuộc về nó.
> Một luật tối ưu chỉ đúng trong điều kiện sinh ra nó; chép luật mà không chép điều
> kiện là cách một spec tốt đẻ ra một spec tệ.

---

## 3. Đơn vị đầu ra là BỘ BA, không phải câu hỏi

Đây là khác biệt thiết kế quan trọng nhất so với "AI viết giúp đề".

```ts
interface GeneratedExam {
  /** Chỉ sống trong localStorage. Không có hàng nào trong DB mang id này. */
  draftId: string;
  title: string;
  language: string;            // 'python' | 'cpp' | ... — không khoá cứng
  questions: GeneratedQuestion[];
  verification: Verification;  // §4
  usage: { tokens: number; costUsd: number; model: string };
}

interface GeneratedQuestion {
  statement: string;           // đề, Markdown
  points: number;              // trần điểm câu này
  topic: string;               // 'sorting' | 'graph' | 'hashing' | ...
  requiredComplexity: string | null;  // 'O(n log n)' — null = đề không ràng buộc
  modelAnswer: string;         // MÃ NGUỒN, không phải lời giải bằng văn xuôi
  testBundle: TestCase[];
  /** Ánh xạ sang tiêu chí rubric của giảng viên. Rỗng khi không khớp cái nào. */
  rubricCriterionIds: string[];
  /** Bài kinh điển mà agent TỰ NHẬN là câu này giống. Xem §6. */
  resemblesKnownProblem: string | null;
}

interface TestCase {
  name: string;
  group: string;               // khớp `rubric_criterion.test_group` của nhánh autograder
  input: string;
  expectedOutput: string;
}
```

Ba điều đáng nói về hình dạng này:

1. **`modelAnswer` là MÃ NGUỒN, không phải văn xuôi.** Đây là toàn bộ điểm khác biệt.
   Một lời giải bằng lời thì mãi mãi chỉ là văn bản tham chiếu; một chương trình thì
   chạy được, và chạy được nghĩa là đo được (spec chấm §3.1).
2. **`testBundle.group` khớp `rubric_criterion.test_group`** đã có ở nhánh autograder.
   Không đặt tên mới cho cùng một khái niệm.
3. **`rubricCriterionIds` được phép rỗng.** Đề hỏi một thứ mà rubric hiện tại không
   tính điểm là chuyện hợp lệ — giảng viên sẽ sửa rubric, hoặc không. Hệ thống **không**
   được tự thêm tiêu chí vào rubric: rubric có version và có trigger bất biến
   (Security rule 7), và sinh đề không phải lý do chính đáng để đụng vào.

### 3.1 Chế độ thứ hai — từ một đề CÓ SẴN (thêm 2026-09-23)

Spec chấm §2.1 (*Khi giảng viên chỉ có đề*) dùng lại agent này khi giảng viên chỉ có đề
bài. Cùng seam, cùng `TierChain`, cùng hình dạng đầu ra, khác ba chỗ:

1. **Đầu vào là văn bản đề đã có**, đọc từ tài liệu của phiên. `statement` giữ nguyên văn:
   agent **không được sửa đề** — sinh viên đã làm đúng đề đó rồi.
2. **Mỗi `TestCase` thêm `constraintQuote: string`** — câu trong đề mà ca đó kiểm, trích
   nguyên văn. Ca không trích được thì bị bỏ trước khi đến tay giảng viên.
3. **Không đi qua `localStorage` hay Word.** Kết quả ghi thẳng vào `grading_reference` (cờ
   `model_answer_unverified` bật) và `grading_test_bundle` (`origin = 'generated'`), rồi chờ
   giảng viên duyệt trên màn chuẩn bị chấm.

Hạn mức (`GenerateQuotaService`) và ghi usage (§9.1) áp y như chế độ soạn đề: đây vẫn là
một lượt gọi model tốn tiền thật.

---

## 4. `verification` — ba trạng thái, và một cái bẫy chết người

```ts
type Verification =
  | { status: 'unverified'; reason: 'sandbox_unavailable' }
  | { status: 'passed'; ranAt: string; complexityMeasured: string | null }
  | { status: 'failed'; failures: string[]; repairAttempts: number };
```

| Trạng thái | Khi nào | Giao diện |
|---|---|---|
| `unverified` | **Hôm nay, luôn luôn** — sandbox chưa tồn tại | Băng vàng **"CHƯA KIỂM CHỨNG — đáp án mẫu chưa được chạy"**, không tắt được |
| `passed` | Đáp án mẫu chạy qua **toàn bộ** gói test của chính nó, và độ phức tạp đo được khớp `requiredComplexity` | Dấu xanh, ghi rõ đã chạy lúc nào |
| `failed` | Sau **tối đa 3** vòng tự sửa vẫn không qua | Băng đỏ, liệt kê ca fail. Vẫn cho xuất Word — giảng viên có thể tự sửa |

### 4.1 Cái bẫy: đáp án mẫu chưa kiểm chứng trở thành CHUẨN ĐỂ CHẤM

Đây là rủi ro nghiêm trọng nhất của cả spec này, và nó không hiển nhiên.

Spec chấm §2.1 dựng **toàn bộ** cơ chế rút chuẩn trên đáp án mẫu: *"Bài sinh viên lệch
khỏi chuẩn nào thì đó là một lỗi ứng viên."* Nếu một đáp án mẫu **không biên dịch nổi**
đi vào `grading_reference`, thì chuẩn đó là rác, và **mọi bài của phiên đó bị đo bằng
một cái thước bịa**.

Tệ hơn: hỏng theo kiểu **im lặng**. Bài nào cũng "lệch chuẩn", nên bài nào cũng bị chẩn
đoán đầy lỗi, và không có tín hiệu nào nói rằng vấn đề nằm ở cái thước.

**Luật, không thương lượng:**

> Bộ ba có `verification.status !== 'passed'` **không được gắn vào phiên thi làm
> `grading_reference` nếu không có một bước xác nhận riêng của giảng viên**, và lần
> gắn đó phải ghi lại là chuẩn chưa kiểm chứng.

Cụ thể ba lớp:

1. Nút "gắn vào phiên thi" **mở hộp thoại cảnh báo** khi chưa `passed`, nêu đúng hậu
   quả ở trên — không phải một dòng "bạn có chắc không?" chung chung.
2. Ghi cờ `model_answer_unverified` lên `grading_reference` (cột mới, boolean).
3. Màn chấm điểm đọc cờ đó và **hiện cảnh báo trên mọi bài của phiên ấy**.

> Cùng một đường suy nghĩ với `GradeExport` (Security rule 9): hệ thống **không đoán**
> cột MSSV dù header ghi rành rành, vì đoán sai thì hỏng âm thầm. Ở đây cũng vậy —
> hệ thống không tự cho rằng một đáp án mẫu chưa chạy là dùng được.

---

## 5. Vòng lặp agent — tái dùng gì, và KHÔNG tái dùng gì

| Thành phần | Số phận |
|---|---|
| Khuôn `AIGradingProvider` (một seam, business logic không import SDK) | **Theo khuôn**, tạo seam riêng `ExamAuthoringProvider` |
| `TierChain` + circuit breaker | **Dùng lại nguyên si** — nó đã generic trên `Req`/`Res`, đúng cho việc này mà không sửa dòng nào |
| `provider-failure.ts` (phân loại lỗi ba rổ) | **Dùng lại** |
| Ghi nhận token/chi phí | **Dùng lại**, xem §9.1 |
| `enforceScoring`, `applyGuards`, `evidence-check`, advocate | **KHÔNG dùng.** Ở đây không có điểm nào để ép, không có sinh viên nào để bảo vệ |
| BullMQ | **KHÔNG dùng.** Đây là tương tác đồng bộ, giảng viên đang ngồi đợi |

> `TierChain` đã generic sẵn (`TierEntry<Req, Res>`) vì nó được tách ra khi Advocate
> cũng cần chuỗi. Người tách nó ra đã trả sẵn tiền cho lần dùng thứ ba này.

### 5.1 Công cụ là TẬP CON, không phải bảy

Khi sandbox về, agent soạn đề nhận **ba** công cụ, không phải bảy của spec chấm:

| Công cụ | Vì sao cần |
|---|---|
| `run(input)` | Đáp án mẫu có chạy không |
| `run_tests()` | Đáp án mẫu có qua gói test của chính nó không |
| `run_scaled(n[])` | Độ phức tạp thật có khớp `requiredComplexity` đã tuyên bố không |

**Bốn công cụ còn lại cố ý không có:** `probe` và `compare_peers` phục vụ việc chẩn
đoán một bài nộp, ở đây không có bài nộp nào; `ast_query` và `read_file` phục vụ việc
điều tra mã người khác viết, còn ở đây agent đọc mã do chính nó vừa viết.

> Spec chấm §3 cảnh báo "vách đá 8 tool". Bài học rút ra **không** phải "được phép tới
> bảy" mà là **"đưa đúng số công cụ cần thiết"**. Ba là đủ cho việc này.

### 5.2 Trần cứng

| Trần | Mặc định | Vì sao |
|---|---|---|
| Số câu mỗi lần sinh | 10 | Quá số này thì giảng viên không đọc hết nổi trước khi duyệt |
| Vòng tự sửa khi test fail | 3 | Vòng 4 gần như luôn là agent đang loay hoay, không phải đang sửa |
| Thời gian thực | 180s | Người đang ngồi đợi. Khác hẳn chấm điểm chạy nền |
| Token | 100k | |

Chạm trần → **trả về những gì đã sinh được**, `verification.status = 'failed'`, ghi lý
do. Không ném lỗi.

> **Và ở đây "trả về những gì đã có" là AN TOÀN, khác hẳn §4.4 của spec chấm.** Lý do
> đáng ghi ra: một đề sinh dở thì **giảng viên đọc ngay và thấy ngay**; một bài chấm dở
> thì ra một con số trông hợp lệ. Cùng một câu chữ, hai mức rủi ro hoàn toàn khác nhau,
> và cái khác nhau là **có người xem ngay hay không**.

---

## 6. Trùng với bài kinh điển — nói đúng cái làm được

LLM sinh đề CTDL&GT **kéo mạnh về các bài kinh điển**: two-sum, đảo danh sách liên kết,
LRU cache, ba lô 0/1. Sinh viên tra mạng ra lời giải trong ba mươi giây, và đề coi như
hỏng.

Hệ thống **không có mạng** — sandbox cấm mạng theo Security rule 3, và không có cổng
tìm kiếm nào. Nên **không thể** đối chiếu với Internet. Nói thẳng điều đó thay vì hứa
một thứ không làm được.

Hai việc **làm được**, và cả hai đều rẻ:

1. **Bắt agent tự khai.** `resemblesKnownProblem` — *"câu này về bản chất là bài Kadane
   đổi tên biến"*. Model biết rất rõ điều này khi bị hỏi thẳng, và nó im lặng chỉ vì
   không ai hỏi. Câu trả lời hiện ngay trên thẻ câu hỏi cho giảng viên đọc.
2. **Một file danh sách đóng gói sẵn** khoảng 50 bài kinh điển của môn, agent đọc như
   đọc tài liệu. Đây là chỗ mẫu hình *"ghi thành file, không nhét vào prompt"* của spec
   chấm §2.1 **thật sự** áp được: danh sách này dùng chung mọi giảng viên, không đổi
   theo người, nên nó nằm yên trong tiền tố mà không phá gì.

> **Không được gọi đây là "phát hiện trùng lặp".** Nó là một lời tự khai của chính
> model đã sinh ra câu hỏi — hữu ích, và không phải bằng chứng. Báo cáo phải viết đúng
> như vậy; hứa quá ở đây là chỗ hội đồng sẽ chọc vào.

---

## 7. Xuất Word — HAI file, không bao giờ một

Sinh ở **backend**, stream thẳng về trình duyệt, **không lưu gì**.

| Quyết định | Chọn | Vì sao |
|---|---|---|
| Thư viện | **`docx`** (dựng bằng code) | `docxtemplater` cần một file template, mà file template thì phải lưu ở đâu đó — mâu thuẫn với "không lưu" |
| Nơi chạy | Backend | `exceljs` ở `apps/web` chỉ dùng để **đọc** roster (`read-workbook.ts`); dự án chưa từng sinh file ở trình duyệt, và bắt đầu ở đây là thêm 40KB bundle cho một việc backend làm tốt hơn |
| Lưu trữ | **Không** | Response là `Content-Disposition: attachment`. Hết request là hết |

### 7.1 Luật hai file

> **ĐỀ và ĐÁP ÁN MẪU không bao giờ nằm trong cùng một tài liệu.** Hai endpoint, hai
> nút, hai file.

Đây không phải chuyện gọn gàng, mà là chuyện rò đề. `GradingReferenceEntity` đã ghi sẵn
bài học của chính nó bằng chữ hoa:

> *ĐÁP ÁN MẪU TUYỆT ĐỐI KHÔNG ĐƯỢC LƯU Ở `exam_material`.
> `ExamMaterialService.listForAgent()` trả về mọi dòng của bảng đó kèm URL tải ngay khi
> qua `start_time`, không lọc theo loại — để nhầm chỗ là gửi đáp án về máy cả 40 sinh
> viên.*

Một file Word chứa cả đề lẫn đáp án là **đúng cùng một tai nạn**, chỉ khác là nó xảy ra
ở tay giảng viên thay vì trong code: họ in ra, hoặc họ upload nhầm file đó vào
`exam_material`. Tách ở tầng sinh file thì tai nạn đó không tồn tại để mà xảy ra.

| File | Nội dung |
|---|---|
| `de-thi.docx` | Tiêu đề, thông tin phiên, từng câu: đề + điểm + ràng buộc độ phức tạp |
| `dap-an-va-test.docx` | Từng câu: mã đáp án mẫu, bảng ca test, ghi chú chấm |

### 7.2 "Template câu" là khối lặp, không phải file mẫu

Yêu cầu gốc nói *"xuất ra word theo template câu"*. Hiểu đúng: mỗi câu render theo một
**khối cố định**, lặp lại N lần —

```
Câu {i}. ({points} điểm)                      [đậm]
{statement}                                    [thường, giữ xuống dòng của Markdown]
Yêu cầu độ phức tạp: {requiredComplexity}      [nghiêng, ẩn nếu null]
```

Không phải một file `.docx` mẫu do giảng viên cung cấp — cái đó lại phải lưu.

---

## 8. Gắn vào phiên thi — dùng nguyên đường đã có

> **Đã đổi khi implement (commit `de779e8`, ghi lại 2026-09-23).** Bảng dưới là thiết kế
> ban đầu: ba mảnh đi ba đường, trình duyệt xâu chuỗi bốn lượt gọi. Bản ship là **một**
> route, `POST /exam-authoring/attach`: trình duyệt gửi JSON đề (không gửi file), server
> dựng hai file `.docx`, tự ghi lên kho, tạo `exam_material` rồi `grading_reference` trong
> cùng một lượt gọi, và gỡ tài liệu vừa tạo nếu bước sau hỏng. Lý do nằm ở docblock của
> `attach-exam.service.ts`: luật *"phiên nào gắn được"* trước đó chỉ sống trong một nút bị
> tắt ở giao diện, còn ba endpoint dùng chung thì không đọc luật đó, và không nên đọc. Luật
> ship đo **giờ thi** (`now < start_time`, phiên chưa đóng) chứ không đọc `status`, vì phiên
> nào cũng `active` ngay từ lúc tạo.
>
> Security rule 5 vẫn giữ: luật đó cấm **tải file lên** đi xuyên NestJS, còn ở đây không có
> file nào được tải lên — byte nào lên kho cũng do chính server sinh. T-ATT-3 đọc lại theo
> nghĩa đó. Gói test (dòng thứ ba của bảng) chưa được ghi đi đâu: `grading_test_bundle` vẫn
> nằm trên nhánh autograder chưa merge.

Không endpoint upload mới nào. Ba mảnh đi ba đường **đã tồn tại**:

| Mảnh | Đường | Ghi chú |
|---|---|---|
| Đề | `POST /exam-sessions/:id/materials/upload-url` → trình duyệt `PUT` → `POST .../materials` | Đúng hai bước của `ExamMaterialService.requestUpload` + `create` |
| Đáp án mẫu | Presigned dưới prefix `grading-reference/` → `grading_reference.model_answer_storage_key` | Prefix này **không bao giờ** đi qua `listForAgent` |
| Gói test | `grading_test_bundle` (đã có ở nhánh autograder) | |

**Trình duyệt `PUT`, không phải server.** Security rule 5 nói file không bao giờ đi
xuyên NestJS. Backend sinh bytes `.docx` rồi trả về cho trình duyệt; nếu giảng viên bấm
"gắn vào phiên thi" thì **chính trình duyệt** cầm bytes đó `PUT` lên presigned URL. Server
không cầm file lần nào.

> Và `grading_reference` có `uq_grading_reference_session` — **một phiên một bản**, đóng
> băng khi phiên đã có kết quả chấm. Nên "gắn vào phiên thi" phải xử lý trường hợp phiên
> **đã có** reference: hỏi ghi đè, và **từ chối** nếu phiên đã chấm bài nào. Không tự
> quyết thay giảng viên.

### 8.1 Ghi chú 2026-09-23 — chấm lại bài "không chấm được", và chỗ nó đụng luật đóng băng ở trên

**Chưa quyết.** Ghi ở đây vì luật đóng băng của §8 là một nửa của vấn đề.

Hôm nay một bài thành *không chấm được* theo hai đường, và **cả hai đều cụt**:

| Đường | Khi nào | Chấm lại được không |
|---|---|---|
| Hết lượt thử | Dịch vụ AI lỗi, quá 300 giây, hoặc lỗi không thử lại được → `markUngradable` ghi `flagged_for_review` kèm `ungradable_reason` | **Không.** `regrade-stuck` chỉ nhặt dòng còn ở `ai_grading` |
| Sàn bằng chứng (spec chấm §4.4, chưa có code) | Gói test chưa từng chạy; 0 lời gọi công cụ thành công | **Không**, cùng lý do |

Ba lượt thử cách nhau 5, 10 rồi 20 giây, nên một sự cố dịch vụ AI kéo dài chừng một phút
đủ biến cả loạt bài đang chạy thành *không chấm được*, và không nút nào đưa chúng về.

**Chỗ đụng vào spec này.** `assertNotGradedYet` đếm **mọi** dòng `grading_result`, kể cả
dòng không có điểm. Nên một phiên có 40/40 bài *không chấm được* vẫn bị coi là *đã chấm*:
không thay được đáp án mẫu (T-ATT-2 từ chối), và cũng không chấm lại được. Ghép với §4.1
thì ra ca tệ nhất: đáp án mẫu **chưa kiểm chứng** từ Soạn đề bị hỏng → khi sandbox về, bài
nào cũng rơi dưới sàn → giảng viên sửa đáp án thì bị chặn vì phiên "đã chấm" → phiên kẹt
vĩnh viễn.

**Đề xuất, chờ chốt — một ngoại lệ hẹp, hai vế:**

1. **Chấm lại chỉ cho bài chưa có điểm nào** (`ai_total_score IS NULL`), do giảng viên
   bấm, mỗi lượt để lại dấu vết ai bấm. Lý do chặn chấm lại — bất biến của điểm, công bằng
   trong một phiên — không áp cho một bài chưa từng được đo.
2. **Luật đóng băng tài liệu đếm bài CÓ ĐIỂM, không đếm mọi dòng.** Phiên chưa có bài nào
   mang điểm thì chưa bài nào bị đo bằng cái thước cũ, nên thay thước không đẻ ra hai kỳ
   thi. Chỉ cần một bài mang điểm là luật giữ nguyên như hôm nay. Luật đóng băng rubric
   (`setSessionRubric`) dùng chung ý này, nên đổi thì đổi cả hai.

Cho tới khi chốt, mọi nút *chấm lại* trên giao diện mang nhãn *cần backend* (spec UI
2026-09-23, mục 3.8 và mục 5.1).

---

## 9. "Không lưu" — cái giá, viết ra đủ

Quyết định của chủ đồ án, 2026-09-21. Nó đúng cho phạm vi một đồ án, và nó **không
miễn phí**. Ghi ra để không ai ngạc nhiên sau:

- Xoá dữ liệu trình duyệt → **mất sạch** bản nháp.
- Soạn ở máy này, không mở được ở máy kia.
- Người dạy cùng môn không dùng lại được đề của nhau.
- Không có lịch sử. Không trả lời được *"đề giữa kỳ năm ngoái hỏi gì"*.
- **Máy phòng máy là máy dùng chung.** Một bản nháp đề chưa thi nằm trong `localStorage`
  của một máy mà sinh viên cũng ngồi là một đường rò thật. Giao diện phải có nút **"Xoá
  bản nháp"** rõ ràng, và tự xoá sau **24 giờ**.

Nếu sau này đổi ý, chỗ đổi là **một** bảng `exam_draft(teacher_id, payload jsonb)` với
khoá `teacher_id` — cùng hình dạng sở hữu với `rubric`. Hình dạng `GeneratedExam` ở §3
đã là một payload serialize được, nên bước đó không phải viết lại gì.

### 9.1 Nhưng CHI PHÍ thì phải ghi, kể cả khi nội dung không ghi

"Không lưu" áp cho **nội dung đề**, không áp cho **dấu vết vận hành**.

Mỗi lượt sinh đề là một lời gọi model tốn tiền thật. Nếu không ghi gì thì:

- Dashboard chi phí AI của Admin **mù** với cả một tính năng.
- Không ai trả lời được *"soạn đề tốn bao nhiêu mỗi đề"* — một con số phải có trong báo
  cáo, đứng cạnh chi phí mỗi bài chấm.
- Ngân sách (`cost_budget`) đếm thiếu, nên trần chi phí sai.

Nên ghi **usage mà không ghi content**: `teacher_id`, thời điểm, model, token vào/ra,
`cost_usd`, số câu sinh ra, `verification.status`. **Không** ghi đề, không ghi đáp án.

> Đây là ranh giới hay bị lẫn: *"không lưu"* của người dùng nghĩa là *"đừng giữ bài
> làm của tôi"*, chưa bao giờ nghĩa là *"đừng biết mình đã tiêu bao nhiêu tiền"*.

---

## 10. Thứ tự thực hiện

1. **Seam + `TierChain` + một lượt gọi sinh bộ ba.** Chưa giao diện, kiểm bằng test.
   Từ đây đã biết được model sinh ra thứ dùng được hay không — và đó là câu hỏi rủi ro
   nhất, nên nó đi trước.
2. **Ghi usage** (§9.1). Làm sớm, vì mỗi ngày chạy mà không ghi là một ngày số liệu
   biến mất vĩnh viễn.
3. **Giao diện: nhập prompt → xem bộ ba → sửa → nháp trong `localStorage`.**
4. **Xuất hai file Word** (§7).
5. **Gắn vào phiên thi** (§8), kèm đủ ba lớp cảnh báo của §4.1.
6. **Cắm nguồn bảng lỗi** khi spec chấm §2.1 có nó.
7. **Bật kiểm chứng** khi sandbox chạy: ba công cụ §5.1, vòng tự sửa, `verification`
   chuyển từ `unverified` sang `passed`/`failed`.

Bước 7 là bước biến tính năng này từ "AI viết giúp đề" thành **nửa trên của vòng khép
kín** ở §0. Trước nó, đây là một tiện ích; sau nó, đây là một luận điểm.

---

## 11. Test bắt buộc

| Mã | Ca | Mức |
|---|---|---|
| **T-GEN-1** | Không có sandbox → `verification.status = 'unverified'`, **không bao giờ** `'passed'` | unit |
| **T-GEN-2** | Model trả JSON hỏng → lỗi rõ ràng, **không** trả về bộ ba rỗng trông như hợp lệ | unit |
| **T-GEN-3** | Chạm trần vòng tự sửa → `'failed'` kèm danh sách ca fail, không ném lỗi | unit |
| **T-GEN-4** | Nguồn tri thức rỗng (giảng viên chưa có rubric) → vẫn sinh được, không 500 | unit |
| **T-OWN-1** | Rubric của giảng viên KHÁC **không** lọt vào nguồn tri thức | e2e |
| **T-DOC-1** | `de-thi.docx` **không** chứa chuỗi nào của `modelAnswer` | unit |
| **T-DOC-2** | Hai endpoint xuất file là hai endpoint tách rời; không có đường nào ra một file gộp | unit |
| **T-DOC-3** | Câu có `requiredComplexity = null` → dòng đó **vắng mặt**, không in "null" | unit |
| **T-ATT-1** | Gắn bộ ba `unverified` → **bắt buộc** qua bước xác nhận, và ghi cờ `model_answer_unverified` | e2e |
| **T-ATT-2** | Phiên **đã có** kết quả chấm → từ chối ghi đè `grading_reference` | e2e |
| **T-ATT-3** | Trình duyệt không gửi byte file nào lên NestJS: `POST /exam-authoring/attach` nhận JSON đề, file `.docx` do server sinh rồi tự ghi (đổi 2026-09-23, xem ghi chú đầu §8) | e2e |
| **T-ATT-4** | Đáp án mẫu nằm dưới prefix `grading-reference/`, **không** lọt vào `listForAgent` | e2e |
| **T-COST-1** | Sinh đề xong → có một dòng usage với `cost_usd`, và **không** có dòng nào chứa nội dung đề | integration |
| **T-DRAFT-1** | Bản nháp quá 24 giờ → tự xoá khỏi `localStorage` | unit |

T-DOC-1 và T-ATT-4 là cùng một luật ở hai tầng (file và storage). Chỉ có một trong hai
thì đường còn lại vẫn rò đáp án, và cả hai đường đều đã từng là tai nạn thật trong dự
án này.

---

## 12. Rủi ro đã biết

1. **Đáp án mẫu chưa kiểm chứng thành chuẩn chấm** (§4.1). Rủi ro lớn nhất, hỏng im
   lặng, và ba lớp cảnh báo là toàn bộ hàng phòng thủ cho tới khi sandbox về.
2. **Đề sinh ra trùng bài kinh điển** (§6). Giảm được, không loại được. **Không hứa quá
   trong báo cáo.**
3. **Chất lượng đề là thứ chưa ai đo.** Spec chấm có §8.2 để đo độ đồng thuận; ở đây
   chưa có phép đo tương đương, và cũng chưa rõ phép đo đúng là gì. Cách rẻ nhất: đếm
   xem giảng viên **sửa bao nhiêu phần trăm** câu trước khi xuất. Ghi ra để nó không bị
   quên, chứ chưa thiết kế.
4. **Phụ thuộc sandbox cho bước 7** — cùng câu hỏi hạ tầng với spec chấm §11.1, không
   phải một câu hỏi mới.
5. **Rò đề qua `localStorage` trên máy dùng chung** (§9).
