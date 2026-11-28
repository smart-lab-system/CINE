# Design: Một gói nộp zip/rar + kiểm file bên trong

**Ngày:** 2026-11-28  
**Trạng thái:** implemented  
**Liên quan:** archive content validation, auto-pack submission archives, hub Thư mục bài làm

---

## 1. Vấn đề

Hub cho khai nhiều file phải nộp (file lẻ + zip/rar). Sau auto-pack, mô hình đúng với “nộp thư mục bài làm” là **một gói nén**; nhiều deliverable / file lẻ làm rối và dễ lệch với agent đóng gói.

## 2. Quyết định

1. Mỗi phiên **đúng 1** required deliverable khi lưu từ hub (`PUT …/required-deliverables`).
2. Tên file **phải** kết thúc `.zip` hoặc `.rar`.
3. Mặc định form: `{SOMAY}_{MSSV}_{HOTEN}.zip`.
4. **Kiểm file bên trong** (`entries`) tuỳ chọn - luôn hiện trên UI.
5. Agent auto-pack workspace vào đúng đuôi đã khai (đã có).

## 3. Ngoài phạm vi

- Không migrate phiên cũ hàng loạt (nhiều file / file lẻ) - lần lưu lại bước folder phải khớp luật mới.
- Không đổi archive-check / đáp án mẫu gói.
