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
không bài nào tự duyệt được**, kể cả bài mà toàn bộ mức trừ do test case quyết.

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
| Hồ sơ chẩn đoán + bảng lỗi, thay `criterion_results` phẳng | §5 |
| Nguồn gốc theo từng LỖI, và confidence theo nguồn gốc | §4 — gỡ chặn §0.2 |
| Agent phản biện phán quyết bằng **bằng chứng khác** | §6 |
| Trần cứng cho vòng lặp | §7 |

Môn mục tiêu: **Cấu trúc dữ liệu và Giải thuật**. Ngôn ngữ **không** khoá cứng —
tree-sitter phủ 13+ ngôn ngữ bằng một giao diện truy vấn, và phép đo độ phức tạp
hoàn toàn độc lập ngôn ngữ vì nó chỉ cần chạy được chương trình. Hiện thực và đo
trên **đúng hai ngôn ngữ** để chứng minh tính khái quát.

### 1.2 Cố ý KHÔNG trong phạm vi

- **Hỏi giảng viên bất cứ điều gì.** Không so sánh cặp, không phỏng vấn, không
  buổi chấm mẫu. Hệ thống **bày ra** chỗ nó chưa chắc tại trang kiến thức, và
  giảng viên chủ động sửa khi họ muốn — khác hẳn với việc hệ thống chất vấn họ.
- **Suy ngược luật từ điểm giảng viên đã sửa.** Kiến thức được nhập thẳng ở dạng
  luật, không hồi quy ra từ hành vi. Xem hộp cảnh báo ở §2.1.
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
| `evidence-check.ts` (đối chiếu trích dẫn nguyên văn) | **Giữ** cho lỗi do LLM kết luận |
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

### 2.1 Chấm bằng bảng lỗi, không bằng danh sách tiêu chí

**Rubric là một bản nén mất mát.** "Cài đặt đúng thuật toán sắp xếp — 3 điểm" không
nói: dùng `sort()` của thư viện có tính không, sai ở mảng rỗng trừ bao nhiêu, thiếu
một bước trừ bao nhiêu, chạy đúng nhưng O(n²) thì sao. Giảng viên biết cả bốn,
nhưng đó là tri thức ẩn và họ chưa từng phải viết ra.

**Đơn vị chấm đổi từ TIÊU CHÍ sang LỖI.** Nghiên cứu về rubric nói thẳng: năng lực
không phải tổng của các thành phần đơn giản, nên duyệt từng ô rồi cộng lại không
phải cách chuyên gia chấm. Thứ giảng viên thật sự tích luỹ sau nhiều năm là một
**bảng lỗi kèm mức trừ**, mọc lên trong lúc chấm chứ không viết ra trước.

Kéo theo một đảo ngược: hệ thống hôm nay **chấm cộng**, mỗi tiêu chí kiếm điểm từ
0 đi lên. Đổi sang **chấm trừ**:

```
điểm = điểm tối đa − Σ mức trừ của các lỗi chẩn đoán được
```

Rubric, nếu còn, tụt xuống thành **trần điểm và bộ từ vựng mồi**. Nó không còn là
máy tính điểm.

#### Agent rút chuẩn từ đâu, không hỏi ai

Agent **điều tra tài liệu của phiên thi bằng chính bộ công cụ ở §3** mà nó dùng để
điều tra bài nộp.

| Nguồn | Cho ra cái gì |
|---|---|
| **Đáp án mẫu, đem CHẠY THẬT** | Hành vi chuẩn, độ phức tạp chuẩn, cấu trúc chuẩn. Bài sinh viên lệch khỏi chuẩn nào thì đó là một lỗi ứng viên |
| Đề bài | Ràng buộc tường minh: cấm dùng thư viện, đòi đạt O(n log n) |
| Gói test | Cái gì được coi trọng, qua tên nhóm và số ca mỗi nhóm |
| Gom cụm cả lô | Kiểu lệch lặp lại ở nhiều bài mà bảng lỗi chưa có |
| Bảng lỗi của giảng viên khác cùng môn | Giá khởi đầu cho người mới |

