# Biểu mẫu Excel kỳ thi — Kế hoạch triển khai

> **Dành cho agent/executor:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (khuyến nghị) hoặc
> superpowers:executing-plans để làm từng task. Checkbox (`- [ ]`) để
> theo dõi.

**Goal:** Người dùng đã đăng nhập (admin / Trưởng khoa / GV) mở trang
**Biểu mẫu**, chọn một trong ba loại, tải `.xlsx` đúng header + (tuỳ chọn)
dòng mẫu — sinh hoàn toàn ở trình duyệt bằng `exceljs`. Không API file,
không entity mới.

**Architecture:** Constant schema + sample trong `apps/web/src/lib/exam-forms/`;
builder workbook + trigger download; một component UI dùng chung; ba route
mỏng dưới `/admin|department|teacher/forms`; nav item ở cả ba area.

**Tech Stack:** Next.js App Router · React 19 · exceljs (đã có trong
`apps/web`) · Vitest · Tailwind + UI kit hiện có (`Button`, `Card`,
`PageHeader`, …)

**Spec:** `docs/superpowers/specs/2026-09-18-exam-form-excel-templates-design.md`
— executor **phải đọc** (đặc biệt §3, §4–§6, §8 đã chốt). `§N` dưới đây
trỏ spec đó.

**Nhánh:** `feature/seed-data-api` (tiếp tục; chưa cần PR riêng cho slice này)

**Quyết định đã chốt (spec §8):**

1. Mẫu 3 **không** có cột `MMSV`.
2. Mẫu 3 thêm `Ngay_Thi`, `Ca_Thi`, `Phong_Thi` trên lưới (§6.1).
3. `HinhThuc_Thi` = chuỗi tự do 1–100 ký tự.
4. Mọi role đã map đều tải được.

---

## Global Constraints

- **Không** endpoint NestJS trả `.xlsx` / nhận upload template.
- **Không** entity / migration / seed API mới.
- Header cột phải **khớp từng ký tự** bảng §4.1 / §5.1 / §6.1 — không đổi
  tên vì “đẹp hơn”.
- Sample data dùng số liệu hình production (mã HP `4220004247`, phòng
  `Phòng máy H1.1`, MSSV từ fixture) — khớp bảng sample trong spec.
- Download chỉ chạy ở client (`'use client'` hoặc dynamic import exceljs
  giống `read-workbook.ts`).
- **Không** đưa logic sinh file vào `packages/shared` trừ khi thực sự cần
  API types — slice này chỉ web.
- **Commit:** mỗi task một commit, dạng `feat(forms): …` /
  `test(forms): …` / `docs(forms): …`.

### Definition of Done (mọi task)

- [ ] Acceptance task pass
- [ ] Header / sample khớp spec (không lệch cột)
- [ ] Self-review: không PlaceholderPage trên `/…/forms`

---

## File Structure

**Tạo mới**

| File | Trách nhiệm |
| --- | --- |
| `apps/web/src/lib/exam-forms/types.ts` | `ExamFormKind`, column/row types |
| `apps/web/src/lib/exam-forms/schemas.ts` | Header arrays + metadata (sheet name, label) theo §3.1 / §4–§6 |
| `apps/web/src/lib/exam-forms/samples.ts` | Sample rows đúng bảng sample spec |
| `apps/web/src/lib/exam-forms/split-name.ts` | `splitStudentName` (§6.2) — dùng sample + phase sau |
| `apps/web/src/lib/exam-forms/build-workbook.ts` | Pure-ish: kind + includeSamples → `{ filename, bytes }` / workbook |
| `apps/web/src/lib/exam-forms/download.ts` | Browser download trigger (Blob + `<a download>`) |
| `apps/web/src/lib/exam-forms/index.ts` | Re-export public API |
| `apps/web/src/lib/exam-forms/*.test.ts` | Unit tests |
| `apps/web/src/components/exam-forms/ExamFormsPage.tsx` | UI chọn loại + toggle sample + tải |
| `apps/web/src/app/admin/forms/page.tsx` | Route mỏng |
| `apps/web/src/app/department/forms/page.tsx` | Route mỏng |
| `apps/web/src/app/teacher/forms/page.tsx` | Route mỏng |

**Sửa**

