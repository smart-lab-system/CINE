# Giai đoạn 2, lát cắt 1: luồng chấm điểm trên 390px và khối trạng thái — thiết kế

**Ngày:** 2026-11-27 · **Trạng thái:** chờ chủ dự án duyệt · **Quy mô:** vừa (3 PR, chỉ lớp trình bày, không đổi hook, query, API, route, quyền)
**Liên quan:** [phase1-plan](../../ui-refactor/phase1-plan.md) (mục 1: Giai đoạn 2 là "thiết kế lại từng màn"), [logic-findings](../../ui-refactor/logic-findings.md), [glossary](../../ui-refactor/glossary.md), spec duyệt nhanh `2026-10-21-cham-diem-duyet-nhanh-design.md` §5.8 (E1).
**Bằng chứng nền:** 34 ảnh chụp 27/11/2026 (17 trạng thái × 390px và 1280px) trên stack cô lập; điểm tự chấm trung bình 6,62 (390px: 6,18; 1280px: 7,06). Ảnh ở `C:/tmp/ui-evidence/phase2-baseline/`, không commit.

## 1. Vì sao làm

Giai đoạn 1 sửa nền (bảng có mép gợi ý, token, ngôn ngữ, trạng thái trống, tiêu đề, một nút chấm lại). Chấm lại luồng chấm điểm sau đó cho thấy phần còn yếu nằm ở bố cục từng màn:

1. Ở 390px, danh sách phiên mất cột Trạng thái, Tiến độ và nút "Xem xét" (bảng bị ẩn 509px, không có dấu hiệu cuộn); danh sách bài của một phiên cao 90–170px mỗi hàng, chip gãy 3–5 dòng, cột "Vì sao cần bạn" nằm ngoài màn.
2. Đầu màn phiên đang chấm có sáu khối nói về cùng 2–4 bài (băng "Dịch vụ AI lỗi", băng "bị kẹt", thanh tiến độ kèm đếm, "Đang chạy ngay lúc này", "đã dừng"): cao khoảng 490px ở 1280px (đo trên ảnh, từ băng đầu tiên tới hàng tab của danh sách bài).
3. Trang một bài đang chấm để trống khung "Thang chấm & giải trình" và có banner "có thể bị kẹt" mà không chỉ đường tới nơi xử lý.

Mục tiêu người dùng: giảng viên mở màn chấm điểm trên điện thoại cũng thấy ngay phiên nào cần xem và bấm được vào việc chính, và ở đầu một phiên đang chấm đọc được một tình trạng chứ không phải sáu.

## 2. Mục tiêu, không phải mục tiêu, điều không được xảy ra

**Mục tiêu**
- Danh sách phiên và danh sách bài dùng được ở 390px mà không phải cuộn ngang để thấy trạng thái, tiến độ, điểm và nút hành động.
- Khối trạng thái ở đầu phiên đang chấm gom thành một tình trạng và một danh sách sự cố.
- Trang một bài đang chấm không còn khung trống; nơi xử lý được chỉ ra.
- Các lỗi nhỏ đã thấy trong lượt chấm (mục 5.3) được sửa.

**Không phải mục tiêu**
- Trang chi tiết kết quả của pipeline `investigator` (mã nội bộ làm tiêu đề lỗi, hai nút "Chấm tay", khối quyết định nằm cuối trang ở 390px). Trùng E1 (§5.8), chờ quyết định E1.
- Lỗi nghiệp vụ L-08 và số đếm lệch ("Đang chấm 2" so với "Đang chấm · 16"): đã ghi, đi PR riêng.
- Thiết kế lại bảng ở 820px trở lên, dark mode, `apps/agent`, dữ liệu seed.
- Sửa hai tab trùng số ("Tất cả · 36" và "Đã chốt · 36"), vì đó là quy tắc hiển thị chưa được yêu cầu.

**Điều không được xảy ra (kể cả khi kỹ thuật chạy được)**
- Thẻ trên 390px thiếu một thông tin mà hàng ở 1280px có.
- Hai cách vẽ một hàng lệch nhau về chữ, thứ tự ưu tiên hay điều kiện hiện nút.
- Đổi hook, query, API, route, quyền hay validation.

## 3. Ràng buộc