> **Đáp án mẫu hiện chỉ được nhét vào prompt làm văn bản tham chiếu. Nhưng nó là
> một CHƯƠNG TRÌNH.** Chạy nó qua sandbox thì mọi tính chất của nó thành một chuẩn
> ngầm, và mỗi kiểu lệch đo được khỏi chuẩn đó là một lỗi. Giảng viên không phải
> khai gì — họ đã khai bằng chính bài giải của mình. Đây là nguồn mạnh nhất trong
> cả hệ thống và đang bị bỏ phí hoàn toàn.

#### Giảng viên can thiệp ở tầng LUẬT, không ở tầng điểm

- Mặc định giảng viên **không làm gì**. Agent chấm rồi xuất điểm thẳng vào bảng
  điểm qua `GradeExport`.
- Mở lịch sử một bài thì thấy: agent chẩn đoán gì, luật nào đã áp, ra điểm bao nhiêu.
- Thấy vô lý thì họ sửa **luật đó**, tại trang kiến thức. **Không** sửa điểm bài đó.
- Hệ thống **áp lại luật mới ngay** cho mọi bài dính luật đó, trong lô hiện tại và
  mọi kỳ sau.

Đây là chỗ tiết kiệm thật, và nó không nằm ở tốc độ chấm: **sửa một dòng luật thì
N bài cập nhật theo.** Nó cũng khớp với cách giảng viên nghĩ — họ không nghĩ "bài
này đáng 6", họ nghĩ "dùng sort có sẵn không đáng trừ 3 điểm vì đề có cấm đâu".

> **KHÔNG suy ngược từ điểm đã sửa.** Một bản nháp của spec này từng đề xuất để
> giảng viên sửa điểm rồi hồi quy ra mức trừ từng lỗi. Đã bị bác bỏ, và bác đúng:
> một lần sửa điểm là **một con số** trong khi chẩn đoán là **một tập lỗi**, nên
> phép quy công vốn không xác định được khi hai lỗi luôn đi cùng nhau. Kiến thức
> phải được nhập thẳng ở dạng luật, không đoán ra từ hành vi.

#### Cái agent KHÔNG tự suy ra được

Agent rút ra được **lỗi là gì** gần như hoàn toàn tự động. Nó **không** rút ra được
**lỗi đó đáng trừ bao nhiêu** — mức nặng nhẹ là phán đoán sư phạm, không nằm trong
bất cứ tài liệu nào của phiên thi.

- Luật **chưa có giá chắc chắn** thì **không được tự quyết**. Bài dính luật đó bị
  gắn cờ, và trang kiến thức nêu rõ luật nào đang thiếu.
- Giảng viên điền giá **một lần, tại một trang**, thay vì sửa bốn mươi bài. Xong thì
  kiến thức thành vĩnh viễn, kỳ sau đề khác vẫn dùng lại được.
- Trước khi lưu một giá, giao diện **phải hiện rõ luật này đang ảnh hưởng bao nhiêu
  bài**. Một giá sai lan ra cả khoá là rủi ro nghiêm trọng nhất của hướng này.

**Giới hạn phải ghi vào báo cáo, không giấu:** khoá đầu tiên của một đề mới có bảng
lỗi gần rỗng, nên gắn cờ nhiều và giảng viên làm nhiều hơn. Lãi bắt đầu từ khoá
thứ hai. Đừng trình bày hệ thống như thể nó hiểu giảng viên ngay từ bài đầu tiên.

#### Bảng lỗi ghi thành FILE trong workspace, không nhét vào prompt

Bản nháp trước của spec này định tiêm cả bảng lỗi vào system prompt. **Sai, vì hai
lý do đã đo được trong chính repo này.**

- **Phá prompt caching.** Cache là khớp **tiền tố**, và ngưỡng tối thiểu để nó
  kích hoạt là **1024 token** (§15.0 của spec Plan 1). Bảng lỗi khác nhau theo
  từng giảng viên và lớn dần theo học kỳ, nên đặt nó trong tiền tố là trả giá đầy
  đủ cho **mọi** bài của **mọi** phiên.
