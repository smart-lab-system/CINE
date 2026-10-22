# Design: Stepper cho hub Thiết lập phiên thi

**Ngày:** 2026-10-22
**Trạng thái:** planned (`docs/superpowers/plans/2026-10-22-exam-session-setup-stepper.md`)
**Liên quan:**
- [exam-session-setup-edit-flow](./2026-10-18-exam-session-setup-edit-flow-design.md) — lifecycle, ma trận sửa, checklist mở phiên. Spec này đổi cách trình bày hub, và nới một điểm của ma trận đó: **loại thi sửa được khi `scheduled`**. Status và luật mở phiên giữ nguyên.
- [session-exam-roster-setup](./2026-10-18-session-exam-roster-setup-design.md)
- [exam-folder-config-preview](./2026-10-18-exam-folder-config-preview-design.md)
- [exam-session-create-slim](./2026-10-18-exam-session-create-slim-design.md)

---

## 1. Vấn đề

Hub `/teacher/exam-sessions/[id]` đang xếp mọi khối trên một cột (`max-w-3xl`): thông tin phiên, checklist mở, lịch, danh sách thi, đề, thư mục bài thi, rubric. Giảng viên phải cuộn cả trang để sửa một việc, và mỗi card tự có nút lưu riêng («Lưu lịch», «Lưu cấu hình thư mục», «Gắn rubric»).

Form lịch và form thư mục nằm trong state cục bộ của card. Khi bố cục chuyển sang **chỉ mount bước đang chọn**, rời bước sẽ unmount form và mất chữ chưa lưu.

Cần một khung điều hướng thống nhất: nhìn thấy mình đang ở đâu, nhảy thẳng tới bước cần sửa, và không mất dữ liệu đang gõ.

---

## 2. Phạm vi

### Trong phạm vi

- Bố cục lại hub Thiết lập thành stepper + một vùng nội dung + footer tác vụ.
- Điều hướng tự do giữa các bước khi phiên còn `scheduled`.
- Nháp phía client cho các **ô form** (loại thi, phòng, giờ, thư mục bài thi, rubric đang chọn chưa gắn).
- `PATCH /exam-sessions/:id` nhận thêm `examType` khi phiên còn `scheduled`.
- Footer: Quay lại, Tiếp tục, Lưu nháp, Hoàn tất.
- Cùng khung stepper khi phiên không còn sửa được: chỉ xem, không có nút ghi.

### Ngoài phạm vi

| Không làm | Vì sao |
|---|---|
| Wizard trên form **Tạo phiên** | Form tạo vẫn một card. Spec 2026-10-18 đã chốt. |
| Đổi status DB, thêm `draft` vào teacher flow | «Nháp» ở đây là bản trên trình duyệt, không phải status phiên. |
| Thêm Redux | App không có Redux. Server state đã là React Query. |
| Gộp «Hoàn tất» với «Mở phiên thi» | Mở phiên freeze roster, không đảo được. Vẫn là nút riêng trên bước cuối. |
| Đổi checklist §5.4, status, hay API ngoài `examType` | Footer vẫn gọi endpoint đang có. Chỉ thêm `examType` vào PATCH lịch. Tên, mã, môn, lớp, học kỳ vẫn không sửa. |
| Đưa file upload hoặc từng dòng roster vào sessionStorage | Những thao tác đó đã ghi server ngay khi bấm. |

---

## 3. Quyết định đã chốt

