# Design: Form tạo phiên thi gọn — lịch trước, file & rubric ở Thiết lập

**Ngày:** 2026-10-18  
**Trạng thái:** implemented (create DTO vẫn giữ `requiredFilenames`/`rubricId` optional deprecated — Phase C full remove khi e2e hết caller)  
**Liên quan:**
- [exam-session-setup-edit-flow](./2026-10-18-exam-session-setup-edit-flow-design.md) — hub Thiết lập; **§5.2 / §6 bị sửa bởi spec này** (file bắt buộc không còn bất biến ngay sau create)
- [session-pinned-rubric](./2026-09-05-session-pinned-rubric-design.md) — vẫn gắn rubric vào phiên; **thời điểm gắn** chuyển sang hub, không còn lúc create
- [archive-content-validation](./2026-09-21-archive-content-validation-design.md) — shape `requiredFilenames` / entries giữ nguyên, chỉ đổi chỗ khai báo
- Nhãn UI hub: **Cấu hình thư mục bài thi** — xem [exam-folder-config-preview](./2026-10-18-exam-folder-config-preview-design.md); luật ≥ 1 deliverable trước mở **không đổi**.

---

## 1. Vấn đề

Form `/teacher/exam-sessions/new` hiện gộp hai việc khác nhau:

1. **Lên lịch ca thi** — lớp, phòng, loại kỳ, tên, khung giờ.
2. **Thiết lập đề / thu bài / chấm** — `RequiredFilenamesInput` (file bắt buộc, loại deliverable, entry trong nén) + `RubricPicker`.

Hệ quả:

- Form tạo dài, dễ bỏ sót hoặc trì hoãn tạo phiên vì còn soạn danh sách file / chọn rubric.
- Hub Thiết lập (`/teacher/exam-sessions/[id]`) đã có khối file (chỉ đọc) + rubric (sửa được) — trùng trách nhiệm với form tạo, nhưng file thì **không** sửa được trên hub.
- Spec setup-edit (§5.2, §6) cố định: *filenames bất biến sau create → muốn đổi thì huỷ + tạo lại*. Điều đó đúng khi create đã bắt buộc khai file; khi create **không** còn khai file thì luật đó phải đổi.

User yêu cầu rõ:

> Tạo phiên thi mới **chỉ** có: lớp thi, phòng thi, loại kỳ thi, tên phiên thi, thời gian bắt đầu, kết thúc.  
> **Rubric chấm điểm** và **file bắt buộc nộp** đưa vào **thiết lập**.

---

## 2. Phạm vi

### Trong phạm vi

- Thu hẹp UI + schema client form tạo (bỏ rubric + required filenames).
- Thu hẹp `CreateExamSessionDto` / `create()`: không còn bắt buộc `requiredFilenames`; không còn nhận `rubricId` từ create (hoặc nhận nhưng UI không gửi — ưu tiên bỏ khỏi DTO create để một nguồn sự thật).
- Hub Thiết lập: **chỉnh sửa** danh sách file bắt buộc khi `scheduled` (không chỉ đọc).
- Checklist mở phiên: phản ánh “đã có ≥ 1 file bắt buộc”.
- Cập nhật test create (web schema + API DTO + e2e create) và copy mô tả trang tạo / hub.
- Ghi chú override vào setup-edit-flow (một dòng “superseded by …” ở §5.2 item 3 và ma trận §6).

### Ngoài phạm vi

| Không làm | Vì sao |
|---|---|
| Cho sửa filenames sau `active` / đã freeze | Agent đã nhận deliverables lúc join; đổi sau mở = mismatch thu bài |
| Wizard nhiều bước trên form tạo | User muốn form tạo *ngắn*, không wizard |
| Gộp soạn đề (authoring) vào form tạo | Đề vẫn ở hub / materials như setup-edit |
| Đổi luật gắn rubric lúc chấm (`findActive`) | Đã giải bằng pinned rubric; chỉ đổi *khi nào* gắn |
| Sửa tên / lớp / loại kỳ sau tạo | Giữ bất biến như setup-edit |

