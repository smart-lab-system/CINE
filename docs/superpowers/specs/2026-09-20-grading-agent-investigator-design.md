# Hệ thống chấm điểm bằng agent điều tra — thiết kế

**Ngày:** 2026-09-20 · **Baseline:** `main` = `3cf4688` · **Trạng thái:** spec, chưa implement
**Phụ thuộc:** `2026-09-20-master-data-scope-cut-design.md` phải xong trước.

Thay lượt chấm một-phát bằng một **vòng điều tra có công cụ**: agent chạy mã sinh
viên, đo đạc, dò biên, rồi mới kết luận. Đầu ra không phải một con số mà là **hồ
sơ chẩn đoán** có thể chạy lại được.

---

## 0. Vì sao phải thay, chứ không vá

Hệ thống hôm nay **đọc** mã nguồn và chấm. Nó không **chạy** mã.

Hệ quả cụ thể, đã ghi trong `docs/grading-system-guide.md` §11: một file `.py`
đi qua `DocumentResolver`, được `extractText()` đọc như văn xuôi, model đọc và
cho điểm theo rubric. Không dòng nào được thực thi, không test nào chạy, và hệ
thống **không cảnh báo gì**. Người xem demo rất dễ tưởng đây là autograder.

Vá bằng cách thêm bộ test là chưa đủ, vì nó chỉ nâng từ "đoán" lên "đúng/sai".
Một bài trượt một test có thể là lệch chỉ số một đơn vị, đáng 8,5 điểm, hoặc sai
hẳn thuật toán, đáng 3 điểm. **Bộ test cho cùng một kết quả cho cả hai.** Phân
biệt được chúng là việc giảng viên đang làm bằng tay và là chỗ tốn thời gian
nhất của họ.

### 0.1 Luận điểm học thuật chống lưng cho việc "làm thay"

Nghiên cứu 2024 về độ nhất quán của người chấm bài lập trình (arXiv 2409.12967)
đo Krippendorff alpha giữa các giảng viên, ngưỡng chấp nhận được là trên 0,8:

| Khía cạnh | Alpha giữa người với người |
|---|---|
| Tính đúng đắn | 0,22 |
| Thanh thoát / dễ đọc / chú thích | dưới 0,1 |

Chỉ **1 trên 22** người chấm lại cùng một bài mà cho cùng điểm. Nghĩa là chấm tay
**đã và đang** cho ra điểm thiếu nhất quán, chỉ là không ai đo nên không ai thấy.

Nên bar của hệ thống này **không phải** "tuyệt đối đúng". Nó là **"nhất quán hơn
cái nền người thật đang tạo ra"** — một bar đạt được, và đạt được thì việc hệ
thống tự quyết là chính đáng chứ không liều.

### 0.2 Chặn số học phải gỡ, nếu không mọi thứ khác vô nghĩa

`grading.service.ts:495`: `finalConfidence = min(guard, trần của bậc model)`.
Trần các bậc dự phòng là 0,5, ngưỡng tự duyệt là 0,85. **Không có Claude thì
không bài nào tự duyệt được**, kể cả bài mà 100% rubric do test case quyết.

Đây là lỗi mô hình, không phải lỗi cấu hình: độ tin của một verdict đến từ **test
chạy thật** không hề bắt nguồn từ model, nên nó không có lý do gì chịu trần của
model. §4 sửa đúng chỗ này, và nó là điều kiện cần của mọi mục tiêu giảm tải.

---

## 1. Phạm vi

### 1.1 Trong phạm vi

| Hạng mục | Ghi chú |
|---|---|
| Vòng lặp agent có công cụ, thay lượt gọi một-phát | Lõi của cả spec |
| Bảy công cụ điều tra (§3) | Chạy trong sandbox, không mạng |
| Đo **độ phức tạp thực nghiệm** | Năng lực không công cụ nào khác trong repo có |
| Hồ sơ chẩn đoán thay cho `criterion_results` phẳng | §5 |
| Nguồn gốc điểm theo từng tiêu chí, và confidence theo nguồn gốc | §4 — gỡ chặn §0.2 |
| Agent phản biện phán quyết bằng **bằng chứng khác** | §6 |
| Trần cứng cho vòng lặp | §7 |

Môn mục tiêu: **Cấu trúc dữ liệu và Giải thuật**. Ngôn ngữ **không** khoá cứng —
tree-sitter phủ 13+ ngôn ngữ bằng một giao diện truy vấn, và phép đo độ phức tạp
hoàn toàn độc lập ngôn ngữ vì nó chỉ cần chạy được chương trình. Hiện thực và đo
trên **đúng hai ngôn ngữ** để chứng minh tính khái quát.