- **Có trần, bảng thì không.** Bảng lỗi chỉ lớn lên. Prompt thì không.

Thay vào đó: **ghi bảng lỗi thành file trong workspace sandbox**, và agent đọc nó
bằng `read_file` như đọc bài nộp. Tiền tố prompt đứng yên, cache vẫn chạy, bảng
lớn bao nhiêu cũng được, và việc tra cứu trở thành **hành vi của agent** được dẫn
dắt bởi thứ nó vừa tìm thấy.

Hai nguồn, phân giải khác nhau nhưng cùng một định dạng file:

| Nguồn | Phân giải | Nội dung |
|---|---|---|
| Luật mồi | file đóng gói sẵn theo ngôn ngữ | Vốn từ ban đầu, dùng chung mọi giảng viên |
| Luật của giảng viên | dòng DB → ghi ra file lúc dựng workspace | Bảng lỗi riêng, có giá |

Nếu bảng vượt ngưỡng đọc hết được thì **truy hồi theo liên quan**, không đổ hết:
lọc theo những gì phép dò đã chạm tới, xếp theo độ cụ thể rồi tới độ mới, và
**cắt còn khoảng năm luật** — quá số đó thì phần thêm vào thôi được đọc.

> **Luật chưa chắc giá vẫn nằm trong file, nhưng đánh dấu rõ là chưa chắc.** Tồn
> tại để agent nhận ra lỗi và để giảng viên thấy nó ở trang kiến thức, **không**
> để tự quyết điểm. Đây là cùng một phân biệt với `unverified` ở §6.2.

#### Bảng lỗi khoá theo GIẢNG VIÊN, không bao giờ theo tên môn

Sau đợt cắt master data, **tên môn là văn bản tự do**. Hai giảng viên cùng gõ
"CTDL&GT" sẽ ra cùng một chuỗi, nên khoá bảng lỗi theo tên môn là để luật của
người này áp vào bài của người kia.

Khoá đúng: `unique(teacher_id, course_name, rule_key)` — cùng hình dạng với
`unique(teacher_id, name, version)` mà spec cắt master data đã chốt cho `rubric`.
Một hệ thống cùng công ty đã dính đúng lỗi này với cache khoá theo mã dự án trần,
và nó rò dữ liệu suy từ danh sách nhân sự giữa hai khách hàng không liên quan.

#### Nợ mang sang từ đợt chốt MỘT MÔN (2026-09-21)

Ràng buộc **một môn duy nhất** đã được xác nhận là ràng buộc của hệ thống, không
phải phạm vi của bản demo: hệ thống đi sâu vào CTDL&GT. Đợt dọn ngày 2026-09-21
đã bỏ "môn" khỏi mọi trang còn lại, nhưng **cố ý chừa `/teacher/rubrics`** cho
spec này, vì chính spec này định nghĩa lại rubric LÀ GÌ (§2.1: tụt xuống thành
trần điểm và bộ từ vựng mồi). Thiết kế lại trang đó hai lần là phí.

Hai việc phải quyết khi làm spec này:

1. **Trang `/teacher/rubrics` đang gợi ý mỗi MÔN một rubric** — nó dựng danh
   sách tên từ `classes.map((k) => k.courseName)`. Một môn thì nó gợi ý đúng
   một cái tên, mà cái tên đó là hằng số của cả hệ thống, nên gợi ý không mang
   tin gì. Cơ sở gợi ý mới nên là **loại kỳ thi** (Giữa kỳ / Cuối kỳ), hay bỏ
   hẳn gợi ý và chỉ còn nút tạo? Và trang này có còn tồn tại không, một khi
   rubric không còn là máy tính điểm?

