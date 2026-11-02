# Đồng bộ VSIX lên object storage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khi Teacher Hub bấm «Đồng bộ lên hệ thống», sau khi ghi `scans/batch` thành công, tự đảm bảo mỗi `(extensionId, version)` trong lần đối chiếu có binary `.vsix` trên object storage (điều kiện 1B), qua Marketplace → presigned PUT → confirm — không đưa bytes qua Nest.

**Architecture:** Mở rộng `StorageService` (S3 + `forcePathStyle`) với prefix `ide-extensions/`. API `ensure-artifacts` / `confirm-artifact` upsert catalog `pending` khi thiếu và chỉ trả URL khi chưa có object. Hub tải từ Marketplace, PUT thẳng MinIO/Supabase theo URL đã ký. Đổi local MinIO → production Supabase **chỉ** bằng `STORAGE_*` (spec §4.3).

**Tech Stack:** NestJS + TypeORM, `@aws-sdk/client-s3` / `s3-request-presigner`, Electron Teacher Hub (`fetch`), Vitest (agent), Jest (api).

**Spec:** [`docs/superpowers/specs/2026-11-02-ide-extension-vsix-storage-sync-design.md`](../specs/2026-11-02-ide-extension-vsix-storage-sync-design.md)

**Ngoài phạm vi:** gộp nút «Tải VSIX vi phạm»; auto-approve; wildcard `*`; download admin trên web; SDK MinIO/Supabase riêng; migrate object MinIO→Supabase.

---

## Global constraints

- Điều kiện **1B:** cần artifact khi chưa có row version **hoặc** `storage_key` NULL / `objectExists` false.
- «Đồng bộ» = `scans/batch` trước; artifact **best-effort** sau đó. Batch fail → không ensure. VSIX fail → sync vẫn `ok: true`.
- Candidates = mọi verdict trong `lastComparisons`, unique `(extensionId, version)`. Không `*`.
- Upsert thiếu → `pending`; **không** đổi `approval_status` đã có; **không** tạo `*`.
- Bytes không qua API (Security rule 5). Hub chỉ dùng `uploadUrl` từ API — **không** đọc `STORAGE_*`.
- Storage: chỉ `StorageService`; cấm vendor SDK / hard-code endpoint / nhánh `if (minio|supabase)`. DB chỉ lưu relative `storage_key`.
- Key: `ide-extensions/{extensionPk}/{versionId}.vsix` — UUID server, không lấy filename/identifier từ client.
- Nút «Tải VSIX extension vi phạm» (local `Downloads/cine-vsix`) **không đổi** hành vi.

---

## File structure

| File | Task | Việc |
|---|---|---|
| `apps/api/src/database/migrations/1789820000000-IdeExtensionVersionArtifact.ts` | 1 | Cột artifact |
| `apps/api/src/ide-extensions/entities/ide-extension-version.entity.ts` | 1 | Map cột mới |
| `apps/api/src/storage/storage.types.ts` | 2 | `IDE_EXTENSION_KEY_PREFIX` |
| `apps/api/src/storage/storage.service.ts` (+ `.spec.ts`) | 2 | `buildIdeExtensionKey` |
| `apps/api/src/ide-extensions/ide-extensions.module.ts` | 2 | Import `StorageModule` |
| `apps/api/src/ide-extensions/dto/ide-extensions.dto.ts` | 3 | DTO ensure / confirm |
| `apps/api/src/ide-extensions/ide-extensions.service.ts` (+ spec nếu có / mới) | 3 | ensure + confirm + map view |
| `apps/api/src/ide-extensions/ide-extensions.controller.ts` | 3 | 2 route mới |
| `packages/shared` OpenAPI / `schema.d.ts` | 3 | Sau controller ổn |
| `apps/agent/src/lab-mgmt/violation-vsix.ts` (+ test) | 4 | Tách helper download buffer/file |
| `apps/agent/electron/main/lab-mgmt-runtime.ts` | 5 | `syncBackend` artifact phase |
| `apps/agent/electron/renderer/.../TeacherHubView.tsx` (+ test nếu có) | 5 | Summary UI |
| `apps/web/src/lib/api/ide-utilities.ts` | 6 | Types field artifact |
| `apps/web/src/app/admin/ide-utilities/[id]/page.tsx` | 6 | Cột/badge «Đã có file» |

