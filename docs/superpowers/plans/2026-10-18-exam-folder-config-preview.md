# Cấu hình thư mục bài thi + preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trên hub Thiết lập, đổi framing khối “File bắt buộc” thành **Cấu hình thư mục bài thi** và thêm preview cây thư mục (đề/tài liệu được phát + file SV phải nộp), live khi đang sửa và vẫn đọc được khi đã khoá sau mở phiên.

**Architecture:** Chỉ frontend. Extract helper token-preview dùng chung; component thuần `ExamFolderPreview` nhận props; wire từ `RequiredDeliverablesEditor` (live `useWatch`) và từ page khi không mutable. Không đổi API / schema HTTP / agent workspace.

**Tech Stack:** Next.js App Router, RHF + Zod, TanStack Query (materials đã có), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-18-exam-folder-config-preview-design.md`

**Phụ thuộc:** Hub `/teacher/exam-sessions/[id]` + PUT deliverables khi `scheduled` từ [create-slim](./2026-10-18-exam-session-create-slim.md) / [setup-edit-flow](./2026-10-18-exam-session-setup-edit-flow.md).

**Ngoài phạm vi:** gộp `ExamMaterialsCard`; đổi API materials/deliverables; đổi copy “file bắt buộc” trên lobby / submissions / grading; đồng bộ 1:1 mọi file agent tự sinh trên máy SV.

---

## Verified facts (2026-10-18)

- Hub card title hiện là `File bắt buộc` — `apps/web/src/app/teacher/exam-sessions/[id]/page.tsx` (~L357).
- Editor: `RequiredDeliverablesEditor.tsx` — form PUT + toast “Đã lưu danh sách file bắt buộc”; nút “Lưu danh sách file”.
- Form fieldset: `RequiredFilenamesInput.tsx` — legend `File bắt buộc nộp`; hàm nội bộ `preview()` / `TOKENS` / `isTemplated()` (chưa export).
- Materials: `ExamMaterial.fileName` (`lib/api/exam-materials.ts`); page đã gọi `useExamMaterials(id)`.
- Checklist: `evaluateSetupChecklist` blockReason `Hãy khai báo file bắt buộc trước khi mở phiên.` — `SetupChecklist.tsx` L53; test assert `/file bắt buộc/`.
- Schema: `replaceRequiredDeliverablesSchema` min message `Cần khai báo ít nhất 1 file bắt buộc` — `new/schema.ts`.
- Create page description nhắc “File bắt buộc và rubric gắn ở bước Thiết lập” — `new/page.tsx`.
- Không cần OpenAPI regen / migration / e2e API.

---

## Global constraints

- **Hai card chỉnh sửa, một preview** — không gộp upload đề vào card cấu hình.
- Luật mở phiên **không đổi**: checklist chặn nếu `deliverableCount < 1`; thiếu đề chỉ warning.
- Preview **không** gọi React Query bên trong — props từ parent.
- Token sample **không** tự normalize dấu tiếng Việt trên client (giữ mẫu ASCII như form hiện tại).
- Chỉ đổi copy hub + điểm vào Thiết lập (§4 spec); không quét toàn repo “file bắt buộc”.
- Commit theo task khi user yêu cầu; không push/PR đến khi được bảo.

---

## File structure

| File | Task | Trách nhiệm |
|---|---|---|
| `…/new/_components/filename-pattern-preview.ts` | 1 | Export `FILENAME_TOKENS`, `previewFilenamePattern`, `isTemplatedFilename` |
| `…/new/_components/RequiredFilenamesInput.tsx` (+ test) | 1–2 | Dùng helper; đổi legend / help / aria / title |
| `…/new/schema.ts` | 2 | Message min 1 file phải nộp |
| `…/[id]/_components/ExamFolderPreview.tsx` (+ test) | 3 | Cây Được phát / Phải nộp |
| `…/[id]/_components/RequiredDeliverablesEditor.tsx` | 4 | Props `materialFilenames`; live preview; toast/nút |
| `…/[id]/page.tsx` | 4 | Title/description card; truyền materials; preview khi khoá |
| `…/[id]/_components/SetupChecklist.tsx` (+ test) | 5 | blockReason mới |
| `…/new/page.tsx` | 5 | Description bước Thiết lập |
| Specs create-slim / setup-edit (một dòng) | 5 | Ghi chú nhãn UI hub |

---

## Review focus

1. Hub không còn title “File bắt buộc”; thành “Cấu hình thư mục bài thi”.
2. Preview hiện materials (`fileName`) và file nộp (kể cả đang gõ token).
3. Sau mở phiên: preview khoá thay list `<ul>` cũ; empty state copy mới.
4. Checklist / schema / toast / legend khớp spec §4.
5. Không đổi backend; không regression PUT deliverables / open gate.

---

# Phase 1 — Shared preview helper + copy form

## Task 1: Extract `previewFilenamePattern`

**Files:**
- Create: `apps/web/src/app/teacher/exam-sessions/new/_components/filename-pattern-preview.ts`
- Modify: `apps/web/src/app/teacher/exam-sessions/new/_components/RequiredFilenamesInput.tsx`

**Hợp đồng:** Cùng sample token như hiện tại:

| Token | Sample |
|---|---|
| `{MSSV}` | `SV20120001` |
| `{TEN}` | `NguyenVanAn` |
| `{PHONG}` | `PhongMayA1` |
| `{SOMAY}` | `MAY07` |

- [x] **Step 1:** Export `FILENAME_TOKENS`, `previewFilenamePattern(pattern: string): string`, `isTemplatedFilename(pattern: string): boolean` (logic copy từ `preview` / `isTemplated` / `TOKENS` trong input).
- [x] **Step 2:** `RequiredFilenamesInput` import và dùng helper; xoá bản nội bộ trùng.
- [x] **Step 3:** Chạy `RequiredFilenamesInput.test.tsx` — vẫn xanh trước khi đổi copy (Task 2).

---

## Task 2: Copy form + schema (file phải nộp)

**Files:**
- Modify: `RequiredFilenamesInput.tsx` (+ `.test.tsx`)
- Modify: `apps/web/src/app/teacher/exam-sessions/new/schema.ts` (và `schema.test.ts` nếu assert message)

**Copy mục tiêu (spec §4):**

| Chỗ | Mới |
|---|---|
| Legend | File sinh viên phải nộp |
| Help đầu | Các tên dưới đây là file trong thư mục bài thi mà agent thu bài. … (giữ rule ký tự) |
| Label / aria hàng | file phải nộp số N |
| Aria / title nút xoá | Xoá file phải nộp số N / Cần ít nhất 1 file phải nộp |
| Schema `.min(1)` | Cần ít nhất 1 file phải nộp |

- [x] **Step 1:** Đổi chuỗi trên; giữ đoạn token + bỏ dấu họ tên như hiện tại.
- [x] **Step 2:** Cập nhật test input/schema khớp legend / aria / message.
- [x] **Step 3:** `pnpm --filter web test -- RequiredFilenamesInput` (và schema nếu đụng).

---

# Phase 2 — ExamFolderPreview

## Task 3: Component + unit test

**Files:**
- Create: `apps/web/src/app/teacher/exam-sessions/[id]/_components/ExamFolderPreview.tsx`
- Create: `apps/web/src/app/teacher/exam-sessions/[id]/_components/ExamFolderPreview.test.tsx`

**Props (spec §6.1):**

```ts
type ExamFolderPreviewProps = {
  materialFilenames: string[];
  requiredFiles: Array<{
    pattern: string;
    deliverableType: 'document' | 'code_project' | 'image';
    language?: string | null;
    entries: string[];
  }>;
};
```

**UI:**

```
Thư mục bài thi (máy sinh viên)
├── Được phát
│   ├── … | (trống) — chưa upload đề/tài liệu
└── Phải nộp
    ├── pattern [→ sample nếu templated]
    │     · loại / ngôn ngữ / trong nén (khi có)
    └── (trống) — chưa khai file phải nộp