2. **Khoá `unique(teacher_id, course_name, rule_key)` ở tiểu mục ngay trên.**
   Lập luận của nó vẫn đúng nguyên: `teacher_id` là ranh giới cách ly thật.
   Nhưng `course_name` giờ mang **cùng một chuỗi ở mọi dòng**, nên nó không
   phân biệt được gì — khoá thực tế là `unique(teacher_id, rule_key)`. Giữ
   `course_name` trong khoá chỉ có nghĩa nếu ràng buộc một môn được nới ra sau
   này, và lúc đó phải nới cùng lúc cả `class.course_name` lẫn
   `exam_session.course_name`, vì đợt 2026-09-21 đã chuẩn hoá toàn bộ dữ liệu
   cũ về một chuỗi.

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

> **Bảy là con số có lý do, và bảy phải là bảy thật.** Độ chính xác chọn công cụ
> của model tụt mạnh khi vượt khoảng **8 công cụ** — một hệ thống cùng công ty gọi
> đó là "vách đá 8 tool" và thiết kế mọi agent quanh nó. Hệ thống đó cũng cho một
> bài học ngược: bộ công cụ ghi trong tài liệu **không phải** phạm vi thật lúc
> chạy, vì một tập "thiết yếu" được hợp vào phía sau, nên agent được khai 7 công
> cụ thật ra thấy khoảng 40. **Không dựng cơ chế nào hợp thêm công cụ vào sau
> lưng.** Thêm công cụ thứ tám là một quyết định thiết kế, phải đo lại, không phải
> một dòng thêm vào mảng.

### 3.1 `run_scaled` — năng lực không thể thay bằng LLM hay unit test

Chạy bài với n tăng dần, đo thời gian, khớp đường cong tăng trưởng, kết luận lớp
độ phức tạp. Một bài **qua sạch mọi test** vẫn có thể là O(n²) khi đề yêu cầu
O(n log n). Bộ test không thấy vì kết quả vẫn đúng. LLM đọc tĩnh thì **đoán**, và
đoán sai thường xuyên. Chỉ chạy thật mới biết.

Tiền lệ học thuật: CASET (arXiv 2410.15419) phân loại bài nộp vào "rổ độ phức
tạp" bằng vết thực thi. Ta đi xa hơn một bước: **đưa kết quả đo vào làm bằng
chứng cho một lỗi trong bảng**, không chỉ để phân loại.

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

### 4.1 Mỗi LỖI chẩn đoán được mang nguồn gốc của nó

Đơn vị ở đây là **lỗi** theo §2.1, không phải tiêu chí. Mỗi lỗi agent kết luận là
có mặt trong bài đều mang theo nguồn gốc của kết luận đó:

```ts
interface DiagnosedError {
  ruleId: string;          // trỏ tới một dòng trong bảng lỗi
  deduction: number;       // mức trừ, lấy TỪ BẢNG, không do model đặt
  source: VerdictSource;
  toolCallIds: string[];   // bằng chứng, xem §5
}

type VerdictSource =
  | 'deterministic'   // test case, biên dịch, đo độ phức tạp — máy quyết
  | 'llm_with_tools'  // LLM kết luận, có trích dẫn lời gọi công cụ
  | 'llm_only';       // LLM đọc và phán đoán, không công cụ nào chống lưng
```

**Model không bao giờ đặt `deduction`.** Nó chỉ kết luận lỗi có mặt hay không; mức
trừ đọc từ bảng lỗi. Đây là cùng một nguyên tắc với `enforceScoring()` hôm nay
(model phán đoán, code đếm), chỉ đổi thứ được đếm từ tiêu chí sang lỗi.

### 4.2 Trần confidence theo nguồn gốc, KHÔNG theo bậc model

Thay `min(guard, trần bậc)` bằng:

| Nguồn gốc | Trần confidence | Lý do |
|---|---|---|
| `deterministic` | **1,0** | Độ tin không đến từ model. Test chạy lại cho cùng kết quả |
| `llm_with_tools` | 0,85 | Model kết luận, nhưng mọi khẳng định trỏ tới lời gọi công cụ chạy lại được |
| `llm_only` | **trần của bậc model** (như hôm nay) | Không có gì chống lưng ngoài chính model |

