# Kế hoạch tổng thể đồ án: Hệ thống Thu bài thi & Chấm điểm hỗ trợ AI

## 1. Bối cảnh & định hướng đã chốt

Ban đầu ý tưởng đi theo hướng giống **NetSupport School** (giám sát máy sinh viên, remote control, lockdown OS-level để chặn CLI/truy cập ổ đĩa). Sau khi phân tích, hướng này quá tầm với đồ án 2 người vì đòi hỏi kernel driver, custom shell, code signing — rủi ro kỹ thuật cao, không khớp năng lực/stack hiện có (NestJS/Next.js/Postgres).

**Hướng đã chốt**: chuyển trọng tâm từ "giám sát chống gian lận" sang "**tự động hóa thu bài + hỗ trợ giáo viên chấm điểm bằng AI**". Đây là bài toán nhẹ hơn về hạ tầng, khớp với stack và kinh nghiệm hiện có (giống pattern BotIQ, KhoMC), và có giá trị học thuật rõ ràng ở phần AI-assisted grading.

**Phạm vi đồ án tuyên bố rõ**: hệ thống là công cụ *quản lý & tự động hóa quy trình thu bài — chấm điểm*, **không phải** hệ thống chống gian lận trong thi cử (không lockdown máy, không chặn mở tab khác). Nêu rõ điều này trong báo cáo để tránh hội đồng hỏi vặn về phạm vi.

### Nghiên cứu tham chiếu đã thực hiện
- **NetSupport School**: mô hình Tutor/Student/Tech Console + Gateway server; định danh dựa vào tích hợp SIS (roster có sẵn), không tự nhận diện.
- **Safe Exam Browser (SEB)**: mô hình kiosk + browser lockdown; tự thừa nhận giới hạn là chỉ khóa được cửa sổ chính nó, không enumerate được process song song hay ổ đĩa — đây là lý do việc lockdown thật sự cần kernel-level, ngoài tầm đồ án.
- **Gradescope**: mô hình gần nhất với hướng đã chọn — AI hỗ trợ nhóm câu trả lời tương tự, đề xuất điểm, nhưng giáo viên luôn là người duyệt/chốt cuối cùng. Nguyên tắc "AI-assisted, không AI-only" được áp dụng lại cho hệ thống này.

---

## 2. Tổng quan hệ thống

Hệ thống gồm 3 phần chính, không cần tách thành nhiều app riêng biệt:

```
┌───────────────────────────────────────────────────┐
│                 Web App (Next.js)                   │
│  ┌──────────────────┐   ┌────────────────────────┐ │
│  │  Module Phòng thi  │   │  Module Quản lý &      │ │
│  │  (Exam Live)       │   │  Chấm điểm (AI-assisted)│ │
│  │  - Tạo phiên thi    │   │  - Xem bài (docx/ảnh/  │ │
│  │  - Set thời gian    │   │    code)                │ │
│  │  - Set rule nộp bài │   │  - AI đề xuất điểm      │ │
│  │  - Lobby real-time  │   │  - Giáo viên duyệt/sửa  │ │
│  │  - Trạng thái nộp   │   │  - Export bảng điểm     │ │
│  └─────────┬──────────┘   └───────────┬────────────┘ │
└────────────┼──────────────────────────┼──────────────┘
             │ WebSocket                │ REST
             ▼                          ▼
   ┌───────────────────────────────────────────┐
   │           NestJS Backend                    │
   │  - Exam Session Service                     │
   │  - WS Gateway (agent connection & command)  │
   │  - Submission Service (thu bài, backup)     │
   │  - Grading Module (Rubric/Queue/Calibration)│
   │  - PostgreSQL                               │
   └──────────────────┬──────────────────────────┘
                       │ WebSocket (agent chủ động
                       │ connect ra, không cần NAT
                       │ traversal phức tạp)
                       ▼
          ┌─────────────────────────────┐
          │   Student Agent (nhẹ, tray)   │
          │  - Nhập Họ tên+MSSV+mã phiên  │
          │  - Tạo folder bài làm theo    │
          │    naming convention          │
          │  - Snapshot định kỳ (backup)  │
          │  - Nhận lệnh "chốt bài"       │
          └───────────────────────────────┘
```

---

## 3. Luồng nghiệp vụ chính

### 3.1 Trước giờ thi
1. Giáo viên tạo **phiên thi** (Exam Session): chọn môn học, set thời gian bắt đầu-kết thúc, rule nộp bài (loại file cho phép, naming convention `MSSV_HoTen`, khai báo `RequiredDeliverable`), gắn rubric chấm điểm (nếu dùng AI chấm). Phiên thi xác thực sinh viên ở **cấp môn học** (qua `Enrollment`), không cứng theo 1 lớp cụ thể — hỗ trợ sẵn case thi bù ở lớp/phòng khác (xem 4.6).
2. Hệ thống dùng danh sách `Enrollment` có sẵn (import từ Excel) để xác định ai được phép join phiên thi này.
3. Giáo viên **upload tài nguyên đề thi** (đề PDF, dataset, starter code project...) đính kèm phiên thi — lưu vào object storage, thay cho việc gửi đề thủ công qua email/USB (xem 4.7).