| File | Thay đổi |
| --- | --- |
| `apps/web/src/lib/nav-config.ts` | Thêm `{ label: 'Biểu mẫu', href: '…/forms', icon: FileSpreadsheet }` vào cả ba nav |
| Spec (nếu lệch nhỏ khi code) | Chỉ sửa khi discover lỗi; không đổi §8 |

**Không tạo trong plan này**

- API / migration / entity CBCT
- Fill từ `exam_session`
- Script Node ghi sẵn 3 file vào `scripts/` (tuỳ chọn sau; không bắt buộc)

---

## Header — nguồn sự thật (copy đúng)

Executor copy **đúng thứ tự** vào `schemas.ts`:

**`lich-thi-tong-hop`**

```
STT, Ma_HocPhan, Ten_HocPhan, Ma_LopHP, HinhThuc_Thi, ThoiLuong_Phut,
Ngay_Thi, Ca_Thi, Gio_BatDau, Ma_PhongThi, SoLuong_ThiSinh, Ghi_Chu
```

**`phan-cong-cbct`**

```
STT, Ngay_Thi, Ca_Thi, Gio_Thi, Phong_Thi, Mon_Thi, SL_SV,
Ma_CBCT1, Ten_CBCT1, DonVi_CBCT1, Ma_CBCT2, Ten_CBCT2, DonVi_CBCT2, Ghi_Chu
```

**`ds-thisinh-theo-phong`**

```
STT, Ngay_Thi, Ca_Thi, Phong_Thi, Ma_Sinh_Vien, Ho_Dem, Ten, Ghi_Chu
```

Sheet names: `Lich_Thi_Tong_Hop` / `Phan_Cong_CBCT` / `DS_ThiSinh_Phong`.

---

## Task 0: Commit docs đã chốt

**Files:**
- Modify: `docs/superpowers/specs/2026-09-18-exam-form-excel-templates-design.md`
- Create: plan này

- [ ] **Step 1:** Xác nhận spec Status = Approved, §6 không còn `MMSV`,
  §8 đủ 4 chốt, §3 vai trò = mọi role đã map.
- [ ] **Step 2:** Commit
  `docs(forms): approve exam Excel template spec and add plan`.

---

## Task 1: Schema + samples + `splitStudentName` + tests

**Spec:** §3.1, §4–§6, §6.2

**Files:**
- Create: `types.ts`, `schemas.ts`, `samples.ts`, `split-name.ts`,
  `schemas.test.ts`, `split-name.test.ts`, `samples.test.ts` (hoặc gộp
  một file test)

- [ ] **Step 1:** Định nghĩa:

```ts
export type ExamFormKind =
  | 'lich-thi-tong-hop'
  | 'phan-cong-cbct'
  | 'ds-thisinh-theo-phong';

export interface ExamFormDefinition {
  kind: ExamFormKind;
  label: string;       // tên hiển thị VI
  sheetName: string;
  headers: readonly string[];
}
```

Ba definition trong mảng/`Record` — `headers` là `as const` khớp § Header
trên.

- [ ] **Step 2:** `samples.ts` — `Record<ExamFormKind, unknown[][]>` hoặc
  typed rows; giá trị **khớp bảng sample** spec (HinhThuc = `Thực hành máy`,
  không snake_case enum cũ).

- [ ] **Step 3:** `splitStudentName(full: string): { hoDem: string; ten: string }`
  theo §6.2. Test:
  - `'Nguyễn Hoàng Minh'` → `{ hoDem: 'Nguyễn Hoàng', ten: 'Minh' }`
  - `'Minh'` → cả hai `'Minh'`
  - trim / multi-space

- [ ] **Step 4:** Test schema: mỗi kind có đúng số cột; `headers[i]` khớp
  chuỗi kỳ vọng; sample mỗi dòng có `length === headers.length`.

- [ ] **Step 5:** Chạy `pnpm --filter web test -- exam-forms` (hoặc
  path file test). Commit `feat(forms): add exam form schemas and samples`.

---

## Task 2: Build workbook + download helper + tests

**Spec:** §3 (tên file, sheet), §7.1

**Files:**
- Create: `build-workbook.ts`, `download.ts`, `build-workbook.test.ts`

