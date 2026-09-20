# Phân biệt trạng thái của lượt phản biện — thiết kế

**Ngày:** 2026-09-20 · **Baseline:** `main` = `3cf4688` · **Trạng thái:** spec, chưa implement
**Phạm vi:** một cột + một chỗ ghi. Sửa **code đang chạy**, tách riêng khỏi hai spec lớn.

---

## 0. Lỗi

`advocate_opinion` là `null` trong **ba tình huống khác hẳn nhau**, và không ai
phân biệt được:

| Tình huống | Chỗ trong code | Nghĩa thật |
|---|---|---|
| Không cần phản biện | `grading.service.ts:96` — `!needsAdvocate` | Bài sạch, đúng thiết kế |
| Cố ý bỏ qua | `grading.service.ts:99` — `loadedLevel === 'rubric_only'` | Phiên không có đề bài |
| **Lượt phản biện HỎNG** | `grading.service.ts:135` — `catch` nuốt lỗi | **Đã cố chạy và thất bại** |

Việc nuốt lỗi ở ca thứ ba là **đúng** và spec này không đụng tới: giá trị của
Advocate là phụ trợ, giá trị của lượt chấm là chính. Cái sai là **kết quả của ba
ca cùng ghi ra một giá trị `null`.**

## 1. Vì sao nó quan trọng hơn vẻ ngoài: nó làm bẩn SỐ LIỆU của đồ án

Hậu quả không nằm ở lúc chạy. Nó nằm ở `scripts/calibration/`.

`export.py` **suy ra** nhánh A/B/C/D từ `context_used_question`,
`context_used_model_answer` và **`advocate_opinion`**. README của thư mục đó nói
rõ vì sao phải suy ra thay vì gõ tay: *"gõ tay là mở cửa cho việc gán nhãn theo
thứ người ta tin là đã chạy thay vì thứ đã chạy thật."*

Nhưng phép suy ra đó đang đọc một tín hiệu mơ hồ. **Một phiên mà agent phản biện
crash sẽ được xếp vào nhánh B như thể nó chưa từng được bật.** Tức là:

- Nhánh C bị **thiếu** đúng những bài mà phản biện gặp khó nhất.
- Nhánh B bị **lẫn** những bài đáng lẽ thuộc C.
- Và phép so sánh "phản biện có giúp không" — một trong bốn câu hỏi mà cả phần
  calibration tồn tại để trả lời — được tính trên hai tập đã nhiễm nhau.

README cũng đã có sẵn tiền lệ cho đúng lớp lỗi này: nhánh `?` dành cho bài chấm
trước khi hệ thống biết ghi mức ngữ cảnh, kèm cảnh báo **"đừng gộp vào A — gộp là
bịa ra một sự thật lịch sử."** Ca này giống hệt, chỉ là chưa ai nhận ra.

## 2. Sửa

Thêm **một cột** `grading_result.advocate_outcome`, kiểu enum:

```
'not_needed'  -- bài không có lỗi nào cần phản biện
'skipped'     -- phiên không có đề bài để đối chiếu
'failed'      -- đã gọi và hỏng
'completed'   -- có ý kiến, nằm ở advocate_opinion
```

- **`advocate_opinion` giữ nguyên hình dạng và ý nghĩa.** Không đụng.
- Cột mới ghi trong **cùng một `update()`** với `ai_total_score`, và **phải thêm
  vào danh sách của `guard_grading_result_ai_immutable` trong cùng migration** —
  quên bước đó thì cột mới sửa được sau khi chấm, phá Security rule 6 mà không ai
  thấy (§7.2 của `grading-system-guide.md`).
- Dòng đã chấm trước migration để `NULL`, **không backfill**. Không suy ra được
  thì đừng đoán; `export.py` đã có nhánh `?` cho đúng loại dữ liệu này.

`export.py` đổi theo: nhánh suy ra từ `advocate_outcome === 'completed'` thay vì
từ `advocate_opinion IS NOT NULL`, và `'failed'` **không** được gộp vào B.

> **Nguyên tắc rút ra, đáng ghi vào `CLAUDE.md`:** một giá trị rỗng không bao giờ
> được mang nhiều hơn một ý nghĩa nếu có chỗ nào đọc nó để ra quyết định. Ở đây
> chỗ đọc là script sinh số liệu cho báo cáo tốt nghiệp.

## 3. Test bắt buộc

| Mã | Ca | Mức |
|---|---|---|
| **T-ADVO-1** | Bài sạch → `not_needed`, `advocate_opinion` vẫn `null` | unit |
| **T-ADVO-2** | Phiên `rubric_only` → `skipped` | unit |
| **T-ADVO-3** | Provider phản biện ném lỗi → `failed`, **bài vẫn được chấm bình thường** | unit |
| **T-ADVO-4** | Có ý kiến → `completed` và `advocate_opinion` không rỗng | e2e |
| **T-ADVO-5** | Cột mới nằm trong trigger bất biến, không sửa được sau khi chấm | e2e |
| **T-ADVO-6** | `export.py` xếp `failed` ra khỏi nhánh B | unit |

T-ADVO-3 là ca quan trọng nhất: nó khoá lại **cả hai vế** — trạng thái được ghi
đúng, **và** việc nuốt lỗi vẫn còn nguyên. Chỉ khoá vế đầu thì một lần refactor
biến lỗi phản biện thành lỗi chấm bài sẽ vẫn xanh.

## 4. Liên quan

- `docs/superpowers/specs/2026-09-20-grading-agent-investigator-design.md` §6.2 —
  cùng một nguyên tắc, áp ở tầng thiết kế: `unverified` phải tách khỏi
  `confirmed` và `refuted`. Spec này là bản vá tối thiểu cho hệ thống **đang
  chạy**; mục §6.2 là bản đầy đủ cho hệ thống **sẽ xây**.
- `scripts/calibration/README.md` — mục "Nhánh được SUY RA, không gõ tay".
