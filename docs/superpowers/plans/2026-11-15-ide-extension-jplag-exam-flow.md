# JPlag trên phiên thi (detect → vs mẫu → vs SV) — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]` / `- [x]`) syntax for tracking.  
> Sau khi xong toàn bộ task trong plan: commit **theo từng Task** (một commit / task hoặc cặp code+docs), không gộp cả plan thành một commit.

**Goal:** Khi scan phát hiện extension không cho phép trên phiên thi, chạy JPlag snippet↔đáp án mẫu; khi SV nộp bài (và có extension cờ), chạy JPlag snippet↔mã nộp. Teacher xem dual similarity + highlight trong app.

**Architecture:** Extract `JplagRunner` từ demo → enqueue BullMQ từ scan classify và submission confirm → persist run/item + Storage → UI findings tái dùng `JplagComparisonViewer`.

**Tech Stack:** NestJS, TypeORM migration, BullMQ, JPlag JAR + JDK, Next.js teacher UI; `@swc/core` (JS/TS).

**Spec:** [`docs/superpowers/specs/2026-11-15-ide-extension-jplag-exam-flow-design.md`](../specs/2026-11-15-ide-extension-jplag-exam-flow-design.md)

**Builds on:** Snippet normalize plan; lab-mgmt scan/policy; demo jplag (`jplag-demo.service`, `jplag-report-parse`, browse viewer).

**Ngoài phạm vi:** Student↔student; JPlag cho extension allowlist; đổi agent scan protocol.

**Trạng thái:** Chưa implement (docs only).

---

## Global constraints

- Chỉ chạy JPlag khi extension **unauthorized** trên phiên.
- vs_model dedupe per `(examSessionId, versionId)`.
- vs_student chỉ sau submission confirm + SV có cờ.
- Temp stage + relative cwd (tránh report Windows hỏng).
- Roles: teacher \| admin cho findings; không trả comparison cho SV.
- Không so RAR (cùng `sourceFilesOf` / grading).

---

## File structure (dự kiến)

| File | Task | Việc |
|---|---|---|
| `apps/api/src/ide-extensions/jplag/jplag-runner.service.ts` (+ spec) | 1 | Core stage/run/parse |
| `apps/api/src/ide-extensions/jplag/jplag-demo.service.ts` | 1 | Demo gọi core |
| Migration + `ide_extension_jplag_run*.entity.ts` | 2 | Persist |
| `jplag-exam.service.ts` / worker / queue constants | 2–3 | Enqueue vs_model / vs_student |
| Hook `scans/batch` classify | 2 | Trigger vs_model |
| Hook submission confirm | 3 | Trigger vs_student |
| `apps/web` session/grading JPlag panel + viewer import | 4 | UI findings |

---

## Task 1: Extract JplagRunner + demo vẫn xanh

**Files:** `jplag-runner.service.ts`, refactor `jplag-demo.service.ts`, specs hiện có

- [ ] API thuần: `runDualComparison({ language, extensionItems, compareFiles })` → runs + buffers
- [ ] Giữ dual `text` + `language` (SWC JS/TS); constants/suffixes hiện có
- [ ] Demo multipart chỉ chuẩn bị inputs rồi gọi runner
- [ ] Unit: parse report (đã có) + smoke runner với fixture nhỏ nếu可行 không cần JAR trong CI
- [ ] `npx jest` jplag\* pass; demo browse vẫn chạy local

## Task 2: Persist + vs_model từ scan gate

**Files:** migration, entities, module register, `jplag-exam.service`, queue processor, hook scan

- [ ] Tables `ide_extension_jplag_run` (+ item nếu cần cho vs_model)
- [ ] Sau classify unauthorized: enqueue `jplag:vs-model` (idempotent)
- [ ] Worker: `getNormalizedSources` + load `model_answer_source_key` → runner → put Storage → update status
- [ ] Thiếu model source → `failed` + message rõ
- [ ] `GET` list/detail runs cho teacher theo `examSessionId`
- [ ] Manual `POST` retry vs-model

## Task 3: vs_student khi nộp bài

**Files:** submission confirm hook, worker, entities item

- [ ] Confirm nộp: nếu SV có unauthorized extension trên session → enqueue `jplag:vs-student`
- [ ] Worker: `sourceFilesOf(submission)` + snippets cùng `versionId` → runner → persist item (mssv, dual %)
- [ ] Idempotent per session+version+mssv+deliverable
- [ ] `GET` items + comparison payload / Presigned cho viewer
- [ ] Bỏ qua RAR / empty extract với status failed có lý do

## Task 4: Teacher UI

**Files:** web exam-session / grading; tái dùng `jplag-comparison-viewer.tsx`

- [ ] Panel “Extension trái phép” + trạng thái vs mẫu
- [ ] Bảng SV sau nộp: % text / % language; chọn run mở viewer (scroll pane + match)
- [ ] Client API helpers trong `ide-utilities.ts` hoặc module grading/session tương ứng
- [ ] Không expose API comparison cho role student

---

## Review focus

1. Không JPlag nếu không unauthorized.
2. vs_model không spam N lần / N SV cùng một version.
3. Windows report path + dual profile không regress demo.
4. Model answer / comparison không lọt ra SV.

---

## Tiêu chí xong

- [x] Spec + plan trong `docs/superpowers/`
- [ ] Task 1–4 code + migration + tests cần thiết
- [ ] Manual: scan cờ → vs_model completed; nộp bài → vs_student item + viewer

---

## Commit gợi ý (khi user yêu cầu commit)

```text
docs: add JPlag exam-flow spec/plan
refactor(api): extract JplagRunner from demo          # Task 1
feat(api): jplag vs-model from unauthorized scan      # Task 2
feat(api): jplag vs-student on submission confirm     # Task 3
feat(web): teacher jplag findings viewer              # Task 4
```
