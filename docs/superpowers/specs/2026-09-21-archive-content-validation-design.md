# Kiểm nội dung file nén nộp bài — Thiết kế

Ngày: 2026-09-21

Cho phép giảng viên khai, **tuỳ chọn**, những file phải nằm BÊN TRONG một
deliverable dạng `.zip`/`.rar`, và để hệ thống đối chiếu sau khi thu bài.

---

## 1. Vấn đề

Hôm nay hệ thống kiểm **danh tính file**, không kiểm **nội dung**.

`required_deliverable` khai tên file bắt buộc; agent tạo sẵn file rỗng đúng
tên đó trong `exam-workspace/<MSSV>/` (`createSubmissionFiles`), và lúc
finalize chỉ đọc lên đúng những tên đó (`makeWorkspaceReader`). Server nhận
xong thì `submission.service.ts` đặt `validated` **vô điều kiện**, rồi
`collected`. Không ai mở file ra xem.

Với một deliverable là `.docx` thì thế là đủ — file có tên đúng là file cần
thu. Với một deliverable là `BaiThi_{MSSV}.zip` thì không: cái vỏ đúng tên
không nói gì về việc bên trong có `Main.java` hay không. Giảng viên đang phải
mở tay từng file nén để biết em nào nộp thiếu.

### 1.1 Hạ tầng đã dựng sẵn, chỉ thiếu người kết luận

Đây không phải tính năng dựng từ số không. Ba chỗ đã chờ sẵn:

- `submission_status` có nhãn `'invalid'` từ `InitialSchema`, và trigger vòng
  đời cho `received → invalid`, `validated → invalid`
- Web đã có `DeliverableState = 'collected' | 'invalid' | 'absent' | 'pending'`
  (`submission-rows.ts`) và trường `invalidFileCount` trong
  `submission-overview.types.ts`
- `submission-attention.ts` **cố ý tắt** lý do cảnh báo dựa trên
  `invalidFileCount`, kèm ghi chú: *"chưa luồng production nào tạo ra status
  'invalid' (TODO ở submission.service.ts). Đừng để giảng viên tin hệ thống
  đang canh một thứ nó không canh"*

Spec này là luồng còn thiếu đó — nhưng **không** đi qua `'invalid'`. Xem §3.3.

---

## 2. Phạm vi

### Trong phạm vi

- Khai báo danh sách file bên trong, cho từng deliverable, tuỳ chọn
- Hỗ trợ `.zip` và `.rar`
- Đối chiếu ở **server**, bất đồng bộ, sau khi bài đã thu xong
- Token `{MSSV} {TEN} {PHONG} {SOMAY}` dùng được ở tên file bên trong
- Đưa kết quả ra màn bài nộp và vào danh sách "Thu lại"
- Một đường **kiểm lại thủ công** cho giảng viên (§5.3.2) — không đụng bài nộp
- Tuyên bố `submission_status = 'invalid'` **nghỉ hưu** (§8.2)

### Ngoài phạm vi, có lý do

- **Không cảnh báo hay chặn ở agent.** Quyết định của giảng viên
  (2026-09-21): sinh viên có bảng hướng dẫn, trách nhiệm đọc kỹ là của sinh
  viên, và giảng viên nhắc được tại chỗ. Cái giá phải nói thẳng: em nộp zip
  thiếu file **sẽ không được báo lúc còn kịp sửa**; chỉ giảng viên biết, sau
  khi thi xong. Đây là lựa chọn, không phải chỗ bỏ sót. Nếu về sau muốn cảnh
  báo sớm thì agent đã có `jszip` sẵn và phần server không phải sửa gì — luật
  đối chiếu nằm ở một module thuần, xem §6.3.
- **Không kiểm cấu trúc thư mục.** Khớp theo tên file, kệ nó nằm ở đâu trong
  file nén. Xem §3.2.
- **Không có luật theo đuôi/số lượng** kiểu "phải có ít nhất 1 file `.java`".
  Môn CTDL&GT chỉ cần một hai file chạy thuật toán, tên biết trước được. Thêm
  khái niệm đó là bắt giảng viên học một thứ không đổi lại được gì.
- **Không kiểm nội dung bên trong từng file.** Có `Main.java` là đủ; nó có
  biên dịch được không là việc của phần chấm.
- **Không đối chiếu đuôi khai báo với magic bytes.** Em đổi tên `.rar` thành
  `.zip` thì hệ thống vẫn đọc được (xem §6.1) và vẫn kiểm, không báo gì. Việc
  đó đáng làm nhưng là một tính năng khác.

---

## 3. Bốn quyết định nền, và cái giá của từng cái

### 3.1 Kiểm ở server, không ở agent

Agent chạy trên máy sinh viên. Nó không phải biên giới tin cậy, nên kết luận
của nó không dùng để ghi vào hồ sơ được. Server là nơi duy nhất ra kết luận
đáng tin, và nó đã có sẵn cả bytes (`StorageService.getObject`) lẫn hàng đợi
(BullMQ) để làm việc đó.

### 3.2 Khớp theo TÊN FILE, không theo đường dẫn

Khai `Main.java` thì mọi entry trong file nén có tên cuối là `Main.java` đều
đạt — dù nó nằm ở gốc, trong `src/`, hay trong `BaiThi_2180123/src/`.

Lý do không khớp theo đường dẫn đầy đủ: lỗi phổ biến nhất của sinh viên là
**nén cả thư mục chứa** thay vì nén nội dung bên trong. Khi đó mọi đường dẫn
lệch một cấp và **toàn bộ** deliverable bị đánh trượt dù bài không thiếu gì.
Một kết luận sai kiểu đó tệ hơn hẳn việc không kiểm, vì giảng viên tin nó.

Cái giá: không kiểm được yêu cầu dạng "phải để trong `src/`". Chấp nhận.

### 3.3 Kết quả là DỮ LIỆU, không phải TRẠNG THÁI

