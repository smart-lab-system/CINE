# Năm nợ đúng-sai của phần chấm điểm — đóng lại những chỗ UI phải đoán hoặc khoá

Ngày: 2026-09-29 · Nhánh: `feat/grading-ui-rebuild` (PR #64, **chưa merge**)

## 0. Vì sao gói này tồn tại, và vì sao nó đứng trước G2–G5

Plan A/B/C dựng lại giao diện giảng viên **trên backend hiện có**, nên mọi chỗ API chưa có
đường đi đều bị hiện dưới dạng nút khoá + nhãn *cần backend*. Bốn trong năm nợ dưới đây
**không phải tính năng lớn**: chúng là chỗ backend nói dối, hoặc nói thiếu, khiến giao diện
phải khoá một nút đang an toàn, hoặc phải tải N hồ sơ để vẽ một bảng.

Không có gói này thì G2 (thước từ Soạn đề), G3 (chấm lại) và G4 (kiểm mẫu) đều phải sống
chung với những chỗ sai đó. Làm nó trước, mỗi gói sau chỉ phải lo phần của mình.

| # | Nợ | Hậu quả hôm nay | Sửa ở đâu |
|---|---|---|---|
| 1 | `refuted` thắng `include` | Nút *"Không đồng ý — giữ lỗi này"* bị khoá vì ghi ngoại lệ đó sẽ nói dối; nút *Đồng ý bác bỏ* không tồn tại | `score-core.ts` + `ErrorList.tsx` |
| 2 | Danh sách bài không mang lý do | Một request hồ sơ cho **mỗi** bài cần xem; cột *vì sao cần bạn* và dòng đòn bẩy chỉ hiện sau khi tải xong tất cả | `listResults` + `session-triage.ts` |
| 3 | Response phiên bỏ `language`; không khai được sau | Màn chuẩn bị chấm chặn *"Bắt đầu chấm"* cả với bài code đã chạy được | DTO + route mới |
| 4 | Thiếu nhãn *"chấm bằng đọc mã, không chạy"* | Bài code đi đường cũ trông y hệt bài tự luận | `listResults` + danh sách + hồ sơ |
| 5 | `RubricView` không có `createdAt` | Không suy ra được "rubric mặc định = bản tạo gần nhất" | `rubric.service.ts` |

**Không nằm trong gói này:** kiểm mẫu (§8.1), chấm lại bài không chấm được (§2.3), thước
từ Soạn đề, ghi vào sổ điểm, chạy lại bậc 3, lời gọi trực tiếp. Chúng là G2–G7, mỗi cái một
spec riêng.

**Luật chung của mọi gói sau, kế thừa từ Plan A/B/C:** control nào chưa có route thì `disabled` +
nhãn *cần backend* + **không gửi request**. Gói này chỉ bớt nhãn ở nơi nó **tự thêm** đường đi
thật; mọi nhãn khác (thuộc G2–G7) giữ nguyên.

---

## 1. `refuted` không được thắng quyết định của giảng viên

### 1.1 Lỗi hôm nay

`computeScore` xếp `counted` theo thứ tự cứng (`scoring/score-core.ts`, phép chọn `counted` trong
`decision.errors.map`):

```
refuted  >  excluded  >  giá null  >  counted
```

`excluded` (ngoại lệ `exclude`) đã được xử lý đúng ở chỗ khác — lọc cờ, loại khỏi điểm — chỉ riêng
**nhãn** `counted` bị `refuted` đè. Hai hệ quả, cùng một nguyên nhân:

1. Giảng viên đặt ngoại lệ **`include`** (*"giữ lỗi này cho riêng bài này"*) thì lượt tính vẫn ghi lỗi
   đó là `refuted`, **không trừ điểm**, và cờ `refuted` vẫn nằm trong `errorFlags`. Ghi vào bảng
   vẫn thành công (`ErrorExceptionService` không biết chuyện này), nên câu *"đã giữ"* là một lời
   nói dối: giảng viên yêu cầu giữ, hệ thống vẫn bỏ, và bài còn bị đánh dấu `teacher_reviewed`.
2. Giảng viên đặt ngoại lệ **`exclude`** trên lỗi đã bị bác bỏ thì điểm **đúng** (không trừ) và cờ
   `refuted` **đã bị lọc mất** (`errorFlags` lọc theo `excludedKeys`), nhưng nhãn vẫn là `refuted`
   thay vì `excluded`. Hồ sơ không phân biệt được *"hệ thống bác bỏ"* với *"giảng viên đồng ý bác
   bỏ"*, và nút *"Giữ lại lỗi này"* — chỉ hiện khi `counted === 'excluded'` — **không hiện**, nên
   giảng viên không có đường gỡ ngoại lệ đó.

Giao diện hôm nay xử lý hai chỗ này bằng cách **không cho đặt ngoại lệ trên lỗi bị bác bỏ**:
`ErrorList.tsx` chỉ có một nút *"Không đồng ý — giữ lỗi này cho riêng bài này"*, khoá và gắn *cần
backend* ([ErrorList.tsx](apps/web/src/app/teacher/grading/[resultId]/_components/investigator/ErrorList.tsx)),
và **không có nút *Đồng ý bác bỏ* nào** (một Minor đã hoãn ở Plan A). Gói này thêm nút thứ hai, mở
khoá nút thứ nhất, và xoá nhãn *cần backend* ở đó.

### 1.2 Luật mới

Ngoại lệ của giảng viên là quyết định ở tầng cao nhất, vì nó là **quyết định đã đưa ra**, còn
`refuted` là **kết luận của một lượt khác** (phản biện lúc chấm). Thứ tự mới:

| Ngoại lệ của giảng viên | `counted` | Cờ `refuted` trong `errorFlags` |
|---|---|---|
| `include` — giữ lỗi này | `counted`, hoặc `unpriced` nếu luật chưa có giá | **xoá** |
| `exclude` — đồng ý bác bỏ | `excluded` | xoá (đã xoá hôm nay) |
| không có | `refuted` | giữ |

Cột `counted` vẫn chỉ có bốn giá trị (`counted` · `unpriced` · `excluded` · `refuted`), nên
`BreakdownError` **không đổi kiểu**; chỉ cách chọn giá trị đổi.

**Cờ `unpriced` của lỗi được giữ phải do `computeScore` tự thêm.** `decide()` tính giá trên tập lỗi
**đã loại lỗi bị bác bỏ** (`decide.ts`, `errors.filter(!refutedKeys.has)`), nên `errorFlags` mà nó trả
không bao giờ có `unpriced` cho một lỗi bị bác bỏ. Khi giảng viên giữ lỗi đó và luật chưa có giá,
`computeScore` phải gắn `{ ruleKey, code: 'unpriced' }` — nếu không, lỗi bị tính vào điểm là *0*
mà không cờ nào nói *"chờ giá"*, đúng thứ §2.1 cấm (*lỗi chưa giá không được quyết điểm*).

Cờ `refuted` phải mất khỏi `breakdown.errorFlags` khi giảng viên đã quyết (`include` hoặc `exclude`)
— nếu không nó cứ nằm lại như một lý do *"cần bạn xem"* cho một lỗi mà giảng viên đã xử lý xong.
`outcome` của `computeScore` **không đổi** (vẫn lấy từ `decide()`): bài có ngoại lệ đã
`teacher_reviewed` (§14.3), nên `outcome` của nó không quyết trạng thái — đúng như lời chú thích
ngay trên `computeScore`.

### 1.3 Ràng buộc

- **Chỉ lượt tính mới.** `score_computation` là chỉ-thêm (§14.4), nên lượt cũ giữ nguyên
  `counted` cũ. Phiên đã chốt tự đúng khi giảng viên bấm *"Áp giá mới cho phiên đã chốt"*.
- **`repriceBreakdown` không đổi.** Nó đứng sau `computeScore` và cố ý giữ nguyên
  `excluded`/`refuted` (đã có test T-REFUTE, `score-core.spec.ts:211`). Với lỗi mà giảng viên
  đã quyết, `counted` đã là `counted`/`excluded` nên nó đi đúng đường cũ.
- **Bài tự luận không đổi.** Ngoại lệ cấp lỗi chỉ có ở đường điều tra — `ErrorExceptionService`
  đã trả 409 với bài `one_shot`.
- **Không có đường quay về "hệ thống bác bỏ".** Ngoại lệ mới nhất thắng và chỉ có hai chiều
  (`include`/`exclude`); sau khi giảng viên đã quyết một lần, chỉ còn đổi chiều, không còn
  *"không ngoại lệ"*. Đúng ý spec (§2.2: đó là quyết định của giảng viên cho riêng bài này), và
  ghi ra để hộp xác nhận ở giao diện nói đúng điều đó.

### 1.4 Test

Đã grep `refuted` trong `apps/api/src` và `apps/api/test`: **không test nào mã hoá luật cũ**. Ca
*"lỗi bị phản biện bác bỏ"* của `score-core.spec.ts` không kèm ngoại lệ; ca `exclude` không kèm
phản biện; T-REFUTE thuộc `repriceBreakdown`, hàm không đổi. Một chỗ phải xem trong plan:
`eval/rehearsal/score-run.ts` đọc `counted === 'refuted' | 'excluded'` — plan kiểm nó không giả
định `refuted` luôn thắng.

Test thêm mới, đều trên `computeScore`:

- `include` trên lỗi bị bác bỏ → `counted`, điểm **có** trừ, cờ `refuted` không còn.
- `exclude` trên lỗi bị bác bỏ → `excluded` (không còn `refuted`), điểm không đổi, cờ `refuted` không còn.
- `include` trên lỗi bị bác bỏ **và** luật chưa có giá → `unpriced`, có cờ `unpriced`, không có cờ `refuted`.
- Không ngoại lệ → `refuted` như cũ (giữ nguyên ca hiện có).
- `include` trên lỗi **không** bị bác bỏ → không đổi so với hôm nay (T-EXC-2).

---

## 2. Danh sách bài mang sẵn lý do — bỏ N+1

### 2.1 Lỗi hôm nay

`GET /exam-sessions/:id/grading-results` **không** có breakdown. Vì vậy `session-triage.ts`
phải chờ `useResultDetails` — `app/teacher/grading/page.tsx` (dòng gọi `useResultDetails`) gọi
`GET /grading-results/:id/investigation` cho **từng bài cần xem**. Với 30 bài cần xem là 30 request
mỗi lần danh sách tải lại, và cột *"vì sao cần bạn"* cùng dòng đòn bẩy không hiện gì cho tới khi
tất cả về.

### 2.2 Thay đổi: cột `triage` trên mỗi dòng kết quả

```ts
// Trên GradingResultView, luôn có mặt (khoá `triage`); giá trị null nghĩa là "không có bảng lỗi".
triage: {
  caseFlags: { code: string; detail: string }[];
  errorFlags: { ruleKey: string; code: string }[];
  counts: { counted: number; unpriced: number; refuted: number; excluded: number };
} | null
```

`null` nghĩa là *"không có bảng lỗi để tóm tắt"*, và xảy ra đúng ba lần: bài `one_shot`, bài chưa có
`score_computation` nào (đang chấm), bài không chấm được. **Giao diện không cần `triage` để phân
biệt ba ca đó** — nó đã đọc được `pipeline`, `status` và `ungradableReason` trên cùng dòng, và
`reasonOf` hôm nay đã rẽ theo đúng các trường ấy. `triage` chỉ chở thứ mà hôm nay phải tải hồ sơ
mới có: cờ và số lỗi của bài đường điều tra đã có lượt tính.

### 2.3 Thêm một truy vấn con, không thêm một lượt gọi DB

`listResults` **đã có** truy vấn `scoreRows` lấy điểm hiện tại cho cả danh sách bằng các truy vấn con
tương quan. Thêm một truy vấn con cùng dạng, cùng `ORDER BY` với `latestComputationScore`:

```sql
(SELECT c.breakdown FROM examcollect.score_computation c
   WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS "latestBreakdown"
```

`breakdown` là `jsonb` nên driver trả về object; `triage.counts` đếm ở tầng đọc, không ở SQL. Chi phí
tỉ lệ với số bài của phiên — cũng là điều kiện của mọi truy vấn con hiện có — và mỗi `breakdown` là
vài KB. Nếu sau này phiên lớn hơn hàng trăm bài mới là chỗ cần chọn trường bằng `->` ở SQL; chưa cần.

Kèm một `LEFT JOIN` cho §4: `submission.required_deliverable_id → required_deliverable` để lấy
`deliverable_type` và `language`.

### 2.4 Giao diện

- `session-triage.ts`: `errorCounts`, `reasonOf`, `leverageOf` nhận `result.triage` thay vì
  tra cứu `ResultDetail`. Hàm vẫn **thuần**. Luật *"không khẳng định trên dữ liệu thiếu"* giữ
  nguyên: bài đường điều tra đang ở *cần bạn xem* mà `triage` là `null` — không nên xảy ra — thì
  `leverageOf` trả `null` (không nói gì), `reasonOf` trả `null` (màn hình nói *"chưa có lý do"*, không đoán).
- `page.tsx` bỏ `useResultDetails` khỏi nhánh danh sách → mỗi lần danh sách tải chỉ còn **một**
  request. Hook `useResultDetails` xoá nếu không còn nơi dùng (hôm nay chỉ trang này dùng).
- `ResultsTable` hiện số *đã trừ* / *chờ giá* cho mọi bài **có `triage`**; bài không có thì ô ghi
  *"—"* (không phải 0: "chưa có bảng lỗi" và "không có lỗi nào" là hai chuyện khác nhau).

### 2.5 Ràng buộc gửi sang G4 (kiểm mẫu)

§8.1 luật 2 đòi **tầng API** giấu điểm và lỗi của bài `audit_pending`, không chỉ ở tầng hiển
thị. Vì `triage` được tính ở đúng chỗ đó:

- `currentScore` → `null`, `currentScoreSource` → `'none'`
- `triage` → `null`
- `finalScore`, `aiTotalScore` → `null`

G4 chỉ cần ẩn ở **một** nơi. Đây là lý do `triage` nằm trong `listResults` chứ không phải ở
endpoint riêng: hai chỗ để ẩn là hai chỗ để quên.

---

## 3. Khai ngôn ngữ bài code — sau khi phiên đã tạo

### 3.1 Lỗi hôm nay

`required_deliverable.language` chỉ khai được lúc **tạo phiên** (`POST /exam-sessions`). Màn
chuẩn bị chấm có một dòng *"Ngôn ngữ bài code"* gắn nhãn *cần backend*
([preflight.ts](apps/web/src/lib/preflight.ts), khối `key: 'language'`), và vì response không có
`language` nên điều kiện *"cần gói test đã ghim"* dùng `hasCodeDeliverable` — chỉ cần một
deliverable `code_project`, không phân biệt ngôn ngữ — và **chặn** cả bài code đi đường cũ.

Hai hậu quả: UI chặn *"Bắt đầu chấm"* oan cho bài code cũ chưa khai ngôn ngữ, và bài code đi
đường `one_shot` trông **khác hẳn** bài tự luận mà không có lời giải thích nào.

### 3.2 Route mới

`PATCH /exam-sessions/:id/deliverables/:deliverableId` · body `{ language }`

Điều kiện, theo thứ tự kiểm tra:

1. Phiên thuộc đúng giảng viên và yêu cầu nộp (`required_deliverable`) thuộc đúng phiên đó — cùng
   khuôn `findEntityForOwner` mọi route phiên khác; sai một trong hai thì 404/403.
2. `deliverable_type = 'code_project'` — ngôn ngữ chỉ có nghĩa ở đó (`ck_required_deliverable_language`).
3. `language ∈ DECLARED_LANGUAGES` — bốn giá trị, không thêm giá trị mới.
4. Phiên chưa bị khoá chấm (`isGradingLocked`) — cùng luật với `PUT /grading-reference`. Ngôn ngữ
   khoá **cùng tài liệu chấm** (spec chấm điểm §14.1), vì nó quyết đường chấm của cả bài.
5. **Chưa có `grading_result` nào của yêu cầu nộp đó** (qua `submission.required_deliverable_id`) —
   xem §3.4. Điều kiện 4 không thay được điều kiện 5:
   phiên **mở khoá** khi mọi kết quả là bài không chấm được đã dừng hẳn (§2.3 luật 6), mà những bài
   đó vẫn giữ dòng kết quả và `pipeline` đã gán.

### 3.3 `language` vào `RequiredDeliverableResponseDto`

Cùng thay đổi đó, mỗi phần tử `requiredDeliverables` của response phiên mang thêm hai trường:

- `language` — **đã có sẵn trong DB**, chỉ bị bỏ khi map ra DTO.
- `pipeline: 'investigator' | 'one_shot'` — **BE tính**, bằng chính `pipelineFor` mà `startGrading` dùng
  để gán đường cho kết quả ([pipeline.ts](apps/api/src/grading/pipeline.ts)).

Trường thứ hai là điểm mấu chốt: FE **không tự cài lại** luật *"code + python/cpp ⇒ điều tra"*, nên
UI không thể lệch server (chặn oan hoặc để lọt). Route `PATCH` ở §3.2 trả về đúng phần tử đó đã cập nhật.

### 3.4 **Ruling: khai muộn không đổi được đường chấm, nên phải từ chối**

`pipeline` được gán **một lần** lúc `startGrading` tạo dòng kết quả, và trigger
`validate_grading_result_lifecycle` chặn đổi (§2.3 luật 8). Nên nếu bài đã có dòng kết quả mà ta
khai `python` bây giờ, bài đó **vẫn** chấm đường cũ — giảng viên tưởng đã khai xong và chỉ nhận
ra khi thấy điểm không có bằng chứng chạy.

Ba lựa chọn đã cân:

| Cách | Hệ quả |
|---|---|
| Cho khai, cảnh báo bằng lời | Hợp đồng API nói "đã khai" trong khi hệ thống phớt lờ. Tệ hơn hẳn từ chối. |
| Cho khai rồi đổi `pipeline` | Phá bất biến đã có trigger, và một phiên nửa chấm nửa không là **hai kỳ thi** — đúng cái luật 8 sinh ra để chặn. |
| **Từ chối, nói rõ vì sao** | Chọn. 409 nêu bài đã có dòng chấm nên không đổi được đường. |

Hệ quả cần nói thẳng: **phiên đã bắt đầu chấm thì không khai được ngôn ngữ nữa**, kể cả cho bài
nộp về sau. Điều này khớp §14.1 (*ngôn ngữ khoá cùng tài liệu chấm*), và với bài đã có dòng kết
quả mà phiên vừa mở khoá — chỗ **G3** (chấm lại bài không chấm được) sẽ đi qua — thì đáp án vẫn là
từ chối, vì chấm lại giữ nguyên `pipeline` (§2.3 luật 8).

### 3.5 Giao diện

**Màn chuẩn bị chấm** (spec UI §3.7):

- Mỗi bài `code_project` có một ô chọn ngôn ngữ, cạnh tên file. Lựa chọn được: `python`, `cpp`,
  `java`, `node`. *"Chưa khai"* chỉ là trạng thái ban đầu của ô (chữ mờ), **không** phải một lựa chọn:
  route không nhận `null`, vì gỡ ngôn ngữ đã khai không có nghĩa gì trước khi chấm. Đổi từ ngôn
  ngữ này sang ngôn ngữ khác thì được, chừng nào hai điều kiện khoá ở §3.2 còn chưa chặn.
- Dưới ô, dòng giải thích đường chấm: `python`/`cpp` → *"chấm trong môi trường chạy bài, cần
  gói test đã ghim"*; `java`/`node` → *"chấm bằng đọc mã, không chạy mã"*. Hệ thống **không đoán**
  ngôn ngữ từ đuôi file (§14.1).
- Ô bị khoá khi phiên đã khoá chấm hoặc bài đã có dòng chấm, kèm lý do nói đúng chuyện gì đã xảy ra
  (*"bài này đã có kết quả chấm, nên đường chấm đã cố định"*). Khoá là **thật** — cùng nguồn với 409
  của server — không phải giao diện tự đoán.
- Lỗi 409 hiện nguyên văn trong `Alert` cạnh ô, như mọi nơi khác.

**Sửa lỗi chặn thừa trong `preflight.ts`:** dòng ngôn ngữ chuyển từ *"chưa đọc được"* + *cần
backend* thành số đếm cụ thể — *"2 bài code chấm bằng đọc mã, không chạy; 1 bài chưa khai ngôn
ngữ"* — và **không chặn**. Điều kiện *"cần gói test đã ghim"* chỉ tính các yêu cầu nộp có
`pipeline === 'investigator'` (trường BE trả ở §3.3), không tính `hasCodeDeliverable` nữa. Khớp
server là bắt buộc: UI chặn nhiều hơn thì giảng viên bị chặn oan; ít hơn thì bấm nút rồi gặp lỗi 400
của `startGrading`. Vì FE đọc chứ không tự tính, hai bên khớp **theo cấu trúc**, không cần test khoá.

---

## 4. Nhãn *"chấm bằng đọc mã, không chạy"* (T-UI-19)

`listResults` trả thêm `deliverableType` (join ở §2.3) và `language`. Giao diện:

- **Danh sách bài:** badge ở dòng của bài `code_project` đi đường cũ. Bài `one_shot` tự luận
  không có badge.
- **Đầu hồ sơ:** badge cạnh nhãn trạng thái, kèm một dòng nói bài này được chấm bằng đọc mã
  nên không có độ phủ, không có bằng chứng lời gọi công cụ.
- **Sau khi chốt, riêng bài code đường cũ:** hồ sơ **không có nút sửa nào** (spec UI T-UI-19). Trang
  `one_shot` hôm nay, khi `finalized`/`exported`, vẫn hiện nút *"Lưu và ghi nhật ký"* (biến
  `published` trong `[resultId]/page.tsx`) — đúng cho **bài tự luận** (sửa điểm sau chốt là đường
  khiếu nại, có nhật ký), sai cho bài code đường cũ, vì nó không có bằng chứng nào để sửa theo.
  Luật chỉ áp khi `deliverableType === 'code_project'`; bài tự luận **không đổi**. Plan ghi tên test
  giữ cả hai nửa.

Cột `language` cũng cho phép sau này nói *"bài này khai `java`, hệ thống chỉ chạy được
`python` và `cpp`"* mà không cần hỏi lại backend.

---

## 5. `createdAt` cho `RubricView`

`RubricEntity` kế thừa `BaseEntity` (đã có `createdAt`), nhưng `RubricView` không mang nó ra. Thêm
`createdAt: string` (ISO 8601) vào interface và vào `toView`.

Lý do: chỗ chọn rubric của phiên mới cần biết bản **tạo gần nhất** để đặt làm mặc định. `version`
chỉ so được trong một bộ `(giảng viên, tên)`; giảng viên có hai bộ rubric khác tên thì `version` lớn
nhất không phải bản mới nhất.

**Gói này chỉ thêm trường**, không đổi hành vi giao diện nào: việc dùng nó để chọn mặc định thuộc
`RubricPicker`, và chỉ làm khi có một lý do người dùng nhìn thấy. Nó nằm đây vì là một trong năm nợ
đã ghi trong PR #64 và rẻ nhất trong năm — nhưng không được phép kéo theo việc gì khác.

---

## 6. Kiểm chứng

- **TDD** từng mục: test đỏ trước, xanh sau. Ca bị đổi luật cũ thì ghi rõ tên trong sổ cái.
- **Sau khi thêm route mới** (§3.2): build API, chạy `dist/src/main.js`, `pnpm
  generate:api-client` trong `packages/shared`. Không bước này thì `pnpm --filter web build`
  đỏ ở đúng dòng gọi route mới và trông như lỗi code. Gom một lần cuối gói, không mỗi route
  một lần.
- **Hồi quy toàn repo:** `pnpm --filter web test`, `pnpm --filter api test`, `tsc --noEmit`,
  `eslint`, `next build`.
- **Smoke trên API thật** với dữ liệu seed mới, không đụng dữ liệu demo:
  - khai ngôn ngữ cho một yêu cầu nộp code, xác nhận `pipeline` đổi trong response phiên; sau khi
    `startGrading`, khai lại và xác nhận 409 đúng lời;
  - với một hồ sơ seed có lỗi bị bác bỏ: đặt `exclude` rồi `include`, xác nhận `counted` đi
    `excluded → counted`, điểm đổi đúng, cờ `refuted` mất;
  - đọc danh sách: `triage` có mặt với bài đường điều tra đã có lượt tính, `null` với bài tự luận.
- **VERDICT của `code-reviewer`** trước khi báo xong (CLAUDE.md).

## 7. Còn lại, ghi ra để không mất

Ghi vào PR, không làm ở gói này:

- Bài `audit_pending` **đã có** thật trong DB và chặn chốt, nhưng **không ai rút bài vào đó** —
  N = 0 trên thực tế. Đó là G4.
- `reapply-prices` từ chối cả lượt xuất khi một bài dính luật lúc chốt có giá mà nay chưa có
  giá. Hành vi đúng theo §2.1, nhưng thông báo dài; ghi nhận, không sửa ở đây.
