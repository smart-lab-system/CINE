# Form tạo phiên thi gọn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Form tạo phiên chỉ còn lớp / phòng / loại kỳ / tên / giờ bắt đầu–kết thúc. Rubric và file bắt buộc chuyển sang hub **Thiết lập**; mở phiên bị chặn nếu chưa có ≥ 1 file bắt buộc.

**Architecture:** Ba phase tuần tự. Phase A nới create (0 deliverable, không rubric trên form) + thu hẹp UI create + checklist chặn mở. Phase B thêm `PUT …/required-deliverables` và form sửa file trên hub; `open` assert ≥ 1 file. Phase C dọn DTO/compat, shared components, cập nhật docs setup-edit. Rubric gắn qua `PATCH` grading đã có (`RubricRow`) — không viết API rubric mới.

**Tech Stack:** NestJS 11, TypeORM 0.3, class-validator, Jest e2e; Next.js App Router, RHF + Zod, TanStack Query, Vitest; OpenAPI `@cine/shared` regenerate khi đổi contract HTTP.

**Spec:** `docs/superpowers/specs/2026-10-18-exam-session-create-slim-design.md`

**Phụ thuộc:** Hub `/teacher/exam-sessions/[id]` + status `scheduled` từ [setup-edit-flow](./2026-10-18-exam-session-setup-edit-flow.md) đã có (hoặc đang implement). Plan này **không** làm lại lifecycle scheduled/open.

**Ngoài phạm vi:** sửa filenames sau `active`; wizard tạo nhiều bước; đổi luật pinned-rubric lúc chấm; PATCH từng deliverable (chỉ PUT replace cả list); sửa tên/lớp/loại kỳ sau tạo.

**Quyết định mặc định (spec §12):**
1. Create DTO: Phase A giữ `requiredFilenames` / `rubricId` **optional deprecated**; Phase C xoá khỏi create nếu không còn caller.
2. PUT body: `@ArrayMinSize(1)` — không cho lưu danh sách rỗng.
3. Chỉ PUT replace cả list — không PATCH từng dòng.

---

## Verified facts (2026-10-18)

- Form tạo: `apps/web/src/app/teacher/exam-sessions/new/page.tsx` — có `RubricPicker` + `RequiredFilenamesInput`; schema Zod bắt `requiredFilenames.min(1)`.
- Hub: `…/teacher/exam-sessions/[id]/page.tsx` — khối File **chỉ đọc** + copy “huỷ + tạo lại”; `RubricRow` đã gắn được.
- `SetupChecklist`: chặn theo status/giờ; rubric/đề chỉ **cảnh báo** — chưa kiểm số deliverable.
- `CreateExamSessionDto.requiredFilenames`: `@ArrayMinSize(1)` bắt buộc; `rubricId?` optional.
- `ExamSessionService.create()`: insert session (`scheduled`) + map `dto.requiredFilenames` → `RequiredDeliverable` + entries; gán `rubricId` nếu có.
- Rubric sau tạo: `PATCH` qua grading controller (`SetSessionRubricDto`) — hub đã dùng, không đụng create.
- **Không** có route sửa danh sách deliverables sau create.
- E2E create hầu hết gửi `requiredFilenames: […]`; helper `apps/api/test/helpers/open-session.ts` gọi `POST …/open` sau create.
- Client: `CreateExamSessionInput.requiredFilenames` bắt buộc trong `lib/api/exam-session.ts`; OpenAPI `packages/shared/src/api/schema.d.ts` cũng bắt buộc.
- Setup-edit plan/spec vẫn nói “không PATCH deliverables” / “filenames bất biến sau create” — **override** bởi create-slim.

---

## Global constraints

- Create được với **0** deliverable và `rubricId = null`.
- **Mở phiên** (`POST …/open`) yêu cầu ≥ 1 `required_deliverable` (UI checklist + API assert).
- File bắt buộc chỉ sửa khi `status === 'scheduled'` (chưa freeze).
- Sau `active`: deliverables bất biến; copy hub: “khoá sau khi mở”, không còn “huỷ + tạo lại” làm đường chính khi còn `scheduled`.
- Không nới `agent:join` / collection phase / finalize.
- Validation filename / entries / type / language **reuse** constraint hiện có của create DTO (tách shared class nếu cần).
- E2E: Postgres docker `.env.test` (`localhost:5442`); cấm `apps/api/.env` cloud.
- Commit theo task khi user yêu cầu; không push/PR đến khi được bảo.

---

## File structure