### 1.2 Cố ý KHÔNG trong phạm vi

- **Hỏi giảng viên bất cứ điều gì.** Chủ đồ án đã bác bỏ dứt khoát: không so sánh
  cặp, không phỏng vấn, không buổi chấm mẫu. Chính sách chấm chỉ được rút từ
  rubric, đề bài, đáp án, gói test, và **điểm giảng viên đã nhập trong lúc dùng
  bình thường** (cơ chế anchor, thụ động, đã có sẵn).
- **Tự train model chấm.** Fine-tune cần 10.000–100.000 mẫu; một môn một kỳ cho
  40–200 bài. Lệch 2–3 bậc độ lớn. Chiều sâu đến từ **bộ công cụ**, không từ
  trọng số. Chỗ train hợp lý duy nhất là bộ hiệu chỉnh ở §8, và nó không chấm.
- **Bài tự luận và bài ảnh.** Đường `DocumentResolver` giữ nguyên hành vi.
- **Dạng C và D** (project cần build, service có API) — theo đúng ranh giới của
  `2026-09-17-code-autograder-design.md` §1.2.
- **Chấm lại tự động khi giảng viên sửa gói test.**

---

## 2. Cái gì tái dùng, cái gì thay

Đây là phần quan trọng nhất để không ai viết lại thứ đã chạy tốt.

| Thành phần | Số phận |
|---|---|
| `AIGradingProvider` (seam) | **Giữ**, mở rộng thêm `gradeWithTools()` |
| `TierChain` + circuit breaker + phân loại lỗi ba rổ | **Giữ nguyên** |
| `enforceScoring()` — server tính điểm từ verdict | **Giữ nguyên.** Model vẫn không bao giờ chạm con số |
| `applyGuards()` G1/G2/G3 | **Giữ**, mở rộng cho bằng chứng dạng đo (§4.2) |
| `evidence-check.ts` (đối chiếu trích dẫn nguyên văn) | **Giữ** cho tiêu chí do LLM quyết |
| `ContentResolverRegistry`, `CodeProjectResolver` | **Giữ** — đã dựng ở nhánh autograder |
| `archive/` (inspector, rules, declaration-check) | **Giữ** — đã dựng |
| `sandbox.types.ts` | **Giữ hợp đồng**, phải implement thật |
| 3 trigger DB bất biến | **Giữ nguyên.** Điểm AI gốc vẫn không bao giờ bị ghi đè |
| BullMQ queue, `regrade-stuck` | **Giữ nguyên** |
| **Lượt gọi model một-phát trong `gradeOne`** | **THAY** bằng vòng điều tra |
| **`runAdvocate()` hiện tại** | **THAY** — xem §6, lỗi thiết kế thật |
| **`finalConfidence = min(guard, trần bậc)`** | **THAY** — §0.2 |

> **`runAdvocate()` hôm nay có một lỗi thiết kế, không chỉ thiếu tính năng.** Nó
> hỏi model thứ hai "bỏ qua rubric, em ấy có đúng không?" trên **cùng một đoạn
> text**. Hai model cùng dòng sai giống nhau, nên phép này giảm nhiễu ngẫu nhiên
> mà **không** giảm thiên lệch chung — đúng thứ cần giảm. §6 sửa bằng cách bắt
> nó phán quyết trên **bằng chứng khác**.

---

## 3. Bảy công cụ

Agent không nhận text rồi trả điểm. Nó nhận **thư mục bài nộp + bộ công cụ** và
tự quyết cần làm gì. Mọi công cụ chạy trong container dùng một lần, không mạng,
giới hạn cứng CPU / RAM / thời gian / số tiến trình.

| Công cụ | Trả lời câu hỏi nào của giảng viên |
|---|---|
| `run(input)` | Chạy được không, ra gì với dữ liệu này |
| `run_scaled(n[])` | **Độ phức tạp thực tế là bao nhiêu** |
| `run_tests(group?)` | Nhóm yêu cầu nào đạt |
| `read_file(path)` / `list_files()` | Nộp những gì, cấu trúc ra sao |
| `ast_query(q)` | Có thật sự dùng đệ quy, hay gọi thư viện có sẵn để né |
| `probe(spec)` | Sai toàn diện hay chỉ sai ở biên; **ca lỗi nhỏ nhất** là gì |
| `compare_peers()` | Chép bài, và nhóm sinh viên cùng hiểu sai một chỗ |

