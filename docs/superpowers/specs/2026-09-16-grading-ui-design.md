# Giao diện chấm điểm — thiết kế

**Ngày:** 2026-09-16 · **rev 1**
**Trạng thái:** chờ duyệt
**Nhánh nền:** `feature/grading-pipeline-hardening` (HEAD `209930f`)
**Bản mẫu bấm được:** https://claude.ai/artifact/1eARVjMh1B15SN9bKy2KjJ
**Đọc kèm:** `docs/grading-system-guide.md` §2 (sơ đồ, dấu ✗) và §11 (bảng "Cái CHƯA có")

---

## 0. Luận điểm

> **Backend đã biết nhiều hơn những gì màn hình chịu nói ra.**

Ba lượt phản biện, ba mức ngữ cảnh, một phép đối chiếu dẫn chứng chạy trên
100% số bài — tất cả đều đã chạy, đã có test, và **không có một pixel nào**
hiển thị chúng. Giảng viên hôm nay nhìn thấy đúng một con số điểm và một đoạn
text bằng chứng cụt lủn.

Hệ quả nặng nhất không phải thẩm mỹ. Nó là: **lượt phản biện (Advocate) chưa
chạy thật lần nào**, vì nó đòi có đề bài trong `grading_reference`, mà không
màn hình nào đặt được bản ghi đó. Tính năng được xây để bảo vệ sinh viên làm
đúng theo cách khác đang là code chết — về mặt vận hành, không phải về mặt test.

Tài liệu này thiết kế lớp giao diện làm hai việc, theo đúng thứ tự đó:

1. **Mở khoá** những gì backend đã làm được nhưng chưa ai chạm tới.
2. **Nén** một lớp 45 bài xuống thời gian một giảng viên thật sự có.

---

## 1. Hệ thống hôm nay — đã kiểm trực tiếp trên nhánh nền

### 1.1 Bốn route không có đường gọi từ UI

`GradingController` có 12 route; `apps/web/src/lib/api/grading.ts` biết 8.

| Route | Hệ quả khi thiếu UI |
|---|---|
| `PUT /exam-sessions/:id/grading-reference` | **Nghiêm trọng nhất.** Không đặt được đề bài ⇒ mọi phiên chạy ở mức `rubric_only` ⇒ lượt phản biện không bao giờ chạy |
| `POST /exam-sessions/:id/grading-reference/answer-key-upload` | Không nạp được đáp án mẫu |
| `GET /exam-sessions/:id/grading-readiness` | Giảng viên không biết mình đang chấm với bao nhiêu ngữ cảnh |
| `POST /exam-sessions/:id/regrade-stuck` | Bài kẹt ở `ai_grading` nằm im vĩnh viễn |

`grep -r "advocate\|readiness\|contextUsed" apps/web/src` trả về **0**.

### 1.2 Ba khoảng trống ở tầng đọc, không phải tầng ghi

Đây là phần mà §11 của `grading-system-guide.md` **chưa ghi**, phát hiện khi
dựng bản mẫu này:

**① `GradingResultView` không trả `advocateOpinion` và `contextUsed*`.**
Cột đã có trong DB, `gradeOne()` đã ghi (`grading.service.ts`, cùng một
`update()` với `ai_total_score`), nhưng `listForSession()` **không map chúng
ra**. Nghĩa là kể cả sau khi đặt được `grading_reference` và lượt phản biện
chạy thật, **UI vẫn không đọc được kết quả của nó**.

**② Không route nào trả về nội dung bài làm dạng text.**
`GET /submissions` trả `downloadUrl` — một presigned URL tới file `.docx`
**thô**. Đoạn text mà AI trích dẫn được sinh bởi `extractText()` ở server và
**không lưu ở đâu cả**. Không có nó, cột trái của Bàn chấm không tồn tại.

**③ `teacher_review` không có cột ghi chú nào.**
Entity có đúng `finalScore`, `editedCriteria`, `reviewedAt`, `teacherId`. Nên
"lý do sửa điểm", "ghi chú riêng", "nhận xét cho sinh viên" đều cần migration.

### 1.3 Một thứ đã sẵn sàng mà chưa ai dùng

`criterionResults[].check` (`'ok' | 'empty' | 'unverified' | null`) **đã được
API trả về** và **đã được khai kiểu đúng** trong `lib/api/grading.ts`, kèm
comment nói rõ `null` khác `'ok'`. Nó chưa được render ở bất cứ đâu.

