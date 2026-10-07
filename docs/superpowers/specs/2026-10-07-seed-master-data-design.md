# Seed master data (catalog) — thiết kế

**Ngày:** 2026-10-07 · **Branch:** `feature/seed-master-data` · **Baseline:** `feature/master-data-entities`  
**Trạng thái:** implemented (2026-10-07)  
**Phụ thuộc:** catalog entities + admin CRUD (`2026-10-07-master-data-entities-design.md`)

Đổ dữ liệu nền vào các bảng catalog mới (`account`, `course`, `room`,
`computer`, `nominal_class`, `student`) từ file JSON trong `scripts/` và từ
quy tắc sinh deterministic. Seed cũ của migration **không còn được dùng**
làm nguồn dữ liệu demo / reset — nhưng **không xóa** các câu `INSERT` trong
migration.

---

## 0. Vì sao cần cái này

Catalog đã có schema + CRUD admin, nhưng DB trống (hoặc chỉ còn seed demo
cũ: `CS101`/`CS201`, 3 phòng máy, tài khoản tạo tay theo runbook). Cần một
lần khởi tạo thực tế: giảng viên / môn / phòng từ nguồn JSON đã chuẩn bị,
máy tính theo sức chứa phòng, rồi lớp danh nghĩa + sinh viên theo quy ước
mã trường.

---

## 1. Phạm vi

### 1.1 Trong phạm vi

| Hạng mục | Ghi chú |
|---|---|
| Ngừng phụ thuộc seed migration cũ | Không xóa `INSERT` trong `AddCourseRoomExamType`; cập nhật tài liệu / `reset-dev-data` / runbook để không còn dựa vào chúng |
| Seed tài khoản | 2 admin cố định + 77 giảng viên từ `scripts/danh_sach_giang_vien.json` |
| Seed môn học | Từ `scripts/danh_sach_mon_hoc.json` (39 mã) |
| Seed phòng máy | Từ `scripts/danh_sach_phong_may.json` |
| Seed máy tính | Sinh từ `sucChua` / `capacity` từng phòng |
| Seed lớp danh nghĩa | Khóa 2021–2024, quy tắc mã dưới đây |
| Seed sinh viên | Theo sĩ số lớp; MSSV + họ tên tiếng Việt |
| Seed năm học / học kỳ | 2 năm (`2025 - 2026` closed, `2026 - 2027` active) + 6 kỳ (HK1/HK2/HE mỗi năm); chụp từ lịch thực tế |
| Script chạy một lần (hoặc idempotent) | CLI trong `apps/api` hoặc `scripts/`, đọc JSON, ghi DB qua TypeORM / data-source |

### 1.2 Cố ý KHÔNG trong phạm vi

- Xóa / sửa nội dung `INSERT` seed trong migration cũ.
- Gắn catalog vào `exam_session` / `class` / `enrollment` / roster cũ.
- Import Excel, UI admin “Seed”, API public seed.
- Seed lớp môn (`class`), phiên thi, bài nộp, chấm điểm.
- Đổi schema catalog (chỉ đổ dữ liệu vào schema đã có).

---

## 2. Ngừng dùng seed đang có

Seed hiện tại (migration `AddCourseRoomExamType` + tài khoản demo runbook):

| Nguồn cũ | Nội dung | Việc làm |
|---|---|---|
| Migration | Học kỳ `Học kỳ 1 2026-2027`; môn `CS101`/`CS201`; phòng A1/A2/B1 | **Giữ nguyên** trong migration (lịch sử schema). Không coi là nguồn dữ liệu cho môi trường mới / demo master-data |
| `scripts/reset-dev-data.sql` | Whitelist giữ CS101/CS201 + 3 phòng + 3 email demo | **Cập nhật** (phase implement): whitelist sang dữ liệu seed mới, hoặc thu hẹp thành “xóa hết catalog / giữ admin bootstrap” — chi tiết plan |
| `DEMO-RUNBOOK.md` / README | Hướng dẫn dựa CS101, phòng A1, demo-teacher | **Cập nhật** tham chiếu sang seed mới |

Không migration “undo seed”. Không `DELETE` seed cũ trong migration mới chỉ vì “không dùng nữa”.

---

## 3. Nguồn JSON (đã có)

| File | Số dòng (hiện tại) | Dùng cho |
|---|---|---|
| `scripts/danh_sach_giang_vien.json` | 77 | `account` role `teacher` |
| `scripts/danh_sach_mon_hoc.json` | 39 | `course` |
| `scripts/danh_sach_phong_may.json` | 39 | `room` (+ sinh `computer`) |

File JSON **commit vào git**; script seed chỉ đọc, không ghi đè.

---

## 4. Mapping & quy tắc sinh

### 4.1 Tài khoản (`account`)

JSON giảng viên **đã chứa email đầy đủ** `@hui.edu.vn` (không còn dạng `giangvien@slug`). Kiểm tra hiện tại: 77 dòng, mọi `href` khớp `*@hui.edu.vn`, không trùng email. Một số `text` kèm chức vụ trong ngoặc (vd. `(Phó bộ môn)`, `(NCS)`) — **giữ nguyên** trong `name`.

