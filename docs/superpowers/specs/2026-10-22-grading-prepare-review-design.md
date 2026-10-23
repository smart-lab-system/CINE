# Xem lại bước chuẩn bị chấm

**Ngày:** 2026-10-22
**Trạng thái:** implemented (plan `docs/superpowers/plans/2026-10-22-grading-prepare-review.md`)
**Nhánh:** `feature/ui-revision`
**Liên quan:**
- [grading-ui-rebuild](./2026-09-23-grading-ui-rebuild-design.md) mục 1 và mục 3.7 — một route, ba trạng thái; màn chuẩn bị; tình huống *đã khoá*
- `apps/web/src/app/teacher/grading/page.tsx` — chỗ tự chọn màn
- `apps/api/src/grading/grading-lock.ts` — luật đóng băng thước

---

## 1. Vấn đề

Giảng viên chuẩn bị chấm trên `PreparePanel` (rubric, đề, đáp án mẫu, ghi chú, ngôn ngữ bài code, gói test). Bấm **Bắt đầu chấm** thì thước khoá. Ngay sau đó trang `/teacher/grading?sessionId=…` **không còn vẽ** bước chuẩn bị.

Luật chọn màn hôm nay (`page.tsx`):

| Điều kiện | Màn |
|---|---|
| Chưa có kết quả | Chuẩn bị (sửa được) |
| Còn bài đang chấm | Đang chấm |
| Đã có kết quả, không phải mọi bài đều không chấm được | Danh sách bài |
| Mọi kết quả đều không chấm được | Chuẩn bị mở lại (sửa được) |

Spec UI mục 3.7 đã mô tả tình huống *đã khoá: mọi dòng chỉ xem*. Route không bao giờ tới tình huống đó khi phiên đã có bài mang điểm hoặc đang chấm. Phần còn lại trên màn danh sách chỉ là một dòng nguồn thước (`RulerOriginNote`) khi gói test do hệ thống sinh.

Giảng viên không xem lại được: rubric phiên bản nào đã ghim, file đề nào, đáp án mẫu từ đâu, ghi chú đã viết, ngôn ngữ từng file code, gói test nào đang ghim và các ca của gói đó.

---

## 2. Quyết định

Xem lại là **chỉ đọc**. Không mở lại quyền sửa thước.

Luật khoá giữ nguyên (`isGradingLocked` / `GRADING_LOCKED_MESSAGE`: phiên đã có bài mang điểm hoặc đang chấm). Server vẫn từ chối mọi lần ghi. UI không đưa control ghi rồi để máy chủ từ chối.

Đường sửa thước duy nhất sau khi đã có kết quả vẫn là đường cũ: mọi bài đều không chấm được và phiên mở khoá. Spec này không đổi đường đó.

---

## 3. Phạm vi

### Trong phạm vi

- Lối vào và lối ra trên cùng route chấm điểm.
- Màn xem lại dùng lại các khối của bước chuẩn bị, ở chế độ chỉ đọc.
- Hiện **nội dung đã lưu**, gồm câu ghi chú đáp án (API readiness hôm nay không trả câu này).
- Giữ việc chấm đang chạy khi giảng viên mở màn xem lại.

### Ngoài phạm vi

| Không làm | Vì sao |
|---|---|
| Sửa rubric, tài liệu, ngôn ngữ, gói test từ màn xem lại | Khoá là luật chấm, không phải thiếu nút |
| Route mới | Cùng phiên, cùng chỗ giảng viên đang chấm |
| Tải hoặc hiện **nội dung file** đáp án mẫu | File đáp án không hiện trên màn chấm; chỉ hiện tên file và dòng nguồn |
| Đổi `RulerOriginNote` | Dòng đó vẫn đúng trên danh sách và hồ sơ bài |
| Cấu hình theo từng câu | `PreparePanel` hôm nay là một thước cho cả phiên |

---

## 4. Cách vào và ra

Cùng URL phiên. Thêm query `view=prepare`. Giữ `sessionId` và `state` (bộ lọc danh sách bài) khi có.

**Hiện lối vào** khi trang đang ở màn đang chấm hoặc màn danh sách bài: nút **Xem bước chuẩn bị** trên đầu phiên (`SessionHeader`).

**Không hiện lối vào** khi trang đang ở màn chuẩn bị sửa được (chưa có kết quả, hoặc mọi bài không chấm được). `view=prepare` lúc đó **bỏ qua** — vẫn là màn chuẩn bị sửa được, không nhân đôi, không khoá form.

**Lối ra** trên màn xem lại:

- Đang chấm → **Quay lại tiến độ chấm**
- Đã chấm xong → **Quay lại danh sách bài**

Bỏ `view`, giữ `sessionId` và `state`.

Đổi phiên hoặc về danh sách phiên thì không mang `view=prepare` sang phiên khác.

---

## 5. Màn xem lại

