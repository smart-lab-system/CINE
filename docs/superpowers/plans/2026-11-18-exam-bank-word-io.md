# Plan — Kho đề import / export Word

**Spec:** `docs/superpowers/specs/2026-11-18-exam-bank-word-io-design.md`  
**Ngày:** 2026-11-18

## Tasks

- [x] Spec + plan (file này)
- [x] `parse-course-exam-docx.ts` + unit tests
- [x] `build-course-exam-docx.ts` + unit tests
- [x] `POST /exam-bank/parse-docx` + `GET /exam-bank/:id/export.docx` + e2e
- [x] Web: API client + upload prefill form + tải Word (list/edit)
- [x] Cập nhật design kho đề / FORMAT nếu cần ghi chú IO

## Không làm

PDF; lưu file gốc S3; import đáp án/rubric; gắn phiên.