Không dùng `submission.status = 'invalid'`. Hai lý do, lý do thứ hai mới là
lý do quyết định.

**Thứ nhất, `'invalid'` là đường một chiều.** Trigger
`validate_submission_lifecycle` cho vào `invalid` nhưng không có đường ra, và
`submission.service.ts` khi gặp dòng đã `invalid` chỉ ghi đè thông tin file,
giữ nguyên status. Vậy em nén lại nộp lần hai sẽ có file mới đúng nhưng dòng
vẫn mang dấu `invalid` vĩnh viễn — một dòng nói dối. Đúng thứ TODO ở
`submission.service.ts` đã cảnh báo: *"the DB trigger allows no transition OUT
of 'invalid', so that would need a schema change, not just a branch here."*

**Thứ hai, và đây mới là điểm chốt: một enum status không chở được thông tin
giảng viên cần.** Cái cần biết không phải chữ "hỏng" mà là **thiếu file nào**.
Nên cột dữ liệu chứa danh sách là thứ phải có dù chọn hướng nào. Khi đã có nó
rồi thì lật thêm status chỉ thêm một cái bẫy một chiều mà không thêm một mẩu
thông tin nào.

Thêm nữa, `collected` trong codebase này được định nghĩa là "đã đi hết đường
kiểm tra". Một file nén về tới nơi nguyên vẹn thì **đã** đi hết đường thu bài
thật. Bên trong nó thiếu gì là câu hỏi khác, trả lời bằng cột khác.

Cái giá, và nó là việc thật phải làm: `recollect.service.ts` lọc người cần thu
lại bằng `status = 'collected'`, nên mặc định em nộp zip thiếu file sẽ **không**
lọt vào danh sách "Thu lại". Phải sửa câu truy vấn đó. Xem §8.1.

### 3.4 `.rar` làm luôn, bằng WASM

Không có thư viện thuần JS nào đọc được RAR — format đóng. Hai đường: nhét
`node-unrar-js` (bản biên dịch WASM của UnRAR) vào API, hoặc `apk add` một
binary vào image Alpine rồi spawn.

Chọn WASM. Image API là `node:20-alpine` (xem `apps/api/Dockerfile`), và gói
`p7zip` trên Alpine **có thể** không kèm codec RAR5 — mà WinRAR đời nay mặc
định tạo RAR5. Đường binary vì thế là một ẩn số phải thử mới biết, còn đường
WASM chạy giống hệt nhau ở local, docker-compose, và Railway. Một dependency
npm đổi lấy việc không phải sửa Dockerfile và không phụ thuộc gói hệ thống.

---

## 4. Thay đổi dữ liệu

Một migration. Ba phần.

### 4.1 Khai báo — bảng con `required_deliverable_entry`

```
required_deliverable_entry
  id                       uuid    PK
  created_at, updated_at   timestamptz
  required_deliverable_id  uuid    FK -> required_deliverable ON DELETE CASCADE
  entry_name               varchar(255)   NOT NULL

  UNIQUE (required_deliverable_id, entry_name)
```

Treo dưới `required_deliverable` đúng như `required_deliverable` đang treo
dưới `exam_session`. `ON DELETE CASCADE` chứ không `RESTRICT`: danh sách bên
trong không có nghĩa nào độc lập với deliverable nó mô tả — giữ lại một dòng
mồ côi chỉ tạo rác.

`entry_name` chịu đúng `FILENAME_TEMPLATE_REGEX` như tên file bên ngoài, nên
token dùng được và luật chống path traversal áp y hệt. Đặc biệt là ký tự `/`
**vẫn bị cấm** — đó là hệ quả trực tiếp của §3.2: khai đường dẫn là vô nghĩa
khi phép khớp không nhìn đường dẫn, và cấm ngay từ lúc khai thì giảng viên
biết ngay thay vì tưởng mình đã khai được một thứ hệ thống lặng lẽ bỏ qua.

**Không có cờ bật/tắt riêng.** Deliverable không có dòng entry nào → không
kiểm gì. Đây đúng lý lẽ `filename-template.ts` đã viết cho chính nó: *"A
deliverable is templated iff its declared name contains a token. There is no
separate flag: a flag would be a second fact about the same string that could
disagree with it."*

**Không dùng jsonb**, và có bằng chứng tại chỗ: `exam_session.submission_rule`
là một cột jsonb đã tồn tại từ `InitialSchema` và **chưa từng được đọc ở bất
kỳ đâu** — nó chỉ được khai trong entity. Cấu hình dạng blob không sống nổi ở
codebase này.

### 4.2 Kết quả — bốn cột trên `submission`

```
archive_check_status      examcollect.archive_check_status   NOT NULL
                                                             DEFAULT 'not_applicable'
archive_expected_entries  text[]   NULL
archive_missing_entries   text[]   NULL
archive_check_error       text     NULL

CONSTRAINT ck_submission_archive_snapshot CHECK (
  archive_check_status <> 'pending' OR archive_expected_entries IS NOT NULL
)
```

Ràng buộc đó không phải dọn cho đẹp — nó là thứ giữ cho bản chụp không bị một
đường vào tương lai đi vòng qua. Lập luận đầy đủ ở §5.2.1.

Enum `archive_check_status`:

| nhãn | nghĩa |
|---|---|
| `not_applicable` | deliverable không khai file bên trong — không có gì để kiểm |
| `pending` | đã xếp hàng, chưa có kết luận |
| `passed` | mở được, có đủ |
| `failed` | mở được, thiếu — `archive_missing_entries` nói thiếu gì |
| `unreadable` | không mở ra được — `archive_check_error` nói vì sao |

