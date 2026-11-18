# Đặc tả use case UC01–UC15 — ExamCollect

Tài liệu này đặc tả mười lăm use case của sơ đồ Quản trị trong [usecase.md](./usecase.md). Mã sơ đồ `UC01`…`UC15` giữ nguyên để truy vết sang sơ đồ, kịch bản kiểm thử và báo cáo lỗi. Cột **Use case ID** thêm tiền tố phân hệ theo quy ước `UC-[Phân hệ]-[Số]`.

Phạm vi: web quản trị (và đăng nhập / đăng xuất của giảng viên). Sinh viên không có tài khoản web. Mọi chức năng từ UC03 trở đi chỉ chạy khi phiên đăng nhập còn hiệu lực và vai trò là quản trị viên.

## Bảng truy vết

| Mã sơ đồ | Use case ID | Tên | Tác nhân chính |
| --- | --- | --- | --- |
| UC01 | UC-AUTH-01 | Đăng nhập hệ thống | Quản trị viên, Giảng viên |
| UC02 | UC-AUTH-02 | Đăng xuất hệ thống | Quản trị viên, Giảng viên |
| UC03 | UC-ACC-01 | Quản lý tài khoản người dùng | Quản trị viên |
| UC04 | UC-CAT-01 | Quản lý năm học | Quản trị viên |
| UC05 | UC-CAT-02 | Quản lý môn học | Quản trị viên |
| UC06 | UC-CAT-03 | Quản lý lớp danh nghĩa | Quản trị viên |
| UC07 | UC-CAT-04 | Quản lý hồ sơ sinh viên | Quản trị viên |
| UC08 | UC-LAB-01 | Quản lý phòng máy | Quản trị viên |
| UC09 | UC-LAB-02 | Quản lý máy tính phòng máy | Quản trị viên |
| UC10 | UC-SEC-01 | Quản lý lớp học phần | Quản trị viên |
| UC11 | UC-SEC-02 | Phân công giảng viên cho lớp học phần | Quản trị viên |
| UC12 | UC-SEC-03 | Quản lý sĩ số lớp học phần | Quản trị viên |
| UC13 | UC-IDE-01 | Quản lý tiện ích IDE | Quản trị viên |
| UC14 | UC-AUD-01 | Xem nhật ký kiểm toán | Quản trị viên |
| UC15 | UC-EXM-01 | Đổi giảng viên phụ trách phiên thi | Quản trị viên |

## Quan hệ include

| Từ | Tới | Ý nghĩa trong đặc tả |
| --- | --- | --- |
| UC10 | UC11, UC12 | Tạo và vận hành lớp học phần luôn đi cùng quyết định phân công và danh sách sinh viên. Hai bước có thể hoàn tất ngay hoặc để sau trên cùng lớp. |
| UC08 | UC09 | Máy tính luôn thuộc một phòng. Thêm máy là một phần của việc quản lý phòng. |

UC01 và UC02 là tiền điều kiện của các chức năng web. Không dùng `<<include>>` để nối chúng vào từng use case.

Học kỳ không có mã riêng: học kỳ nằm trong UC04, vì mỗi học kỳ luôn thuộc một năm học.

---

## UC01 — Đăng nhập hệ thống

1. **Use case ID:** UC-AUTH-01 (mã sơ đồ: UC01)
2. **Tên use case:** Đăng nhập hệ thống
3. **Tác nhân:**
   - Tác nhân chính: Quản trị viên hoặc Giảng viên (cùng một form; hệ thống phân luồng theo vai trò).
   - Tác nhân phụ: không có.
4. **Mô tả:** Cho phép người đã được cấp tài khoản xác thực bằng email và mật khẩu để vào khu vực làm việc đúng vai trò. Hệ thống không có đăng ký công khai.
5. **Điều kiện tiên quyết:**
   - Người dùng đang ở trang Đăng nhập và chưa có phiên hợp lệ (hoặc phiên cũ không còn được chấp nhận).
   - Tài khoản đã được tạo trong hệ thống.
6. **Kết quả:**
   - Một cặp phiên hợp lệ được lập: access token (mặc định 15 phút) và refresh token (mặc định 7 ngày, httpOnly).
   - Quản trị viên vào Bảng điều khiển quản trị. Giảng viên vào Bảng điều khiển giảng viên.
   - Các trang quản trị từ chối giảng viên; middleware kiểm lại vai trò trên token ở mỗi lần chuyển trang.
7. **Luồng chính:**
   1. Người dùng nhập email và mật khẩu, rồi chọn Đăng nhập.
   2. Hệ thống kiểm tra định dạng đầu vào.
   3. Hệ thống đối soát email và mật khẩu với tài khoản đã lưu (mật khẩu đối chiếu bằng hàm băm, không đọc mật khẩu gốc).
   4. Hệ thống xác nhận tài khoản đang hoạt động.
   5. Hệ thống cấp phiên và chuyển người dùng theo vai trò: quản trị viên tới `/admin/dashboard`, giảng viên tới `/teacher/dashboard`.
8. **Luồng thay thế:**
   - **A1 — Phiên còn hạn, người dùng mở lại ứng dụng.** Trình duyệt còn refresh token hợp lệ và tài khoản vẫn hoạt động. Hệ thống cấp cặp token mới (refresh token xoay vòng) và đưa người dùng vào khu vực đúng vai trò, không yêu cầu gõ lại mật khẩu. Tiếp tục từ kết quả của bước 5.
   - **A2 — Hiện hoặc ẩn mật khẩu.** Tại bước 1, người dùng bật/tắt hiển thị mật khẩu để soát chuỗi được cấp sẵn, rồi tiếp tục bước 1.
9. **Luồng ngoại lệ:**
   - **E1 (bước 2).** Email hoặc mật khẩu để trống, hoặc email không đúng dạng. Hệ thống không cấp phiên và yêu cầu nhập lại.
   - **E2 (bước 3).** Email không tồn tại hoặc mật khẩu sai. Hệ thống trả cùng một kết quả thất bại và giao diện báo «Sai email hoặc mật khẩu». Không tiết lộ email nào đang có trong hệ thống.
   - **E3 (bước 4).** Mật khẩu đúng nhưng tài khoản đã bị vô hiệu hoá. Hệ thống không cấp phiên. Kiểm tra này xảy ra sau khi đối soát mật khẩu, để trạng thái khoá không trở thành cách dò email.
   - **E4 (bước 5).** Tài khoản không còn vai trò quản trị viên hoặc giảng viên. Hệ thống không mở khu vực chức năng tương ứng.

