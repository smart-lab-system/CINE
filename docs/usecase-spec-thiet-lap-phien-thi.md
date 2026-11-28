# Đặc tả use case — Thiết lập phiên thi

Tài liệu này đặc tả **một** use case nghiệp vụ: giảng viên tạo phiên thi rồi chuẩn bị đủ thông tin ca thi trên hub Thiết lập, đến khi xác nhận hoàn tất. Phạm vi kết thúc ở **Hoàn tất thiết lập**. Mở cửa cho sinh viên vào thi là bước vận hành riêng, nằm ngoài use case này.

Phạm vi hệ thống: web giảng viên. Sinh viên không dùng màn hình này. Use case chỉ chạy khi phiên đăng nhập còn hiệu lực và vai trò là giảng viên.

---

## UC-EXM-02 — Thiết lập phiên thi

1. **Use case ID:** UC-EXM-02
2. **Tên use case:** Thiết lập phiên thi
3. **Tác nhân:**
   - Tác nhân chính: Giảng viên.
   - Tác nhân phụ: không có.
4. **Mô tả:** Cho phép giảng viên lập một ca thi thuộc lớp mình đang dạy và hoàn thiện thiết lập trước giờ mở cửa: thông tin chung (loại thi, khung giờ, phòng), danh sách thí sinh của phiên, thư mục bài làm (file sinh viên phải nộp), đề thi cùng rubric (và đáp án mẫu nếu cần), rồi xác nhận hoàn tất. Sau khi tạo, phiên ở trạng thái **Sắp diễn ra** (`scheduled`). Giảng viên làm việc trên hub Thiết lập theo các bước; có thể chuyển bước tự do và lưu nháp. **Hoàn tất** ghi thiết lập lên hệ thống và kiểm tra sẵn sàng; **không** mở phiên thi.
5. **Điều kiện tiên quyết:**
   - Giảng viên đã đăng nhập.
   - Đã có ít nhất một lớp học phần được phân công cho giảng viên đó, với phòng máy và danh mục liên quan sẵn sàng để chọn.
   - Trang tạo phiên và hub Thiết lập sẵn sàng.
6. **Kết quả:**
   - Một phiên thi thuộc giảng viên được tạo với lớp, phòng, loại thi (`TK` / `GK` / `CK`), tên, thời gian bắt đầu và kết thúc; trạng thái **Sắp diễn ra**.
   - Trên hub, khi còn Sắp diễn ra, giảng viên đã (hoặc có thể đã) thiết lập: loại thi / giờ / phòng; danh sách thí sinh theo phiên; ít nhất cấu hình thư mục bài làm khi muốn đủ điều kiện mở sau này; đề thi và rubric nếu cần; đáp án mẫu nếu muốn.
   - Khi bấm Hoàn tất thành công: các thay đổi đang nháp được ghi lên hệ thống; checklist sẵn sàng được đánh giá; phiên vẫn **Sắp diễn ra** (chưa mở cửa cho sinh viên).
   - Tên phiên, lớp học phần và học kỳ không đổi sau khi tạo trong use case này.
7. **Luồng chính:**

