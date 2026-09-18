# Thiết kế: Biểu mẫu Excel kỳ thi (ba mẫu xuất)

**Ngày:** 2026-09-18  
**Trạng thái:** Approved for plan — §8 chốt 2026-09-18  
**Nhánh:** `feature/seed-data-api` (tiếp tục trên nhánh hiện tại)  
**Plan:** `docs/superpowers/plans/2026-09-18-exam-form-excel-templates.md`  
**Dựa trên:** tài nguyên học vụ & roster
(`docs/superpowers/specs/2026-08-29-resources-and-roster-design.md`),
`exam_session` / `room` / `enrollment` đã có trên `main`, và fixture hình
production (`scripts/seed-fixtures/`).

---

## 1. Vì sao cần giai đoạn này

CINE đã có dữ liệu học vụ (môn, lớp, phòng, roster, phiên thi) nhưng **chưa
xuất được các biểu mẫu hành chính** mà phòng đào tạo / khoa dùng khi tổ
chức thi máy. Ba file Excel dưới đây là hợp đồng cột cố định với sổ giấy /
quy trình ngoài hệ thống:

1. **Lịch thi tổng hợp** — một dòng / (lớp HP × ca × phòng).
2. **Phân công cán bộ coi thi theo phòng** — một dòng / phòng trong một ca.
3. **Danh sách thí sinh dự thi theo phòng** — một dòng / thí sinh (kèm
   ngày, ca, phòng trên cùng dòng).

**Slice đầu (tài liệu này khóa):** cho phép **tạo / tải mẫu Excel** đúng
header, kiểu dữ liệu, quy tắc và vài dòng mẫu — để người dùng điền tay hoặc
đối chiếu với mẫu ngoài. **Đổ dữ liệu tự động từ DB** là bước sau (§2).

---

## 2. Mục tiêu / ngoài phạm vi

**Mục tiêu**

- Định nghĩa **ba loại biểu mẫu** với header cột **đúng tên** như §4–§6
  (không đổi tên cột khi xuất — đây là hợp đồng với bên ngoài).
- Mỗi cột có: kiểu dữ liệu, bắt buộc/tuỳ chọn, ghi chú, quy tắc hợp lệ.
- Mỗi mẫu có **sample data** hình production (khớp fixture seed khi có).
- UI slice đầu: chọn loại mẫu → tải `.xlsx` (header + 1–3 dòng mẫu;
  có thể chọn “chỉ header”).
- Sinh file **ở trình duyệt** bằng `exceljs` (đã dùng cho import roster) —
  không upload template lên NestJS (Security rule 5).
- **Mọi role đã map** (`admin`, `department_admin`, `teacher`) đều tải được.

**Ngoài phạm vi (cố ý, slice sau)**

- Fill biểu mẫu từ `exam_session` / `enrollment` / phân công CBCT trong DB.
- Import ngược ba file này vào CINE (đây là **xuất mẫu / sổ**, không phải
  roster import).
- Lưu template tùy biến của người dùng (đổi header, thêm cột).
- Entity mới cho “cán bộ coi thi” / lịch thi tổng hợp — chưa có trong
  schema; slice đầu chỉ khóa **hình dạng file**.
- PDF / Word.

---

## 3. Quy ước chung cho mọi mẫu

