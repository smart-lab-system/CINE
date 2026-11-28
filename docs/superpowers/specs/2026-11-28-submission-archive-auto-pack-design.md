# Design: Agent tự đóng gói bài nộp zip/rar (auto-ignore)

**Ngày:** 2026-11-28  
**Trạng thái:** implemented  
**Liên quan:** snapshot backup ([`apps/agent/src/snapshot.ts`](../../../apps/agent/src/snapshot.ts)), archive content validation, playground (cài lại deps từ lockfile/`pom.xml`)

---

## 1. Vấn đề

Deliverable `.zip`/`.rar` hiện do SV tự nén. Dễ kèm `node_modules`, `target`, `.gradle` - nặng, chậm upload, và playground cũng không dùng các thư mục đó (tự `npm ci` / Maven).

## 2. Quyết định

1. Lúc **finalize / recollect**, với mỗi deliverable đuôi `.zip` hoặc `.rar`, agent **nén lại workspace** (ghi đè file nộp) rồi mới upload.
2. Ignore theo **blocklist thư mục** (không whitelist đuôi như snapshot) để giữ đủ project.
3. `.zip` → JSZip. `.rar` → WinRAR `Rar.exe`; thiếu → deliverable `failed` với lý do rõ.
4. Playground vẫn chạy: giữ `package.json` / lockfile / `pom.xml`; deps cài lại trong Docker.

## 3. Ignore

Dùng chung `IGNORED_DIRECTORIES` (snapshot + pack), mở rộng: `.gradle`, `out`, `bin`, `.settings`, `classes`, `coverage`, `.turbo`, `.cache`, `.svn`.

Riêng pack nộp còn loại: thư mục `de-thi`, file `INSTRUCTIONS.txt`, chính file archive, và các required deliverable khác ở root.

## 4. Trần dung lượng pack

- File lẻ: 20MB  
- Tổng: 100MB  
Vượt → fail deliverable (không upload nửa vời).

## 5. Ngoài phạm vi

- Không đổi API deliverables  
- Không strip zip SV rồi upload nguyên (luôn pack từ workspace)  
- Snapshot vẫn whitelist đuôi như cũ  
