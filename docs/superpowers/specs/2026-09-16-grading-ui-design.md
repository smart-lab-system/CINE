# Giao diện chấm điểm — thiết kế

> **Bị thay một phần bởi `2026-09-23-grading-ui-rebuild-design.md`** (2026-09-23): ba màn ở
> mục 4, 5, 6 và dòng đầu của mục 8 không còn hiệu lực. Mục 3, 3.2, 3.3 và 5.2 vẫn giữ —
> xem mục 0.2 của spec mới.

**Ngày:** 2026-09-16 · **rev 2** (sau phản biện — xem §13)
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

### 5.2 Tô sáng hai chiều — SERVER định vị, client chỉ vẽ

> **rev 2 đảo ngược hoàn toàn mục này.** rev 1 để client tự so chuỗi. Sai, và
> sai theo kiểu nguy hiểm — xem §13.1.

#### 5.2.1 Vì sao client không được phép tự so chuỗi

`normalizeForMatch()` kết thúc bằng:

```ts
return out.replace(/\s+/g, ' ').trim().toLowerCase();
```

Server đối chiếu trên một chuỗi **đã làm phẳng**: `\n\n` giữa hai đoạn thành
một dấu cách. Hệ quả trực tiếp: **một trích dẫn vắt qua ranh giới đoạn vẫn
hợp lệ và vẫn được chấm `ok`.**

Bất kỳ cách nào chẻ bài làm ra rồi so từng mảnh — theo đoạn, theo câu, theo
trang — đều **không tìm thấy đúng những trích dẫn đó**, và UI sẽ tô gạch đỏ
"không tìm thấy trong bài làm" cho một câu mà guard đã xác nhận có thật. Đó là
UI vu cho AI bịa dẫn chứng. Không có cách nào để người dùng biết bên nào đúng.

Và `verifyEvidence` **không phải** một `indexOf`. Nó còn:

- tách elision `…` / `...` thành nhiều mẩu, so từng mẩu
- ép **thứ tự**: mẩu sau phải nằm sau mẩu trước (`indexOf(part, cursor)`)
- loại mẩu ngắn hơn `MIN_EVIDENCE_CHARS = 10` — dưới ngưỡng đó một chuỗi khớp
  bừa vào gần như mọi bài tiếng Việt

Tái tạo cả bốn hành vi này ở client, rồi giữ cho hai bản không trôi khỏi nhau
qua mọi lần refactor, là công việc không có lý do gì để tồn tại.

#### 5.2.2 Route trả về toạ độ

`GET /grading-results/:id/submission-text` chạy **chính hàm đã dùng lúc chấm**,
rồi trả ra vị trí:

```ts
{
  paragraphs: string[],        // text thô, chẻ theo /\n{2,}/ — GIỮ cấu trúc bài viết
  spans: {
    criterionId: string,
    paragraph: number,         // chỉ số trong `paragraphs`
    start: number, end: number // offset RAW trong đúng đoạn đó
  }[],
  unlocatable: string[],       // criterionId không định vị được — khớp `check === 'unverified'`
  truncatedByGrading: boolean, // bài đã bị cắt lúc chấm (§5.2.4)
}
```

Thứ tự bắt buộc ở server: **định vị trên chuỗi phẳng trước, chẻ đoạn sau.** Làm
ngược lại là tự dựng lại đúng cái lỗi ở §5.2.1.

Một trích dẫn vắt qua hai đoạn ra **hai span cùng `criterionId`**. Client tô cả
hai; về mặt thị giác chúng là một vệt liền, ngắt đúng chỗ xuống dòng.

Cần thêm vào `harness/evidence-check.ts` một hàm trả vị trí thay vì chỉ trả
verdict — dùng chung đúng bộ `normalizeForMatch` + `splitElision` + ràng buộc
thứ tự, không viết lại. File vẫn là leaf, vẫn test được không cần dựng gì.

> **Quy chiếu ngược về offset thô.** Chuẩn hoá làm đổi độ dài (gộp khoảng
> trắng, xoá zero-width), nên vị trí tìm được nằm trong hệ toạ độ của chuỗi đã
> chuẩn hoá. Phải dựng một mảng ánh xạ index-chuẩn-hoá → index-thô trong cùng
> một lượt duyệt lúc chuẩn hoá. Bỏ bước này thì highlight lệch dần theo mỗi
> khoảng trắng kép phía trước — sai vài ký tự, đủ để đọc ra như "gần đúng".

#### 5.2.3 Client làm gì

Render `paragraphs` thành `<p>`, bọc `<mark>` theo `spans`. **Không có phép so
chuỗi nào ở client.**

**Chồng lấn:** hai tiêu chí trích cùng một câu là chuyện có thật. Sắp theo
`start`, giữ span đầu, bỏ phần giao — tô lồng nhau cho ra HTML không đọc được.
Việc này ở client vì nó là quyết định trình bày, không phải quyết định đối chiếu.

#### 5.2.4 Không có trần cắt riêng cho UI

`extractText()` đã cắt ở `MAX_GRADING_INPUT_CHARS = 200_000` qua `capChars()`,
và dán `TRUNCATION_NOTICE` vào trong giới hạn đó.

