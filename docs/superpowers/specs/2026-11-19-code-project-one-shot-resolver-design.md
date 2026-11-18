# Code project one-shot content resolver — thiết kế

**Ngày:** 2026-11-19  
**Trạng thái:** implemented  
**Liên quan:** `content-resolver/`; DSA / Java `one_shot`; `extract-text.ts`; `pipeline/source-files.ts` (investigator)

---

## 1. Vấn đề

Phiên DSA (Java) khai `deliverable_type = code_project` → pipeline `one_shot` (chấm bằng đọc mã). Registry chỉ đăng ký `DocumentResolver` (`document`). Gọi `resolvers.for('code_project')` ném lỗi → `gradeOne` / `SubmissionTextService` bắt lỗi → `content = ''` → AI chấm bài trống → 0đ; UI hiện “chưa đọc được nội dung” dù SV nộp `.java`.

## 2. Quyết định

| # | Quyết định |
|---|---|
| D1 | Thêm `CodeProjectResolver` (`handles: 'code_project'`), đăng ký cạnh `DocumentResolver`. |
| D2 | File đơn text (`.java`, `.py`, … theo `extractText`) → đọc UTF-8 / cùng trần byte+ký tự như document. |
| D3 | ZIP (magic byte): giải nén an toàn, lấy entry mã nguồn text, ghép thành một chuỗi có header đường dẫn cho AI + panel hồ sơ. |
| D4 | RAR / không có file nguồn / quá lớn → text rỗng (cùng hợp đồng `ResolvedContent`); không đoán nội dung nhị phân. |
| D5 | Không đổi investigator (`cpp`/`python` sandbox). Resolver one-shot **không** cần `language` trên chữ ký `resolve` - lọc theo đuôi file nguồn phổ biến. |
| D6 | `image` vẫn chưa có resolver (ngoài phạm vi). |
| D7 | Sau deploy: **chấm lại** các bài đã 0đ vì nội dung rỗng - bản ghi cũ không tự sửa. |

## 3. Hợp đồng

```
ContentResolverRegistry.for('code_project') → CodeProjectResolver
resolve(bytes, declaredFilename) → { text }
```

- `text` rỗng = không đọc được (sự thật trích xuất).
- Cùng resolver cho lúc chấm và lúc mở hồ sơ (`SubmissionTextService`).

## 4. Ngoài phạm vi

- Sandbox chạy Java / đổi `pipelineFor` sang investigator.
- Đổi copy UI AnswerPane (câu zip/pdf generic).
- Tự động regrade mọi phiên đã chạy.
