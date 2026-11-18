# Format đề thi Word (kho đề / import–export)

API: `POST /exam-bank/parse-docx` (đổ form, không ghi DB) · `GET /exam-bank/:id/export.docx` (tải Word). PDF không hỗ trợ.

**File mẫu:** [`mau-de-thi.docx`](./mau-de-thi.docx)

Khớp kho đề: loại đề như phiên thi (`TK` | `GK` | `CK`), tiêu đề bắt buộc có loại + tên môn, dòng ngôn ngữ/project = playground.

---

## Cấu trúc bắt buộc

```
Đề thi {thường kỳ|giữa kỳ|cuối kỳ} — {Tên môn học}   ← Heading 1
Ngôn ngữ / project: {playground-id}                 ← bắt buộc
                                                      ← dòng trống
{mô tả dùng chung cho toàn đề…}                     ← tuỳ chọn
                                                      ← dòng trống
Câu 1. ({N} điểm)                                   ← đậm
{thân đề…}
Yêu cầu độ phức tạp: {…}                            ← tuỳ chọn, nghiêng
                                                      ← dòng trống
Câu 2. ({M} điểm)
…
```

**Mô tả** (tuỳ chọn): đoạn giữa dòng ngôn ngữ và câu 1 — hướng dẫn / quy định chung áp dụng mọi câu. Map DB: `course_exam.description`.

### Loại đề (cột `exam_type`, như phiên thi)

| Mã | Trong tiêu đề |
|---|---|
| `TK` | Đề thi thường kỳ — … |
| `GK` | Đề thi giữa kỳ — … |
| `CK` | Đề thi cuối kỳ — … |

Tiêu đề **không gõ tự do**: server / form dựng từ loại + tên môn catalog.

### Ngôn ngữ / project (`language` — playground)

Một trong: `c` | `cpp` | `java` | `python` | `static` | `spring-boot` | `vite-react` | `express`

Dòng Word chấp nhận:

- `Ngôn ngữ / project: cpp`
- hoặc `Ngôn ngữ: cpp` (alias khi parse)

### Đầu câu

`^Câu\s+(\d+)\.\s*\(([\d.,]+)\s*điểm\)\s*$`

---

## Ví dụ

```text
Đề thi giữa kỳ — Cấu trúc dữ liệu và giải thuật
Ngôn ngữ / project: cpp

Câu 1. (4 điểm)
Cho một mảng arr và một số nguyên k. Tìm tích lớn nhất của k phần tử liên tiếp.
Yêu cầu độ phức tạp: O(n) thời gian, O(1) phụ trợ

Câu 2. (6 điểm)
Cài đặt ngăn xếp bằng danh sách liên kết đơn.
```

Map DB: `exam_type`, `title` (dựng sẵn), `description?`, `language`, `total_points_hundredths` (trần điểm đề), các `course_exam_question`.

**Tổng điểm đề:** nhập trên form. Khi tổng điểm các câu vượt tổng điểm đề → OK cập nhật tổng đề / Cancel **hủy thay đổi điểm câu**. Khi lưu: mỗi câu điểm > 0 và tổng điểm đề **bằng** điểm đã phân bổ.

Không đưa đáp án / rubric / test vào file đề SV.
