# VSIX Code Browser (GitHub-style) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sau khi `.vsix` đã confirm trên Storage, giải nén async (BullMQ + `yauzl`) lên prefix `extracted/` + `tree.json`, rồi cho admin/teacher mở route Code Browser (Tree / Breadcrumbs / File List / Viewer) — metadata + Presigned GET only; không stream bytes archive/file qua Nest controller.

**Architecture:** Mở rộng `ide_extension_version` với `extract_*`. `confirm-artifact` enqueue queue riêng `ide-extension-extract`. Worker `getObject` `.vsix` → Zip Slip/Bomb → `putObject` entries + tree. API `GET browse` trả tree JSON; `GET browse/file` trả Presigned GET. Web route riêng split-pane. Storage chỉ qua `StorageService` + `STORAGE_*`.

**Tech Stack:** NestJS + TypeORM, `@nestjs/bullmq` / `bullmq`, `yauzl`, `StorageService` (S3), Next.js `apps/web`, Jest (api).

**Spec:** [`docs/superpowers/specs/2026-11-02-ide-extension-vsix-code-browser-design.md`](../specs/2026-11-02-ide-extension-vsix-code-browser-design.md)

**Builds on:** [`2026-11-02-ide-extension-vsix-storage-sync-design.md`](../specs/2026-11-02-ide-extension-vsix-storage-sync-design.md) / plan sync (artifact columns, `confirm-artifact`, `buildIdeExtensionKey`).

**Ngoài phạm vi:** đổi Hub upload; auto-approve; edit file trong browser; diff versions; download nguyên `.vsix` UI; Monaco/CodeMirror/allotment; JSZip phía browser; vendor SDK storage.

---

## Global constraints