1. **Năm bước, stepper ngang trên cùng.** Bước đầu là Thông tin chung: hiện đủ nội dung card Thông tin phiên hôm nay, và chỉ sửa loại thi, thời gian, phòng thi. Không còn card Thông tin phiên, không còn bước «Lịch & phòng». Đề phát và thư mục bài thi là một bước (§5). Năm bước, nhãn ngắn, không rơi vào điều kiện stepper dọc (> 5 bước hoặc tên bước dài). Hàng stepper dính trên vùng nội dung. Khi bề ngang không đủ, hàng đó cuộn ngang — không chuyển thành cột trái.
2. **Các bước độc lập.** Không bước nào cần kết quả của bước trước để mở ra. Bước «Xem lại» chỉ đọc. Trong bước Đề & thư mục, preview cây đọc tên file đề đã upload trên cùng bước; upload đề không phải điều kiện để sửa danh sách file nộp.
3. **Không chặn chuyển bước.** Bấm stepper, Quay lại, hoặc Tiếp tục không chạy validation và không gọi API.
4. **Chỉ validate toàn bộ khi bấm Hoàn tất** trên bước Xem lại. «Lưu nháp» ghi những bước bẩn mà API nhận được; không chạy checklist mở phiên.
5. **Tự lưu tạm khi rời bước** vào context của trang + `sessionStorage`. Quay lại bước thì đổ lại form từ kho đó.
6. **Hoàn tất không mở phiên.** Hoàn tất = ghi nháp lên server + chạy checklist. Nút «Mở phiên thi» giữ nguyên trên bước Xem lại.
7. Màu phân biệt **trạng thái** bước (đang chọn / bẩn / lỗi), không tô mỗi bước một hue. Icon + nhãn phân biệt bước với nhau. Palette app dành success / warning / danger cho phán đoán, không cho «bước số 3».

---

## 4. Bố cục

Khung nằm trong cột nội dung của AppShell (teacher sidebar giữ nguyên). Stepper và footer **dính trong khung hub** (`sticky`), không `position: fixed` đè sidebar.

```
PageHeader "Thiết lập phiên thi" + link Danh sách
Một dòng: tên phiên thi (mọi bước)
Stepper ngang (sticky trên vùng nội dung)
Vùng nội dung: đúng 1 bước
Footer tác vụ (sticky đáy khung hub)
```

Giữa tiêu đề trang và stepper có đúng một dòng, nội dung là `session.name`. Dòng này chỉ đọc, hiện trên mọi bước, để khi đang ở Danh sách thi hay Rubric vẫn biết đang sửa phiên nào. Không kèm mã, môn, badge, hay nút.

Card «Thông tin phiên» bỏ hẳn. Các mục còn lại của card đó — trạng thái, mã, môn, lớp, học kỳ, loại thi, thời gian, phòng thi, và nút Vận hành, Huỷ phiên, Quản lý bài thu, Chuẩn bị chấm — nằm trong bước Thông tin chung (§5.1). Tên phiên không lặp lại trong bước.

### 4.1 Vùng nội dung

- Chỉ mount bước đang chọn. Bước khác không để `hidden` trong DOM.
- State form không nằm trong component bước. Bước đọc và ghi kho nháp (§7).
- Mỗi bước có một `h2` đúng tên bước. Khi đổi bước, focus chuyển vào heading đó.

### 4.2 Footer

Một hàng, đáy khung hub, nền `surface`, viền trên `border`.

| Vị trí | Nút | Variant | Khi nào |
|---|---|---|---|
| Trái | Lưu nháp | `outline` | Chỉ khi `status === 'scheduled'` |
| Trái, cạnh Lưu nháp | Bỏ nháp | `ghost` | Chỉ khi kho nháp khác dữ liệu server |
| Phải | Quay lại | `outline` | Mọi bước. Disabled ở bước 1. Không về danh sách — link Danh sách nằm ở header |
| Phải | Tiếp tục | `default` (teal) | Mọi bước trừ bước cuối |
| Phải | Hoàn tất | `default` (teal) | Chỉ bước Xem lại, và chỉ khi `scheduled` |

Quay lại / Tiếp tục đi theo thứ tự danh sách cho người dùng lần đầu. Chúng không khoá bước nào: stepper vẫn bấm được bước bất kỳ.

---

## 5. Các bước

| # | `step` (query) | Nhãn | Icon (lucide) | Nội dung | Ghi server hôm nay |
|---|---|---|---|---|---|
| 1 | `info` | Thông tin chung | `Info` | Đủ mục của card Thông tin phiên. Sửa loại thi, thời gian, phòng thi | `PATCH /exam-sessions/:id` (thêm `examType`) |
| 2 | `roster` | Danh sách thi | `Users` | `SessionExamRosterCard` | Từng thao tác thêm / gỡ / import |
| 3 | `materials` | Đề & thư mục | `FolderOpen` | Đề phát, rồi thư mục bài thi và preview | Upload / xoá đề ngay; `PUT …/required-deliverables` cho thư mục |
| 4 | `rubric` | Rubric | `ClipboardList` | `RubricRow` | `PATCH …/rubric` |
| 5 | `review` | Xem lại | `ListChecks` | Checklist §5.4 trên dữ liệu đã trộn, nút Mở phiên thi | `POST …/open` chỉ từ nút đó |