Đây là dữ liệu đắt giá nhất trong toàn bộ payload: guard **G2 bắt buộc** mọi
`evidence` phải là **chuỗi con nguyên văn** của bài làm
(`harness/evidence-check.ts`, chịu được hoa/thường, dấu cong, elision `…`).
Hai hệ quả:

- **Bi-directional highlighting là khả thi và rẻ** — mỗi trích dẫn đã được
  chứng minh định vị được. Chỉ thiếu đường lấy text (§1.2②).
- Khi `check === 'unverified'`, UI nói thẳng được: *"AI trích câu này nhưng
  không có trong bài làm"*. Đó là bằng chứng trực quan cho luận điểm
  "AI đề xuất, người quyết định".

`docs/AI-grading-architecture.md` xếp bi-directional highlighting vào nhóm
"chưa bao giờ được xây". Đúng ở thời điểm viết, nhưng **lý do đã thay đổi**:
G2 được thêm sau đó, và nó chính là thứ làm việc này khả thi.

### 1.4 Vì sao "27/45 bài bị giữ lại" là hành vi đã chọn

`AUTO_APPROVE_CONFIDENCE = 0.85`, trần `confidence` của mọi bậc model dự phòng
là `0.5` (`GRADING_TIERn_CEILING`). Chỉ bậc Claude có trần `1.0`, và tài khoản
đang hết credit.

⇒ **Không có Claude thì không bài nào tự duyệt.** Mọi bài qua tay giảng viên.

UI **phải nói ra điều này**. Không có nó, giảng viên đọc con số cao thành
"AI chấm kém" và mất niềm tin vào một hệ thống đang hoạt động đúng thiết kế.

---

## 2. Phạm vi

**Quyết định của chủ đồ án (2026-09-16):** làm **đủ** plan giao diện, gồm cả
những phần cần backend mới (gom cụm, sandbox, thao tác hàng loạt, xuất điểm).

**Trục chính là bài tự luận `.docx`.** Nhánh code chưa xong ở backend, nên
không thiết kế quanh nó — nhưng **chừa sẵn mối nối**, đúng cách
`ContentResolverRegistry` đã chừa sẵn cho chính nó.

### 2.1 Tám đợt, xếp theo dây chuyền phụ thuộc

| Đợt | Nội dung | Chặn bởi |
|---|---|---|
| **0** | Mở khoá backend (§7.1) | — |
| **1** | Màn cấu hình & khởi chạy — đề bài, đáp án, mức sẵn sàng | 0 |
| **2** | Màn Điều phối (§4) | 1 |
| **3** | Bàn chấm split-view (§5) | 0, 1 |
| **4** | Ma trận điều hành + thao tác hàng loạt (§6) | 3 |
| **5** | Nhánh code: khai `deliverable_type` · resolver · Docker sandbox · tab test-case | — (độc lập) |
| **6** | Gom cụm ngữ nghĩa | 4 |
| **7** | Chốt & xuất: `GradeExport`, map cột Excel, phiếu phúc khảo, hiệu chuẩn | 4 |

### 2.1b Spec này KHÔNG ra một implementation plan duy nhất

Tám đợt là sáu subsystem độc lập. Nhồi cả tám vào một plan cho ra một tài liệu
không review được và không thực thi được.

**Plan đầu tiên phủ đợt 0 → 3** (mở khoá · cấu hình · Điều phối · Bàn chấm) —
đó là đơn vị nhỏ nhất chạy được từ đầu đến cuối và chứng minh được luận điểm ở
§0. Đợt 4–7 mỗi đợt một plan riêng, viết khi tới lượt.

### 2.2 Hai điều rút ra khi xếp thứ tự

**① Đợt 1 phải đi trước đợt 3.** Bàn chấm có khối "lượt phản biện". Nhưng lượt
phản biện chỉ chạy khi có `grading_reference`. Làm Bàn chấm trước đợt 1 là xây
một khối vĩnh viễn rỗng, rồi tự hỏi vì sao.

**② Đợt 4 nuốt phần lớn giá trị của đợt 6.** Phân nhóm theo khoảng cách
(`|điểm quy ra từ phản biện − điểm Grader|`) xử lý được nhóm đồng thuận —
theo ước lượng trong plan gốc là 40–50% số bài bị giữ lại — **không cần một
dòng ML nào**. Gom cụm ngữ nghĩa cần cả hạ tầng embedding để lo nốt phần đuôi.
Vẫn làm, nhưng biết trước nó **đắt nhất, tác động biên thấp nhất**.

