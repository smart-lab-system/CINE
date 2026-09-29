# Danh sách phiên chấm — thiết kế

**Ngày:** 2026-09-29 · **Trạng thái:** spec · mock-up đã duyệt (2026-09-29, artifact riêng tư "Danh sách phiên chấm") · chưa implement
**Phụ thuộc:** `2026-09-23-grading-ui-rebuild-design.md` — trang này là màn *chọn phiên* trước "một route, ba trạng thái" (mục 1 của spec đó). Dùng lại `session-triage.ts` (bảy trạng thái của một bài) và vocabulary của nó.
**Quy ước:** ký hiệu **mục n** trỏ vào spec này; **§** trỏ vào spec chấm điểm.

## 0. Vấn đề

`/teacher/grading` (không có `sessionId`) hiện là lưới thẻ hai cột (`SessionPicker.tsx`). Bảy vấn đề, đo trên ảnh chụp 20 phiên ngày 2026-09-29:

1. Thẻ chỉ ghi số bài đã thu — không nói phiên nào chưa chấm, đang chấm, có bài cần xem, đã chốt.
2. Không tìm, không lọc, không sắp xếp.
3. Tên phiên dài và giống nhau, phần khác nhau nằm ở cuối; ngày thi và loại kỳ thi không hiện.
4. Thẻ rộng gần nửa màn hình, chữ chỉ chiếm ~một phần tư.
5. Lưới hai cột buộc mắt đi theo chữ Z.
6. Chỉ vào được từng phiên một; quay lại từ "Đổi phiên" không giữ được vị trí.
7. Dòng phụ ghi "Phòng Phòng máy B1": `SessionPicker.tsx` và `SessionHeader.tsx` thêm chữ "Phòng" vào `roomName` vốn đã có chữ đó.

## 1. Quyết định (đã duyệt 2026-09-29)

| # | Quyết định | Lý do |
|---|---|---|
| D1 | Thêm **endpoint tóm tắt riêng** `GET /grading/sessions-summary`, không mở rộng `/submissions/overview`. | `overview` là một truy vấn CTE lớn phục vụ cả trang Bài thu; nhét số liệu chấm vào đó làm nặng trang không cần nó và trộn hai khái niệm (thu bài ≠ chấm bài, CLAUDE.md). Không có endpoint này, 20 phiên = 20 lần gọi `grading-progress`. |
| D2 | Thứ tự mặc định **"Cần xử lý trước"**: Cần bạn xem → Sẵn sàng chốt → Chưa chấm → Đang chấm → Đã chốt; cùng nhóm thì phiên mới trước. | Người dùng mở trang này để biết việc gì đang chờ mình. |
| D3 | **Không có "Chốt điểm" hàng loạt.** Chốt từng phiên qua trang chốt điểm hiện có. Để sau. | Chốt là bước ghi điểm cuối và có audit; cần nhìn tóm tắt từng phiên. |
| D4 | Giữ nguyên việc hiện cả phiên đã lưu trữ; không thêm công tắc. | Lưu trữ thuộc luồng thu bài (comment cũ của `SessionPicker`). Ô tìm và bộ lọc đủ để thu hẹp. |
| D5 | **Không lọc theo môn.** | `courseName` là hằng số ở mọi phiên (`SessionOverviewItem`). |

### 1.1 Chỗ lệch khỏi mock-up (và vì sao)

- **Cắt "Xuất điểm CSV" hàng loạt.** Mock-up có nút này. `ExportCsvButton` tạo CSV ngay tại trình duyệt từ *kết quả của một phiên đã tải*; xuất nhiều phiên nghĩa là tải kết quả của từng phiên rồi phát nhiều tệp, hoặc thiết kế một tệp gộp có cột "Phiên". Chưa có yêu cầu nào cho cái sau → để sau.
- **"Bắt đầu chấm" hàng loạt chỉ kiểm hai điều kiện: có rubric và có đề bài.** Mock-up viết như thể đó là toàn bộ điều kiện. Thực tế `preflightOf` còn chặn khi rubric không có tiêu chí, khi bài code chưa ghim gói test, và khi không có bài để chấm. Sao chép cả bộ luật đó lên server sẽ sinh bản thứ hai của cùng một luật. Thay vào đó: máy chủ vẫn là người quyết (`start-grading` từ chối phiên không đủ điều kiện), giao diện chạy **từng phiên một** và báo lại kết quả từng phiên, kèm lời của máy chủ. Hộp xác nhận nói rõ điều này (mục 5).
- **Nút cuối hàng của phiên "Chưa chấm, đủ điều kiện" mở cùng hộp xác nhận với thao tác hàng loạt** (một phiên), không gọi thẳng — bấm nhầm một nút trên hàng không được tiêu tốn chi phí AI.

