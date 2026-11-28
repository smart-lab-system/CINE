# Plan: Agent tự đóng gói bài nộp zip/rar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lúc finalize/recollect, agent pack workspace (đã ignore) vào deliverable `.zip`/`.rar` rồi upload.

**Architecture:** `collectPackFiles` (blocklist dirs) → `packSubmissionArchives` (JSZip / WinRAR) → gọi từ `collectAll` trước `uploadAllDeliverables`.

**Tech Stack:** agent (TypeScript, vitest, jszip, child_process cho Rar.exe), web copy (RequiredFilenamesInput).

**Spec:** [2026-11-28-submission-archive-auto-pack-design.md](../specs/2026-11-28-submission-archive-auto-pack-design.md)

---

### Task 1: Mở rộng ignore + collectPackFiles

- [x] Mở rộng `IGNORED_DIRECTORIES` trong `apps/agent/src/snapshot.ts`
- [x] Thêm `collectPackFiles` + hằng trần pack + test

### Task 2: packSubmissionArchives

- [x] Module `apps/agent/src/pack-submission-archive.ts` + test (zip; rar fail khi không có WinRAR / inject mock)

### Task 3: Wire collectAll

- [x] Gọi pack trong `session-controller.ts` trước upload

### Task 4: Copy hướng dẫn + UI

- [x] `exam-materials.ts` + test
- [x] `RequiredFilenamesInput.tsx` + test