Một bước, hai khối xếp dọc trong vùng nội dung. Khối trên là `ExamMaterialsCard` (đề phát cho sinh viên). Khối dưới là `RequiredDeliverablesEditor` và preview cây thư mục. Preview dùng tên file đề vừa upload trên cùng bước. Ngôn ngữ deliverable (`code_project`) nằm trong khối dưới, không thành bước riêng.

`?step=folder` mở bước Đề & thư mục rồi `replace` thành `?step=materials`. `?step=schedule` mở Thông tin chung rồi `replace` thành `?step=info`.

URL: `/teacher/exam-sessions/[id]?step=materials`. Thiếu hoặc sai `step` thì mở `info`. Đổi bước thì `replace` query, không đẩy thêm history cho từng cú bấm stepper (Quay lại của trình duyệt vẫn ra khỏi hub).

### 5.1 Bước Thông tin chung

Nhãn stepper và `h2` là **Thông tin chung**. Không còn heading «Thông tin phiên».

Tên phiên nằm ở dòng trên stepper (§4), không có trong bảng dưới. Bước hiện các mục còn lại của card Thông tin phiên. Chỉ ba mục là ô sửa khi `scheduled`. Các mục còn lại là chữ chỉ đọc, lấy từ server, không vào kho nháp.

| Mục | Nhãn | Khi `scheduled` |
|---|---|---|
| Trạng thái | Badge cạnh heading | Chỉ đọc |
| Mã phiên | Mã phiên | Chỉ đọc, nút sao chép giữ nguyên |
| Môn | Môn học | Chỉ đọc |
| Lớp | Lớp | Chỉ đọc |
| Học kỳ | Học kỳ | Chỉ đọc |
| Loại thi | Loại thi | Sửa. Thường kỳ, Giữa kỳ, Cuối kỳ (`TK` / `GK` / `CK`). Nhãn ô là **Loại thi**, không dùng «Loại kỳ» |
| Thời gian | Thời gian | Sửa. Bên trong là Bắt đầu và Kết thúc, cùng cặp `datetime-local` form lịch hiện tại |
| Phòng | Phòng thi | Sửa. Catalog phòng đang active, cùng `SearchableSelect` lúc tạo |

Dòng mô tả dưới heading: «Sửa loại thi, thời gian và phòng thi trước khi mở phiên.» Sau khi mở, ba ô đó khoá; các mục chỉ đọc vẫn hiện.

Cuối bước là hàng nút đang nằm dưới card Thông tin phiên:

| Status | Nút |
|---|---|
| `scheduled` | Vận hành phiên thi, Huỷ phiên |
| `active` | Vận hành phiên thi |
| `collecting` | Vận hành phiên thi, Quản lý bài thu, Chuẩn bị chấm |
| `completed` | Quản lý bài thu, Chuẩn bị chấm |
| `cancelled` | Không có nút mở lại |

Spec 2026-10-18 coi loại thi là bất biến sau tạo (nhãn cũ trên UI là «Loại kỳ»). Spec này thay đúng câu đó: loại thi sửa được khi `scheduled`, cùng cửa với phòng và giờ.

Nút lưu riêng trong card («Lưu lịch», «Lưu cấu hình thư mục», «Gắn rubric») bỏ khỏi bước. Ghi server chỉ còn qua Lưu nháp và Hoàn tất, trừ ngoại lệ ở §6.

---

## 6. Cái gì vào nháp, cái gì ghi ngay

### 6.1 Vào kho nháp (mất nếu unmount mà không lưu)

| Bước | Field |
|---|---|
| Thông tin chung | `examType`, `roomId`, `startLocal`, `endLocal` |
| Đề & thư mục | Giá trị form `requiredFilenames` (kể cả ô đang gõ dở, kể cả dòng chưa hợp lệ). Danh sách đề đã upload không nằm trong nháp |
| Rubric | `choice` trong `<select>` — rubric **đã gắn** trên server không cần nháp |
| Dialog đang mở ở Danh sách thi | Ô chữ đã gõ (thêm tay). Đóng dialog khi rời bước; quay lại thì mở lại dialog và đổ chữ |