### 3.1 `run_scaled` — năng lực không thể thay bằng LLM hay unit test

Chạy bài với n tăng dần, đo thời gian, khớp đường cong tăng trưởng, kết luận lớp
độ phức tạp. Một bài **qua sạch mọi test** vẫn có thể là O(n²) khi đề yêu cầu
O(n log n). Bộ test không thấy vì kết quả vẫn đúng. LLM đọc tĩnh thì **đoán**, và
đoán sai thường xuyên. Chỉ chạy thật mới biết.

Tiền lệ học thuật: CASET (arXiv 2410.15419) phân loại bài nộp vào "rổ độ phức
tạp" bằng vết thực thi. Ta đi xa hơn một bước: **đưa kết quả đo vào làm bằng
chứng cho một tiêu chí rubric**, không chỉ để phân loại.

> **Bẫy đo lường, phải xử lý chứ không bỏ qua:** thời gian chạy nhiễu vì máy chủ
> chia sẻ CPU. Đo **nhiều lần lấy trung vị**, và khi hai lớp độ phức tạp kề nhau
> không tách được thì trả **`inconclusive`**, không trả lớp gần nhất. Một phép đo
> nhiễu được trình bày như kết luận chắc chắn là cách tệ nhất để mất niềm tin.

### 3.2 `probe` — chỗ tạo ra chiều sâu thật

Sinh input nhắm biên: mảng rỗng, một phần tử, phần tử trùng, đã sắp xếp, sắp xếp
ngược, giá trị cực trị. Rồi **thu hẹp dần** để tìm ca lỗi nhỏ nhất.

Đây là thứ biến "trượt test 7" thành "sai **chỉ khi** mảng có phần tử trùng, mọi
trường hợp khác đúng" — và hai câu đó đáng hai mức điểm rất khác nhau. Đây chính
là việc giảng viên làm trong đầu và tốn mười phút mỗi bài.

---

## 4. Nguồn gốc điểm, và confidence theo nguồn gốc

### 4.1 Mỗi tiêu chí mang nguồn gốc của nó

`CriterionResult` thêm một trường:

```ts
type VerdictSource =
  | 'deterministic'   // test case, biên dịch, đo độ phức tạp — máy quyết
  | 'llm_with_tools'  // LLM kết luận, có trích dẫn lời gọi công cụ
  | 'llm_only';       // LLM đọc và phán đoán, không công cụ nào chống lưng
```

### 4.2 Trần confidence theo nguồn gốc, KHÔNG theo bậc model

Thay `min(guard, trần bậc)` bằng:

| Nguồn gốc | Trần confidence | Lý do |
|---|---|---|
| `deterministic` | **1,0** | Độ tin không đến từ model. Test chạy lại cho cùng kết quả |
| `llm_with_tools` | 0,85 | Model kết luận, nhưng mọi khẳng định trỏ tới lời gọi công cụ chạy lại được |
| `llm_only` | **trần của bậc model** (như hôm nay) | Không có gì chống lưng ngoài chính model |

Confidence của **cả bài** là trung bình có trọng số theo điểm tối đa của từng
tiêu chí, không phải giá trị nhỏ nhất. Một bài 8 điểm do test quyết cộng 2 điểm
do LLM phán đoán không đáng bị kéo xuống mức của vế 2 điểm.

> **Đây là thay đổi làm cho mục tiêu giảm tải khả thi về mặt số học.** Nếu 70%
> điểm của một môn do test quyết thì phần lớn bài vượt ngưỡng tự duyệt mà không
> cần model mạnh nào. Con số "bao nhiêu phần trăm điểm do máy quyết" là **thuộc
> tính của rubric cộng gói test, đo được TRƯỚC khi chấm bài nào**, và nên là con
> số tiêu đề của cả đồ án.

### 4.3 Luật chống mâu thuẫn — giữ nguyên tinh thần spec autograder

Mọi nhóm test `passed === 0` mà LLM vẫn cho `met` ở ≥50% tiêu chí còn lại →
`flagged_for_review`, trần 0,5, kèm lý do. **Không tự động cho 0 điểm** — rubric
là của giảng viên, việc của hệ thống là đặt mâu thuẫn trước mắt người chấm.

---

## 5. Hồ sơ chẩn đoán

