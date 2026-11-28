# Design: Thư mục làm bài stem + nén nội dung lúc thu

**Ngày:** 2026-11-28  
**Trạng thái:** implemented  
**Liên quan:** single-archive deliverable, auto-pack submission archives

---

## 1. Quyết định

1. Lúc join: tạo thư mục `exam-workspace/<MSSV>/<stem>/` với `stem` = tên gói bỏ `.zip`/`.rar`.
2. Entries (Kiểm file bên trong): tạo file rỗng trong folder (`wx`, không đè).
3. Không tạo placeholder gói `.zip`/`.rar` ở root lúc join.
4. Lúc finalize/recollect: nén **chỉ nội dung** trong stem → ghi đè file gói ở root workspace. Trong archive **không** có lớp folder bọc.

## 2. Ngoài phạm vi

- Archive-check server (basename) không đổi.
- Snapshot backup vẫn quét cả workspace.