---

## UC02 — Đăng xuất hệ thống

1. **Use case ID:** UC-AUTH-02 (mã sơ đồ: UC02)
2. **Tên use case:** Đăng xuất hệ thống
3. **Tác nhân:**
   - Tác nhân chính: Quản trị viên hoặc Giảng viên đang có phiên.
   - Tác nhân phụ: không có.
4. **Mô tả:** Kết thúc phiên trên trình duyệt hiện tại để người khác không dùng tiếp các chức năng web bằng phiên đó.
5. **Điều kiện tiên quyết:**
   - Người dùng đang ở trong khung ứng dụng sau khi đã đăng nhập.
6. **Kết quả:**
   - Cookie phiên (`access_token`, `refresh_token`, `account`) bị xoá.
   - Bản access token trong bộ nhớ tab bị xoá.
   - Người dùng đứng ở trang Đăng nhập và phải đăng nhập lại để dùng chức năng web.
7. **Luồng chính:**
   1. Người dùng chọn Đăng xuất.
   2. Hệ thống xoá cookie phiên trên trình duyệt và xoá access token đang giữ trong bộ nhớ tab.
   3. Hệ thống chuyển về trang Đăng nhập.
8. **Luồng thay thế:**
   - **A1 — Yêu cầu đăng xuất không tới được máy chủ.** Hệ thống vẫn xoá token cục bộ và chuyển về trang Đăng nhập, để người dùng không bị kẹt trên trang đã mất phiên.
9. **Luồng ngoại lệ:**
   - Không có nhánh làm hỏng mục tiêu đăng xuất trên trình duyệt. Access token đã phát hành là stateless: bản sao còn nằm ngoài trình duyệt chỉ dùng được đến khi hết hạn ngắn, và refresh token trên trình duyệt này đã bị xoá nên không cấp được phiên mới.

---

## UC03 — Quản lý tài khoản người dùng

1. **Use case ID:** UC-ACC-01 (mã sơ đồ: UC03)
2. **Tên use case:** Quản lý tài khoản người dùng
3. **Tác nhân:**
   - Tác nhân chính: Quản trị viên.
   - Tác nhân phụ: không có.
4. **Mô tả:** Cấp, sửa, khoá và xoá tài khoản quản trị viên hoặc giảng viên. Đây là đường duy nhất để có tài khoản web. Vô hiệu hoá là cách xử lý người nghỉ việc khi tài khoản đã gắn dữ liệu giảng dạy.
5. **Điều kiện tiên quyết:**
   - Quản trị viên đã đăng nhập.
   - Trang Quản lý tài khoản sẵn sàng.
6. **Kết quả:**
   - Tài khoản mới có họ tên, email duy nhất, vai trò (`admin` hoặc `teacher`) và mật khẩu đã băm; trạng thái hoạt động.
   - Hoặc thông tin tài khoản đã chọn được cập nhật, bị vô hiệu hoá, được kích hoạt lại, hoặc bị xoá khi chưa ràng buộc dữ liệu nghiệp vụ.
   - Danh sách tài khoản phản ánh thay đổi vừa lưu.
7. **Luồng chính:**
   1. Quản trị viên mở Quản lý tài khoản và chọn tạo tài khoản.
   2. Quản trị viên nhập họ tên, email, mật khẩu (8–128 ký tự) và vai trò, rồi xác nhận.
   3. Hệ thống kiểm tra dữ liệu và tính duy nhất của email.
   4. Hệ thống lưu tài khoản với mật khẩu đã băm và hiển thị tài khoản mới trong danh sách. Mật khẩu gốc không được xem lại.
8. **Luồng thay thế:**
   - **A1 — Tìm và lọc.** Quản trị viên nhập tên hoặc email, lọc theo vai trò và trạng thái hoạt động, chuyển trang. Hệ thống trả danh sách khớp. Không đổi dữ liệu.
   - **A2 — Sửa thông tin.** Quản trị viên chọn một tài khoản, đổi họ tên, email hoặc vai trò, rồi lưu. Hệ thống kiểm tra email còn duy nhất và cập nhật dòng đó. Mật khẩu không đổi ở nhánh này.
   - **A3 — Vô hiệu hoá.** Quản trị viên chọn vô hiệu hoá tài khoản đang hoạt động. Hệ thống đặt tài khoản ngừng hoạt động. Lần đăng nhập và làm mới phiên sau đó bị từ chối. Dữ liệu lớp, phiên thi và bài nộp giữ nguyên.
   - **A4 — Kích hoạt lại.** Quản trị viên chọn tài khoản đã vô hiệu hoá và kích hoạt. Hệ thống cho phép tài khoản đăng nhập trở lại.
   - **A5 — Xoá cứng.** Quản trị viên chọn xoá tài khoản chưa từng sở hữu dữ liệu nghiệp vụ và xác nhận. Hệ thống xoá dòng tài khoản.
9. **Luồng ngoại lệ:**
   - **E1 (bước 3 hoặc A2).** Thiếu trường bắt buộc, email sai dạng, mật khẩu ngắn hơn 8 ký tự, hoặc vai trò không thuộc quản trị viên / giảng viên. Hệ thống giữ form và báo lỗi từng trường.
   - **E2 (bước 3 hoặc A2).** Email đã thuộc tài khoản khác. Hệ thống không lưu và báo trùng email.
   - **E3 (A5).** Tài khoản còn lớp học phần, sĩ số, phiên thi hoặc ràng buộc tương tự. Hệ thống từ chối xoá. Quản trị viên dùng A3 nếu cần chặn đăng nhập.

---

## UC04 — Quản lý năm học

1. **Use case ID:** UC-CAT-01 (mã sơ đồ: UC04)
2. **Tên use case:** Quản lý năm học
3. **Tác nhân:**
   - Tác nhân chính: Quản trị viên.
   - Tác nhân phụ: không có.