| File | Phase | Trách nhiệm |
|---|---|---|
| `apps/api/src/exam-session/dto/create-exam-session.dto.ts` | A → C | Optional rồi xoá `requiredFilenames` / `rubricId` |
| `apps/api/src/exam-session/dto/replace-required-deliverables.dto.ts` | B | Body PUT — reuse nested `RequiredFilenameDto` |
| `apps/api/src/exam-session/exam-session.service.ts` | A–B | `create()` 0 file; `replaceRequiredDeliverables()`; `open` assert |
| `apps/api/src/exam-session/exam-session.controller.ts` | B | `PUT :id/required-deliverables` |
| `apps/api/src/exam-session/session-roster.service.ts` (hoặc open path) | B | Assert ≥ 1 deliverable trước/trong freeze |
| `apps/api/test/**` (create / lifecycle / archive) | A–B | Create không file; PUT rồi open |
| `apps/web/.../new/page.tsx`, `schema.ts`, `schema.test.ts` | A | Bỏ rubric + filenames khỏi form |
| `apps/web/.../new/_components/RequiredFilenamesInput*` | A–C | Vẫn dùng; C có thể move shared |
| `apps/web/.../[id]/page.tsx` | A–B | Checklist deliverable; form PUT file |
| `apps/web/.../[id]/_components/SetupChecklist.tsx` (+ test) | A | `deliverableCount`; chặn mở nếu 0 |
| `apps/web/src/lib/api/exam-session.ts`, `hooks/useExamSession.ts` | A–B | Create input optional; mutation PUT |
| `packages/shared/src/api/schema.d.ts` | B (regen) | Sau đổi OpenAPI |
| `docs/.../2026-10-18-exam-session-setup-edit-flow-design.md` | C | §5.2 / §6 trỏ create-slim |

---

## Review focus

1. Form tạo không còn UI/schema field rubric hay file bắt buộc.
2. Create API chấp nhận body không `requiredFilenames` / không `rubricId` → session `scheduled`, `requiredDeliverables: []`.
3. Hub `scheduled` lưu được ≥ 1 file; sau open không sửa được.
4. `open` và checklist **chặn** khi 0 file; rubric thiếu chỉ cảnh báo.
5. Không regression agent join / thu bài khi deliverables khai ở setup thay vì create.
6. Setup-edit docs không còn nói “filenames bất biến ngay sau create” mà không ghi override.

---

# Phase A — Create gọn + checklist chặn thiếu file

## Task A.1: Nới `CreateExamSessionDto` + `create()`

**Files:**
- Modify: `apps/api/src/exam-session/dto/create-exam-session.dto.ts`
- Modify: `apps/api/src/exam-session/exam-session.service.ts` (`create`)
- Modify: `apps/api/src/exam-session/dto/create-exam-session.dto.spec.ts`

**Hợp đồng:**

| Body create | Kết quả |
|---|---|
| Không có `requiredFilenames` / `[]` | 201, `requiredDeliverables: []` |
| Có `requiredFilenames` (≥ 1) | 201 như cũ (compat e2e / client cũ) |
| Không có `rubricId` | `rubricId: null` |
| Có `rubricId` hợp lệ | vẫn gắn (deprecated path) |

**Cách làm:**

```ts
// create-exam-session.dto.ts — tạm Phase A
@IsOptional()
@IsArray()
@ArrayMinSize(1) // chỉ khi field có mặt và không phải []
// HOẶC: cho phép [] bằng cách bỏ ArrayMinSize và treat missing/[] như không insert
@Validate(UniqueFilenamesConstraint)
@Transform(...)
@ValidateNested({ each: true })
requiredFilenames?: RequiredFilenameDto[];

// Comment: deprecated — dùng PUT …/required-deliverables (spec create-slim).
```

Trong `create()`:

```ts
const filenames = dto.requiredFilenames ?? [];
// chỉ manager.save deliverables khi filenames.length > 0
// bỏ early BadRequest nếu thiếu filenames
```

Giữ logic validate rubric ownership nếu `dto.rubricId` còn được gửi.

- [x] **Step 1:** Optional hóa DTO; cập nhật unit DTO spec (ca thiếu filenames hợp lệ; ca `[]` theo quyết định: chấp nhận = không insert).
- [x] **Step 2:** `create()` không crash khi `undefined`/`[]`; vẫn insert khi có list.
- [x] **Step 3:** `tsc` api sạch; chạy `create-exam-session.dto.spec.ts`.

---

## Task A.2: Thu hẹp form + schema web