## 2. Trạng thái của một phiên

Năm giá trị, suy từ số bài theo bảy trạng thái của `session-triage` (`countsFromSummary`, mục 3.2):

```
tổng = 0                                    → todo      "Chưa chấm"
needsYou + audit + ungradable > 0           → attention "Cần bạn xem"
grading > 0                                 → running   "Đang chấm"
finalised = tổng                            → done      "Đã chốt"
còn lại                                     → ready     "Sẵn sàng chốt"
```

`attention` thắng `running`: bài cần xem đã mở được khi lượt chấm còn chạy (trang phiên hiện bảng trong lúc chạy, `page.tsx`). Chú thích tiến độ nói cả hai ("11 cần xem · 4 đang chấm").

Phiên `todo` có thể mang **lý do chặn** để giảng viên biết vì sao chưa bắt đầu được: `no-rubric` (phiên chưa gắn rubric) hoặc `no-question` (chưa chỉ định đề bài). Đây là hai điều kiện danh sách *biết được*; các điều kiện khác của `preflightOf` chỉ hiện ở màn chuẩn bị.

Khi bảng tóm tắt chưa tải hoặc lỗi, mọi phiên có `status = null`: bảng vẫn tìm, lọc theo thuộc tính, sắp xếp theo ngày/tên/số bài, chọn nhiều — nhưng không có tab trạng thái, không thanh tiến độ, và **không thao tác hàng loạt**. Có một `Alert` nói rõ lý do.

## 3. Hợp đồng dữ liệu

### 3.1 `GET /grading/sessions-summary` (mới, `@Roles('teacher')`)

```ts
{ items: Array<{
    examSessionId: string;
    byStatus: Record<string, number>; // số grading_result theo status; chỉ chứa status có ≥ 1 dòng
    ungradable: number;               // trong flagged_for_review: số bài có ungradable_reason
    hasQuestion: boolean;             // grading_reference.question_material_id IS NOT NULL
}> }
```

Một mục cho **mọi phiên của người gọi** (kể cả phiên chưa có kết quả nào — `byStatus = {}`), không phân trang (cùng quy ước `overview`, spec §1.2 của nó). Phiên của giảng viên khác không bao giờ xuất hiện. Đường dẫn cố ý là `grading/sessions-summary`, không phải `exam-sessions/sessions-summary`: `GET exam-sessions/:id` của `ExamSessionController` sẽ bắt nó như một `:id` rồi `ParseUUIDPipe` trả 400.

### 3.2 Phép phân loại phải khớp `stateOf`

`countsFromSummary` (`session-triage.ts`) là bản đếm-theo-số-lượng của `stateOf` (bản đếm-theo-từng-bài): `auto_approved→auto`, `audit_pending→audit`, `teacher_reviewed→reviewed`, `finalized|exported→finalised`, `flagged_for_review→ungradable` (phần có lý do) `+ needsYou` (phần còn lại), mọi giá trị khác `→ grading`. Một test đối chiếu hai hàm trên cùng dữ liệu sinh để chúng không lệch nhau.

## 4. Hành vi