- [ ] **Step 1:** `buildExamFormWorkbook({ kind, includeSamples: boolean })`:
  - Dynamic/static import `exceljs` (Node-safe trong Vitest; browser dùng
    cùng API `Workbook`).
  - Sheet name từ definition.
  - Row 1 = headers.
  - Nếu `includeSamples` → append sample rows (ô trống `Ghi_Chu` / CBCT2
    để `''`).
  - Return `{ filename, buffer }` với
    `filename = \`${kind}_${yyyyMMdd_HHmm}.xlsx\`` (dùng đồng hồ injectable
    hoặc mock `Date` trong test — test chỉ assert prefix `${kind}_` và
    suffix `.xlsx` nếu tránh flaky).

- [ ] **Step 2:** Test (Vitest): build cả 3 kind; đọc lại bằng exceljs
  `workbook.xlsx.load(buffer)`; assert sheet name + row 1 headers + số
  dòng sample.

- [ ] **Step 3:** `downloadExamFormWorkbook` (client-only): tạo `Blob`,
  object URL, click `<a download>`, revoke URL. Không cần unit test nặng —
  có thể skip hoặc mock `URL.createObjectURL` nhẹ.

- [ ] **Step 4:** Commit `feat(forms): build and download exam form xlsx`.

---

## Task 3: UI `ExamFormsPage` + 3 routes + nav

**Spec:** §7.1–§7.2, §8.4

**Files:**
- Create: `ExamFormsPage.tsx`, ba `forms/page.tsx`
- Modify: `nav-config.ts`

**UI (gọn, khớp app hiện tại — không overbuild):**

- `PageHeader` title `Biểu mẫu`, mô tả ngắn: tải mẫu Excel hành chính kỳ thi.
- Danh sách 3 loại (card hoặc hàng): tên + một câu mô tả + nút **Tải mẫu**.
- Checkbox / switch: `Kèm dòng mẫu` (default `true`).
- Click → `await build…` → `download…`. Disable nút trong lúc đang sinh;
  `Alert` nếu lỗi.

Không bảng quy tắc đầy đủ trên UI (spec không bắt buộc) — có thể một dòng
hint “Header cố định theo quy định khoa / phòng đào tạo”.

**Nav:** import `FileSpreadsheet` (lucide-react). Thêm vào cuối (hoặc sau
Dashboard) mỗi nav:

| Nav | href |
| --- | --- |
| `ADMIN_NAV` | `/admin/forms` |
| `DEPARTMENT_NAV` | `/department/forms` |
| `TEACHER_NAV` | `/teacher/forms` |

**Routes:** mỗi `page.tsx`:

```tsx
'use client';
import { ExamFormsPage } from '@/components/exam-forms/ExamFormsPage';
export default function Page() {
  return <ExamFormsPage />;
}
```

- [ ] **Step 1:** Implement component + routes.
- [ ] **Step 2:** Cập nhật nav cả ba.
- [ ] **Step 3:** Smoke thủ công: login từng role → thấy nav → tải 1 file
  mở được trên Excel/LibreOffice (header đúng).
- [ ] **Step 4:** Commit `feat(forms): add Biểu mẫu page for all roles`.

---

## Task 4: Self-review + docs nhỏ (nếu cần)

- [ ] **Step 1:** Grep repo: không còn `MMSV` trong exam-forms; không
  `Thuc_hanh_may` enum trong sample.
- [ ] **Step 2:** Đánh dấu tiêu chí §9 spec (checkbox) nếu muốn — hoặc để
  PR description.
- [ ] **Step 3:** (Tuỳ chọn) Một dòng trong `DEMO-RUNBOOK.md` hoặc README
  “Biểu mẫu: `/…/forms`” — **chỉ nếu** runbook đã nói về UI hành chính;
  không bắt buộc.
- [ ] **Step 4:** Commit docs nếu có thay đổi; nếu không thì dừng sau Task 3.

---

## Out of scope (nhắc lại)

- Fill từ DB / phân công CBCT entity
- Import ngược 3 file
- `super_admin` (unmapped → vẫn `/unassigned-role`)
- PDF

---

## Lệnh thường dùng

```bash
pnpm --filter web test -- exam-forms
pnpm --filter web lint
pnpm --filter web build
```