- Hiến chương (`.specify/memory/constitution.md`): chỉ lớp trình bày; một khái niệm một cách gọi (glossary); không lộ mã nội bộ.
- Mỗi PR: ảnh TRƯỚC (đã có, mục Bằng chứng nền) và SAU ở 390px và 1280px, 0 lỗi console, 0 request lỗi ngoài dự kiến, và đủ `eslint`, `tsc` (chỉ 5 lỗi có sẵn ở file test), `vitest` (chỉ 5 lỗi có sẵn: FinalizePanel 1, rules/page 4), `next build`.
- Trước khi báo xong: `code-reviewer` và chờ VERDICT (quy tắc chung của chủ dự án).
- Mọi nhánh tách từ `origin/main`; `git push` phải ghi rõ nhánh đích.

## 4. Các cách đã cân nhắc cho bảng ở 390px

| Cách | Được | Mất |
|---|---|---|
| A. Giữ bảng, thêm mép gợi ý và ghim cột đầu | Đổi ít nhất | Trạng thái, tiến độ, nút chính vẫn nằm ngoài màn; phải vuốt |
| **B. Dưới 820px đổi hàng thành thẻ, từ 820px giữ bảng (CHỌN)** | Một thẻ gom đủ thông tin và nút; đọc được ở 390px | Một hàng có hai cách vẽ |
| C. Giữ bảng, ẩn cột phụ, gộp tiến độ vào dòng phụ | Không có thành phần mới | Mất chi tiết tiến độ; có thể vẫn cuộn |

Chủ dự án chọn B (27/11/2026). Lý do: việc chính của danh sách là thấy phiên nào cần xem rồi bấm vào; A và C đều không đưa nút đó vào màn 390px. Quyết định "dưới 820px bảng cuộn ngang trong khung" của thiết kế danh sách phiên 29/09 được đổi theo.

## 5. Thiết kế

### 5.1 PR 1 — thẻ dưới 820px cho hai danh sách

**Chọn cách vẽ.** Một hook `useMediaQuery('(max-width: 819px)')` quyết định vẽ bảng hay thẻ; mỗi lần chỉ MỘT cách có trong DOM. Không dùng hai bản trong DOM ẩn bằng CSS: test của hai bảng có 54 truy vấn `getBy*`, và jsdom không áp Tailwind nên mọi truy vấn sẽ gặp hai kết quả. `vitest.setup.ts` đã có stub `matchMedia` trả `matches: false`, nên test hiện có chạy trên nhánh bảng không đổi; thêm test riêng cho nhánh thẻ bằng cách ghi đè `window.matchMedia`. Hook dùng `useSyncExternalStore`: ở trình duyệt lần render đầu đã đọc đúng giá trị (không có khung hình bảng rồi mới đổi sang thẻ, kể cả khi quay lại danh sách bằng điều hướng phía client), ở server trả `false` và React đồng bộ lại khi hydrate; có đường lùi sang `addListener`/`removeListener` cho Safari trước 14. (Bản đầu của spec này nói "giá trị ban đầu là `false` nên không nháy" - sai, vì danh sách được mount khi dữ liệu đã có sẵn trong bộ nhớ đệm; đã sửa ở lượt review.) Hook đặt ở `src/hooks/`, không đọc dữ liệu nào khác.

**Một mô hình hàng dùng chung.** Rút phần tính ra khỏi `Row` của `SessionTable` thành một hàm thuần (ngày giờ, nhãn loại, dòng phụ, ghi chú, hành động, nhãn `aria-label` của nút) để bảng và thẻ cùng đọc; tương tự cho `ResultsTable` (nhãn điểm, đếm lỗi, lý do). Đây là cách chặn thẻ lệch bảng.

**Thẻ phiên (danh sách phiên).** `<ul aria-label="Danh sách phiên chấm">`; hàng đầu tiên là ô "Chọn tất cả phiên đang hiện" (nhãn 40px, cùng phép chọn như ô ở đầu bảng, kể cả nhóm đã thu gọn; thêm sau review vì bảng ở 390px vốn có ô này); tiêu đề nhóm (nếu có) là một `<li>` có nút `aria-expanded` và ô chọn cả nhóm (bọc trong `<label>` 40px) như hiện nay.
- Dòng 1: ô chọn (vùng bấm ≥ 40px) và tên phiên (liên kết, tối đa 2 dòng, `title` là tên đầy đủ), kèm dòng phụ "lớp · phòng" ngay dưới tên (như bảng).
- Dòng 2 (chữ phụ): ngày giờ · loại · "N/M bài nộp".
- Dòng 3: trạng thái (cùng `StatusPill`) và ghi chú cảnh báo nếu có.
- Dòng 4: `SessionProgress` đủ bề rộng.
- Dòng 5: nút hành động, canh phải, cao ≥ 40px, cùng `aria-label` như bảng.
- Trạng thái chọn giữ `data-selected` và nền `bg-primary-subtle`. Chế độ "Gọn" chỉ ẩn ghi chú; ngày và số bài nộp vẫn hiện vì bảng ở chế độ Gọn cũng giữ chúng (ẩn dòng 2 sẽ làm thẻ thiếu thông tin mà bảng có). [Sửa theo kế hoạch PR 1.]
- Sắp xếp và nhóm dùng các ô chọn có sẵn trong thanh lọc (đã hiện ở 390px), nên thẻ không cần tiêu đề cột bấm được.

