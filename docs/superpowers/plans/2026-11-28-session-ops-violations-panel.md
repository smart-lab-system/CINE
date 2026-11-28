# Extension vi phạm trên Vận hành phiên thi — Implementation Plan

> **For agentic workers:** COMPLETE ALL TASKS BEFORE COMMITS. Use hyphen `-` in copy.

**Goal:** Session-scoped 2B violations panel on live ops + auto JPlag after extract.  
**Spec:** [`docs/superpowers/specs/2026-11-28-session-ops-violations-panel-design.md`](../specs/2026-11-28-session-ops-violations-panel-design.md)

---

## Task 1: API violations filter + enrich

- [x] `ViolationsQueryDto` + `listViolations(examSessionId?)`
- [x] Enrich publishedAt / jplag / extract / primaryVersionId
- [x] Specs

## Task 2: JPlag pipeline race fix

- [x] `processVsModel` defer when catalog/extract not ready
- [x] `onVersionExtractReady` hook from extract service

## Task 3: Web panel + browse deep-link

- [x] Client `listViolations(examSessionId?)`
- [x] `SessionViolationsPanel` on live page
- [x] Browse `?view=normalized`
- [x] Tests