---

## 3. Quyết định đã chốt (đề xuất mặc định)

1. **Create = identity + lịch.** Chỉ các field: lớp thi, phòng thi, loại kỳ thi, tên phiên, `startTime`, `endTime` (+ semester suy từ lớp, như hiện tại).
2. **Setup = chuẩn bị ca.** File bắt buộc + rubric (+ đề, lịch chỉnh lại) sống trên hub khi `scheduled`.
3. **Create được với 0 deliverable và không rubric.** Phiên `scheduled` “trống file” là hợp lệ tạm thời.
4. **Mở phiên yêu cầu ≥ 1 file bắt buộc.** Checklist **chặn** mở nếu chưa có deliverable (khác rubric: rubric vẫn chỉ cảnh báo). Lý do: collection phase / agent join / bảng nộp đều giả định có danh sách file; mở cửa không file = ca thi vô nghĩa.
5. **File bắt buộc mutable chỉ khi `scheduled`.** Sau `open` → bất biến (huỷ + tạo lại nếu cần đổi sau mở — vẫn đúng, nhưng hiếm vì đã có cửa sổ setup).
6. **Rubric:** giữ `PATCH …/rubric` trên hub; bỏ khỏi form tạo. Không bắt buộc trước mở (cùng setup-edit §5.4).

---

## 4. UI mục tiêu

### 4.1 Form tạo — `/teacher/exam-sessions/new`

Thứ tự field (một card):

| # | Field | Ghi chú |
|---|---|---|
| 1 | Lớp thi | Catalog lớp đang dạy; suy `semesterId` |
| 2 | Phòng thi | Catalog `roomId` |
| 3 | Loại kỳ thi | TK / GK / CK |
| 4 | Tên phiên thi | Auto từ loại + môn + lớp + HK; cho sửa bằng bút |
| 5 | Thời gian bắt đầu | `datetime-local` |
| 6 | Thời gian kết thúc | `datetime-local` |

**Bỏ khỏi form:** `RubricPicker`, `RequiredFilenamesInput` (và mọi field Zod / default liên quan).

Copy:

- Description page: *“Khai báo lớp, phòng, loại kỳ và khung giờ. File bắt buộc và rubric gắn ở bước Thiết lập sau khi tạo.”*
- Success card: CTA chính vẫn **Thiết lập phiên** (đã có từ setup-edit Phase 3).

### 4.2 Hub thiết lập — `/teacher/exam-sessions/[id]`

Khối **File bắt buộc** (thay đoạn chỉ-đọc hiện tại):

- Khi `scheduled`: form chỉnh sửa reuse `RequiredFilenamesInput` (+ archive entries / deliverableType / language) — cùng component / schema validation với form tạo cũ.
- Nút **Lưu danh sách file** → API mới (§5).
- Khi `active` | `collecting` | `completed` | `cancelled`: chỉ đọc + copy *“Danh sách đã khoá sau khi mở phiên.”*

Khối **Rubric ca thi:** giữ `RubricRow` như hiện tại (đã đúng chỗ).

Checklist (§ cập nhật setup-edit §5.4):

| Mục | Bắt buộc để mở? | UX khi thiếu |
|---|---|---|
| … (giữ các mục giờ / status) | Có | Chặn |
| **≥ 1 required deliverable** | **Có** | Chặn + “Hãy khai báo file bắt buộc trước khi mở.” |
| Có rubric | Không | Banner vàng (giữ) |
| Có đề materials | Không | Banner vàng (giữ) |

---

## 5. Backend

### 5.1 `CreateExamSessionDto` / `create()`