```

- `role="region"`, `aria-label="Preview thư mục bài thi"`.
- `font-mono` cho tên file; không Card lồng Card.
- Lọc `pattern.trim() === ''` khỏi nhánh nộp.
- Nhãn loại: Tài liệu / Mã nguồn / Ảnh chụp (cùng map với input).

- [x] **Step 1:** Implement component + import `previewFilenamePattern` / `isTemplatedFilename`.
- [x] **Step 2:** Test 5 case spec §8: 0 material; có material; token `→`; entries; 0 required.
- [x] **Step 3:** `pnpm --filter web test -- ExamFolderPreview`.

---

# Phase 3 — Wire hub + checklist

## Task 4: Editor + page

**Files:**
- Modify: `RequiredDeliverablesEditor.tsx`
- Modify: `apps/web/src/app/teacher/exam-sessions/[id]/page.tsx`

**Editor khi `mutable`:**

- Props thêm `materialFilenames: string[]`.
- Sau form / nút lưu: `<ExamFolderPreview materialFilenames={…} requiredFiles={map từ useWatch} />`.
- Map watch: `pattern: value`, `entries: entries?.map(e => e.value) ?? []`, type/language như form.
- Nút: **Lưu cấu hình thư mục**; toast success: **Đã lưu cấu hình thư mục bài thi**.

**Page:**

- Card title: **Cấu hình thư mục bài thi**.
- Description mutable / khoá theo spec §4.
- `materialFilenames = (materials.data ?? []).map((m) => m.fileName)`.
- Mutable: truyền vào editor.
- Không mutable: thay `<ul>` bằng `ExamFolderPreview` từ `session.requiredDeliverables` (`pattern: requiredFilename`, `entries`, …); empty → cây với placeholder nộp (không cần list text riêng — hoặc giữ một dòng empty nếu muốn; ưu tiên chỉ preview).

- [x] **Step 1:** Đổi copy card + wire materials vào editor.
- [x] **Step 2:** Live preview trong editor; preview khoá trên page.
- [x] **Step 3:** Smoke thủ công hoặc test nhẹ nếu có — hub scheduled gõ token thấy `→` sample; upload đề thấy nhánh Phát.

---

## Task 5: Checklist + create page + docs note

**Files:**
- Modify: `SetupChecklist.tsx` + `SetupChecklist.test.tsx`
- Modify: `apps/web/src/app/teacher/exam-sessions/new/page.tsx`
- Modify (một dòng mỗi file):  
  `docs/superpowers/specs/2026-10-18-exam-session-create-slim-design.md`  
  `docs/superpowers/specs/2026-10-18-exam-session-setup-edit-flow-design.md`

**Copy:**

- blockReason: `Hãy cấu hình thư mục bài thi (ít nhất 1 file nộp) trước khi mở phiên.`
- Test: đổi `/file bắt buộc/` → khớp chuỗi mới (vd. `/thư mục bài thi/`).
- `new/page` description: nhắc **Thư mục bài thi** và rubric ở bước Thiết lập.
- Docs: một dòng “Nhãn UI hub: Cấu hình thư mục bài thi — xem exam-folder-config-preview-design; luật ≥ 1 deliverable không đổi.”

- [x] **Step 1:** Đổi checklist + test.
- [x] **Step 2:** Đổi description trang tạo.
- [x] **Step 3:** Ghi chú docs liên quan.
- [x] **Step 4:** Chạy test web liên quan: `ExamFolderPreview`, `SetupChecklist`, `RequiredFilenamesInput`, `schema` nếu đụng.

---

## Tiêu chí xong (spec §10)

1. Hub title = Cấu hình thư mục bài thi.
2. Preview hai nhánh đúng với materials + form/session.
3. Sau mở: preview khoá, không list đĩa thiếu ngữ cảnh phát/nộp.
4. Checklist / toast / nút / legend khớp §4.
5. Test Phase 1–3 xanh; không đụng API.
