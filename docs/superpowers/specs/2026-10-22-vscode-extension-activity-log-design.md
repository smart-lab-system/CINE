# Đọc log cài / gỡ extension VS Code

**Ngày:** 2026-10-22
**Trạng thái:** implemented (`docs/superpowers/plans/2026-10-22-vscode-extension-activity-log.md`)
**Ứng dụng:** `apps/agent` (máy lab Windows)
**Liên quan:** [lab-management-ide-extensions](./2026-10-18-lab-management-ide-extensions-design.md) — quét inventory thư mục `extensions/` (`SCAN_VSCODE_EXTENSIONS`). Spec này không thay quét đó.

---

## 1. Vấn đề

Quét thư mục `~/.vscode/extensions` chỉ trả về extension **đang nằm trên đĩa** lúc bấm quét. Sinh viên có thể cài extension trong buổi, rồi gỡ trước khi giảng viên quét. Inventory sau đó sạch, dù thao tác đã xảy ra.

VS Code ghi thao tác đó vào log của shared process. Mỗi lần mở VS Code tạo một thư mục phiên mới:

```
%APPDATA%\Code\logs\<YYYYMMDDTHHMMSS>\sharedprocess.log
```

Ví dụ trên máy lab: `C:\Users\oeb\AppData\Roaming\Code\logs\20261022T171030\sharedprocess.log`.

Tên thư mục là giờ local lúc process khởi động, dạng `YYYYMMDDTHHMMSS` (không gạch, có chữ `T`). Một ngày có nhiều thư mục nếu VS Code được mở nhiều lần. File được ghi tiếp khi VS Code còn mở.

Cần một hàm đọc các file đó và trả về danh sách sự kiện **cài thành công** và **gỡ thành công**. Mặc định chỉ xét thư mục của ngày lịch local hiện tại.

---

## 2. Phạm vi

### Trong phạm vi

- Hàm thuần trong `apps/agent`: chọn thư mục log của hôm nay, đọc `sharedprocess.log`, trả sự kiện.
- Parser tách khỏi đọc đĩa, để test bằng chuỗi log cố định.
- Unit test với mẫu cài/gỡ ở §4 và với mẫu cập nhật / dọn đĩa ở §5.

### Ngoài phạm vi

| Không làm | Vì sao |
|---|---|
| Lệnh LAN mới, nút trên Teacher Hub, bảng Postgres, API, trang web | Inventory và allowlist đã có đường riêng. Spec này chỉ tạo nguồn sự kiện. |
| Suy ra «đang cài» từ log | Log không đủ: extension cài hôm qua không có dòng hôm nay. Inventory trên đĩa vẫn là nguồn đó. |
| Gộp cài rồi gỡ cùng một extension thành một dòng | Giữ từng sự kiện theo thời gian. Người đọc tự thấy chuỗi. |
| VS Code Insiders, VSCodium, Cursor, bản portable | Root log khác (`Code - Insiders`, …). v1 chỉ `%APPDATA%\Code\logs`. |
| Phân biệt cài mới, cập nhật, migrate | Dòng thành công giống nhau. JSON `operation` trên dòng `Installing extension` không dùng làm hợp đồng. |
| Xóa hoặc sửa file log | Chỉ đọc. |

---

## 3. Quyết định đã chốt

1. **Chỉ hai dòng info là sự kiện.** Cài: `Extension installed successfully:`. Gỡ: `Successfully uninstalled extension from the profile`. Mọi dòng khác bỏ qua, kể cả dòng có chữ extension.
2. **`Marked extension as removed` và `Deleted marked for removal extension from disk` không phải gỡ.** Hai câu này còn xuất hiện khi cập nhật (đánh dấu bản cũ) và khi lần mở sau xóa thư mục đã đánh dấu. Đếm chúng sẽ ghi nhận gỡ giả, hoặc ghi nhận lại lần gỡ của một phiên trước.
3. **Ngày lọc theo tên thư mục, giờ local của máy.** Thư mục được xét khi tên khớp `^\d{8}T\d{6}$` và 8 ký tự đầu bằng `YYYYMMDD` của `now` theo lịch local. Không dùng `toISOString()`: ngày UTC lệch với lịch Việt Nam từ 00:00 đến 06:59.
4. **Trong file đã chọn, bỏ dòng có ngày timestamp khác ngày đó.** Cửa sổ mở lúc 23:50 và viết tiếp sau 00:00 không được tính sang ngày mới. Ngược lại, cửa sổ mở từ hôm qua vẫn ghi vào thư mục hôm qua — mặc định không đọc. Đây là giới hạn đã chấp nhận.
5. **Nhiều thư mục trong ngày thì đọc hết**, gộp một danh sách, sắp theo timestamp tăng dần. Cùng timestamp thì theo tên thư mục rồi thứ tự dòng.
6. **Thiếu root log, hoặc hôm nay không có thư mục, là kết quả rỗng thành công.** Máy chưa mở VS Code hôm nay không phải lỗi quét.
7. **Một file không đọc được thì bỏ file đó**, ghi `warnings`, các file khác vẫn trả sự kiện. Không khóa file: mở đọc chia sẻ, VS Code có thể đang append.
8. **Version của lần cài lấy từ dòng `Renamed to` (ưu tiên) hoặc `Extracted extension to` cùng `extensionId`**, nằm sau `Installing extension: <id>` và trước dòng cài thành công của id đó. Không cắt folder theo dấu `-` cuối: id dạng `firefox-devtools.vscode-firefox-debug`, version là phần sau tiền tố `id-`. Không ghép được thì vẫn trả sự kiện với `version: null`.
9. **Version của lần gỡ nằm trên chính dòng thành công**, sau `@`.
10. **`profileLocation` lưu nguyên token** trên dòng thành công (URI `vscode-userdata:…`). Không giải mã `%3A`, không lọc theo profile.