### 6.2 Giữ ghi server ngay trong bước

Danh sách thi (thêm, gỡ, import) và phần đề trong bước Đề & thư mục (upload, xoá) không phải một form blob. File đã chọn mà chưa bấm tải lên **không** đưa vào `sessionStorage`. Rời bước khi ô file còn treo: một dòng trên khối đề — «File vừa chọn chưa được tải lên.» Không khôi phục được đối tượng `File`.

---

## 7. Kho nháp

### 7.1 Chỗ để

`ExamSetupDraftProvider` bọc hub, sống cùng trang.

- Bộ nhớ đang chạy: context.
- Bền qua refresh trong tab: `sessionStorage`, key `exam-setup-draft:${sessionId}`.

Không Redux. React Query vẫn là dữ liệu đã lên server.

Hình dạng:

```ts
type SetupDraft = {
  sessionId: string;
  updatedAt: string; // ISO, lúc ghi storage
  info?: { examType: string; roomId: string; startLocal: string; endLocal: string };
  folder?: ReplaceRequiredDeliverablesFormValues;
  rubricChoice?: string;
  rosterDialog?: { mode: 'add'; fields: Record<string, string> };
};
```

Chỉ ghi key có dữ liệu bẩn. Bản giống hệt server thì xoá key đó.

### 7.2 Khi nào ghi

| Sự kiện | Việc |
|---|---|
| Rời bước (stepper, Quay lại, Tiếp tục, đổi `step` trên URL) | Đọc form bước hiện tại, ghi context + `sessionStorage`. Không validate. Không gọi API |
| Đang gõ | Ghi storage debounce 400ms, để refresh giữa chừng không mất chữ |
| `beforeunload` | Ghi nốt bản chưa kịp debounce |

### 7.3 Khi nào đổ vào form

1. Đợi query phiên thành công.
2. Lấy server làm nền.
3. Đè field nào còn trong draft lên trên.
4. Effect «reset form theo server» hiện ở thông tin chung và thư mục **không** được ghi đè draft bẩn. Chỉ nhận refetch server cho field không bẩn (sau khi chính mình lưu xong, hoặc giảng viên bấm Bỏ nháp).

Nếu draft khác server, footer hiện «Bỏ nháp». Bỏ nháp xoá storage của phiên này và đổ lại form từ server. Không gọi API.

Hai phiên khác nhau không dùng chung key.

### 7.4 Hết mutable

Khi status không còn `scheduled`, bỏ qua draft (không đổ lên form đã khoá) và xoá key. Bản trên server là bản hiển thị.

---

## 8. Stepper — trạng thái và tương tác

`nav` với `aria-label="Các bước thiết lập"`. Mỗi mục là `button`. Bước đang chọn: `aria-current="step"`. Không mục nào `disabled` khi phiên còn `scheduled`.

Không vẽ thanh tiến độ 1→5. Dòng phụ «Bước 3 / 5» trong vùng nội dung chỉ để định vị, không phải điều kiện mở bước.

### 8.1 Trạng thái nhìn

Một bước chỉ mang một trạng thái ưu tiên cao nhất: lỗi > đang chọn > bẩn > thường.

| Trạng thái | Khi nào | Màu (token hiện có) |
|---|---|---|
| Thường | Không chọn, không bẩn, không lỗi | Chữ `muted-foreground`, icon trong vòng `surface-2` |
| Đang chọn | `step` hiện tại | Nền `primary-subtle`, chữ và icon `primary`, cạnh dưới 2px `primary` |
| Bẩn | Draft bước đó khác server | Như thường hoặc đang chọn, thêm chấm 6px `warning` |
| Lỗi | Hoàn tất vừa chỉ vào bước này | Chữ `danger-strong`, chấm `danger`. Xoá khi giảng viên sửa field của bước hoặc Hoàn tất chạy lại và bước không còn lỗi |

Hover: nền `surface-2`. Active: `translate-y-px` như button app. Focus dùng ring teal sẵn có của `globals.css`, không khai ring riêng.