Route này trả **đúng chuỗi ấy**. Đặt một trần thứ hai, thấp hơn, cho "nhẹ
payload" sẽ giấu mất phần văn bản mà model ĐÃ đọc và ĐÃ trích — và trích dẫn
nằm trong phần bị giấu hiện ra thành "không tìm thấy". Lại đúng lỗi §5.2.1.

Bài tự luận thật là 2–8k ký tự; 200k là trần bệnh lý, và nén HTTP lo phần đó.

`truncatedByGrading` để UI nói được *"phần cuối bài không được chấm"* — thông
tin giảng viên cần, và là thứ một trần phía UI sẽ xoá mất.

#### 5.2.5 Chiều ngược lại — gán minh chứng

Bôi đen một đoạn trong bài làm → *"Gán làm minh chứng cho [tiêu chí]"*.

Đường ghi là `POST /grading-results/:id/review` — **không phải** một route
`teacher-review` riêng; route đó không tồn tại. Payload vẫn là
`SubmitReviewDto`, tức **toàn bộ tiêu chí**, mỗi tiêu chí đủ
`{ criterionId, verdict, points }`. `validateAndTotal()` ném lỗi nếu
`seen.size !== criteria.length`.

Điều đó cho không một bảo đảm: **không thể gán minh chứng mà quên cập nhật
verdict**, vì không có đường gửi riêng một tiêu chí.

`ReviewCriterionDto` cần thêm `pinnedEvidence?: string`:

```ts
@IsOptional() @IsString() @MaxLength(2000)
pinnedEvidence?: string;
```

> ⚠️ **Thêm trường vào payload mà quên sửa DTO là một lỗi IM LẶNG.** `main.ts`
> chạy `new ValidationPipe({ whitelist: true, transform: true })` — **không có**
> `forbidNonWhitelisted`. Trường lạ bị **cắt bỏ không báo**, request trả
> **200 OK**, và minh chứng giảng viên vừa gán biến mất không dấu vết. Đây là
> cùng một họ lỗi với `@Matches(undefined)` đã tốn một buổi của repo này.

**Không ghi đè** `criterion_results` — trigger `guard_grading_result_ai_immutable`
chặn ở tầng DB, và đó là Security rule 6.

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
| 2 | `GET /grading-results/:id/submission-text` | `@Roles('teacher')` + kiểm sở hữu phiên qua `findOwnedBy`, y như 11 route còn lại — đây là bài làm của sinh viên, không phải tài nguyên công khai. Tái dùng `ContentResolverRegistry` + `storage.getObject()`. Trả `{ paragraphs, spans, unlocatable, truncatedByGrading }` (§5.2.2) — **toạ độ, không phải chuỗi thô**. **Phải** qua cùng một resolver với lúc chấm |
| 2b | Thêm hàm trả vị trí vào `harness/evidence-check.ts` | Dùng chung `normalizeForMatch` + `splitElision` + ràng buộc thứ tự với `verifyEvidence`. Kèm mảng ánh xạ index-chuẩn-hoá → index-thô. Giữ nguyên tính leaf |
| 2c | Thêm `pinnedEvidence?` vào `ReviewCriterionDto` | **Bắt buộc.** Không có nó, trường bị `whitelist: true` cắt im lặng và trả 200 (§5.2.5) |
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
| ~~Hai bản chuẩn hoá chuỗi trôi khỏi nhau~~ | — | **Đã loại bỏ bằng thiết kế** ở rev 2: chỉ còn một bộ đối chiếu, ở server (§5.2) |
| UI nói "không tìm thấy" cho trích dẫn guard đã chấm `ok` | **Cao** | Nguồn gốc của mọi lỗi ở §13.1. Khoá bằng test: một trích dẫn vắt qua `\n\n` phải ra span, không ra `unlocatable` |
| Trích xuất lại lúc đọc khác lúc chấm | Trung bình | Cùng resolver, cùng file bất biến, mammoth pin version. Nếu `unlocatable` lệch với `check` đã lưu → hiện cảnh báo thay vì im lặng |
| Bài `.docx` dài làm cột trái nặng | Thấp | 200k là trần bệnh lý; bài thật 2–8k ký tự. Nén HTTP lo phần còn lại |
| Lượt phản biện chạy lần đầu cho kết quả kém | Trung bình | Đó chính là lý do phải chạy thử 3 bài trước (đợt 1) |
| Huỷ tiêu chí đụng bất biến rubric | Trung bình | Đi đường 1 ở §6.4 |
| Đợt 5 (sandbox) trượt lịch, kéo theo cả kế hoạch | Thấp | Đã tách độc lập, không chặn đợt nào khác |

---

## 11. Bốn câu hỏi của rev 1 — đã chốt