---

## 4. Dòng được tính

Khung mỗi dòng:

```
YYYY-MM-DD HH:mm:ss.SSS [info] <message>
```

Chỉ xét level `info`. Encoding UTF-8. Ngắt dòng `\n` hoặc `\r\n`.

### 4.1 Cài thành công

```
2026-10-22 17:10:48.371 [info] Extension installed successfully: christian-kohler.npm-intellisense vscode-userdata:/c%3A/Users/oeb/.vscode/extensions/extensions.json
```

| Trường | Cách lấy |
|---|---|
| `action` | `install` |
| `occurredAt` | `2026-10-22 17:10:48.371` |
| `extensionId` | token ngay sau dấu `:` và khoảng trắng, đến trước khoảng trắng kế. `publisher.name`, không chứa khoảng trắng hay `@`. |
| `profileLocation` | token còn lại, hoặc `null` nếu dòng hết sau id |
| `version` | xem §4.3 |

Dòng `Installing extension:`, `Getting Manifest`, `Extension signature verification`, `Extracted`, `Renamed to` không tự thành sự kiện.

### 4.2 Gỡ thành công

```
2026-10-22 17:11:06.139 [info] Successfully uninstalled extension from the profile firefox-devtools.vscode-firefox-debug@2.15.0 vscode-userdata:/c%3A/Users/oeb/.vscode/extensions/extensions.json
```

| Trường | Cách lấy |
|---|---|
| `action` | `uninstall` |
| `occurredAt` | timestamp đầu dòng |
| `extensionId` | token đầu sau cụm `profile `, cắt tại `@` |
| `version` | phần sau `@` đến trước khoảng trắng |
| `profileLocation` | token còn lại, hoặc `null` |

`Uninstalling extension from the profile:` chỉ là bước bắt đầu. Không emit khi thiếu dòng `Successfully uninstalled`.

### 4.3 Version cho lần cài

Các dòng phụ, cùng file, cùng `extensionId`:

```
[info] Installing extension: christian-kohler.npm-intellisense {…json…}
[info] Extracted extension to file:///c%3A/Users/oeb/.vscode/extensions/christian-kohler.npm-intellisense-1.4.5: christian-kohler.npm-intellisense
[info] Renamed to c:\Users\oeb\.vscode\extensions\christian-kohler.npm-intellisense-1.4.5
[info] Extension installed successfully: christian-kohler.npm-intellisense …
```

Quy tắc ghép:

- `Installing extension: <id>` mở (hoặc mở lại) một lần cài đang chờ cho `id`.
- `Renamed to <path>`: tên thư mục cuối path bắt đầu bằng `<id>-` thì version là phần còn lại. Ghi đè version đang chờ của `id`.
- `Extracted extension to <uri>: <id>` chỉ điền version khi lần cài đang chờ của `id` chưa có version. Tên thư mục lấy từ segment cuối của URI (cắt query nếu có), rồi cùng quy tắc tiền tố `<id>-`.
- `Extension installed successfully: <id>` emit rồi xóa trạng thái chờ của `id`.
- Hai lần cài có thể xen kẽ (nhiều dòng `Installing` trước khi dòng thành công nào xuất hiện). Ghép theo `extensionId`, không theo «dòng Renamed gần nhất bất kể id».

Mẫu §4.1 và §4.2 trong cùng một file phải ra đúng bốn sự kiện, đúng version:

| occurredAt | action | extensionId | version |
|---|---|---|---|
| 2026-10-22 17:10:48.371 | install | christian-kohler.npm-intellisense | 1.4.5 |
| 2026-10-22 17:10:49.413 | install | firefox-devtools.vscode-firefox-debug | 2.15.0 |
| 2026-10-22 17:11:06.139 | uninstall | firefox-devtools.vscode-firefox-debug | 2.15.0 |
| 2026-10-22 17:11:08.045 | uninstall | christian-kohler.npm-intellisense | 1.4.5 |

---

## 5. Dòng không được tính

Cập nhật bản (rút từ log thật `20261022T170114`). Có `Extension installed successfully` — đó là một sự kiện **install** của bản mới. Không có sự kiện uninstall:

```
[info] Installing extension: usernamehw.errorlens {…"operation":3…}
[info] Extracted extension to file:///…/usernamehw.errorlens-3.30.0: usernamehw.errorlens
[info] Renamed to c:\Users\oeb\.vscode\extensions\usernamehw.errorlens-3.30.0
[info] Marked extension as removed usernamehw.errorlens-3.29.0
[info] Extension installed successfully: usernamehw.errorlens vscode-userdata:/…
```

Kỳ vọng: một `install`, version `3.30.0`. Không có `uninstall` cho `3.29.0`.

Dọn đĩa ở lần mở sau (thư mục `20261022T170325`), sau khi gỡ đã được ghi ở thư mục khác:

```
[info] Marked extension as removed amazonwebservices.aws-toolkit-vscode-4.17.0
[info] Deleted marked for removal extension from disk amazonwebservices.aws-toolkit-vscode c:\Users\oeb\.vscode\extensions\amazonwebservices.aws-toolkit-vscode-4.17.0
```

Kỳ vọng: không sự kiện. Lần gỡ thật đã nằm ở dòng `Successfully uninstalled…` của phiên trước; nếu phiên đó thuộc hôm nay thì dòng đó được đếm một lần, dòng dọn đĩa không đếm thêm.

Dòng `[error]` nhắc đường dẫn extension (ví dụ `engines.vscode`) bỏ qua.

---

## 6. Chọn file

Root mặc định, Windows:

```
join(homedir(), 'AppData', 'Roaming', 'Code', 'logs')
```

Chỉ con trực tiếp của root. Trong mỗi thư mục phiên đã chọn, chỉ file `sharedprocess.log`. Không đệ quy vào `exthost*` hay thư mục khác.

`now` tiêm được từ ngoài để test. So khớp ngày:

```
const y = now.getFullYear();
const m = String(now.getMonth() + 1).padStart(2, '0');
const d = String(now.getDate()).padStart(2, '0');
const today = `${y}${m}${d}`;
```

Thư mục `20261018T110133` bị bỏ khi `now` là 2026-10-22. `20261022T170114` và `20261022T171030` đều được đọc.

Thứ tự đọc thư mục: tên tăng dần (tên đã là thời điểm mở).

---

## 7. Hợp đồng hàm

Đặt tại `apps/agent/src/lab-mgmt/vscode-extension-activity.ts`. Test cạnh file: `vscode-extension-activity.test.ts`. Không import Electron.

```ts
export type ExtensionActivityAction = 'install' | 'uninstall';

export interface ExtensionActivityEvent {
  action: ExtensionActivityAction;
  /** Đúng chuỗi trong log, giờ local, `YYYY-MM-DD HH:mm:ss.SSS`. */
  occurredAt: string;
  extensionId: string;
  version: string | null;
  /** Tên thư mục phiên, ví dụ `20261022T171030`. */
  sessionFolder: string;
  profileLocation: string | null;
}

export interface ExtensionActivityReadResult {
  ok: true;
  events: ExtensionActivityEvent[];
  filesRead: string[];
  warnings: { path: string; message: string }[];
}

/** Parser thuần. `sessionFolder` gắn vào mỗi sự kiện. */
export function parseSharedProcessLog(
  text: string,
  sessionFolder: string,
): ExtensionActivityEvent[];

export function readVscodeExtensionActivity(options?: {
  logsRoot?: string;
  now?: Date;
}): ExtensionActivityReadResult;
```

`parseSharedProcessLog` không lọc theo ngày. `readVscodeExtensionActivity` lọc thư mục và dòng theo §3.3 và §3.4, rồi sắp xếp theo §3.5.

`filesRead` là đường dẫn tuyệt đối của từng `sharedprocess.log` đã đọc được, kể cả file không có sự kiện. `warnings[].message` là message của lỗi đọc (`ENOENT` sau khi thư mục biến mất, `EPERM`, …).

Không trả `ok: false`. Root không tồn tại → `filesRead` rỗng, `events` rỗng, không warning.

---

## 8. Test bắt buộc

1. Chuỗi mẫu §4 (cài npm-intellisense, cài firefox-debug, gỡ firefox-debug, gỡ npm-intellisense) → đúng bốn sự kiện, đúng version, đúng thứ tự.
2. Chuỗi cập nhật §5 → một install `usernamehw.errorlens` `3.30.0`, không uninstall.
3. Chuỗi dọn đĩa §5 → không sự kiện.
4. Hai lần `Installing` xen kẽ trước khi có dòng thành công → mỗi install nhận đúng version của id mình.
5. Dòng cài thành công không có `Renamed`/`Extracted` trước đó → vẫn emit, `version: null`.
6. `readVscodeExtensionActivity` với root tạm: một thư mục hôm qua có dòng gỡ, một thư mục hôm nay có dòng cài → chỉ sự kiện hôm nay; `filesRead` một phần tử.
7. Thư mục hôm nay có dòng timestamp ngày hôm sau → dòng đó bị bỏ.
8. Root không tồn tại → `events` rỗng, `ok: true`.
9. Một file trong ngày không đọc được (mock / thư mục là file) → sự kiện từ file kia vẫn có, `warnings` có path lỗi.