| Quy ước | Quyết định |
| --- | --- |
| Sheet | Một sheet, tên = sheet name §3.1. Dòng 1 = header đúng chuỗi §4–§6. |
| Encoding / font | Unicode; Excel mặc định. Không nhúng macro. |
| Dòng trống | Bỏ qua khi validate (nếu có bước validate sau); không đếm vào STT. |
| STT | Số nguyên ≥ 1, tăng dần trong file; **không** dùng làm khóa nghiệp vụ. |
| Ngày | Chuỗi `DD/MM/YYYY` (vd. `15/12/2026`) **hoặc** ô Excel kiểu Date hiển thị cùng format. Khi parse: ưu tiên Date cell; nếu text thì đúng regex `^\d{2}/\d{2}/\d{4}$`. |
| Giờ | `HH:mm` 24h (vd. `07:30`, `13:00`). |
| Ca thi | Số nguyên `1`–`4` (Ca 1…Ca 4). Không dùng chữ “Sáng/Chiều” trong ô. |
| Ghi_Chu | Chuỗi, tối đa 500 ký tự; được để trống. |
| Tên file tải về | `{loai}_{yyyyMMdd_HHmm}.xlsx` (vd. `lich-thi-tong-hop_20261201_0930.xlsx`). |
| Vai trò tải mẫu | **Mọi role đã map:** `admin`, `department_admin`, `teacher`. Nav item `Biểu mẫu` trong cả ba area; trang thật (không placeholder). |

### 3.1 Mã loại mẫu

| Mã | Tên hiển thị | Sheet name |
| --- | --- | --- |
| `lich-thi-tong-hop` | Lịch thi tổng hợp | `Lich_Thi_Tong_Hop` |
| `phan-cong-cbct` | Phân công CBCT theo phòng | `Phan_Cong_CBCT` |
| `ds-thisinh-theo-phong` | DS thí sinh theo phòng | `DS_ThiSinh_Phong` |

### 3.2 Quan hệ với domain CINE (tham chiếu, chưa map tự động)

| Cột biểu mẫu | Gợi ý nguồn sau này |
| --- | --- |
| `Ma_HocPhan` / `Ten_HocPhan` | `course.code` / `course.name` |
| `Ma_LopHP` | `class.name` (vd. `Nhóm 01`) — **không** phải UUID |
| `HinhThuc_Thi` | **Khác** `exam_type` (TK/GK/CK). Hình thức = cách thi; **chuỗi tự do** ≤ 100 ký tự. |
| `Ma_PhongThi` / `Phong_Thi` | `room.name` |
| `SoLuong_ThiSinh` / `SL_SV` | `COUNT(enrollment)` của lớp / số SV gán phòng |
| `Ma_Sinh_Vien` | `enrollment.student_mssv` (`^[A-Za-z0-9]{4,20}$`) |
| `Ho_Dem` + `Ten` | Tách từ `enrollment.student_name` (quy tắc tách §6.2) |
| `Ngay_Thi` / `Ca_Thi` / `Phong_Thi` (mẫu 3) | Từ lịch / phiên thi khi fill tự động |
| CBCT1 / CBCT2 | Chưa có entity — điền tay hoặc phase sau |

---

## 4. Mẫu 1 — Lịch thi tổng hợp

**Mã:** `lich-thi-tong-hop`  
**Một dòng =** một ca thi của một lớp học phần tại một phòng.

### 4.1 Cột

| # | Tên cột (header đúng) | Kiểu | Bắt buộc | Ghi chú / quy tắc |
| --- | --- | --- | --- | --- |
| 1 | `STT` | integer | Có | ≥ 1, duy nhất trong file. |
| 2 | `Ma_HocPhan` | string (citext-like) | Có | 4–32 ký tự `[A-Za-z0-9._-]`. Khớp mã học phần nhà trường (vd. `4220004247`). |
| 3 | `Ten_HocPhan` | string | Có | 1–200 ký tự. |
| 4 | `Ma_LopHP` | string | Có | 1–100 ký tự. Mã/tên lớp HP do khoa dùng (vd. `Nhóm 01`, `DHCNTT18A`). |
| 5 | `HinhThuc_Thi` | string | Có | **Chuỗi tự do**, 1–100 ký tự (vd. `Thực hành máy`, `Viết`, `Vấn đáp`). Không enum. |
| 6 | `ThoiLuong_Phut` | integer | Có | 15–300; phải khớp cửa sổ giờ thi nếu có `Gio_BatDau` + thời lượng suy ra kết thúc. |
| 7 | `Ngay_Thi` | date | Có | Theo §3. |
| 8 | `Ca_Thi` | integer | Có | 1–4. |
| 9 | `Gio_BatDau` | time | Có | `HH:mm`. |
| 10 | `Ma_PhongThi` | string | Có | 1–100 ký tự; nên khớp `room.name` khi đã có phòng trong hệ thống. |
| 11 | `SoLuong_ThiSinh` | integer | Có | ≥ 1. Không vượt `room.capacity` khi capacity đã biết (cảnh báo mềm khi fill tự động; mẫu tay không chặn). |
| 12 | `Ghi_Chu` | string | Không | ≤ 500. |