**Files:**
- Modify: `apps/web/src/app/teacher/exam-sessions/new/page.tsx`
- Modify: `apps/web/src/app/teacher/exam-sessions/new/schema.ts`
- Modify: `apps/web/src/app/teacher/exam-sessions/new/schema.test.ts`
- Modify: `apps/web/src/lib/api/exam-session.ts` (`CreateExamSessionInput`)
- Optional: bỏ import `RubricPicker` / `RequiredFilenamesInput` khỏi page (giữ file component cho hub Phase B)

**UI còn lại (thứ tự):** Lớp thi → Phòng thi → Loại kỳ → Tên → Bắt đầu → Kết thúc.

**Copy:**

- Page description: *“Khai báo lớp, phòng, loại kỳ và khung giờ. File bắt buộc và rubric gắn ở bước Thiết lập sau khi tạo.”*
- Success CTA chính: **Thiết lập phiên** (đã có) — xác nhận không đổi sang lobby làm mặc định.

**Schema:** xoá `rubricId` và `requiredFilenames` khỏi Zod + `EMPTY_FORM` + `onSubmit` payload.

**Client type:** `requiredFilenames?` và `rubricId?` optional trên `CreateExamSessionInput` (khớp DTO Phase A). Nếu OpenAPI generated vẫn bắt buộc cho đến regen Phase B: dùng type assertion tại call site **hoặc** gửi `requiredFilenames: []` tạm — ưu tiên optional + regenerate sớm nếu compile fail.

- [x] **Step 1:** Sửa schema + test (ca không còn filenames vẫn parse; ca cũ có filenames xoá hoặc chuyển sang test hub sau).
- [x] **Step 2:** Sửa page + `CreateExamSessionInput`; submit không gửi rubric/filenames.
- [x] **Step 3:** `pnpm --filter web test -- schema` (và test page create nếu có).
- [x] **Step 4:** Smoke thủ công / story: tạo phiên chỉ lịch → land hub, detail `requiredDeliverables: []`.

---

## Task A.3: Checklist hub — chặn mở khi 0 file

**Files:**
- Modify: `apps/web/src/app/teacher/exam-sessions/[id]/_components/SetupChecklist.tsx`
- Modify: `…/SetupChecklist.test.tsx`
- Modify: `…/[id]/page.tsx` (truyền `deliverableCount`)

**Hợp đồng checklist:**

```ts
interface SetupChecklistInput {
  // ...existing
  deliverableCount: number;
}

// canOpen = false nếu deliverableCount < 1
// blockReason: 'Hãy khai báo file bắt buộc trước khi mở phiên.'
// Rubric thiếu: vẫn chỉ warnings (không đổi)
```

Copy khối File trên hub (tạm, trước Phase B form):

- Nếu `mutable && deliverables.length === 0`: banner *“Chưa có file bắt buộc — sẽ khai ở đây trong bước tiếp (hoặc đợi Phase B).”*  
  **Thực tế Phase A:** giữ list chỉ-đọc + banner vàng; nút Mở disabled qua checklist. Không cần form PUT ở A.

- [x] **Step 1:** Thêm `deliverableCount` + test (0 → không mở; ≥1 + giờ OK → mở; thiếu rubric → warning).
- [x] **Step 2:** Wire từ `session.requiredDeliverables.length` trên hub.
- [x] **Step 3:** `pnpm --filter web test -- SetupChecklist`.

**Done Phase A khi:** form tạo gọn; create API/UI cho 0 file; hub không cho bấm mở khi chưa có file (UI); e2e create cũ vẫn xanh nhờ còn gửi filenames.

---

# Phase B — PUT deliverables trên hub + assert open

## Task B.1: DTO + service `replaceRequiredDeliverables`

**Files:**
- Create: `apps/api/src/exam-session/dto/replace-required-deliverables.dto.ts`
- Optionally extract shared: validation helpers từ create DTO sang `required-filename.dto.ts` nếu trùng
- Modify: `apps/api/src/exam-session/exam-session.service.ts`
- Create/modify: unit spec service hoặc DTO spec

**DTO:**

```ts
export class ReplaceRequiredDeliverablesDto {
  @IsArray()
  @ArrayMinSize(1)
  @Validate(UniqueFilenamesConstraint)
  @Transform(/* same as create */)
  @ValidateNested({ each: true })
  requiredFilenames!: RequiredFilenameDto[];
}
```

**Service (transaction):**