---

## 3. Hệ thiết kế — không có quyết định mới nào

Toàn bộ mục này là **đối chiếu**, không phải sáng tác. Ưu tiên theo CLAUDE.md:
lời người dùng → hệ thống sẵn có → lựa chọn của người thiết kế.

| Hạng mục | Chốt | Nguồn |
|---|---|---|
| Token màu | Indigo `231 48% 30%` + Teal `174 62% 40%`, mỗi hue ba bậc `DEFAULT / strong / subtle` | `globals.css`, đã đo contrast từng cặp |
| Dark mode | Khối `.dark` **có sẵn** trong `globals.css` | — |
| Chữ | **Inter**, một họ duy nhất. Mono = system stack | `tailwind.config.ts`: *"Inter covers Vietnamese diacritics well at small sizes"* |
| Thang chữ | `display/h1/h2/h3/body/small/caption`, weight + tracking gắn vào từng bậc | `tailwind.config.ts` `fontSize` |
| Bo góc | `--radius: 12px` → card 12 · nút 10 · nút nhỏ 8 · chip 16 | `borderRadius` |
| Nút | Mặc định **teal** (màu hành động); **indigo** là biến thể thương hiệu, hiếm. Không có nút xám đặc | `button.tsx` |
| Badge | Viên bo tròn có border, nền `-subtle` + chữ `-strong`. Không pill đặc | `badge.tsx`: *"a table of solid pills reads as a table of alarms"* |
| Focus | **Một** vòng teal khai báo ở tầng gốc, component không tự vẽ lại | `globals.css` |
| Nền trang | `.app-wash` — vệt indigo góc trái trên + teal góc phải trên, cùng ở 7% | `globals.css` `@layer utilities` |
| Chuyển động | `cubic-bezier(0.22, 1, 0.36, 1)` @ 200ms | `transitionTimingFunction.smooth` |
| Mật độ | 8–32px. Giảng viên **quét** 45 bài, không đọc một trang | quyết định của thiết kế này |

### 3.1 Cái duy nhất được thêm vào hệ token

**Bốn màu tô dẫn chứng** — một hue cho mỗi tiêu chí, cộng một hue gạch chéo
cho trường hợp không đối chiếu được:

```css
--ev-1: 45 93% 76%;    --ev-2: 213 94% 87%;
--ev-3: 152 55% 85%;   --ev-bad: 0 85% 88%;
```

Không tái dùng bộ semantic: `success/warning/danger` mang nghĩa **phán xét**
(đạt / cảnh báo / hỏng), còn màu tô dẫn chứng chỉ mang nghĩa **thuộc về tiêu
chí nào**. Dùng màu xanh lá để tô dẫn chứng của tiêu chí 3 sẽ đọc thành "tiêu
chí này đạt", ngay cả khi nó không đạt.

### 3.2 Nguyên tắc copywriting — ngôn ngữ khảo thí, không phải ngôn ngữ hệ thống

Chữ trên màn hình **không bao giờ** mang thuật ngữ nội bộ. Bảng quy đổi bắt
buộc:

| Trong code | Trên màn hình |
|---|---|
| Advocate | lượt phản biện — bênh vực sinh viên |
| Grader | lượt chấm |
| guard G2 / verbatim evidence | đối chiếu từng chữ · trích dẫn khớp / không tìm thấy trong bài làm |
| `rubric_only` / `with_question` / `with_model_answer` | Mức 1 — Thang chấm · Mức 2 — Đề bài · Mức 3 — Đáp án mẫu |
| `confidence` | độ tin cậy |
| Δ | khoảng cách giữa lượt chấm và lượt phản biện |
| tier-1 / tier-2 | mô hình lượt 1 / lượt 2 |
| job timeout | quá hạn xử lý |
| flagged_for_review | cần bạn duyệt |

**Ngoại lệ có chủ đích:** các panel `cần backend` (§3.3) giữ nguyên tên kỹ
thuật — chúng nói với người sẽ code, không nói với giảng viên.

### 3.3 Panel chưa có backend phải được đánh dấu, không được giả lập

Mọi khối hiển thị dữ liệu backend chưa cung cấp mang **viền đứt + nhãn
`cần backend`**, và một dòng nói rõ thiếu gì.

