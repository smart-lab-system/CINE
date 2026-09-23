# Giao diện chấm điểm theo bảng lỗi — thiết kế

**Ngày:** 2026-09-23 · **Trạng thái:** spec · mockup mục 3.1–3.6 đã duyệt, mục 3.7–3.10
chờ duyệt · chưa implement
**Sửa đổi:** 2026-09-23, lần 1 — thêm bốn màn: chuẩn bị chấm (mục 3.7), đang chấm và sự
cố giữa chừng (3.8), kiểm mẫu (3.9), chốt điểm (3.10); đóng bốn câu hỏi cũ, mở bốn câu
mới (mục 5)
**Sửa đổi:** 2026-09-23, lần 2 — chỉ đề bài là bắt buộc: mục 3.7 dựng gói test thay vì
chặn; đóng mọi câu hỏi ở mục 5.2 cũ
**Phụ thuộc:** `2026-09-20-grading-agent-investigator-design.md` — spec này là mặt
giao diện của spec đó, và dùng lại số mục của nó.
**Quy ước:** ký hiệu **§** luôn trỏ vào spec chấm điểm (§2.2, §4.4, §13…); mục của chính spec
này viết là **mục n**.
**Thay một phần:** `2026-09-16-grading-ui-design.md` — xem mục 0.2.
**Mockup:** canvas "Chấm điểm — mockup UI mới" (artifact riêng tư của chủ dự án). Spec
này phải tự đứng được khi không mở được link đó.

---

## 0. Vì sao thay toàn bộ, và vì sao thay TỪNG MÀN

### 0.1 UI cũ không vá được

Khu rubric và chấm điểm hôm nay là khoảng **3.500 dòng trong 23 file**, dựng quanh
đúng những thứ spec chấm điểm thay thế:

| Thành phần cũ | Dựa trên | Spec chấm điểm thay bằng |
|---|---|---|
| `CriterionCard`, `ManualCriterionCard`, `MatrixTable` | Chấm **cộng** theo tiêu chí | Chấm **trừ** theo lỗi (§2.1) |
| `CriterionAdjustPanel`, `BulkActionBar` | Giảng viên **sửa điểm** hàng loạt | Giảng viên **sửa luật**, không sửa điểm (§2.1) |
| `AdvocatePanel` | `runAdvocate()` cũ | Bốn lăng kính, ba trạng thái (§6) |
| `ConfidenceTiles` | `min(guard, trần bậc)` | Trần theo nguồn gốc (§4.2) |
| `RubricEditor` | Rubric là máy tính điểm | Rubric chỉ còn là trần điểm (§2.1) |

### 0.2 Quan hệ với spec UI 2026-09-16

| Mục của spec 2026-09-16 | Số phận | Vì sao |
|---|---|---|
| 3 — Hệ thiết kế, không quyết định mới nào | **Giữ nguyên** | Vẫn đúng từng dòng. Spec này cũng không thêm token nào |
| 3.2 — Copywriting: ngôn ngữ khảo thí, không phải ngôn ngữ hệ thống | **Giữ, và mở rộng** ở mục 2.2 | Spec chấm điểm đẻ ra nhiều thuật ngữ mới hơn |
| 3.3 — Panel chưa có backend phải đánh dấu | **Giữ nguyên** | Áp cho mọi khối ở mục 3 chưa có route |
| 5.2 — Tô sáng dẫn chứng: server định vị, client chỉ vẽ | **Giữ nguyên** | Lỗi do mô hình kết luận vẫn trích dẫn nguyên văn (§2 spec chấm điểm giữ `evidence-check.ts`) |
| 4 Điều phối · 5 Bàn chấm · 6 Ma trận | **Thay** bằng mục 3 dưới đây | Dựng trên tiêu chí và chấm cộng |
| 8, dòng đầu: *"Không tự duyệt hàng loạt theo độ tin cậy"* | **Gỡ** | §0.3 spec chấm điểm đã thay nguyên tắc "AI-assisted, not AI-only" bằng tự chủ phân bậc |
| 8, dòng *"Đoán cột MSSV/điểm khi xuất Excel"* | **Giữ**, thành luật 1 của §13.1 spec chấm điểm | Security rule 9 |

### 0.3 Thay từng màn, không xoá hết một lượt

Đường chấm mới phụ thuộc sandbox, mà rủi ro 1 của spec chấm điểm — chạy sandbox ở đâu
trên Railway — **chưa chốt**. Xoá hết UI cũ bây giờ thì hệ thống không còn màn chấm
nào trong một khoảng không biết bao lâu, và các route cũ nằm mồ côi.

**Luật:** mỗi bước ở §9 spec chấm điểm ship kèm màn mới **và xoá màn cũ tương ứng
trong cùng một PR**. Không màn nào chạy hai đường dữ liệu cùng lúc. Bảng xoá ở mục 4.

---

## 1. Bản đồ màn

| Màn | Route đề xuất | Thay màn cũ | Bước §9 |
|---|---|---|---|
| Bảng lỗi | `/teacher/rules` | `/teacher/rubrics` | 3 |
| Tạo / sửa một luật | `/teacher/rules/new`, `/teacher/rules/[ruleId]` | — | 3 |
| Chuẩn bị chấm | `/teacher/grading?session=…` khi phiên chưa có bài nào được chấm (mục 3.7) | `GradingReferenceDialog` · nút bắt đầu chấm cũ | 3 |
| Đang chấm | cùng route, khi còn bài đang chấm (mục 3.8) | thanh tiến độ và nút *chấm lại bài treo* cũ | 3 |
| Danh sách bài của phiên | `/teacher/grading?session=…` | `/teacher/grading` · `/teacher/grading/matrix` | 3–4 |
| Hồ sơ một bài | `/teacher/grading/[resultId]` (giữ URL cũ) | `/teacher/grading/[resultId]` | 3 |
| Khối phản biện trên hồ sơ | — | `AdvocatePanel` | 6 |
| Kiểm mẫu một bài | `/teacher/grading/[resultId]`, trạng thái riêng (mục 3.9) | — | 7 |
| Chốt điểm phiên | `/teacher/grading/finalize?session=…` (mục 3.10) | `FinalizeGradesButton` | 3–4 |
| Ghi điểm vào sổ điểm | `/teacher/grading/export?session=…` | — | dự kiến (§13 spec chấm điểm) |