| Actor                                                                                                                                                                                                                          | System                                                                                                                                                        |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Giảng viên mở tạo phiên thi mới và chọn lớp thi, phòng thi, loại thi, tên phiên, thời gian bắt đầu và kết thúc, rồi xác nhận tạo.                                                                                           |                                                                                                                                                               |
|                                                                                                                                                                                                                                | 2. Hệ thống kiểm tra dữ liệu tạo (trường bắt buộc, giờ kết thúc sau giờ bắt đầu, phòng và lớp hợp lệ trong phạm vi giảng viên).                               |
|                                                                                                                                                                                                                                | 3. Hệ thống lưu phiên với trạng thái **Sắp diễn ra** và đưa giảng viên vào hub Thiết lập phiên thi.                                                           |
| 4. Giảng viên ở bước **Thông tin chung**: xem mã phiên, môn, lớp, học kỳ (chỉ đọc); chỉnh loại thi, thời gian và phòng thi nếu cần.                                                                                            |                                                                                                                                                               |
|                                                                                                                                                                                                                                | 5. Hệ thống tải và hiển thị danh sách thí sinh mặc định lấy từ sĩ số lớp học phần.                                                                            |
| 6. Giảng viên sang bước **Danh sách thí sinh**: xem danh sách mặc định lấy từ sĩ số lớp học phần; giữ nguyên hoặc tùy chỉnh cho riêng phiên này (xem **6a**) và chuyển sang bước tiếp theo.                            |                                                                                                                                                               |
| 7. Giảng viên sang bước **Thư mục bài làm**: khai báo các file sinh viên phải nộp trong thư mục bài thi (ít nhất một file khi muốn đủ điều kiện mở phiên sau này) và xem preview thư mục nếu có và chuyển sang bước tiếp theo. |                                                                                                                                                               |
| 8. Giảng viên sang bước **Đề thi & Rubric**: gắn hoặc tải đề phát cho sinh viên; gắn rubric chấm cho phiên; có thể thêm đáp án mẫu (tuỳ chọn) và chuyển sang bước tiếp theo.                                                   |                                                                                                                                                               |
|                                                                                                                                                                                                                                | 9. Hệ thống tổng hợp thông tin đã thiết lập và hiển thị bảng tóm tắt kèm checklist mức độ sẵn sàng.                                                           |
| 10. Giảng viên sang bước **Xác nhận**: xem tóm tắt và checklist sẵn sàng.                                                                                                                                                      |                                                                                                                                                               |
| 11. Giảng viên chọn **Hoàn tất**.                                                                                                                                                                                              |                                                                                                                                                               |
|                                                                                                                                                                                                                                | 12. Hệ thống ghi các thay đổi còn nháp lên máy chủ, chạy checklist, thông báo đã lưu thiết lập, và giữ giảng viên ở bước Xác nhận. Phiên vẫn **Sắp diễn ra**. |

*Ghi chú Bước 6 (Luồng chính):* Giữ nguyên danh sách theo lớp (không thêm, không import, không gỡ) là hành vi mặc định đã nằm trong Bước 6. Hệ thống tiếp tục hiển thị sĩ số lớp làm danh sách hiệu lực cho đến khi có tùy chỉnh (xem **6a**) hoặc đến khi phiên được mở ở use case khác. Không tách thành luồng thay thế riêng.

8. **Luồng thay thế:**

**3a — Tạo xong rồi rời hub, quay lại sau**

* **Liên kết:** Rẽ nhánh tại **Bước 3** của Luồng chính → Quay lại **Bước 4** (hoặc bước đang cần trên hub).

| Actor | System |
| :--- | :--- |
| 3a.1. Sau bước 3 của luồng chính, giảng viên có thể đóng trang và mở lại hub Thiết lập từ danh sách phiên khi phiên vẫn Sắp diễn ra. | |
| | 3a.2. Use case tiếp tục từ bước đang cần; bản nháp trên cùng trình duyệt có thể còn nếu chưa xoá. |
| | 3a.3. Tiếp tục tại **Bước 4** (hoặc bước đang cần trên hub) của Luồng chính. |

**4–11a — Chuyển bước không theo thứ tự**

* **Liên kết:** Rẽ nhánh tại **Bước 4–11** của Luồng chính → Quay lại **bước được chọn** trên hub.

| Actor | System |
| :--- | :--- |
| 4–11a.1. Khi phiên còn Sắp diễn ra, giảng viên chọn bất kỳ bước nào trên thanh bước, hoặc Quay lại / Tiếp tục. | |
| | 4–11a.2. Hệ thống không bắt buộc hoàn thành bước hiện tại trước khi chuyển; dữ liệu form đang gõ được giữ tạm trên máy giảng viên. |
| | 4–11a.3. Tiếp tục thực hiện tại bước được giảng viên chọn trên hub. |

**4–11b — Lưu nháp**

* **Liên kết:** Rẽ nhánh tại **Bước 4–11** của Luồng chính → Quay lại **bước hiện tại**.