| | Chốt | Vì sao |
|---|---|---|
| **1** Chuẩn hoá chuỗi: tách `packages/shared` hay khoá bằng test? | **Câu hỏi biến mất** | Client không còn so chuỗi (§5.2). Không có bản thứ hai để trôi, nên không cần chia sẻ gì |
| **2** Bàn chấm: route riêng hay panel? | **Route riêng** `/teacher/grading/[resultId]` | Split-view cần hai cột 50-50; nhét vào panel làm hẹp chỗ đọc. Và deep-link là thứ cần thật khi sinh viên phúc khảo |
| **3** Ma trận: màn riêng hay chế độ xem? | **Route riêng** `/teacher/grading/matrix` | Nó có bảng lớn + thanh thao tác hàng loạt dính đáy; gộp vào làm màn Điều phối mất sự tinh gọn |
| **4** Cắt text ở bao nhiêu ký tự? | **Không đặt trần mới** | Dùng đúng `MAX_GRADING_INPUT_CHARS = 200_000` đã có. Một trần thứ hai giấu mất phần model đã đọc (§5.2.4) |

---

## 12. Thay đổi tài liệu khác

`docs/grading-system-guide.md` §11 cần thêm ba dòng phát hiện ở §1.2 — hiện
bảng "Cái CHƯA có" nói *"toàn bộ UI cho advocate/anchor/readiness"* nhưng
**không** nói rằng ngay cả tầng đọc cũng thiếu. Người lập kế hoạch dựa vào
bảng đó sẽ ước lượng thiếu.

---

## 13. Nhật ký phản biện (rev 1 → rev 2)

Một lượt phản biện nêu bốn điểm. Hai điểm chỉ đúng chỗ hở; **không kiến nghị
kỹ thuật nào đứng được sau khi đọc code.** Ghi lại vì cách chúng sai hữu ích
hơn bản thân chúng.

### 13.1 Một lỗi, ba lần xuất hiện

Ba kiến nghị khác nhau — chẻ bài làm theo đoạn rồi so từng đoạn · cắt text ở
30.000 ký tự · để client tự so chuỗi — cùng phạm **một** lỗi:

> Chúng tạo ra tình huống UI báo "không tìm thấy trong bài làm" cho một trích
> dẫn mà guard G2 đã chấm `ok`.

Vì `normalizeForMatch` làm phẳng `\s+`, phạm vi đối chiếu của server là **cả
bài, một dòng**. Mọi thứ thu hẹp phạm vi đó ở phía client — chẻ nhỏ, cắt
ngắn, hay so lại bằng một bản logic khác — đều tạo ra bất đồng mà người dùng
không có cách nào phân xử. Và bất đồng này rơi đúng vào tính năng mà cả hệ
thống dựa vào để chứng minh nó không bịa.

Đây là lý do rev 2 đảo chiều: **phạm vi đối chiếu phải nằm cùng một chỗ với
phép đối chiếu.** Server có cả hai; client không được có cái nào.

### 13.2 Từng điểm

| Kiến nghị | Phán quyết | Căn cứ trong code |
|---|---|---|
| Trả `paragraphs: string[]` để client so từng đoạn | **Bác.** Giữ ý tưởng chẻ đoạn, bỏ ý tưởng client so chuỗi | `normalizeForMatch` gộp `\s+`, nên trích dẫn vắt đoạn là hợp lệ |
| Payload gán minh chứng `PUT /teacher-review` | **Bác.** Route không tồn tại | `grading.controller.ts` — đường duy nhất là `POST /grading-results/:id/review` |
| Schema `{criterionId, verdict, pinnedEvidence, teacherComment}` | **Bác.** Thiếu `points` → 400 | `ReviewCriterionDto`: `@IsNumber @Min(0) points!` |
| "Tránh gán text nhưng không cập nhật verdict" | **Không xảy ra được** | `validateAndTotal`: `seen.size !== criteria.length` → 400 |
| Trần cắt 30.000 ký tự, "payload dưới 100KB" | **Bác.** Sai ràng buộc, và sai số học | Trần thật là `MAX_GRADING_INPUT_CHARS = 200_000`. 30k ký tự tiếng Việt UTF-8 ≈ 60–90KB, không phải "dưới 100KB" thoải mái |
| Route riêng cho Bàn chấm và Ma trận | **Nhận.** Lý do phúc khảo tốt hơn lý do rev 1 viết | — |

### 13.3 Điều phản biện KHÔNG thấy, và đáng ra phải thấy

`main.ts` chạy `new ValidationPipe({ whitelist: true, transform: true })`
**không kèm `forbidNonWhitelisted`**. Một kiến nghị "thêm trường vào payload"
mà không nói tới điều này là kiến nghị dẫn thẳng tới một lỗi im lặng: server
cắt trường lạ, trả 200, dữ liệu không bao giờ tới DB.

### 13.4 Điều phản biện thấy đúng

§5.2 của rev 1 viết `hay.indexOf(needle)` và gọi đó là "cùng phép chuẩn hoá của
evidence-check.ts". Không đúng: nó bỏ qua tách elision, bỏ qua ràng buộc thứ
tự, bỏ qua `MIN_EVIDENCE_CHARS`. Mục đó **phải** được viết lại, và phản biện
đúng khi chỉ vào nó — chỉ là lỗ to hơn nhiều so với mô tả.

Tương tự, payload gán minh chứng ở rev 1 đúng là chưa có schema. Giờ có, ở
§5.2.5.