### 3.2 Trong giờ thi
4. Sinh viên mở **Agent**, nhập 3 trường: **Họ tên, MSSV, mã Phiên thi** → agent connect WebSocket, server xác thực MSSV có đăng ký môn học của phiên thi đó không (xác thực ở cấp môn học, không cứng theo 1 lớp — xem 4.6 về case thi bù). Thông tin Họ tên/MSSV sinh viên tự nhập được lưu thẳng vào `Submission` (không tách bảng Student riêng) để giáo viên tìm kiếm/quản lý trực tiếp trên bài thi.
5. Agent tự tạo folder bài làm, kèm **sẵn các file/skeleton theo đúng tên bắt buộc** đã khai báo lúc tạo phiên thi (vd `Cau1.docx`, `Cau2.docx`, hoặc project skeleton cho bài code), **tải sẵn tài nguyên đề thi** giáo viên đã upload, và **tự sinh 1 file hướng dẫn ngắn** (`HUONG_DAN.txt`) nêu rõ tên file cần nộp + giờ kết thúc — sinh ra tự động từ dữ liệu `RequiredDeliverable`/`submission_rule` đã khai báo, giáo viên không cần tự soạn. Giáo viên thấy real-time ai đã kết nối ("lobby điểm danh"). Riêng **tài nguyên đề thi chỉ được trả về khi đã tới `start_time`** dù agent connect sớm hơn — tách biệt "được phép kết nối" và "được phép thấy đề" để tránh lộ đề cho người join sớm (xem 4.7).
6. **Join trễ**: agent có thể mở kết nối bất kỳ lúc nào trong khung thời gian phiên thi còn hiệu lực (không bắt buộc phải mở đúng lúc giáo viên bắt đầu) — không cần thao tác gì thêm phía sinh viên, vì bản chất kết nối vốn đã là agent chủ động connect ra. Server đánh dấu `joined_late = true` nếu thời điểm connect sau `start_time`, hiển thị rõ cho giáo viên biết để tự quyết định (cho làm bù giờ hay không).
7. Agent **snapshot định kỳ** (mỗi 3-5 phút): nén thư mục bài làm theo whitelist extension + ignore pattern (loại trừ `node_modules/`, `.git/`, `dist/`, `build/`...), upload làm bản backup tạm, ghi đè bản cũ — không giữ lịch sử đầy đủ, chỉ giữ bản mới nhất để tránh mất bài do sự cố giữa giờ. Toàn bộ bước này agent tự động, **không có UI/thao tác nào yêu cầu sinh viên chọn file** — vì bài nộp chính thức đã được định danh sẵn bằng tên file cố định (xem 4.6), không có gì để đoán/chọn ở bước thu bài. Agent có thể hiển thị thụ động 1 checklist nhỏ (vd "Cau1.docx ✓ / Cau2.docx chưa có") để sinh viên tự biết tình trạng, không phải hành động bắt buộc.

### 3.3 Kết thúc giờ thi
8. Server broadcast lệnh **"chốt bài"** (tự động theo thời gian đã set, hoặc giáo viên bấm tay).
9. Agent nén + upload bản cuối cùng (cùng cơ chế whitelist/ignore như snapshot định kỳ).
10. Nếu agent không phản hồi (mất mạng/máy hỏng) → server **tự dùng bản snapshot backup gần nhất**, đánh dấu rõ "nộp bằng bản backup".
11. Giáo viên thấy trạng thái real-time: Đã nộp / Nộp bằng backup / Chưa nộp. Check đủ bài = đếm số bài thu được so với số dòng trong danh sách lớp.

### 3.4 Kết thúc giờ thi — Thu bài & lưu trữ (tự động, KHÔNG tự chấm)
12. Ngay khi hết giờ, hệ thống tự động hoàn tất việc thu bài (đã mô tả ở 3.3), sau đó chỉ làm 4 việc: **lưu trữ** (đẩy file vào object storage, ghi metadata vào `Submission`), **kiểm tra hợp lệ** (đúng tên file bắt buộc đã khai báo lúc tạo phiên thi — xem 4.6, đủ số lượng so với danh sách lớp), **định tuyến về đúng lớp gốc** (tra `Enrollment` để gắn `home_class_id`/`home_teacher_id`, đảm bảo bài thi bù ở phòng khác vẫn "chảy" về đúng giáo viên quản lý sinh viên đó), và **hiển thị lên web** cho giáo viên xem trạng thái từng bài (Đã nộp / Nộp bằng backup / Thiếu file / Không hợp lệ).
13. Việc xác định "file nào là bài nộp" được giải quyết **từ trước khi thi diễn ra** (exact-match theo tên file bắt buộc khai báo lúc tạo phiên thi — xem 4.6), nên tới bước thu bài không phát sinh trường hợp mơ hồ cần đoán hay cần ai xử lý thủ công. File nào không khớp tên bắt buộc đơn giản không được thu, không ảnh hưởng gì tới bài chính thức.
14. Đến bước này, `Submission.status` dừng ở `collected` (hoặc `invalid` nếu thiếu file bắt buộc) — hệ thống **không tự động đẩy vào Grading Queue**. Đây là ranh giới rõ ràng giữa "thu bài" và "chấm bài".

