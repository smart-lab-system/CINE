# Design: "Quản lý bài thu" — trục mức độ thật, phạm vi học kỳ, và bố cục phân loại

**Date:** 2026-09-05
**Status:** Approved by user in chat (architectural — 3 vòng hỏi đáp + 4 vòng mockup trực quan,
bố cục và bộ lọc do user duyệt từng phần)
**Builds on:** `2026-09-03-submissions-rollup-page-design.md` (đã implement và merge vào `main`)
**Nguồn:** phản hồi trực tiếp của một giảng viên dùng thử trang đã build

---

## 1. Vì sao có spec này

Trang roll-up đã lên. Một giảng viên dùng thử và nêu 4 vấn đề + 3 tính năng thiếu. Khi truy ngược
từng cái xuống hệ thống, **ba trong số đó có nguyên nhân sâu hơn hẳn vẻ ngoài của chúng**, và một cái
là lỗi thiết kế của spec trước.

### 1.1 "Nhãn chỉ nói *chưa nộp*, không phân biệt mức khẩn" — hai trong ba mức **không thể xảy ra**

Giảng viên nhớ rằng hệ thống phân biệt được ba mức. Code **có** — `getAttentionReasons` sinh ba nhãn,
có test khoá. Nhưng dữ liệu không thể nuôi hai trong ba:

- **`file lỗi` chưa bao giờ tồn tại trong production.** `apps/api/src/submission/submission.service.ts`
  có TODO nguyên văn: *"nothing produces 'invalid' yet… the DB trigger allows no transition OUT of
  'invalid', so that would need a schema change, not just a branch here."* 21 dòng `invalid` trong DB
  đều do e2e fixture ghi thẳng vào.
- **`nộp thiếu file` bất khả thi với 93% phiên.** Đếm thật: **1077/1161 phiên chỉ khai 1 file bắt buộc**.
  Với 1 file thì một sinh viên hoặc nộp (đủ) hoặc không (chưa nộp) — không có trạng thái "thiếu".

Nên trên thực tế trục ba mức **thoái hoá thành một mức**. Giảng viên không sai; họ chỉ không thể
biết nguyên nhân nằm hai tầng bên dưới UI.

### 1.2 Trục thay thế — dùng dữ liệu đã có, và khớp đúng quyết định của giảng viên

Giảng viên viết: *"cái nào cần gọi tên sinh viên ngay, cái nào chỉ cần chờ"*, và *"đáng lo hơn nhiều so
với 1 sinh viên **chưa từng vào phòng**"*. Đó không phải trục "file hỏng hay không" — đó là trục
**sinh viên có thật sự ngồi thi hay không**, và dữ liệu đó nằm sẵn trong `agent_connection_event`
(1734 sự kiện / 487 phiên; 634 lượt sinh viên từng vào phòng, 2596 lượt chưa bao giờ).

| Mức | Điều kiện | Vì sao xếp ở đó |
|---|---|---|
| 🔴 1 | Đã vào phòng thi, **không có bài nào** | Sinh viên có ngồi thi mà không gì về tới — **bài có thể đã mất**. Ca duy nhất mà lỗi có thể thuộc về hệ thống, không phải sinh viên |
| 🟠 2 | Nộp được vài file, **thiếu** | Có mặt, có nộp, thiếu — gọi bổ sung được |
| 🟡 3 | **Chưa từng vào phòng** | Vắng thi — việc hành chính |
| 🟢 — | Đủ mọi file bắt buộc | `✓ Đủ` |

Hôm nay cả ba ca đầu **đều hiện y hệt** là "N sinh viên chưa nộp", vì `notSubmittedCount` gộp
"vắng mặt" với "ngồi thi mà mất bài".

User đã xác nhận giữ 🔴 ở đầu: *"vẫn có phòng trường hợp agent vẫn có lỗ hổng"*.

### 1.3 "Không có cách nào *đã biết rồi, đừng nhắc nữa*" — spec trước thiếu trục thời gian

Đây là lỗi của spec trước, không phải của implementation. Quy tắc "cần chú ý" đối xử **y hệt nhau**
một phiên kết thúc hôm qua thiếu 1 bài và một phiên kết thúc 8 tháng trước thiếu 1 bài. Sửa được
"dồn đống file" nhưng đẻ ra "dồn đống cảnh báo xuyên mọi học kỳ".