---

## Task 1: Migration + entity artifact

**Files:** migration mới (timestamp sau `178981…`), `ide-extension-version.entity.ts`

- [x] Thêm cột nullable trên `ide_extension_version`:
  - `storage_key` varchar NULL
  - `artifact_sha256` varchar(64) NULL
  - `artifact_size_bytes` bigint NULL
  - `artifact_uploaded_at` timestamptz NULL
- [x] Cập nhật `IdeExtensionVersionEntity` tương ứng (`storageKey`, `artifactSha256`, `artifactSizeBytes`, `artifactUploadedAt`).
- [x] Chạy migration local (Postgres Docker) — expected: pending applied, không đụng dữ liệu cũ.

## Task 2: Storage key + wire module

**Files:** `storage.types.ts`, `storage.service.ts`, `storage.service.spec.ts`, `ide-extensions.module.ts`

- [x] `IDE_EXTENSION_KEY_PREFIX = 'ide-extensions'`.
- [x] `buildIdeExtensionKey(extensionPk, versionId)`: validate segment bằng `SAFE_KEY_SEGMENT_REGEX` (giống material/submission); trả `ide-extensions/{extensionPk}/{versionId}.vsix`.
- [x] Unit: key ổn định; segment xấu → throw; **không** chứa hostname / `STORAGE_ENDPOINT`.
- [x] `IdeExtensionsModule` `imports: [StorageModule, …]`; inject `StorageService` vào `IdeExtensionsService`.
- [x] Không thêm dependency npm storage vendor.

## Task 3: API ensure-artifacts + confirm-artifact

**Files:** dto, service, controller; test Jest; regenerate shared schema theo convention repo

- [x] DTO:
  - `EnsureArtifactsDto`: `items: { extensionId, version, displayName? }[]`
  - `ConfirmArtifactDto`: `storageKey`, `sha256?`, `sizeBytes?`
- [x] `POST /ide-extensions/catalog/ensure-artifacts` (`teacher`|`admin`) — **đặt trước** `catalog/:id` nếu cần tránh nuốt path (cùng pattern `from-scan`).
  - Dedupe `(extensionId, version)` server-side.
  - `version === '*'` → bỏ qua item (hoặc 400 cả request nếu prefer strict; chọn: **skip item** + không đưa vào `needed`, không tăng skip “đã có file” — ghi trong code comment).
  - Thiếu extension/version → reuse `upsertFromScan` (pending + marketplace best-effort).
  - Có `storageKey` và `objectExists` → `skipped++`.
  - Thiếu binary → `buildIdeExtensionKey` + `generateUploadUrl` → push `needed`.
  - Không đổi `approvalStatus`.
- [x] `POST /ide-extensions/versions/:versionId/confirm-artifact` (`teacher`|`admin`):
  - Rebuild key; mismatch → 400.
  - `!objectExists` → 400, không ghi cột.
  - Ghi `storageKey` + artifact meta + `artifactUploadedAt = now()`; idempotent cùng key.
- [x] Map catalog detail / version view trả `storageKey`, `artifactSha256`, `artifactSizeBytes`, `artifactUploadedAt` (null khi chưa có).
- [x] Tests:
  - ensure tạo pending + `needed` có URL;
  - ensure skip khi object có;
  - ensure lại `needed` khi DB có key nhưng `objectExists` false (1B / đổi backend);
  - confirm mismatch / missing object / happy path;
  - mock `StorageService` — không giả định MinIO/Supabase host.
- [ ] Cập nhật OpenAPI / `packages/shared` nếu pipeline repo yêu cầu sau đổi controller.

## Task 4: Agent — tách download Marketplace dùng chung

**Files:** `apps/agent/src/lab-mgmt/violation-vsix.ts`, `violation-vsix.test.ts`