Đây không phải trang trí. Nó là cùng một nguyên tắc mà cả
`grading-system-guide.md` được viết ra để giữ: *không để một thứ chưa có
trông như đã có*. Một nút bấm được trong khi không có gì xảy ra là một lời nói
dối — `apps/web/src/app/teacher/grading/page.tsx` đã ghi đúng câu đó cho nút
"Bắt đầu chấm".

---

## 4. Màn 1 — Điều phối & phát hiện bất thường

**Đường dẫn:** `/teacher/grading` (thay nội dung trang hiện tại)
**Câu hỏi màn này trả lời:** *lượt chấm này đứng ở đâu, và chỗ nào cả lớp cùng lệch?*

### 4.1 Thứ tự trên màn, và vì sao

```
① Dải Mức sẵn sàng      ← KHÔNG phải con số tiến độ
② Bốn ô phân loại độ tin cậy  (bấm để lọc)
③ Bất thường trên diện rộng
④ Danh sách bài đang lọc          │  ⑤ Lượt chấm · hàng đợi · chấm thử
```

**Dải Mức sẵn sàng đứng đầu, không phải tiến độ.** *Bạn đang chấm với bao
nhiêu ngữ cảnh* quan trọng hơn *đã chấm bao nhiêu bài* — vì mức sẵn sàng
quyết định lượt phản biện có chạy không, và đó là toàn bộ lý do §1 tồn tại.

| Mức | Nguồn | Trạng thái hiển thị |
|---|---|---|
| 1 — Thang chấm | `exam_session.rubric_id` | luôn có (nếu thiếu, cả trang bị chặn) |
| 2 — Đề bài | `grading_reference.question_material_id` | đã chọn / chưa chọn |
| 3 — Đáp án mẫu | `model_answer_storage_key` **hoặc** `model_answer_note` | đã có / chưa có |

Dòng dưới dải nói rõ hệ quả, bằng ngôn ngữ khảo thí:

> **Đang chấm ở Mức 2.** Lượt phản biện có chạy ở mức này, vì nó cần đề bài mới
> đối chiếu được. Nếu chưa nạp đề bài, lượt phản biện lặng lẽ không chạy — và
> bài của sinh viên làm đúng theo một cách khác sẽ không có ai lên tiếng.

### 4.2 Bốn ô phân loại

Suy ra ở client từ `GradingResult[]`, không cần route mới:

| Ô | Điều kiện | Màu viền trái |
|---|---|---|
| Tin cậy cao | `confidence >= 0.7` và mọi `check === 'ok'` | success |
| Tin cậy thấp | `confidence < 0.7` hoặc có `check !== 'ok'` | warning |
| Cần bạn duyệt | `status === 'flagged_for_review'` | danger |
| Treo | `status === 'ai_grading'` trong khi `progress.pending` đã đứng yên | muted |

**"Treo" không tính bằng đồng hồ ở client.** `GRADE_JOB_TIMEOUT_MS` là biến
môi trường của server, UI không biết và không nên đoán. Dấu hiệu dùng được là:
bài còn `ai_grading` trong khi không còn job nào chạy. Nút chỉ mở khi
`queue.active === 0` — chính `regradeStuck()` cũng lọc theo "không còn job
sống", nên UI phải nói cùng một câu chuyện với route nó gọi.

Kèm dòng giải thích §1.4, viết như một bảo đảm chứ không như một sự cố:

> **27 bài được giữ lại để bạn duyệt — đây không phải lỗi.** Ở cấu hình hiện
> tại, hệ thống không tự duyệt bài nào: mọi đề xuất điểm đều phải qua mắt người
> trước khi trở thành điểm thật. Toàn bộ bài có điểm trừ được chuyển sang đây
> để bạn bảo đảm công bằng cho sinh viên.

**`check` phân biệt ba trạng thái, không hai.** `null` = "chấm trước khi hệ
thống ghi lại điều này", **khác** `'ok'`. Gộp chúng là làm bài cũ trông như đã
được kiểm. Kiểu trong `lib/api/grading.ts` đã nói đúng điều này; UI phải theo.

### 4.3 Bất thường trên diện rộng

Ba phép đếm, tính ở client:

1. **Tiêu chí bị trừ điểm hàng loạt** — `criterionId` nào có tỉ lệ
   `verdict !== 'met'` vượt 60%. Đây là tín hiệu **rubric viết chưa chặt**,
   không phải tín hiệu cả lớp kém. Nút dẫn thẳng sang §6.4.
