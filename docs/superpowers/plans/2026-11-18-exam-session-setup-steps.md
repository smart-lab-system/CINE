# Plan — Thiết lập phiên thi 5 bước + đáp án mẫu gói

**Spec:** `docs/superpowers/specs/2026-11-18-exam-session-setup-steps-design.md`  
**Ngày:** 2026-11-18

## Tasks

- [x] Task 1: API - migration `model_answer_package_kind` + load zip/file trong `GradingReferenceService` + prompt `<model_answer_files>`
- [x] Task 2: Web - `ModelAnswerPackageField` + jszip (file / folder / zip → answer-key)
- [x] Task 3: Stepper - `info` / `roster` / `folder` / `exam` / `review` + draft/commit/provider/page/review
- [x] Task 4: Gắn package field vào `ReferenceForm`
- [x] Task 5: Tests setup + API; cập nhật status spec

## Ghi chú triển khai

- Không multipart Nest cho đáp án mẫu.
- Alias: `materials`/`rubric` → `exam`; `folder` là id thật.
- `finishPlan` block step thư mục = `folder`.