| Actor | System |
| :--- | :--- |
| 4–11b.1. Giảng viên chọn Lưu nháp. | |
| | 4–11b.2. Hệ thống ghi những phần đã đủ điều kiện lưu; không chạy đầy đủ checklist mở phiên; không mở phiên. Phần chưa đủ điều kiện vẫn nằm trên máy giảng viên. |
| | 4–11b.3. Hệ thống giữ giảng viên tại bước hiện tại. |

**4–11c — Bỏ nháp**

* **Liên kết:** Rẽ nhánh tại **Bước 4–11** của Luồng chính → Quay lại **bước hiện tại**.

| Actor | System |
| :--- | :--- |
| 4–11c.1. Giảng viên chọn Bỏ nháp. | |
| | 4–11c.2. Hệ thống xoá bản nháp cục bộ của phiên và đổ lại form từ dữ liệu đã lưu trên máy chủ. |
| | 4–11c.3. Hệ thống giữ giảng viên tại bước hiện tại. |

**6a — Tùy chỉnh danh sách thí sinh theo phiên**

* **Liên kết:** Rẽ nhánh tại **Bước 6** của Luồng chính → Quay lại **Bước 7**.

| Actor | System |
| :--- | :--- |
| 6a.1. Tại bước **Danh sách thí sinh**, giảng viên thêm sinh viên thủ công, tải file danh sách, hoặc gỡ thí sinh. | |
| | 6a.2. Thao tác đầu tiên làm tách danh sách phiên khỏi sĩ số lớp (materialize). Mọi chỉnh sửa chỉ áp dụng cho phiên này; sĩ số lớp học phần không đổi. Nếu chưa tùy chỉnh, mở phiên sau này sẽ dùng danh sách lớp; nếu đã tùy chỉnh, dùng đúng danh sách phiên. |
| | 6a.3. Tiếp tục tại **Bước 7** của Luồng chính. |

**8a — Gắn đề từ kho / soạn đề hoặc tải tệp**

* **Liên kết:** Rẽ nhánh tại **Bước 8** của Luồng chính → Quay lại **Bước 8** (tiếp tục gắn rubric / đáp án mẫu) hoặc tiến **Bước 9**.

| Actor | System |
| :--- | :--- |
| 8a.1. Ở bước **Đề thi & Rubric**, giảng viên tìm và chọn đề đã có, hoặc tải tệp đề/tài liệu lên phiên. | |
| | 8a.2. Hệ thống gắn vật liệu đề vào phiên để phát cho sinh viên khi vào thi. |
| 8a.3. Giảng viên tiếp tục tại **Bước 8** (gắn rubric / đáp án mẫu) hoặc tiến **Bước 9** của Luồng chính. | |

**8b — Gắn hoặc đổi rubric**

* **Liên kết:** Rẽ nhánh tại **Bước 8** của Luồng chính → Quay lại **Bước 8** (tiếp tục) hoặc tiến **Bước 9**.

| Actor | System |
| :--- | :--- |
| 8b.1. Giảng viên tìm rubric (ví dụ theo loại QA/QS và học kỳ) rồi xác nhận gắn vào phiên. | |
| | 8b.2. Rubric có thể đổi khi phiên còn cho phép gắn. Thiếu rubric không chặn Hoàn tất; checklist chỉ cảnh báo vì rubric cần trước khi chấm. |
| 8b.3. Giảng viên tiếp tục tại **Bước 8** hoặc tiến **Bước 9** của Luồng chính. | |

**8c — Đáp án mẫu (tuỳ chọn)**

* **Liên kết:** Rẽ nhánh tại **Bước 8** của Luồng chính → Quay lại **Bước 8** (tiếp tục) hoặc tiến **Bước 9**.

| Actor | System |
| :--- | :--- |
| 8c.1. Giảng viên tải một file, một thư mục (được gói lại), hoặc một file nén làm đáp án mẫu cho chấm. | |
| | 8c.2. Thiếu đáp án mẫu không chặn Hoàn tất và không chặn mở phiên sau này. |
| 8c.3. Giảng viên tiếp tục tại **Bước 8** hoặc tiến **Bước 9** của Luồng chính. | |

**10a — Quay lại sửa sau khi xem checklist**