2. **Trích dẫn không đối chiếu được** — đếm bài có `check === 'unverified'`.
3. **Lượt phản biện không đồng ý** — đếm bài có `advocateOpinion` với ít nhất
   một `suggestedVerdict` khác verdict của Grader, kèm khoảng cách trung bình.

Câu chữ ở mục 3 phải nói rõ: *"con số trên là khoảng cách giữa hai lập luận,
không phải điểm đã bị thay đổi"* — nếu không, giảng viên đọc thành điểm đã bị
AI tự sửa, đúng cái điều mà cả ba lớp chặn tồn tại để ngăn.

### 4.4 Cột phải

- **Lượt chấm** — `getGradingProgress()`. `total/pending/done` là của phiên
  này; `queue.*` là toàn hệ thống và **phải hiển thị tách bạch** — trộn lại sẽ
  cho giảng viên A thấy con số của giảng viên B.
- **Điều khiển hàng đợi** — `cần backend`, đợt 4.
- **Chấm thử 3 bài** — `cần backend`, đợt 1 (`start-grading` hiện chấm cả
  phiên, chưa nhận danh sách con).

---

## 5. Màn 2 — Bàn chấm

**Đường dẫn:** `/teacher/grading/[resultId]`
**Câu hỏi:** *AI nói vậy dựa vào đâu, và tôi có đồng ý không?*

### 5.1 Bố cục

```
┌── BÀI LÀM ──────────────────┬── RUBRIC & GIẢI TRÌNH ─────────────┐
│ [Bài làm] [Chạy thử code▪]  │ Thẻ tiêu chí × N                    │
│                             │  ├ mức đánh giá + trạng thái đối chiếu│
│ Text đã tô sáng theo          │  ├ thanh độ tin cậy                 │
│ trích dẫn, mỗi tiêu chí       │  ├ vì sao AI chấm mức này           │
│ một màu                      │  ├ trích dẫn từ bài làm             │
│                             │  ├ [lượt phản biện]  (nếu có)       │
│ ▪ = mối nối chừa sẵn         │  └ cho điểm lại + thẻ lý do         │
│   cho nhánh code             ├─────────────────────────────────────┤
│                             │ Tổng · [Bỏ qua AI] [Lưu duyệt]      │
└─────────────────────────────┴─────────────────────────────────────┘
```

### 5.2 Tô sáng hai chiều — cơ chế

Khác với `docs/AI-grading-architecture.md`, chỗ này **không cần lưu offset**.

```
Với mỗi tiêu chí:
  needle = normalize(evidence)          ← cùng phép chuẩn hoá của evidence-check.ts
  hay    = normalize(nội dung bài làm)
  at     = hay.indexOf(needle)
  at === -1  →  không tô. Đó CHÍNH LÀ điều G2 phát hiện.
```

Chuẩn hoá phải **dùng lại** logic của `harness/evidence-check.ts` (hoa/thường,
dấu cong `"" ''`, khoảng trắng gộp, elision `…`). Viết lại một bản riêng ở
client là cách chắc chắn nhất để hai bên bất đồng về cùng một chuỗi, và triệu
chứng sẽ là "highlight thỉnh thoảng không hiện" — một lỗi không ai truy được.

> **Đề xuất kèm theo:** tách phép chuẩn hoá sang `packages/shared` để hai bên
> dùng chung đúng một bản. Nếu không làm, phải có test khoá hai bản khớp nhau.

**Chồng lấn:** sắp theo `start`, giữ đoạn đầu, bỏ đoạn giao. Hai tiêu chí trích
cùng một câu là chuyện có thật; tô lồng nhau cho ra HTML không đọc được.

**Chiều ngược lại:** bôi đen một đoạn trong bài làm → popup *"Gán làm minh
chứng cho [tiêu chí]"* → ghi vào `editedCriteria` của lượt duyệt. **Không ghi
đè** `criterion_results` — trigger `guard_grading_result_ai_immutable` chặn ở
tầng DB, và đó là Security rule 6.

### 5.3 Thẻ tiêu chí