**Vì sao phải có enum chứ không chỉ một mảng.** Đây chính xác là bài học của
`AddAdvocateOutcome1789310000000`, migration sinh ra vì `advocate_opinion =
NULL` đang mang ba nghĩa cùng lúc và làm hỏng số liệu calibration. Nếu ở đây
chỉ có `archive_missing_entries` thì NULL sẽ mang **bốn** nghĩa: không phải
kiểm / chưa kiểm xong / mở không ra / đã kiểm và đạt. Lặp lại đúng cái lỗi dự
án vừa bỏ công đi sửa cách đây một ngày.

**Vì sao `unreadable` tách khỏi `failed`.** Zip hỏng, rar đặt mật khẩu, hay
file tên `.zip` mà bên trong không phải zip — đó là kết luận khác hẳn "em nộp
thiếu file", và giảng viên xử lý hai chuyện đó khác nhau. Gộp vào một chữ
"hỏng" là bắt họ đi đoán.

**Vì sao có `archive_check_error`.** Tiền lệ trực tiếp:
`AddGradingUngradableReason1789290000000` thêm cột `ungradable_reason` sau một
sự cố thật, vì *"câu trả lời duy nhất nằm trong log terminal của đúng lần chạy
đó — không truy lại được sau khi log xoay vòng"*. Một file `unreadable` mà
không ghi lại vì sao sẽ lặp lại đúng buổi điều tra đó. Chuỗi này đã qua xử lý
để an toàn hiển thị, không phải message lỗi thô.

**Vì sao `archive_expected_entries` là một bản chụp, không phải tra lại.**
Xem §5.2 — đây là chỗ thiết kế suýt sai.

### 4.3 Không đụng trigger vòng đời

Hệ quả của §3.3. `validate_submission_lifecycle` giữ nguyên từng chữ. Bốn cột
mới nằm ngoài mọi trigger, cập nhật tự do, và nộp lại thì tính lại.

---

## 5. Luồng chạy

### 5.1 Xếp hàng ở đâu

Một BullMQ queue mới, `ARCHIVE_CHECK_QUEUE`, theo đúng khuôn `GRADING_QUEUE`
đã có (`BullModule.registerQueue` + một `@Processor`).

**Queue riêng, không dùng chung với chấm điểm.** `GRADING_QUEUE` bị giới hạn
nhịp theo hạn mức của API AI (`GRADE_CONCURRENCY`, `GRADE_RATE_MAX`). Phép
kiểm này chỉ tốn I/O và CPU cục bộ, không gọi ra ngoài. Nhét chung là để một
việc rẻ xếp hàng sau một việc đắt, và tệ hơn, là để cấu hình nhịp của bên này
đổi ngầm hành vi của bên kia.

Nhưng tách queue rồi thì **phải đặt ngân sách cho queue mới**, và ngân sách ở
đây là RAM chứ không phải nhịp gọi. Con số và lập luận ở **§6.2.1** — không
được để queue này chạy với concurrency mặc định.

**Không chạy đồng bộ trong `submission:confirm`.** Cuối ca thi ~40 agent
confirm gần như cùng lúc; mỗi lần phải kéo một archive từ Supabase Storage
(Singapore) về Railway rồi mới trả lời agent. Chặn handler socket và kéo dài
grace period — đổi một tiện ích lấy chính thứ cốt lõi của hệ thống.

### 5.2 Chụp danh sách kỳ vọng lúc nộp — và vì sao BẮT BUỘC

Đây là chỗ thiết kế suýt sai, và nó chỉ lộ ra khi truy `{SOMAY}` đi từ đâu tới.

`renderFilename` cần `FilenameContext`, trong đó có `machineName`. Trường đó
đến từ `dto.machineName` lúc `handleAgentJoin`, được dùng đúng một lần để dựng
ack, và **không bao giờ được ghi xuống đâu cả** — không có trong `submission`,
không có trong `agent_connection_event`, không có trong `session_roster`. Đã
grep toàn bộ `apps/api/src`: nó chỉ xuất hiện ở DTO, ở một dòng trong gateway,
và trong chính `filename-template.ts`.

Nghĩa là job chạy sau **không render lại được** `{SOMAY}`. Render với `null`
thì `renderFilename` trả `UNKNOWN`, và mọi em khai token đó bị đánh trượt oan
hàng loạt — hỏng trong im lặng, đúng thứ cả codebase này chống.

Cách giải: **chụp danh sách đã render vào `archive_expected_entries` ngay lúc
`submission:confirm`**, nơi context còn đủ (`client.data`, bổ sung
`machineName` lúc join — một dòng). Job chỉ so bản chụp với thực tế, không
render gì.

Không lưu `machine_name` lên `submission` rồi render lại trong job: cách đó
vẫn chạy, nhưng nó để ngỏ một khe — giảng viên sửa danh sách entry giữa lúc
thi và lúc job chạy thì bài bị chấm theo một luật ban ra sau khi em đã nộp.
Bản chụp đóng khe đó.

Và nó đi đúng thói quen sẵn có của dự án: rubric ghim vào phiên, roster đóng
băng, `grading_anchor_snapshot`. Sự thật dùng để phán xét được chụp lại ở thời
điểm ra quyết định, không tra lại sau.

**Phạm vi bảo đảm, nói cho chính xác.** Bản chụp đóng khe "luật đổi sau khi
nộp" trong phạm vi **một lần nộp**, không phải toàn phiên. Em nộp lần 1, danh
sách entry đổi, em nộp lại lần 2 → lần 2 bị đối chiếu theo danh sách mới. Đó
là hành vi đúng (mỗi lần nộp là một thời điểm phán xét mới), nhưng đừng đọc
đoạn trên thành "khe đã đóng hẳn".

Trên thực tế khe đó **hôm nay không mở được**: không có đường sửa deliverable
sau khi tạo phiên. `exam-session.controller.ts` chỉ có `@Patch(':id/teacher')`
(đổi giảng viên); không route nào đụng `required_deliverable`, và spec này
không thêm route nào. Ghi ra đây vì sự vắng mặt của một đường sửa là thứ người
đọc không tự thấy được — và nếu sau này có ai thêm, đoạn trên là thứ họ cần
đọc trước.

