# Quản lý tiện ích IDE — Catalog + Vi phạm — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang Tiện ích IDE còn 2 tab (Catalog · Vi phạm). Tab Vi phạm gom `(extensionId, version)` từng `blocked` trên scan mà chưa được duyệt global (`*` hoặc exact); Accordion theo version hiện kỳ thi, môn, MSSV, họ tên.

**Architecture:** API `GET /ide-extensions/violations` đọc `ide_extension_scan_item` + join scan / exam / course / student, lọc bằng catalog versions approved. Web rebuild `ide-utilities/page.tsx` — bỏ tab Theo môn và Kết quả quét.

**Tech Stack:** NestJS + TypeORM, Next.js `apps/web`, Jest (api).

**Spec:** [`docs/superpowers/specs/2026-11-18-ide-utilities-violations-ui-design.md`](../specs/2026-11-18-ide-utilities-violations-ui-design.md)

**Builds on:** UC13 scan sync; `compareInventory` / `GET effective` (không đổi).

**Ngoài phạm vi:** deprecate course policy API; đổi agent verdict; JPlag / browse.

---

## File structure

| File | Task | Việc |
|---|---|---|
| `apps/api/src/ide-extensions/violation-filter.ts` (+ `.spec.ts`) | 1 | Pure filter 2B |
| `apps/api/src/ide-extensions/ide-extensions.service.ts` (+ spec) | 2 | `listViolations` |
| `apps/api/src/ide-extensions/ide-extensions.controller.ts` | 2 | `GET violations` |
| `apps/web/src/lib/api/ide-utilities.ts` | 3 | Types + `listViolations` |
| `apps/web/src/app/admin/ide-utilities/page.tsx` | 4 | UI 2 tab + Accordion |
| Teacher page | 4 | Giữ re-export |

---

## Task 1: Helper lọc pair đã duyệt global

**Files:** `violation-filter.ts`, `violation-filter.spec.ts`

- [x] `isViolationPairStillOpen(extensionId, version, approvedPairs: { identifier, version }[]): boolean`
- [x] `*` approved cho identifier → mọi version của mã = closed (false)
- [x] Exact version approved → chỉ version đó closed
- [x] `version = null` chỉ closed khi có `*`
- [x] Unit tests phủ các case trên

## Task 2: API `listViolations`

**Files:** `ide-extensions.service.ts`, `.controller.ts`, spec

- [x] Query items `verdict = 'blocked'` + relations/joins scan, examSession, course, student (mssv)
- [x] Load approved catalog versions (`approvalStatus = approved` + extension.identifier)
- [x] Aggregate → `ViolationExtension[]` theo spec §5
- [x] `GET /ide-extensions/violations` đặt cạnh `effective`
- [x] Roles `admin` \| `teacher`
- [x] Unit/service test: aggregate + filter sau approve

## Task 3: Web API client

**Files:** `apps/web/src/lib/api/ide-utilities.ts`

- [x] Types `ViolationExtension` / `ViolationVersion` / `ViolationIncident`
- [x] `listViolations()`

## Task 4: UI 2 tab

**Files:** `apps/web/src/app/admin/ide-utilities/page.tsx`

- [x] Tabs: `catalog` \| `violations` only
- [x] Xóa UI Theo môn + Kết quả quét
- [x] Tab Vi phạm: bảng + expand versions + Accordion incidents
- [x] Nút Thêm vào catalog → `catalogFromScan`
- [x] Cập nhật `PageHeader` description
- [x] Teacher re-export không đổi

---

## Done when

- [x] Spec + plan checked in
- [x] `GET /violations` trả shape đúng; filter 2B đúng
- [x] UI chỉ 2 tab; Accordion hiện kỳ thi / môn / MSSV / họ tên
- [x] API tests xanh cho helper + listViolations