Confidence của **cả bài** là trung bình có trọng số **theo mức trừ của từng lỗi**,
không phải giá trị nhỏ nhất. Một bài bị trừ 3 điểm do test quyết cộng 0,5 điểm do
LLM phán đoán không đáng bị kéo xuống mức của vế 0,5 điểm.

Thêm một điều kiện độc lập với nguồn gốc: **luật chưa có giá chắc chắn thì bài
dính nó không được tự duyệt**, dù nguồn gốc là `deterministic` (§2.1). Biết chắc
lỗi có mặt mà không biết nó đáng trừ bao nhiêu thì vẫn chưa chấm được.

> **Đây là thay đổi làm cho mục tiêu giảm tải khả thi về mặt số học.** Nếu phần
> lớn mức trừ của một môn do máy quyết thì đa số bài vượt ngưỡng tự duyệt mà không
> cần model mạnh nào. Tỉ lệ "bao nhiêu phần trăm mức trừ do máy quyết" đo được
> **ngay sau khi bảng lỗi có giá**, trước khi chấm bài nào, và nên là con số tiêu
> đề của cả đồ án.

### 4.3 Luật chống mâu thuẫn — giữ nguyên tinh thần spec autograder

Mọi nhóm test `passed === 0`, tức bài không chạy ra được gì, mà agent chỉ chẩn
đoán vài lỗi nhỏ vì **đọc** mã nguồn thấy có vẻ đúng → `flagged_for_review`, trần
0,5, kèm lý do.

**Không tự động cho 0 điểm.** Mức trừ là của giảng viên, nằm trong bảng lỗi; việc
của hệ thống là đặt mâu thuẫn trước mắt người chấm, không tự phân xử. Một bài
không chạy được vẫn có thể đạt những phần mà giảng viên tính điểm cho ý tưởng.

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
nhưng chỉ còn áp cho lỗi `llm_only`.

Màn hình lịch sử của giảng viên đọc thẳng từ đây: xem được agent đã chạy gì, thấy
gì, và vì sao kết luận vậy.

### 5.1 Phần tóm tắt do HARNESS render, không do model viết

Model chỉ sinh **verdict có cấu trúc**. Đoạn văn mà giảng viên đọc ở màn lịch sử
được **code render từ `toolCalls` thật**, không bao giờ là văn bản model tự mô tả
việc mình đã làm.

Không có ranh giới này thì model vẫn nói dối được về chính thứ công cụ đã trả về,
và mọi lớp chống bịa ở trên đều vô hiệu — vì chúng kiểm *verdict*, không kiểm
*lời kể*. Đây là bài học mượn từ một hệ thống khác trong công ty, nơi một agent
khẳng định "đã thêm 13 khoá vào cả 5 file" trong khi thay đổi thật chỉ thêm 11.

### 5.2 Đọc verdict — hai luật chống phán quyết ma

Lượt phản biện đo được **893 trên 1073 token đầu ra là reasoning**, nên đường trả
lời bị cắt cụt là chuyện sẽ xảy ra, không phải giả định.

1. **Thẻ suy luận không có thẻ đóng phải bị cắt tới hết chuỗi.** Một phản hồi bị
   cắt giữa chừng để lại phán quyết **nháp** trong phần suy luận, và bộ đọc chỉ
   biết tìm thẻ đóng sẽ trích nó ra như thật. Kết quả là một điểm bịa **không kèm
   tín hiệu lỗi nào** — lớp hỏng tệ nhất, vì không có gì để báo động.
2. **Nhiều phán quyết mâu thuẫn trong cùng một phản hồi → trả rỗng**, không bao
   giờ chọn lấy một cái. Chọn một là đoán, và đoán ở đây cho ra điểm của sinh viên.

Cả hai đi cùng `bad_output` đã có trong `provider-failure.ts`: rơi bậc ngay, vì
bậc đó *sống* nhưng *không dùng được*.

---