**Mốc tự nhiên user muốn là "xuất điểm cho phiên đó" — nhưng nó cũng chưa tồn tại.**
`GradeExportEntity` chỉ có file entity đăng ký trong `data-source.ts`, không service, không controller;
bảng `grade_export` có **0 dòng**; máy trạng thái chấm điểm chưa bao giờ đi quá
`auto_approved`/`flagged_for_review` (dữ liệu thật: 27 + 1, không có `teacher_reviewed`/`finalized`/`exported`).
User xác nhận module xuất điểm **còn xa**.

⇒ Xây **một khái niệm "đã khép", một cột, hai nguồn kích hoạt theo thời gian**: thủ công bây giờ,
tự động khi module xuất điểm ra đời. Không phải hai cơ chế.

### 1.4 "Thấy cùng một phiên hai lần"

Giảng viên tự viết ra lời giải: *"nếu chủ đích là trên cho tôi biết cái gì gấp, dưới cho tôi duyệt theo
lớp thì tôi hiểu được, **nhưng không có gì nói cho tôi biết điều đó**"*. Spec trước cố ý lặp và vẫn
cho là đúng — nhưng chỉ đặt một con số `N cần chú ý` ở header nhóm, tức **đếm**, không phải **giải thích**.

**Bố cục mới xoá bỏ sự lặp hoàn toàn** thay vì đi giải thích nó (§5).

### 1.5 Bối cảnh về dữ liệu thử

Các phiên `test create` / `Phiên sao lưu mtegq732` mà giảng viên thấy là **rác dev của user**, không phải
quy trình thật của giảng viên. Nhưng nhu cầu lưu trữ phiên nháp vẫn có thật, và **chỉ lưu trữ mới dọn
được chúng** — cả trục màu mới lẫn mốc "đã chấm" đều không, vì những phiên đó có 0 bài nộp nên
không bao giờ được chấm.

---

## 2. Phạm vi

**Trong phạm vi:** trục mức độ mới, phạm vi học kỳ, bộ lọc loại/phòng, archive, khép, bố cục hai cột
với bảng thẳng cột.

**Ngoài phạm vi, có chủ đích:** luồng sinh `invalid`; module xuất điểm; API `teacher_review`;
mọi thay đổi lên trang lobby thi live.

---

## 3. Backend

### 3.1 Migration — 2 cột trên `exam_session`

```sql
ALTER TABLE examcollect.exam_session ADD COLUMN archived_at         timestamptz NULL;
ALTER TABLE examcollect.exam_session ADD COLUMN attention_closed_at timestamptz NULL;
```

Cột trên `exam_session` chứ không phải bảng nối: mỗi phiên có **đúng một** giảng viên sở hữu
(`exam_session.teacher_id`), nên không có trạng thái per-user để tách ra. Bảng nối ở đây là phức tạp thừa.

Không cần index: bảng nhỏ, và mọi truy vấn đã lọc theo `teacher_id` trước.

### 3.2 `SessionOverviewItem` — thêm 6 field, bỏ 1

```ts
  // MỚI — phạm vi
  semesterId: string;
  semesterName: string;

  // MỚI — trục mức độ (thay thế notSubmittedCount)
  /** Có ít nhất 1 agent_connection_event cho phiên này, và 0 bài nộp. */
  attendedNoSubmissionCount: number;
  /** Không có event nào, và 0 bài nộp. */
  neverAttendedCount: number;

  // MỚI — vòng đời
  archivedAt: string | null;
  attentionClosedAt: string | null;

  // BỎ: notSubmittedCount  (= attendedNoSubmissionCount + neverAttendedCount)
  // GIỮ NGUYÊN: invalidFileCount — vẫn trả về, nhưng UI KHÔNG dùng (xem §4.4)
```

**Bất biến bắt buộc:**
`fullySubmittedCount + partialCount + attendedNoSubmissionCount + neverAttendedCount === expectedCount`
(khi `requiredDeliverableCount > 0`).

### 3.3 Truy vấn — attendance là quan hệ một-nhiều **thứ tư**

Spec trước đã cảnh báo về fan-out với ba quan hệ. Đây là cái thứ tư, và nó phải đi theo đúng luật cũ:
**CTE pre-aggregate, không join thô**.