| Hiện tại | Mục tiêu |
|---|---|
| `requiredFilenames` `@ArrayMinSize(1)` bắt buộc | **Bỏ** field khỏi create **hoặc** `@IsOptional()` + mặc định `[]`. Ưu tiên: **bỏ khỏi create DTO** — một chỗ ghi deliverable là API setup. |
| `rubricId?` trên create | **Bỏ** khỏi create DTO; chỉ gắn qua `PATCH …/rubric`. |
| `create()` insert deliverables + optional rubric | Insert session **không** deliverable; `rubric_id = null`. |

E2E / fixture hiện gửi `requiredFilenames` lúc create → cập nhật: create rồi gọi API setup, **hoặc** tạm giữ optional trên create cho migration êm (không khuyến khích UI dùng). Khuyến nghị một giai: **optional trên create chỉ cho e2e/compat ngắn**, đánh dấu deprecated trong comment DTO; UI web không gửi.

### 5.2 API thiết lập deliverables (mới)

```
PUT /exam-sessions/:id/required-deliverables
Body: { requiredFilenames: RequiredFilenameDto[] }   // cùng shape create cũ
```

Luật:

- Chỉ khi `status === 'scheduled'` (chưa freeze). 409 / 400 nếu không.
- `@ArrayMinSize(1)` trên body PUT — không cho lưu danh sách rỗng qua setup (create được 0 file; setup lưu thì phải ≥ 1). *Ngoại lệ mở:* nếu muốn “xoá hết để soạn lại” thì cho `[]` trên PUT nhưng checklist vẫn chặn mở — mặc định spec: **PUT cũng `@ArrayMinSize(1)`** để tránh trạng thái “đã lưu rỗng” vô ý.
- Replace toàn bộ: xoá deliverables (+ entries cascade) cũ của session, insert mới trong một transaction.
- Không đổi id submission đã có (scheduled chưa có bài thật; nếu có orphan thì không xảy ra trước open).
- Validate: unique filename, archive entries, deliverableType/language — **reuse** validation hiện có của `CreateExamSessionDto.requiredFilenames` (tách shared DTO / constraint class).

Response: session detail (hoặc list deliverables) để hub refresh.

### 5.3 Rubric

Không đổi contract: `PATCH /exam-sessions/:id/rubric` (và gate grading lock) như session-pinned-rubric. Chỉ bỏ đường gắn lúc create.

### 5.4 `POST …/open`

Thêm assert: session có ≥ 1 `required_deliverable`. Nếu không → 400 với message rõ (khớp checklist UI). Giữ freeze + `scheduled → active`.

---

## 6. Ma trận chỉnh sửa (override setup-edit §6)

| Nhóm | `scheduled` | `active`+ |
|---|---|---|
| Phòng, giờ | Sửa (đã có) | Khoá |
| Đề phát | Upload / xoá | Theo rule hiện tại |
| **File bắt buộc (filenames, type, entries)** | **Sửa (PUT replace)** | **Khoá** |
| Deliverable `language` | Sửa (qua PUT hoặc PATCH language hiện có) | Theo lock grading |
| Rubric gắn phiên | Sửa | Đến grading lock |
| Tên / lớp / loại kỳ | Không | Không |
| Mở phiên | Có (≥ 1 file) | — |

---

## 7. Hành trình người dùng

```
Danh sách ──► Tạo phiên (lớp, phòng, loại, tên, giờ)
                    │
                    ▼  status = scheduled
              Hub Thiết lập
                    │
        ┌───────────┼───────────────┐
        ▼           ▼               ▼
   File bắt buộc  Rubric         Đề / lịch
   (bắt buộc      (tuỳ chọn)     (tuỳ chọn)
    trước mở)
        │
        ▼
   Checklist OK ──► Mở phiên ──► Phòng chờ / thu bài
```

---

## 8. File chính sẽ đụng