**Hai admin** (không nằm trong JSON giảng viên):

| `name` | `email` | `password` | `role` | `is_active` |
|---|---|---|---|---|
| `Bảo` | `bao@hui.edu.vn` | `Admin@123` | `admin` | `true` |
| `Phát` | `phat@hui.edu.vn` | `Admin@123` | `admin` | `true` |

Hash argon2id, cùng tham số `AccountsService.create`.

**Giảng viên** — mỗi phần tử JSON:

```json
{ "text": "ThS. Phạm Quảng Tri", "href": "phamquangtri@hui.edu.vn" }
```

| Field DB | Quy tắc |
|---|---|
| `name` | `text` nguyên bản (học vị + họ tên + chú thích ngoặc nếu có) |
| `email` | `href` lower-case — **dùng nguyên**, đuôi `@hui.edu.vn` |
| `password` | Mật khẩu chung: `Teacher@123` (hash argon2id) |
| `role` | `teacher` |
| `is_active` | `true` |

Nếu `href` không khớp `/^[a-z0-9._+-]+@hui\.edu\.vn$/i` → fail seed với lỗi rõ (không bỏ qua im lặng).  
Trùng email → idempotent: cập nhật `name`/`role`/`is_active`, **không** đổi password trừ khi flag `--reset-passwords`.

### 4.2 Môn học (`course`)

```json
{ "maHocPhan": "4220002793", "tenMonHoc": "Nhập môn Tin học" }
```

| Field DB | Quy tắc |
|---|---|
| `code` | `maHocPhan` |
| `name` | `tenMonHoc` |
| `status` | `active` |

Idempotent theo `code` (upsert name + status).

### 4.3 Phòng máy (`room`)

```json
{ "ma": "H1.1", "ten": "Phòng máy H1.1 - …", "toa": "H", "sucChua": 40, "trangThai": "Hoạt động" }
```

| Field DB | Quy tắc |
|---|---|
| `code` | `ma` |
| `name` | `ten` |
| `capacity` | `sucChua` |
| `building` | `toa` |
| `floor` | Suy từ `ma`: phần số ngay sau chữ tòa trước dấu chấm thứ nhất — vd. `H1.1` → `"1"`, `B2.3` → `"2"`. Không parse được → `null` |
| `status` | `Hoạt động` → `active`; giá trị khác (nếu có) map `maintenance` / `inactive` hoặc fail nếu không nhận ra |

Idempotent theo `code`.

### 4.4 Máy tính (`computer`)

Với mỗi phòng đã seed, tạo đúng `capacity` máy (`i = 1 … capacity`):

| Field DB | Quy tắc |
|---|---|
| `room_id` | FK phòng vừa tạo |
| `hostname` | `{code}.{nn}` với `nn` = số thứ tự **2 chữ số**, zero-pad — vd. phòng `H1.1` → `H1.1.01` … `H1.1.40` |
| `location` | `M{nn}` — vd. `M01` … `M40` |
| `cpu` | `i5 11400` |
| `ram_gb` | `16` |
| `storage` | `512GB` |
| `gpu` | `null` |
| `os` | `Microsoft Windows 10 Home` |
| `ip_address` / `mac_address` | `null` |
| `status` | `active` |

Tổng máy kỳ vọng với JSON hiện tại: **1560** (= tổng `sucChua`).

Idempotent: theo unique `(room_id, hostname)` — đã có thì bỏ qua / cập nhật cứng hóa phần cứng cố định ở trên.

### 4.5 Lớp danh nghĩa (`nominal_class`)

**Khóa:** 2021, 2022, 2023, 2024.

| Khóa (`cohort_year`) | Middle (2 chữ số trong mã) |
|---|---|
| 2021 | `17` |
| 2022 | `18` |
| 2023 | `19` |
| 2024 | `20` |

**Prefix (ngành):**

| Prefix | Ý nghĩa gợi ý (để đặt `name`) |
|---|---|
| `DHCNTT` | ĐH Công nghệ thông tin |
| `DHKTPM` | ĐH Kỹ thuật phần mềm |
| `DHKHMT` | ĐH Khoa học máy tính |
| `DHHTTT` | ĐH Hệ thống thông tin |

**Postfix:** `A`, `B`, `C`, `ATT`, `BTT`, `CTT`.

**Mã lớp:** `{prefix}{middle}{postfix}`  
Ví dụ: `DHCNTT17A`, `DHKTPM20CTT`.

**Số lớp:** 4 prefix × 4 khóa × 6 postfix = **96** lớp.

| Field DB | Quy tắc |
|---|---|
| `code` | như trên |
| `name` | `{tên ngành} — Khóa {year} — Lớp {postfix}` — vd. `Công nghệ thông tin — Khóa 2021 — Lớp A` |
| `cohort_year` | 2021…2024 |
| `status` | `active` |

### 4.6 Sinh viên (`student`)