| Thành phần | Nguồn | Ghi chú |
|---|---|---|
| Mức đánh giá | `verdict` | Đạt / Đạt một phần / Chưa đạt |
| Trạng thái đối chiếu | `check` | ba trạng thái, `null` hiện là "chưa kiểm" |
| Thanh độ tin cậy | `confidence` | nhãn phải nói đây là **phép đo**, không phải AI tự chấm |
| Vì sao AI chấm mức này | từ lượt chấm | văn xuôi |
| Trích dẫn từ bài làm | `evidence` | nếu `unverified` → gạch chéo đỏ + câu giải thích |
| Cho điểm lại | nút `0 / nửa thang / tối đa` + nút "theo phản biện" nếu có | server tự tính tổng; client **không** gửi `finalScore` |
| Thẻ lý do | 4 thẻ cố định | **`cần backend`** — `teacher_review` chưa có cột |

**Thanh độ tin cậy phải được gắn nhãn đúng.** `confidence` do
`applyGuards()` tính bằng đối chiếu cơ học, **không** do model tự khai —
provider chỉ được đặt trần. Vẽ nó như "AI tự tin bao nhiêu" là nói sai bản
chất kiến trúc, và đó lại là thứ đáng trình ra nhất khi bảo vệ.

### 5.4 Khối lượt phản biện

Nền `info`, tách hẳn khỏi thẻ tiêu chí. Gồm `reasoning`, danh sách `evidence`,
và mức đánh giá kiến nghị.

Ba điều bắt buộc:

1. **Nút "theo phản biện" là do giảng viên bấm.** Lượt phản biện không ghi
   điểm; nó chỉ đặt sẵn một giá trị.
2. **`unverifiedEvidence` phải hiện ra.** `null` = chưa kiểm, `[]` = đã kiểm và
   sạch. Hiển thị hai thứ đó giống nhau là sai đúng ở chỗ nguy hiểm nhất —
   comment trong `advocate.types.ts` đã cảnh báo nguyên văn.
3. **Không tự loại bỏ kiến nghị** khi có dẫn chứng trượt. Loại bỏ là thay
   giảng viên quyết.

### 5.5 Trạng thái phải xử lý

| Trạng thái | Màn hình |
|---|---|
| `ai_grading` / `ai_graded` | chỉ đọc, nói rõ AI đang chấm |
| `finalized` / `exported` | sửa được, kèm cảnh báo **sẽ ghi nhật ký** (Security rule 4) |
| `advocateOpinion === null` | **không** render khối rỗng — nói vì sao: "chưa nạp đề bài nên lượt phản biện không chạy", kèm link sang màn cấu hình |
| Không đọc được nội dung bài làm | cột trái nói rõ định dạng không đọc được (`.zip`, `.pdf`, ảnh), **không** hiện khung trắng |
| `contextUsed*` = false trong khi mức sẵn sàng nói có | cảnh báo — file đã bị xoá khỏi kho sau khi ghi nhận. `loadedLevel` khác `readiness()` chính vì ca này |

---

## 6. Màn 3 — Ma trận điều hành

**Đường dẫn:** `/teacher/grading/matrix`
**Câu hỏi:** *45 bài bị giữ lại — làm sao xong trong 15 phút thay vì 3 tiếng?*

Đây là câu trả lời cho kịch bản "tai nạn vận hành": đề quá mở khiến gần cả lớp
bị giữ lại. Nếu buộc mở từng bài trên Bàn chấm, hệ thống thất bại ở đúng lúc
nó cần thành công.

### 6.1 Phân nhóm theo khoảng cách

`d = |điểm quy ra từ kiến nghị phản biện − ai_total_score|`

| Nhóm | Ý nghĩa | Hành động |
|---|---|---|
| Không lệch | hai lượt đồng thuận; giữ lại vì lý do kỹ thuật | **Duyệt cả nhóm bằng một nút** (`cần backend`, §7.2 đợt 4) |
| ≤ 0,5 | lệch không đáng kể | lấy mức cao hơn / trung bình cho cả nhóm |
| > 1,5 | thật sự tranh chấp | mở Bàn chấm đọc kỹ |

**Cột "Phản biện" là điểm quy ra ở client**, tính lại theo đúng thang rubric từ
`suggestedVerdicts`. `AdvocateOpinion` không có trường điểm nào. Bảng phải ghi
rõ điều này ngay dưới nó — một cột số cạnh một cột số khác sẽ được đọc là hai
con số cùng loại.

### 6.2 Bảng

`@tanstack/react-table` (đã là dependency). Cột: chọn · sinh viên · lượt chấm ·
phản biện · lệch · lý do giữ lại · **một câu tóm tắt**.