Hàng ngang: icon + nhãn một dòng. Không cắt nhãn bằng ellipsis. Khi không đủ chỗ, hàng `overflow-x-auto` và bước đang chọn tự `scrollIntoView`. Vạch trạng thái «đang chọn» là cạnh dưới 2px `primary`, thay cho vạch trái của stepper dọc.

---

## 9. Lưu nháp và Hoàn tất

Cả hai đều snapshot bước hiện tại vào kho trước, rồi mới ghi server.

### 9.1 Lưu nháp

Không chạy `evaluateSetupChecklist`.

Với mỗi bước bẩn:

| Bước | Điều kiện được gửi | Endpoint |
|---|---|---|
| Thông tin chung | Có loại thi (`TK` / `GK` / `CK`), đủ phòng + hai mốc giờ, và `end > start` theo cùng luật form đang dùng | `PATCH` với `examType`, `roomId`, `startTime`, `endTime` |
| Đề & thư mục | Phần thư mục qua `replaceRequiredDeliverablesSchema`. Phần đề không flush | `PUT` deliverables |
| Rubric | `choice` khác rỗng và khác rubric đang gắn | `PATCH` rubric |
| Danh sách thi | Không có gì để flush — thao tác đã ghi ngay | — |

Bước chưa đủ để API nhận: **giữ trong nháp**, không chặn các bước khác. Toast một câu, ví dụ «Thư mục bài thi vẫn nằm trong bản nháp trên máy này.» Không tự nhảy bước.

Bước API từ chối: giữ nháp, hiện lỗi của endpoint trên bước đó (không nhảy). Các bước khác vẫn ghi.

Bước ghi thành công: xoá phần draft tương ứng, toast «Đã lưu nháp.»

### 9.2 Hoàn tất (chỉ bước Xem lại)

1. Snapshot.
2. Trộn draft lên dữ liệu server rồi chạy `evaluateSetupChecklist` (luật cũ, không siết thêm):
   - Chặn: chưa `scheduled`, giờ không hợp lệ hoặc đã qua, chưa có file nộp nào.
   - Cảnh báo (không chặn): lớp 0 SV, chưa có đề, chưa gắn rubric.
3. Chạy schema từng bước như Lưu nháp. Thiếu điều kiện gửi của một bước bẩn mà checklist cần (ví dụ thư mục trống) tính là chặn.
4. Nếu có lý do chặn: không gọi API ghi, không gọi `open`. Gắn trạng thái lỗi vào **bước chặn đầu tiên** theo thứ tự Thông tin chung → Đề & thư mục (các chặn còn lại không có, vì roster và rubric chỉ là cảnh báo). `replace` query sang bước đó, focus heading, hiện `blockReason` trong nội dung bước. Giờ không hợp lệ thì lý do hiện ở nhóm Thời gian, cạnh các mục chỉ đọc. Thiếu file nộp thì lý do hiện ở khối thư mục.
5. Nếu không chặn: ghi mọi bước bẩn như Lưu nháp. API lỗi thì dừng ở bước lỗi, chưa tính là hoàn tất.
6. Khi mọi ghi thành công: xoá draft, toast «Đã lưu thiết lập.», ở lại Xem lại. Cảnh báo checklist vẫn hiện. Nút **Mở phiên thi** trong nội dung bước vẫn là hành động riêng, enable theo `canOpen` như hiện tại.

Hoàn tất không điều hướng về danh sách và không `POST …/open`.

---

## 10. Phiên không còn `scheduled`

Stepper vẫn bấm được để xem từng khối. Thông tin chung vẫn hiện đủ mục; loại thi, thời gian và phòng khoá. Rubric chỉ đọc theo ma trận spec 2026-10-18. Trên bước Đề & thư mục khi `active`: đề vẫn upload / xoá được, thư mục chỉ còn preview. Từ `collecting` trở đi cả hai khối khoá theo ma trận đó.

- Không Lưu nháp, không Hoàn tất, không Bỏ nháp.
- Quay lại / Tiếp tục vẫn đổi bước.
- Bước Xem lại: không checklist mở. Hiện câu khoá («Đã khoá — phiên đã mở hoặc đã kết thúc.»). Nút Vận hành, bài thu, chuẩn bị chấm nằm ở bước Thông tin chung.
- `cancelled`: mọi bước chỉ đọc, không nút huỷ lại.