4. **Mô tả:** Duy trì danh mục năm học dùng khi lập lớp học phần. Mỗi năm có các học kỳ trực thuộc (ví dụ HK1, HK2). Học kỳ không tách thành use case riêng vì luôn thuộc một năm học.
5. **Điều kiện tiên quyết:**
   - Quản trị viên đã đăng nhập.
   - Trang Năm học sẵn sàng.
6. **Kết quả:**
   - Năm học được tạo, sửa hoặc xoá với mã duy nhất, tên, ngày bắt đầu, ngày kết thúc và trạng thái `planned`, `active` hoặc `closed`.
   - Hoặc một học kỳ của năm đó được tạo, sửa hoặc xoá với mã duy nhất trong năm, tên, khoảng ngày và cùng ba trạng thái.
7. **Luồng chính:**
   1. Quản trị viên mở Năm học và chọn thêm năm học.
   2. Quản trị viên nhập mã, tên, ngày bắt đầu, ngày kết thúc và trạng thái, rồi lưu.
   3. Hệ thống kiểm tra ngày kết thúc sau ngày bắt đầu và mã chưa tồn tại.
   4. Hệ thống lưu năm học và hiện trên danh sách.
8. **Luồng thay thế:**
   - **A1 — Tìm và lọc năm.** Quản trị viên lọc theo từ khoá (mã, tên) và trạng thái, rồi phân trang. Hệ thống trả danh sách khớp.
   - **A2 — Sửa năm học.** Quản trị viên sửa các trường của một năm rồi lưu. Hệ thống áp dụng cùng ràng buộc với luồng chính.
   - **A3 — Thêm học kỳ.** Quản trị viên mở một năm học, chọn thêm học kỳ, nhập mã, tên, khoảng ngày và trạng thái. Hệ thống kiểm tra năm còn tồn tại, mã học kỳ chưa trùng trong năm đó, ngày kết thúc sau ngày bắt đầu, rồi lưu học kỳ thuộc năm.
   - **A4 — Sửa học kỳ.** Quản trị viên sửa học kỳ đã có và lưu. Ràng buộc giống A3.
   - **A5 — Xoá năm hoặc học kỳ chưa được dùng.** Quản trị viên xác nhận xoá. Hệ thống xoá khi không còn bản ghi con chặn ràng buộc.
9. **Luồng ngoại lệ:**
   - **E1 (bước 3, A2, A3, A4).** Ngày kết thúc không sau ngày bắt đầu, hoặc thiếu trường bắt buộc. Hệ thống không lưu.
   - **E2 (bước 3, A2).** Mã năm học đã tồn tại. Hệ thống không lưu.
   - **E3 (A3, A4).** Mã học kỳ đã có trong cùng năm học. Hệ thống không lưu.
   - **E4 (A5).** Xoá năm học khi còn học kỳ, hoặc xoá học kỳ khi còn lớp học phần trỏ tới. Hệ thống từ chối xoá và giữ nguyên dữ liệu.

---

## UC05 — Quản lý môn học

1. **Use case ID:** UC-CAT-02 (mã sơ đồ: UC05)
2. **Tên use case:** Quản lý môn học
3. **Tác nhân:**
   - Tác nhân chính: Quản trị viên.
   - Tác nhân phụ: không có.
4. **Mô tả:** Duy trì danh mục môn dùng để lập lớp học phần và để gắn tiện ích IDE theo môn. Môn không gắn năm học hay số tín chỉ.
5. **Điều kiện tiên quyết:**
   - Quản trị viên đã đăng nhập.
   - Trang Môn học sẵn sàng.
6. **Kết quả:**
   - Môn học có mã duy nhất, tên và trạng thái `active` hoặc `inactive` được tạo, sửa hoặc xoá.
   - Danh sách môn phản ánh bản ghi vừa lưu.
7. **Luồng chính:**
   1. Quản trị viên mở Môn học và chọn thêm môn.
   2. Quản trị viên nhập mã, tên và trạng thái, rồi lưu.
   3. Hệ thống kiểm tra mã chưa tồn tại và các trường bắt buộc đã có.
   4. Hệ thống lưu môn và hiện trên danh sách.
8. **Luồng thay thế:**
   - **A1 — Tìm và lọc.** Quản trị viên tìm theo mã hoặc tên, lọc trạng thái và phân trang.
   - **A2 — Sửa môn.** Quản trị viên đổi mã, tên hoặc trạng thái rồi lưu. Môn đã dùng cho lớp giữ liên kết theo định danh; tên hiển thị trên lớp mới lấy theo môn tại thời điểm tạo hoặc đổi môn.
   - **A3 — Xoá môn chưa được dùng.** Quản trị viên xác nhận xoá. Hệ thống xoá môn khi không còn lớp học phần trỏ tới.
9. **Luồng ngoại lệ:**
   - **E1 (bước 3, A2).** Thiếu mã hoặc tên, hoặc mã vượt độ dài cho phép. Hệ thống không lưu.
   - **E2 (bước 3, A2).** Mã môn đã tồn tại. Hệ thống không lưu.
   - **E3 (A3).** Môn còn lớp học phần. Hệ thống từ chối xoá. Có thể chuyển trạng thái `inactive` bằng A2 để ngừng dùng cho lớp mới mà không xoá lịch sử.

---

## UC06 — Quản lý lớp danh nghĩa

1. **Use case ID:** UC-CAT-03 (mã sơ đồ: UC06)
2. **Tên use case:** Quản lý lớp danh nghĩa
3. **Tác nhân:**
   - Tác nhân chính: Quản trị viên.
   - Tác nhân phụ: không có.
4. **Mô tả:** Duy trì lớp hành chính (lớp danh nghĩa) để gắn hồ sơ sinh viên. Lớp danh nghĩa khác lớp học phần do giảng viên dạy.
5. **Điều kiện tiên quyết:**
   - Quản trị viên đã đăng nhập.
   - Trang Lớp danh nghĩa sẵn sàng.
6. **Kết quả:**
   - Lớp danh nghĩa có mã duy nhất, tên (có thể trống), khoá (năm tuyển sinh, có thể trống) và trạng thái `active` hoặc `inactive` được tạo, sửa hoặc xoá.