## 6. Phản biện — nhiều lăng kính, ba trạng thái

Thay `runAdvocate()` hiện tại. Ba ràng buộc, mỗi cái vá một lỗi thật:

1. **Không thấy lập luận của agent chấm.** Chỉ nhận đề bài, bảng lỗi, và **các
   toolCall thô**. Cho nó đọc văn bản lập luận là mời nó đồng ý.
2. **Được gọi công cụ của chính nó**, kể cả `probe` với input tự chọn. Đây là vế
   "bằng chứng khác" — không có nó thì đây lại là ý kiến thứ hai trên cùng dữ
   liệu, tức đúng lỗi đang có.
3. **Không bao giờ chạm vào điểm.** Giữ nguyên ba lớp chặn đang có: kiểu dữ liệu
   không có trường điểm, JSON schema không có, và trigger DB.

### 6.1 Bốn lăng kính thay một lượt hỏi chung chung

Một câu hỏi rộng kiểu "em ấy có đúng không" cho ra ý kiến rộng. Thay bằng bốn lượt
hẹp, **mỗi lượt săn một lớp khiếm khuyết**, chạy độc lập:

| Lăng kính | Câu hỏi nó phải trả lời |
|---|---|
| Tính đúng | Lỗi đã chẩn đoán có thật không, chứng minh bằng một lần chạy |
| Bỏ sót | Có lỗi nào agent chấm **không thấy** mà phép dò khác lộ ra không |
| Gian lận | Kết quả đúng có đến từ hard-code hay dò theo bộ test không |
| Quá tay | Mức trừ đã áp có nặng hơn bằng chứng thật sự cho phép không |

Mở đầu mỗi lăng kính là cùng một khung: *bạn đang xem một bài bạn không chấm và
không có lợi ích gì trong việc kết luận kia đúng; việc của bạn là **bác bỏ** nó,
không phải chấm điểm nó; một khẳng định mà lẽ ra bạn kiểm được bằng cách chạy mà
không chạy thì không được tính.*

### 6.2 Ba trạng thái — im lặng KHÔNG phải đồng ý

| Trạng thái | Khi nào | Xử lý |
|---|---|---|
| `refuted` | Một lăng kính bác bỏ được kết luận | Bỏ lỗi đó khỏi bảng điểm |
| `confirmed` | Lăng kính kiểm và xác nhận | Giữ nguyên |
| **`unverified`** | **Không lăng kính nào trả lời được** | Giữ lỗi, **hạ confidence**, gắn cờ |

**Ngữ nghĩa lỗi bất đối xứng, cố ý:** một lăng kính trả lời không đọc được thì coi
như **không có phát hiện** (thà im lặng còn hơn bịa ra một khiếm khuyết). Nhưng
một lượt phản biện trả lời không đọc được thì rơi vào **`unverified`**, **không
bao giờ** là `refuted` — chấm nó "đã bác bỏ" là âm thầm chôn một lỗi có thật.

Gộp `unverified` vào `confirmed` thì công bố kết luận chưa kiểm. Gộp vào `refuted`
thì giấu khiếm khuyết. Cả hai đều là cách một lượt phản biện hỏng biến thành điểm
sai mà không ai thấy.

### 6.3 Khuyến nghị, không chặn

Khoảng **một phần năm** phát hiện thô không sống sót qua phản biện, đo được trên
một hệ thống cùng công ty. Một cổng chặn có tỉ lệ báo động giả như vậy sẽ bị tắt
đi, và lúc đó nó bảo vệ được 0%.

**Khi bất đồng:** gắn cờ **đúng lỗi đó**, không gắn cờ cả bài. Một bài có 6 lỗi mà
lệch ở 1 thì giảng viên chỉ cần nhìn 1.

> Hai agent cùng dòng model đồng ý với nhau **không** phải bằng chứng. Nếu hai
> bậc trong `TierChain` là hai model cùng họ, phải ghi rõ trong báo cáo rằng phép
> phản biện ở cấu hình đó chỉ đo nhiễu, không đo thiên lệch.