Thay phần thân (đang chấm / danh sách) bằng bước chuẩn bị ở chế độ `review`. `useGradingProgress` vẫn nằm ở `SessionScreen` — rời màn không dừng poll, không dừng job trên máy chủ.

Khi đang chấm, phía trên màn xem lại có một dòng trạng thái: việc chấm vẫn chạy trên máy chủ, kèm lối quay lại tiến độ. Không vẽ lại cả `RunningPanel` ở dưới.

### 5.1 Băng khoá

Một băng thông tin, không phải lỗi:

> Phiên đã bắt đầu chấm. Tài liệu chấm và rubric đã khoá — màn này chỉ để xem lại.

Câu lý do trùng ý `GRADING_LOCKED_MESSAGE` (*đã có bài mang điểm hoặc đang chấm*). Không có nút **Bắt đầu chấm**.

### 5.2 Những gì hiện

Cùng bốn nhóm với màn chuẩn bị, đọc từ dữ liệu đã lưu:

| Nhóm | Hiện | Không hiện |
|---|---|---|
| Rubric | Tên, phiên bản, điểm, số tiêu chí. Liên kết **Xem bảng lỗi** (cùng href `rulesHref`) | Ô đổi rubric, nút ghim. Chữ **Sửa Rubric** — sửa thư viện lỗi là trang khác và không đổi bản phiên đã ghim |
| Tài liệu chấm | File đề đang chỉ định (tên + dòng nguồn). Đáp án mẫu: tên file + dòng nguồn, hoặc nói rõ chỉ có ghi chú / chưa có. **Nguyên văn ghi chú** đã lưu. Băng đáp án chưa kiểm chứng nếu cờ đó còn | Radio chọn đề, ô tải file, ô sửa ghi chú, nút lưu |
| Ngôn ngữ bài code | Tên file, ngôn ngữ đã khai (hoặc *chưa khai*), câu đường chấm (`investigator` / đọc mã) | Ô chọn ngôn ngữ |
| Gói test | Chỉ khi phiên có bài code. Gói **đang ghim**: danh tính, lúc duyệt, bảng ca (nhóm, input, output). Các phiên bản khác chỉ liệt kê tên, gói ghim được đánh dấu | Sinh, duyệt, ghim, tải lên, sửa / bỏ / hoàn tác ca, chạy thử |

Cột bên phải đổi nhãn từ **Trước khi bắt đầu** thành **Đã dùng để chấm**. Giữ các dòng sự thật (rubric, đề, đáp án, gói test, bảng lỗi, ngôn ngữ, số bài đã thu) với biểu tượng kèm chữ. Không còn khối nút bắt đầu và không còn chữ hướng dẫn *hãy chọn / hãy gắn* như thể phiên chưa chạy.

Thiếu dữ liệu thì nói thiếu (*Chưa có ghi chú*, *Chưa ghim gói test*). Không để ô trống trông như bằng không.

### 5.3 Ghi chú đáp án trên API

`GET /exam-sessions/:id/grading-readiness` (`@Roles('teacher')`, đúng chủ phiên) thêm trường:

```ts
modelAnswerNote: string | null
```

`null` khi không có ghi chú. Không trả nội dung file đáp án, không trả storage key. Web đọc trường này ở màn xem lại. Màn chuẩn bị sửa được không đổi luật ghi (chỉ gửi trường đã đổi).

---

## 6. Việc không đổi

- Ba trạng thái tự chọn khi **không** có `view=prepare`.
- Màn chuẩn bị khi chưa có kết quả, và khi mọi bài không chấm được: vẫn sửa được, vẫn có nút bắt đầu / chấm lại.
- Mọi route ghi (reference, rubric, ngôn ngữ, gói test) vẫn 409 với `GRADING_LOCKED_MESSAGE` khi khoá.
- Hồ sơ một bài và dòng `RulerOriginNote` giữ nguyên.

---

## 7. Kiểm thử

Web:

- Không có `view`: ba trạng thái cũ (chuẩn bị / đang chấm / danh sách) và đường mọi bài không chấm được vẫn như `page.test.tsx`.
- `view=prepare` lúc đang chấm hoặc đã có danh sách: thấy màn xem lại, không thấy nút bắt đầu, không thấy bảng bài / `RunningPanel`. Thấy dòng *việc chấm vẫn chạy* khi còn pending.
- `view=prepare` lúc chưa có kết quả, hoặc mọi bài không chấm được: vẫn màn chuẩn bị sửa được.
- Nút đầu trang chỉ có ở hai màn sau khi đã bắt đầu. Quay lại giữ `state`.
- Chế độ review: rubric không có ô đổi; tài liệu không có nút lưu; ngôn ngữ disabled; gói test không có nút ghi; ghi chú hiện đúng chuỗi API trả về; không có ghi chú thì có câu *chưa có*.

API:

- Readiness của chủ phiên trả `modelAnswerNote` đúng chuỗi đã lưu, hoặc `null`.
- Người không phải chủ phiên vẫn bị từ chối như route readiness hiện tại.
- Response không chứa storage key của file đáp án.