7. **Luồng chính:**
   1. Quản trị viên mở Lớp danh nghĩa và chọn thêm lớp.
   2. Quản trị viên nhập mã, tên, khoá và trạng thái, rồi lưu.
   3. Hệ thống kiểm tra mã chưa tồn tại.
   4. Hệ thống lưu lớp và hiện trên danh sách.
8. **Luồng thay thế:**
   - **A1 — Tìm và lọc.** Quản trị viên tìm theo mã hoặc tên, lọc trạng thái và khoá, rồi phân trang.
   - **A2 — Sửa lớp.** Quản trị viên đổi tên, khoá hoặc trạng thái rồi lưu. Mã lớp danh nghĩa không nằm trong các trường sửa sau khi tạo.
   - **A3 — Xoá lớp chưa có sinh viên.** Quản trị viên xác nhận xoá. Hệ thống xoá lớp.
9. **Luồng ngoại lệ:**
   - **E1 (bước 3).** Thiếu mã hoặc mã đã tồn tại. Hệ thống không lưu.
   - **E2 (A3).** Lớp còn hồ sơ sinh viên. Hệ thống từ chối xoá. Cần chuyển sinh viên sang lớp khác (UC07) trước khi xoá.

---

## UC07 — Quản lý hồ sơ sinh viên

1. **Use case ID:** UC-CAT-04 (mã sơ đồ: UC07)
2. **Tên use case:** Quản lý hồ sơ sinh viên
3. **Tác nhân:**
   - Tác nhân chính: Quản trị viên.
   - Tác nhân phụ: không có.
4. **Mô tả:** Duy trì hồ sơ sinh viên trong danh mục (MSSV, họ tên, lớp danh nghĩa, trạng thái). Hồ sơ này là nguồn đối chiếu khi vào phòng lab và khi gắn sĩ số lớp học phần. Sinh viên không đăng nhập web bằng hồ sơ này.
5. **Điều kiện tiên quyết:**
   - Quản trị viên đã đăng nhập.
   - Đã có ít nhất một lớp danh nghĩa nếu thao tác cần gắn lớp (UC06).
6. **Kết quả:**
   - Hồ sơ có MSSV duy nhất (4–20 ký tự chữ hoặc số), họ tên, lớp danh nghĩa và trạng thái `active`, `inactive`, `graduated` hoặc `withdrawn` được tạo, sửa hoặc xoá.
   - Trang chi tiết đọc được lớp danh nghĩa và các lớp học phần mà MSSV đang có mặt.
7. **Luồng chính:**
   1. Quản trị viên mở Sinh viên và chọn thêm hồ sơ.
   2. Quản trị viên nhập MSSV, họ tên, chọn lớp danh nghĩa và trạng thái, rồi lưu.
   3. Hệ thống kiểm tra MSSV đúng dạng, chưa trùng, và lớp danh nghĩa còn tồn tại.
   4. Hệ thống lưu hồ sơ và hiện trên danh sách.
8. **Luồng thay thế:**
   - **A1 — Tìm và lọc.** Quản trị viên tìm theo MSSV hoặc họ tên, lọc theo lớp danh nghĩa và trạng thái, rồi phân trang.
   - **A2 — Xem chi tiết.** Quản trị viên mở một hồ sơ. Hệ thống hiện lớp danh nghĩa và các lớp học phần liên quan (khớp MSSV hoặc liên kết hồ sơ). Trang chi tiết chỉ để đọc.
   - **A3 — Sửa hồ sơ từ danh sách.** Quản trị viên đổi họ tên, lớp danh nghĩa hoặc trạng thái rồi lưu.
   - **A4 — Xoá hồ sơ.** Quản trị viên xác nhận xoá. Hệ thống xoá dòng danh mục. Sĩ số lớp học phần đã chụp MSSV và họ tên không bị xoá theo.
9. **Luồng ngoại lệ:**
   - **E1 (bước 3, A3).** MSSV sai dạng, thiếu họ tên, hoặc chưa chọn lớp danh nghĩa. Hệ thống không lưu.
   - **E2 (bước 3).** MSSV đã tồn tại (không phân biệt hoa thường). Hệ thống không lưu.
   - **E3 (bước 3, A3).** Lớp danh nghĩa không còn. Hệ thống không lưu.
   - **E4 (A3).** Đổi trạng thái khỏi `active` không gỡ sinh viên khỏi sĩ số đã có. Lần thêm mới từ danh mục vào lớp học phần sẽ bị từ chối cho đến khi hồ sơ trở lại `active` (xem UC12).

---

## UC08 — Quản lý phòng máy

1. **Use case ID:** UC-LAB-01 (mã sơ đồ: UC08)
2. **Tên use case:** Quản lý phòng máy
3. **Tác nhân:**
   - Tác nhân chính: Quản trị viên.
   - Tác nhân phụ: không có.
4. **Mô tả:** Duy trì phòng máy dùng cho tổ chức thi và cho sơ đồ máy. Mỗi máy tính thuộc đúng một phòng; việc khai báo máy là UC09, được gọi từ phòng này.
5. **Điều kiện tiên quyết:**
   - Quản trị viên đã đăng nhập.
   - Trang Phòng sẵn sàng.
6. **Kết quả:**
   - Phòng có mã duy nhất, tên, sức chứa lớn hơn 0, toà nhà (tuỳ chọn), tầng (tuỳ chọn) và trạng thái `available`, `maintenance` hoặc `retired` được tạo, sửa hoặc xoá.
   - Máy của phòng, nếu có, vẫn trỏ đúng phòng vừa được giữ lại.
7. **Luồng chính:**
   1. Quản trị viên mở Phòng và chọn thêm phòng.
   2. Quản trị viên nhập mã, tên, sức chứa, toà nhà, tầng và trạng thái, rồi lưu.
   3. Hệ thống kiểm tra mã chưa tồn tại và sức chứa là số nguyên dương.
   4. Hệ thống lưu phòng và hiện trên danh sách.
   5. Khi cần khai báo máy cho phòng vừa lưu, quản trị viên thực hiện UC09.