* **Liên kết:** Rẽ nhánh tại **Bước 10** của Luồng chính → Quay lại bước còn thiếu hoặc cần sửa → rồi **Bước 10** / **Bước 11**.

| Actor | System |
| :--- | :--- |
| 10a.1. Từ bước **Xác nhận**, giảng viên chọn một bước còn thiếu hoặc cần sửa, chỉnh rồi quay lại Xác nhận và Hoàn tất lại. | |
| | 10a.2. Tiếp tục tại **Bước 10** / **Bước 11** của Luồng chính. |

**11a — Hoàn tất khi checklist chỉ có cảnh báo**

* **Liên kết:** Rẽ nhánh tại **Bước 11** của Luồng chính → Kết thúc Use Case hoặc Quay lại các bước để bổ sung.

| Actor | System |
| :--- | :--- |
| | 11a.1. Checklist cảnh báo (ví dụ lớp/danh sách hiệu lực rỗng, chưa có đề, chưa gắn rubric) nhưng không có lý do chặn. |
| | 11a.2. Hệ thống vẫn ghi nháp thành công và báo đã lưu thiết lập. |
| 11a.3. Giảng viên có thể quay lại các bước để bổ sung hoặc kết thúc use case. | |

9. **Luồng ngoại lệ:**

**E1 — Dữ liệu tạo không hợp lệ**

* **Liên kết:** Rẽ nhánh tại **Bước 2** của Luồng chính → Quay lại **Bước 1**.

| Actor | System |
| :--- | :--- |
| | E1.1. Thiếu trường bắt buộc, giờ kết thúc không sau giờ bắt đầu, hoặc dữ liệu lớp/phòng không hợp lệ. Hệ thống không tạo phiên và yêu cầu sửa form tạo. |
| | E1.2. Quay lại **Bước 1** của Luồng chính. |

**E2 — Xung đột phòng hoặc khung giờ**

* **Liên kết:** Rẽ nhánh tại **Bước 2** hoặc khi lưu **Bước 4** (Thông tin chung) của Luồng chính → Quay lại bước đang nhập / lưu.

| Actor | System |
| :--- | :--- |
| | E2.1. Phòng hoặc khung giờ xung đột với phiên khác theo luật lịch hiện có. Hệ thống từ chối ghi và báo xung đột. |
| | E2.2. Quay lại bước đang nhập / lưu. |

**E3 — Chỉnh danh sách thí sinh khi phiên không còn Sắp diễn ra**

* **Liên kết:** Rẽ nhánh tại **Bước 6** của Luồng chính (khi điều kiện Sắp diễn ra không còn thỏa) → Kết thúc nhánh chỉnh sửa (không tiếp tục thiết lập ghi danh sách).

| Actor | System |
| :--- | :--- |
| E3.1. Giảng viên thêm, import hoặc gỡ khi phiên không còn Sắp diễn ra (trừ quy tắc vận hành hẹp ngoài use case này). | |
| | E3.2. Hệ thống từ chối chỉnh danh sách thiết lập trên hub. |
| | E3.3. Kết thúc nhánh chỉnh sửa danh sách (không tiếp tục thiết lập ghi danh sách). |

**E4 — Cấu hình thư mục bài làm không hợp lệ**

* **Liên kết:** Rẽ nhánh tại **Bước 7** của Luồng chính → Quay lại **Bước 7**.

| Actor | System |
| :--- | :--- |
| E4.1. Giảng viên lưu danh sách file nộp rỗng hoặc không hợp lệ (trùng tên, sai quy tắc tên file, cấu hình nén không đúng). | |
| | E4.2. Hệ thống không chấp nhận cấu hình đó. |
| | E4.3. Quay lại **Bước 7** của Luồng chính. |

**E5 — Máy chủ từ chối một phần thiết lập khi Lưu nháp hoặc Hoàn tất**

* **Liên kết:** Rẽ nhánh tại **Bước 4–11** (Lưu nháp, xem **4–11b**) hoặc **Bước 11** (Hoàn tất) của Luồng chính → Quay lại bước liên quan còn lỗi.