```sql
attended AS (
  -- Một dòng mỗi (phiên, SV từng kết nối). DISTINCT ở đây là thứ chặn fan-out:
  -- một sinh viên có thể có hàng chục event connect/disconnect trong một phiên.
  SELECT DISTINCT a.exam_session_id, a.student_mssv
  FROM examcollect.agent_connection_event a
  JOIN examcollect.exam_session s ON s.id = a.exam_session_id
  WHERE s.teacher_id = $1
),
```

`universe` giữ nguyên định nghĩa cũ (`roster ∪ người-đã-nộp`), nay `LEFT JOIN attended` ở **đúng grain
(phiên, SV)** — một-một, nên không sinh fan-out:

```sql
universe AS (
  SELECT COALESCE(r.exam_session_id, p.exam_session_id) AS exam_session_id,
         COALESCE(r.student_mssv,   p.student_mssv)     AS student_mssv,
         COALESCE(p.collected_files, 0)                 AS collected_files,
         COALESCE(p.invalid_files,   0)                 AS invalid_files,
         (att.student_mssv IS NOT NULL)                 AS ever_attended
  FROM roster_students r
  FULL OUTER JOIN per_student p
    ON p.exam_session_id = r.exam_session_id AND p.student_mssv = r.student_mssv
  LEFT JOIN attended att
    ON att.exam_session_id = COALESCE(r.exam_session_id, p.exam_session_id)
   AND att.student_mssv    = COALESCE(r.student_mssv,   p.student_mssv)
)
```

Phân loại ở `per_session`:

```sql
COUNT(*) FILTER (WHERE u.collected_files = 0 AND u.invalid_files = 0
                   AND u.ever_attended)                       AS attended_no_submission,
COUNT(*) FILTER (WHERE u.collected_files = 0 AND u.invalid_files = 0
                   AND NOT u.ever_attended)                   AS never_attended,
```

`partial` và `fully_submitted` giữ nguyên. Semester join thêm vào câu `SELECT` cuối:
`JOIN semester sem ON sem.id = c.semester_id` (một-một, không rủi ro).

### 3.4 Lỗ hổng đã biết, có chủ đích, phải ghi ra

`universe` **không** hợp thêm `attended`. Hệ quả: một **sinh viên thi ghép** (home class khác) đã vào
phòng và **không nộp gì** sẽ không nằm trong `universe` — họ không trên roster, không có bài nộp — nên
không được đếm vào 🔴, dù đó đúng là ca 🔴 tệ nhất.

**Vì sao vẫn chọn thế:** hợp `attended` vào `universe` sẽ đổi `expectedCount` của **mọi** phiên, và
`expectedCount` đang bị ràng buộc phải khớp với số dòng trang chi tiết dựng ra
(`2026-09-03` spec §3.2 — bảo đảm "hai màn hình không nói hai con số"). Đổi định nghĩa universe là một
thay đổi rủi ro hơn hẳn và thuộc về một spec khác.

**Điều kiện xem lại:** nếu thực tế có ca sinh viên thi ghép mất bài mà trang không báo, kéo việc này lên.

### 3.5 Endpoint mới

Cả bốn dùng lại `findByIdForOwner` — 404/403 y hệt mọi route khác của phiên thi.

| Method | Path | Việc |
|---|---|---|
| `POST` | `/exam-sessions/:id/archive` | `archived_at = now()` |
| `DELETE` | `/exam-sessions/:id/archive` | `archived_at = NULL` |
| `POST` | `/exam-sessions/:id/attention-close` | `attention_closed_at = now()` |
| `DELETE` | `/exam-sessions/:id/attention-close` | `attention_closed_at = NULL` |

Đặt trong `ExamSessionController` (vòng đời của phiên thi), không phải `TeacherSubmissionsController`.

### 3.6 Không phân trang, lọc ở client

`GET /submissions/overview` giữ nguyên: trả **toàn bộ** phiên của giảng viên, không phân trang. Mọi
bộ lọc (học kỳ, mức độ, loại, phòng, trạng thái) chạy **ở client**.

Lý do: facet count phải phản ánh các bộ lọc khác đang bật (§4.3), và tính điều đó ở client trên một
mảng vài trăm phần tử là chuyện vặt, còn làm ở server thì phải bịa ra một API facet.

