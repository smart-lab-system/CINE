# Design: "Quản lý bài thu" — roll-up theo phiên thi, thay cho bảng phẳng

**Date:** 2026-09-03
**Status:** Approved by user in chat (architectural path — 4 vòng hỏi đáp; quy tắc
"cần chú ý" và bảng ưu tiên do user duyệt trực tiếp)
**Scope:** Tầng 1 (thu bài). Tầng 2 (chấm điểm) tách spec riêng — xem §7.
**Replaces:** PR #19 (bảng phẳng "Quản lý bài thu"),
spec `2026-09-02-submission-session-detail-page-design.md`,
spec `2026-09-02-submissions-page-session-link-design.md`
**Reuses unchanged:** `SubmissionStatusTable`, `lib/submission-rows.ts`,
`GET /submissions`, `/teacher/grading?sessionId=` — tất cả đã tồn tại và đã chạy

---

## 1. Vì sao có spec này

### 1.1 Lời phàn nàn

Trang "Quản lý bài thu" cũ (PR #19) là **một bảng phẳng dồn mọi bài nộp của mọi
phiên thi vào cùng một danh sách**. User: *"nó đang rất khó sử dụng và logic rất
khó hiểu, không giúp ích được gì cho giảng viên quản lý bài thu sinh viên một
cách hiệu quả."*

Chẩn đoán (nguyên văn của user, và đúng): **một bảng phẳng không phải "tổng hợp",
nó là "dồn đống"**. Nó trả lời tốt câu *"tìm 1 dòng cụ thể"*, nhưng câu hỏi thật
khi GV mở trang tổng hợp là *"trong hàng chục phiên thi tôi đang quản lý, phiên
nào cần tôi chú ý ngay bây giờ?"*. Bảng phẳng bắt GV tự lọc, tự đếm, tự suy ra
câu trả lời đó — đúng việc hệ thống phải làm thay họ.

Tệ hơn: bảng phẳng **về mặt dữ liệu không thể** trả lời câu hỏi quan trọng nhất.
Nguồn của nó là `Submission ⋈ ExamSession`, tức là chỉ biết *ai đã nộp*. Nó không
có roster, nên vĩnh viễn không nói được *ai còn thiếu*.

### 1.2 Sự thật nghiệp vụ user cung cấp (không suy ra được từ code)

- **~8 kỳ thi/năm**, mỗi kỳ một phiên thi khác nhau.
- **Một sinh viên có thể dự cả 8 kỳ**, và các kỳ cách nhau nhiều tháng.
- Suy ra: GV **không thể nhớ** một bài nộp thuộc phiên nào. Nhu cầu tra cứu theo
  MSSV là thật, không phải suy đoán — nhưng câu trả lời đúng cho nó là *"nằm ở
  phiên này"*, chứ không phải một dòng file lạc giữa danh sách.
- **Quy mô: vài chục phiên/giảng viên.** Suy ra: trang tổng hợp **không phân
  trang**; tải hết rồi nhóm ở client là hoàn toàn ổn.

### 1.3 Đã xóa những gì (trước spec này)

`apps/web/src/app/teacher/submissions/**` (cả 2 trang + test),
`apps/web/src/hooks/useTeacherSubmissions.ts`,
`apps/web/src/lib/api/submissions.ts`, và nav entry trong `lib/nav-config.ts`.

**Cố ý không xóa** (dùng chung với trang lobby, xóa là vỡ):
`SubmissionStatusTable.tsx`, `lib/submission-rows.ts`, `useDebouncedValue.ts`, và
**toàn bộ backend** — kể cả `GET /submissions`, endpoint mà spec này dùng lại cho
chức năng search.

Trang chi tiết `[sessionId]` lấy lại nguyên văn từ git:
`git show 3e8b1c5:apps/web/src/app/teacher/submissions/[sessionId]/page.tsx`

---

## 2. Các hướng đã cân nhắc

- **A — thêm cột roll-up vào "Quản lý kỳ thi"** (`/teacher/exam-sessions`). Rẻ
  nhất, tái dùng filter sẵn có. Đã bị user loại từ vòng trước: cần một trang dành
  riêng cho việc soát bài thu, không phải một cột rộng thêm trên danh sách phiên.

- **B — trang roll-up riêng + trang chi tiết theo phiên (CHỌN).** Chi tiết §4–§5.

- **C — bung accordion ngay trên trang tổng hợp.** Lý do loại nó ở spec 2026-09-02
  (*"re-implements a second version of the per-session status table"*) **hôm nay
  không còn đúng** — bảng đó đã được tách thành component dùng chung trong chính
  lần làm đó. Nên C **không còn trùng lặp code**. Nó bị loại vì lý do khác: action
  set trên mỗi bài (tải về, sang chấm, hiện điểm, chấm lại) quá nặng cho một dòng
  bung inline, và một phiên 45 SV bung ra sẽ đẩy các phiên khác trôi khỏi màn hình.

- **Bảng phẳng: bỏ hẳn, thay bằng search toàn cục** (§4.5). User xác nhận nhu cầu
  tra cứu là thật, nhưng hình thức trả lời phải là *phiên thi*, không phải *dòng
  file*.

- **Điểm đến khi click 1 phiên: KHÔNG dùng lại trang lobby.** Lobby
  (`/exam-sessions/[id]`) là màn hình live thật: mở websocket, `teacher:subscribe`,
  `AccessRequestPanel` (duyệt SV xin vào phòng), nút xác nhận điểm danh,
  `FinalizeSessionButton`. Mở một phiên từ 3 tháng trước ở đó là bày ra một loạt
  hành động vô nghĩa. (Nút đỏ "Chốt bài ngay" đã tự ẩn khi phiên hết `active`, nên
  không nguy hiểm — chỉ là nhiễu.)

---

## 3. Backend: endpoint roll-up mới

Con số `38/40` **hiện không tồn tại ở đâu cả**. Để tính cho MỘT phiên hôm nay phải
gọi 3 request (`GET /exam-sessions/:id` cho `requiredDeliverables`, `/attendance`
cho `rosterSize`, `/submissions` cho ai đã nộp). Trang này liệt kê hàng chục phiên,
tức là `3 × N` request từ browser. Không dùng được.

### 3.1 `GET /submissions/overview`

Thêm vào `TeacherSubmissionsController` (đã có, class-level path `submissions`, đã
`@Roles('teacher')`). Không phân trang — §1.2.

```ts
export interface SessionOverviewItem {
  // Định danh phiên — đủ để GV nhận ra "à, kỳ này" sau nhiều tháng
  id: string;
  name: string;
  code: string;
  courseId: string;
  courseName: string;
  classId: string | null;
  className: string | null;
  roomName: string;
  examType: 'TK' | 'GK' | 'CK';
  startTime: string;   // ISO
  endTime: string;     // ISO
  status: ExamSessionStatus;

  // Roll-up
  requiredDeliverableCount: number;
  /** |roster ∪ người đã nộp| — xem §3.2 về vì sao là HỢP, không phải rosterSize. */
  expectedCount: number;
  /** false khi phiên không gắn lớp, hoặc lớp chưa có roster. */
  rosterKnown: boolean;
  /** SV nộp ĐỦ mọi file bắt buộc. */
  fullySubmittedCount: number;
  /** SV nộp >= 1 file nhưng còn thiếu. */
  partialCount: number;
  /** SV nằm trong expectedCount mà không có bài nộp nào. */
  notSubmittedCount: number;
  /** Số FILE có status 'invalid' (đếm theo file, không theo SV). */
  invalidFileCount: number;
}
```

Trả về `{ items: SessionOverviewItem[] }`.

### 3.2 Mẫu số phải khớp với trang chi tiết

`expectedCount` là **kích thước của hợp `roster ∪ người-đã-nộp`**, không phải
`rosterSize`. Lý do: trang chi tiết dựng dòng bằng `buildSubmissionRows`, vốn hợp
attendance với submissions — SV thi ghép (`makeup`, thuộc lớp khác cùng môn) có
bài nộp nhưng không nằm trên roster. Nếu overview đếm theo `rosterSize` còn chi
tiết đếm theo hợp, hai màn hình sẽ nói hai con số khác nhau cho cùng một phiên.
**Đó là lỗi, và là loại lỗi làm GV mất tin vào toàn bộ trang.**

`rosterKnown = rosterSize > 0`. Khi `false`, `notSubmittedCount` **phải là 0** và
UI không được hiển thị mẫu số (§4.2) — không có roster thì không thể biết là thiếu.

### 3.3 Truy vấn — BẮT BUỘC pre-aggregate, tuyệt đối không flat join rồi GROUP BY

**Đây là chỗ dễ ship sai số nhất trong toàn bộ spec.** §3.2 đã cảnh báo lệch số là
"loại lỗi làm GV mất tin vào toàn bộ trang" — cảnh báo đó áp cho chính câu query này.

#### Vấn đề: fan-out từ BA quan hệ một-nhiều, không phải hai

Một `exam_session` có nhiều:
1. `submission` (nhiều SV × nhiều deliverable)
2. `enrollment` (qua `class_id` — cả roster)
3. `required_deliverable` (số file bắt buộc)

Join thô cả ba vào một câu phẳng rồi `GROUP BY s.id` cho số dòng bằng **tích** của
ba nhánh. Một phiên 40 SV, 3 file bắt buộc, 120 submission sẽ ra
`120 × 40 × 3 = 14.400` dòng cho **một** phiên — và mọi `COUNT` trên đó đều sai.

#### `COUNT(DISTINCT ...)` KHÔNG đủ để chữa

`COUNT(DISTINCT student_mssv)` cứu được đúng những cột đếm *người*. Nó **im lặng
thất bại** ở hai chỗ:

- **`invalidFileCount` đếm FILE, không đếm người.** `COUNT(*) FILTER (WHERE status =
  'invalid')` bị nhân bởi `rosterSize × requiredDeliverableCount`. `DISTINCT` trên
  `student_mssv` không sửa được vì đơn vị đếm không phải người; phải là
  `COUNT(DISTINCT submission.id)`.
- **`fullySubmittedCount` / `partialCount` là aggregate HAI TẦNG** — phải đếm số
  file *của từng SV* trước, rồi mới đếm số SV thoả điều kiện. Một `GROUP BY` phẳng
  **về nguyên tắc không diễn đạt được** phép này, dù có `DISTINCT` bao nhiêu lần.

Nên hướng "rắc `DISTINCT` vào đúng chỗ" bị **loại**. Không phải vì nó khó, mà vì nó
đúng một cách tình cờ ở vài cột và sai thầm lặng ở vài cột khác — không ai đọc lại
câu SQL đó sáu tháng sau mà biết cột nào thuộc loại nào.

#### Cấu trúc bắt buộc: CTE, mỗi cái tự aggregate về khoá của nó trước khi join

```sql
WITH deliv AS (                 -- 1 dòng / phiên
  SELECT exam_session_id, COUNT(*) AS required_count
  FROM required_deliverable GROUP BY exam_session_id
),
roster_students AS (            -- 1 dòng / (phiên, SV trên roster)
  -- Định nghĩa roster PHẢI khớp AttendanceService.buildView: enrollment
  -- được khoá theo (course_id, home_class_id), KHÔNG có cột class_id.
  -- Khi s.class_id IS NULL thì không dòng nào khớp -> roster rỗng ->
  -- rosterKnown = false, đúng như §3.2 cần.
  SELECT s.id AS exam_session_id, e.student_mssv
  FROM exam_session s
  JOIN enrollment e
    ON e.course_id = s.course_id
   AND e.home_class_id = s.class_id
  WHERE s.teacher_id = :teacherId
),
per_student AS (                -- TẦNG 1: 1 dòng / (phiên, SV đã nộp gì đó)
  SELECT exam_session_id, student_mssv,
         COUNT(DISTINCT required_deliverable_id)
           FILTER (WHERE status = 'collected')      AS collected_files,
         COUNT(DISTINCT id) FILTER (WHERE status = 'invalid') AS invalid_files
  FROM submission GROUP BY exam_session_id, student_mssv
),
universe AS (                   -- roster ∪ người đã nộp — xem ghi chú dưới
  SELECT COALESCE(r.exam_session_id, p.exam_session_id) AS exam_session_id,
         COALESCE(r.student_mssv,   p.student_mssv)     AS student_mssv,
         COALESCE(p.collected_files, 0)                 AS collected_files,
         COALESCE(p.invalid_files,   0)                 AS invalid_files
  FROM roster_students r
  FULL OUTER JOIN per_student p
    ON p.exam_session_id = r.exam_session_id AND p.student_mssv = r.student_mssv
),
per_session AS (                -- TẦNG 2: 1 dòng / phiên
  SELECT u.exam_session_id,
         COUNT(*)                                              AS expected_count,
         COUNT(*) FILTER (WHERE u.collected_files >= COALESCE(d.required_count, 0)
                            AND COALESCE(d.required_count, 0) > 0) AS fully_submitted,
         COUNT(*) FILTER (WHERE (u.collected_files > 0 OR u.invalid_files > 0)
                            AND u.collected_files < COALESCE(d.required_count, 0)) AS partial,
         COUNT(*) FILTER (WHERE u.collected_files = 0 AND u.invalid_files = 0) AS not_submitted,
         SUM(u.invalid_files)                                  AS invalid_file_count
  FROM universe u
  LEFT JOIN deliv d ON d.exam_session_id = u.exam_session_id
  GROUP BY u.exam_session_id
)
SELECT ... FROM exam_session s
  JOIN      course c ON ...
  LEFT JOIN class  cl ON ...
  JOIN      room   r  ON ...
  LEFT JOIN deliv        ON deliv.exam_session_id       = s.id
  LEFT JOIN per_session  ON per_session.exam_session_id = s.id
  LEFT JOIN (SELECT exam_session_id, COUNT(*) AS roster_size
             FROM roster_students GROUP BY exam_session_id) rs ON rs.exam_session_id = s.id
WHERE s.teacher_id = :teacherId
```

**Mọi join ở câu `SELECT` cuối đều là một-một** (mỗi CTE đã aggregate về khoá của
nó). Fan-out không còn *khả năng* xảy ra — chặn bằng cấu trúc, không phải bằng
`DISTINCT` vá chỗ.

#### `universe` chính là bản SQL của `buildSubmissionRows`

Đây là điểm đáng chú ý: `FULL OUTER JOIN` giữa roster và người-đã-nộp **đúng là phép
hợp** mà `buildSubmissionRows` làm ở frontend (§3.2). Nên bản sửa fan-out và bản đảm
bảo "hai màn hình không lệch số" **là cùng một bản sửa**. Nếu ai đó sau này rút gọn
`universe` thành một `LEFT JOIN` từ roster, cả hai bảo đảm đó mất cùng lúc.

**Một điểm lệch đã biết, có chủ đích, phải ghi ra:** frontend hợp thêm
`attendance.makeup`, mà `AttendanceService.buildView` **lọc `makeup` chỉ còn SV đang
kết nối** (`if (!state.connected) continue`). Nên một SV thi ghép *đang online* mà
chưa nộp gì sẽ có dòng ở trang chi tiết nhưng **không** nằm trong `universe` của SQL
(SQL không đọc `agent_connection_event`, và không nên đọc — đó là trạng thái sống,
phụ thuộc thời điểm truy vấn).

Điểm lệch này **chỉ tồn tại trong lúc phiên đang chạy hoặc đang trong grace** — khi
đó agent đã ngắt kết nối thì `makeup` rỗng, hai bên khớp tuyệt đối. Và đó cũng đúng
là khoảng thời gian mà trang tổng hợp cố tình **không** kết luận gì (hiện "Đang diễn
ra" / "Đang thu bài", không badge cần chú ý — §4.2/§4.3). Nên test khớp số ở §8
**phải nhắm vào phiên ĐÃ kết thúc**, không phải phiên đang chạy; khớp số ở phiên
đang chạy không phải bảo đảm của spec này.

#### Ba biên phải xử lý đúng, đều đã nằm trong SQL trên

- **SV chỉ có file `invalid`, không có file `collected` nào.** `collected_files = 0`
  nhưng **không được** đếm là "chưa nộp" — họ đã nộp, chỉ là file không dùng được.
  Vì thế `not_submitted` phải hỏi cả `invalid_files = 0`, và `partial` phải nhận
  `invalid_files > 0`. Bỏ điều kiện này là biến một ca "file hỏng" (ưu tiên 1 đỏ)
  thành một ca "vắng thi" (ưu tiên 3 vàng) — **hạ sai mức ưu tiên của đúng ca gấp
  nhất**.
- **`required_count = 0`** (phiên chưa khai file bắt buộc): `deliv` không có dòng →
  `COALESCE(..., 0)`. Không ai được tính là `fully_submitted` (không có gì để nộp
  đủ), và phiên đó **không bao giờ cần chú ý**. Lưu ý ba nhóm khi đó **không phủ hết**
  `expected_count` (người đã nộp không thuộc nhóm nào) — nên **UI phải đối xử với
  `requiredDeliverableCount === 0` y như `rosterKnown === false`**: không hiện tỉ lệ
  nào cả, chỉ chú thích *"phiên chưa khai file bắt buộc"*. Hiện `0/40` ở đây là báo
  động giả kiểu ngược: con số trông đáng sợ trên một phiên mà chính spec này nói là
  không cần chú ý.
- **`rosterKnown = false`** (`class_id IS NULL` hoặc roster rỗng → `rs.roster_size`
  NULL/0): `universe` khi đó chỉ còn người đã nộp ⇒ `not_submitted` tự nhiên bằng 0,
  khớp đúng ràng buộc ở §3.2 mà không cần điều kiện riêng.

Phạm vi luôn khoá bằng `exam_session.teacher_id = :teacherId` — **ở cả `roster_students`
và câu `SELECT` cuối**, không bao giờ qua tham số của caller, đúng nguyên tắc
`listForTeacher` đang dùng.

### 3.4 Search theo MSSV: tái dùng endpoint đã có, không viết mới

`GET /submissions?search=` **vẫn còn nguyên** (chỉ có client bị xóa). Nó khớp MSSV
hoặc tên SV, teacher-scoped, và mỗi dòng đã mang sẵn `examSessionId` +
`examSessionName`. Frontend gom theo `examSessionId` là ra danh sách phiên. Zero
backend mới.

**Giới hạn phải ghi rõ ra UI:** endpoint này chỉ tìm được SV **đã nộp ít nhất 1
file**. SV không nộp gì sẽ không xuất hiện. Empty state vì thế **không được** nói
"không tìm thấy" cụt lủn, mà phải nói đúng sự thật:

> *"Không tìm thấy bài nộp nào khớp «`<từ khoá>`». Sinh viên chưa nộp gì sẽ không
> xuất hiện ở đây — hãy mở phiên thi tương ứng để xem danh sách vắng."*

(Tra cứu theo roster — tìm được cả SV không nộp gì — cần lookup trên `enrollment`.
Ngoài phạm vi Tầng 1, ghi ở §7.)

---

## 4. Màn hình 1 — `/teacher/submissions` (trang roll-up)

### 4.1 Quy tắc "cần chú ý" — phần quan trọng nhất của spec này

Badge **mang một LÝ DO, không mang một con số**. Lý do: `38/40` gộp chung ba tình
huống đòi ba hành động hoàn toàn khác nhau. Thứ tự ưu tiên (user duyệt trực tiếp,
đối chiếu với thực tế đi dạy):

| Ưu tiên | Điều kiện | Copy | Vì sao xếp ở đó |
|---|---|---|---|
| 1 (đỏ) | `invalidFileCount > 0` | `N file không hợp lệ` | File có mà hỏng — bỏ sót là **mất bài thật**, và không có gì khác trong hệ thống la lên |
| 2 (cam) | `partialCount > 0` | `N sinh viên nộp thiếu file` | Có mặt, có nộp, thiếu — còn gọi bổ sung được |
| 3 (vàng) | `notSubmittedCount > 0` | `N sinh viên chưa nộp` | Vắng thi / sự cố — xử lý theo quy chế |

Một phiên có thể mang nhiều lý do cùng lúc; hiện tất cả, sắp theo thứ tự trên.
Độ ưu tiên của phiên = lý do gấp nhất mà nó có.

### 4.2 Hai trường hợp TUYỆT ĐỐI không được kêu "cần chú ý"

**(a) Đang trong grace period 30 phút.** `SUBMISSION_GRACE_PERIOD_MS` cho agent
nộp tiếp tới `endTime + 30 phút` — comment trong code giải thích rõ: 40 máy hash +
PUT cùng lúc qua mạng LAB, cắt cứng ở `endTime` sẽ giết đúng những bài chậm nhất.
Một phiên vừa kết thúc 2 phút trước mà nhảy lên đầu với cờ đỏ là **báo động giả**
— đúng loại làm GV mất tin vào badge.

Suy ra: trạng thái thứ 4 — **"Đang thu bài"**, `variant="info"`. Không phải "cần
chú ý".

**(b) `rosterKnown === false`.** Không có mẫu số thì không thể biết là thiếu.
Hiển thị `"đã thu N bài"` (không có `/M`), chú thích nhỏ *"phiên không gắn lớp"*.
Không xếp vào nhóm cần chú ý.

### 4.3 Máy trạng thái hiển thị (thuần client, từ `status` + `startTime`/`endTime`)

```
GRACE_MS = 30 * 60_000            // khớp SUBMISSION_GRACE_PERIOD_MS

// 'draft' / 'cancelled': quyết định có chủ ý của GV, đồng hồ không được ghi đè
status 'draft' | 'cancelled'  -> hiện nguyên trạng, KHÔNG xét cần chú ý

// Phiên coi là đã xong khi ĐÃ CHỐT hoặc đã quá giờ — xem ghi chú manual finalize
ended = status === 'completed' || now > endTime

!ended && now < startTime     -> "Chưa diễn ra"
!ended                        -> "Đang diễn ra"
ended && now <= endTime + GRACE_MS -> "Đang thu bài"    <- không cần chú ý
ended                         -> đã kết thúc            <- xét cần chú ý theo §4.1
```

**Vì sao `ended` phải hỏi cả `status`, không chỉ đồng hồ:** `FinalizeSessionButton`
("Chốt bài ngay") cho GV chốt phiên **trước** `endTime`, đặt `status = 'completed'`
ngay lúc đó. Nếu chỉ so `now` với `endTime`, một phiên vừa bị chốt tay lúc 10:00
(với `endTime` 11:00) sẽ hiển thị "Đang diễn ra" suốt một tiếng — sai, và đúng loại
sai làm GV tưởng phiên vẫn đang thi.

**Nhưng biên grace vẫn là `endTime + 30'`, không phải `thời-điểm-chốt + 30'`** — vì
backend cho phép upload theo đúng công thức đó, đã xác minh tại
`submission.service.ts` (`at <= session.endTime.getTime() + SUBMISSION_GRACE_PERIOD_MS`).
Nghĩa là phiên chốt tay lúc 10:00 nằm ở "Đang thu bài" tới 11:30. Không cần thêm
field nào từ backend.

Tái dùng `getDisplaySessionStatus` (`lib/exam-session-display.ts`) làm nền, mở rộng
thêm nhánh "Đang thu bài". *(Ghi chú: docblock của hàm đó nói backend "nothing ever
flips it to completed" — đã lỗi thời, `ExamSessionScheduler` hiện có flip
`active -> completed` thật. Sửa luôn comment khi đụng vào file.)*

### 4.4 Bố cục

**Dải "Cần chú ý" ghim trên cùng — phẳng, cắt ngang mọi môn.** Rồi mới tới phần
duyệt nhóm theo Môn → Lớp bên dưới.

> **Đây là điều chỉnh so với mockup gốc của user, cần user duyệt lại.** Mockup gốc
> đặt phiên cần chú ý ở đầu *trong nhóm môn của nó*. Nhưng yêu cầu gốc là *"phiên
> đã kết thúc nhưng chưa đủ bài **luôn nổi lên đầu**"* — mà GV dạy 6 môn thì vẫn
> phải quét qua 6 nhóm mới gom đủ các phiên cần chú ý. Cho các phiên gấp **thoát
> khỏi grouping** lên một dải riêng vừa giữ đúng câu chữ "nổi lên đầu", vừa giữ
> nguyên cấu trúc duyệt theo môn ở dưới. Phiên đã đủ bài hoặc chưa tới giờ nằm yên
> trong nhóm, không giành chú ý — đúng ý user.

- **Dải trên:** phiên cần chú ý, sắp theo (ưu tiên lý do giảm dần, rồi `startTime`
  giảm dần). Mỗi dòng vẫn hiện môn/lớp để không mất ngữ cảnh khi đã tách khỏi nhóm.
- **Dưới:** nhóm `Môn: <courseName> — Lớp <className>`; trong nhóm sắp theo
  `startTime` giảm dần; nhóm sắp theo `startTime` mới nhất giảm dần.
- Nhóm không có phiên nào cần chú ý: mặc định **thu gọn** (chỉ header + số phiên).
- Không phân trang (§1.2).

**Phiên cần chú ý xuất hiện ở CẢ HAI chỗ — đây là quyết định có ý thức, không phải
hệ quả bỏ sót.** Dải trên là một *view*, không phải một *phép chuyển chỗ*.

Lý do: nhóm Môn/Lớp phải là **danh sách đầy đủ và trung thực** các phiên của môn đó.
Nếu "kéo" phiên ra khỏi nhóm gốc, nhóm "Môn CSDL — Lớp N05" sẽ hiện 2 phiên trong
khi GV biết rõ mình đã tạo 3 — và phiên bị thiếu lại đúng là phiên có vấn đề. GV
duyệt theo môn sẽ kết luận sai rằng phiên đó không tồn tại, hoặc đã bị xoá. Cái giá
của việc lặp một dòng nhỏ hơn nhiều cái giá của một danh sách nói dối.

Để dòng lặp không bị đọc thành hai việc khác nhau: **dòng trong nhóm mang đúng
badge lý do y như dòng ở dải trên**, và header nhóm hiện số phiên cần chú ý bên
trong (vd `Môn CSDL — Lớp N05 · 3 phiên · 1 cần chú ý`). Người đọc thấy ngay đó là
*cùng một phiên nhìn từ hai ngữ cảnh*, không phải hai đầu việc.

### 4.5 Ô search

Một ô duy nhất, debounce 300ms qua `useDebouncedValue` (vẫn còn, đang dùng ở 2
trang khác).

- **Rỗng** → hiện bố cục §4.4 đầy đủ.
- **Có từ khoá** → gọi `GET /submissions?search=`, gom theo `examSessionId`, trang
  co lại chỉ còn những phiên có SV khớp. Mỗi phiên hiện **đủ bộ 5 thứ để nhận ra
  kỳ nào**: môn, lớp, loại kỳ (Thường kỳ / Giữa kỳ / Cuối kỳ), ngày giờ thi, phòng
  — tất cả đã có sẵn trong `SessionOverviewItem`, gộp theo `id`.
- Mỗi phiên trong kết quả search kèm tình trạng của **riêng SV đó** (vd `2/3 file`),
  và link đi kèm `?student=<mssv>` (§5.2).
- Empty state: dùng đúng copy ở §3.4 — không được nói cụt "không tìm thấy".

---

## 5. Màn hình 2 — `/teacher/submissions/[sessionId]` (chi tiết phiên)

### 5.1 Khôi phục nguyên trạng

Lấy lại từ `git show 3e8b1c5:...` — ~128 dòng, không socket, không panel thừa,
gồm: header + badge trạng thái, dòng roll-up *"X/Y sinh viên đã nộp đủ N file bắt
buộc"*, `SubmissionStatusTable`, nút **"Chấm điểm"** sang
`/teacher/grading?sessionId=` (trang chấm **đã đọc được `?sessionId=`**, phần đó
nằm ngoài vùng bị xóa).

### 5.2 `?student=<mssv>` — hai lối vào, hai ý định

Cùng một route, nhưng:

- **Từ nhóm Môn/Lớp** → GV muốn thấy **cả lớp** (ai vắng, ai thiếu file, ai có file
  hỏng). Đúng use case gốc của `SubmissionStatusTable`. Không truyền param.
- **Từ search MSSV** → GV chỉ muốn xem **đúng một SV** đó. Nếu đích đến vẫn là bảng
  45 dòng không phân biệt, GV lại phải tự dò đúng dòng vừa gõ — quay về đúng cái
  "bắt người dùng tự tìm" mà cả thiết kế này đang loại bỏ.

**Xử lý:** truyền `?student=<mssv>` → trang **vừa highlight dòng đó, vừa mở sẵn
Dialog "Xem bài nộp"** của SV đó.

Vì sao mở luôn Dialog chứ không chỉ scroll + highlight: `SubmissionStatusTable`
**đã có sẵn** Dialog đó (`selectedStudentMssv` → `Dialog`), và nội dung của nó đúng
y cái luồng search cần — mỗi file bắt buộc, trạng thái (Đã nộp / Chưa nộp / Không
hợp lệ), nộp lúc, kích thước, định dạng, nút **Mở file**. Chỉ scroll + highlight thì
GV còn một click nữa mới tới đích, và trong bảng 45 dòng "đã scroll tới" không đảm
bảo mắt bắt đúng dòng. Highlight vẫn giữ, làm lớp đỡ: đóng Dialog ra thì vẫn biết
mình đứng ở dòng nào, và vẫn thấy cả lớp để đối chiếu (*"chỉ mình em này thiếu, hay
cả phòng đều thiếu file 3?"*).

**Tên param là `student`, không phải `highlight`** — `highlight` mô tả *cách trang
xử lý*, `student` mô tả *dữ liệu*. Đổi treatment sau này thì tên param không nói dối.

**Không lọc ẩn 44 dòng còn lại** — mất ngữ cảnh đối chiếu, và user đã bác.

### 5.3 Hai prop optional mới trên `SubmissionStatusTable`

Cả hai **vắng mặt ở trang lobby**, nên lobby không đổi hành vi một chút nào. Đây là
điều kiện bắt buộc: test suite hiện có của lobby phải pass **không sửa một dòng** —
đó là regression check.

| Prop | Kiểu | Việc |
|---|---|---|
| `focusStudentMssv` | `string \| undefined` | Highlight dòng + mở Dialog cho SV đó, **một lần**, khi dữ liệu về |
| `gradingByMssv` | `Record<string, { score: number \| null; status: string }> \| undefined` | Hiện điểm **chỉ-đọc** trong Dialog + nút "Chấm lại" (disabled) |

Logic "một lần" thuộc về component (nó sở hữu state `selectedStudentMssv`); trang
chỉ đọc param rồi truyền xuống.

*(Đã cân nhắc: để grading ra ngoài component dùng chung, trang chi tiết tự render
một khối "Điểm" riêng. Loại vì nó tách đôi thông tin của cùng một SV ra hai chỗ —
mà "mọi thứ của một SV nằm cùng một chỗ" chính là mục tiêu UX ở đây.)*

### 5.4 Điểm chỉ-đọc + "Chấm lại" placeholder

Nguồn: `GET /exam-sessions/:id/grading-results` (đã có), map theo `studentMssv`.

- Bài **chưa chấm** → không hiện gì về điểm, không hiện nút "Chấm lại". Không có gì
  để chấm lại thì nút ở đó chỉ gây rối.
- Bài **đã chấm** → hiện `aiTotalScore` chỉ-đọc + link *"Xem chi tiết chấm"* sang
  `/teacher/grading?sessionId=` + nút **"Chấm lại" ở trạng thái disabled kèm lý do
  nhìn thấy được** (`"Có khi module chấm điểm hoàn thiện"`), theo đúng quy ước sẵn
  có của codebase (`components/layout/placeholder-page.tsx`, `StatCard.hint` trên
  dashboard GV).

**Không render nút trông sống mà bấm không ra gì** — đó là cách nhanh nhất dạy GV
rằng app hỏng.

### 5.5 Nav

Thêm lại `{ label: 'Quản lý bài thu', href: '/teacher/submissions', icon: Inbox }`
vào `TEACHER_NAV`, kèm import `Inbox` (cả hai đã bị gỡ khi xóa trang cũ).

---

## 6. Sáu cái bẫy khi code — ĐỌC TRƯỚC KHI VIẾT `?student=`

Ghi ra theo yêu cầu trực tiếp của user. Năm cái đầu đều là bug thật sẽ ship nếu làm
theo bản năng.

**Bẫy 1 — Effect phải chạy khi DỮ LIỆU về, không phải khi mount.**
Render đầu tiên `students` là `[]` (React Query còn đang fetch). `useEffect(..., [])`
sẽ chạy đúng lúc chưa có dòng nào để highlight, rồi không bao giờ chạy lại. Điều
kiện kích hoạt phải là *"đã tìm thấy dòng khớp `focusStudentMssv`"*, không phải
*"component vừa mount"*.

**Bẫy 2 — Và phải chạy đúng MỘT lần. Đây là bẫy nguy hiểm nhất.**
React Query refetch khi focus lại tab / reconnect làm `students` đổi identity mảng.
Nếu effect phụ thuộc vào `students` thì trang **tự scroll lại và bật lại Dialog ngay
giữa lúc GV đang đọc**. Phải có `useRef` chốt "đã áp dụng rồi", và ref đó reset khi
`focusStudentMssv` đổi — **không** phải khi `students` đổi.

**Bẫy 3 — MSSV không tồn tại trong phiên đó.**
URL cũ, link chia sẻ lại, hoặc sửa tay. Phải **im lặng bỏ qua**: không scroll, không
mở Dialog, không toast, không alert. Trang vẫn phải dùng được bình thường. Tuyệt đối
không throw.

**Bẫy 4 — Highlight là màu nền, screen reader không thấy gì.**
Phải chuyển focus thật, không chỉ tô màu. Radix `Dialog` tự quản focus khi mở —
nhưng khi **đóng**, nó trả focus về *trigger*, mà ở đây Dialog mở bằng code nên
không có trigger, focus sẽ rơi về `<body>` và GV mất hoàn toàn vị trí. Phải chỉ định
điểm rơi (nút "Xem bài nộp" của chính dòng đó).

**Bẫy 5 — `prefers-reduced-motion`.**
`scrollIntoView({ behavior: 'smooth' })` phải hạ xuống `'auto'` khi user bật giảm
chuyển động.

**Bẫy 6 — Chỉ mở Dialog khi đến từ search.**
Dialog bật sẵn lúc load chỉ hợp lý vì nó là hệ quả trực tiếp của hai cú click cố ý
của GV. Vào trang từ lối duyệt Môn/Lớp mà tự bật modal là hành vi sai — không có
`?student=` thì không có Dialog.

---

## 7. Ngoài phạm vi — Tầng 2 (module chấm điểm)

Tầng 1 tự nó trả lời trọn vẹn cả hai câu hỏi gốc (*"phiên nào cần chú ý ngay?"* và
*"SV này thi kỳ nào?"*) và không nợ Tầng 2 thứ gì. Ghi lại đây làm đầu vào cho spec
sau:

- **API chấm 1 bài.** Hiện chấm là **theo cả phiên**
  (`POST /exam-sessions/:id/start-grading`), không có đường chấm lẻ một submission.
- **"Chấm lại".** Hiện **bị chặn có chủ đích**, ba lớp: (1) `startGrading` lọc bỏ
  mọi bài đã có kết quả; (2) trigger DB `guard_grading_result_ai_immutable` chặn ghi
  đè `ai_total_score` / `criterion_results` — *CLAUDE.md Security rule 6*; (3) status
  là máy trạng thái một chiều `ai_grading -> ai_graded -> auto_approved |
  flagged_for_review -> teacher_reviewed -> finalized -> exported`.
  **Lý do nghiệp vụ user nêu:** *SV khiếu nại điểm → GV chấm lại và so với bài đã
  chấm để đối chiếu.* Lý do này **khớp chính xác với ý đồ của schema** — output gốc
  của AI được giữ bất biến **đúng để việc so sánh đó làm được**. Hướng đúng là ghi
  `teacher_review` (hoặc thêm một `GradingResult` mới), không phải ghi đè.
- **API `teacher_review`.** Bảng + entity + migration đã có; **không một dòng API nào
  đụng tới**. "GV sửa điểm" hiện là con số 0 ở backend.
- **"Bài output đã chấm".** Không tồn tại dưới dạng file đã annotate. Thứ duy nhất có
  là breakdown theo tiêu chí rubric (`verdict` / `points` / `evidence` + `confidence`
  + `flagForReview`). Cần user xác nhận hình dung đúng là cái nào trước khi làm.
- **Search theo roster** (tìm được cả SV chưa nộp gì) — cần lookup `enrollment`, §3.4.

  **Điều kiện kéo lên sớm — ghi ra để nó không mục ở đây:** việc xếp mục này xuống
  Tầng 2 dựa trên một **giả định về tần suất chưa có dữ liệu kiểm chứng** (hệ thống
  chưa chạy thật với sinh viên thật). Giả định: ca *"em có nộp mà thầy!"* mà SV có
  **0 file** trên hệ thống là tập con hẹp — nếu SV đã nộp bất cứ gì, dù thiếu hay
  hỏng, search hiện tại vẫn tìm ra. Nếu sau vài kỳ thi thật ca khiếu nại 0-file xảy
  ra thường hơn dự đoán, **đó là tín hiệu kéo roster-search lên trước** phần còn lại
  của Tầng 2 — đừng để nó nằm mặc định ở "Tầng 2, không ai nhắc lại" chỉ vì lúc viết
  spec chưa có số liệu.
- **Không đụng gì tới trang lobby** `(exam-live)/exam-sessions/[id]`.

---

## 8. Kiểm thử

**Backend — `GET /submissions/overview`:**
- Roll-up đúng: phiên có SV nộp đủ / nộp thiếu / không nộp / có file `invalid`.
- `expectedCount` = |roster ∪ người nộp|, **khớp với số dòng trang chi tiết dựng ra**
  cho cùng phiên đó khi có SV thi ghép — **phiên ĐÃ kết thúc, agent đã ngắt kết nối**
  (§3.3: phiên đang chạy có điểm lệch `makeup` đã biết và không thuộc bảo đảm này).
- `rosterKnown === false` khi phiên không gắn lớp, kéo theo `notSubmittedCount === 0`.
- Không rò rỉ qua chủ sở hữu: GV A không thấy phiên của GV B, kể cả khi truyền tham số.
- Không N+1: khẳng định số query không tăng theo số phiên.

**Backend — chống fan-out (§3.3). Đây là nhóm test riêng, không gộp vào test khớp số
ở trên** — test khớp số so hai màn hình với nhau, nên nếu SQL nhân chéo thì cả hai
phía vẫn có thể cùng sai theo cách khác nhau mà test kia không chỉ ra được nguyên
nhân. Các case dựng để nếu nhân chéo là **thấy ngay bằng con số**:

- **Fan-out ba chiều:** phiên roster 40 SV, 3 file bắt buộc, một SV nộp đủ 3 file →
  `fullySubmittedCount === 1` (không phải 3, 40, hay 120), `notSubmittedCount === 39`,
  `expectedCount === 40`.
- **`invalidFileCount` đếm FILE, không nhân theo roster:** một SV có đúng 2 file
  `invalid` trong phiên roster 40 người, 3 file bắt buộc →
  `invalidFileCount === 2` (không phải 80 hay 240).
- **SV chỉ có file `invalid`:** `notSubmittedCount` **không** đếm họ; họ vào
  `partialCount`; phiên đó mang lý do ưu tiên 1 (đỏ), không phải ưu tiên 3 (vàng).
- **`requiredDeliverableCount === 0`:** không ai `fullySubmitted`, phiên không cần
  chú ý, và API vẫn trả về bình thường (không chia cho 0, không throw).
- **Nhiều SV, nhiều file, có SV thi ghép:** tổng
  `fullySubmitted + partial + notSubmitted === expectedCount` (bất biến phải giữ ở
  mọi case có `requiredDeliverableCount > 0`).

**Frontend — quy tắc "cần chú ý"** (thuần hàm, test riêng, không qua component):
- Mỗi lý do trong §4.1, và đúng thứ tự ưu tiên khi một phiên có nhiều lý do.
- Phiên trong grace (`endTime < now <= endTime + 30'`) → "Đang thu bài", **không**
  cần chú ý.
- Phiên ngoài grace, thiếu bài → cần chú ý.
- **Chốt tay:** `status === 'completed'` nhưng `now < endTime` → "Đang thu bài"
  (**không** phải "Đang diễn ra"), và vẫn ở "Đang thu bài" cho tới `endTime + 30'`.
- `rosterKnown === false` → không cần chú ý, không hiện mẫu số.
- `draft` / `cancelled` → không bao giờ cần chú ý.
- Biên: đúng `endTime + 30'` (bao gồm), `endTime + 30' + 1ms` (loại).

**Frontend — trang roll-up:** dải cần chú ý ghim trên; nhóm theo Môn/Lớp; nhóm không
có cảnh báo thì thu gọn; search gom theo phiên; empty state dùng đúng copy §3.4.
Thêm test khoá quyết định ở §4.4: **một phiên cần chú ý phải xuất hiện ở CẢ dải trên
VÀ trong nhóm Môn/Lớp của nó**, và số phiên trong header nhóm phải đếm đủ nó. Đây là
test chống việc ai đó sau này "tối ưu" bằng cách lọc nó khỏi nhóm gốc và làm danh
sách theo môn nói dối.
Ngoài ra: `requiredDeliverableCount === 0` và `rosterKnown === false` đều **không**
hiện tỉ lệ nào, chỉ hiện chú thích tương ứng (§3.3, §4.2).

**Frontend — `?student=`:** mỗi bẫy ở §6 có một test tương ứng — (1) dữ liệu về muộn
vẫn highlight, (2) refetch **không** mở lại Dialog, (3) MSSV không tồn tại thì không
crash và không Dialog, (4) focus rơi đúng chỗ khi đóng Dialog, (6) không có param thì
không có Dialog.

**Regression bắt buộc:** toàn bộ test suite của trang lobby và
`SubmissionStatusTable.test.tsx` hiện có phải pass **không sửa một dòng nào**. Đó là
bằng chứng hai prop mới thật sự optional.
