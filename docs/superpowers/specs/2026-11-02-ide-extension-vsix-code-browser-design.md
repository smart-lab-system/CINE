# VSIX Code Browser (GitHub-style) — thiết kế

**Ngày:** 2026-11-02 · **Trạng thái:** implementing (`docs/superpowers/plans/2026-11-02-ide-extension-vsix-code-browser.md`)  

**Ứng dụng:** `apps/api` (NestJS / TypeORM / BullMQ) + `apps/web` (admin/teacher catalog browse)  
**Builds on:** [`2026-11-02-ide-extension-vsix-storage-sync-design.md`](./2026-11-02-ide-extension-vsix-storage-sync-design.md) (artifact `.vsix` trên Storage, `confirm-artifact`, Security rule 5); object storage S3-compatible (`StorageService`); pattern queue [`archive-check`](../../apps/api/src/submission/archive-check/)  
**Nguồn chốt:** plan hội thoại «VSIX Code Browser» (2026-11-02) — surface **route riêng (1C)**; unpack **async Worker (2B)**; Direct Preview qua Presigned GET  
**Implementation plan:** [`docs/superpowers/plans/2026-11-02-ide-extension-vsix-code-browser.md`](../plans/2026-11-02-ide-extension-vsix-code-browser.md)

---

## 0. Vì sao có thay đổi này

Đợt sync VSIX đã đưa binary phiên bản lên object storage và hiện badge **«Đã có file»** trên catalog detail. Admin/teacher cần **xem nội dung bên trong** `.vsix` (manifest, `package.json`, source…) trước khi Approve — đặc biệt với phiên bản `pending` / chưa duyệt.

Thiếu: giao diện kiểu GitHub Code Browser (Tree + Breadcrumbs + File List + Viewer) và pipeline giải nén an toàn. Không được stream bytes archive hoặc file con qua Nest controller; client chỉ nhận metadata / Presigned URL.

---

## 1. Phạm vi

### 1.1 Trong phạm vi

| Hạng mục | Ghi chú |
|---|---|
| Trigger extract sau `confirm-artifact` | `extract_status=pending` + enqueue BullMQ |
| Worker giải nén `.vsix` → prefix `extracted/` + `tree.json` | Zip Slip + Zip Bomb; `yauzl` |
| API browse (metadata + Presigned GET file) | Không trả body archive/file |
| Retry / backfill extract | `POST .../extract` khi `none` / `failed` và đã có `storage_key` |
| Web route Code Browser | Split-pane: Tree, Breadcrumbs, File List, File Viewer |
| Entry từ catalog detail | Version chưa `approved` + đã có file → link `/browse` |
| Expose `extractStatus` trên version view | Badge «Đang giải nén» / «Sẵn sàng xem» / lỗi |

### 1.2 Ngoài phạm vi

- Đổi luồng Direct Upload Hub (ensure → PUT → confirm) — giữ nguyên.
- Auto-approve khi extract `ready`.
- Edit / upload / xóa file trong browser.
- Diff giữa hai phiên bản.
- Nút tải nguyên `.vsix` (có thể thêm sau bằng Presigned GET trên `storage_key`).
- Monaco / CodeMirror / Shiki / allotment / react-arborist đợt 1.
- Unpack `.vsix` phía browser (`jszip` / `fflate`).
- SDK vendor MinIO / Supabase riêng; migrate object giữa môi trường.

---

## 2. Quyết định đã chốt

