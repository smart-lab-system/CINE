# Kiểm tra CRUD — inventory & đề xuất chỉnh sửa

**Ngày:** 2026-10-12 · **Branch:** `chore/crud-audit` · **Baseline:** `main`  
**Trạng thái:** audit only — **chưa chỉnh sửa code**  
**Phạm vi:** rà soát API + UI các nhóm dữ liệu quản trị / sở hữu; đề xuất bổ sung CRUD còn thiếu hoặc lệch spec hiện có.

---

## 0. Mục tiêu

Trả lời: **nhóm dữ liệu / chức năng nào chưa đảm bảo CRUD đầy đủ** (Create · Read · Update · Delete) ở cả API lẫn UI, phân biệt rõ:

1. **Gap thật** — cần làm để vận hành quản trị.
2. **Cố ý không CRUD** — lifecycle / workflow / append-only (không đề xuất “đủ CRUD” mù).
3. **Spec đã viết nhưng chưa implement / UI chưa bắt** — ưu tiên đóng.

Không thay đổi code trong đợt audit này.

---

## 1. Cách đọc bảng

| Ký hiệu | Nghĩa |
|---|---|
| ✅ | Có đủ ở tầng đó |
| ⚠️ | Có một phần / lệch spec / chỉ một role |
| ❌ | Không có |
| — | Không áp dụng (cố ý) |

**CRUD đầy đủ** ở đây = admin/owner có thể tạo, xem, sửa, xoá (hoặc tương đương an toàn: deactivate) **qua UI hoặc API được UI dùng**, trừ khi ghi chú “cố ý”.

---

## 2. Inventory theo nhóm

### 2.1 Catalog master data (admin)

| Thực thể | API C | API R | API U | API D | UI C | UI R | UI U | UI D | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|
| `academic_year` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `/admin/master-data/academic` |
| `semester` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Nested dưới năm học (`academic/[id]`) — đủ |
| `course` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `nominal_class` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `student` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | List CRUD; trang `[id]` chỉ **đọc** + drill lớp HP |
| `room` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Teacher GET list/id (chọn phiên) |
| `computer` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |

**Kết luận:** catalog **đã đủ CRUD** API + UI. Hard delete + `ON DELETE RESTRICT` (đổi `status` thay soft-delete) khớp spec entities 2026-10-07.

**Nợ nhẹ (không chặn CRUD):**

- Trang chi tiết SV không có nút Sửa/Xoá (phải quay list) — UX, không thiếu API.
- Import Excel catalog — cố ý out of scope MVP.

---

### 2.2 Tài khoản (`account`)

| Thao tác | API | UI | Ghi chú |
|---|---|---|---|
| Create | ✅ | ✅ | |
| Read (list/search) | ✅ | ✅ | Không có `GET /accounts/:id` riêng — list đủ |
| Update | ✅ | ✅ | |
| Delete | ✅ | ✅ | FK RESTRICT khi đã có dữ liệu nghiệp vụ |
| Deactivate / reactivate | ✅ | ✅ | Đường vận hành chính khi không xoá cứng được |

**Kết luận:** **đủ** cho quản trị tài khoản.

---

### 2.3 Lớp học phần (`class` qua `/admin/course-sections`)

| Thao tác | API | UI | Ghi chú |
|---|---|---|---|
| Create | ✅ | ✅ | Mã lớp server tự sinh (`course.code` + `001…`) |
| Read list/detail | ✅ | ✅ | |
| Update meta (môn / kỳ) | ⚠️ | ❌ | API `PATCH` chỉ `courseId`/`semesterId`; **UI không gọi** |
| Update `nominalClassId` | ❌ | ❌ | Gắn lúc create; **không đổi sau** |
| Assign GV | ✅ | ✅ | |
| Unassign GV | ✅ | ❌ | API `POST …/unassign` có; **UI thiếu nút** |
| Delete lớp | ✅ | ✅ | Roster trống + không còn phiên |
| Roster add / import / remove | ✅ | ✅ | Admin + teacher (sau khi được gán) |
| Roster sửa 1 SV (đổi tên) | ❌ | ❌ | Chỉ đổi tên qua import “renamed”; không PATCH từng dòng |

Teacher `/classes`: **chỉ** list + roster — cố ý không C/U/D lớp (ownership admin).

**Kết luận:** **chưa đủ CRUD lớp học phần** ở tầng sản phẩm — API gần đủ, UI và DTO còn lỗ.

---

### 2.4 Enrollment (roster lớp)

| Thao tác | API | UI |
|---|---|---|
| Create (thêm / import) | ✅ | ✅ |
| Read | ✅ | ✅ |
| Update (sửa mssv/tên 1 dòng) | ❌ | ❌ |
| Delete | ✅ | ✅ |

**Kết luận:** **thiếu Update** đơn lẻ — sửa sai chính tả tên phải xoá+thêm hoặc import lại.

---

### 2.5 Phiên thi (`exam_session`)