1. Load session; assert teacher owns; `status === 'scheduled'` (và chưa freeze nếu muốn defense-in-depth).
2. Delete entries + deliverables của session (cascade nếu FK đã CASCADE — xác nhận entity; nếu không CASCADE thì xoá entries trước).
3. Insert list mới + entries (copy logic từ `create()`).
4. Return detail DTO (reuse mapper hiện có).

409/400 nếu không còn `scheduled`.

- [x] **Step 1:** Viết DTO + reuse nested validation; unit test min size / unique / entries.
- [x] **Step 2:** Implement replace trong service; không đụng session khác field.
- [x] **Step 3:** Unit/service test: scheduled OK; active → reject; replace đổi danh sách.

---

## Task B.2: Controller route + OpenAPI regen

**Files:**
- Modify: `apps/api/src/exam-session/exam-session.controller.ts`
- Regenerate: `packages/shared` OpenAPI schema (theo script repo — thường `pnpm` generate từ Nest swagger)

```ts
@Put(':id/required-deliverables')
@Roles('teacher')
replaceRequiredDeliverables(
  @Param('id') id: string,
  @Body() dto: ReplaceRequiredDeliverablesDto,
  @Req() req: Request,
) {
  return this.sessions.replaceRequiredDeliverables(id, req.user!.sub, dto);
}
```

Đặt route **trước** các param catch-all nếu có xung đột (kiểm tra thứ tự `@Get(':id')` vs path cụ thể — Nest match static segment OK).

- [x] **Step 1:** Thêm endpoint; Swagger decorators (`@ApiOperation`, body type).
- [ ] **Step 2:** Regenerate OpenAPI / `@cine/shared` schema. *(deferred — client dùng `examFetch` + cast `as never` trên create)*
- [x] **Step 3:** `tsc` api sạch.

---

## Task B.3: `open` assert ≥ 1 deliverable

**Files:**
- Modify: chỗ `open` / `SessionRosterService.freeze()` (hoặc `ExamSessionService.open` nếu có wrapper)
- Modify: e2e liên quan

**Hợp đồng:** trước khi freeze/flip active, đếm deliverables; nếu 0 → `BadRequestException` message khớp checklist (*“Hãy khai báo file bắt buộc trước khi mở phiên.”*).

Không đổi idempotent open khi đã `active` + đã freeze.

- [x] **Step 1:** Assert trong open path.
- [x] **Step 2:** E2E: create không file → open 400; PUT 1 file → open 200.
- [x] **Step 3:** Chạy suite freeze / lifecycle liên quan.

---

## Task B.4: Hub UI — form file bắt buộc + client hook

**Files:**
- Modify: `apps/web/src/app/teacher/exam-sessions/[id]/page.tsx`
- Optionally create: `…/[id]/_components/RequiredDeliverablesEditor.tsx` (wrap `RequiredFilenamesInput` + Lưu)
- Modify: `apps/web/src/lib/api/exam-session.ts` — `replaceRequiredDeliverables(id, body)`
- Modify: `apps/web/src/hooks/useExamSession.ts` — mutation invalidate detail
- Reuse: `RequiredFilenamesInput` (+ schema Zod subset cho list filenames — extract `requiredFilenamesSchema` từ `new/schema.ts` nếu cần)

**UX:**

| Status | UI |
|---|---|
| `scheduled` | Form `RequiredFilenamesInput` prefill từ `session.requiredDeliverables`; nút **Lưu danh sách file** |
| Khác | List chỉ đọc; copy *“Danh sách đã khoá sau khi mở phiên.”* |

Prefill mapping: `requiredFilename` → `value`, `deliverableType`, `language`, `entries` → `{ value }[]`.

- [x] **Step 1:** API client + hook mutation.
- [x] **Step 2:** Editor trên hub; bỏ copy “huỷ + tạo lại” khi `scheduled`.
- [x] **Step 3:** Test component nhẹ (nếu có) hoặc manual: lưu → checklist cho mở.
- [x] **Step 4:** `pnpm --filter web test` các file đụng.

---

## Task B.5: E2E / fixture quét create có filenames

**Files (grep rồi sửa):**
- `apps/api/test/exam-session.e2e-spec.ts`
- `apps/api/test/session-rubric.e2e-spec.ts` / archive / authoring-attach / schedule-conflict — bất kỳ chỗ nào giả định create **bắt buộc** filenames
- Helper optional: `createScheduledSession(app, token, body)` rồi `putDeliverables` trước `openSession`

**Pattern chuẩn Phase B:**