| Vùng | File |
|---|---|
| Form tạo | `apps/web/src/app/teacher/exam-sessions/new/page.tsx`, `schema.ts`, `schema.test.ts` |
| Components chuyển sang hub | `RequiredFilenamesInput`, `ArchiveEntriesField` (có thể move sang shared `_components` hoặc import từ `new/` tạm) |
| Hub | `apps/web/src/app/teacher/exam-sessions/[id]/page.tsx`, `SetupChecklist.tsx` (+ test) |
| API create | `create-exam-session.dto.ts`, `exam-session.service.ts` `create()` |
| API mới | controller + DTO `ReplaceRequiredDeliverablesDto` + service method |
| Client | `lib/api/exam-session.ts`, `hooks/useExamSession.ts` |
| E2E | mọi suite tạo phiên với `requiredFilenames` / assert create; `session-lifecycle`, `exam-session.e2e-spec`, archive-content create path |
| Docs | cập nhật 1–2 câu trong setup-edit-flow §5.2 / §6 trỏ spec này |

---

## 9. Phase thi công đề xuất

### Phase A — UI create gọn + create API nới

- Bỏ rubric / filenames khỏi form + schema web.
- `create()` cho phép 0 deliverable; bỏ/optional `rubricId` và `requiredFilenames` trên create.
- Land success → hub (đã có).
- Checklist hub: thêm chặn thiếu file (kể cả khi API open chưa assert — fail closed phía UI trước).

**Tiêu chí:** tạo phiên nhanh chỉ với lịch; hub hiện “chưa có file”; không regression list/calendar.

### Phase B — PUT deliverables trên hub

- Endpoint + transaction replace.
- Hub form lưu file; read-only sau open.
- `open` assert ≥ 1 deliverable.
- E2E: create → PUT files → open → agent thấy deliverables đúng.

**Tiêu chí:** không còn phải huỷ phiên chỉ để đổi danh sách file khi còn `scheduled`.

### Phase C — Dọn

- Deprecate/remove `requiredFilenames` / `rubricId` khỏi create DTO nếu còn optional.
- Move component shared nếu path `new/_components` gây import ngược.
- Cập nhật setup-edit-flow + comment entity/DTO.

---

## 10. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| GV tạo xong quên khai file, đến giờ mới biết | CTA land hub; checklist + `open` chặn; banner vàng trên hub khi `deliverables.length === 0` |
| E2E giả định create kèm filenames | Quét & cập nhật fixtures trong Phase A/B |
| Spec setup-edit nói “bất biến sau create” gây nhầm | Override rõ §6; copy hub đổi thành “khoá sau khi mở” |
| PUT replace xoá nhầm khi race hai tab | Transaction + chỉ `scheduled`; optimistic lock nhẹ (optional `updatedAt`) nếu cần sau |
| Compat agent / client cũ vẫn POST create có filenames | Giữ optional trên create tạm trong Phase A |

---

## 11. Tiêu chí chấp nhận

- Form tạo **không** còn UI rubric hay file bắt buộc; chỉ 6 nhóm field §4.1 (+ semester ẩn).
- Tạo thành công → `scheduled`, 0 deliverable, `rubricId = null` được phép.
- Trên hub `scheduled`: gắn/đổi rubric; lưu ≥ 1 file bắt buộc (type/entries như cũ).
- Sau `active`: không sửa được danh sách file.
- Không mở được phiên khi chưa có file (UI + API).
- Rubric thiếu: vẫn mở được, checklist cảnh báo (không đổi).
- Collection / grading / pinned-rubric không regression khi file được khai ở setup thay vì create.

---

## 12. Quyết định còn mở (không chặn Phase A)

1. Create DTO: **xoá hẳn** `requiredFilenames`/`rubricId` ngay, hay giữ optional deprecated một sprint?
2. PUT body rỗng (`[]`): cấm hay cho phép “xoá để soạn lại”?
3. Có cho sửa từng dòng (PATCH một deliverable) hay chỉ replace cả list? (Mặc định: **chỉ PUT replace** — đủ và khớp form list hiện có.)

Mặc định đang ghi trong spec: optional deprecated ngắn trên create; PUT `@ArrayMinSize(1)`; chỉ replace cả list.
