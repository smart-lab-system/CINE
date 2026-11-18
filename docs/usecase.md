# Use case — ExamCollect

Tài liệu này liệt kê tác nhân, chức năng và quan hệ để vẽ use case diagram cho ExamCollect.

Hệ thống gồm web (quản trị viên, giảng viên) và agent trên máy phòng (sinh viên). Sinh viên không có tài khoản đăng nhập web.

Nên vẽ **3 sơ đồ**. Gom hết vào một hình sẽ quá dày để đọc.

## Tác nhân

| Tác nhân | Vai trò |
| --- | --- |
| Quản trị viên | Tài khoản, danh mục, lớp học phần, tiện ích IDE, nhật ký kiểm toán |
| Giảng viên | Soạn đề, tổ chức thi, thu bài, chấm, xuất điểm |
| Sinh viên | Vào phiên thi và nộp bài qua agent |

### Mô tả tác nhân với hệ thống

| Tác nhân | Mô tả |
| --- | --- |
| Quản trị viên | Đăng nhập web để cấu hình và vận hành hệ thống: quản lý tài khoản, danh mục (năm học, môn học, lớp danh nghĩa, hồ sơ sinh viên, phòng máy, máy tính), lớp học phần (phân công giảng viên, sĩ số), tiện ích IDE, xem nhật ký kiểm toán và đổi giảng viên phụ trách phiên thi khi cần. |
| Giảng viên | Đăng nhập web để soạn đề và rubric, tổ chức phiên thi (tạo phiên, mở phòng, điểm danh, theo dõi nộp bài), thu và kiểm bài, đối soát tiện ích IDE trên máy phòng, chấm điểm (bắt đầu chấm, rà soát/chỉnh điểm, chấm lại bài lỗi, chốt điểm) và xuất bảng điểm. |
| Sinh viên | Không có tài khoản đăng nhập web. Tương tác với hệ thống qua agent trên máy phòng: xin vào phòng / tham gia phiên thi, nhận đề và tài liệu, nộp bài và nộp bổ sung khi giảng viên yêu cầu thu lại. |

Cả ba tác nhân nằm ngoài biên hệ thống.

Gợi ý điểm là use case bên trong hệ thống, do **Bắt đầu chấm** gọi tới. Không vẽ dịch vụ chấm AI thành tác nhân.

**Đăng nhập** và **Đăng xuất** chỉ gắn với Quản trị viên và Giảng viên. Hai use case này là tiền điều kiện của các chức năng web, không dùng `<<include>>` nối vào từng chức năng.

## Cách kẻ

- Tác nhân nối use case bằng đường thẳng, không mũi tên.
- `<<include>>`: mũi tên nét đứt từ use case gốc trỏ tới use case được gọi. Use case gốc luôn thực hiện use case kia.
- `<<extend>>`: mũi tên nét đứt từ use case mở rộng trỏ vào use case gốc. Nhánh này chỉ chạy khi có điều kiện ghi kèm.

## Sơ đồ 1 — Quản trị

### Use case

| Mã | Chức năng | Tác nhân |
| --- | --- | --- |
| UC01 | Đăng nhập | Quản trị viên |
| UC02 | Đăng xuất | Quản trị viên |
| UC03 | Quản lý tài khoản | Quản trị viên |
| UC04 | Quản lý năm học | Quản trị viên |
| UC05 | Quản lý môn học | Quản trị viên |
| UC06 | Quản lý lớp danh nghĩa | Quản trị viên |
| UC07 | Quản lý hồ sơ sinh viên | Quản trị viên |
| UC08 | Quản lý phòng máy | Quản trị viên |
| UC09 | Quản lý máy tính | Quản trị viên |
| UC10 | Quản lý lớp học phần | Quản trị viên |
| UC11 | Phân công giảng viên cho lớp học phần | Quản trị viên |
| UC12 | Quản lý sĩ số lớp học phần | Quản trị viên |
| UC13 | Quản lý tiện ích IDE | Quản trị viên |
| UC14 | Xem nhật ký kiểm toán | Quản trị viên |
| UC15 | Đổi giảng viên phụ trách phiên thi | Quản trị viên |