Cột mới `grading_result.investigation` (jsonb), ghi trong **cùng một `update()`**
với `ai_total_score` và **phải thêm vào danh sách của `guard_grading_result_ai_immutable`
trong cùng migration** — nếu không, cột mới sửa được sau khi chấm, phá Security
rule 6 mà không ai thấy.

```ts
interface Investigation {
  toolCalls: ToolCall[];        // mọi lời gọi, kèm input và output nguyên văn
  complexity: {
    measured: string | 'inconclusive';
    required: string | null;
    samples: { n: number; medianMs: number }[];
  } | null;
  minimalFailingCase: { input: string; expected: string; got: string } | null;
  approach: string | null;      // họ thuật toán nhận ra qua AST
  peerCluster: string | null;   // mã cụm, cho cả chép bài lẫn nhóm cùng sai
  budget: { toolCalls: number; wallMs: number; tokens: number };
}
```

**Nguyên tắc chống bịa, mạnh hơn đối chiếu chuỗi con:** mọi khẳng định trong
verdict phải trỏ tới một `toolCall.id`, và lời gọi đó phải **chạy lại ra cùng kết
quả**. Guard chọn ngẫu nhiên một lời gọi mỗi bài và chạy lại để đối chiếu; lệch
thì hạ confidence và gắn cờ. Đối chiếu trích dẫn nguyên văn hiện tại vẫn giữ,
nhưng chỉ còn áp cho tiêu chí `llm_only`.

Màn hình lịch sử của giảng viên đọc thẳng từ đây: xem được agent đã chạy gì, thấy
gì, và vì sao kết luận vậy.

---

## 6. Agent phản biện — phải dùng bằng chứng khác

Thay `runAdvocate()` hiện tại. Ba ràng buộc, mỗi cái vá một lỗi thật:

1. **Không thấy lập luận của agent chấm.** Chỉ nhận đề bài, rubric, và **các
   toolCall thô**. Cho nó đọc văn bản lập luận là mời nó đồng ý.
2. **Được gọi công cụ của chính nó**, kể cả `probe` với input tự chọn. Đây là vế
   "bằng chứng khác" — không có nó thì đây lại là ý kiến thứ hai trên cùng dữ
   liệu, tức đúng lỗi đang có.
3. **Không bao giờ chạm vào điểm.** Giữ nguyên ba lớp chặn đang có: kiểu dữ liệu
   không có trường điểm, JSON schema không có, và trigger DB.

**Khi bất đồng:** gắn cờ **đúng tiêu chí đó**, không gắn cờ cả bài. Một bài 6
tiêu chí mà lệch 1 thì giảng viên chỉ cần nhìn 1.

> Hai agent cùng dòng model đồng ý với nhau **không** phải bằng chứng. Nếu hai
> bậc trong `TierChain` là hai model cùng họ, phải ghi rõ trong báo cáo rằng phép
> phản biện ở cấu hình đó chỉ đo nhiễu, không đo thiên lệch.

---

## 7. Trần cứng cho vòng lặp

Vòng lặp agent là chỗ tiền và thời gian bốc hơi. Trần đọc từ env, có mặc định:

| Trần | Mặc định | Vì sao |
|---|---|---|
| Số lời gọi công cụ mỗi bài | 25 | Vượt nghĩa là agent đang lạc, không phải đang sâu |
| Thời gian thực mỗi bài | 300s | Bằng `GRADE_JOB_TIMEOUT_MS` đang có |
| Token mỗi bài | 150k | |
| Số vòng lặp | 12 | |

Chạm trần → **dừng và chấm với những gì đã có**, hạ confidence, ghi lý do vào
`investigation.budget`. **Không** ném lỗi: một bài điều tra dở vẫn hữu ích hơn
một bài không có gì.

> Đã đo trên tầng 1 hiện tại (`docs/.../2026-09-14-...` §15.0): một lượt chấm 3
> tiêu chí mất **45,8 giây**, một lượt phản biện mất **61,4 giây**. Vòng điều tra
> có công cụ sẽ **tốn hơn nhiều**. Phải đo lại trần và chi phí thật trước khi
> trích bất cứ con số nào vào báo cáo.

---

## 8. Chỗ "train" hợp lý duy nhất

Không train model chấm. Train một model nhỏ **trên đặc trưng** để dự đoán *"giảng
viên sẽ sửa điểm này không"*:

- Đầu vào: tỉ lệ test qua, độ lệch giữa độ phức tạp đo được và yêu cầu, số bước
  điều tra đã dùng, mức bất đồng với agent phản biện, tỉ lệ tiêu chí `llm_only`.