**Khóa logic (không trùng trong cùng file):**  
`(Ngay_Thi, Ca_Thi, Ma_PhongThi)` — một phòng không chứa hai dòng cùng ca/ngày.  
`(Ngay_Thi, Ca_Thi, Ma_HocPhan, Ma_LopHP)` — một lớp HP không thi hai phòng cùng ca (trừ khi Ghi_Chu ghi rõ tách phòng; khi đó cho phép nếu `Ma_PhongThi` khác).

### 4.2 Sample data

| STT | Ma_HocPhan | Ten_HocPhan | Ma_LopHP | HinhThuc_Thi | ThoiLuong_Phut | Ngay_Thi | Ca_Thi | Gio_BatDau | Ma_PhongThi | SoLuong_ThiSinh | Ghi_Chu |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 4220004247 | Nhập môn Lập trình | Nhóm 01 | Thực hành máy | 90 | 15/12/2026 | 1 | 07:30 | Phòng máy H1.1 | 22 | |
| 2 | 4220004247 | Nhập môn Lập trình | Nhóm 01 | Thực hành máy | 90 | 15/12/2026 | 2 | 13:00 | Phòng máy H1.2 | 22 | Ca chiều — phòng khác |
| 3 | 4220005101 | Cơ sở dữ liệu | Nhóm 02 | Thực hành máy | 120 | 16/12/2026 | 1 | 07:30 | Phòng máy H2.1 | 30 | |

---

## 5. Mẫu 2 — Phân công cán bộ coi thi theo phòng thi

**Mã:** `phan-cong-cbct`  
**Một dòng =** một phòng trong một ca, kèm tối đa hai cán bộ coi thi.

### 5.1 Cột

| # | Tên cột (header đúng) | Kiểu | Bắt buộc | Ghi chú / quy tắc |
| --- | --- | --- | --- | --- |
| 1 | `STT` | integer | Có | ≥ 1. |
| 2 | `Ngay_Thi` | date | Có | §3. |
| 3 | `Ca_Thi` | integer | Có | 1–4. |
| 4 | `Gio_Thi` | time | Có | Giờ bắt đầu ca tại phòng (`HH:mm`). Cùng ý nghĩa `Gio_BatDau` mẫu 1. |
| 5 | `Phong_Thi` | string | Có | Tên phòng (khớp `Ma_PhongThi` mẫu 1 khi cùng nguồn). |
| 6 | `Mon_Thi` | string | Có | Tên môn hiển thị (có thể = `Ten_HocPhan` hoặc `Ma_HocPhan — Ten_HocPhan`). ≤ 200. |
| 7 | `SL_SV` | integer | Có | ≥ 1; nên khớp `SoLuong_ThiSinh` mẫu 1 cùng ngày/ca/phòng. |
| 8 | `Ma_CBCT1` | string | Có | Mã cán bộ 1: 3–20 ký tự `[A-Za-z0-9._-]`. |
| 9 | `Ten_CBCT1` | string | Có | Họ tên đầy đủ ≤ 150. |
| 10 | `DonVi_CBCT1` | string | Có | Đơn vị công tác ≤ 200 (vd. `Khoa CNTT`). |
| 11 | `Ma_CBCT2` | string | Không* | Cùng quy tắc `Ma_CBCT1`. *Bắt buộc nếu có bất kỳ ô CBCT2 nào được điền. |
| 12 | `Ten_CBCT2` | string | Không* | ≤ 150. |
| 13 | `DonVi_CBCT2` | string | Không* | ≤ 200. |
| 14 | `Ghi_Chu` | string | Không | ≤ 500. |