> **Cập nhật 2026-10-18:** P1.2 (PATCH lịch), soft-cancel, gỡ roster manual **đã có**.
> Flow thiết lập / status `scheduled` thật: xem
> [2026-10-18-exam-session-setup-edit-flow-design.md](./2026-10-18-exam-session-setup-edit-flow-design.md)
> và plan `docs/superpowers/plans/2026-10-18-exam-session-setup-edit-flow.md`.

| Thao tác | API | UI | Ghi chú |
|---|---|---|---|
| Create | ✅ | ✅ | → `scheduled` (không còn `active` ngay) |
| Read list/detail | ✅ | ✅ | Hub thiết lập `/teacher/exam-sessions/[id]` |
| Update phòng / giờ | ✅ | ✅ | `PATCH /exam-sessions/:id` trước khi mở; hub + dialog list |
| Update rubric gắn phiên | ✅ | ✅ | Hub + grading |
| Update deliverable language | ✅ | ⚠️ | API có; UI chủ yếu lúc chuẩn bị chấm |
| Reassign teacher | ✅ | ⚠️ | Admin API |
| Soft-cancel | ✅ | ✅ | `POST …/cancel` khi `scheduled` |
| Hard-delete | ❌ | ❌ | Cố ý không làm |
| Lifecycle (open / finalize / archive…) | ✅ | ✅ | open = freeze + `active` |

**Con phụ thuộc phiên:**

| Thực thể | C | R | U | D | Ghi chú |
|---|---|---|---|---|---|
| Exam materials | ✅ | ✅ | — | ✅ | Hub + lobby |
| Required deliverables | ✅ (lúc tạo) | ✅ | ⚠️ (language) | ❌ | Không sửa danh sách file sau tạo |
| Session roster | ✅ freeze + add manual | ✅ | — | ✅ manual | Gỡ chỉ `source=manual` + điều kiện an toàn |

**Kết luận:** workflow object; gap còn lại chủ yếu là hard-delete (không làm) và chỉnh sâu deliverables (cố ý không).

---

### 2.6 Rubric & bảng lỗi

| Thực thể | C | R | U | D | Ghi chú |
|---|---|---|---|---|---|
| Rubric (+ criteria) | ✅ | ✅ | ⚠️ | ❌ | “Sửa” = `POST /rubrics` tạo **phiên bản mới**; không xoá rubric |
| Rubric errors | ✅ | ✅ | ✅ | ✅ | UI Rules đầy đủ hơn |
| Criterion waiver | ✅ | ✅ | — | ⚠️ revoke | Không hard-delete |
| Error rules (global proposals…) | ⚠️ | ✅ | ✅ | ⚠️ | Workflow chấm — không coi catalog |

**Kết luận:** rubric **cố ý versioned** (không in-place update / không delete). Gap thật chỉ nếu sản phẩm cần **xoá rubric nháp chưa gắn phiên**.

---

### 2.7 Admin vận hành (placeholder)

| Trang / entity | DB entity | API CRUD | UI |
|---|---|---|---|
| Cấu hình AI | `grading_pipeline_config` | ❌ | Placeholder |
| Chi phí | `cost_budget` | ❌ | Placeholder |
| Audit log | `audit_log` | ❌ list API public | Placeholder (service ghi nội bộ) |

**Kết luận:** **chưa có CRUD/read admin** — nav tồn tại nhưng trang trống. Đây là gap sản phẩm rõ, khác master data.

---

### 2.8 Nhóm cố ý không phải CRUD catalog

Không đề xuất “bổ sung DELETE đầy đủ” trừ khi có yêu cầu nghiệp vụ riêng:

- Submission, grading result, grade export, test bundle, access request, agent connection, calibration, AI usage — append / lifecycle / review.
- Auth (login/refresh/logout).

---

## 3. Gap ưu tiên (đề xuất chỉnh sửa)

### P0 — Đóng lệch spec / API có sẵn nhưng UI thiếu

| # | Việc | Lý do | Đề xuất |
|---|---|---|---|
| P0.1 | UI **gỡ phân công GV** trên chi tiết lớp HP | API `POST …/unassign` đã có; admin gán nhầm không gỡ được trên UI | Nút “Gỡ phân công” khi `teacherId` set và chưa có phiên; toast lỗi 409 khi có phiên |
| P0.2 | UI **sửa meta lớp** (môn / học kỳ) khi còn mutable | API `PATCH` đã có; tạo sai môn/kỳ phải xoá lớp | Form sửa trên detail; disable + giải thích khi đã có roster/phiên |
| P0.3 | Mở rộng `UpdateCourseSectionDto` + UI: **`nominalClassId`** (nullable / đổi / gỡ) | Chỉ set lúc create — sai gắn lớp danh nghĩa không sửa được | PATCH cho phép `nominalClassId: uuid \| null`; không đụng enrollment |

### P1 — CRUD vận hành còn thiếu thật