Cột tóm tắt là cột quan trọng nhất: nó cho phép nắm tình hình cả lớp **mà không
mở bài nào**. Lấy câu đầu của `advocateOpinion.reasoning`, cắt ở ranh giới câu.

### 6.3 Thao tác hàng loạt

Checkbox + **một** thanh hành động (không nhét nút lặp từng dòng). Thanh dùng
nền indigo, dính đáy.

**`cần backend`** — đợt 4. Route mới nhận `{ resultIds[], action }` và tạo một
dòng `teacher_review` **cho mỗi bài**. Không được viết tắt thành một bản ghi
gộp: `teacher_review` là sổ cái của "ai quyết gì", và một thao tác hàng loạt
vẫn là 20 quyết định.

### 6.4 Can thiệp theo tiêu chí

Khi một tiêu chí bị trừ điểm hàng loạt:

- **Cộng bù** cho tiêu chí đó, toàn bộ lớp.
- **Huỷ tiêu chí** — chia đều trọng số sang các tiêu chí còn lại, tính lại cả 45 bài.

**`cần backend`**, và cần một quyết định thiết kế chưa có: huỷ một tiêu chí
làm đổi **thang điểm** của rubric, mà `guard_rubric_criteria_immutable` cấm sửa
rubric đã có kết quả chấm. Hai đường khả dĩ:

1. Ghi thành `teacher_review` hàng loạt với `editedCriteria` đã tính lại —
   rubric không đổi, chỉ điểm đổi. **Khuyến nghị**: không đụng bất biến nào.
2. Tạo rubric version mới rồi chấm lại — đắt, và làm sai lệch dữ liệu hiệu chuẩn.

---

## 7. Backend phải bổ sung

### 7.1 Đợt 0 — nhỏ, mở khoá phần lớn

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Thêm `advocateOpinion` + `contextUsedQuestion` + `contextUsedModelAnswer` vào `GradingResultView` và `listForSession()` | Chỉ đọc. Không đụng đường ghi, nên không chạm trigger bất biến |
| 2 | `GET /grading-results/:id/submission-text` | `@Roles('teacher')` + kiểm sở hữu phiên qua `findOwnedBy`, y như 11 route còn lại — đây là bài làm của sinh viên, không phải tài nguyên công khai. Tái dùng `ContentResolverRegistry` + `storage.getObject()`. Trả `{ text, truncated }`. **Phải** qua cùng một resolver với lúc chấm — một đường trích text thứ hai là một đường cho ra chuỗi khác, và highlight sẽ trượt |
| 3 | Migration: `teacher_review` thêm `reason_tag`, `private_note`, `student_feedback` | Cả ba nullable |
| 4 | Regenerate `packages/shared/src/api/schema.d.ts` | Sinh **từ API đang chạy**, không từ source. Bỏ bước này ⇒ `apps/web` fail typecheck |

> Type cho **4 route ở §1.1 đã có sẵn** trong `schema.d.ts` — đã kiểm trực tiếp
> ngày 2026-09-16: cả `grading-reference`, `answer-key-upload`,
> `grading-readiness` và `regrade-stuck` đều có mặt. Nên đợt 1 **không** cần
> bước regenerate; việc #4 chỉ phục vụ #1–#3.

### 7.2 Các đợt sau

| Đợt | Cần thêm |
|---|---|
| 1 | `start-grading` nhận `{ submissionIds?: string[] }` cho chấm thử |
| 4 | `POST /exam-sessions/:id/bulk-review` · `POST /exam-sessions/:id/criterion-adjust` · 3 route điều khiển hàng đợi |
| 5 | Đường khai `deliverable_type` (form tạo phiên + DTO) · `CodeResolver` · `src/sandbox` · bảng kết quả test-case |
| 6 | Hạ tầng embedding + `GET /exam-sessions/:id/clusters` |
| 7 | `GradeExportService` + controller · xuất PDF phiếu phúc khảo · `GET /exam-sessions/:id/calibration` |

### 7.3 Ràng buộc không được vượt

1. `ai_total_score`, `criterion_results`, `advocate_opinion`, `context_used_*`
   **chỉ đọc** từ phía UI. Mọi sửa của giảng viên tạo dòng `teacher_review` mới.
2. Đáp án mẫu **không bao giờ** hiển thị trên UI chấm. Prefix
   `grading-reference/` tách hẳn khỏi `materials/` chính là cơ chế giữ điều đó.