### 5.2.1 Một CHECK constraint, vì bản chụp chỉ đúng khi CÓ người chụp

Hôm nay `submission:confirm` là **đường duy nhất** một dòng tới `collected`.
Đã kiểm: `submittedVia: 'normal'` ở `submission.service.ts` là chỗ ghi duy
nhất trong toàn bộ codebase; `'backup'` và `'manual_pull'` chỉ tồn tại ở câu
`CREATE TYPE`, ở union type TS, và ở mảng `enum:` của entity — **không gì sinh
ra chúng**. Đường backup không biến snapshot thành bài nộp, và `backup.ts` nói
thẳng vì sao: *"Letting a four-minute-old snapshot stand in for what they
actually finished with would be a different, worse feature."*

Nhưng ba nhãn enum đó đang nằm đó mời người sau implement. Ngày ai đó làm
đường backup thật, nếu họ không biết về bản chụp thì bẫy §5.2 quay lại nguyên
vẹn — và nó sẽ nổ đúng vào nhóm em đã gặp sự cố máy móc, trong im lặng.

Một quy ước viết trong spec không chặn được chuyện đó. Một ràng buộc thì có:

```sql
CONSTRAINT ck_submission_archive_snapshot CHECK (
  archive_check_status <> 'pending' OR archive_expected_entries IS NOT NULL
)
```

Đường vào nào sau này tạo một bài `pending` mà quên chụp sẽ **chết ngay tại
DB**, ở đúng câu lệnh gây ra nó, thay vì đẻ ra một kết luận sai không ai truy
được. Đây đúng lối codebase này vẫn gác: bằng trigger và CHECK, không bằng
lời dặn.

### 5.3 Trình tự

```
submission:confirm  (SubmissionService, sau khi dòng tới 'collected')
   |
   +-- deliverable không có entry nào
   |      +-- archive_check_status = 'not_applicable'   <- hết
   |
   +-- có entry
          +-- render từng entry_name qua renderFilename + context của em
          +-- ghi archive_expected_entries = [danh sách đã render]
          +-- archive_check_status = 'pending'
          |
          +== COMMIT ==================================
          |
          +-- enqueue { submissionId }     <- SAU commit, xem §5.3.1

ArchiveCheckProcessor
   +-- đọc submission -> storage_key, archive_expected_entries
   +-- HeadObject -> ContentLength, so với trần  (§6.2)  <- chặn TRƯỚC khi tải
   +-- StorageService.getObject(storage_key)
   +-- nhận dạng định dạng qua magic bytes  (§6.1)
   +-- liệt kê entry, dừng ở trần  (§6.2)   <- KHÔNG giải nén
   +-- đối chiếu  (§6.3)
   +-- ghi status + missing_entries | error
```

### 5.3.1 Enqueue SAU commit, không nằm trong giao dịch

Nếu `enqueue` nằm trong giao dịch đang ghi `pending`, worker có thể nhấc job
lên và đọc dòng đó **trước khi giao dịch commit** — thấy dòng chưa tồn tại,
hoặc tồn tại mà chưa có bản chụp. Job fail, hoặc tệ hơn, kết luận trên dữ liệu
nửa vời. Dự án đã rất kỹ về ranh giới giao dịch ở chỗ khác (audit phải nằm
cùng giao dịch với hành động nó ghi lại), nên chỗ này phải nói rõ chứ không
để người code tự đoán.

Cái giá của việc đẩy ra sau commit: có một khe giữa commit và enqueue. Enqueue
hỏng ở đúng khe đó (Redis rớt) thì dòng nằm `pending` **mà không có job nào**.
Không có timeout nào tự vớt nó. Đó là lý do §5.3.2 tồn tại.

### 5.3.2 Đường kiểm lại thủ công

`POST /exam-sessions/:id/archive-recheck` — xếp hàng lại phép kiểm cho các bài
của phiên, **không đụng một byte nào của bài nộp**.

Nó làm hai việc, và cả hai đều cần:

**Một, vớt các dòng `pending` mồ côi** ở khe §5.3.1. Không có đường này thì
một lần Redis rớt để lại những bài không bao giờ có kết luận.

**Hai, tách "lỗi phía mình" khỏi "file em hỏng".** §12.3 chốt rằng hết retry
thì phải ghi `unreadable` — trạng thái cuối phải là một kết luận. Nhưng
`unreadable` vì storage timeout và `unreadable` vì em nén hỏng dẫn tới hai
hành động hoàn toàn khác nhau, mà nếu chỉ có một đường ra thì giảng viên buộc
phải chọn đường "bắt em nộp lại" cho cả hai. **Bắt sinh viên nén lại vì
storage của mình timeout là phạt nhầm người.** Nút "Kiểm lại" cho giảng viên
thử lại phía mình trước khi động tới sinh viên.

Quyền: cùng guard với các route khác của phiên (giảng viên sở hữu phiên, hoặc
admin). Bấm nhiều lần vô hại — cùng tính chất ĐỌC-RỒI-XẾP-HÀNG như "Thu lại".

### 5.4 Nộp lại thì tính lại

Một lần confirm nữa cho cùng `(session, student, deliverable)` đi lại nguyên
đường trên: chụp lại kỳ vọng, `pending`, xếp hàng lại, ghi đè kết quả cũ.
Không có trạng thái nào dính. Đây là thứ §3.3 mua được bằng việc không dùng
`'invalid'`.

### 5.5 Không chặn chấm điểm

Phép kiểm này và `GRADING_QUEUE` độc lập. Một bài `failed` vẫn chấm được —
giảng viên có thể muốn chấm phần em nộp được rồi trừ điểm phần thiếu, và đó là
quyết định của con người, không phải của hàng đợi.

---