8. **Luồng thay thế:**
   - **A1 — Tìm và lọc.** Quản trị viên tìm theo mã hoặc tên, lọc trạng thái và phân trang.
   - **A2 — Sửa phòng.** Quản trị viên đổi tên, sức chứa, toà nhà, tầng hoặc trạng thái rồi lưu. Mã phòng không đổi sau khi tạo.
   - **A3 — Xoá phòng chưa có máy.** Quản trị viên xác nhận xoá. Hệ thống xoá phòng.
9. **Luồng ngoại lệ:**
   - **E1 (bước 3, A2).** Thiếu mã hoặc tên, hoặc sức chứa không lớn hơn 0. Hệ thống không lưu.
   - **E2 (bước 3).** Mã phòng đã tồn tại. Hệ thống không lưu.
   - **E3 (A3).** Phòng còn máy tính. Hệ thống từ chối xoá. Cần xoá hoặc chuyển máy (UC09) trước.

---

## UC09 — Quản lý máy tính phòng máy

1. **Use case ID:** UC-LAB-02 (mã sơ đồ: UC09)
2. **Tên use case:** Quản lý máy tính phòng máy
3. **Tác nhân:**
   - Tác nhân chính: Quản trị viên.
   - Tác nhân phụ: không có.
4. **Mô tả:** Khai báo và cập nhật máy trong một phòng: tên máy, vị trí, cấu hình và trạng thái. Use case này được UC08 gọi tới vì máy luôn thuộc một phòng; quản trị viên cũng mở được danh sách máy trực tiếp.
5. **Điều kiện tiên quyết:**
   - Quản trị viên đã đăng nhập.
   - Phòng sẽ gắn máy đã tồn tại (UC08).
6. **Kết quả:**
   - Máy được lưu với phòng, tên máy duy nhất trong phòng đó, vị trí, CPU, RAM (GB, lớn hơn 0), ổ đĩa, GPU (tuỳ chọn), hệ điều hành, IP (tuỳ chọn), địa chỉ MAC (tuỳ chọn) và trạng thái `available`, `maintenance` hoặc `retired`.
7. **Luồng chính:**
   1. Quản trị viên mở Máy tính (hoặc đi từ một phòng) và chọn thêm máy.
   2. Quản trị viên chọn phòng, nhập tên máy và các thông số, rồi lưu.
   3. Hệ thống kiểm tra phòng tồn tại, các trường bắt buộc hợp lệ, và tên máy chưa trùng trong phòng.
   4. Hệ thống lưu máy và hiện trên danh sách của phòng đó.
8. **Luồng thay thế:**
   - **A1 — Tìm theo phòng.** Quản trị viên lọc theo phòng, trạng thái, hoặc từ khoá tên máy, IP, vị trí, CPU, rồi phân trang.
   - **A2 — Sửa máy.** Quản trị viên đổi phòng, vị trí, cấu hình, địa chỉ hoặc trạng thái rồi lưu. Tên máy không đổi sau khi tạo.
   - **A3 — Xoá máy.** Quản trị viên xác nhận xoá. Hệ thống xoá máy khỏi phòng.
9. **Luồng ngoại lệ:**
   - **E1 (bước 3, A2).** Thiếu trường bắt buộc, RAM không lớn hơn 0, hoặc phòng không còn. Hệ thống không lưu.
   - **E2 (bước 3).** Tên máy đã có trong cùng phòng. Hệ thống không lưu. Cùng tên máy ở phòng khác vẫn hợp lệ.
   - **E3 (A2).** Đổi sang phòng mà tên máy đã tồn tại ở phòng đích. Hệ thống không lưu.

---

## UC10 — Quản lý lớp học phần

1. **Use case ID:** UC-SEC-01 (mã sơ đồ: UC10)
2. **Tên use case:** Quản lý lớp học phần
3. **Tác nhân:**
   - Tác nhân chính: Quản trị viên.
   - Tác nhân phụ: không có. Giảng viên chỉ nhận lớp sau khi được phân công; giảng viên không tạo lớp.
4. **Mô tả:** Lập lớp học phần theo môn và học kỳ để giảng viên tổ chức thi. Tạo và vận hành lớp luôn kèm phân công giảng viên (UC11) và sĩ số (UC12). Mã lớp do hệ thống cấp theo môn và học kỳ.
5. **Điều kiện tiên quyết:**
   - Quản trị viên đã đăng nhập.
   - Đã có môn học (UC05) và học kỳ (UC04). Lớp danh nghĩa và tài khoản giảng viên là tuỳ chọn tại lúc tạo.
6. **Kết quả:**
   - Lớp học phần mới có môn, học kỳ, mã dạng `{mã môn}{số thứ tự ba chữ số}` (ví dụ môn `CTDL` cho `CTDL001`), và ảnh tên môn tại thời điểm tạo.
   - Cặp môn + học kỳ + mã không trùng.
   - Lớp hiện trong danh sách quản trị, kèm sĩ số và trạng thái phân công.
7. **Luồng chính:**
   1. Quản trị viên mở Lớp học phần và chọn tạo lớp.
   2. Quản trị viên chọn năm học, học kỳ, môn và (nếu cần) lớp danh nghĩa, rồi xác nhận.
   3. Hệ thống kiểm tra môn và học kỳ tồn tại, rồi cấp mã kế tiếp trong cặp môn–học kỳ đó.
   4. Hệ thống lưu lớp. Giảng viên phụ trách để trống cho đến UC11.
   5. Quản trị viên tiếp tục UC11 để phân công giảng viên và UC12 để lập sĩ số. Hai bước có thể làm ngay hoặc mở lại lớp sau.
8. **Luồng thay thế:**
   - **A1 — Lọc danh sách.** Quản trị viên lọc theo năm học, học kỳ, môn, từ khoá, hoặc chỉ các lớp chưa phân công, rồi phân trang.
   - **A2 — Gán giảng viên ngay khi tạo.** Tại bước 2, quản trị viên chọn thêm một giảng viên đang hoạt động. Hệ thống lưu lớp đã có người phụ trách và đồng bộ sĩ số hiện có (nếu có) theo UC11.
   - **A3 — Sửa môn, học kỳ hoặc lớp danh nghĩa khi lớp còn trống.** Lớp chưa có sinh viên và chưa có phiên thi. Quản trị viên đổi các mục này. Hệ thống cấp lại mã theo môn và học kỳ đích.
   - **A4 — Xoá lớp trống.** Lớp không còn sinh viên và không còn phiên thi. Quản trị viên xác nhận xoá. Hệ thống xoá lớp.