- [x] Export helper tải một `(extensionId, version)` → `Buffer` (hoặc path temp) dùng chung: reuse `vsixPackageUrl`, timeout, partial/empty checks hiện có.
- [x] `downloadViolationVsixFiles` vẫn ghi `Downloads/cine-vsix` như cũ (gọi helper rồi write file, hoặc giữ path hiện tại nếu refactor tối thiểu).
- [x] Test: helper + regression «already / downloaded / failed» của nút local.

## Task 5: Hub — gắn artifact vào `syncBackend` + UI

**Files:** `lab-mgmt-runtime.ts`, `TeacherHubView.tsx` (+ test renderer nếu có)

- [x] Sau `scans/batch` OK:
  1. Build unique candidates từ `lastComparisons` (mọi verdict).
  2. `POST .../catalog/ensure-artifacts` với Bearer Hub.
  3. Với mỗi `needed`: helper download → `fetch(uploadUrl, { method: 'PUT', body })` → `POST .../versions/:id/confirm-artifact` (sha256 + sizeBytes nếu tính được, vd. `crypto.createHash('sha256')`).
  4. Đếm `uploaded` / dùng `skipped` từ API / `failed` per item; không abort cả vòng khi một item lỗi.
- [x] Batch fail → return lỗi cũ; **không** gọi ensure.
- [x] Return shape mở rộng: `{ ok: true, artifact?: { uploaded, skipped, failed } }` (optional `failures` ngắn).
- [x] UI: sau Đồng bộ OK hiện *«Đã ghi kết quả quét. VSIX: tải lên N, bỏ qua M, lỗi K.»*; lỗi toàn bộ VSIX vẫn OK scan + cảnh báo.
- [ ] Test/runtime unit nếu có harness: mock fetch batch / ensure / marketplace / PUT / confirm; partial fail vẫn `ok: true`.

## Task 6: Web — badge «Đã có file»

**Files:** `apps/web/src/lib/api/ide-utilities.ts`, `apps/web/src/app/admin/ide-utilities/[id]/page.tsx`

- [x] Type version thêm field artifact (nullable).
- [x] Bảng phiên bản: cột hoặc badge **«Đã có file»** khi `storageKey` / `artifactUploadedAt` có; `*` và bản chưa upload → «—» / không badge.
- [x] Không thêm nút download trong task này.

## Task 7: Kiểm chứng MinIO local (+ ghi chú prod)

**Manual / deploy notes (không code vendor):**

- [ ] `docker compose up -d` MinIO; `STORAGE_*` theo `.env.example` (localhost:9010).
- [ ] Hub cùng máy (hoặc reach được endpoint): Đối chiếu → Đồng bộ → một extension thiếu binary lên MinIO; DB có `storage_key`; UI badge hiện.
- [ ] Nút «Tải VSIX vi phạm» vẫn chỉ ghi local folder.
- [ ] Ghi trong PR / comment: cắt sang Supabase = đổi `STORAGE_*` theo `docs/deploy/03-storage-supabase.md` + smoke ensure→PUT→confirm một `.vsix` — **không** sửa code.

---

## Review focus

1. Bytes không đi qua Nest; confirm chỉ sau `objectExists`.
2. 1B: thiếu row **hoặc** thiếu object → `needed`; có object → skip.
3. Best-effort: batch OK + VSIX fail vẫn sync thành công.
4. Không vendor lock; DB chỉ relative key; Hub không đọc `STORAGE_*`.
5. Nút tải VSIX local không bị đổi thành upload Storage.
6. Không auto-approve / không tạo `*`.

---

## Tiêu chí xong (map spec §10)

- [x] Migration + entity artifact.
- [x] `buildIdeExtensionKey` + `StorageModule` trong IdeExtensions.
- [x] `ensure-artifacts` + `confirm-artifact` đúng 1B + rule 5.
- [x] Đồng bộ Hub: scan rồi VSIX best-effort + summary UI.
- [x] Nút VSIX vi phạm local nguyên hành vi.
- [x] Web detail «Đã có file».
- [x] Test API + agent (§9 spec).
- [ ] §4.3: không SDK vendor mới; đổi MinIO→Supabase chỉ env + smoke.