## 6. Đọc file nén

### 6.1 Nhận dạng bằng magic bytes, không bằng đuôi file

- `50 4B 03 04` / `50 4B 05 06` / `50 4B 07 08` → ZIP
- `52 61 72 21 1A 07 00` → RAR4, `52 61 72 21 1A 07 01 00` → RAR5
- còn lại → `unreadable`

Không tra đuôi file: sinh viên đổi tên `.rar` thành `.zip` là chuyện có thật,
và khi đó đọc theo đuôi sẽ báo `unreadable` cho một file hoàn toàn lành. Magic
bytes trả lời đúng câu hỏi thật — "đây là cái gì" — thay vì câu hỏi "nó tự
xưng là cái gì".

### 6.2 Chỉ liệt kê, KHÔNG BAO GIỜ giải nén

Vì §3.2 chỉ cần tên, hệ thống không cần một byte nội dung nào. Đọc bảng mục
lục là đủ.

Điều đó xoá thẳng rủi ro **zip bomb**: file 42KB phình thành 4.5PB vô hại nếu
không ai bung nó ra. Đây là lợi ích trực tiếp và có chủ ý của việc khớp theo
tên, không phải may mắn.

- ZIP: **`yauzl`**, đọc từng entry một
- RAR: `node-unrar-js`, chỉ gọi đường liệt kê header

**Vì sao `yauzl` chứ không `jszip`, dù `jszip` đã có sẵn ở `apps/agent`.** Bản
nháp đầu chọn `jszip` với lý lẽ "cùng một thư viện đã dùng qua". Lý lẽ đó
**sai**, và nó sai theo cách làm hỏng chính cái trần bên dưới: `loadAsync`
nạp cả buffer rồi **dựng xong toàn bộ bảng `files`** trước khi trả về. Nghĩa
là câu lệnh đếm-rồi-so-với-trần chỉ chạy được SAU khi bộ nhớ đã phình. Một
archive hợp lệ 200MB gồm vài triệu entry rỗng giết tiến trình ngay ở
`loadAsync`, và cái trần đứng nhìn. `yauzl` đọc dòng, nên trần **dừng được
giữa chừng** — đó là toàn bộ lý do nó có mặt.

Vẫn còn một đường cạn tài nguyên mà "không giải nén" **không** che được: một
archive khai hàng triệu entry. Nên **chặn ở 20.000 entry ĐỌC ĐƯỢC TỪ FILE NÉN**
→ `unreadable`, với lý do nói rõ, và **dừng đọc ngay tại đó** chứ không đọc
hết rồi mới kết luận. Một bài thi CTDL&GT không có 20.000 file; chạm ngưỡng
nghĩa là có gì đó sai, và nói ra vẫn tốt hơn là chết lặng.

> Đừng lẫn với trần **20 entry KHAI BÁO** ở §8.4. Hai con số đo hai thứ khác
> nhau: 20 là số dòng giảng viên gõ vào biểu mẫu (giới hạn về mặt dùng được);
> 20.000 là số mục tối đa hệ thống chịu đọc ra từ file sinh viên nộp (giới hạn
> về mặt tài nguyên).

**Chặn kích thước — và KHÔNG dùng `submission.file_size`.** Bản nháp đầu định
đọc `file_size` trước khi tải. Sai, và sai về bảo mật: `file_size` đến từ
`ConfirmSubmissionDto.fileSize`, tức **payload của agent**. Chính doc comment
của DTO đã ghi *"the object is already uploaded by the time this arrives, and
the real limit belongs on the bucket"* — nó là con số do client khai, nên cửa
chặn dựng trên nó nằm trong tay đúng bên bị chặn: khai `fileSize: 1` rồi đẩy
5GB là qua sạch.

Nguồn đúng là **`ContentLength` từ `HeadObjectCommand`**, tức metadata của
chính object. `StorageService` đã import và dùng command đó trong
`objectExists`; chỉ cần đọc thêm một trường. Quá `ARCHIVE_CHECK_MAX_BYTES`
(mặc định 200MB) → `unreadable` kèm lý do, **không** gọi `getObject`.

`file_size` vẫn giữ nguyên chỗ của nó để hiển thị cho giảng viên. Nó chỉ không
được dùng làm cửa chặn.

### 6.2.1 Ngân sách bộ nhớ của queue

`ARCHIVE_CHECK_QUEUE` khai `concurrency` **tường minh**, và con số đó suy ra
từ RAM container chứ không phải từ nhịp gọi API — đây là chỗ khác nhau căn bản
với `GRADING_QUEUE`, nơi ràng buộc là hạn mức token bên ngoài.

Đáy của bài toán: `concurrency × ARCHIVE_CHECK_MAX_BYTES`, và với RAR thì
**nhân đôi** (buffer phía JS cộng một bản sao trong heap của WASM). Với 200MB
và concurrency 5 thì trường hợp xấu nhất là ~2GB — quá thừa để giết tiến trình
API trên Railway.

Chốt: `concurrency = 2`, `ARCHIVE_CHECK_MAX_BYTES = 200MB` → trần ~800MB.
Hai con số này phải được đọc cùng nhau; đổi một cái mà không tính lại cái kia
là mở lại đúng lỗ vừa bịt. Ghi thành hằng số cạnh nhau, cùng một comment.

### 6.3 Đối chiếu — một module thuần

```ts
matchEntries(expected: string[], actual: string[]): string[]   // trả về phần thiếu
```

Luật:

1. Bỏ entry là thư mục (tên kết thúc bằng `/`)
2. Lấy phần sau dấu `/` cuối cùng của mỗi entry thực tế — đây là §3.2
3. So **không phân biệt hoa thường**
4. Trả về những `expected` không tìm thấy, giữ nguyên thứ tự giảng viên khai

