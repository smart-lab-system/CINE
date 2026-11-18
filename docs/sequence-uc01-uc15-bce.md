# Sequence diagram UC01–UC15 (BCE) — Mục lục

**Phương pháp:** Jacobson BCE — Boundary · Control · Entity  
**Đặc tả use case:** [usecase-spec-uc01-uc15.md](./usecase-spec-uc01-uc15.md)

Chuỗi quan hệ chuẩn:

```text
[Actor] <---> [Boundary] <---> [Controller] <---> [Entity]
                                    |
                                    +---> [Controller khác]
```

Mỗi use case có **một tài liệu sequence chi tiết** (cùng khung với UC01): ánh xạ BCE ↔ code, quy tắc / không vẽ riêng, Mermaid luồng chính, bảng thông điệp đánh số, luồng thay thế, luồng ngoại lệ, class diagram BCE, checklist vẽ UML.

## Tài liệu chi tiết theo UC

| UC | Use case ID | Tên | File chi tiết |
| --- | --- | --- | --- |
| UC01 | UC-AUTH-01 | Đăng nhập hệ thống | [sequence-uc01-login-bce.md](./sequence-uc01-login-bce.md) |
| UC02 | UC-AUTH-02 | Đăng xuất hệ thống | [sequence-uc02-logout-bce.md](./sequence-uc02-logout-bce.md) |
| UC03 | UC-ACC-01 | Quản lý tài khoản người dùng | [sequence-uc03-accounts-bce.md](./sequence-uc03-accounts-bce.md) |
| UC04 | UC-CAT-01 | Quản lý năm học | [sequence-uc04-academic-year-bce.md](./sequence-uc04-academic-year-bce.md) |
| UC05 | UC-CAT-02 | Quản lý môn học | [sequence-uc05-course-bce.md](./sequence-uc05-course-bce.md) |
| UC06 | UC-CAT-03 | Quản lý lớp danh nghĩa | [sequence-uc06-nominal-class-bce.md](./sequence-uc06-nominal-class-bce.md) |
| UC07 | UC-CAT-04 | Quản lý hồ sơ sinh viên | [sequence-uc07-student-bce.md](./sequence-uc07-student-bce.md) |
| UC08 | UC-LAB-01 | Quản lý phòng máy | [sequence-uc08-room-bce.md](./sequence-uc08-room-bce.md) |
| UC09 | UC-LAB-02 | Quản lý máy tính phòng máy | [sequence-uc09-computer-bce.md](./sequence-uc09-computer-bce.md) |
| UC10 | UC-SEC-01 | Quản lý lớp học phần | [sequence-uc10-course-section-bce.md](./sequence-uc10-course-section-bce.md) |
| UC11 | UC-SEC-02 | Phân công giảng viên cho lớp học phần | [sequence-uc11-assign-teacher-bce.md](./sequence-uc11-assign-teacher-bce.md) |
| UC12 | UC-SEC-03 | Quản lý sĩ số lớp học phần | [sequence-uc12-roster-bce.md](./sequence-uc12-roster-bce.md) |
| UC13 | UC-IDE-01 | Quản lý tiện ích IDE | [sequence-uc13-ide-utilities-bce.md](./sequence-uc13-ide-utilities-bce.md) |
| UC14 | UC-AUD-01 | Xem nhật ký kiểm toán | [sequence-uc14-audit-log-bce.md](./sequence-uc14-audit-log-bce.md) |
| UC15 | UC-EXM-01 | Đổi giảng viên phụ trách phiên thi | [sequence-uc15-reassign-session-bce.md](./sequence-uc15-reassign-session-bce.md) |

## Quy ước chung (áp dụng mọi file)

| Quy tắc | Áp dụng |
| --- | --- |
| Actor chỉ nói chuyện với Boundary | Không Actor → Control / Entity |
| Boundary không đụng Entity | Mọi nghiệp vụ qua Control |
| Entity không gọi Control / Boundary | Chỉ trả / nhận dữ liệu |
| Control → Control khác | JWT Token, Semester, Room, Assign, Roster, Audit, NominalClass… |
| `JwtAuthGuard` + `@Roles` | Gộp vào bước vào Control (trừ khi cần nhấn mạnh) |
| `Repository` / TypeORM | Không vẽ participant; thông điệp ghi lên Entity |
| `apiClient` | Phương tiện Boundary → Nest sau UC01; không vẽ riêng |
| Auth BFF Next (`/api/auth/*`) | Chủ yếu UC01 / UC02 (cookie httpOnly) |

**Tiền điều kiện UC03–UC15:** Quản trị viên đã đăng nhập (UC01); access token còn hiệu lực (hoặc đã refresh).

## Include giữa các sequence

| Từ | Tới | File thể hiện |
| --- | --- | --- |
| UC08 | UC09 | `opt` / ref trong UC08 → UC09 |
| UC10 | UC11, UC12 | `ref` cuối happy path UC10 |
| UC15 | ghi Audit | Control → `AuditLogControl` trong UC15 (UC14 chỉ đọc) |

## Khung mục trong mỗi file chi tiết

1. Ánh xạ BCE ↔ code (+ quy tắc / không vẽ riêng)  
2. Luồng chính — Mermaid + bảng thông điệp đánh số  
3. Luồng thay thế — Mermaid từng nhánh  
4. Luồng ngoại lệ — Mermaid `alt` + bảng  
5. Sơ đồ lớp BCE (phụ trợ)  
6. Checklist khi vẽ StarUML / VP / PlantUML  