> ⚠️ **Lăng kính phải chạy trên MỌI đường chấm, không riêng đường agent.** Một hệ
> thống cùng công ty có lớp chống ảo giác chỉ gắn vào một nhánh định tuyến, nên
> đúng nhánh ghi dữ liệu lại không có lớp kiểm nào. Và mỗi lăng kính phải có test
> khoá lại: hệ thống đó cũng có một hàm bảo vệ chống leo thang đặc quyền **chưa
> bao giờ được gọi**, chỉ tồn tại trong file spec của chính nó.

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

### 7.1 Chống trùng theo TÊN CỘNG THAM SỐ, không theo tên

Agent điều tra **sẽ** chạy lại cùng một phép dò. Khoá chống trùng là
`{tên}::{chữ ký tham số đã sắp đệ quy}`, nên `{n:100,lang:'py'}` và
`{lang:'py',n:100}` là một.

**Khoá chỉ theo tên là sai và đã có tiền lệ đo được** ở một hệ thống cùng công ty:
nó chặn mất truy vấn hàng loạt hợp lệ, và model sau đó báo cáo phần bị chặn là
"không tìm thấy" — tức một cơ chế tiết kiệm biến thành một nguồn dữ liệu sai.

Hạn mức phân tầng, vì các công cụ không cùng bản chất:

| Nhóm | Số lần cùng chữ ký | Lý do |
|---|---|---|
| `run_scaled` | 12 | Đo độ phức tạp **phải** chạy nhiều n, đó là cách nó hoạt động |
| `probe`, `run` | 8 | Thu hẹp dần về ca lỗi nhỏ nhất cần nhiều lượt |
| `read_file`, `ast_query` | 4 | |
| Còn lại | 2 | |

Chạm hạn mức trả về một chuỗi nói rõ đã bị chặn, **không** ném lỗi. Nếu agent bị
chặn ≥3 lần liên tiếp thì huỷ vòng lặp: nó đang kẹt, không đang đào sâu.

### 7.2 Ngắt sớm khi treo, tách khỏi trần thời gian

Trần 300 giây bắt được bài chạy lâu. Nó **không** phân biệt được chậm với chết.

Dấu hiệu chết: **đã qua 2 vòng, chưa gọi công cụ nào, và đã trôi quá 60 giây.**
Một agent điều tra thật sự thì gọi công cụ ngay vòng đầu; hai vòng im lặng nghĩa
là model đang kẹt chứ không đang suy nghĩ. Ngắt, chấm với dữ liệu đã có, ghi lý
do vào `investigation.budget`.

### 7.3 Xoay model ở tầng VÒNG LẶP, không ở tầng provider

`TierChain` hiện xoay bậc **bên trong một lời gọi** `provider.grade()`. Đủ cho
lượt chấm một phát, **không đủ cho vòng điều tra**: một bậc chết ở lời gọi thứ
mười sẽ mất toàn bộ lịch sử công cụ đã chạy, và chấm lại từ đầu là trả tiền hai
lần cho cùng một bài.

Vòng lặp phải bắt được lỗi bậc, chọn bậc khác qua pool kèm danh sách loại trừ,
rồi **chạy tiếp với nguyên lịch sử `toolCalls`**. Lý do đặt ở tầng này chứ không
tầng provider: **vòng lặp mới là nơi giữ trạng thái**, provider thì không biết gì
về những gì đã chạy. Lượt xoay bậc **không** tiêu một lần trong trần số vòng lặp.

Giữ nguyên `TierChain`, phân loại lỗi ba rổ và circuit breaker — đây là một lớp
**thêm vào bên trên**, không thay thế.

---

## 8. Chỗ "train" hợp lý duy nhất

Không train model chấm. Train một model nhỏ **trên đặc trưng** để dự đoán *"bài
này hệ thống có nên tự quyết không"*:

- Đầu vào: tỉ lệ test qua, độ lệch giữa độ phức tạp đo được và yêu cầu, số bước
  điều tra đã dùng, mức bất đồng với agent phản biện, tỉ lệ lỗi `llm_only`, số
  luật chưa chắc giá đã áp.