### Quan hệ giữa chức năng

| Quan hệ | Từ | Tới | Ý nghĩa |
| --- | --- | --- | --- |
| `<<include>>` | UC10 Quản lý lớp học phần | UC11 Phân công giảng viên | Tạo và quản lý lớp luôn kèm phân công giảng viên |
| `<<include>>` | UC10 Quản lý lớp học phần | UC12 Quản lý sĩ số lớp học phần | Tạo và quản lý lớp luôn kèm danh sách sinh viên |
| `<<include>>` | UC08 Quản lý phòng máy | UC09 Quản lý máy tính | Máy tính luôn thuộc một phòng |

UC03–UC07, UC13–UC15 chỉ nối thẳng với Quản trị viên.

## Sơ đồ 2 — Tổ chức thi và thu bài

### Use case của giảng viên

| Mã | Chức năng | Tác nhân |
| --- | --- | --- |
| UC01 | Đăng nhập | Giảng viên |
| UC02 | Đăng xuất | Giảng viên |
| UC16 | Xem lớp đang dạy | Giảng viên |
| UC17 | Cập nhật sĩ số lớp của mình | Giảng viên |
| UC18 | Soạn đề | Giảng viên |
| UC19 | Xuất đề và đáp án | Giảng viên |
| UC20 | Gắn đề vào phiên thi | Giảng viên |
| UC21 | Quản lý rubric | Giảng viên |
| UC22 | Tạo phiên thi | Giảng viên |
| UC23 | Cấu hình file cần nộp và tài liệu thi | Giảng viên |
| UC24 | Quản lý danh sách thí sinh của phiên | Giảng viên |
| UC25 | Mở phòng thi | Giảng viên |
| UC26 | Xác nhận điểm danh | Giảng viên |
| UC27 | Theo dõi nộp bài | Giảng viên |
| UC28 | Kết thúc phiên thi | Giảng viên |
| UC29 | Xem bài nộp | Giảng viên |
| UC30 | Kiểm tra tính hợp lệ bài nộp | Giảng viên |
| UC31 | Yêu cầu thu lại bài | Giảng viên |
| UC32 | Hủy phiên thi | Giảng viên |
| UC41 | Đối soát tiện ích IDE trên máy phòng | Giảng viên |

### Use case của sinh viên

| Mã | Chức năng | Tác nhân |
| --- | --- | --- |
| UC36 | Tham gia phiên thi | Sinh viên |
| UC37 | Nhận đề và tài liệu | Sinh viên |
| UC38 | Nộp bài | Sinh viên |
| UC39 | Xin vào phòng | Sinh viên |
| UC40 | Nộp bổ sung | Sinh viên |

### Quan hệ giữa chức năng