9. **Luồng ngoại lệ:**
   - **E1 (bước 3).** Môn hoặc học kỳ không còn. Hệ thống không tạo lớp.
   - **E2 (A2).** Tài khoản được chọn không phải giảng viên hoặc không còn hoạt động. Hệ thống không gán.
   - **E3 (A3).** Lớp đã có sinh viên hoặc đã có phiên thi. Hệ thống từ chối đổi môn, học kỳ và lớp danh nghĩa.
   - **E4 (A4).** Lớp còn sinh viên hoặc còn phiên thi. Hệ thống từ chối xoá và nêu lý do tương ứng (còn danh sách sinh viên, hoặc còn phiên thi).

---

## UC11 — Phân công giảng viên cho lớp học phần

1. **Use case ID:** UC-SEC-02 (mã sơ đồ: UC11)
2. **Tên use case:** Phân công giảng viên cho lớp học phần
3. **Tác nhân:**
   - Tác nhân chính: Quản trị viên.
   - Tác nhân phụ: không có.
4. **Mô tả:** Gán hoặc đổi giảng viên phụ trách một lớp học phần. Sau khi gán, lớp xuất hiện trong «Lớp của tôi» của giảng viên đó. Đổi người trên lớp không chuyển quyền các phiên thi đã tạo; việc đó thuộc UC15.
5. **Điều kiện tiên quyết:**
   - Quản trị viên đã đăng nhập.
   - Lớp học phần cần gán đã tồn tại (UC10).
   - Có ít nhất một tài khoản vai trò giảng viên.
6. **Kết quả:**
   - `teacher` của lớp là giảng viên được chọn.
   - Mọi dòng sĩ số của lớp nhận cùng giảng viên phụ trách.
   - Giảng viên mới thấy lớp trong «Lớp của tôi». Phiên thi và rubric đã tạo giữ nguyên chủ cũ cho đến khi chạy UC15.
7. **Luồng chính:**
   1. Quản trị viên mở chi tiết lớp học phần và chọn Phân công giảng viên (hoặc Đổi giảng viên nếu lớp đã có người).
   2. Quản trị viên chọn một tài khoản giảng viên và xác nhận.
   3. Hệ thống kiểm tra tài khoản tồn tại, đúng vai trò giảng viên.
   4. Hệ thống ghi giảng viên lên lớp và lên toàn bộ sĩ số của lớp trong cùng một lần lưu.
   5. Hệ thống hiện tên giảng viên trên lớp.
8. **Luồng thay thế:**
   - **A1 — Gán lúc tạo lớp.** Phân công xảy ra ngay trong UC10-A2. Kết quả trùng bước 4–5 của luồng chính.
   - **A2 — Gỡ phân công.** Lớp đã có giảng viên và chưa có phiên thi. Quản trị viên chọn gỡ. Hệ thống xoá giảng viên trên lớp và trên sĩ số. Lớp trở lại trạng thái chưa phân công và biến khỏi «Lớp của tôi».
9. **Luồng ngoại lệ:**
   - **E1 (bước 3).** Tài khoản không tồn tại hoặc không phải giảng viên. Hệ thống không gán. Gán cho quản trị viên bị từ chối vì khu vực giảng viên lọc theo vai trò này.
   - **E2 (A2).** Lớp đã có phiên thi. Hệ thống từ chối gỡ phân công. Muốn đổi người dạy, quản trị viên dùng luồng chính (đổi giảng viên trên lớp). Muốn đổi chủ một phiên đã mở, dùng UC15.

---

## UC12 — Quản lý sĩ số lớp học phần

1. **Use case ID:** UC-SEC-03 (mã sơ đồ: UC12)
2. **Tên use case:** Quản lý sĩ số lớp học phần
3. **Tác nhân:**
   - Tác nhân chính: Quản trị viên. Giảng viên được phân công cũng thêm, sửa tên và xoá sĩ số của lớp mình sau khi nhận lớp; use case trên sơ đồ quản trị gắn với quản trị viên.
   - Tác nhân phụ: không có.
4. **Mô tả:** Lập danh sách sinh viên của một lớp học phần. Mỗi dòng lưu MSSV và họ tên (ảnh tại thời điểm thêm) để đối chiếu khi vào thi. Có thể lấy từ hồ sơ danh mục hoặc nhập tay.
5. **Điều kiện tiên quyết:**
   - Quản trị viên đã đăng nhập.
   - Lớp học phần đã tồn tại (UC10).
6. **Kết quả:**
   - Sĩ số của lớp có thêm, đổi tên hoặc bớt các dòng MSSV duy nhất trong lớp.
   - Dòng lấy từ hồ sơ `active` giữ liên kết tới hồ sơ đó.
   - Số sinh viên trên danh sách lớp được cập nhật.
7. **Luồng chính:**
   1. Quản trị viên mở sĩ số của lớp và chọn thêm sinh viên từ danh mục.
   2. Quản trị viên tìm theo MSSV hoặc tên và chọn một hồ sơ.
   3. Hệ thống kiểm tra hồ sơ tồn tại, đang `active`, và MSSV chưa có trong lớp.
   4. Hệ thống thêm dòng sĩ số với MSSV, họ tên từ hồ sơ, và giảng viên phụ trách hiện tại của lớp (có thể trống).
   5. Hệ thống hiện dòng mới trong danh sách.
8. **Luồng thay thế:**
   - **A1 — Thêm tay.** Quản trị viên nhập MSSV và họ tên không qua danh sách hồ sơ. Hệ thống thêm dòng. Nếu MSSV khớp một hồ sơ danh mục, hệ thống gắn liên kết hồ sơ đó.
   - **A2 — Nhập nhiều dòng.** Quản trị viên đưa danh sách MSSV và họ tên (dán hoặc tệp đã tách sẵn). Hệ thống xử lý từng dòng theo cùng quy tắc thêm, và báo các dòng không nhận.
   - **A3 — Sửa họ tên một dòng.** Quản trị viên sửa tên, giữ nguyên MSSV. Hệ thống lưu tên mới trên sĩ số lớp.
   - **A4 — Xoá một sinh viên khỏi lớp.** Quản trị viên chọn xoá một MSSV đang có trong lớp. Hệ thống gỡ dòng sĩ số đó. Hồ sơ danh mục không bị xoá.