- Controller Nest **chỉ** metadata / Presigned URL / tree index JSON. Bytes `.vsix` và file con **không** qua HTTP response API.
- Worker được `getObject` / `putObject` (đúng chỗ giải nén).
- Key: UUID server + path đã sanitize — `ide-extensions/{extensionPk}/{versionId}.vsix` và `.../{versionId}/extracted/...`.
- Queue riêng `ide-extension-extract` — không trộn grading / archive-check.
- ZIP: **`yauzl`** lazy + `validateEntrySizes`. Không `adm-zip` / `unzipper`. Không `jszip` cho extract production.
- Zip limits (spec §2 #10): archive ≤ 100MB; ≤ 10_000 entries; uncompressed ≤ 500MB; 1 file ≤ 20MB; chặn `..` / absolute / null byte; `\` → `/`.
- Browse: `teacher` \| `admin`; cần `storage_key`. UI entry từ version chưa `approved` + đã có file.
- Presigned GET vẫn `application/octet-stream`; viewer decode phía client.
- DB chỉ relative key; không vendor lock / hard-code MinIO|Supabase.

---

## File structure

| File | Task | Việc |
|---|---|---|
| `apps/api/src/database/migrations/1789830000000-IdeExtensionVersionExtract.ts` | 1 | Cột extract |
| `apps/api/src/ide-extensions/entities/ide-extension-version.entity.ts` | 1 | Map cột extract |
| `apps/api/src/storage/storage.types.ts` | 2 | Prefix/helpers docs constants nếu cần |
| `apps/api/src/storage/storage.service.ts` (+ `.spec.ts`) | 2 | extract prefix / tree / file key builders |
| `apps/api/src/ide-extensions/extract/ide-extension-extract.constants.ts` | 3 | Queue name, limits, concurrency |
| `apps/api/src/ide-extensions/extract/ide-extension-extract.types.ts` | 3 | Job payload + job options |
| `apps/api/src/ide-extensions/extract/ide-extension-extract-path.ts` (+ spec) | 3 | Sanitize relative path (Zip Slip) |
| `apps/api/src/ide-extensions/extract/ide-extension-extract.service.ts` (+ spec) | 4 | Unpack yauzl → putObject + tree + DB status |
| `apps/api/src/ide-extensions/extract/ide-extension-extract.processor.ts` | 4 | BullMQ processor |
| `apps/api/src/ide-extensions/ide-extensions.module.ts` | 4 | `BullModule.registerQueue` + providers |
| `apps/api/src/ide-extensions/ide-extensions.service.ts` (+ spec) | 5 | confirm enqueue; browse; browse/file; extract retry; map view |
| `apps/api/src/ide-extensions/ide-extensions.controller.ts` | 5 | GET browse, GET browse/file, POST extract |
| `apps/api/src/ide-extensions/dto/ide-extensions.dto.ts` | 5 | Query path DTO nếu cần |
| `packages/shared` OpenAPI / `schema.d.ts` | 5 | Sau controller ổn (nếu pipeline yêu cầu) |
| `apps/web/src/lib/api/ide-utilities.ts` | 6 | Types extract + browse/file helpers |
| `apps/web/src/app/admin/ide-utilities/[id]/page.tsx` | 6 | Link browse + badge extractStatus |
| `apps/web/src/app/admin/ide-utilities/[id]/versions/[versionId]/browse/page.tsx` (+ components) | 7 | Code Browser 4 pane |
| Teacher re-export browse nếu cần | 7 | Cùng pattern `[id]/page` teacher |

---

## Task 1: Migration + entity extract

**Files:** migration timestamp sau `178982…`, `ide-extension-version.entity.ts`

- [x] Thêm cột nullable/default trên `ide_extension_version`:
  - `extract_status` — `none` \| `pending` \| `extracting` \| `ready` \| `failed` (default `none`)
  - `extract_tree_key` varchar NULL
  - `extract_error` text NULL
  - `extract_started_at` / `extract_finished_at` timestamptz NULL
  - `extract_entry_count` int NULL
  - `extract_total_bytes` bigint NULL
- [x] Map entity (`extractStatus`, `extractTreeKey`, …).
- [ ] Chạy migration local — expected: applied; row cũ `extract_status = none`.

## Task 2: Storage extract key builders

**Files:** `storage.types.ts`, `storage.service.ts`, `storage.service.spec.ts`

- [x] `buildIdeExtensionExtractPrefix(extensionPk, versionId)` → `ide-extensions/{pk}/{vid}/extracted`
- [x] `buildIdeExtensionTreeKey(...)` → `.../extracted/tree.json`
- [x] `buildIdeExtensionExtractedFileKey(..., relativePath)` — split `/`, validate mỗi segment bằng `SAFE_KEY_SEGMENT_REGEX` (hoặc tương đương); reject `..`, empty, absolute.
- [x] Unit: key ổn định; path xấu → throw; **không** chứa hostname / `STORAGE_ENDPOINT`.
- [x] Không thêm dependency storage vendor.

## Task 3: Extract queue constants + path sanitize

**Files:** `extract/ide-extension-extract.constants.ts`, `.types.ts`, `ide-extension-extract-path.ts` (+ spec)

- [x] `IDE_EXTENSION_EXTRACT_QUEUE = 'ide-extension-extract'`
- [x] Limits khớp spec: `MAX_ARCHIVE_BYTES = 100MB`, `MAX_ENTRIES = 10_000`, `MAX_UNCOMPRESSED_BYTES = 500MB`, `MAX_FILE_BYTES = 20MB`, concurrency hợp lý (vd. 1–2)
- [x] `IDE_EXTENSION_EXTRACT_JOB_OPTIONS` (attempts + backoff cho storage transient)
- [x] Helper sanitize/normalize entry name → relative POSIX path; fail rõ khi slip
- [x] Unit: `a/../../b` reject; `\a\b` → `a/b`; absolute reject; null byte reject

## Task 4: Worker extract service + processor

**Files:** `ide-extension-extract.service.ts` (+ spec), `ide-extension-extract.processor.ts`, `ide-extensions.module.ts`

- [x] `processOne(versionId)`:
  1. Load version; thiếu `storageKey` → permanent fail / mark failed
  2. Set `extracting` + `extractStartedAt`
  3. Size check → `getObject` `.vsix`
  4. `yauzl.fromBuffer` (lazy, `validateEntrySizes`); mỗi entry: sanitize, caps Zip Bomb, `putObject` extracted key
  5. Build nested `tree.json` (`root[]` file|dir); `putObject` tree key
  6. DB `ready` + tree key + counts + `extractFinishedAt`
  7. On policy fail (slip/bomb/invalid zip): `failed` + `extractError`; không retry vô hạn
- [x] Processor `@Processor(IDE_EXTENSION_EXTRACT_QUEUE)`; `onFailed` đánh failed khi hết attempts (cùng tinh thần archive-check)
- [x] Module: `BullModule.registerQueue({ name: IDE_EXTENSION_EXTRACT_QUEUE })` + providers
- [x] Tests: mock Storage; happy path; slip → failed; bomb → failed; thiếu storageKey

## Task 5: API — enqueue + browse + extract retry

**Files:** service, controller, dto; tests

- [x] `confirmArtifact`: sau ghi artifact OK → `extractStatus = pending`, clear error (và meta extract cũ nếu re-upload); `queue.add('extract', { versionId }, { jobId: 'extract-' + versionId, ...JOB_OPTIONS })`. **Không** đọc/ghi bytes trong controller.
- [x] Skip enqueue nếu đã `ready` và không force (hoặc document: re-confirm luôn re-extract — chọn **re-extract khi confirm lại** sau khi clear extracted meta để đơn giản idempotent với object mới)
- [x] `GET /ide-extensions/versions/:versionId/browse` → `{ status, tree?, entryCount?, error?, artifact? }`; READY → `getObject(treeKey)` parse JSON trong **service** (không proxy file con)
- [x] `GET /ide-extensions/versions/:versionId/browse/file?path=` → sanitize → rebuild key → `objectExists` → `generateDownloadUrl`; 400 traversal; 404 missing
- [x] `POST /ide-extensions/versions/:versionId/extract` → chỉ khi có `storageKey` và status `none`|`failed` (hoặc luôn cho phép re-run admin); set pending + enqueue
- [x] Map catalog/version view: `extractStatus`, optional error/counts
- [x] Route order: đặt path tĩnh/`browse` trước param nuốt nếu cần
- [x] Tests: confirm gọi queue; browse pending không tree; browse ready có tree; file path xấu 400; mock Storage — không giả định host
- [ ] Cập nhật OpenAPI / `packages/shared` nếu pipeline repo yêu cầu

## Task 6: Web — types + entry từ catalog detail

**Files:** `ide-utilities.ts`, `[id]/page.tsx`

- [x] Types version thêm `extractStatus` (+ optional fields)
- [x] Helpers: `getVersionBrowse(versionId)`, `getVersionBrowseFile(versionId, path)`, `requestVersionExtract(versionId)`
- [x] Bảng phiên bản: khi chưa `approved` và có `storageKey`/`artifactUploadedAt` — version (hoặc badge file) là link tới `.../versions/{id}/browse`
- [x] Badge phụ theo `extractStatus`: đang giải nén / sẵn sàng xem / lỗi (không bắt buộc đẹp đợt 1)

## Task 7: Web — Code Browser page

**Files:** `.../versions/[versionId]/browse/page.tsx` (+ `_components` nếu tách)

- [x] Load browse; poll khi `pending`|`extracting`
- [x] `failed`: hiện error + nút «Thử giải nén lại»
- [x] Layout CSS grid split-pane:
  - Trái: Tree View expand/collapse từ `tree.root`
  - Phải trên: Breadcrumbs
  - Phải: File List khi đang ở folder; File Viewer khi chọn file
- [x] Chọn file → `browse/file` → `fetch(downloadUrl)` → text (`utf-8`) trong `<pre>`; binary / decode fail → thông báo không xem được
- [x] Không JSZip client; không proxy content qua Nest
- [x] Teacher route re-export nếu catalog teacher share admin detail pattern
- [x] Không thêm Monaco/allotment/arborist

## Task 8: Kiểm chứng MinIO local

**Manual:**

- [ ] Có version + `storage_key` (sync Hub hoặc fixture) → confirm/extract → objects dưới `.../extracted/` + `tree.json`
- [ ] Mở `/browse` → tree + mở `extension/package.json` (hoặc file text tương đương)
- [ ] Path traversal API → 400
- [ ] Ghi chú: MinIO → Supabase chỉ `STORAGE_*` + smoke extract/browse

---

## Review focus

1. Không bytes archive/file qua controller — chỉ URL + tree JSON.
2. Queue riêng; Zip Slip fail rõ; Zip Bomb có caps.
3. Key builders chỉ UUID + sanitized path; DB relative key.
4. confirm enqueue; retry `POST extract` cho `none`/`failed`.
5. FE 4 pane trên route riêng; entry từ version chưa duyệt có file.
6. Chỉ `yauzl` cho extract; không vendor storage SDK mới.

---

## Tiêu chí xong (map spec §10)

- [x] Migration + entity extract.
- [x] Key builders extract + unit tests.
- [x] Queue + processor + Zip Slip/Bomb.
- [x] confirm enqueue; GET browse; GET browse/file; POST extract.
- [x] Catalog `extractStatus` + link browse.
- [x] Web Code Browser 4 pane.
- [ ] Tests §9 spec + smoke MinIO.
- [x] Không vendor lock; đổi storage chỉ env.