| # | Việc | Lý do | Đề xuất |
|---|---|---|---|
| P1.1 | `PATCH` enrollment: sửa `student_name` (và optionally resolve lại `student_id`) | Sai chính tả tên hay gặp; xoá+thêm mất ngữ cảnh | `PATCH …/roster/students/:mssv` body `{ name }` — **không** đổi mssv (đổi mssv = xoá+thêm) |
| P1.2 | `PATCH /exam-sessions/:id` hẹp: đổi phòng/giờ trước mở | **Đã xong** (API + UI list/hub) | — |
| P1.3 | Huỷ phiên nháp | **Soft-cancel** đã có (`POST …/cancel`); hard-delete cố ý không | — |
| P1.4 | Xoá SV khỏi session roster (manual) | **Đã xong** | — |

### P2 — Admin placeholder & rubric dọn

| # | Việc | Lý do | Đề xuất |
|---|---|---|---|
| P2.1 | API + UI **đọc** audit log | Nav + CLAUDE.md yêu cầu log; trang trống | `GET /admin/audit-log` (filter, phân trang) — **không** cần Update/Delete (append-only) |
| P2.2 | CRUD tối thiểu `grading_pipeline_config` / `cost_budget` **hoặc** ẩn nav | Tránh nav chết | Ưu tiên: ẩn nav đến khi có spec riêng; hoặc MVP read/update global config |
| P2.3 | Xoá rubric chưa từng gắn phiên | Rác rubric nháp | `DELETE /rubrics/:id` khi không có `exam_session.rubric_id` / grading_result — optional |

### P3 — Không làm (ghi nhận)

| Hạng mục | Lý do giữ nguyên |
|---|---|
| Teacher tạo/xoá lớp HP | Ownership admin — đã cắt cố ý |
| Soft-delete toàn cục catalog | Spec dùng hard delete + status |
| In-place edit rubric criteria | Versioned by design |
| CRUD submission / grading result | Workflow chấm |
| Cascade đổi tên catalog → enrollment/session snapshot | Snapshot cố ý không cascade |

---

## 4. Ma trận tóm tắt “đã đủ CRUD?”

| Nhóm | Đủ CRUD? | Hành động |
|---|---|---|
| Master data catalog (7 bảng) | **Có** | Giữ; chỉ polish UX nếu cần |
| Accounts | **Có** (+ deactivate) | Giữ |
| Lớp học phần (admin) | **Chưa** | P0.1–P0.3 |
| Enrollment | **Chưa** (thiếu U) | P1.1 |
| Exam session | **Không** (workflow; thiếu U/D vận hành) | P1.2–P1.4 |
| Session roster | **Chưa** (thiếu D manual) | P1.4 |
| Rubric | **Cố ý versioned** | P2.3 optional |
| Rubric errors | **Có** | Giữ |
| AI config / Cost / Audit UI | **Chưa** | P2.1–P2.2 |

---

## 5. Đề xuất thứ tự implement (khi được duyệt)

1. **Wave A (P0)** — chỉ UI + mở rộng PATCH lớp HP (`nominalClassId`, form sửa, unassign). Ít rủi ro, API gần sẵn.
2. **Wave B (P1.1)** — PATCH tên enrollment.
3. **Wave C (P1.2–P1.4)** — sửa/huỷ phiên + gỡ roster manual; cần thiết kế conflict + guard trạng thái (spec riêng hoặc mở rộng file này trước khi code).
4. **Wave D (P2)** — audit log read-only; quyết định ẩn vs build AI/cost.

Mỗi wave: cập nhật OpenAPI/client, e2e tối thiểu, không đụng grading pipeline.

---

## 6. Tiêu chí chấp nhận (sau khi implement — chưa áp dụng hôm nay)

- Admin tạo sai lớp HP: sửa môn/kỳ (khi trống), đổi/gỡ lớp danh nghĩa, gỡ GV khi chưa có phiên — **không** cần xoá lớp.
- Admin/teacher sửa sai tên SV trên roster lớp bằng PATCH một dòng.
- Teacher đổi phòng phiên chưa mở mà không tạo phiên mới.
- Teacher/admin xoá được phiên nháp an toàn.
- Không regression: catalog CRUD, chấm điểm, agent join, freeze roster.

---

## 7. Tham chiếu

- `docs/superpowers/specs/2026-10-07-master-data-entities-design.md`
- `docs/superpowers/specs/2026-10-07-admin-course-section-design.md`
- `docs/superpowers/specs/2026-10-07-sync-master-data-schema-design.md`
- Controllers: `master-data.controllers.ts`, `admin-course-section.controller.ts`, `class.controller.ts`, `exam-session.controller.ts`, `accounts.controller.ts`, `grading.controller.ts`
- UI nav: `apps/web/src/lib/nav-config.ts`

---

## 8. Quyết định cần chủ đồ án (trước khi code)

1. Phiên thi: có cần **huỷ/xoá nháp** và **đổi phòng/giờ** không, hay chấp nhận tạo phiên mới?
2. Session roster: có cho **gỡ SV thêm tay** không?
3. Trang AI / Cost / Audit: **build** hay **ẩn khỏi nav** tạm thời?
4. Rubric: có cần **xoá bản nháp** không?