9. **Luồng ngoại lệ:**
   - **E1 (bước 3).** Hồ sơ không tồn tại hoặc không ở trạng thái `active`. Hệ thống không thêm.
   - **E2 (bước 3, A1, A2).** MSSV đã có trong chính lớp này. Hệ thống không tạo dòng trùng.
   - **E3 (bước 3, A1, A2).** MSSV đã thuộc một lớp học phần khác của cùng môn. Hệ thống từ chối và nêu lớp đang giữ sinh viên đó. Muốn chuyển lớp, phải xoá khỏi lớp cũ trước. Quy tắc này tránh bài làm bị gửi về nhầm lớp.
   - **E4 (A1).** Thiếu MSSV hoặc họ tên. Hệ thống không thêm.
   - **E5 (A4).** MSSV không có trong lớp. Hệ thống báo không tìm thấy và không xoá dòng nào khác.

---

## UC13 — Quản lý tiện ích IDE

1. **Use case ID:** UC-IDE-01 (mã sơ đồ: UC13)
2. **Tên use case:** Quản lý tiện ích IDE
3. **Tác nhân:**
   - Tác nhân chính: Quản trị viên.
   - Tác nhân phụ: Giảng viên. Giảng viên đề xuất tiện ích theo môn và đồng bộ kết quả quét từ máy phòng (Teacher Hub). Chỉ quản trị viên duyệt để tiện ích trở thành được phép.
4. **Mô tả:** Duy trì danh mục tiện ích VS Code được phép khi thực hành và khi thi. Danh sách hiệu lực có hai tầng: toàn cục theo phiên bản trong danh mục, và theo từng môn sau khi được duyệt. Kết quả quét trên máy sinh viên chỉ để xem và đưa vào danh mục; use case này không khoá máy sinh viên.
5. **Điều kiện tiên quyết:**
   - Quản trị viên đã đăng nhập.
   - Với nhánh theo môn, môn học đã tồn tại (UC05).
   - Với nhánh kết quả quét, giảng viên đã đồng bộ ít nhất một bản quét nếu muốn xem dữ liệu máy phòng.
6. **Kết quả:**
   - Danh mục có tiện ích với tên, nhà phát hành và mã `publisher.name`.
   - Một phiên bản (kể cả dấu `*` nghĩa là mọi phiên bản) được duyệt thì tiện ích đó được phép ở tầng toàn cục từ thời điểm duyệt.
   - Một mục theo môn ở trạng thái đã duyệt thì được phép thêm cho môn đó.
   - Bản quét đã chọn hiện danh sách tiện ích trên máy, kèm số tiện ích và số vi phạm.
7. **Luồng chính:**
   1. Quản trị viên mở Tiện ích IDE, tab Catalog extension.
   2. Quản trị viên nhập tên hiển thị, nhà phát hành và mã `publisher.name`, rồi thêm tiện ích.
   3. Hệ thống lưu tiện ích ở trạng thái chưa có phiên bản được duyệt.
   4. Quản trị viên mở chi tiết tiện ích, thêm một phiên bản cụ thể hoặc phiên bản `*`, rồi chọn duyệt.
   5. Hệ thống ghi người duyệt và thời điểm duyệt. Tiện ích chuyển trạng thái tương ứng: duyệt mọi phiên bản, đã duyệt hết phiên bản cụ thể, còn chờ duyệt, hoặc chưa duyệt.
8. **Luồng thay thế:**
   - **A1 — Bỏ duyệt hoặc xoá một phiên bản.** Quản trị viên bỏ duyệt hoặc xoá phiên bản chưa cần giữ. Hệ thống đưa phiên bản về chờ duyệt, hoặc gỡ hẳn dòng phiên bản. Tầng toàn cục tính lại theo các phiên bản còn được duyệt.
   - **A2 — Lấy từ bản quét.** Trên tab Kết quả quét, quản trị viên chọn một tiện ích xuất hiện trên máy và đưa vào danh mục. Hệ thống tạo tiện ích hoặc thêm phiên bản nếu chưa có, và báo nếu dòng đã tồn tại. Dòng mới vẫn chờ duyệt ở bước 4.
   - **A3 — Đề xuất theo môn.** Quản trị viên (hoặc giảng viên) chọn môn và mã tiện ích rồi gửi đề xuất. Hệ thống tạo mục ở trạng thái chờ duyệt.
   - **A4 — Duyệt hoặc từ chối theo môn.** Quản trị viên duyệt hoặc từ chối mục đang chờ. Chỉ mục đã duyệt đi vào danh sách được phép của môn. Quản trị viên cũng có thể gỡ mục.
   - **A5 — Xem kết quả quét.** Quản trị viên mở tab Kết quả quét, chọn một bản theo MSSV và máy. Hệ thống hiện từng tiện ích, trạng thái đối chiếu và số vi phạm trên tổng số tiện ích.
   - **A6 — Làm mới thông tin chợ tiện ích.** Quản trị viên chọn làm mới một tiện ích đã có. Hệ thống cập nhật ngày công bố và ngày phát hành gần nhất khi nguồn trả về được.
9. **Luồng ngoại lệ:**
   - **E1 (bước 2).** Thiếu tên, nhà phát hành hoặc mã. Hệ thống không thêm.
   - **E2 (bước 2, A2).** Mã tiện ích đã có trong danh mục. Hệ thống không tạo bản sao; với A2 thì báo dòng đã tồn tại.
   - **E3 (A3).** Môn không tồn tại hoặc mã tiện ích trống. Hệ thống không tạo đề xuất.
   - **E4 (A4).** Người thao tác không phải quản trị viên. Hệ thống từ chối duyệt, từ chối và xoá. Giảng viên vẫn đề xuất và xem được.
   - **E5 (A5).** Chưa có bản quét. Hệ thống hiện danh sách trống, không báo lỗi hệ thống.