| # | Quyết định | Chi tiết |
|---|---|---|
| 1 | Surface UI | Route riêng: `/admin/ide-utilities/[id]/versions/[versionId]/browse` (và teacher re-export nếu dùng chung detail) |
| 2 | Unpack | Async: Nest enqueue → Worker `getObject` `.vsix` → `putObject` từng entry + `tree.json` |
| 3 | Bytes qua Nest | **Cấm** controller trả body archive hoặc file con. Worker được `getObject` / `putObject`. Browse tree: API trả JSON index (đọc `tree.json` trong service). File content: chỉ Presigned GET |
| 4 | Object layout | Giữ `ide-extensions/{extensionPk}/{versionId}.vsix`. Extracted: `ide-extensions/{extensionPk}/{versionId}/extracted/{relativePath}`; index: `.../extracted/tree.json` |
| 5 | DB | Cột extract trên `ide_extension_version` — **không** bảng từng entry |
| 6 | Tree shape | Nested `root[]` (`type: file\|dir`, `children` cho dir) — một nguồn cho Tree / Breadcrumbs / File List |
| 7 | Preview GET | `ResponseContentType: application/octet-stream` (chống XSS storage); client `fetch` + decode text |
| 8 | Ai được browse | JWT `teacher` \| `admin`; version phải có `storage_key`. UI ưu tiên deep-link từ bản chưa `approved` |
| 9 | Trigger | Sau confirm thành công → enqueue; `jobId` idempotent; skip nếu đã `ready`; `POST extract` cho retry/backfill |
| 10 | Zip limits | Archive ≤ 100MB; ≤ 10_000 entries; tổng uncompressed ≤ 500MB; 1 file ≤ 20MB; chặn `..`, absolute, null byte; normalize `\` → `/` |
| 11 | Thư viện ZIP | **`yauzl`** (đã có) — lazy + `validateEntrySizes`. Không `adm-zip` / `unzipper`. Không dùng `jszip` cho extract production |
| 12 | Thư viện FE | React + Tailwind hiện có; viewer monospace. Không thêm editor/split lib đợt 1 |
| 13 | Queue | Queue riêng `ide-extension-extract` — không trộn `GRADING_QUEUE` / `ARCHIVE_CHECK_QUEUE` |
| 14 | Storage vendor | Chỉ `StorageService` + `STORAGE_*` (MinIO local ↔ Supabase prod) |

---

## 3. Luồng

```mermaid
sequenceDiagram
  participant Client as WebOrHub
  participant API as NestController
  participant Q as BullMQ
  participant W as ExtractWorker
  participant S3 as ObjectStorage

  Note over Client,S3: Phase A — Direct Upload (đã có; tái dùng)
  Client->>API: ensure-artifacts / upload URL
  API-->>Client: uploadUrl + storageKey
  Client->>S3: Presigned PUT .vsix
  Client->>API: confirm-artifact
  API->>API: storage_key + extract_status=pending
  API->>Q: enqueue extract job
  API-->>Client: version view no bytes

  Note over W,S3: Phase B — Async Extraction
  Q->>W: job versionId
  W->>S3: getObject .vsix
  W->>W: ZipSlip + ZipBomb
  W->>S3: putObject entries + tree.json
  W->>W: extract_status ready or failed

  Note over Client,S3: Phase C — Direct Preview
  Client->>API: GET browse
  API-->>Client: status + tree JSON
  Client->>API: GET browse/file path
  API-->>Client: Presigned GET
  Client->>S3: fetch file → Viewer