**Quy tắc**

- `Ma_CBCT1` ≠ `Ma_CBCT2` khi cả hai có mặt.
- Cùng `(Ngay_Thi, Ca_Thi)`: một `Ma_CBCT*` không xuất hiện ở hai `Phong_Thi` khác nhau (một người không coi hai phòng cùng ca).
- Khóa dòng: `(Ngay_Thi, Ca_Thi, Phong_Thi)`.

### 5.2 Sample data

| STT | Ngay_Thi | Ca_Thi | Gio_Thi | Phong_Thi | Mon_Thi | SL_SV | Ma_CBCT1 | Ten_CBCT1 | DonVi_CBCT1 | Ma_CBCT2 | Ten_CBCT2 | DonVi_CBCT2 | Ghi_Chu |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 15/12/2026 | 1 | 07:30 | Phòng máy H1.1 | Nhập môn Lập trình | 22 | GV001 | Nguyễn Văn An | Khoa CNTT | GV014 | Trần Thị Hương | Khoa CNTT | |
| 2 | 15/12/2026 | 2 | 13:00 | Phòng máy H1.2 | Nhập môn Lập trình | 22 | GV002 | Lê Minh Tuấn | Khoa CNTT | | | | Chỉ một CBCT |
| 3 | 16/12/2026 | 1 | 07:30 | Phòng máy H2.1 | Cơ sở dữ liệu | 30 | GV003 | Phạm Thị Lan | Khoa CNTT | GV001 | Nguyễn Văn An | Khoa CNTT | |

---

## 6. Mẫu 3 — Danh sách thí sinh dự thi theo phòng

**Mã:** `ds-thisinh-theo-phong`  
**Một dòng =** một thí sinh gắn ngày / ca / phòng (metadata nằm **trên lưới**,
không chỉ tên file).

### 6.1 Cột (hợp đồng đã chốt)

| # | Tên cột (header đúng) | Kiểu | Bắt buộc | Ghi chú / quy tắc |
| --- | --- | --- | --- | --- |
| 1 | `STT` | integer | Có | ≥ 1 trong file. |
| 2 | `Ngay_Thi` | date | Có | §3. |
| 3 | `Ca_Thi` | integer | Có | 1–4. |
| 4 | `Phong_Thi` | string | Có | 1–100; khớp tên phòng. |
| 5 | `Ma_Sinh_Vien` | string | Có | MSSV: `^[A-Za-z0-9]{4,20}$` (khớp `ck_enrollment_mssv`). |
| 6 | `Ho_Dem` | string | Có | Họ + tên đệm, ≤ 100. Được phép một từ (họ). |
| 7 | `Ten` | string | Có | Tên gọi, 1–50 ký tự; **không** chứa khoảng trắng (một token). |
| 8 | `Ghi_Chu` | string | Không | ≤ 500 (vd. `Thi bù`, `Vắng có phép`). |

**Không còn cột `MMSV`.** Số máy không thuộc hợp đồng mẫu này.

**Quy tắc**

- Khóa logic thí sinh trong cùng ngày/ca/phòng: `Ma_Sinh_Vien` duy nhất
  trong `(Ngay_Thi, Ca_Thi, Phong_Thi)`.
- Cùng `Ma_Sinh_Vien` được phép xuất hiện ở phòng/ca khác (thi bù) nếu
  `Ghi_Chu` ghi rõ — slice mẫu không enforce; phase fill sẽ quyết định.

### 6.2 Tách `Ho_Dem` / `Ten` từ họ tên đầy đủ

Khi fill tự động từ `enrollment.student_name`:

1. Trim, gộp khoảng trắng.
2. `Ten` = token **cuối**.
3. `Ho_Dem` = phần còn lại; nếu chỉ một token thì `Ho_Dem` = token đó và `Ten` = token đó (edge case tên một chữ — ghi `Ghi_Chu`).