**Vì sao không phân biệt hoa thường ở đây, trong khi tên file bên ngoài thì
khớp chính xác.** Hai bên khác nhau ở chỗ *ai* tạo ra cái tên. Tên bên ngoài
do **agent** tạo từ chuỗi server gửi xuống, nên nó luôn đúng từng ký tự — so
chính xác không bao giờ oan. Tên bên trong do **sinh viên** gõ trên Windows,
nơi `Main.java` và `main.java` là cùng một file và hệ điều hành không cho em
biết là có khác. Phân biệt hoa thường ở đây chỉ sinh ra kết luận sai. Hai luật
khác nhau vì hai tình huống tin cậy khác nhau, không phải vì thiếu nhất quán.

Module thuần, không I/O — nên nó test trực tiếp được, và nếu sau này muốn cảnh
báo sớm ở agent thì dùng lại nguyên vẹn (§2, ngoài phạm vi).

### 6.4 Bảng mã tên file

Tên trong ZIP có thể là UTF-8 hoặc CP437 tuỳ công cụ nén. Chuyện này **an toàn
về mặt cấu trúc**, không phải may mắn, và lập luận đáng viết ra đủ để người sau
không mở lại cuộc điều tra này:

1. `entry_name` chịu `FILENAME_TEMPLATE_REGEX`, và `renderFilename` chuẩn hoá
   tiếng Việt về ASCII (`normalize`) → **danh sách kỳ vọng luôn thuần ASCII**
2. ASCII là tập con **trùng khớp từng byte** của cả CP437 lẫn UTF-8 → một tên
   kỳ vọng thuần ASCII khớp đúng bất kể zip ghi bằng bảng mã nào
3. Một entry thật có ký tự ngoài ASCII vốn **đã không thể** khớp một tên kỳ
   vọng thuần ASCII → mojibake không đẻ thêm kết luận sai nào
4. Kể cả khi phần **thư mục** có dấu (`Bài thi/Main.java`), phép lấy phần sau
   dấu `/` cuối (§6.3) vẫn cho ra `Main.java` nguyên vẹn

Kết luận: không cần xử lý bảng mã. Ghi lại vì sự vắng mặt của việc xử lý trông
giống một chỗ bỏ sót.

---

## 7. Các kết luận và cách đọc chúng

| status | giảng viên thấy | hành động |
|---|---|---|
| `not_applicable` | không hiện gì | — |
| `pending` | "Đang kiểm" | chờ, thường vài giây |
| `passed` | dấu đủ | — |
| `failed` | "Thiếu: `Main.java`" | nhắc em nén lại → "Thu lại" |
| `unreadable` | "Không mở được: <lý do>" | xem file tay |

`pending` phải hiện ra chứ không ẩn: một ô trống trong lúc chờ trông giống hệt
một bài đã kiểm và đạt, và đó là kiểu nói dối im lặng tệ nhất — giảng viên tin
là xong trong khi chưa có kết luận nào.

---

## 8. Lan ra phần đã có

### 8.1 `recollect.service.ts` — phải sửa

`findMissing` hiện đếm `status = 'collected'` so với số `required_deliverable`.
Em nộp zip thiếu file vẫn `collected` (§3.3), nên mặc định **không** lọt vào
danh sách "Thu lại".

Sửa: coi một deliverable là chưa xong nếu `status <> 'collected'` **hoặc**
`archive_check_status IN ('failed','unreadable')`. Đây đúng luồng giảng viên
mô tả (2026-09-21): nhắc em nén lại rồi bấm "Thu lại".

`pending` **không** tính là thiếu — kết luận chưa có thì chưa kết luận.

### 8.2 `'invalid'` NGHỈ HƯU — một quyết định, không phải một việc còn dở

Sau spec này, `submission_status = 'invalid'`, `invalidFileCount`, và nhánh
`DeliverableState = 'invalid'` là **khái niệm đã nghỉ hưu**. Mọi kết luận về
nội dung bài nộp đi qua `archive_check_status`, không qua status.

Phải tuyên bố thẳng, vì ghi chú hiện có ở `submission-attention.ts:122` —
*"chưa luồng production nào tạo ra status 'invalid'"* — vẫn **đúng về sự
kiện** nhưng từ nay **sai về ý định**. Người đọc sau sẽ tưởng đây là việc còn
dở và đi implement nó, đẻ ra một tín hiệu thứ hai chạy song song với
`archive_check_status` cho cùng một mối lo. Dự án này đã hai lần phải đi dọn
đúng loại hai-nguồn-sự-thật đó.

Việc phải làm, không phải tuỳ chọn:

- sửa ghi chú ở `submission-attention.ts` từ "chưa làm" thành **"đã nghỉ
  hưu"**, trỏ sang spec này
- sửa TODO ở `submission.service.ts:472` y như vậy — nó đang mời người sau
  implement đúng cái bẫy một chiều mà §3.3 vừa tránh
- thêm một lý do cảnh báo **mới**, độc lập, đếm bài `failed`/`unreadable`,
  chịu đúng ba cổng chặn sẵn có (`archived`/`closed` → phải `ended` →
  `hasRatio`)

`invalidFileCount` và nhánh `DeliverableState='invalid'` **không xoá** khỏi
code ở đợt này — chúng vô hại khi không ai sinh ra `'invalid'`, và xoá chúng
là một đợt dọn riêng, không thuộc phạm vi spec này. Nhưng chúng phải được đánh
dấu là nghỉ hưu ngay, vì chi phí của việc để nhầm lẫn đó sống thêm một tháng
là một người ngồi implement nó.

### 8.3 `submission-overview` — thêm số đếm

Thêm `archiveIssueCount` cạnh `invalidFileCount`. Không tái dụng
`invalidFileCount`: nó đếm một khái niệm khác vẫn còn chỗ dùng, và trộn hai
thứ vào một số là làm cả hai không đọc được.

### 8.4 API tạo phiên thi

