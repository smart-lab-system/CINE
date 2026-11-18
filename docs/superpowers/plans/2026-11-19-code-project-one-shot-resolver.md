# Plan — Code project one-shot content resolver

**Spec:** `docs/superpowers/specs/2026-11-19-code-project-one-shot-resolver-design.md`  
**Goal:** `code_project` đọc được `.java` (và ZIP chứa mã nguồn) trên đường `one_shot`, để DSA không còn 0đ vì nội dung rỗng.

---

## Task 1 — Helper trích text code (+ ZIP)

**Files:**
- Create: `apps/api/src/grading/content-resolver/code-project-text.ts`
- Create: `apps/api/src/grading/content-resolver/code-project-text.spec.ts`

- [x] File không phải archive → ủy quyền `extractText(bytes, declaredFilename)`
- [x] ZIP → lọc entry đuôi mã nguồn (gồm `.java`), decode UTF-8, bỏ `__MACOSX`/ẩn; ghép `// --- path ---\n…`
- [x] RAR / zip hỏng / không có nguồn → `''`
- [x] Tôn trọng `MAX_GRADING_INPUT_BYTES` ở tầng caller (resolver)

## Task 2 — `CodeProjectResolver` + đăng ký

**Files:**
- Create: `apps/api/src/grading/content-resolver/code-project-resolver.ts`
- Modify: `apps/api/src/grading/grading.module.ts`
- Modify: `apps/api/src/grading/content-resolver/content-resolver.spec.ts`
- Modify: `apps/api/src/grading/content-resolver/submission-content-resolver.ts` (comment)

- [x] `handles: 'code_project'`; trần byte như `DocumentResolver`
- [x] `useFactory` trả `[doc, code]`
- [x] Test registry: `for('code_project')` không ném; `.java` → text khác rỗng

## Task 3 — Docs trạng thái

- [x] Đánh dấu spec `implemented` khi test xanh

## Verify

```bash
cd apps/api && pnpm exec jest src/grading/content-resolver --no-cache
```

## Sau deploy (vận hành)

- Chấm lại phiên DSA đã 0đ (Lab VMware / session tương ứng).