- Nhãn: sau khi xem bài này, giảng viên **có can thiệp không** — sửa luật, hoặc
  đánh dấu ngoại lệ. Thu được miễn phí từ việc dùng bình thường.
- Mô hình: hồi quy logistic hoặc gradient boosting. Chạy tốt với ~200 mẫu.
- Dùng để: quyết ngưỡng tự duyệt theo từng giảng viên, thay một hằng số 0,85 chung.

> **Đây KHÔNG phải là suy ngược luật từ hành vi, và ranh giới đó phải giữ chặt.**
> Model này không bao giờ đặt, sửa, hay đề xuất **mức trừ** của bất kỳ luật nào —
> mức trừ chỉ đến từ bảng lỗi mà giảng viên nhập (§2.1). Nó chỉ trả lời một câu
> hỏi khác hẳn: *lần này có nên im lặng hay nên gắn cờ*. Lẫn hai việc đó là quay
> lại đúng thứ đã bị bác bỏ.

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
| **T-ADV-2** | Bất đồng gắn cờ **đúng lỗi đó**, không gắn cờ cả bài | unit |
| **T-ADV-3** | Ba lớp chặn điểm của agent phản biện vẫn còn nguyên | e2e |
| **T-IMM-1** | `investigation` nằm trong trigger bất biến, không sửa được sau khi chấm | e2e |
| **T-SBX-1** | Sandbox chết → `unavailable`, **không** thành "bài làm sai" | unit |
| **T-POL-1** | Sửa **một** luật → mọi bài trong lô dính luật đó được tính lại ngay | e2e |
| **T-POL-2** | Luật chưa có giá chắc chắn → bài dính nó **không** tự duyệt, bị gắn cờ | unit |
| **T-POL-4** | Chuẩn rút từ đáp án mẫu **chạy thật**, không từ đọc văn bản của nó | integration |
| **T-POL-5** | Trước khi lưu một giá, trả về đúng số bài mà luật đó đang ảnh hưởng | unit |
| **T-POL-6** | Sửa điểm một bài lẻ được đánh dấu ngoại lệ và **không** sinh ra luật nào | e2e |
| **T-AG-4** | Chống trùng khoá theo tên **cộng tham số**: cùng tên khác tham số **không** bị chặn | unit |
| **T-AG-5** | Bị chặn trùng 3 lần liên tiếp → huỷ vòng lặp, không chạy tiếp | unit |
| **T-AG-6** | 2 vòng, 0 lời gọi công cụ, quá 60s → ngắt sớm, vẫn chấm với dữ liệu đã có | unit |
| **T-AG-7** | Bậc model chết giữa vòng → xoay bậc, **giữ nguyên lịch sử toolCalls**, không tiêu một vòng lặp | unit |
| **T-AG-8** | Đoạn tóm tắt ở màn lịch sử do harness render; văn bản model **không** đi thẳng ra | unit |
| **T-PARSE-1** | Thẻ suy luận **không có thẻ đóng** → cắt tới hết chuỗi, không trích phán quyết nháp | unit |
| **T-PARSE-2** | Hai phán quyết mâu thuẫn trong một phản hồi → trả rỗng, **không** chọn một cái | unit |
| **T-ADV-4** | Lăng kính trả lời không đọc được → **không có phát hiện** | unit |
| **T-ADV-5** | Lượt phản biện trả lời không đọc được → **`unverified`**, tuyệt đối không `refuted` | unit |
| **T-POL-7** | Hai giảng viên khác nhau, cùng bảng lỗi khác nhau → **tiền tố prompt giống hệt** (cache còn sống) | integration |
| **T-POL-8** | Hai giảng viên cùng gõ một tên môn → luật của người này **không** áp vào bài người kia | e2e |
| **T-POL-3** | Lỗi phát hiện được bằng test → verdict lấy từ test, **không** hỏi model | unit |

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
