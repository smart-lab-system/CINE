# Design: Thiết lập phiên thi - 5 bước + đáp án mẫu gói

**Ngày:** 2026-11-18  
**Trạng thái:** implemented  
**Liên quan:**
- [exam-session-setup-stepper](./2026-10-22-exam-session-setup-stepper-design.md) - khung stepper gốc
- [exam-session-setup-edit-flow](./2026-10-18-exam-session-setup-edit-flow-design.md)
- grading-reference (đáp án mẫu dưới prefix `grading-reference/`)

---

## 1. Vấn đề

Stepper hub Thiết lập gộp **Đề & thư mục** và tách **Rubric** riêng. Giảng viên muốn:

1. Thông tin chung  
2. Danh sách thí sinh  
3. Thư mục bài làm  
4. Đề thi & Rubric (Đề thi + Rubric + Đáp án mẫu tuỳ chọn)  
5. Xác nhận  

Đáp án mẫu hiện chỉ upload **một file** qua `answer-key`; cần nhận **file / thư mục / zip** mà vẫn không lộ qua `listForAgent`.

---

## 2. Phạm vi

### Trong phạm vi

- Đổi id/nhãn bước và mount UI theo bảng §3.
- Gói đáp án mẫu: client chuẩn hoá folder → zip; một object trên kho; cột `model_answer_package_kind`.
- `loadForGrading`: zip → text bundle vào prompt; file đơn giữ đường cũ khi PDF.
- Cùng UI gói trên bước setup và `ReferenceForm` (chuẩn bị chấm).

### Ngoài phạm vi

| Không làm | Vì sao |
|---|---|
| Multi-object extract + `tree.json` (kiểu VSIX) | Không cần cho lần này; một blob đủ |
| Multipart đáp án mẫu qua Nest | Security rule 5 - byte qua presigned |
| Đổi `model_answer_source_*` (mã chạy thử) | Kênh riêng |
| Wizard form Tạo phiên | Vẫn slim |

---

## 3. Các bước

| # | `step` | Nhãn | Nội dung |
|---|---|---|---|
| 1 | `info` | Thông tin chung | Như hiện tại |
| 2 | `roster` | Danh sách thí sinh | Roster (đổi nhãn) |
| 3 | `folder` | Thư mục bài làm | `RequiredDeliverablesEditor` / preview |
| 4 | `exam` | Đề thi & Rubric | Đề (`ExamMaterialsCard` + nút **Thiết lập đề thi** → modal tìm/lọc → modal xác nhận, xuất Word gắn material) · Rubric (`RubricRow` + **Thiết lập rubric** → modal tìm/lọc loại QA/QS + kỳ → xác nhận) · Đáp án mẫu (gói) |
| 5 | `review` | Xác nhận | Tóm tắt theo 5 bước; checklist; Mở phiên |

**Alias query:** `materials` → `exam`, `rubric` → `exam`, `schedule` → `info`. `folder` là id thật.

**Dirty:** `folder` ← draft folder; `exam` ← materials pending | rubricChoice | đáp án mẫu pending.  
**Lỗi Hoàn tất (thư mục):** step `folder`. Rubric API error → step `exam`.

Đáp án mẫu **không** chặn mở phiên / hoàn tất.

---

## 4. Đáp án mẫu gói

### Upload

1. UI: chọn File, Thư mục (`webkitdirectory`), hoặc Zip.  
2. Thư mục → nén JSZip phía browser (`dap-an-mau.zip` hoặc tên thư mục + `.zip`).  
3. `POST …/answer-key-upload` → PUT kho → `PUT …/grading-reference` với `modelAnswerStorageKey` + `modelAnswerFilename`.  
4. Server suy `model_answer_package_kind`: `.zip` → `zip`, còn lại → `file`.  
5. Khoá cố định `grading-reference/{sessionId}/answer-key` (giữ tương thích attach-exam).

### Chấm

- `file` + PDF: document block như cũ.  
- `file` khác: `extractText` → text trong prompt.  
- `zip`: giải nén an toàn (`yauzl`, trần file/size, chống zip-slip) → `<model_answer_files>` trong grader prompt.

Backfill: row có `model_answer_storage_key` → `package_kind = file`.

---

## 5. Tương thích

- Attach-exam ghi DOCX vào `answer-key` → `kind=file`.  
- Prefix `grading-reference/` không đổi.  
- Bookmark `?step=materials` / `?step=rubric` mở bước `exam`.
