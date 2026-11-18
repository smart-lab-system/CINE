# Agent Quản lý — kỳ thi hôm nay + máy giảng viên — Implementation Plan

**Goal:** Sau login GV trên agent Quản lý, chọn kỳ thi bắt đầu hôm nay; mỗi phòng có đúng 1 máy GV trên master-data; chỉ máy đó chạy Hub/đề xuất khi phòng đã gắn máy GV; admin gắn lại được.

**Spec:** [`../specs/2026-11-18-agent-mgmt-today-exams-teacher-machine-design.md`](../specs/2026-11-18-agent-mgmt-today-exams-teacher-machine-design.md)

---

## Task 1: Migration + entity computer

- [x] `is_teacher_machine`, `agent_machine_id`
- [x] Partial unique index room + is_teacher_machine

## Task 2: Master-data set teacher machine + UI

- [x] DTO/service/controller `setTeacherMachine`
- [x] Web computers column + action

## Task 3: Accept proposal sets teacher flag

- [x] `acceptCreateRoom` set cờ + agent_machine_id

## Task 4: API today + verify

- [x] `GET /exam-sessions/mgmt/today`
- [x] `POST /ide-extensions/lab/teacher-machine/verify`

## Task 5: Agent UI + runtime

- [x] Login auth-only → pick exam → start hub with verify
- [x] Hub shows session context; set course/exam on sync
