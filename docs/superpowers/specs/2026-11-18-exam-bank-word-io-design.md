# Kho đề — import / export Word

**Ngày:** 2026-11-18  
**Trạng thái:** implemented  
**Plan:** `docs/superpowers/plans/2026-11-18-exam-bank-word-io.md`  
**Format:** `docs/exam-bank/FORMAT-DE-THI.md`

---

## 1. Vấn đề

Kho đề chỉ soạn tay trên form. GV đã có đề Word theo mẫu cần đưa vào hệ thống; cũng cần tải đề đã lưu ra Word để in / phát SV.

## 2. Quyết định

| #   | Quyết định                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **Import:** parse `.docx` → JSON → **đổ form** tạo/sửa; GV kiểm tra rồi Lưu qua CRUD hiện có. Không tạo bản ghi khi chỉ parse. |
| D2  | **Export:** chỉ **Word** (`.docx`). PDF **không** làm.                                                                         |
| D3  | Format bắt buộc theo `FORMAT-DE-THI.md` (Heading loại đề + môn, dòng ngôn ngữ/project, `Câu N. (X điểm)`).                     |
| D4  | Dùng `mammoth` (đọc) + `docx` (ghi) đã có trong `apps/api`. Không lưu file gốc lên storage.                                    |
| D5  | `Yêu cầu độ phức tạp:` (nếu có) ghép vào `statement` — entity câu chưa có field riêng.                                         |
| D6  | Sau parse: `totalPoints` = tổng điểm các câu (để thỏa ràng buộc bằng nhau khi lưu).                                            |
| D7  | Quyền: `assertTeachesCourse` giống CRUD kho đề.                                                                                |

## 3. API

| Method | Path                              | Hành vi                                                                        |
| ------ | --------------------------------- | ------------------------------------------------------------------------------ |
| `POST` | `/exam-bank/parse-docx?courseId=` | Multipart `file` (`.docx`, ≤5MB). Trả draft JSON + `warnings[]`. Không ghi DB. |
| `GET`  | `/exam-bank/:id/export.docx`      | Stream attachment `de-thi-….docx`.                                             |

### Response parse

```ts
{
  examType: 'TK' | 'GK' | 'CK',
  language: PlaygroundLanguage,
  totalPoints: number,
  questions: { title?: string; statement: string; points: number }[],
  warnings: string[]
}
```

400 nếu thiếu loại đề / ngôn ngữ / câu, hoặc điểm câu ≤ 0.

## 4. UI

- Trang tạo / sửa: nút **Tải lên Word** → parse → remount form với giá trị mới; hiện warnings.
- Trang sửa + danh sách: nút **Tải Word** → download export.

## 5. Ngoài phạm vi

PDF; lưu file gốc; import đáp án / rubric / test; gắn phiên thi.