```ts
const created = await postCreate({ /* no requiredFilenames */ });
expect(created.body.requiredDeliverables).toEqual([]);

await request(app.getHttpServer())
  .put(`/exam-sessions/${id}/required-deliverables`)
  .set(...)
  .send({ requiredFilenames: [{ filename: 'Cau1.docx' }] })
  .expect(200);

await openSession(app, token, id);
```

Giữ một số test vẫn gửi filenames trên create (compat) cho đến Phase C.

- [x] **Step 1:** `rg "requiredFilenames" apps/api/test` — liệt kê.
- [x] **Step 2:** Thêm ca create-slim + PUT; cập nhật ca open-without-files.
- [x] **Step 3:** `pnpm test:e2e` (hoặc jest e2e `--runInBand`) xanh các suite đã đụng.

**Done Phase B khi:** hub lưu file khi scheduled; open API+UI chặn 0 file; agent thấy deliverables sau PUT+open.

---

# Phase C — Dọn compat & docs

## Task C.1: Gỡ deprecated khỏi create DTO (nếu không còn caller)

**Files:**
- Modify: `create-exam-session.dto.ts` — xoá `requiredFilenames`, `rubricId` và logic gắn trong `create()`
- Modify: mọi e2e/fixture còn gửi field đó → chuyển sang PUT + PATCH rubric
- Regenerate OpenAPI
- Modify: `CreateExamSessionInput` web — xoá field

- [ ] **Step 1:** Grep caller còn gửi `requiredFilenames`/`rubricId` lúc create; sửa hết.
- [ ] **Step 2:** Xoá field + nhánh insert/rubric trong `create()`.
- [ ] **Step 3:** Regen OpenAPI; tsc + e2e create xanh.

---

## Task C.2: Shared components (optional nếu import ngược khó chịu)

**Files:**
- Move (nếu cần): `RequiredFilenamesInput`, `ArchiveEntriesField` từ `new/_components/` → ví dụ `apps/web/src/app/teacher/exam-sessions/_components/` hoặc `components/exam-session/`
- Update imports new + hub

- [ ] **Step 1:** Move + fix imports.
- [ ] **Step 2:** Test component vẫn xanh.

---

## Task C.3: Cập nhật docs setup-edit + status spec create-slim

**Files:**
- Modify: `docs/superpowers/specs/2026-10-18-exam-session-setup-edit-flow-design.md`
  - §5.2 item 3: file bắt buộc **sửa khi scheduled** (PUT); chỉ đọc sau open — trỏ create-slim
  - §6 hàng filenames: `scheduled` = Sửa; bỏ “Không”
  - §2 Ngoài phạm vi: xoá/ sửa dòng “không PATCH deliverables” → “không sửa sau active”
- Modify: `docs/superpowers/plans/2026-10-18-exam-session-setup-edit-flow.md` — Global constraints tương tự nếu còn “Không PATCH deliverables”
- Modify: `docs/superpowers/specs/2026-10-18-exam-session-create-slim-design.md` — **Trạng thái:** `implementing` / `done` theo tiến độ

- [x] **Step 1:** Patch docs như trên.
- [x] **Step 2:** Đánh dấu task plan này `[x]` khi merge.

**Done Phase C khi:** một nguồn sự thật docs; create DTO sạch; không import path xấu.

---

## Tiêu chí chấp nhận (toàn plan)

- [x] Form tạo chỉ còn lớp, phòng, loại kỳ, tên, giờ bắt đầu/kết thúc.
- [x] Tạo → `scheduled`, 0 deliverable, không rubric — OK.
- [x] Hub: gắn rubric + lưu ≥ 1 file khi `scheduled`.
- [x] Sau `active`: không sửa file; open từ chối nếu 0 file.
- [x] Rubric thiếu: mở được, checklist cảnh báo.
- [x] E2E create-slim path xanh (`create không file → PUT → open`).

---

## Thứ tự thi công gợi ý

```
A.1 (API nới create)
  → A.2 (UI form gọn)  → A.3 (checklist)
  → B.1–B.2 (PUT API) → B.3 (open assert) → B.4 (hub form) → B.5 (e2e)
  → C.1–C.3 (dọn)
```

Phase A có thể ship riêng (GV tạo nhanh; phải dùng create kèm filenames qua API/e2e hoặc đợi B để khai file trên UI hub). **Không** merge Phase A lên môi trường demo giảng viên thật nếu chưa có Phase B — trừ khi tạm hướng dẫn gửi filenames qua API. Ưu tiên **A+B cùng PR** hoặc B ngay sau A trong cùng nhánh.