`CreateExamSessionDto.requiredFilenames: string[]` không chở được danh sách
lồng. Đổi sang dạng object, **giữ tương thích ngược**: phần tử là chuỗi thì
hiểu là không có entry nào.

```ts
requiredFilenames: (string | { filename: string; entries?: string[] })[]
```

Ràng buộc mới, kiểm ở DTO:

- `entries` chỉ cho phép khi `filename` kết thúc bằng `.zip` hoặc `.rar`
  (không phân biệt hoa thường) — khai entry cho một `.docx` là một hiểu lầm,
  và nhận im lặng rồi không kiểm gì còn tệ hơn là từ chối
- mỗi phần tử `entries` chịu `FILENAME_TEMPLATE_REGEX` + `MaxLength(255)`
- `@ArrayUnique()` trong mỗi `entries`, cùng lý do đã ghi cho
  `requiredFilenames`: trùng thì lọt qua mọi phép kiểm riêng lẻ rồi chết ở
  unique index dưới DB, nổi lên thành 409 không giải thích được
- trần **20 entry** mỗi deliverable

`apps/web/src/app/teacher/exam-sessions/new/schema.ts` phải đổi song song —
file đó đã tự ghi rằng regex của nó phải **byte-for-byte** khớp bản backend.

### 8.5 Phần chấm điểm — không đụng

`submission-content-resolver` và `grading-run.service` không đọc bốn cột mới.
§5.5.

---

## 9. Giao diện

### 9.1 Biểu mẫu tạo phiên thi

Mỗi dòng tên file bắt buộc, **khi và chỉ khi** tên kết thúc `.zip`/`.rar`,
hiện thêm một khối gập lại: *"Kiểm file bên trong (tuỳ chọn)"*. Mở ra là một
danh sách nhập giống hệt danh sách file bắt buộc bên ngoài — cùng luật, cùng
thông báo lỗi, cùng gợi ý token.

Khối hiện/ẩn theo đuôi file người dùng đang gõ, nên nó tự dạy: gõ `.zip` xong
thấy nó bung ra là biết có thứ đó tồn tại, không cần đọc hướng dẫn. Gõ lại
thành `.docx` thì khối biến mất và các entry đã nhập **bị xoá**, không giữ
ngầm — giữ lại sẽ gửi lên một danh sách mà DTO sẽ từ chối, và người dùng không
hiểu vì sao.

### 9.2 Màn bài nộp

Theo bảng §7. Chỗ `failed` liệt kê thẳng tên file thiếu, không phải một dấu
chấm than bắt bấm vào mới biết — con số giảng viên cần là "thiếu cái gì", và
giấu nó sau một cú bấm là làm chậm đúng việc họ đang làm.

---

## 10. Bảo mật

1. **Không giải nén** (§6.2) — zip bomb vô hiệu
2. **Trần kích thước đọc từ `HeadObject`, KHÔNG từ `submission.file_size`**
   (§6.2). Đây là điểm dễ làm sai nhất trong cả spec: `file_size` do agent
   khai trong payload `submission:confirm`, nên một cửa chặn dựng trên nó nằm
   trong tay đúng bên nó phải chặn — khai `fileSize: 1` rồi đẩy 5GB là qua.
   `ContentLength` của object là sự thật duy nhất server tự đo được
3. **Trần số entry, áp được VÌ trình đọc dừng được giữa chừng** (§6.2). Một
   trần đặt sau khi thư viện đã nạp xong toàn bộ bảng mục lục là một trần
   không tồn tại
4. **Ngân sách bộ nhớ khai tường minh** (§6.2.1) — `concurrency × MAX_BYTES`,
   nhân đôi cho RAR
5. **Không ghi gì ra đĩa.** Toàn bộ trong bộ nhớ. Không có thư mục tạm nào để
   một entry tên `../../etc/passwd` thoát ra. Tên entry chỉ được **so sánh**,
   không bao giờ dùng để dựng đường dẫn
6. **`entry_name` chịu `FILENAME_TEMPLATE_REGEX`** — cùng hàng rào path
   traversal như tên file bên ngoài, gồm cả lookahead chặn `..`
7. **`archive_check_error` là chuỗi đã xử lý**, không phải message lỗi thô của
   thư viện — cùng luật `describeError()` mà `ungradable_reason` đang theo
8. **Quyền không đổi.** Job chạy trong tiến trình server, đọc storage bằng
   đúng credential sẵn có. `POST :id/archive-recheck` (§5.3.2) chịu cùng guard
   như mọi route khác của phiên

---

## 11. Test

**Unit — `matchEntries` (§6.3), không I/O:**
- đủ hết → `[]`
- thiếu một, thiếu nhiều → đúng tên, đúng thứ tự khai
- khớp file nằm sâu trong thư mục (`a/b/Main.java` khớp `Main.java`)
- entry thư mục (`src/`) không bao giờ khớp
- `MAIN.JAVA` khớp `Main.java`
- `expected` rỗng → `[]`

**Unit — nhận dạng định dạng (§6.1):** magic bytes ZIP / RAR4 / RAR5 / rác;
file rỗng; file ngắn hơn cả magic bytes.

**Unit — render bản chụp (§5.2):** entry có token ra tên đúng; `{SOMAY}` với
`machineName` thật ra tên thật, **không** ra `UNKNOWN`. Test này là chốt chặn
của chính cái bẫy §5.2 mô tả.

**Integration — processor:** zip thật đủ file → `passed`; thiếu → `failed` +
đúng danh sách; zip hỏng → `unreadable` + có `archive_check_error`; rar4 và
rar5 thật; rar mã hoá header → `unreadable`.

**Integration — ba cửa chặn, mỗi cửa một test khẳng định nó chặn ĐÚNG CHỖ:**
- quá trần kích thước → `unreadable` **và `getObject` KHÔNG được gọi** (cửa
  đứng trước khi tải, không phải sau)