Quy tắc đối chiếu khi đã có bản quét (không phải một bước người dùng phải thực hiện): phiên bản `*` đã duyệt cho phép mọi phiên bản của mã đó ở tầng toàn cục; nếu không có `*` thì chỉ phiên bản khớp đúng chuỗi đã duyệt mới được phép; không có phiên bản nào đã duyệt thì tiện ích bị coi là không được phép.

---

## UC14 — Xem nhật ký kiểm toán

1. **Use case ID:** UC-AUD-01 (mã sơ đồ: UC14)
2. **Tên use case:** Xem nhật ký kiểm toán
3. **Tác nhân:**
   - Tác nhân chính: Quản trị viên.
   - Tác nhân phụ: không có. Các thao tác nhạy cảm (đổi chủ phiên thi, ghi đè điểm, sửa sau khi chốt, đổi quyền đọc) do người khác hoặc do hệ thống ghi vào sổ trước khi use case này mở.
4. **Mô tả:** Cho quản trị viên đọc lại ai đã làm gì, lúc nào, trên đối tượng nào. Sổ chỉ thêm, không sửa và không xoá từ màn hình này. Màn hình chỉ nêu tên trường đã đổi, không hiện giá trị cũ và giá trị mới.
5. **Điều kiện tiên quyết:**
   - Quản trị viên đã đăng nhập.
   - Trang Nhật ký thao tác sẵn sàng.
6. **Kết quả:**
   - Quản trị viên thấy các dòng khớp bộ lọc: thời điểm, người thực hiện (hoặc «Hệ thống» khi không có người), mã hành động, loại đối tượng, đoạn định danh, và tên các trường đã đổi.
   - Dữ liệu sổ không bị sửa bởi lần xem này.
7. **Luồng chính:**
   1. Quản trị viên mở Nhật ký thao tác.
   2. Hệ thống tải trang nhật ký mới nhất.
   3. Hệ thống hiện bảng thời điểm, người làm, hành động, đối tượng và các trường đã đổi.
8. **Luồng thay thế:**
   - **A1 — Lọc.** Quản trị viên nhập mã hành động (ví dụ `grading.override` hoặc `exam_session.reassign_teacher`) và/hoặc mốc «từ ngày», rồi chọn Lọc. Hệ thống chỉ hiện dòng khớp.
   - **A2 — Xoá lọc.** Quản trị viên chọn Xoá lọc. Hệ thống trở lại toàn bộ sổ như bước 2.
   - **A3 — Tải thêm.** Còn trang phía sau. Quản trị viên chọn Tải thêm. Hệ thống ghép các dòng cũ hơn vào danh sách đang xem.
9. **Luồng ngoại lệ:**
   - **E1 (bước 2, A1, A3).** Không tải được sổ. Hệ thống báo «Không tải được nhật ký. Thử tải lại trang» và không hiện dữ liệu cũ như thể đó là kết quả mới.
   - **E2 (bước 3, A1).** Không có dòng khớp. Hệ thống báo chưa có thao tác nào khớp bộ lọc.
   - **E3.** Người không phải quản trị viên mở đường dẫn nhật ký. Hệ thống từ chối. Giảng viên không có mục này trên menu.

---

## UC15 — Đổi giảng viên phụ trách phiên thi

1. **Use case ID:** UC-EXM-01 (mã sơ đồ: UC15)
2. **Tên use case:** Đổi giảng viên phụ trách phiên thi
3. **Tác nhân:**
   - Tác nhân chính: Quản trị viên.
   - Tác nhân phụ: không có.
4. **Mô tả:** Chuyển quyền một phiên thi đã tạo sang giảng viên khác khi đổi phân công trên lớp (UC11) không kéo theo các phiên cũ. Sau khi đổi, giảng viên mới đọc được bài nộp và điểm của phiên; giảng viên cũ mất quyền đó ngay.
5. **Điều kiện tiên quyết:**
   - Quản trị viên đã đăng nhập.
   - Phiên thi cần chuyển đã tồn tại.
   - Tài khoản giảng viên đích đang hoạt động.
6. **Kết quả:**
   - Phiên thi thuộc giảng viên mới.
   - Giảng viên cũ không còn mở được phiên, bài nộp và điểm của phiên đó.
   - Giảng viên mới thấy phiên trong phạm vi của mình.
   - Sổ kiểm toán có một dòng `exam_session.reassign_teacher` ghi cả giảng viên cũ và giảng viên mới, cùng giao dịch với lần đổi quyền.
   - Phân công trên lớp học phần và rubric không đổi chủ bởi use case này.
7. **Luồng chính:**
   1. Quản trị viên chọn phiên thi và chọn giảng viên mới sẽ phụ trách.
   2. Hệ thống kiểm tra phiên tồn tại, giảng viên đích khác giảng viên hiện tại, đúng vai trò giảng viên và đang hoạt động.
   3. Hệ thống ghi giảng viên mới lên phiên và ghi nhật ký kiểm toán trong cùng một giao dịch.
   4. Hệ thống xác nhận phiên đã thuộc giảng viên mới.
8. **Luồng thay thế:**
   - Không có đường khác để đạt cùng mục tiêu. Đổi giảng viên trên lớp học phần (UC11) cố ý không thay người phụ trách phiên đã tạo.
9. **Luồng ngoại lệ:**
   - **E1 (bước 2).** Không tìm thấy phiên thi. Hệ thống không ghi gì.
   - **E2 (bước 2).** Giảng viên được chọn đang là chủ phiên. Hệ thống từ chối và không ghi sổ, vì không có thay đổi quyền.
   - **E3 (bước 2).** Tài khoản đích không phải giảng viên. Hệ thống từ chối, để phiên không bị trỏ vào tài khoản không có màn hình giảng viên.
   - **E4 (bước 2).** Tài khoản giảng viên đích đã bị vô hiệu hoá. Hệ thống từ chối, để phiên không biến khỏi mọi người dùng đang hoạt động.
   - **E5.** Người gọi không phải quản trị viên. Hệ thống từ chối. Giảng viên không tự chuyển phiên của mình hoặc của người khác.