**Giả định quy mô, và điều kiện xem lại:** vài chục phiên/học kỳ × vài năm ≈ vài trăm dòng. Nếu một
giảng viên vượt ~2000 phiên thì chuyển lọc học kỳ sang server.

---

## 4. Frontend — logic

### 4.1 `submission-attention.ts` — viết lại phần lý do

```ts
export type AttentionKind = 'attended-no-submission' | 'partial' | 'never-attended';

export interface AttentionReason {
  kind: AttentionKind;
  count: number;
  label: string;
  tone: 'danger' | 'warning' | 'caution';
  priority: 1 | 2 | 3;
}
```

Nhãn, dùng nguyên văn:

| kind | label | tone | priority |
|---|---|---|---|
| `attended-no-submission` | `N sinh viên vào phòng nhưng không có bài` | `danger` | 1 |
| `partial` | `N sinh viên nộp thiếu file` | `warning` | 2 |
| `never-attended` | `N sinh viên vắng thi` | `caution` | 3 |

Hai cổng chặn của spec cũ **giữ nguyên**: chỉ phiên `ended` mới bị kết luận, và `hasRatio` phải true.
Thêm cổng thứ ba: **phiên `archived` hoặc `attentionClosed` không bao giờ sinh lý do.**

**Tương tác với `rosterKnown = false`, ghi ra để khỏi hiểu nhầm:** phiên không gắn lớp vẫn bị `hasRatio`
chặn như cũ, nên không sinh lý do nào. Điều đó **không** mâu thuẫn với trục mới: khi roster rỗng,
`universe` chỉ còn người đã nộp, mà người đã nộp thì không rơi vào 🔴 hay 🟡 — nên cả hai mức đó
tự nhiên bằng 0. Cổng `hasRatio` và trục mới nhất quán với nhau, không phải hai luật đá nhau.

### 4.2 Cột "Tình trạng" — một cột nói mọi thứ