**Thẻ bài (danh sách bài của phiên).**
- Dòng 1: MSSV (liên kết mở hồ sơ) và tên, được phép xuống dòng; nhãn "Thi bù" nếu có.
- Dòng 2: trạng thái và điểm kèm nhãn "tạm tính" / "chưa có điểm" trên cùng một dòng (không xuống dòng).
- Dòng 3 (chữ phụ): số lỗi · lý do cần bạn (tối đa 2 dòng); dòng này luôn có để không mất cột "Vì sao cần bạn".
- MSSV là liên kết duy nhất tới hồ sơ; không biến cả thẻ thành liên kết (tránh liên kết lồng trong liên kết).

**Chip "Chấm bằng đọc mã, không chạy" (lựa chọn của tôi, bỏ được).** Khi từ hai bài trở lên đang hiện đều chấm bằng cách này (một bài đơn lẻ giữ chip riêng), hiện MỘT lần ở đầu danh sách ("Mọi bài trong danh sách này được chấm bằng cách đọc mã, không chạy thử."; đúng dạng trong glossary) và bỏ chip khỏi từng hàng, cả bảng lẫn thẻ; bài khác cách giữ chip riêng. Chỉ là suy ra cách hiện từ dữ liệu đã có.

**Khung chọn nhóm "Tất cả" và bộ lọc, header trang:** không đổi.

**Xong khi (đo trên stack, ảnh SAU):** ở 390px hai danh sách có `scrollers = 0`; nút hành động chính của mỗi phiên và điểm của mỗi bài nhìn thấy không cần cuộn ngang; vùng bấm của ô chọn và nút hành động ≥ 40px; thẻ bài trong trường hợp thường cao ≤ 130px (hiện 90–170px); phiên 40 bài ("Sắp xếp và tìm kiếm") ngắn hơn 9699px hiện tại (số đo `pageHeight` ở 390px, `shoot.mjs` cắt ảnh ở 2600px); từ 820px trở lên ảnh bảng không đổi so với ảnh TRƯỚC (so bằng `compare.cjs`).

### 5.2 PR 2 — một băng tình trạng ở đầu phiên đang chấm

Thay `AiServiceBand`, băng "bị kẹt" và khối "đã dừng" của `RunningPanel`, cùng khối "Đang chạy ngay lúc này", bằng:

1. **Tình trạng:** một dòng tóm tắt ("38/40 bài đã có kết quả · 2 đang chấm"), thanh tiến độ ba phần và các số đếm như hiện nay, một dòng ước tính tốc độ, và đúng một câu "Bài đã có kết quả mở được ngay trong danh sách bên dưới". Bỏ khối "Đang chạy ngay lúc này" vì lặp lại số đếm.
2. **Sự cố:** MỘT thông báo cảnh báo, tối đa ba dòng, mỗi dòng một loại và chỉ hiện khi có: (a) "Dịch vụ AI lỗi: N bài cùng một lý do “…”" (đếm theo danh sách hiện tại, nói ngắn như văn bản cũ), (b) "N bài đang bị kẹt" kèm thời gian đứng yên nếu đo được, (c) "N bài đã dừng; M bài chấm lại được". Một câu chung "Bấm nút chấm lại ở đầu trang" ở cuối, không lặp theo từng dòng. Không có dòng nào thì không có thông báo.
3. **Giữ nguyên:** băng mất mạng và băng "máy chủ không trả lời" (khác nguyên nhân, có nút riêng); điều kiện `isStuck`; số đếm lấy từ cùng nguồn.

Băng "Dịch vụ AI lỗi" hiện còn hiện khi phiên không đang chấm; thông báo sự cố mới giữ hành vi đó (chỉ dòng (a) và (c) khi không chạy). Thành phần mới đặt trong `_components/` cạnh các thành phần cũ; `AiServiceBand` và phần liên quan của `RunningPanel` bị xoá cùng test của chúng, test mới bao quát cả bốn tổ hợp.

