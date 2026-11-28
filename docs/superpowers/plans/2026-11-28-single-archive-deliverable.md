# Plan: Một gói nộp zip/rar

> **For agentic workers:** implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Hub Thư mục bài làm chỉ khai đúng 1 gói `.zip`|`.rar` (mặc định `{SOMAY}_{MSSV}_{HOTEN}.zip`) + entries tuỳ chọn.

**Spec:** [2026-11-28-single-archive-deliverable-design.md](../specs/2026-11-28-single-archive-deliverable-design.md)

---

### Task 1: Docs

- [x] Spec + plan này

### Task 2: Validation web + API

- [x] `schema.ts`: exact 1, đuôi archive
- [x] `ReplaceRequiredDeliverablesDto`: ArrayMaxSize(1) + archive filename constraint
- [x] Tests / fixtures

### Task 3: UI folder step

- [x] `RequiredFilenamesInput`: 1 dòng, bỏ Thêm file, copy mới, mặc định
- [x] `ArchiveEntriesField`: luôn hiện
- [x] `toDeliverableFormValues` default `{SOMAY}_{MSSV}_{HOTEN}.zip`

### Task 4: Copy agent + preview + tests

- [x] `exam-materials` / preview / related tests