| Actor | System |
| :--- | :--- |
| | E5.1. Một phần thiết lập gửi lên bị máy chủ từ chối. Hệ thống giữ phần nháp tương ứng, báo lỗi tại bước liên quan; các phần khác hợp lệ vẫn có thể đã được ghi. Không coi là hoàn tất thành công nếu Hoàn tất đang chạy và còn lỗi ghi. |
| | E5.2. Quay lại bước liên quan còn lỗi. |

**E6 — Hoàn tất bị chặn vì trạng thái hoặc khung giờ**

* **Liên kết:** Rẽ nhánh tại **Bước 11** của Luồng chính → Quay lại **Bước 4** (Thông tin chung) khi lý do gắn bước đó; không mở phiên.

| Actor | System |
| :--- | :--- |
| | E6.1. Phiên không còn Sắp diễn ra, hoặc khung giờ không hợp lệ / đã qua. Hệ thống không ghi hoàn tất như một thiết lập mở được, chỉ rõ lý do chặn (thường gắn bước Thông tin chung) và không mở phiên. |
| | E6.2. Hệ thống chuyển giảng viên về **Bước 4** (Thông tin chung) khi lý do gắn bước đó; không mở phiên. |

**E7 — Hoàn tất bị chặn vì chưa có file phải nộp**

* **Liên kết:** Rẽ nhánh tại **Bước 11** của Luồng chính → Quay lại **Bước 7**.

| Actor | System |
| :--- | :--- |
| | E7.1. Chưa có file sinh viên phải nộp nào trong thư mục bài làm. Hệ thống chặn hoàn tất ghi sẵn sàng mở, chuyển giảng viên tới bước Thư mục bài làm với lý do cần cấu hình ít nhất một file nộp, và không mở phiên. |
| | E7.2. Tiếp tục tại **Bước 7** của Luồng chính. |

**E8 — Không đủ quyền mở tạo / hub thiết lập**

* **Liên kết:** Rẽ nhánh tại **Bước 1** (hoặc khi mở hub tương ứng **Bước 3** trở đi) → Kết thúc Use Case.

| Actor | System |
| :--- | :--- |
| E8.1. Người không phải giảng viên phụ trách phiên (hoặc không phải giảng viên) cố mở tạo / hub thiết lập. | |
| | E8.2. Hệ thống từ chối. |
| | E8.3. Kết thúc Use Case. |

**E9 — Phiên không còn Sắp diễn ra (chỉ xem)**

* **Liên kết:** Thay cho **Bước 4** trở đi khi giảng viên mở hub mà phiên đã mở, đang thu bài, đã kết thúc hoặc đã huỷ → Kết thúc Use Case (chỉ xem, không hoàn tất thiết lập mới).

| Actor | System |
| :--- | :--- |
| E9.1. Giảng viên mở hub khi phiên đã mở, đang thu bài, đã kết thúc hoặc đã huỷ. | |
| | E9.2. Hệ thống cho xem các bước ở chế độ chỉ đọc; không Lưu nháp, không Hoàn tất. Đây là xem lại thiết lập đã khoá, không phải hoàn tất thiết lập mới. |
| | E9.3. Kết thúc Use Case (chỉ xem, không hoàn tất thiết lập mới). |

### Ghi chú phạm vi

| Thuộc use case này                                                                  | Không thuộc use case này                                    |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Tạo phiên Sắp diễn ra                                                               | Mở phiên thi (chuyển sang Đang thi, chốt danh sách vào cửa) |
| Thông tin chung, danh sách thí sinh phiên, thư mục bài làm, đề & rubric, đáp án mẫu | Điểm danh, theo dõi nộp bài, thu bài, chấm điểm             |
| Lưu nháp và Hoàn tất thiết lập                                                      | Huỷ phiên; đổi giảng viên phụ trách phiên                   |

**Hoàn tất** và **Mở phiên thi** là hai hành động khác nhau. Use case này kết thúc khi thiết lập đã được xác nhận lưu (Hoàn tất) hoặc khi giảng viên dừng ở hub với phiên vẫn Sắp diễn ra. Nút Mở phiên thi trên bước Xác nhận là lối sang use case vận hành sau, không phải bước bắt buộc của luồng chính.