| Quan hệ | Từ | Tới | Điều kiện / ý nghĩa |
| --- | --- | --- | --- |
| `<<include>>` | UC16 Xem lớp đang dạy | UC17 Cập nhật sĩ số lớp của mình | Xem lớp luôn kèm cập nhật sĩ số |
| `<<include>>` | UC18 Soạn đề | UC19 Xuất đề và đáp án | Soạn xong thì xuất đề và đáp án |
| `<<include>>` | UC22 Tạo phiên thi | UC20 Gắn đề vào phiên thi | Tạo phiên luôn gắn đề |
| `<<include>>` | UC22 Tạo phiên thi | UC23 Cấu hình file cần nộp và tài liệu thi | Tạo phiên luôn cấu hình file nộp và tài liệu |
| `<<include>>` | UC22 Tạo phiên thi | UC24 Quản lý danh sách thí sinh của phiên | Tạo phiên luôn thiết lập danh sách thí sinh |
| `<<include>>` | UC25 Mở phòng thi | UC26 Xác nhận điểm danh | Mở phòng luôn xác nhận điểm danh |
| `<<include>>` | UC25 Mở phòng thi | UC27 Theo dõi nộp bài | Mở phòng luôn theo dõi nộp bài |
| `<<extend>>` | UC28 Kết thúc phiên thi | UC25 Mở phòng thi | Chỉ khi phiên đang mở |
| `<<extend>>` | UC32 Hủy phiên thi | UC22 Tạo phiên thi | Khi phiên chưa diễn ra hoặc cần hủy |
| `<<include>>` | UC29 Xem bài nộp | UC30 Kiểm tra tính hợp lệ bài nộp | Xem bài luôn kiểm tra tính hợp lệ |
| `<<extend>>` | UC31 Yêu cầu thu lại bài | UC29 Xem bài nộp | Khi bài thiếu hoặc cần nộp lại |
| `<<include>>` | UC36 Tham gia phiên thi | UC37 Nhận đề và tài liệu | Vào phiên thì nhận đề và tài liệu |
| `<<extend>>` | UC39 Xin vào phòng | UC36 Tham gia phiên thi | Khi chưa có trong danh sách hoặc phiên chưa mở |
| `<<extend>>` | UC40 Nộp bổ sung | UC38 Nộp bài | Khi giảng viên yêu cầu thu lại |

UC21 và UC41 chỉ nối thẳng với Giảng viên. UC38 chỉ nối thẳng với Sinh viên.

### Nối giữa giảng viên và sinh viên

Ghi chú trên sơ đồ, không kẻ `<<include>>`:

- UC38 Nộp bài diễn ra trong lúc giảng viên đang ở UC27 Theo dõi nộp bài.
- UC40 Nộp bổ sung diễn ra sau UC31 Yêu cầu thu lại bài.
- Tiền điều kiện của UC38: sinh viên đã thực hiện UC36 Tham gia phiên thi.

## Sơ đồ 3 — Chấm điểm

### Use case

| Mã | Chức năng | Tác nhân |
| --- | --- | --- |
| UC21 | Quản lý rubric | Giảng viên |
| UC33 | Bắt đầu chấm | Giảng viên |
| UC34 | Sinh gợi ý điểm | Không có tác nhân ngoài. Use case nội bộ |
| UC35 | Rà soát và chỉnh điểm | Giảng viên |
| UC42 | Chấm lại bài lỗi | Giảng viên |
| UC43 | Chốt điểm | Giảng viên |
| UC44 | Xuất bảng điểm | Giảng viên |

UC21 xuất hiện lại từ sơ đồ 2 vì chấm điểm phụ thuộc rubric. Khi vẽ sơ đồ 3, vẽ lại oval UC21 trong biên sơ đồ này.

### Quan hệ giữa chức năng

| Quan hệ | Từ | Tới | Điều kiện / ý nghĩa |
| --- | --- | --- | --- |
| `<<include>>` | UC33 Bắt đầu chấm | UC21 Quản lý rubric | Phiên phải có rubric trước khi chấm |
| `<<include>>` | UC33 Bắt đầu chấm | UC34 Sinh gợi ý điểm | Bắt đầu chấm luôn sinh gợi ý điểm |
| `<<extend>>` | UC42 Chấm lại bài lỗi | UC35 Rà soát và chỉnh điểm | Khi bài kẹt hoặc không chấm được |
| `<<include>>` | UC43 Chốt điểm | UC35 Rà soát và chỉnh điểm | Chốt điểm luôn qua bước rà soát |
| `<<include>>` | UC44 Xuất bảng điểm | UC43 Chốt điểm | Xuất điểm luôn sau khi đã chốt |

UC35 nối thẳng với Giảng viên. Tiền điều kiện: đã thực hiện UC33 Bắt đầu chấm. Ghi chú trên sơ đồ, không kẻ `<<include>>` từ UC35 về UC33.