Giữ URL `/teacher/grading/[resultId]` để link cũ không gãy. Mục điều hướng "Rubric"
đổi thành "Bảng lỗi"; `/teacher/rubrics` chuyển hướng sang `/teacher/rules`.

**Một route, ba trạng thái.** `/teacher/grading?session=…` tự chọn màn theo dữ liệu, nên
giảng viên không phải nhớ mình đang ở bước nào: chưa có dòng `grading_result` nào →
chuẩn bị chấm; còn dòng ở `ai_grading` → đang chấm, kèm lối sang các bài đã xong; hết →
danh sách bài. Trên canvas, bốn màn mới nằm ở hai hàng dưới cùng, nhưng theo luồng thì
chuẩn bị chấm và đang chấm đứng **trước** danh sách bài.

---

## 2. Luật chung cho mọi màn

### 2.1 Tám luật

1. **Không truyền tin chỉ bằng màu.** Mọi trạng thái và mọi nguồn gốc là **biểu tượng +
   chữ**. Trên biểu đồ, hai đường khác nhau bằng kiểu nét (liền/đứt) và nhãn, không chỉ
   bằng màu.
2. **Trống thì nói là trống, kèm hành động.** Không để một khối rỗng trông như bằng 0.
3. **Chữ mô tả việc agent đã làm do hệ thống viết từ các lời gọi thật** (§5.1 spec chấm
   điểm). Không đoạn văn nào của mô hình được hiện ra như sự thật.