### 3.5 Chấm điểm — do giáo viên chủ động kích hoạt, không tự động
15. Giáo viên vào module Quản lý, xem danh sách bài đã thu (`collected`), khi sẵn sàng thì bấm **"Bắt đầu chấm"** — có thể chấm ngay, hoặc để đó vài ngày sau tùy giáo viên. Có thể chọn chấm toàn bộ hoặc chọn từng bài/nhóm bài cụ thể.
16. Lúc này bài mới được đưa vào **Grading Queue**: extraction theo loại file (docx qua mammoth, code chạy autograder trong sandbox, ảnh qua vision model).
17. AI chấm theo **rubric có cấu trúc** (từng tiêu chí đạt/không đạt/đạt một phần, kèm trích dẫn bằng chứng từ bài làm), trả về structured JSON.
18. Nếu độ tin cậy thấp (các lần chấm lặp lại lệch nhau, hoặc kết quả mơ hồ) → tự động đánh dấu **cần giáo viên xem lại**.
19. Giáo viên duyệt qua UI: xem điểm AI đề xuất kèm bằng chứng trích dẫn, sửa nếu cần, chốt điểm.
20. **Nhập điểm ngược vào bảng danh sách có sẵn của giáo viên** (KHÔNG chỉ xuất file mới): giáo viên upload file danh sách/bảng điểm đang dùng (Excel), **chỉ định tường minh** cột nào là MSSV và cột nào cần điền điểm (tên cột có sẵn hoặc tạo cột mới) — hệ thống KHÔNG tự đoán cột, đúng nguyên tắc "quyết định trước, không đoán" đã áp dụng xuyên suốt (xem 4.6). Hệ thống match theo MSSV, điền điểm vào đúng cột, giữ nguyên toàn bộ dữ liệu/định dạng khác trong file gốc, trả về file đã điền để tải xuống. MSSV không khớp được (có trong bài thi nhưng không có trong file, hoặc ngược lại) được liệt kê rõ để giáo viên tự xử lý, không tự đoán/bỏ qua.
21. (Định kỳ) Chạy **calibration**: so sánh điểm AI với mẫu điểm giáo viên đã chấm tay trên tập held-out, tính độ tương quan (Cohen's kappa/Pearson), dùng để tinh chỉnh rubric/prompt — đây là phần "đánh giá hệ thống" đưa vào báo cáo đồ án.

---

## 4. Data model chi tiết & kiến trúc pipeline chấm điểm

### 4.1 Nguyên tắc thiết kế: tách dữ liệu theo "nhiệt độ"

Không đổ mọi thứ vào 1 chỗ. 3 loại dữ liệu có đặc tính khác nhau:

| Loại dữ liệu | Đặc tính | Nơi lưu |
|---|---|---|
| Dữ liệu quan hệ, bền vững (course, submission metadata, điểm) | Ít ghi, cần query linh hoạt, cần toàn vẹn | **PostgreSQL** |
| File thật (bài nộp, ảnh, docx nén) | Dung lượng lớn, không cần query nội dung | **Object storage** (S3/MinIO) |
| Trạng thái sống, ghi liên tục (heartbeat agent, "đang online") | Ghi rất thường xuyên, mất đi không sao, cần TTL | **Redis** |

Lý do tách Redis riêng: nếu để agent gửi heartbeat mỗi vài giây thẳng vào Postgres, với hàng trăm/nghìn agent cùng lúc bảng đó sẽ bị ghi liên tục gây nghẽn không cần thiết — trong khi heartbeat là dữ liệu "sống", mất đi cũng không sao (agent reconnect là có ngay). Chỉ **sự kiện connect/disconnect** (có ý nghĩa audit) mới ghi xuống Postgres.

### 4.2 Schema PostgreSQL

```
-- Cấu trúc học vụ
Course           (id, code, name, semester_id)
Semester         (id, name, start_date, end_date)
ClassRoster      (id, course_id, home_class_id, student_mssv, student_name)   -- danh sách gốc, import 1 lần từ Excel
TeacherAccount   (id, name, email, ...)

-- Nguồn sự thật cho "sinh viên này thuộc lớp nào, giáo viên nào phụ trách"
-- độc lập với việc họ ngồi thi ở phòng/phiên nào — giải quyết case thi bù khác lớp
Enrollment       (id, student_mssv, course_id, home_class_id, home_teacher_id)

-- Phiên thi
ExamSession      (id, course_id, teacher_id, start_time, end_time,
                   submission_rule JSON, status, rubric_id)

-- Danh sách file bắt buộc nộp, khai báo lúc tạo phiên thi — nguồn định danh
-- bài nộp DUY NHẤT, quyết định TRƯỚC khi thi diễn ra, không đoán lúc thu bài
RequiredDeliverable (id, exam_session_id, required_filename,
                      -- vd "Cau1.docx", "Cau2.docx", hoặc "project/" cho code
                      deliverable_type[document/code_project/image])

-- Tài nguyên đề thi giáo viên upload, agent tải về 1 lần lúc connect (chỉ khi đã
-- tới start_time — xem 4.7). File thật ở object storage, đây chỉ lưu metadata.
ExamMaterial     (id, exam_session_id, storage_key, file_name, file_size,
                   uploaded_at)

-- Kết nối agent (chỉ lưu sự kiện, không lưu heartbeat)
AgentConnectionEvent (id, exam_session_id, student_mssv,
                       event_type[connected/disconnected/reconnected],
                       joined_late BOOLEAN,   -- true nếu connect sau start_time
                       occurred_at)

-- Bài nộp — chỉ lưu metadata, file thật nằm ở object storage
-- status ở đây là vòng đời THU BÀI, dừng ở collected, KHÔNG tự chuyển sang chấm điểm
-- Họ tên/MSSV sinh viên tự nhập lưu thẳng ở đây (không tách bảng Student riêng),
-- home_class_id/home_teacher_id tra từ Enrollment lúc validate để định tuyến đúng giáo viên
-- file_path khớp CHÍNH XÁC với RequiredDeliverable.required_filename — exact match,
-- không có trạng thái "ambiguous" vì không có gì để đoán
Submission       (id, exam_session_id, required_deliverable_id,
                   student_mssv, student_name_input,   -- do sinh viên tự nhập lúc thi
                   home_class_id, home_teacher_id,      -- tra từ Enrollment, có thể khác lớp coi thi
                   storage_key,          -- đường dẫn trên S3/MinIO
                   checksum, file_size,
                   submitted_via[normal/backup/manual_pull],
                   submitted_at,
                   status[received/validated/collected/invalid])

-- Rubric — CÓ VERSIONING
Rubric           (id, course_id, version, created_at, is_active)
RubricCriterion  (id, rubric_id, description, max_points)

-- Kết quả chấm — vòng đời CHẤM ĐIỂM, chỉ tạo dòng mới khi giáo viên bấm "Bắt đầu chấm"
-- giữ nguyên bản AI, không ghi đè khi giáo viên sửa
GradingResult    (id, submission_id, rubric_id_version,
                   model_used, criterion_results JSON,   -- verdict + evidence từng tiêu chí
                   ai_total_score, confidence, flag_for_review,
                   grading_triggered_by,  -- teacher_id, ghi nhận ai bấm bắt đầu chấm
                   grading_triggered_at,
                   status[ai_grading/ai_graded/
                          auto_approved/flagged_for_review/
                          teacher_reviewed/finalized/exported])

TeacherReview    (id, grading_result_id, teacher_id,
                   final_score, edited_criteria JSON, reviewed_at)

-- Dùng cho báo cáo đồ án
CalibrationRun   (id, rubric_id_version, model_used, sample_size,
                   agreement_score, cost_usd, run_at, notes)

-- Nhập điểm ngược vào file danh sách/bảng điểm có sẵn của giáo viên (không chỉ
-- xuất file mới). Cột MSSV/cột điểm do giáo viên CHỈ ĐỊNH TƯỜNG MINH lúc export,
-- KHÔNG đoán — cùng nguyên tắc với RequiredDeliverable.
GradeExport      (id, exam_session_id, exported_by,
                   template_storage_key,  -- file gốc giáo viên upload
                   output_storage_key,    -- file đã điền điểm, trả về tải xuống
                   mssv_column, score_column,  -- do giáo viên chỉ định
                   unmatched_mssv_count,  -- số MSSV không khớp, giáo viên tự xử lý
                   exported_at)

-- Admin & quản trị (xem chi tiết mục 4.5)
AdminAccount     (id, name, email, role[super_admin/department_admin])

AuditLog         (id, actor_id, actor_type[admin/teacher], action,
                   target_type, target_id, old_value JSON, new_value JSON,
                   occurred_at)

RubricTemplate   (id, department_id, name, criteria JSON, created_by_admin)

CostBudget       (id, scope_type[teacher/department], scope_id,
                   monthly_limit_usd, current_spend_usd, period)
```

**Vì sao Rubric cần versioning?** Nếu giáo viên sửa rubric giữa chừng (sau khi đã chấm một số bài), các `GradingResult` cũ vẫn phải trỏ về đúng phiên bản rubric lúc chấm — nếu không, dữ liệu lịch sử bị lệch so với rubric hiện tại và `CalibrationRun` sẽ so sánh sai.

**Vì sao giữ nguyên `ai_total_score` thay vì ghi đè khi giáo viên sửa?** Cần dữ liệu này để tính calibration (so sánh điểm AI vs điểm cuối cùng của giáo viên) — ghi đè mất thì không còn gì để đánh giá AI chấm đúng bao nhiêu %. Tách `TeacherReview` thành bảng riêng, không sửa trực tiếp lên `GradingResult`.

**Vì sao không giữ full lịch sử snapshot?** Chỉ cần 1 bản snapshot mới nhất làm backup — không cần bảng riêng lưu từng lần snapshot, chỉ cần field `last_snapshot_at` gắn ở trạng thái agent (Redis).

### 4.3 Kiến trúc pipeline chấm điểm — state machine, không phải script chạy 1 lần

Một "script chạy 1 lần rồi xong" sẽ gãy trong thực tế: nếu extraction lỗi ở 1 bài trong 200 bài, không được để cả script chết theo; giáo viên cần thấy tiến độ (đã chấm bao nhiêu/200); quy trình "AI chấm → giáo viên duyệt → sửa → chốt" trải dài qua thời gian, không gói trong 1 lần gọi hàm được; calibration cần chạy lại nhiều lần với đủ dữ liệu lịch sử để so sánh.

**Ranh giới quan trọng cần giữ rõ trong thiết kế**: quy trình **thu bài** (kết thúc ở `COLLECTED`) và quy trình **chấm điểm** (bắt đầu từ `AI_GRADING`) là 2 giai đoạn tách rời, nối với nhau bằng **hành động chủ động của giáo viên** ("Bắt đầu chấm"), không phải một pipeline tự động chạy liên tục từ lúc thu bài. Hệ thống không tự đẩy bài vào Grading Queue ngay khi thu xong.

```
RECEIVED → EXTRACTED_METADATA → VALIDATED → COLLECTED
                                                  │
                                    (giáo viên bấm "Bắt đầu chấm",
                                     có thể ngay lúc đó hoặc vài ngày sau)
                                                  ▼
                            AI_GRADING → AI_GRADED
                                → (confidence cao) → AUTO_APPROVED
                                → (confidence thấp) → FLAGGED_FOR_REVIEW
                    FLAGGED_FOR_REVIEW / AUTO_APPROVED → TEACHER_REVIEWED → FINALIZED → EXPORTED
```

Triển khai bằng BullMQ, mỗi submission là 1 job chạy tuần tự các bước (extract → grade → check confidence), **cập nhật trạng thái vào DB sau mỗi bước** để: UI giáo viên hiển thị được thanh tiến độ real-time; job lỗi giữa chừng thì retry đúng từ bước bị lỗi, không chạy lại từ đầu; dữ liệu mỗi bước đều truy vấn được sau này (phục vụ calibration, debug). Riêng đoạn `RECEIVED → COLLECTED` chạy ngay khi hết giờ thi (tự động), còn đoạn `AI_GRADING` trở đi chỉ khởi tạo khi nhận được lệnh "Bắt đầu chấm" từ giáo viên (API riêng, không phải nối tiếp tự động trong cùng 1 job).

### 4.4 Chiến lược model & chi phí — model cascade thay vì 1 model cho tất cả

Không cần train/fine-tune model — dùng **prompting (in-context learning)**: rubric-conditioned prompt + vài anchor example đã chấm tay của giáo viên (few-shot), không cần dữ liệu train riêng, đổi rubric/môn học chỉ cần đổi prompt.

Để kiểm soát chi phí khi chấm hàng loạt, dùng kiến trúc phân tầng thay vì gọi 1 model mạnh cho toàn bộ:

```
Tất cả bài nộp
     ↓
[Model nhẹ/rẻ] chấm lượt đầu (vd Haiku)
     ↓
  Đủ rõ ràng? ──Yes──► Chốt điểm (AUTO_APPROVED)
     │No / confidence thấp / bất thường
     ↓
[Model mạnh hơn] chấm lại (vd Sonnet/Opus) — chỉ áp dụng phần nhỏ còn lại
     ↓
  Vẫn mơ hồ? → FLAGGED_FOR_REVIEW (giáo viên)
```

Kèm 3 kỹ thuật giảm chi phí, cộng dồn được với nhau:
- **Batch API**: việc chấm bài không cần real-time (giáo viên xem sau vài phút/chục phút không sao) → dùng batch job thay vì gọi API đồng bộ, giảm chi phí đáng kể so với giá tiêu chuẩn.
- **Prompt caching**: rubric + system instruction + anchor example giống hệt nhau giữa các bài trong cùng phiên thi, chỉ bài làm sinh viên khác nhau → đưa phần rubric/instruction vào đầu prompt để cache, giảm mạnh chi phí phần lặp lại khi chấm hàng trăm bài cùng rubric.
- **Autograder cho phần khách quan**: code có test case, câu hỏi có đáp án xác định → chấm bằng test case/so khớp đáp án, không cần gọi LLM cho phần này.

Chi phí thực tế cho AI grading ở quy mô đồ án/1 khoa thường không phải điểm nghẽn (ước tính dưới vài USD cho hàng trăm-nghìn bài khi áp dụng cascade + batch + cache) — điểm cần lưu ý hơn là độ trễ xử lý và độ chính xác, không phải chi phí. Nên kiểm tra giá mới nhất tại platform.claude.com/docs/en/about-claude/pricing vì giá có thể thay đổi theo thời gian.

**Gợi ý chọn model theo loại bài:**

| Loại chấm | Model đề xuất | Lý do |
|---|---|---|
| Code có test case | Không cần LLM — autograder | Rẻ nhất, chính xác nhất |
| Trắc nghiệm/câu ngắn có đáp án rõ | Model nhẹ (Haiku) | Đủ chính xác cho task có cấu trúc |
| Tự luận, rubric nhiều tiêu chí | Model nhẹ lượt đầu → model mạnh cho case flagged | Cân bằng chi phí/chất lượng |
| Case giáo viên đánh dấu tranh chấp | Model mạnh hoặc giáo viên tự chấm | Chỉ áp dụng phần rất nhỏ còn lại |

Đây cũng là thí nghiệm tốt cho phần đánh giá đồ án: so sánh agreement-với-giáo-viên và chi phí thực đo giữa 3 phương án (model nhẹ-only / cascade / model mạnh-only) trên tập held-out, kết luận cascade cân bằng tốt nhất — luận điểm kỹ thuật có số liệu, không chọn model theo cảm tính.

### 4.5 Role Admin

Hệ thống cần thêm role **Admin**, tách biệt khỏi Giáo viên — tương tự vai trò "Technicians' Console" mà NetSupport tách riêng khỏi Tutor. Các nhóm trách nhiệm:

1. **Quản lý tài khoản & phân quyền**: tạo/khóa/xóa tài khoản giáo viên, reset mật khẩu, import hàng loạt từ danh sách khoa.
2. **Quản lý cấu trúc học vụ**: danh mục môn học/học kỳ/khoa, roster lớp học tập trung (tránh giáo viên tự import trùng lặp gây sai lệch dữ liệu), thư viện `RubricTemplate` dùng chung.
3. **Quản lý hạ tầng & AI**: dashboard quota/chi phí AI theo giáo viên/khoa (`CostBudget`), cấu hình model mặc định + ngưỡng confidence escalate cho từng loại bài, theo dõi tình trạng vận hành (agent đang kết nối, tỷ lệ lỗi upload, hàng đợi chấm bài tồn đọng).
4. **Audit & compliance** (quan trọng nhất, dễ bị bỏ sót): mọi thao tác sửa điểm sau khi đã `FINALIZED` phải ghi vào `AuditLog` (ai sửa, lúc nào, giá trị cũ/mới) — yêu cầu gần như bắt buộc về liêm chính học thuật cho hệ thống chấm điểm. Admin xem được toàn bộ bài `FLAGGED_FOR_REVIEW` xuyên suốt hệ thống để phát hiện pattern bất thường (vd 1 giáo viên có tỷ lệ flag cao bất thường do rubric viết dở).
5. **Bảo mật vận hành**: thu hồi phiên đăng nhập/token khi tài khoản giáo viên bị lộ, xem lịch sử đăng nhập bất thường.

**Phạm vi MVP cho đồ án**: chỉ cần 1 role Admin duy nhất (không tách Super/Department Admin), gồm quản lý tài khoản giáo viên + import roster, dashboard chi phí AI đơn giản, và audit log cho việc sửa điểm sau finalize. Phần Department Admin/RubricTemplate dùng chung nhiều khoa để ở "hướng phát triển", không cần làm thật.

### 4.6 Định tuyến bài thi bù về đúng lớp gốc & định danh bài nộp không cần đoán

**Case thi bù khác lớp/khác phiên (cùng môn)**: xác thực join phiên thi dựa trên cấp môn học (Course), không cứng theo 1 lớp — sinh viên chỉ cần có `Enrollment` ở đúng `course_id` là join được phiên thi bất kỳ thuộc môn đó, kể cả phiên đó do giáo viên/lớp khác tạo. Sau khi thu bài, hệ thống tra `Enrollment` để gắn `home_class_id`/`home_teacher_id` vào `Submission` — nhờ vậy bài luôn "chảy" về đúng giáo viên quản lý sinh viên đó trong màn hình Quản lý, bất kể bài được thu vật lý ở phòng/phiên nào.

**Định danh bài nộp bằng tên file cố định — loại bỏ mơ hồ từ gốc, không đoán, không cần ai xử lý thủ công.** Nguyên tắc: quyết định "file nào là bài nộp" **trước khi thi diễn ra**, không phải đoán sau khi thu bài. Cụ thể:

- Lúc tạo phiên thi, giáo viên khai báo `RequiredDeliverable` — danh sách tên file bắt buộc theo câu hỏi (vd `Cau1.docx`, `Cau2.docx`) hoặc project root cho bài code. Đây là việc giáo viên vốn đã phải làm khi soạn đề (biết đề có mấy câu), không phát sinh thao tác mới.
- Agent, lúc tạo folder bài làm, **tự tạo/tải sẵn đúng các file rỗng/skeleton theo tên đã khai báo** — sinh viên mở file có sẵn ra làm, không tự đặt tên file nộp.
- Lúc thu bài (snapshot định kỳ lẫn chốt bài cuối giờ), hệ thống **chỉ lấy đúng file khớp tên đã khai báo (exact match)** — không quét/đoán trong toàn bộ thư mục. File nháp/thử sinh viên tạo thêm không ảnh hưởng gì vì đơn giản không khớp tên, không được thu.
- Riêng phần **snapshot backup định kỳ** vẫn áp dụng thêm whitelist extension + ignore pattern (loại `node_modules/`, `.git/`, `dist/`, `build/`, `__pycache__/`, `.venv/`...) cho trường hợp code project — các thư mục sinh tự động, nặng, tái tạo được từ file cấu hình (`package.json`, `requirements.txt`) nên không cần backup. Thêm giới hạn dung lượng tối đa mỗi lần snapshot, vượt thì cảnh báo thay vì âm thầm nén hết.
- Thiếu file bắt buộc lúc chốt bài → `Submission.status = invalid` (trạng thái đã có sẵn), không phải trường hợp mơ hồ cần xử lý tay.

**Vì sao cách này không tạo việc cho ai**: sinh viên không cần thao tác chọn/xác nhận file (chỉ làm bài vào file agent đã tạo sẵn — tự nhiên như bình thường); giáo viên không cần review thủ công case nào (chỉ điền tên file lúc soạn đề, việc vốn đã làm); hệ thống xử lý bằng exact-match đơn giản, không cần heuristic hay trạng thái review riêng.

---

### 4.7 Phân phối tài nguyên đề thi tự động

Giáo viên upload tài nguyên đề thi (đề PDF, dataset, starter code project...) 1 lần lúc tạo phiên thi, thay cho việc gửi thủ công qua email/USB cho từng máy — lưu vào object storage (`ExamMaterial`), agent tự tải về cùng lúc tạo `RequiredDeliverable`.

**Instruction tự sinh, không tốn công giáo viên**: agent tự tạo file `HUONG_DAN.txt` trong thư mục bài làm, nội dung sinh tự động từ dữ liệu `RequiredDeliverable`/`submission_rule` đã khai báo (tên file cần nộp, giờ kết thúc) — giáo viên chỉ khai báo dữ liệu, không soạn văn bản hướng dẫn. Giảm thêm 1 nguồn lỗi: sinh viên đổi tên file/hiểu nhầm quy ước, giờ có hướng dẫn ngay tại chỗ.

**Thời điểm phát tài nguyên — tránh lộ đề**: tài nguyên đề thi chỉ được trả về khi server xác nhận đã tới `start_time`, dù agent connect sớm hơn (vd sinh viên mở agent sớm để test máy). Tách biệt rõ "được phép kết nối/vào lobby" và "được phép thấy đề" — nếu không tách, sinh viên join sớm sẽ có đề trước người khác dù không cố ý gian lận.

**Lưu ý vận hành**: cảnh báo nhẹ ở UI upload (không chặn cứng) nếu giáo viên lỡ nén cả `node_modules/`/dependency nặng vào tài nguyên — nhắc chỉ upload source, tránh làm chậm lúc hàng chục agent cùng tải một lúc. Tài nguyên chỉ tải 1 lần lúc bắt đầu, không ảnh hưởng tới cơ chế snapshot định kỳ (2 luồng độc lập).

---

### 4.8 Sandbox thực thi code — rủi ro bảo mật cần xử lý ngay từ đầu

Chạy code của sinh viên để chấm bằng test case (autograder) là **thực thi mã không tin cậy (untrusted code execution)** — rủi ro bảo mật thật, không phải lý thuyết. Nếu `exec()`/`subprocess` thẳng code sinh viên trên server mà không cô lập, sinh viên (vô tình hoặc cố ý) có thể xóa file hệ thống, vét cạn tài nguyên (fork bomb, vòng lặp vô hạn), hoặc truy cập mạng nội bộ từ server.

**Bắt buộc trước khi build module autograder:**
- Chạy code sinh viên trong **container cô lập** (Docker, mỗi lần chạy 1 container dùng xong hủy).
- Giới hạn cứng: CPU/RAM, timeout thực thi, **không có quyền truy cập mạng ra ngoài container**.
- Coi đây là 1 module kỹ thuật riêng, không gộp chung hời hợt vào bước "extraction".

**Về scope "code — hệ thống FE/BE hoàn chỉnh":** đây là bước nhảy độ khó lớn so với chấm 1 file/1 hàm — cần orchestrate nhiều service (backend + DB, có thể cả frontend build), cài dependency, build, khởi động rồi mới chạy được test, dễ tốn phần lớn thời gian đồ án chỉ để làm ổn định phần "build & run" thay vì tập trung vào AI. **Giới hạn scope MVP**: chấm 1 service backend có sẵn bộ test/API contract (vd bộ test Postman/API test có sẵn để kiểm tra request/response đúng-sai), chưa cần orchestrate multi-service đầy đủ hay kiểm định FE UI (visual regression/E2E) — để phần đó ở hướng mở rộng.

---

## 5. Tech stack

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Web app | Next.js | Gộp chung 2 module (Phòng thi + Quản lý/Chấm điểm) trong 1 app, tách theo route |
| Backend | NestJS + PostgreSQL | Tái dùng kinh nghiệm KhoMC |
| Hạ tầng | VPS + S3 | Đã quen hạ tầng VPS từ KhoMC |
| Kênh điều khiển agent | WebSocket (Socket.IO) | Agent chủ động connect ra server, không cần NAT traversal/Gateway server phức tạp như NetSupport |
| Agent | Electron (tái dùng kỹ năng web) hoặc .NET nhẹ | Không cần driver/kernel-mode vì đã bỏ lockdown; chạy trên máy phòng lab đã cấu hình đồng nhất |
| Grading queue | BullMQ | Đã quen dùng, mỗi submission = 1 job |
| AI grading | Đa provider: Claude API (tự luận/ảnh, structured output), Codex/OpenAI (code review) qua 1 lớp interface trừu tượng chung (`AIGradingProvider`) | Rubric-conditioned prompting, few-shot anchor examples; tách interface để dễ swap/so sánh giữa 2 provider, theo dõi chi phí riêng từng bên |
| Autograder (code) | Docker container cô lập, giới hạn CPU/RAM/timeout, không mạng ra ngoài | Xem mục 4.8 — bắt buộc vì thực thi mã không tin cậy |
| Extraction | mammoth (docx), vision model đọc trực tiếp ảnh (ảnh chụp bài viết tay, thay vì OCR truyền thống — chính xác hơn với tiếng Việt viết tay), đọc trực tiếp (code) | |

---

## 6. Phạm vi MVP (đề xuất cho 2 người, ~3-4 tháng)

**Bối cảnh triển khai đã chốt**: phòng lab (không phải BYOD), 40-50 máy nhưng chỉ ~10+ kết nối đồng thời thực tế — quy mô này nhỏ, không cần lo phần scale-ngang (xem ghi chú ở mục 8).

**Trong scope — 3 loại bài thi:**
- **Word/Excel (đánh máy)**: extraction bằng mammoth, chấm bằng rubric + AI — rủi ro thấp nhất, nên làm trước và làm chắc.
- **Code**: autograder chạy trong container cô lập (mục 4.8), giới hạn ở 1 service backend có test/API contract sẵn — chưa orchestrate multi-service đầy đủ.
- **Ảnh chụp bài giấy**: dùng vision model đọc trực tiếp (không qua OCR riêng) — rủi ro cao nhất về độ chính xác (chữ viết tay tiếng Việt có dấu), nên làm sau cùng và chấp nhận sai số cao hơn 2 loại kia.

**Các phần khác trong scope:**
- Tạo phiên thi, quản lý danh sách lớp (import Excel)
- Agent: connect, tạo folder, snapshot định kỳ, chốt bài theo lệnh
- Thu bài + xử lý fallback bằng snapshot backup
- Rubric có cấu trúc, structured output, defer-to-human khi confidence thấp
- UI giáo viên duyệt điểm + **nhập điểm ngược vào file danh sách/bảng điểm có sẵn** (cột MSSV/điểm do giáo viên chỉ định tường minh, không đoán — xem `GradeExport` ở mục 4.2)
- Role Admin cơ bản (mục 4.5): quản lý tài khoản giáo viên, dashboard chi phí AI, audit log sửa điểm
- Calibration run cơ bản để có số liệu đánh giá trong báo cáo — **nên nhờ 1 người chấm tay độc lập** (không phải người xây hệ thống) trên bộ dữ liệu tự tạo, để tránh thiên lệch khi so sánh AI vs người chấm

**Ngoài scope (ghi rõ trong báo cáo là "hướng phát triển"):**
- Bất kỳ hình thức lockdown/chống gian lận nào (kiosk, chặn CLI, chặn ổ đĩa)
- Chấm code dạng orchestrate nhiều service (FE+BE+DB đầy đủ) hoặc kiểm định UI tự động (visual regression/E2E)
- Định danh sinh viên qua khuôn mặt/camera
- Multi-site qua Internet (Gateway/relay server) — chỉ cần chạy tốt trong phòng lab cùng mạng trường

---

## 7. Rủi ro & edge case cần xử lý trong spec

- Agent mất kết nối WebSocket giữa giờ → tự reconnect, không báo động giả ngay lập tức.
- Một MSSV kết nối 2 lần (2 máy) trong cùng phiên → từ chối hoặc cảnh báo trùng.
- Mã phiên thi bị lộ ra ngoài lớp → luôn kiểm tra MSSV có trong danh sách lớp đăng ký môn đó, không chỉ dựa vào mã phiên.
- Agent bị tắt giữa giờ (vô tình/cố ý) → server phát hiện mất kết nối, báo cho giáo viên (dù không ngăn được, vẫn là tín hiệu hữu ích).
- AI chấm sai/hallucinate → bắt buộc có trường "evidence" trích dẫn từ bài làm, và cơ chế flag-for-review khi confidence thấp, giáo viên luôn là người chốt cuối.

---

## 8. Khả năng chịu tải & scale (thiết kế cho tương lai — KHÔNG cần vận hành thật ở quy mô đồ án)

> **Cập nhật sau khi chốt quy mô thực tế**: phòng lab 40-50 máy, ~10+ kết nối đồng thời. Quy mô này 1 NestJS instance đơn lẻ xử lý dư sức — toàn bộ mục này chỉ cần trình bày như **kiến trúc có khả năng mở rộng**, không cần triển khai Redis adapter/load balancer thật cho đồ án.

Kênh WebSocket chỉ truyền status/lệnh nhỏ (không truyền video như NetSupport), nên bài toán tải chính nằm ở **file upload (snapshot)**, không phải ở việc giữ kết nối. Tách 2 vấn đề để xử lý riêng:

### 8.1 Scale tầng kết nối WebSocket
- Nhiều instance NestJS (Socket.IO) đứng sau load balancer (bật sticky session).
- Dùng `@socket.io/redis-adapter` để các instance đồng bộ trạng thái với nhau (giáo viên ở instance A vẫn thấy sinh viên connect ở instance B).

### 8.2 Tách file upload khỏi server ứng dụng
- Không ghi file snapshot thẳng vào ổ đĩa NestJS. Dùng **object storage** (S3/MinIO).
- Agent xin **presigned URL** (1 request REST nhẹ) rồi upload trực tiếp lên storage, NestJS chỉ nhận callback cập nhật DB. Storage chịu tải file, server ứng dụng không nghẽn.

### 8.3 Tránh "thundering herd"
- Thêm **jitter ngẫu nhiên** vào thời điểm snapshot định kỳ của từng agent, tránh hàng nghìn agent cùng upload trong 1 giây.
- Lệnh "chốt bài" cuối giờ nên rải trong vài chục giây thay vì broadcast đồng loạt tuyệt đối cùng lúc.

### 8.4 Database & Queue
- PgBouncer (connection pooling) khi có nhiều instance NestJS cùng nối DB.
- BullMQ (grading queue) vốn tách rời khỏi phần realtime, scale độc lập bằng cách thêm worker.

### 8.5 Cách trình bày trong đồ án
- MVP triển khai & test thật ở quy mô 1 phòng thi/1 lớp.
- Kiến trúc thiết kế có khả năng scale ngang (Redis adapter, object storage, jitter) — nêu rõ trong tài liệu kiến trúc, không cần hạ tầng thật của cả trường.
- Load test mô phỏng bằng k6/Artillery giả lập vài trăm–1000 kết nối WebSocket đồng thời, đo độ trễ/tỷ lệ lỗi khi tăng tải → đưa vào báo cáo làm phần "đánh giá hiệu năng".

## 9. Bước tiếp theo

1. Viết spec chi tiết cho từng module (Exam Session, Agent Protocol, Grading Pipeline).
2. Thiết kế prompt template cụ thể cho rubric-conditioned grading (sẽ nghiên cứu sâu sau theo kế hoạch).
3. Lên timeline sprint theo scope MVP ở mục 6.
4. Thiết kế kịch bản load test mô phỏng (k6/Artillery) cho phần đánh giá hiệu năng — mức độ tham khảo, không bắt buộc vì quy mô thực tế nhỏ.
5. Chuẩn bị sandbox Docker cho autograder (mục 4.8) trước khi viết logic chấm code.

## 10. Checklist trước khi build

**Kỹ thuật:**
- [ ] Đã thiết kế sandbox Docker cho autograder (cô lập CPU/RAM/timeout/mạng) — mục 4.8
- [ ] Đã chốt scope "code" ở mức 1 service backend có test/API contract, chưa orchestrate multi-service
- [ ] Đã thiết kế lớp interface trừu tượng `AIGradingProvider` để dùng chung cho Claude + Codex
- [ ] Đã đăng ký tài khoản/API key cho cả 2 provider AI, có thẻ thanh toán sẵn sàng cho giai đoạn test + demo

**Hạ tầng:**
- [ ] Đã chốt VPS + S3 cụ thể, ước tính chi phí vận hành (băng thông, lưu trữ) đưa vào báo cáo
- [ ] Đã xác nhận máy phòng lab (OS, quyền cài đặt, có bị chặn bởi antivirus/Windows Defender không) trước khi chọn công nghệ viết agent

**Dữ liệu & đánh giá:**
- [ ] Đã chuẩn bị bộ đề test từ đơn giản đến khó cho cả 3 loại bài (docx/code/ảnh)
- [ ] Đã sắp xếp được người chấm tay độc lập (không phải người xây hệ thống) cho ít nhất 1 bộ nhỏ, phục vụ calibration khách quan
- [ ] Đã xác định thời gian lưu trữ bài làm/điểm sau khi thi xong, và thông báo minh bạch cho người dùng thử nghiệm biết agent thu thập gì

**Vận hành & bảo vệ:**
- [ ] Đã chia ranh giới công việc rõ ràng (nếu làm nhóm) và chốt API contract (WebSocket message format, REST endpoint) sớm
- [ ] Đã lên mốc demo giữa kỳ với 1 luồng end-to-end tối thiểu (1 phiên thi → thu bài → AI chấm 1 loại bài đơn giản)
- [ ] Đã lên kế hoạch thử nghiệm với người dùng thật (lớp học thật hoặc mô phỏng) ít nhất 1 lần trước ngày bảo vệ