- `HeadObject` báo 5GB trong khi `submission.file_size` khai 1 byte →
  **`unreadable`**. Đây là test chứng minh cửa chặn không dựng trên số client
  khai; thiếu nó thì lỗ §10.2 lặng lẽ quay lại ở lần refactor sau
- zip 30.000 entry → `unreadable`, **và số entry thực sự đọc ra không vượt quá
  trần** (chứng minh trình đọc dừng giữa chừng chứ không đọc hết rồi mới đếm)

**Integration — ràng buộc bản chụp (§5.2.1):** `INSERT` một dòng `pending` với
`archive_expected_entries = NULL` → Postgres từ chối. Test này canh giùm mọi
đường vào sẽ được viết trong tương lai.

**Integration — thứ tự enqueue (§5.3.1):** job chỉ được đẩy sau khi giao dịch
commit — dòng mà worker đọc được luôn đã có bản chụp.

**Integration — `POST :id/archive-recheck` (§5.3.2):** dòng `pending` mồ côi
được xếp hàng lại; dòng `unreadable` chạy lại ra `passed` khi lần lỗi trước là
lỗi tạm thời; **bytes bài nộp không đổi** (`storage_key`, `checksum`,
`submitted_at` giữ nguyên).

**E2E — cả đường:** tạo phiên có deliverable `.zip` + 2 entry → mock agent nộp
zip thiếu 1 file → bài `collected`, `archive_check_status = 'failed'` →
**em đó nằm trong danh sách "Thu lại"** (§8.1) → nộp lại zip đủ → `passed`,
rơi khỏi danh sách. Đoạn cuối là thứ chứng minh §3.3 mua được cái nó hứa.

**Hồi quy:** phiên không khai entry nào → `not_applicable`, không job nào
chạy, không có gì đổi so với hôm nay.

> Điều kiện chạy e2e (đã ghi trong ghi chú dự án): cần Postgres + MinIO chạy
> **và** bucket `examcollect-submissions` tạo sẵn; thiếu bucket cho ra lỗi
> trông như bug nghiệp vụ. Và phải kill hết jest/nest mồ côi trước khi tin kết
> quả — worker cũ còn sống sẽ ăn job BullMQ từ Redis.

---

## 12. Rủi ro

### 12.1 `node-unrar-js` là dependency mới, chưa từng dùng ở dự án này

WASM khoảng 1MB, nạp vào tiến trình API. Giảm rủi ro: nạp **lười**, chỉ khi
gặp magic bytes RAR — phiên chỉ dùng `.zip` không trả giá gì. Nếu nạp hỏng thì
kết luận là `unreadable` kèm lý do, không làm chết processor.

**Giấy phép — phải soát nếu code này rời khỏi phạm vi đồ án.** UnRAR dùng giấy
phép riêng của RARLAB, **không phải giấy phép OSI**. Nó cho phép giải nén tự
do, nhưng **cấm dùng mã nguồn để làm ra một bộ NÉN RAR**. Cách dùng ở đây —
chỉ đọc danh sách entry — nằm gọn trong phần được phép. Ghi lại vì đây là đồ
án tốt nghiệp: nếu phần này về sau được tái dùng cho một sản phẩm thương mại,
đây là dependency duy nhất trong cả spec cần một lượt soát giấy phép riêng.

### 12.2 Sinh viên không được báo lúc còn kịp sửa

Đã nêu ở §2 và là lựa chọn có chủ ý. Rủi ro còn lại: giảng viên tưởng hệ thống
có nhắc sinh viên. Giảm bằng chữ trong biểu mẫu tạo phiên — khối "Kiểm file
bên trong" nói thẳng *"Hệ thống kiểm sau khi thu bài. Sinh viên không được
cảnh báo lúc đang thi."*

### 12.3 Job đứng, bài kẹt `pending`

BullMQ retry rồi bỏ. Một bài `pending` mãi mãi trông giống "đang chạy" chứ
không giống "đã hỏng". Giảm: đặt số lần thử hữu hạn, và lần cuối thất bại thì
ghi `unreadable` + lý do thay vì để `pending`. Trạng thái cuối phải luôn là
một kết luận.

Hệ quả của luật đó: `unreadable` từ nay mang hai nguyên nhân khác hẳn nhau —
file em nộp thật sự hỏng, và hạ tầng phía mình trục trặc. `archive_check_error`
phân biệt được bằng chữ, nhưng hành động thì cần §5.3.2: không có nút "Kiểm lại"
thì đường ra duy nhất là bắt sinh viên nộp lại, kể cả khi lỗi là của server.

### 12.4 `machine_name` vẫn bốc hơi — biết, và cố ý không xử lý ở đợt này

§5.2 phát hiện `machineName` không được lưu ở đâu cả. Spec này giải bằng bản
chụp, nên **phép kiểm không cần nó**. Nhưng sự thật "em này ngồi máy nào" vẫn
mất vĩnh viễn sau khi socket đóng, và đó là dữ liệu điều tra sẽ có ngày cần
tới — một phiên có nhiều em cùng hỏng bài thì câu hỏi đầu tiên là có phải cùng
một máy không.

Không đưa vào đợt này: nó không phục vụ tính năng đang làm, và §5.2.1 đã chặn
được cái rủi ro mà nó từng được đề xuất để chặn. Ghi lại như một việc **đứng
riêng**, đáng làm, một cột `submission.machine_name` là đủ.

### 12.5 Agent cũ không bị ảnh hưởng — kiểm chứng điều này

Không có gì trong spec đổi hợp đồng WebSocket: `agent:join:ack` giữ nguyên
hình dạng, `submission:confirm` giữ nguyên tham số. Một agent đã đóng gói vẫn
chạy đúng như cũ, chỉ là server biết thêm một việc sau lưng nó. Cần một test
khẳng định đúng điều đó, vì bản Electron portable đã phát cho phòng máy không
cập nhật theo server.