**Xong khi:** ở phiên có 2 bài AI lỗi và 2 bài kẹt (cùng dữ liệu ảnh TRƯỚC), khoảng từ đầu trang tới danh sách bài ≤ 350px ở 1280px. [Đổi từ 300px sau khi đo thật (27/11/2026): trước 512px, sau 345px. Mục tiêu 300px ước lượng từ ảnh (khoảng 490px) và không đạt được mà không cắt một trong năm phần của khối tình trạng (tiêu đề tóm tắt, thanh, chú giải, ước tính, câu "mở được ngay"); chủ dự án chọn chấp nhận 345px.]; số bài nói trong băng khớp dòng và thanh; không còn khối nào chỉ nhắc lại số đã hiện.

### 5.3 PR 3 — trang một bài đang chấm và các lỗi nhỏ

**Trang một bài (pipeline một lượt, `[resultId]/page.tsx`).**
- Khi bài đang chấm và chưa có tiêu chí: khung "Thang chấm & giải trình" hiện skeleton và một câu ("AI đang chấm bài này; kết quả hiện ở đây khi xong") thay vì trống.
- Banner "đang chấm / có thể bị kẹt" có thêm liên kết "Mở phiên để chấm lại" (tới `/teacher/grading?sessionId=…`), nơi có nút chấm lại duy nhất. Không thêm nút mới.
- Đồng hồ trong banner chỉ hiện giây khi dưới 1 giờ; trên 1 giờ hiện giờ và phút.

**Lỗi nhỏ (mỗi mục một commit):**
1. `SessionHeader`: "Chốt điểm phiên" là nút phụ khi mọi bài đã chốt (hiện vẫn là nút chính khi `remaining = 0`, kể cả phiên đã chốt xong).
2. Ngoặc trích dẫn đúng kiểu “…” thay `„…”` (`AdvocatePanel.tsx`, `CriterionCard.tsx`).
3. "Về màn Điều phối" đổi thành "Về phiên chấm"; thêm dòng vào glossary. Chuỗi này cũng có trong `InvestigatorDossier.tsx` (vùng E1): đổi đúng một dòng chữ ở đó, nếu E1 đã đổi file này thì bỏ qua và ghi vào mô tả PR.
4. Danh sách phiên rỗng: dùng `EmptyState` có tiêu đề, một câu và một hành động ("Mở quản lý bài thu"), như trang chốt/xuất khi chưa chọn phiên.
5. Trang chốt điểm: bỏ câu mô tả đầu trang vì lặp lại hộp "Chốt là mốc công bố" ngay dưới (câu đó do WP5 thêm); giữ hộp.

**Xong khi:** trang một bài đang chấm không còn khung trống ở cả hai viewport; mỗi mục lỗi nhỏ có ảnh SAU hoặc test chứng minh.

## 6. Thứ tự và cách thực thi

PR 1 → PR 2 → PR 3, mỗi PR tách từ `origin/main`, độc lập về file (PR 1: bảng và `SessionList`; PR 2: `RunningPanel`, `AiServiceBand` và nơi dùng; PR 3: trang một bài, `SessionHeader`, trang chốt). Mỗi PR: cổng tĩnh, test, build, chụp SAU và so với TRƯỚC bằng skill `cine-verify-ui`, `code-reviewer`; PR chờ chủ dự án duyệt mới merge.

## 7. Phần để người thực thi quyết

- Tên hook và hàm mô hình hàng; vị trí file.
- Chiều cao thẻ nếu 130px không đạt được mà không làm mất thông tin: ưu tiên không mất thông tin, ghi số thực vào mô tả PR.
- Câu chữ chính xác của các dòng mới, theo glossary; thêm dòng glossary cho từ nào chưa có.

## 8. Rủi ro

- Ghi đè `matchMedia` trong test nhánh thẻ phải được trả về sau mỗi test, nếu không làm lệch test khác (đã có tiền lệ trong `SubmissionStatusTable.test.tsx`).
- `SessionHeader.tsx` và `InvestigatorDossier.tsx` có thể xung đột với nhánh song song; kiểm với `git fetch` trước khi mở PR.
- Seed chưa đại diện (điểm 3,5 ở mọi hàng, phản biện giống nhau): không kết luận lỗi giao diện từ hiện vật này.
