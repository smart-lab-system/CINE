# Đọc log cài / gỡ extension VS Code — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent đọc `sharedprocess.log` của VS Code và trả sự kiện cài thành công / gỡ thành công trong ngày lịch local hiện tại.

**Architecture:** Parser thuần `parseSharedProcessLog` không đụng đĩa và không lọc ngày. `readVscodeExtensionActivity` chọn thư mục `YYYYMMDDTHHMMSS` của hôm nay, bỏ dòng lệch ngày, gộp rồi sắp xếp. Không lệnh LAN, không API.

**Tech Stack:** TypeScript, Node `fs`, Vitest. Chạy trong `apps/agent`.

**Spec:** `docs/superpowers/specs/2026-10-22-vscode-extension-activity-log-design.md`

**Ngoài phạm vi:** lệnh LAN, nút Hub, Postgres, web; suy «đang cài» từ log; Insiders / Cursor / portable; phân biệt cài mới với cập nhật; sửa file log.

---

## Global constraints

- Chỉ hai câu `[info]` thành sự kiện: `Extension installed successfully:` và `Successfully uninstalled extension from the profile`.
- `Marked extension as removed` và `Deleted marked for removal extension from disk` không thành `uninstall`. Cập nhật bản là một `install` của version mới.
- Version lần cài: `Renamed to` ghi đè; `Extracted extension to` chỉ điền khi chưa có version. Khớp bằng tiền tố `<extensionId>-`, không cắt dấu `-` cuối. Không ghép được thì `version: null`, vẫn emit.
- Version lần gỡ lấy trên dòng thành công, sau `@`.
- `profileLocation` là token nguyên văn. Không giải mã `%3A`.
- Ngày thư mục và ngày dòng log dùng lịch local (`getFullYear` / `getMonth` / `getDate`), không `toISOString()`.
- Root log không có, hoặc không có thư mục hôm nay: `ok: true`, `events` rỗng, không warning.
- Một file lỗi: bỏ file đó, `warnings` nhận `message` của lỗi đọc, file khác vẫn trả sự kiện. `readFileSync` chế độ đọc (không khóa độc quyền).
- Sắp xếp: `occurredAt` tăng dần, rồi tên thư mục, rồi thứ tự dòng (sort ổn định sau khi đã đọc thư mục theo tên).
- Không sửa `scanVscodeExtensions` hay `student-node`.

---

## File structure

| File | Task | Việc |
|---|---|---|
| `apps/agent/src/lab-mgmt/vscode-extension-activity.ts` | 1–2 | Kiểu, parser, đọc thư mục |
| `apps/agent/src/lab-mgmt/vscode-extension-activity.test.ts` | 1–2 | Chín ca của spec §8, cộng một ca thứ tự khi cùng timestamp |

---

## Task 1: Parser

**Files:** `vscode-extension-activity.ts`, `vscode-extension-activity.test.ts`

- [x] Export kiểu và `parseSharedProcessLog(text, sessionFolder)`.
- [x] Tách dòng `\n` và `\r\n`. Chỉ nhận `YYYY-MM-DD HH:mm:ss.SSS [info]`.
- [x] `Installing extension: <id>` mở lại trạng thái chờ của id (xóa version cũ).
- [x] `Renamed to` / `Extracted extension to <uri>: <id>` theo spec §4.3. Hai lần cài xen kẽ ghép theo id.
- [x] Emit install khi có dòng thành công, kể cả không có dòng version. Emit uninstall từ dòng thành công. Xóa trạng thái chờ của id sau khi emit install.
- [x] Test spec §8 mục 1–5. Mẫu §4 gồm cả dòng `Uninstalling` và `Marked extension as removed` — chúng không thêm sự kiện. Mẫu cập nhật §5 là một install `3.30.0`. Mẫu dọn đĩa là mảng rỗng.

## Task 2: Đọc thư mục hôm nay

**Files:** cùng hai file

- [x] `readVscodeExtensionActivity({ logsRoot?, now? })`. Root mặc định `join(homedir(), 'AppData', 'Roaming', 'Code', 'logs')`.
- [x] Chỉ con trực tiếp khớp `^\d{8}T\d{6}$` và 8 ký tự đầu là ngày local của `now`. Trong đó chỉ `sharedprocess.log`.
- [x] Trước khi parse, bỏ dòng có timestamp khác ngày local đó.
- [x] `filesRead` là đường dẫn tuyệt đối đã đọc được, kể cả file không có sự kiện, theo tên thư mục tăng dần.
- [x] Test spec §8 mục 6–9, với `now` cố định `2026-10-22` local. Mục 9: một `sharedprocess.log` là thư mục (đọc thất bại), file kia vẫn có sự kiện và `warnings` chứa path lỗi.
- [x] Cùng timestamp ở hai thư mục hôm nay: sự kiện xếp theo tên thư mục, trong một file giữ thứ tự dòng.

## Review focus

1. Cập nhật bản không sinh uninstall.
2. Dọn đĩa lần mở sau không sinh uninstall.
3. Lọc ngày không dùng UTC.
4. File hỏng không làm rơi sự kiện của file khác.
5. Inventory `scanVscodeExtensions` không bị đổi.
