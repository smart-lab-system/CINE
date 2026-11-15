# Chuẩn hóa mã từ VSIX (Snippets-first) — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]` / `- [x]`) syntax for tracking.

**Goal:** Khi version VSIX đã `extract_status=ready`, cho admin/teacher xem **mã đã chuẩn hóa** từ extension Snippets: đọc `package.json` → `contributes.snippets` → bung `body` `.code-snippets`, qua API on-demand + nút trên trang «Xem nội dung VSIX».

**Architecture:** Lib thuần `snippet-normalize` + `IdeExtensionsService.getNormalizedSources` đọc Storage extract (không ghi synthetic lên DB/Storage). Web browse thêm chế độ `normalized`.

**Tech Stack:** NestJS, Jest; Next.js `apps/web`.

**Spec:** [`docs/superpowers/specs/2026-11-15-ide-extension-snippet-normalize-design.md`](../specs/2026-11-15-ide-extension-snippet-normalize-design.md)

**Builds on:** Code Browser extract/browse ([`2026-11-02-ide-extension-vsix-code-browser`](./2026-11-02-ide-extension-vsix-code-browser.md)).

**Ngoài phạm vi (Pha 1):** JPlag; persist `normalized/`; fallback `src/`; Monaco; OpenAPI regenerate (trừ khi pipeline bắt buộc).

**Trạng thái:** Pha 1 **đã implement** (commit `b2caf65f`).

---

## Global constraints

- Chỉ khi extract `ready` và có `storage_key`.
- Path snippet dưới `extension/`; chặn Zip Slip.
- Không INSERT blob mã vào Postgres.
- Response JSON `content` là text đã bung từ snippet — không thay browse/file Presigned cho file thô trong VSIX.
- Roles: `teacher` \| `admin`.

---

## File structure

| File | Task | Việc |
|---|---|---|
| `apps/api/src/ide-extensions/normalize/snippet-normalize.ts` (+ `.spec.ts`) | 1 | Parse package + snippets; strip tabstop; caps |
| `sample extension/hungzazed01.react-bootstrap-kit-0.1.2-sample/` | 1 | Fixture PTGDUD Snippets |
| `apps/api/src/ide-extensions/dto/ide-extensions.dto.ts` | 2 | `NormalizedSourcesQueryDto` (`raw`) |
| `apps/api/src/ide-extensions/ide-extensions.service.ts` (+ artifacts spec) | 2 | `getNormalizedSources` |
| `apps/api/src/ide-extensions/ide-extensions.controller.ts` | 2 | `GET …/normalized-sources` |
| `apps/web/src/lib/api/ide-utilities.ts` | 3 | Types + `getVersionNormalizedSources` |
| `apps/web/.../browse/page.tsx` | 3 | Nút + panel normalized |

---

## Task 1: Lib + fixture

**Files:** `normalize/snippet-normalize.ts`, `.spec.ts`, `sample extension/…`

- [x] `stripSnippetTabstops`, `safeIdFromPrefix`, `resolveSnippetContributePath`
- [x] `parsePackageSnippetsContributes`, `parseCodeSnippetsDocument`, `buildNormalizedSourcesFromPackage`
- [x] Caps: `NORMALIZE_MAX_SNIPPETS`, `NORMALIZE_MAX_CONTENT_CHARS`, `NORMALIZE_MAX_SNIPPET_FILE_BYTES`
- [x] Unit trên sample: path `./snippets/snippets.code-snippets`; prefix gồm `ptgdud:footer`, `ptgdud:header`; reject `..`
- [x] Commit fixture sample extension vào repo

## Task 2: API

**Files:** dto, service, controller; `ide-extensions-artifacts.spec.ts`

- [x] `GET /ide-extensions/versions/:versionId/normalized-sources` (+ `?raw=1`)
- [x] Load `extension/package.json` + từng snippet file từ extract keys
- [x] 400 khi chưa ready / thiếu file / parse lỗi
- [x] `mode: 'none'` khi không có contributes.snippets
- [x] Tests service: happy path + reject pending extract

## Task 3: Web UI

**Files:** `ide-utilities.ts`, browse `page.tsx`

- [x] Types `NormalizedSourceItem` / `NormalizedSourcesView` + client helper
- [x] Nút «Xem mã đã chuẩn hóa» khi browse ready
- [x] Panel list prefix + viewer `<pre>`; quay lại cây file
- [x] Thông báo khi `mode === 'none'`

---

## Review focus

1. Không persist content; nguồn = `extracted/`.
2. Path chỉ qua sanitize / under `extension/`.
3. UI không gọi API khi extract chưa ready (nút ẩn/disabled theo status).
4. Sample fixture khớp kịch bản Snippets PTGDUD.

---

## Tiêu chí xong

- [x] Spec + plan trong `docs/superpowers/`
- [x] Task 1–3 code + unit
- [x] Không JPlag / không migration mới
- [ ] Manual smoke: extract sample → browse → nút → thấy Footer/Header (môi trường local)

---

## Pha 2 (chưa làm — plan riêng sau)

Queue `ide-extension-jplag`; stage temp từ items normalized + đáp án mẫu; JAR headless `--mode RUN`; entity run metadata; UI so sánh. Không mở rộng plan này.