Với mỗi lớp danh nghĩa, chọn **một số nguyên ngẫu nhiên trong khoảng** (mỗi lần seed có thể khác trừ khi cố định RNG seed):

| Postfix | Sĩ số |
|---|---|
| `A`, `B`, `C` | 80–90 (inclusive) |
| `ATT`, `BTT`, `CTT` | 40–45 (inclusive) |

**MSSV** (8 chữ số, thỏa `^[A-Za-z0-9]{4,20}$`):

- 2 số đầu = 2 số cuối của `cohort_year` — 2021 → `21`, …, 2024 → `24`
- 6 số còn lại: random decimal, **unique toàn cục** trong lần seed (và không trùng MSSV đã có trong DB nếu re-run)

Ví dụ: `21123456`.

**Họ tên:** họ tên tiếng Việt đầy đủ (họ + tên đệm + tên), sinh bằng thư viện npm
[`vietnamese-name-generator`](https://www.npmjs.com/package/vietnamese-name-generator)
(`generateFullName` / `generateManyFullNames`). Không tự duy trì dictionary họ/tên
trong repo. Cho phép trùng tên khác MSSV. Truyền `seed` (hoặc chuỗi seed dẫn xuất
từ `--seed` + MSSV) để tái lập được khi re-run.

| Field DB | Quy tắc |
|---|---|
| `mssv` | như trên |
| `full_name` | họ tên TV |
| `nominal_class_id` | lớp vừa tạo |
| `status` | `active` |

**Quy mô ước lượng:** ~96 lớp × trung bình ~(85×3 + 42.5×3)/6 ≈ **~64** SV/lớp → khoảng **~6 000** sinh viên (dao động theo random sĩ số).

**RNG:** script nhận `--seed <int>` (mặc định cố định, vd. `20261007`) để re-run ra cùng sĩ số / MSSV / tên khi cần so sánh.

---

## 5. Thứ tự chạy & idempotency

```
1. accounts   (admin → teachers)
2. courses
3. rooms
4. computers  (phụ thuộc rooms)
5. nominal_classes
6. students   (phụ thuộc nominal_classes)
```

- Chạy được trên DB đã migrate (catalog tables tồn tại).
- **Idempotent mặc định:** upsert theo unique key (`email`, `course.code`, `room.code`, `(room_id,hostname)`, `nominal_class.code`, `student.mssv`).
- Flag `--fresh-catalog` (optional, dev only): xóa theo thứ tự FK `student` → `computer` → `nominal_class` / `room` / `course` (và account seed theo email `@hui.edu.vn` đã liệt kê: 2 admin + 77 teacher) rồi seed lại — **không** đụng bảng nghiệp vụ cũ (`exam_session`, …).
- Không seed qua HTTP API (tránh phụ thuộc JWT); dùng TypeORM `DataSource` + hash argon2 giống `AccountsService`.
- Dependency seed: thêm `vietnamese-name-generator` (devDependency của `apps/api` hoặc package chạy script).

---

## 6. Giao diện vận hành

Gợi ý lệnh (chốt tên ở plan):

```bash
# từ apps/api, với .env trỏ DB đích
pnpm seed:master-data
# hoặc
npx ts-node -r tsconfig-paths/register scripts/seed-master-data.ts
```

In ra summary: số account / course / room / computer / nominal_class / student đã tạo vs bỏ qua.

---

## 7. Tài liệu cần cập nhật (khi implement)

- `scripts/reset-dev-data.sql` — thôi whitelist CS101 / phòng A1…
- `DEMO-RUNBOOK.md` / README chỗ nhắc seed demo cũ
- README ngắn trong `scripts/` hoặc comment đầu file seed: nguồn JSON + mật khẩu mặc định

---

## 8. Tiêu chí chấp nhận

1. Migration seed cũ vẫn còn trong git / vẫn chạy được trên DB mới (không regress migrate); **không** còn là nguồn dữ liệu được tài liệu / reset-dev dựa vào.
2. Chạy seed một lần trên DB sạch catalog → đủ: **2 admin** (`bao@` / `phat@hui.edu.vn`) + **77 teacher** (email lấy từ `href`), **2 academic_year** + **6 semester**, 39 course, 39 room, 1560 computer, 96 nominal_class, sinh viên trong đúng band sĩ số từng loại lớp.
3. Đăng nhập được: admin với `Admin@123`, giảng viên với `Teacher@123`.
4. Hostname / location đúng mẫu (`H1.1.01` / `M01`); phần cứng / OS / status đúng §4.4.
5. Mã lớp đúng prefix × middle × postfix; `cohort_year` khớp middle.
6. MSSV 8 số, prefix năm khóa; không trùng; `full_name` do `vietnamese-name-generator` (có dấu).
7. Chạy lại seed (không `--fresh-catalog`) không tạo bản ghi trùng / không lỗi unique.

---

## 9. Ngoài phạm vi / để ngỏ

- Có seed thêm khóa 2025+ hay ngành khác → đổi spec / mở rộng bảng quy tắc.
- Gán giảng viên làm chủ lớp môn / enrollment — spec gắn catalog sau.
)