- **Tab trạng thái** (Tất cả + năm trạng thái), số đếm theo các bộ lọc khác đang bật.
- **Ô tìm** không phân biệt dấu (`giua ky` khớp "Giữa kỳ", `dhktpm` khớp lớp); tìm trong tên, lớp, phòng, học kỳ, mã, nhãn loại kỳ thi. Nhiều từ = AND.
- **Bộ lọc** nhiều lựa chọn (trong nhóm OR, giữa nhóm AND): Học kỳ, Lớp (theo `classId`, hiện tên), Loại kỳ thi, Phòng; một lựa chọn Thời gian (tất cả / 7 ngày / 30 ngày); công tắc "Thiếu rubric". Mỗi lựa chọn có số phiên tính theo các bộ lọc *khác*.
- **Sắp xếp** theo cột Phiên thi / Ngày thi / Bài nộp / Trạng thái, và ô chọn 5 kiểu. **Nhóm theo** Không / Lớp / Học kỳ (nhóm thu gọn được, chọn cả nhóm được).
- **Mật độ** Rộng / Gọn, nhớ trong `localStorage`.
- **Trạng thái nằm trên URL**: `q`, `status`, `sem`, `cls`, `type`, `room` (lặp tham số), `time`, `norubric=1`, `sort=khoá:chiều`, `group`. Giá trị lạ bị bỏ, không làm hỏng trang. Bộ lọc cuối cùng được nhớ trong `sessionStorage`; nút **Đổi phiên** trên trang một phiên quay về đúng danh sách đã lọc.
- **Hàng**: tên (dòng trên; tối đa hai dòng thay vì cắt đuôi) + lớp · phòng (dòng dưới); ngày & giờ; loại; `bài nộp`; pill trạng thái (+ dòng chú thích: lý do chặn, hoặc "Thi cách đây N ngày" khi `attention`/`ready` quá 14 ngày); thanh tiến độ + chú thích; một nút hành động theo trạng thái.
- **Thanh tiến độ** dùng đúng màu và biểu tượng của `OverviewBar` (cần xem = warning, đang chấm = info có sọc, chờ chốt = success, đã chốt = primary/60); màu chỉ để nhìn nhanh, mỗi đoạn còn có chữ.
- **Nút cuối hàng**: `attention` → *Xem xét* (mở phiên, lọc sẵn trạng thái cần xem); `ready` → *Chốt điểm* (trang chốt); `todo` bị chặn → *Chuẩn bị*; `todo` đủ điều kiện → *Bắt đầu chấm* (mở hộp xác nhận, mục 5); `running` → *Xem tiến độ*; `done` → *Mở kết quả*.

## 5. Thao tác hàng loạt

Thanh nổi ở đáy khi có phiên được chọn. **Chỉ tính những phiên đang hiện** — đổi bộ lọc làm rơi khỏi vùng chọn phiên không còn hiện.

- **Bắt đầu chấm · n**: n = số phiên `todo` không có lý do chặn. Hộp xác nhận liệt kê phiên và tổng số bài sẽ xếp hàng; ghi rõ "Danh sách chỉ kiểm rubric và đề bài. Gói test của bài code và các điều kiện khác do máy chủ kiểm; phiên nào bị từ chối sẽ báo lại lý do." Chạy tuần tự từng phiên (`POST /exam-sessions/:id/start-grading`); một phiên lỗi không dừng các phiên sau; kết quả cuối hiện từng phiên ✓/✗ kèm lời của máy chủ. Nút bấm xong không tự chạy lại.
- **Gắn rubric · n**: n = số phiên `todo` chưa có rubric. Hộp chọn một rubric của giảng viên; chạy tuần tự `PATCH /exam-sessions/:id/rubric`; cùng kiểu báo kết quả.

Ranh giới CLAUDE.md giữ nguyên: thu bài không kích hoạt chấm; chấm chỉ bắt đầu bằng một thao tác tường minh của giảng viên (ở đây là nút xác nhận trong hộp thoại).

## 6. Không làm

- Chốt điểm, xuất điểm hàng loạt (mục 1, D3 và 1.1).
- Thay đổi trang một phiên (`SessionScreen`) ngoài nút **Đổi phiên** và lỗi "Phòng Phòng".
- Sao chép `preflightOf` lên server.
- Lọc theo môn, công tắc lưu trữ (D4, D5).
- Giao diện điện thoại: giảng viên dùng máy tính. Bảng cuộn ngang khi hẹp hơn 820px là đủ.

## 7. Kiểm thử

- API: test đơn vị hàm gộp hàng; e2e route (cô lập giữa hai giảng viên; các trạng thái; `ungradable`; `hasQuestion`; 401).
- Web: hàm thuần `session-list` (trạng thái, lọc, bỏ dấu, facet, sắp xếp, nhóm, kế hoạch hàng loạt), `session-list-url` (parse/serialize, giá trị lạ), `countsFromSummary` đối chiếu `stateOf`; component (bảng, thanh lọc, danh sách tích hợp, hộp hàng loạt).
- Không chạy Playwright (quyết định của chủ dự án 2026-09-29 cho chuỗi UI chấm điểm). Smoke test trên API thật bằng `apps/api/test/ui-e2e/seed.ts` (mỗi lần tạo dữ liệu MỚI, không đụng dữ liệu demo).