3. Chọn đề bài **luôn tường minh**, không đoán theo tên file (Security rule 9).
4. Thêm cột AI mới ⇒ phải thêm vào trigger bất biến **trong cùng migration**.

---

## 8. Cố ý KHÔNG làm

| Không làm | Lý do |
|---|---|
| Tự duyệt hàng loạt theo độ tin cậy mà không cho xem | Bước duyệt của con người là ràng buộc thiết kế, không phải tính năng bỏ được khi thiếu thời gian |
| Cho UI sửa thẳng `criterion_results` | Security rule 6, và là bằng chứng dữ liệu của luận điểm đồ án |
| Đoán cột MSSV/điểm khi xuất Excel | Security rule 9 |
| Ẩn bài có mức sẵn sàng thấp | Im lặng đúng ở chỗ nguy hiểm nhất |
| Hiển thị `check === null` giống `'ok'` | Bài cũ sẽ trông như đã được kiểm |
| Tự loại kiến nghị phản biện khi dẫn chứng trượt | Loại bỏ là thay giảng viên quyết |
| Bảng điều khiển chi phí AI | `usage` mới ở log, chưa vào bảng nào. Ngoài phạm vi |

---

## 9. Test

| Tầng | Nội dung |
|---|---|
| Unit (vitest) | Phép định vị trích dẫn: khớp thường · khác hoa/thường · dấu cong · elision · **không khớp** (trả `-1`) · hai tiêu chí chồng lấn |
| Unit | Quy điểm từ `suggestedVerdicts` → khớp `pointsFor()` của server |
| Unit | Phân loại 4 ô và 3 nhóm khoảng cách |
| Component | Thẻ tiêu chí render đủ ba trạng thái `check`, gồm `null` |
| Component | `advocateOpinion === null` → hiện lý do, **không** hiện khối rỗng |
| Component | `finalScore === null` **không** hiển thị thành `0` |
| e2e | Đặt `grading_reference` → `readiness` lên `with_question` → chấm → `advocate_opinion` khác `null`. **Đây là ca quan trọng nhất**: nó chứng minh nhánh phản biện chạy thật lần đầu tiên |

Điều kiện chạy e2e không đổi: Postgres + MinIO + Redis, **và** bucket
`examcollect-submissions` đã tạo. Thiếu bucket cho ra lỗi trông y hệt lỗi
nghiệp vụ.

---

## 10. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Hai bản chuẩn hoá chuỗi (client/server) trôi khỏi nhau | **Cao** | Tách sang `packages/shared`, hoặc test khoá hai bản khớp |
| Bài `.docx` dài làm cột trái nặng | Trung bình | Trả `{ text, truncated }`, cắt ở server, nói rõ khi bị cắt |
| Lượt phản biện chạy lần đầu cho kết quả kém | Trung bình | Đó chính là lý do phải chạy thử 3 bài trước (đợt 1) |
| Huỷ tiêu chí đụng bất biến rubric | Trung bình | Đi đường 1 ở §6.4 |
| Đợt 5 (sandbox) trượt lịch, kéo theo cả kế hoạch | Thấp | Đã tách độc lập, không chặn đợt nào khác |

---

## 11. Câu hỏi còn mở

1. **Chuẩn hoá chuỗi: tách `packages/shared` hay khoá bằng test?** Tách sạch
   hơn nhưng đụng cấu trúc package. Khuyến nghị: tách, vì đây đúng là định
   nghĩa của "type/logic dùng bởi 2+ module".
2. **Bàn chấm là route riêng hay panel trong `/teacher/grading`?** Route riêng
   cho phép deep-link vào một bài — hữu ích khi phúc khảo. Khuyến nghị: route riêng.
3. **Ma trận là màn riêng hay một chế độ xem của Điều phối?** Plan gốc tách
   riêng. Khuyến nghị: giữ tách, vì nó có bộ thao tác hàng loạt riêng.
4. **Cắt nội dung bài làm ở bao nhiêu ký tự?** Chưa đo. Cần một mẫu `.docx`
   thật của lớp để quyết.

---

## 12. Thay đổi tài liệu khác

`docs/grading-system-guide.md` §11 cần thêm ba dòng phát hiện ở §1.2 — hiện
bảng "Cái CHƯA có" nói *"toàn bộ UI cho advocate/anchor/readiness"* nhưng
**không** nói rằng ngay cả tầng đọc cũng thiếu. Người lập kế hoạch dựa vào
bảng đó sẽ ước lượng thiếu.