---

## 11. Kiểm thử

| Case | Kỳ vọng |
|---|---|
| Đổi loại thi và giờ ở Thông tin chung, bấm Rubric trên stepper, bấm lại | Dòng tên phiên phía trên vẫn là tên server. Trong bước: đúng loại thi và giờ vừa chọn; mã, môn, lớp, học kỳ vẫn là chữ server; không gọi PATCH |
| Refresh giữa chừng khi draft bẩn | Form đổ lại từ `sessionStorage` sau khi query phiên về |
| Giờ kết thúc trước giờ bắt đầu, bấm Tiếp tục | Vẫn sang bước sau. Không toast lỗi |
| Hoàn tất khi chưa có file nộp | Nhảy tới Đề & thư mục, lý do chặn ở khối thư mục, không `open`, không PUT rỗng |
| Hoàn tất khi checklist chỉ có cảnh báo «chưa gắn rubric» | Ghi các bước bẩn, toast đã lưu, `canOpen` vẫn true, không tự mở phiên |
| Lưu nháp khi thư mục không qua schema nhưng Thông tin chung hợp lệ | PATCH loại thi, phòng và giờ thành công, thư mục còn trong storage, toast nói phần chưa ghi |
| Bỏ nháp | Storage xoá, form khớp server |
| `?step=materials` | Mở bước Đề & thư mục, cả hai khối |
| `?step=folder` | Cùng bước đó, URL được thay bằng `materials` |
| Status `active` | Không thấy Lưu nháp / Hoàn tất; loại thi, thời gian, phòng thi disabled; mã, môn, lớp, học kỳ vẫn hiện trên Thông tin chung |
| Hai `sessionId` | Hai key storage, không đè nhau |

Test đặt cạnh hub (`page` hoặc provider), không cần e2e mới cho lifecycle.

---

## 12. File sẽ đụng

| Việc | File |
|---|---|
| Khung hub | `apps/web/src/app/teacher/exam-sessions/[id]/page.tsx` |
| Stepper, footer, provider | `apps/web/src/app/teacher/exam-sessions/[id]/_components/` (mới) |
| Bỏ nút lưu riêng, nhận value từ provider | `RequiredDeliverablesEditor.tsx`, form Thông tin chung trên `page.tsx`, `RubricRow.tsx` |
| Checklist | Giữ `SetupChecklist.tsx` / `evaluateSetupChecklist`. Bước Xem lại truyền input đã trộn draft |
| PATCH nhận `examType` | `apps/api/src/exam-session/dto/update-exam-session.dto.ts`, `exam-session.service.ts`. Chỉ khi `scheduled`, cùng cửa với phòng và giờ. Từ chối giá trị ngoài `TK` / `GK` / `CK` |
| Không đụng | Lobby `/exam-sessions/[id]`, form tạo `/new`, tên / mã / môn / lớp / học kỳ |

---

## 13. Tiêu chí chấp nhận

- Hub `scheduled` hiện một bước tại một thời điểm, stepper ngang trên cùng, footer đủ bốn vai trò ở §4.2.
- Trên mọi bước, một dòng ngay dưới tiêu đề trang hiện tên phiên thi. Trong Thông tin chung không lặp lại tên đó.
- Bước Thông tin chung hiện phần còn lại của thông tin phiên: trạng thái, mã, môn, lớp, học kỳ chỉ đọc; sửa được loại thi, thời gian (Bắt đầu, Kết thúc) và phòng thi khi `scheduled`. Không còn card Thông tin phiên, không còn bước Lịch & phòng.
- Đề phát và thư mục bài thi cùng nằm trên bước Đề & thư mục. Không còn bước riêng cho từng khối.
- Bấm bất kỳ bước nào cũng được, kể cả khi bước đang đứng không hợp lệ.
- Rời bước không mất ô đã gõ; refresh cùng tab cũng không mất.
- Lưu nháp không đòi đủ checklist mở phiên.
- Hoàn tất là lúc duy nhất chạy checklist toàn bộ; thất bại thì chỉ vào bước chặn và không mở phiên.
- Mở phiên vẫn là nút riêng, cùng luật `canOpen` như trước spec này.
- Phiên đã mở: xem từng bước được, không còn nút ghi.