> **Đây là chỗ tôi lệch khỏi mockup đã duyệt, và cần user biết.** Mockup gọi cột này là "Cần chú ý",
> nhưng mọi dòng trong mockup đều là phiên đã kết thúc. Phiên **đang diễn ra** hoặc **đang thu bài**
> chưa được phép kết luận — mà bảng lại không còn cột badge trạng thái nào (đã bỏ để chữa phàn nàn #4).
> Nên cột này gánh cả hai vai và đổi tên thành **"Tình trạng"**:

| Phiên | Ô hiện gì |
|---|---|
| Chưa diễn ra / Đang diễn ra / Đang thu bài | Tên pha, màu trung tính — **không** kết luận gì |
| Đã kết thúc, có lý do | Các lý do theo thứ tự ưu tiên, nối bằng `·` |
| Đã kết thúc, đủ bài | `✓ Đủ` màu xanh |
| Đã khép | Nhãn `Đã khép` + nút hoàn tác |
| Nháp / Đã huỷ | Tên trạng thái, trung tính |

Ô trống bị cấm: ô trống trông giống "chưa tính xong" hơn là tin tốt.

### 4.3 Bộ lọc

Nhóm lọc trong cột trái: **Học kỳ** (select, đơn) · **Tình trạng** (4 mục, đa chọn) ·
**Loại kỳ thi** (đa chọn) · **Phòng thi** (đa chọn) · **Trạng thái vòng đời** (2 công tắc).

- Trong một nhóm: **OR**. Giữa các nhóm: **AND**.
- **Số đếm phản ánh các bộ lọc khác đang bật** — bật phòng `A3-01` thì thấy ngay `Thiếu file 0`,
  biết trước bấm vào sẽ rỗng.
- **Nhóm chỉ có ≤1 giá trị thì không render.** Dạy cả kỳ ở một phòng thì mục "Phòng thi" biến mất —
  bộ lọc một lựa chọn là nhiễu.
- Nhóm môn/lớp rỗng sau khi lọc thì ẩn.
- Có link `✕ Xoá tất cả bộ lọc` khi có bộ lọc đang bật.

**Học kỳ mặc định:** học kỳ đang chạy (`CURRENT_DATE BETWEEN start_date AND end_date`); nếu không có,
**kỳ gần nhất đã qua**; nếu nhiều kỳ cùng thoả (dữ liệu bẩn), lấy `start_date` mới nhất.

**Mặc định vòng đời:** ẩn phiên `archived`, **hiện** phiên `attentionClosed` (chúng vẫn là việc thật,
chỉ là không cần chú ý nữa).

**Khi một phiên vừa `archived` vừa `attentionClosed`: `archived` thắng** — nó bị ẩn khỏi cả trang, và
công tắc "Hiện phiên đã khép" không kéo nó về. Hai trạng thái độc lập nhau ở tầng dữ liệu (khép rồi
vẫn lưu trữ được, và ngược lại), nhưng ở tầng hiển thị thì `archived` là quyết định mạnh hơn: nó nói
"phiên này không phải việc thật", còn `attentionClosed` chỉ nói "việc thật này đã xong".

### 4.4 `invalidFileCount` ngủ

Vẫn nhận từ API, **không render**, không sinh lý do. Một hằng số có comment giải thích rằng nó ngủ tới
khi có luồng sinh `invalid`. Đừng để giảng viên tin hệ thống đang canh một thứ nó không canh.

---

## 5. Frontend — bố cục

### 5.1 Hai cột

```
┌─ ô tìm sinh viên ─────────────────────────────────────────────┐
├──────────────┬────────────────────────────────────────────────┤
│ CỘT LỌC      │  MỘT BẢNG DUY NHẤT                             │
│ (dính, 205px)│  Phiên thi 36% | Loại | Thời gian | Phòng |    │
│              │  Tình trạng | Thao tác                          │
└──────────────┴────────────────────────────────────────────────┘
```

**Không còn dải "Cần chú ý" riêng.** Đây là thứ xoá bỏ phàn nàn #1 tận gốc: không có danh sách thứ hai
thì không có gì để thấy hai lần. Cột trái là **bảng điều khiển** — tóm tắt + bộ lọc — không phải bản sao.

### 5.2 Bảng: **một** `<table>` cho cả trang

Tiêu đề nhóm là `<tr>` với `<td colspan>` **bên trong cùng bảng đó**.

> **Đây là chi tiết quyết định việc chọn bảng có ăn thua hay không.** Nếu mỗi nhóm là một `<table>`
> riêng, cột sẽ lệch giữa các nhóm và toàn bộ lợi thế quét mắt biến mất — mà đó chính là lý do chọn
> bảng thay vì thẻ. Một bảng, cột thẳng xuyên suốt.

Tiêu đề nhóm: `Môn — Lớp · N phiên · M sinh viên · K cần chú ý`

**`M sinh viên` là chỗ ở mới của mẫu số.** Spec trước hiện `20/22` trên **mọi dòng**; đối chiếu từng ca
cho thấy nó trùng thông tin với cột lý do ở 3/5 tình huống (`0/1` và "1 vắng thi" là cùng một sự thật;
`20/22` và "2 thiếu file" cũng vậy). Thứ duy nhất nó nói thêm là **mẫu số**, mà mẫu số là thuộc tính của
**lớp**, không phải của phiên. Nên viết **một lần ở tiêu đề nhóm** và bỏ hẳn cột. Chỗ trống thu được
đổ vào cột tên (36%) để tên phiên dài không bị cắt.

Cột `Thời gian` và mọi số dùng `tabular-nums` để thẳng cột thật.

### 5.3 Cột Thao tác — 4 icon + tooltip

`Eye` Chi tiết · `ClipboardCheck` Chấm điểm · `CircleCheck` Khép · `Archive` Lưu trữ.
Icon Lucide, **không** emoji. Mỗi nút có `aria-label` và tooltip — icon một mình không phải nhãn tiếp cận được.

Không nút nào bị giấu sau menu: user yêu cầu rõ *"nên hiện hết các button thao tác"*. Chọn icon thay vì
chữ để 4 nút × N dòng không thành thứ rộng nhất mỗi dòng — đúng nguyên tắc "bớt thứ tranh chỗ" đã dùng
để chữa phàn nàn #4.

`Khép` và `Lưu trữ` đảo thành `Mở lại` / `Bỏ lưu trữ` khi phiên đang ở trạng thái đó.

### 5.4 Chữ, không phải pill (phàn nàn #4)

`Loại` và pha trạng thái từng là badge xám nhạt, mờ khi quét nhanh. Trong bảng chúng thành **chữ thường
tương phản cao ở cột riêng**. Thứ duy nhất còn màu là cột **Tình trạng** — chấm tròn + chữ đậm — nên nó
là thứ mắt bắt được đầu tiên. Vừa dễ đọc hơn vừa hết tranh chỗ.

### 5.5 Dải cảnh báo "hỏng theo phòng"

Hiện khi **tất cả** phiên 🔴 trong phạm vi đang xem cùng một phòng, **và** có ≥2 phiên như vậy,
**và** chúng trải ≥2 môn khác nhau.

Điều kiện ≥2 môn là để không kêu oan khi một môn thi nhiều ca ở phòng cố định của nó.

Copy: *"Cả N phiên nghi mất bài trong phạm vi này đều ở phòng X, trải M môn khác nhau — nhiều khả năng
là sự cố máy/mạng của phòng, không phải do sinh viên."*

### 5.6 Màn hình hẹp

Dưới `lg`, cột lọc xếp **lên trên** bảng và thu gọn thành hàng chip cuộn ngang. Bảng cuộn ngang trong
khung riêng; cột `Phiên thi` và `Tình trạng` dính lại, các cột giữa cuộn.

---

## 6. Kiểm thử

**Backend — trục mức độ (e2e, Postgres thật):**
- SV trên roster **có** event, 0 bài → `attendedNoSubmissionCount`, **không** phải `neverAttended`.
- SV trên roster **không** event, 0 bài → `neverAttendedCount`.
- SV nộp thiếu → `partialCount`, bất kể có event hay không.
- **Chống fan-out:** một SV có **10 event connect/disconnect** trong một phiên → vẫn đếm là **1**
  (đây là test khoá cái `DISTINCT` ở CTE `attended`).
- Bất biến: 4 nhóm cộng lại bằng `expectedCount` ở mọi phiên có `requiredDeliverableCount > 0`.
- Phiên archived/closed vẫn trả về đủ số liệu (lọc là việc của client), kèm timestamp đúng.

**Backend — endpoint vòng đời:**
- Archive/unarchive, close/reopen đổi đúng cột, idempotent.
- GV khác gọi → 404/403 y như mọi route phiên thi khác.

**Frontend — thuần hàm:**
- Mỗi mức trong §4.1 và thứ tự ưu tiên khi một phiên có nhiều lý do.
- Phiên archived hoặc closed → **không** lý do nào, kể cả khi số liệu xấu.
- Grace period và `hasRatio` vẫn chặn như spec cũ (test cũ phải pass **không sửa**).
- Logic facet: OR trong nhóm, AND giữa nhóm; số đếm phản ánh bộ lọc khác; nhóm ≤1 giá trị bị ẩn.
- Chọn học kỳ mặc định: có kỳ đang chạy / không có kỳ nào / nhiều kỳ trùng.
- Điều kiện dải cảnh báo phòng: **fail** khi chỉ 1 phiên, và khi 2 phiên nhưng cùng 1 môn.

**Frontend — bảng:**
- Cả trang là **một** `<table>` — test đếm `table` trong vùng danh sách phải ra đúng 1.
  (Test này khoá đúng cái sai dễ mắc nhất khi implement.)
- Tiêu đề nhóm hiện `M sinh viên`, và **không** dòng nào hiện tỉ lệ `x/y` nữa.
- Cột Tình trạng: phiên đang thu bài hiện tên pha chứ không hiện lý do; phiên đủ hiện `✓ Đủ`;
  không bao giờ có ô trống.
- 4 nút icon đều có `aria-label`; nhãn đảo đúng khi phiên đã archived/closed.

---

## 7. Ngoài phạm vi

- **Luồng sinh `invalid`.** Cần quyết định có cho phép thoát khỏi `invalid` hay không, mà trigger DB
  hiện cấm — tức là đổi schema, không phải thêm một nhánh code.
- **Module xuất điểm** và API `teacher_review`. Khi xuất điểm ra đời, nó set `attention_closed_at`
  tự động — **cùng cột**, không phải cơ chế thứ hai.
- **Trang lobby thi live** — không đụng tới.
- **Hợp `attended` vào `universe`** — §3.4.