4. **Thao tác ảnh hưởng nhiều bài phải xem trước tác động**: bao nhiêu bài, thuộc phiên
   nào, sau khi lưu thì chuyện gì xảy ra. Nút xác nhận nói luôn con số ("Lưu và tính lại
   7 bài").
5. **Điểm luôn đọc qua đúng một hàm "điểm hiện tại"** (rủi ro 14 spec chấm điểm). Không
   component nào đọc thẳng `ai_total_score` để hiển thị.
6. **Số theo kiểu Việt Nam:** dấu phẩy thập phân, `tabular-nums` ở mọi cột số. Làm tròn
   chỉ lúc ghi file (§13.1 luật 7).
7. **Kiểm ô nhập khi rời ô**, lỗi đứng ngay cạnh ô.
8. **Token có sẵn, không mã màu cứng** (mục 3 của spec 2026-09-16). Mockup dùng mã hex chỉ vì
   nó nằm ngoài app.

### 2.2 Bảng quy đổi lời văn — bổ sung cho mục 3.2 của spec 2026-09-16

| Trong code | Trên màn hình |
|---|---|
| `deterministic` | **Máy quyết** |
| `llm_with_tools` | **Mô hình + công cụ** |
| `llm_only` | **Chỉ mô hình** |
| `predicate` / luật có `predicate` | **máy kiểm được** |
| luật không `predicate` | **mô tả bằng lời** |
| `deduction = null` | **chưa có giá** |
| `ungradable` | **không chấm được** |
| `refuted` · `confirmed` · `unverified` | **bác bỏ** · **xác nhận** · **chưa kiểm được** |
| lăng kính (§6.1) | **góc kiểm** |
| sandbox | **môi trường chạy bài** |
| `run_tests` · `run_scaled` · `probe` · `ast_query` · `read_file` | **chạy gói test** · **đo độ phức tạp** · **dò biên** · **đọc cấu trúc mã** · **đọc file** |
| phiên bản bảng giá | **bảng giá ngày …** |

Tên công cụ **vẫn được hiện**, nhưng chỉ ở dòng phụ dạng mono trong đường điều tra —
cho người muốn kiểm lại — không bao giờ làm tiêu đề.

> **Mockup còn phạm luật này ở mấy chỗ**, cần sửa lời khi implement: nhãn nguồn gốc
> "Model + công cụ" và "Chỉ model"; chữ "sandbox" ở màn không chấm được; tên công cụ
> đứng đầu mỗi dòng ở đường điều tra; chữ "lăng kính" ở khối phản biện.

---

## 3. Từng màn

### 3.1 Bảng lỗi — `/teacher/rules`

Trang **kiến thức** của spec chấm điểm (§2.1). Nằm trên đường găng của bước 3: luật
chưa có giá thì không bài nào dính nó được tự quyết, nên thiếu màn này thì bước 3 chỉ
ra được bài gắn cờ.

- **Bốn ô tổng quan:** luật đã có giá (x / y) · **chưa có giá — đang chặn** (số luật, số
  bài chờ) · luật còn thiếu · **mức trừ do máy quyết** (con số tiêu đề của §4.2).
- **Bộ lọc:** tất cả · chưa có giá · máy kiểm được · mô tả bằng lời; kèm ô tìm.
- **Bảng luật:** tên lỗi (+ `ruleKey` và nguồn: của bạn / luật mồi) · tiêu chí · cách
  khớp · mức trừ hoặc nhãn *chưa có giá* · đang áp vào (số bài · số phiên) · nút *Đặt
  giá* (luật chưa có giá) hoặc *Sửa giá*.
- **Trần điểm theo tiêu chí:** khối bên phải. Đây là chỗ duy nhất rubric cũ còn lại —
  không có trang rubric riêng nữa.
- **Luật còn thiếu:** lỗi agent gặp mà không luật nào khớp (`T-RULE-1`). Mỗi thẻ nói rõ
  lỗi đó **đã bị loại khỏi điểm**, kèm *Tạo luật từ đây* / *Không phải lỗi*.

**Bảng đặt giá** (mở bên phải, không rời trang): ô mức trừ + trần của tiêu chí; khối
*"Lưu thì điều gì xảy ra"* — số bài theo từng phiên, bài nào đủ điều kiện tự quyết sau
khi lưu, bài nào vẫn chờ vì còn dính luật chưa có giá khác; và nếu có **bài đã chốt**
bị đổi điểm thì nói số bài đó và nói rằng mỗi bài sẽ có một dòng nhật ký (§2.2).

- Giá **cao hơn trần tiêu chí vẫn lưu được**, bài chỉ bị trừ tới trần — đúng số học §2.1.
  Gợi ý dưới ô nói điều này.
- Lưu một giá **sinh một phiên bản bảng giá mới** (§2.2), không sửa tại chỗ.

**Cần từ API:** danh sách luật kèm số bài và số phiên đang áp · xem trước tác động của
một giá (không ghi) · lưu giá · danh sách luật còn thiếu.

### 3.2 Tạo / sửa một luật — `/teacher/rules/new`, `/teacher/rules/[ruleId]`

Bốn khối theo đúng thứ tự giảng viên nghĩ: **lỗi là gì · thuộc tiêu chí nào · hệ thống
nhận ra bằng cách nào · mức trừ.** Mở từ *Luật còn thiếu* thì điền sẵn những gì agent
đã quan sát.

- **Cách nhận ra** là hai lựa chọn lớn, mỗi lựa chọn nói luôn hệ quả: *máy kiểm được* →
  nguồn gốc Máy quyết, độ tin tới 1,0; *mô tả bằng lời* → nguồn gốc Mô hình + công cụ,
  độ tin tối đa 0,85, góc kiểm soát lại.
- **Máy kiểm được** chọn từ **mẫu điều kiện có sẵn** (nhóm test trượt · mã gọi một hàm ·
  độ phức tạp vượt yêu cầu · không dùng đệ quy), có tham số. **Không viết code tự do**:
  mỗi mẫu được lập trình sẵn cho từng ngôn ngữ (rủi ro 10 spec chấm điểm).
- **Mức trừ để trống** = luật tồn tại, agent vẫn nhận ra lỗi, nhưng bài dính nó không tự
  quyết được.
- **Phạm vi** nói thẳng: mọi bài của giảng viên này, phiên đang chấm và các kỳ sau,
  không bao giờ áp sang bài của giảng viên khác.

**Khối "Lưu thì áp vào đâu"** hiện **bốn bậc** của §2.2, tô bậc của luật đang soạn, rồi
nội dung riêng cho bậc đó:

| Bậc | Màn hiện |
|---|---|
| 2 | Bảng các bài khớp, điểm hiện tại → sau khi lưu, kể cả bài chạm trần |
| 3 | Lời gọi công cụ sẽ chạy lại, cho bao nhiêu bài, ước lượng thời gian; *"trong lúc chạy, các bài hiện 'đang xét theo luật này'"* |
| 4 | Bảng phiên: phiên đã chấm → **không xét**; phiên chưa chấm → sẽ xét |

Đổi mẫu điều kiện có thể đổi bậc (mẫu *nhóm test trượt* → bậc 2; *mã gọi một hàm* →
bậc 3), và khối này đổi theo ngay. Nút lưu nói đúng hệ quả: *"Lưu và áp cho 3 bài"* /
*"Lưu và chạy lại cho 58 bài"* / *"Lưu luật — áp từ phiên chưa chấm"*.

**Cần từ API:** tạo / sửa luật · xem trước (bậc, bài khớp, ước lượng) · chạy lượt bậc 3.

### 3.3 Danh sách bài của phiên — `/teacher/grading?session=…`

Thay cho cả `/teacher/grading` lẫn `/teacher/grading/matrix`.

- **Đầu trang:** tên phiên + nút *Đổi phiên* · phòng, số bài nộp trên số sinh viên, giờ
  chấm xong · *Chốt điểm phiên* (mục 3.10) · *Chấm lại N bài lỗi hệ thống*, mang nhãn
  *cần backend* (mục 5.1, dòng 2). Không còn nút *Xuất điểm* ở đây: ghi điểm vào sổ
  điểm chỉ mở ra sau khi chốt (mục 3.10).
- **Thanh tổng quan:** một dải tỉ lệ kèm năm con số có biểu tượng — tự quyết · kiểm mẫu ·
  cần bạn xem · không chấm được · đang chấm.
- **Dòng nhắc đòn bẩy**, chỉ hiện khi đúng: *"8 trong 9 bài cần xem chỉ chờ bạn đặt giá
  cho 3 luật"* → nút sang Bảng lỗi. Đây là điểm khác cốt lõi so với UI cũ: một thao tác
  ở tầng luật gỡ được nhiều bài một lúc.
- **Bảng bài:** sinh viên (MSSV là link mở hồ sơ) · trạng thái · điểm (kèm *tạm tính* /
  *chưa có điểm*) · số lỗi đã trừ và số lỗi chờ giá · **vì sao cần bạn** (một câu). Mặc
  định sắp theo trạng thái: cần bạn và kiểm mẫu trước, tự quyết sau. Bài kiểm mẫu chưa
  kiểm hiện điểm là *ẩn* (mục 3.9).
- **Điểm tối đa phải đi kèm độ phủ** ("đã kiểm 6/6 nhóm test"), vì dưới chế độ chấm trừ,
  10 điểm không kèm độ phủ là đúng thứ §4.4 sinh ra để chặn.
- Phiên không áp một luật bằng lời thêm sau khi chấm thì hiện dòng *"Luật X thêm sau khi
  chấm — không xét trong phiên này"* (§2.2).

### 3.4 Hồ sơ một bài — `/teacher/grading/[resultId]`

- **Đầu trang:** MSSV + tên · nhãn trạng thái · phiên, phòng, giờ nộp, giờ chấm · mô hình
  đã chấm, kèm nhãn **"khác mô hình của lượt hiệu chỉnh gần nhất"** khi đúng (§8.2) · *Mở
  bài nộp* · *Đánh dấu ngoại lệ*.
- **Dải "cần bạn xem"** (chỉ khi có): nói lỗi nào chặn tự quyết, và **điểm còn có thể đổi
  tối đa bao nhiêu** (phần còn lại của tiêu chí đó).
- **Ô điểm:** con số + nhãn *tạm tính* / *đã xuất* + **phép tính đầy đủ**
  (`10,0 − 1,5 − 1,0 − 1,0 − 0,5 = 6,0`) + một câu: mức trừ lấy từ Bảng lỗi, mô hình
  không đặt con số nào.
- **Lỗi chẩn đoán được:** mỗi lỗi có tên, tiêu chí, nhãn nguồn gốc, **bằng chứng trỏ tới
  lời gọi cụ thể**, ghi chú *chạm trần* khi có, và hai hành động: *Sửa luật này* (sang
  Bảng lỗi) · *Bỏ lỗi này cho riêng bài này* (= ngoại lệ, thắng mọi lượt tính lại, §2.2).
- **Theo tiêu chí:** trần · bị trừ · còn, dòng chạm trần được đánh dấu bằng chữ.
- **Độ phủ điều tra:** gói test chạy mấy nhóm, mấy tiêu chí có lời gọi chạm tới, lời gọi
  chạy lại để đối chiếu có khớp không.
- **Độ phức tạp đo được:** bài nộp so với đề đòi, biểu đồ thời gian theo n (thang log),
  bài nộp nét liền, đáp án mẫu nét đứt, kèm tỉ số khi n gấp đôi.
- **Đường điều tra:** tóm tắt do hệ thống viết, rồi danh sách lời gọi mở ra được. Mỗi dòng
  đứng đầu bằng **tên việc theo bảng ở mục 2.2** ("chạy gói test"), tên công cụ ở dòng phụ, kết quả
  có biểu tượng + chữ, thời gian. Mở ra thấy đầu ra thật, kèm ghi chú cắt 8 KB khi có.

**Biến thể "không chấm được":** điểm hiện **"—"**, không bao giờ 0 hay điểm tối đa. Nói lý
do, nói **vì sao không cho điểm tạm** (chấm trừ + điều tra rỗng = điểm tối đa), nói đây là
lỗi phía hệ thống hay phía bài, và đưa lối đi tiếp: chấm lại bài này · chấm lại cả N bài
cùng lý do · chấm tay. Cột phải liệt kê những gì đã chạy, và nói rõ đọc được danh sách
file **không phải** là đã kiểm bài.

### 3.5 Khối lỗi khi có phản biện — bước 6

Cùng khối "Lỗi chẩn đoán được" ở §3.4, thêm cho mỗi lỗi một ô kết luận: **góc kiểm nào**
kết luận, kết luận gì, và **bằng chứng riêng của góc kiểm đó** (nó tự chạy công cụ, §6).

| Kết luận | Lỗi | Điểm | Giảng viên làm được |
|---|---|---|---|
| Xác nhận | Giữ | Trừ | Sửa luật |
| Bác bỏ | Gạch ngang | **Không trừ** | *Giữ lỗi này cho riêng bài này* (ngoại lệ) |
| Chưa kiểm được | Giữ | Trừ, **gắn cờ riêng lỗi đó** | Xem lời gọi · giữ · bỏ cho riêng bài này |

- *"Im lặng không phải là đồng ý"* (§6.2) được nói ngay trong ô *chưa kiểm được*.
- Góc kiểm **bỏ sót** chỉ **gợi ý**: không tự trừ điểm, đưa lỗi đó vào *Luật còn thiếu*.
- Góc kiểm **gian lận** không tìm ra gì thì vẫn hiện *"không phát hiện gì"* kèm việc nó đã
  thử — để người đọc biết nó **đã chạy**.
- Một dòng đầu khối nói bậc chấm và bậc phản biện có cùng họ mô hình không. Cùng họ thì
  dòng đó thành **cảnh báo** (§6.3): phản biện khi đó chỉ đo nhiễu.

### 3.6 Ghi điểm vào sổ điểm — dự kiến, `/teacher/grading/export?session=…`

Mặt giao diện của §13 spec chấm điểm. Mang nhãn *Tính năng dự kiến* cho tới khi có
service. Ba bước:

1. **Tải file sổ điểm của trường** (`.xlsx`, `.csv`; chọn trang tính nếu có nhiều).
2. **Chọn cột** — cột MSSV · cột ghi điểm · cột ghi lý do ô trống (**tuỳ chọn**, mặc định
   *Không dùng*). **Không cột nào được chọn sẵn**, kể cả khi tiêu đề ghi rõ "Mã SV". Bảng
   xem trước tô cột đã chọn bằng màu **và** nhãn chữ. Chọn cột điểm đã có giá trị thì cảnh
   báo số ô sẽ bị ghi đè.
3. **Xem trước & xuất** — ba con số (ghi điểm · để trống · không khớp) · nút *Tải bảng kê
   ô trống theo lý do* · chọn làm tròn (0,1 / 0,25 / 0,5, nửa lên, *được ghi vào bản ghi
   lượt xuất*) · bảng từng dòng: dòng file, MSSV, họ tên, điểm hệ thống, **giá trị sẽ ghi**,
   ghi chú.

**Xuất lại** (đã xuất trước đó, có điểm đổi):
- Một dải nói, **so theo giá trị đã làm tròn**, bao nhiêu bài **giảm** và bao nhiêu bài
  **tăng**, kèm **luật nào** gây ra từng chiều.
- Dòng đổi ghi rõ chiều bằng mũi tên **và** chữ (*"↓ Giảm — trước đã ghi 7,5, do luật…"*).
- Ô đã ghi lần trước mà bài giờ chưa xong được **giữ nguyên**, ghi chú nói là giữ.
- Nút xuất lại **khoá** cho tới khi giảng viên tích *"Tôi đã xem N bài bị giảm điểm và đồng
  ý ghi"*.

### 3.7 Chuẩn bị chấm — `/teacher/grading?session=…`, khi phiên chưa có bài nào được chấm

Thay `GradingReferenceDialog` và nút bắt đầu chấm cũ. Mockup có năm tình huống: *chỉ có
đề* · *có đáp án, thiếu gói test* · *bộ ca hệ thống sinh, chờ duyệt* · *lấy từ Soạn đề* ·
*đã khoá*.

**Chỉ đề bài là bắt buộc** (chốt 2026-09-23, §2.1 *Khi giảng viên chỉ có đề*). Thiếu đáp
án mẫu hay gói test thì hệ thống dựng giúp một lần, giảng viên duyệt, và cả phiên được đo
bằng cùng một bộ đó.

**Luồng hiện tại vẫn đi qua bước này, bằng hai cửa**, và cả hai ghi vào cùng một dòng
`grading_reference` (một phiên một bản, `uq_grading_reference_session`):

| Cửa | Đường | Ghi gì |
|---|---|---|
| Giảng viên tự khai | `PUT /exam-sessions/:id/grading-reference` (dialog cũ) | Đề bài (chọn trong tài liệu của phiên), đáp án mẫu (upload presigned dưới `grading-reference/`), ghi chú |
| Soạn đề | `POST /exam-authoring/attach`, gọi thẳng `GradingReferenceService.upsert` | Như trên, kèm cờ `model_answer_unverified` khi bộ đề chưa `passed` |

Nên màn này phải nói **nguồn** của từng tài liệu (*"bạn tải lên lúc 08:14"* / *"gắn từ
Soạn đề lúc 08:05"*), không chỉ nói có hay không.

- **Bốn dòng:** đề bài · đáp án mẫu · gói test · ghi chú chấm. Mỗi dòng nói nó cho hệ
  thống cái gì (bảng *Agent rút chuẩn từ đâu* ở §2.1).
- **Đề bài không chọn sẵn file nào**, kể cả khi tên file trông hiển nhiên — giữ nguyên
  luật của dialog cũ.
- **Đáp án mẫu mang cờ `model_answer_unverified`** → băng vàng nói đúng hậu quả (mục 4.1
  của spec soạn đề), và nút *Chạy thử đáp án mẫu với gói test* mang nhãn *cần backend*
  (cần sandbox). Không chặn bắt đầu, nhưng phải tích một ô xác nhận rằng mọi bài của
  phiên sẽ mang cảnh báo này. Lần nhắc thứ hai — lần đầu ở lúc gắn đề — là có chủ đích:
  bắt đầu chấm là lúc tài liệu khoá lại, nên là lần cuối còn sửa được.
- **Thiếu gói test thì màn này dựng giúp, không chặn cụt.** Khối *Gói test* đưa ra đúng
  một hành động chính, tuỳ giảng viên có gì: *Sinh đáp án mẫu và gói test từ đề*, hoặc
  *Sinh gói test từ đáp án của bạn*. Tải gói test lên vẫn là lối phụ. Cả ba mang nhãn *cần
  backend*: `grading_test_bundle` vẫn nằm trên nhánh autograder chưa merge.
- **Bộ ca sinh ra hiện thành bảng để duyệt:** nhóm · input · output mong đợi · **kiểm câu
  nào trong đề** (trích nguyên văn) · *Bỏ ca này*. Ca tự bỏ vì không trỏ được về đề vẫn
  hiện, gạch ngang, kèm lý do (*"đề ghi 1 ≤ n"*) — để giảng viên thấy hệ thống đã lọc gì.
  Một đoạn nói thẳng giới hạn: đáp án và gói test cùng do hệ thống viết thì *khớp nhau*
  chưa phải là *đúng*; bộ ca chỉ thành thước khi giảng viên duyệt.
- **Nút bắt đầu tắt cho tới khi bộ ca được duyệt**, và dòng lý do nói bước tiếp theo nằm
  ở đâu trên cùng màn. Nút duyệt nói con số (*"Dùng 22 ca này làm gói test"*).
- **Canh thước sau khi chấm** (§2.1): ca nào vượt ngưỡng trượt thì danh sách bài hiện cảnh
  báo ở cấp ca, kèm *giữ* / *bỏ ca này*. Mockup chưa vẽ khối này.
- **Cột *Trước khi bắt đầu*:** trần điểm · đề · đáp án · gói test · bảng lỗi (luật chưa
  có giá **không** chặn, chỉ báo trước rằng bài dính luật đó sẽ vào nhóm cần xem) · số bài
  sẽ chấm (bài `invalid` không được chấm, và nói ra con số).
- **Nút bắt đầu nói con số** (*"Bắt đầu chấm 40 bài"*); dòng dưới nói hậu quả: tài liệu
  chấm và trần điểm khoá lại, đóng trang không dừng việc chấm.
- **Đã khoá:** mọi dòng chỉ xem; băng nói giờ khoá và lý do — cùng lý do mà
  `assertNotGradedYet` ghi trong code.
- Giữ luật **chỉ gửi trường đã đổi** của dialog cũ: DTO phân biệt *không gửi* (giữ),
  `null` (xoá) và giá trị (đặt).
- Mục 4.1, lớp 3 của spec soạn đề: phiên mang cờ `model_answer_unverified` thì **mọi**
  dòng ở danh sách bài và **mọi** hồ sơ một bài đều hiện cảnh báo. Mockup của hai màn đó
  chưa vẽ dòng này.

### 3.8 Đang chấm và sự cố giữa chừng — cùng route, khi còn bài đang chấm

Mockup có năm tình huống: *bình thường* · *mất mạng ở máy bạn* · *máy chủ không trả lời*
· *dịch vụ AI lỗi* · *bài bị treo*.

- **Số liệu lấy từ `GET /exam-sessions/:id/grading-progress`**, vốn đếm `grading_result`
  theo phiên, nên đúng ngay từ lúc bắt đầu và còn nguyên khi Redis mất. Thanh tiến độ bốn
  phần: đã có kết quả · đang chạy · chờ lượt · dừng (lỗi hệ thống hoặc bị treo). Hai phần
  cuối khác nhau bằng hoa văn và nhãn, không chỉ bằng màu.
- **Tốc độ và thời gian còn lại là số đo được**, ghi rõ là ước tính và đo trên khoảng
  nào. Không ước được thì nói là không ước được.
- **Khối *Đang chạy ngay lúc này*:** mỗi bài một dòng — bước hiện tại (tên việc theo bảng
  ở mục 2.2), tên công cụ ở dòng phụ, số lời gọi trên trần, thời gian đã chạy. Mở một dòng
  ra thì thấy những gì đã chạy, do hệ thống ghi từ các lời gọi thật (luật 3). **Cần
  backend:** hôm nay tiến độ chỉ đếm số bài. Đề xuất: worker gọi
  `job.updateProgress({ call, maxCalls, tool })` sau mỗi lời gọi công cụ — BullMQ có sẵn,
  không cần bảng mới — và `grading-progress` trả thêm các job đang chạy **của đúng phiên
  đó**, lọc theo danh sách bài của phiên. Không trộn job của phiên khác, cùng lý do route
  này đã tách `queue` khỏi `byStatus`.
- **Giảng viên mở được bài đã xong ngay trong lúc chấm**, không phải đợi hết lượt.

**Luật chung cho năm tình huống:** mỗi băng nói **cái gì hỏng** (máy bạn · máy chủ · dịch
vụ AI · hàng đợi) và **bài làm có bị ảnh hưởng không**. Không băng nào chỉ ghi *"đã xảy ra
lỗi"*.

| Tình huống | Trang biết bằng cách nào | Nói gì | Nút |
|---|---|---|---|
| Bình thường | `grading-progress` trả về đều | Tiến độ, tốc độ, ước tính | — |
| Máy giảng viên mất mạng | `navigator.onLine = false`, hoặc request hỏng ở tầng mạng | Việc chấm vẫn chạy trên máy chủ, không bài nào bị ảnh hưởng; số liệu mờ đi, kèm giờ của lần đọc cuối | Không có — không có gì để bấm |
| Máy chủ không trả lời | Mạng còn, nhưng request trả 5xx hoặc hết giờ nhiều lần liền | Không biết việc chấm có chạy tiếp không. Máy chủ về thì số liệu đếm lại từ DB; bài dở dang hiện ở dòng *bài bị treo* | *Thử lại ngay* |
| Dịch vụ AI lỗi | Nhiều bài hết lượt thử với cùng lớp lý do `system` trong một khoảng ngắn | Gom thành một băng: N bài dừng, mỗi bài đã thử 3 lần, lỗi hệ thống chứ không phải bài làm, chưa bài nào có điểm | *Chấm lại N bài* — **cần backend** (mục 8.1 của spec soạn đề) |
| Bài bị treo | Còn dòng ở `ai_grading` mà hàng đợi không còn job sống cho nó | N bài không còn ai chấm; tiến độ đã đứng yên bao lâu | *Chấm tiếp N bài treo* — **đã có** (`regrade-stuck`) |

**Bài dừng vì lỗi hệ thống không được đếm vào *đã có kết quả*.** Nó chưa có điểm nào. Hôm
nay `markUngradable` ghi nó vào `flagged_for_review`, cùng trạng thái với một bài bị gắn
cờ thật, nên `progress()` đang đếm nó là *xong*. Cần một lớp lý do đọc được bằng máy trên
`ungradable_reason` (§4.4 ghi vì sao). **Cần backend.**

### 3.9 Kiểm mẫu một bài — bước 7 (§8.1)

Mockup có hai bước: *bạn xem bài* · *so với hệ thống*. Luồng này hôm nay chưa có dòng code
nào.

**Điều duy nhất từng chặn việc thiết kế màn này là câu hỏi cũ:** có nói cho giảng viên
biết đây là bài kiểm mẫu không. Hai lối cực đoan đều hỏng:

- **Giấu nhãn**, cho bài kiểm mẫu đứng lẫn với bài cần xem: phải bịa một lý do *vì sao
  cần bạn*, trái luật 3; và giảng viên sẽ đi tìm cái lỗi mà lý do bịa đó trỏ tới.
- **Nói nhãn và hiện luôn kết luận:** giảng viên có xu hướng xác nhận cái đang nằm trước
  mặt, và nhãn thu về lệch đúng về phía hệ thống — cái lệch mà §8.1 sinh ra để chữa.

**Chốt: nói thật là kiểm mẫu, nhưng giấu điểm và các lỗi của hệ thống cho tới khi giảng
viên ghi nhận xét.**

- **Rút mẫu:** N% số bài tự quyết (§8.1: 20% lúc đầu, sàn 5%), ngẫu nhiên, không dựa vào
  điểm, có ghi giờ rút. Giảng viên **không đổi được bài**: được chọn thì người ta chọn
  bài dễ.
- **Danh sách bài:** nhóm riêng *Kiểm mẫu*; cột điểm hiện *ẩn* — ẩn ở tầng API (response
  không chứa điểm), không chỉ ẩn bằng CSS. Không thì con số đã lọt ra trước khi mở hồ sơ.
- **Bước 1 — bạn xem bài:** đề bài và bài nộp; giảng viên chọn các lỗi từ **bảng lỗi của
  chính họ** (nhóm theo tiêu chí, kèm giá), và thêm được lỗi chưa có trong bảng. Bấm ghi
  thì nhận xét **khoá lại**, không sửa được nữa.
- **Bước 2 — so với hệ thống:** hai điểm đặt cạnh nhau (điểm của giảng viên tính bằng
  đúng số học §2.1 từ các lỗi họ chọn; lỗi chưa có giá thì không tính, và nói ra), rồi ba
  nhóm: *cả hai cùng thấy* · *chỉ hệ thống thấy* · *chỉ bạn thấy*. Mỗi bất đồng xử lý bằng
  thao tác đã có: chấp nhận · ngoại lệ cho riêng bài này · sửa luật · thêm luật mới.
- **Nhãn là tập lỗi ở bước 1**, so với tập lỗi của hệ thống, và được ghi **dù** bước 2
  chọn gì (§8.1).
- **Chặn chốt điểm** khi còn bài kiểm mẫu chưa kiểm (mục 5.1, dòng 6).
- **Cần backend** toàn bộ: cờ rút mẫu trên kết quả, bản ghi nhận xét bước 1, route trả hồ
  sơ ở dạng *đã ẩn kết luận*.

### 3.10 Chốt điểm phiên — `/teacher/grading/finalize?session=…`

Thay `FinalizeGradesButton`. Mockup có ba tình huống: *còn bài chưa xong* · *sẵn sàng* ·
*đã chốt*. Đã duyệt: chốt là **một thao tác riêng**, không gộp vào lượt ghi file.

- **Chốt là mốc công bố** — nói ngay ở đầu màn, cùng câu *"chốt không ghi file nào"*.
- **Chưa chốt được:** liệt kê từng nhóm đang chặn, mỗi nhóm một con số và một lối đi —
  cần bạn xem · kiểm mẫu chưa kiểm · không chấm được · đang chấm. Hôm nay
  `BLOCKS_FINALIZE` đã chặn `ai_grading`, `ai_graded`, `flagged_for_review`; bài không
  chấm được nằm ở `flagged_for_review` nên đã bị chặn sẵn. Kiểm mẫu phải thêm vào (cần
  backend).
- **Hộp xác nhận nói đúng hai con số**, giữ ý của nút cũ: *N bài theo điểm hệ thống tự
  quyết mà bạn chưa mở* · *M bài bạn đã xem*. Kèm hậu quả: từ lúc chốt, mọi thay đổi điểm
  đều vào nhật ký, kể cả khi đổi giá một luật làm điểm bài đã chốt đổi theo (§2.2).
- **Ghi điểm vào sổ điểm chỉ mở sau khi chốt** (mục 5.1, dòng 7): ghi file trước khi chốt
  là đưa ra ngoài một con số chưa công bố, và cờ *đổi sau lần ghi trước* của §13 sẽ báo cả
  những thay đổi bình thường trong lúc duyệt.

---

## 4. Xoá gì, lúc nào

Màn mới và việc xoá màn cũ đi **cùng một PR**. Cột "Trước khi xoá" là điều kiện cứng:
xoá khi nó chưa thoả là để lại một khoảng trống chức năng.

| File cũ (dưới `apps/web/src/app/teacher/`) | Bước | Trước khi xoá |
|---|---|---|
| `rubrics/page.tsx`, `rubrics/_components/RubricEditor.tsx` | 3 | Bảng lỗi có khối trần điểm; `/teacher/rubrics` chuyển hướng |
| `grading/[resultId]/page.tsx`, `_components/CriterionCard.tsx`, `_components/ManualCriterionCard.tsx` | 3 | Hồ sơ một bài chạy trên chẩn đoán |
| `grading/[resultId]/_components/AnswerPane.tsx` | 3 | **Rà trước khi xoá**: nếu nó chỉ là trình xem bài nộp kèm tô sáng dẫn chứng (mục 5.2 của spec 2026-09-16), dùng lại cho *Mở bài nộp* |
| `grading/[resultId]/_components/AdvocatePanel.tsx` | 6 | Khối phản biện mới |
| `grading/page.tsx`, `_components/ConfidenceTiles.tsx`, `ReadinessStrip.tsx`, `AnomalyPanel.tsx`, `ReviewWorkspace.tsx`, `SessionRubricCard.tsx`, `NotBuiltYetPanel.tsx` | 3–4 | Danh sách bài của phiên |
| `grading/_components/FinalizeGradesButton.tsx` | 3–4 | Màn chốt điểm (mục 3.10) chạy, với đúng hai con số của hộp xác nhận cũ |
| `grading/_components/GradingReferenceDialog.tsx` | 3 | Màn chuẩn bị chấm (mục 3.7) ghi được mọi trường dialog cũ ghi được — đề bài, đáp án mẫu, ghi chú — và giữ luật *chỉ gửi trường đã đổi* của nó |
| `grading/matrix/` (cả thư mục, gồm `fixtures.ts`) | 3–4 | Không có màn thay: sửa điểm hàng loạt trái với *"sửa luật, không sửa điểm"* |

Ngoài `app/`: `hooks/useGrading.ts`, `lib/api/grading.ts`, `lib/grading-groups.ts`,
`lib/grading-triage.ts` — rà theo từng màn, xoá phần không còn ai gọi. Không xoá theo tên
file; xoá theo việc còn ai import.

---

## 5. Câu hỏi

### 5.1 Đã đóng (2026-09-23)

| # | Câu hỏi | Kết quả |
|---|---|---|
| 1 | Giảng viên có được biết một bài là bài kiểm mẫu không | **Có**, nhưng kết luận của hệ thống ẩn cho tới khi họ ghi nhận xét — mục 3.9, §8.1 |
| 2 | Nút *chấm lại* ở màn không chấm được chưa có đường chạy | **Ghi chú, chưa quyết:** mục 8.1 của spec soạn đề. Nút mang nhãn *cần backend* cho tới khi chốt |
| 3 | Màn khai tài liệu chấm chưa có mockup | Mục 3.7. Luồng hiện tại **vẫn** đi qua bước này, bằng hai cửa |
| 4 | Chốt điểm nằm ở đâu | **Riêng**, không gộp vào lượt ghi file — mục 3.10 |
| 5 | Phiên không có gói test: chặn bắt đầu chấm? | **Không chặn.** Chỉ đề là bắt buộc; hệ thống dựng gói test, giảng viên duyệt — mục 3.7, §2.1. Đề xuất chặn ban đầu bị bác vì thực tế nhiều giảng viên chỉ có đề |
| 6 | Kiểm mẫu có chặn chốt điểm không | **Có** — mục 3.9. Không chặn thì người bận luôn bỏ qua, và N thực tế về 0. Cái giá: khoảng 5 bài cho một phiên 40 bài, mỗi bài tốn công hơn một bài cần xem |
| 7 | Ghi điểm vào sổ điểm chỉ mở sau khi chốt | **Có** — mục 3.10 |
| 8 | Backend cho màn đang chấm | **Làm**: tiến độ từng bài qua `job.updateProgress`, lớp lý do máy đọc được trên `ungradable_reason` — mục 3.8. Thiếu hai thứ này thì màn đó vẫn chạy được thanh tiến độ và các tình huống *mất mạng*, *máy chủ không trả lời*, *bài bị treo* |

### 5.2 Còn mở

1. **Ngưỡng canh thước** (§2.1): mặc định đề xuất 60% số bài trượt một ca, và các bài
   trượt vẫn qua 80% số ca còn lại. Hai con số này là đoán; cần số liệu của vài phiên thật
   để chỉnh, và mockup cho khối cảnh báo đó chưa vẽ.

---

## 6. Test giao diện

| Mã | Ca | Mức |
|---|---|---|
| **T-UI-1** | Mọi nhãn trạng thái và nguồn gốc có chữ; không nhãn nào chỉ có màu | unit (a11y) |
| **T-UI-2** | Bảng đặt giá hiện số bài bị ảnh hưởng **trước** khi lưu; nút xác nhận chứa đúng con số đó | unit |
| **T-UI-3** | Luật bằng lời thêm khi phiên đã chấm → danh sách bài của phiên hiện *"không xét trong phiên này"* | e2e |
| **T-UI-4** | Đoạn tóm tắt ở đường điều tra lấy từ trường do hệ thống viết, không từ văn bản mô hình | unit |
| **T-UI-5** | Bài không chấm được hiện "—", không bao giờ 0 hay điểm tối đa | unit |
| **T-UI-6** | Lỗi bị bác bỏ không có mặt trong phép tính điểm hiển thị | unit |
| **T-UI-7** | Bài có điểm tối đa luôn hiện độ phủ kèm theo | unit |
| **T-UI-8** | Màn xuất: không cột nào được chọn sẵn; xuất lại bị khoá khi còn bài giảm điểm chưa xác nhận | unit |
| **T-UI-9** | Không component nào đọc `ai_total_score` để hiển thị; mọi điểm đi qua hàm "điểm hiện tại" | unit (lint hoặc grep trong test) |
| **T-UI-10** | Khối nào dữ liệu chưa có route thì mang nhãn *cần backend* và không bấm được | unit |
| **T-UI-11** | Phiên chỉ có đề → nút bắt đầu tắt cho tới khi bộ ca được duyệt, dòng lý do chỉ tới khối *Gói test*; không request `start-grading` nào được gửi trước đó | unit |
| **T-UI-12** | Máy giảng viên mất mạng → băng *"việc chấm vẫn chạy trên máy chủ"*, số liệu kèm giờ của lần đọc cuối, không nút nào bấm được | unit |
| **T-UI-13** | Bài dừng vì lỗi hệ thống không được đếm vào *đã có kết quả* | unit |
| **T-UI-14** | Bài kiểm mẫu chưa kiểm: response API **không chứa** điểm lẫn lỗi của hệ thống — không chỉ ẩn ở giao diện | e2e |
| **T-UI-15** | Nhận xét bước 1 của kiểm mẫu đã ghi thì không sửa được, và vẫn được lưu dù bước 2 chọn gì | e2e |
| **T-UI-16** | Hộp xác nhận chốt điểm nói đúng hai con số, và hai con số cộng lại bằng số bài của phiên | unit |
| **T-UI-17** | Phiên có cờ `model_answer_unverified` → mọi dòng ở danh sách bài và mọi hồ sơ đều hiện cảnh báo | unit |
| **T-UI-18** | Bảng bộ ca sinh ra: ca nào cũng hiện câu đề nó kiểm; ca tự bỏ hiện gạch ngang kèm lý do, và không được tính vào số ca của nút duyệt | unit |