```

### 3.1 Nguyên tắc bất biến

1. Controller Nest **chỉ** trả metadata / Presigned URL (và tree index JSON khi READY).
2. Bytes `.vsix` và file con **không** đi qua HTTP response của API.
3. Worker là chỗ duy nhất đọc archive và ghi extracted objects.
4. Key object luôn build từ UUID server + relative path đã sanitize — không tin path thô từ client để escape prefix.

---

## 4. Schema & object key

### 4.1 Cột mới trên `ide_extension_version`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `extract_status` | enum/varchar | `none` \| `pending` \| `extracting` \| `ready` \| `failed` — default `none` |
| `extract_tree_key` | varchar NULL | Relative key tới `tree.json` |
| `extract_error` | text NULL | Message khi `failed` |
| `extract_started_at` | timestamptz NULL | |
| `extract_finished_at` | timestamptz NULL | |
| `extract_entry_count` | int NULL | Optional — summary UI |
| `extract_total_bytes` | bigint NULL | Optional — tổng uncompressed đã ghi |

Backfill: row đã có `storage_key` giữ `extract_status = none` cho đến lần enqueue / retry.

### 4.2 Object key

```
ide-extensions/{extensionPk}/{versionId}.vsix
ide-extensions/{extensionPk}/{versionId}/extracted/tree.json
ide-extensions/{extensionPk}/{versionId}/extracted/{relative/path}
```

`StorageService` thêm:

- `buildIdeExtensionExtractPrefix(extensionPk, versionId)`
- `buildIdeExtensionTreeKey(extensionPk, versionId)`
- `buildIdeExtensionExtractedFileKey(extensionPk, versionId, relativePath)` — validate từng segment (`SAFE_KEY_SEGMENT_REGEX`, không `..`)

### 4.3 Shape `tree.json`

```json
{
  "root": [
    { "name": "extension.vsixmanifest", "type": "file", "size": 1234 },
    {
      "name": "extension",
      "type": "dir",
      "children": [
        { "name": "package.json", "type": "file", "size": 800 }
      ]
    }
  ]
}
```

---

## 5. API

JWT `teacher` \| `admin`.

### 5.1 Mở rộng `POST .../versions/:versionId/confirm-artifact`

Sau khi ghi artifact thành công:

1. `extract_status = pending`, clear `extract_error` (và có thể clear tree meta cũ nếu re-upload).
2. `queue.add('extract', { versionId }, { jobId: 'extract-' + versionId })`.
3. Response vẫn là version view — **không** bytes.

Nếu đã `ready` và object/archive không đổi: có thể skip enqueue (idempotent); re-confirm cùng key sau mất object extracted → cho phép re-enqueue qua §5.4.

### 5.2 `GET /ide-extensions/versions/:versionId/browse`

**Response (ý):**

```json
{
  "status": "ready",
  "tree": { "root": [] },
  "entryCount": 42,
  "error": null,
  "artifact": {
    "storageKey": "ide-extensions/.../...vsix",
    "artifactSha256": "...",
    "artifactSizeBytes": 12345
  }
}
```

| `status` | Hành vi |
|---|---|
| `none` / `pending` / `extracting` | Không `tree`; UI poll hoặc hiện chờ |
| `ready` | Service `getObject(extract_tree_key)` → parse JSON → trả `tree` |
| `failed` | `error` từ DB; không `tree` |

Thiếu `storage_key` → 404/400 rõ ràng.

### 5.3 `GET /ide-extensions/versions/:versionId/browse/file?path=`

1. Sanitize `path` (normalize, reject escape).
2. Rebuild extracted key từ `extensionPk` + `versionId` + path.
3. `objectExists` — thiếu → 404.
4. `generateDownloadUrl` TTL ≤ `DOWNLOAD_URL_TTL_SECONDS` (300).

**Response:** `{ "downloadUrl", "expiresIn", "path", "size"? }` — không body file.

### 5.4 `POST /ide-extensions/versions/:versionId/extract`

- Cho phép khi có `storage_key` và status `none` \| `failed` (hoặc force re-extract khi cần backfill).
- Set `pending`, enqueue lại.
- Không đọc/ghi bytes trong controller.

### 5.5 Catalog detail view

Map thêm `extractStatus` (và optional counts/error) để badge trên bảng phiên bản.

---

## 6. Worker (BullMQ)

Queue: `ide-extension-extract`. Mẫu processor: archive-check (queue riêng, concurrency gắn với trần kích thước).

### 6.1 Các bước

1. Load version; thiếu `storage_key` → fail permanent.
2. `extract_status = extracting`, `extract_started_at = now()`.
3. `getObjectSize` / `getObject` archive — vượt `MAX_ARCHIVE_BYTES` (100MB) → `failed`.
4. Mở ZIP bằng **`yauzl`** (`lazyEntries`, `validateEntrySizes`):
   - **Zip Slip:** path dưới extract prefix; reject `..`, absolute, null byte; `\` → `/`.
   - **Zip Bomb:** đếm entry ≤ 10_000; tổng uncompressed ≤ 500MB; mỗi file ≤ 20MB.
5. Mỗi file hợp lệ → `putObject(extractedKey, buffer, contentTypeGuess)`.
6. Build nested tree → `putObject(treeKey, JSON.stringify(tree))`.
7. DB: `extract_tree_key`, counts, `ready`, `extract_finished_at`.
8. Lỗi: storage transient → retry theo job options; ZIP invalid / bomb / slip → `failed` + `extract_error`, không retry vô hạn.

### 6.2 Thư viện

| Lớp | Package | Ghi chú |
|---|---|---|
| Queue | `@nestjs/bullmq` + `bullmq` | Đã có |
| Storage | `StorageService` | `getObject` / `putObject` / `generateDownloadUrl` |
| ZIP | `yauzl` | Đã có; cùng hướng archive-check / grading `source-files` |
| `jszip` | Không dùng extract production | Fixture/xlsx only |
| Zip Slip/Bomb | Logic tự viết | Không lib chuyên dụng |

---

## 7. Web (Code Browser)

### 7.1 Route & entry

- `apps/web/src/app/admin/ide-utilities/[id]/versions/[versionId]/browse/page.tsx`
- Từ trang chi tiết: version `approvalStatus !== 'approved'` và có `storageKey` → click version / badge → `/browse`
- Teacher path: re-export nếu catalog teacher dùng chung page admin

### 7.2 Layout (Split-Pane / Master-Detail)

```text
+------------------+----------------------------------------+
| Tree View        | Breadcrumbs: ext / ver / path...       |
| (expand/collapse)|----------------------------------------|
|                  | File List (khi chọn folder)            |
|                  |   name | size | type                   |
|                  |----------------------------------------|
|                  | File Viewer (khi chọn file)            |
|                  |   text: monospace; binary: thông báo   |
+------------------+----------------------------------------+
```

Bốn thành phần cốt lõi:

1. **Tree View** — cột trái, cây từ `tree.root`, expand/collapse.
2. **Breadcrumbs** — vị trí hiện tại; click về cấp cha.
3. **File List** — nội dung trực tiếp của folder đang mở + metadata (name, size, type).
4. **File Viewer** — khi chọn file: gọi browse/file → `fetch(downloadUrl)` → text preview; binary → chỉ metadata / thông báo không xem được.

### 7.3 Trạng thái extract trên UI

| Status | UI |
|---|---|
| `pending` / `extracting` | Skeleton / «Đang giải nén…»; poll `GET browse` |
| `ready` | Render 4 pane |
| `failed` | Hiện `error` + nút «Thử giải nén lại» → `POST extract` |
| `none` | Gợi ý trigger extract nếu đã có file |

API client: `apps/web/src/lib/api/ide-utilities.ts`.

---

## 8. Ràng buộc & lỗi

| Tình huống | Hành vi |
|---|---|
| Confirm OK nhưng enqueue fail | Log; status có thể `pending` orphan — `POST extract` / job recovery |
| Zip Slip path | Bỏ entry hoặc fail cả job (chọn: **fail job** + message rõ — an toàn hơn skip thầm) |
| Zip Bomb / quá hạn mức | `failed`; không retry vô hạn |
| Browse khi chưa READY | 200 + status; không 500 |
| `path` traversal trên browse/file | 400 |
| Object extracted mất, DB vẫn `ready` | browse/file 404; cho phép `POST extract` rebuild |
| Đổi STORAGE_* (MinIO → Supabase) trống | `objectExists` false trên `.vsix` → extract fail; cần upload lại theo spec sync §8 |

---

## 9. Kiểm thử

| Lớp | Ca |
|---|---|
| Storage keys | Prefix/tree/file ổn định; path xấu throw; không hostname vendor |
| confirm-artifact | Sau confirm → status pending + queue.add (mock) |
| Worker | Happy path putObject entries + tree; slip → failed; bomb → failed |
| GET browse | ready trả tree; pending không tree; failed có error |
| GET browse/file | URL ký đúng key; traversal 400; missing object 404 |
| Web | Link từ version chưa duyệt; poll; mở file text; binary fallback |
| Manual MinIO | confirm → objects `extracted/` → mở route → xem `package.json` |
| Invariant | Response controller không chứa body file/archive |

---

## 10. Tiêu chí xong

- [ ] Migration + entity extract columns.
- [ ] Key builders extract + unit tests.
- [ ] Queue `ide-extension-extract` + processor + Zip Slip/Bomb.
- [ ] confirm enqueue; GET browse; GET browse/file; POST extract.
- [ ] Catalog detail expose `extractStatus` + link browse.
- [ ] Web Code Browser 4 pane trên route riêng.
- [ ] Tests §9; smoke MinIO.
- [ ] Không vendor SDK mới; DB chỉ relative key; đổi env storage không sửa code feature.

---

## 11. Liên quan file chính

| Vùng | File |
|---|---|
| Spec sync artifact (nền) | `docs/superpowers/specs/2026-11-02-ide-extension-vsix-storage-sync-design.md` |
| Entity / migration | `apps/api/src/ide-extensions/entities/ide-extension-version.entity.ts`, `apps/api/src/database/migrations/` |
| Storage | `apps/api/src/storage/storage.service.ts`, `storage.types.ts` |
| API / queue / worker | `ide-extensions.module.ts`, `ide-extensions.service.ts`, `ide-extensions.controller.ts`, extract processor/service mới |
| Web detail | `apps/web/src/app/admin/ide-utilities/[id]/page.tsx` |
| Web browse | `apps/web/src/app/admin/ide-utilities/[id]/versions/[versionId]/browse/page.tsx` |
| Web API | `apps/web/src/lib/api/ide-utilities.ts` |
| Tham chiếu ZIP/queue | `apps/api/src/submission/archive-check/`, `apps/api/src/grading/pipeline/source-files.ts` |