Ví dụ: `Nguyễn Hoàng Minh` → `Ho_Dem=Nguyễn Hoàng`, `Ten=Minh`.

### 6.3 Sample data

| STT | Ngay_Thi | Ca_Thi | Phong_Thi | Ma_Sinh_Vien | Ho_Dem | Ten | Ghi_Chu |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 15/12/2026 | 1 | Phòng máy H1.1 | 24000301 | Nguyễn Hoàng | Minh | |
| 2 | 15/12/2026 | 1 | Phòng máy H1.1 | 24000302 | Trần Thị Mai | Anh | |
| 3 | 15/12/2026 | 1 | Phòng máy H1.1 | 24000303 | Lê Văn | Đức | |
| 4 | 15/12/2026 | 1 | Phòng máy H1.1 | 24000304 | Phạm Thị Thu | Hà | |
| 5 | 15/12/2026 | 1 | Phòng máy H1.1 | 24000305 | Hoàng Minh | Tuấn | |

(Nguồn MSSV/họ tên: `scripts/seed-fixtures/students.json`.)

---

## 7. Hành vi sản phẩm (slice đầu)

### 7.1 Luồng

```
Người dùng đã đăng nhập (admin | Trưởng khoa | GV)
  → mở Biểu mẫu trong area của mình
     /admin/forms | /department/forms | /teacher/forms
  → chọn 1 trong 3 loại
  → tùy chọn: “Kèm dòng mẫu” (mặc định bật) | “Chỉ header”
  → Tải về .xlsx (sinh client-side, exceljs)
```

Không gọi API để sinh file. Schema + sample là constant TypeScript trong
`apps/web` (không cần NestJS).

### 7.2 Cấu trúc code đề xuất

| Thành phần | Vai trò |
| --- | --- |
| `apps/web/src/lib/exam-forms/` | Schema cột, sample rows, `buildExamFormWorkbook`, `downloadExamForm` |
| `apps/web/src/components/exam-forms/ExamFormsPage.tsx` | UI dùng chung |
| `apps/web/src/app/{admin,department,teacher}/forms/page.tsx` | Ba route mỏng re-export cùng UI |
| `apps/web/src/lib/nav-config.ts` | Thêm “Biểu mẫu” vào cả ba nav |

### 7.3 Không làm trong slice đầu

- Endpoint NestJS trả file binary.
- Lưu lịch sử tải.
- Đồng bộ / validate với DB.

---

## 8. Quyết định đã chốt (2026-09-18)

| # | Câu hỏi | Chốt |
| --- | --- | --- |
| 1 | Cột `MMSV` mẫu 3 | **Bỏ** — không có số máy trên mẫu này. |
| 2 | Metadata phòng/ca mẫu 3 | **Thêm cột** `Ngay_Thi`, `Ca_Thi`, `Phong_Thi` vào lưới (hợp đồng §6.1). |
| 3 | `HinhThuc_Thi` | **Chuỗi tự do** 1–100 ký tự (không enum). |
| 4 | Ai tải được | **Mọi role đã map** (`admin`, `department_admin`, `teacher`). |

---

## 9. Tiêu chí xong (slice mẫu Excel)

- [x] Spec được approve (§8 chốt).
- [x] Tải được 3 file `.xlsx`, header khớp từng ký tự §4–§6.
- [x] Bật “kèm dòng mẫu” → đúng sample (hoặc subset) trong spec.
- [x] Test đơn vị khóa thứ tự cột và helper tách họ tên.
- [x] Nav “Biểu mẫu” hiện ở cả ba area; trang không phải PlaceholderPage.
- [x] Không có upload file lên API; không entity mới.

---

## 10. Bước tiếp theo

1. Plan implement: `docs/superpowers/plans/2026-09-18-exam-form-excel-templates.md`.
2. Implement trên `feature/seed-data-api` (hoặc nhánh con nếu tách PR).
3. Phase 2 (spec riêng): fill từ `exam_session` + roster + (nếu có) bảng phân công CBCT.
