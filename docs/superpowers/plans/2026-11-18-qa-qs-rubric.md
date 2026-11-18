# Plan — QA vs QS Rubric

**Spec:** `docs/superpowers/specs/2026-11-18-qa-qs-rubric-design.md`  
**Ngày:** 2026-11-18

## Đã làm

- [x] Taxonomy QA/QS + DSA = QS; thư viện QS; migration `kind` / approach; API lưu QS
- [x] Pilot `dsa-qs-01-largest-product`

## Quyết định backlog

| Hạng mục | Quyết định |
|---|---|
| UC33 resolve hướng | AI **gán hướng** lời giải; `kind` QA/QS do GV chọn lúc soạn (không do AI) |
| Import `dsa_vi_03` | Chỉ **question + rubric** (không solution/sub) |
| UI soạn QS | **Sau** kho đề theo môn |

## Đang / sẽ làm

1. **Kho đề theo môn** — `2026-11-18-course-exam-bank` (đang triển khai)
2. UI soạn QS gắn đề / nháp
3. Import Q+R từ `dsa_vi_03`
4. Gắn UC33: AI gán approach khi `kind=qs`