- Nhãn: giảng viên có tạo `teacher_review` sửa điểm hay không. **Thu được miễn
  phí từ việc dùng bình thường.**
- Mô hình: hồi quy logistic hoặc gradient boosting. Chạy tốt với ~200 mẫu.
- Dùng để: quyết ngưỡng tự duyệt theo từng giảng viên, thay một hằng số 0,85 chung.

Đây là thành phần học máy thật, huấn luyện được bằng dữ liệu thật sự có, và nó
**không chấm** — nó chỉ quyết khi nào hệ thống được im lặng.

---

## 9. Thứ tự thực hiện

1. **Sandbox chạy thật.** Implement `sandbox.types.ts` đã khai. Không có nó thì
   sáu trong bảy công cụ vô nghĩa. Cần một nơi deploy có Docker daemon — Vercel
   và mọi nền tảng serverless **không chạy được**, và câu này chưa được trả lời.
2. **Ba công cụ đầu** (`run`, `run_tests`, `read_file`) + vòng lặp có trần.
3. **Nguồn gốc điểm + trần theo nguồn gốc** (§4). Gỡ chặn §0.2. Từ đây đã đo được
   mức giảm tải thật.
4. **`run_scaled` + đo độ phức tạp.** Phần độc đáo nhất của đồ án.
5. **`probe`, `ast_query`, `compare_peers`.**
6. **Agent phản biện mới** (§6), thay cái cũ.
7. **Bộ hiệu chỉnh** (§8), sau khi có đủ dữ liệu một học kỳ.

Bước 1 là rủi ro hạ tầng lớn nhất và nên làm trước mọi thứ khác. Bước 3 là bước
đầu tiên cho ra con số trình được.

---

## 10. Test bắt buộc

| Mã | Ca | Mức |
|---|---|---|
| **T-AG-1** | Chạm trần lời gọi → chấm với dữ liệu đã có, không ném lỗi | unit |
| **T-AG-2** | Mọi khẳng định trong verdict trỏ tới một `toolCall.id` có thật | unit |
| **T-AG-3** | Chạy lại một lời gọi ngẫu nhiên lệch kết quả → hạ confidence + gắn cờ | unit |
| **T-SRC-1** | Tiêu chí `deterministic` **không** bị trần bậc model kéo xuống | unit |
| **T-SRC-2** | Tiêu chí `llm_only` **vẫn** chịu trần bậc model | unit |
| **T-CX-1** | Bài O(n²) qua sạch test nhưng đề đòi O(n log n) → bắt được | integration |
| **T-CX-2** | Hai lớp độ phức tạp kề nhau không tách được → `inconclusive`, không đoán | unit |
| **T-PB-1** | Bài sai **chỉ** khi có phần tử trùng → ca lỗi nhỏ nhất đúng | integration |
| **T-ADV-1** | Agent phản biện **không** nhận được lập luận của agent chấm | unit |
| **T-ADV-2** | Bất đồng gắn cờ **đúng tiêu chí đó**, không gắn cờ cả bài | unit |
| **T-ADV-3** | Ba lớp chặn điểm của agent phản biện vẫn còn nguyên | e2e |
| **T-IMM-1** | `investigation` nằm trong trigger bất biến, không sửa được sau khi chấm | e2e |
| **T-SBX-1** | Sandbox chết → `unavailable`, **không** thành "bài làm sai" | unit |

T-SRC-1 và T-SRC-2 là cặp đi ngược chiều nhau. Chỉ có T-SRC-1 thì một lần refactor
bỏ trần cho mọi nguồn gốc vẫn xanh, và điều đó cho một model chưa hiệu chỉnh
quyền tự kết thúc việc chấm một sinh viên.

---

## 11. Rủi ro đã biết

1. **Nơi deploy phải có Docker.** Chưa được trả lời. Chặn bước 1.
2. **Chi phí mỗi bài tăng đáng kể** so với một lượt gọi. Trần ở §7 chặn trường
   hợp tệ nhất, nhưng chi phí trung bình phải đo trước khi hứa gì.
3. **Đo thời gian chạy nhiễu** trên máy chủ chia sẻ (§3.1).
4. **Mã sinh viên là mã không tin được.** Mọi ràng buộc bảo mật của
   `2026-09-17-code-autograder-design.md` §1.4 áp nguyên vẹn, không có ngoại lệ
   nào kể cả để gỡ lỗi.
5. **Phụ thuộc đợt cắt master data.** Rubric phải thuộc giảng viên trước đã.
