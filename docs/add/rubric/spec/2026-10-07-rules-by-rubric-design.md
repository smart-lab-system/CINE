# Bảng lỗi theo rubric — thiết kế

**Ngày:** 2026-10-07 · **Trạng thái:** spec · mock-up đã duyệt (2026-10-07, `docs/add/mockups/2026-10-07-rules-by-rubric.html`, 13 trạng thái, 101 kiểm tra tương tác) · Q1/Q2 đã chốt (2026-10-08) · chưa implement
**Sửa đổi (chỉ phần dưới đây, phần còn lại của các spec đó giữ nguyên):**
- `2026-09-20-grading-agent-investigator-design.md` — §14.1 (cột `criterion_key` của `error_rule_revision` thôi là nơi duy nhất nói luật thuộc tiêu chí nào), §2.1 (bảng lỗi vẫn *khoá theo giảng viên* nhưng được **áp theo rubric**), §2.2 (bảng giá vẫn là một phiên bản theo giảng viên, nhưng mỗi dòng giá thuộc một *dòng áp dụng*, không thuộc luật).
- `2026-09-23-grading-ui-rebuild-design.md` — thay mục 3.1 (trang Bảng lỗi) và 3.2 (tạo/sửa luật).
**Quy ước:** **mục n** trỏ vào spec này; **§** trỏ vào spec chấm điểm (`2026-09-20-…`); **T-RBE-…** là mã kiểm thử của spec này.

## 0. Vấn đề

Đo trên ảnh chụp trang Bảng lỗi (2026-10-07), trên mã nguồn `main` và trên máy chủ:

1. **Danh sách luật là một mảng phẳng toàn cục.** `GET /rules` không nhận tham số rubric. Ô chọn rubric ở thẻ phải chỉ là state cục bộ của `CeilingCard`; chọn rubric nào bảng bên trái vẫn là 13 dòng.
2. **Luật không thuộc rubric nào.** `error_rule.teacher_id` là khoá duy nhất; luật trỏ tiêu chí bằng một chuỗi chữ (`error_rule_revision.criterion_key`), không có khoá ngoại, và `error-rule.service.ts` không nhắc tới rubric. `loadRuleSnapshots` / `loadRuleEntries` nạp **mọi** luật đang dùng của giảng viên cho mọi bài, rồi `computeScore` loại các luật có tiêu chí không nằm trong rubric của bài (`mismatchedRules`, `score-core.ts:77`). Cột "N bài lệch tiêu chí" là triệu chứng trực tiếp của việc này.
3. **Một bảng giá cho mọi rubric.** `price_table_version` là của giảng viên, `rule_price` khoá theo luật. Cùng một lỗi không thể trừ 1,0 ở kỳ giữa và 2,0 ở kỳ cuối. Cách duy nhất hiện nay là tạo luật thứ hai với cùng khoá tiêu chí — khi đó **cả hai** luật áp cho bài của cả hai rubric, và agent thấy hai lỗi gần như giống hệt trong bảng (nguy cơ trừ hai lần).
4. **Form tạo luật không có ngữ cảnh rubric.** Bước "Thuộc tiêu chí nào" lấy tiêu chí của mọi rubric đang dùng, khử trùng theo khoá, trần lấy "bản gặp trước" (`activeCriteria`) — có thể hiện trần của rubric khác. Luật còn thiếu mà agent báo chỉ lưu `teacher_id` + mô tả + tiêu chí giữ chỗ `chua_gan` (`missing-rules.ts`), nên giảng viên chọn tiêu chí "trong bóng tối".
5. **Từ vựng của dev lộ ra giao diện:** "giá" (cột ghi *Mức trừ*, nút ghi *Đặt giá*), "Cách khớp", "trần", "luật", "cần backend", khoá `dung_dan`, `rule_key` dạng mã dưới mỗi dòng.
6. **Việc quan trọng nhất bị chôn:** 13 lỗi agent thấy mà *bị loại khỏi điểm* nằm dưới bảng 13 dòng, thẻ đếm chúng không bấm được.
7. **Không co giãn:** hàng thẻ rubric và mọi chỗ liệt kê rubric phình ra khi có hơn vài rubric.

## 1. Quyết định (đã duyệt 2026-10-07)

| # | Quyết định | Lý do |
|---|---|---|
| D1 | Mô hình **nhiều–nhiều**: **lỗi** (`error_rule`: tên, mô tả, cách phát hiện) dùng chung; **dòng áp dụng** (`rubric_error`: rubric + lỗi + tiêu chí + điểm trừ) riêng từng rubric. | Giảng viên có quy định khác nhau mỗi kỳ thi cho cùng một lỗi; "tạo luật khác" là cách làm sai và có nguy cơ trừ hai lần (mục 0.3). |
| D2 | Dòng áp dụng và điểm trừ gắn với **rubric theo tên** (`teacher_id` + `name`, qua mọi phiên bản), **không** gắn với từng phiên bản. | Phiên chưa chốt đi theo bảng giá hiện hành (§2.2); sửa điểm trừ của "Giữa kỳ CTDL" phải đổi cả phiên đang chấm theo v1 lẫn v2. `CLAUDE.md` §5.1 đã nói *lưu cùng tên = bản kế tiếp, đổi tên = rubric mới*. |
| D3 | Tạo rubric từ rubric cũ = **sao chép rồi độc lập**. Giảng viên **tự chọn** rubric nguồn; không có nguồn chọn sẵn. | Tiền lệ Gradescope (Import = sao chép). Chọn sẵn một nguồn là thay giảng viên quyết định. |
| D4 | Sửa một lỗi đang dùng ở ≥ 2 rubric có **hai nút**: *Lưu cho cả N rubric* và *Chỉ lưu cho "rubric đang mở"* (tách thành bản riêng; rubric còn lại giữ nguyên). Nút hẹp là nút chính. | Giảng viên chọn phạm vi; hệ quả viết ngay dưới từng nút bằng tên rubric và phiên thi thật. Canvas khoá sửa rubric dùng chung và buộc sao chép — ở đây cho chọn thay vì cấm. |
| D5 | **Lỗi AI đề xuất** mang ngữ cảnh: thấy ở rubric nào, phiên nào, bao nhiêu bài (bảng `error_rule_sighting`). | Hôm nay phiên, bài và rubric mà agent đã thấy lỗi **không được lưu ở đâu cả**. |
| D6 | Từ vựng theo bảng ở mock-up (mục 5.7). Giữ chữ **Rubric** (đang dùng ở Tạo phiên thi và Chấm điểm). | Bảng từ vựng ở cuối mock-up. "Barem" là phương án chưa chọn. |
| D7 | Từ **5 rubric** trở lên, hàng thẻ chuyển thành ô **"Rubric đang mở" + Đổi rubric**: tìm không phân biệt dấu, lọc tình trạng, sắp xếp, 3 rubric gần đây; **lọc học kỳ** mặc định "Tất cả học kỳ". Mọi chỗ liệt kê rubric chặn trần ("A, B và 8 rubric khác"). | Hàng thẻ không co giãn; không có khái niệm lưu trữ rubric ở hệ thống (D10). |
| D8 | Học kỳ của rubric **suy từ phiên thi** (`exam_session.semester_name`); rubric thuộc mọi học kỳ nó từng được dùng; chưa gắn phiên = "Chưa gắn học kỳ". | Rubric không có cột học kỳ; `CLAUDE.md` §1.2: học kỳ chỉ là nhãn lọc, không bao giờ chặn thao tác. |
| D9 | Giao diện chỉ còn **hai** cách phát hiện: *Tự động (chạy test)* — mẫu `test_group_failed` — và *AI đọc bài* — `predicate = null`. Ba mẫu còn lại (`calls_function`, `complexity_exceeds_required`, `no_recursion`) **không tạo mới được từ giao diện**; luật cũ mang mẫu đó vẫn chạy, hiện là *AI đọc bài* kèm một dòng ghi chú điều kiện. | Ba mẫu đó "máy chưa đo được" (`checkedBy = 'model'`); trộn chúng vào "Máy kiểm được" là mâu thuẫn giao diện (F1 của bản phân tích). **Đã chốt 2026-10-08:** làm theo plan (mục 9, Q1). |
| D10 | **Không** làm lưu trữ/ẩn rubric. Lọc học kỳ thay thế. | Quyết định của bạn 2026-10-07. |
| D11 | `/teacher/rules/new` và `/teacher/rules/[ruleId]` **bị bỏ**; thay bằng ngăn kéo trong trang. Hai đường dẫn đó chuyển hướng về `/teacher/rules`. | Mock-up đã duyệt không có trang form riêng. |
| D12 | Migration **giữ nguyên hành vi tính điểm**: ngay sau khi chạy, mọi bài chấm cho ra cùng tập luật, cùng mức trừ như trước (T-RBE-MIG-2). | Không để đợt này đổi điểm của ai. |
| D13 | Một màu chủ đạo = token `primary` (Deep Indigo). Ô đổi màu Teal chỉ có ở mock-up, **không** vào sản phẩm. | Quyết định của bạn: "chỉnh lại đa số thành màu primary". |

### 1.1 Chỗ lệch khỏi mock-up (và vì sao)

- **Tên rubric dài** hiện đủ trong ô chọn (cắt bằng `…` kèm `title`); mock-up dùng tên rút gọn `short` cho hàng thẻ. Sản phẩm không có trường `short`.
- **"Gần đây"** lưu ở `localStorage` của trình duyệt (giới hạn 8 mục), không có API. Khoá lưu chứa `teacherId` để hai tài khoản trên cùng máy không thấy lịch sử của nhau.
- **"Lưu thì áp vào đâu"** ở ngăn kéo **không gọi API**: nó là chữ dựng từ `overview.sessions` (tên, trạng thái phiên) và cách phát hiện đang chọn. Vì vậy `POST /rules/preview` và bảng "bốn bậc áp luật" bị gỡ (mục 4.4).
- **Hộp thoại "Sửa tiêu chí & điểm tối đa"** không có trong mock-up (chỉ là thông báo). Giữ `RubricDialog` hiện có, bỏ chữ "phiên bản" khỏi giao diện (hệ thống vẫn tạo bản mới).
- **Ô chọn rubric nguồn** ở dải "Rubric mới" và ở hộp thoại dùng `<select>` gốc; chưa có ô tìm trong ô chọn đó (giới hạn đã biết, mục 9).
- **"Chuyển sang tiêu chí khác"** trong menu ⋯ của mock-up chỉ là thông báo; sản phẩm làm thật (`PATCH /rubric-errors/:id`).
- **Dữ liệu `Đã gặp`** của mock-up là số minh hoạ; sản phẩm lấy từ lượt tính mới nhất của bài thuộc **đúng rubric đó** (mục 4.2).

## 2. Mô hình dữ liệu

### 2.1 Quan hệ

```
Account(teacher) ──1:n──> error_rule ──1:n──> error_rule_revision   (tên, mô tả, predicate — KHÔNG còn tiêu chí)
        │                      │
        │                      └──1:n──> error_rule_sighting          (thấy ở bài/phiên/rubric nào)
        │
        ├──1:n──> rubric(teacher_id, name, version) ──1:n──> rubric_criterion(key, max_points)
        │            ▲  danh tính "rubric" = (teacher_id, name)
        │            │
        └──1:n──> rubric_error(teacher_id, rubric_name, error_rule_id, criterion_key, removed_at)   ← MỚI, dòng áp dụng
                         │
                         └──1:n──> rubric_error_price(price_table_version_id, rubric_error_id, deduction)   ← MỚI, thay rule_price

price_table_version(teacher_id, version)   — giữ nguyên: mỗi lần đổi giá là một phiên bản mới, chép nguyên bảng (§2.2)
exam_session.pinned_price_version_id        — giữ nguyên: chốt phiên ghim phiên bản giá
```

### 2.2 Bảng mới và bảng đổi

```sql
-- Dòng áp dụng: lỗi X nằm trong rubric (teacher, name) thuộc tiêu chí K.
CREATE TABLE examcollect.rubric_error (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  teacher_id    uuid NOT NULL REFERENCES examcollect.account(id) ON DELETE RESTRICT,
  rubric_name   text NOT NULL CHECK (length(btrim(rubric_name)) BETWEEN 1 AND 200),
  error_rule_id uuid NOT NULL,
  criterion_key text NOT NULL CHECK (criterion_key ~ '^[a-z0-9_]{1,64}$'),
  removed_at    timestamptz,                                   -- "Gỡ khỏi rubric này": mềm, không xoá dòng
  CONSTRAINT uq_rubric_error UNIQUE (teacher_id, rubric_name, error_rule_id),
  CONSTRAINT uq_rubric_error_id_teacher UNIQUE (id, teacher_id),
  CONSTRAINT fk_rubric_error_rule_teacher FOREIGN KEY (error_rule_id, teacher_id)
    REFERENCES examcollect.error_rule(id, teacher_id) ON DELETE RESTRICT
);
CREATE INDEX idx_rubric_error_rubric ON examcollect.rubric_error (teacher_id, rubric_name) WHERE removed_at IS NULL;
-- triggers: set_updated_at; trg_rubric_error_no_delete (guard_no_delete — hồ sơ tính điểm trỏ vào nó)

-- Giá của một dòng áp dụng trong một phiên bản bảng giá. Chỉ thêm, như rule_price.
CREATE TABLE examcollect.rubric_error_price (
  price_table_version_id uuid NOT NULL,
  rubric_error_id        uuid NOT NULL,
  teacher_id             uuid NOT NULL,
  deduction              numeric(6,2) CHECK (deduction IS NULL OR deduction >= 0),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_rubric_error_price PRIMARY KEY (price_table_version_id, rubric_error_id),
  CONSTRAINT fk_rep_version_teacher FOREIGN KEY (price_table_version_id, teacher_id)
    REFERENCES examcollect.price_table_version(id, teacher_id) ON DELETE RESTRICT,
  CONSTRAINT fk_rep_error_teacher FOREIGN KEY (rubric_error_id, teacher_id)
    REFERENCES examcollect.rubric_error(id, teacher_id) ON DELETE RESTRICT
);
-- trigger: trg_rubric_error_price_append_only (guard_append_only)

-- Nơi agent đã thấy một lỗi chưa có luật. Nhật ký, không phải hồ sơ kiểm toán: xoá theo bài được.
CREATE TABLE examcollect.error_rule_sighting (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  teacher_id        uuid NOT NULL,
  error_rule_id     uuid NOT NULL,
  grading_result_id uuid NOT NULL REFERENCES examcollect.grading_result(id) ON DELETE CASCADE,
  exam_session_id   uuid NOT NULL REFERENCES examcollect.exam_session(id) ON DELETE CASCADE,
  rubric_name       text NOT NULL,
  CONSTRAINT uq_sighting UNIQUE (error_rule_id, grading_result_id),
  CONSTRAINT fk_sighting_rule_teacher FOREIGN KEY (error_rule_id, teacher_id)
    REFERENCES examcollect.error_rule(id, teacher_id) ON DELETE RESTRICT
);
CREATE INDEX idx_sighting_rubric ON examcollect.error_rule_sighting (teacher_id, rubric_name);

-- Đổi: tiêu chí không còn thuộc bản sửa của luật.
ALTER TABLE examcollect.error_rule_revision ALTER COLUMN criterion_key DROP NOT NULL;
```

- `error_rule_revision.criterion_key` **ngừng ghi** (bản sửa mới ghi `NULL`); cột và dữ liệu cũ giữ lại làm hồ sơ. `UNASSIGNED_CRITERION = 'chua_gan'` bị xoá khỏi `missing-rules.ts`.
- `rule_price` **giữ nguyên, chỉ đọc, không ghi nữa** (dữ liệu lịch sử). Xoá bảng ở một đợt dọn sau (mục 8).
- `error_rule.state` giữ nghĩa cũ; **chỉ luật `active` có dòng áp dụng chưa gỡ** mới đi vào tính điểm. Luật `active` không có dòng áp dụng nào là "lỗi trong thư viện chưa dùng ở rubric nào".

### 2.3 Bất biến

1. Một dòng áp dụng chỉ trỏ luật **của cùng giảng viên** (khoá ngoại ghép), một dòng giá chỉ trỏ dòng áp dụng **của cùng giảng viên** — cùng khuôn T-POL-8.
2. Mỗi (giảng viên, rubric, lỗi) có **tối đa một** dòng áp dụng. Gỡ rồi thêm lại là *bật lại cùng dòng* (`removed_at = NULL`, tiêu chí mới) — dòng giá cũ của nó giữ nguyên trong lịch sử.
3. Không có khoá ngoại từ `rubric_name` sang bảng `rubric` (khoá duy nhất của `rubric` là `(teacher_id, name, version)`). **Service** kiểm "rubric `(teacher, name)` tồn tại" (không thì 404) và "tiêu chí tồn tại ở **bản mới nhất** của rubric đó" (không thì 400) mỗi khi ghi (T-RBE-DATA-3). Rubric không bao giờ bị xoá nên tên không treo.
4. Một dòng áp dụng có thể trỏ tiêu chí **không còn ở bản mới nhất** (giảng viên xoá tiêu chí khi lưu bản mới). Đó là trạng thái hợp lệ — các phiên pin bản cũ vẫn cần nó — và là **ý nghĩa mới, hẹp** của `mismatchedRules` (mục 3.5). `overview.danglingCount` đếm chúng và giao diện báo.
5. Mọi service ghi vào các bảng này **khoá giảng viên trước** bằng `lockTeacherScoring` — cùng khuôn mọi service chấm điểm hiện có (số phiên bản giá và mọi lượt tính lại xếp hàng theo giảng viên).

## 3. Tính điểm, chốt giá, tính lại

### 3.1 Nạp luật theo rubric của bài

`ScoreContext` thêm `rubricName`: truy vấn đầu của `loadScoreContext` thêm `JOIN examcollect.rubric r ON r.id = g.rubric_id_version` và đọc `r.name`. Danh sách tiêu chí (`rubric`) và đánh dấu (`waivedCriteria`) vẫn đọc theo **phiên bản** `rubric_id_version`, đúng như hôm nay.

- `loadRuleSnapshots(m, teacherId, rubricName, priceVersionId)` — thay `(m, teacherId, priceVersionId)`:
  ```sql
  SELECT r.id AS rule_id, v.id AS revision_id, r.rule_key, re.criterion_key, v.predicate, p.deduction
    FROM examcollect.rubric_error re
    JOIN examcollect.error_rule r ON r.id = re.error_rule_id
    JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
    LEFT JOIN examcollect.rubric_error_price p ON p.rubric_error_id = re.id AND p.price_table_version_id = $4
   WHERE re.teacher_id = $1 AND re.rubric_name = $2 AND re.removed_at IS NULL AND r.state = 'active'
   ORDER BY r.rule_key
  ```
  Kiểu trả về `RuleSnapshot[]` **không đổi** (`ruleId`, `revisionId`, `ruleKey`, `criterionKey`, `predicate`, `deductionHundredths`) — nên `computeScore`, `decide`, `computeDeductionScore`, `repriceBreakdown` và hình dạng `breakdown` đã lưu **không đổi**; `ruleId` vẫn là `error_rule.id`.
- `loadRuleEntries(m, teacherId, rubricName)` — bảng lỗi đưa cho cuộc điều tra chỉ gồm lỗi của rubric của bài (`investigation-context.service.ts` đã có `exam_session` trong truy vấn đầu; thêm join `rubric` qua `exam_session.rubric_id` để lấy `rubric_name`). Bonus: agent không còn thấy lỗi của rubric khác.
- `compute()` lấy `ctx.rubricName`; `ScoreService.preview(resultId, transform)` cùng đường.

### 3.2 Bảng giá

Giữ khuôn §2.2: mỗi lần đổi giá là **một `price_table_version` mới, chép nguyên bảng** rồi ghi dòng đổi — nhưng bảng giờ là `rubric_error_price`, khoá theo **dòng áp dụng**:

```
setPrice(teacherId, rubricErrorId, deduction):
  khoá giảng viên → kiểm dòng áp dụng thuộc giảng viên và chưa gỡ
  version mới = max+1; INSERT price_table_version
  INSERT rubric_error_price SELECT <version mới>, rubric_error_id, teacher_id, deduction
        FROM rubric_error_price WHERE version = max cũ AND rubric_error_id <> $dòng
  INSERT rubric_error_price (<version mới>, $dòng, teacher, $deduction)
  recomputeForTeacher(reason 'price_change', scope { rubricName, ruleId })
```

Sửa điểm trừ của lỗi X ở rubric A **không** chạm dòng áp dụng của X ở rubric B: hai dòng là hai khoá khác nhau của cùng bảng (T-RBE-PRICE-1).

`PriceService.preview` giữ hình `PricePreview` (`openSessions`, `finalizedSessions`) nhưng lọc theo `rubric_name` (các phiên bản của nó), không theo cả giảng viên.

### 3.3 Phạm vi tính lại

`recomputeForTeacher` thêm `scope.rubricName` (bài có `rubric_id_version ∈ {phiên bản của (teacher, name)}`); `scope.rubricId` (một phiên bản) giữ cho đánh dấu tiêu chí.

| Thao tác | `reason` | Phạm vi |
|---|---|---|
| Đổi điểm trừ một dòng áp dụng | `price_change` | `{ rubricName, ruleId }` |
| Thêm dòng áp dụng (lỗi máy kiểm được) / gỡ dòng / chuyển tiêu chí | `rule_revision` | `{ rubricName }` |
| Thêm dòng áp dụng cho lỗi bằng lời | — | không tính lại (T-FAIR-1: luật lời không áp ngược) |
| Sửa tên/mô tả/điều kiện, phạm vi *cả N rubric* | `rule_revision` | như hôm nay, chỉ `predicate` đổi mới đổi được điểm (tên, mô tả thì không) → khi đó tính lại cả giảng viên; không thì không tính lại |
| Tách bản riêng | `rule_revision` | `{ rubricName }` |
| Duyệt / bỏ lỗi AI đề xuất | `rule_revision` | `{ rubricName }` khi duyệt; cả giảng viên khi `dismissed` (như hôm nay) |
| Đánh dấu / gỡ "tiêu chí không trừ điểm" | `criterion_waiver` | `{ rubricId }` (như hôm nay) |

### 3.4 Chốt phiên và "áp giá mới cho phiên đã chốt"

- Chốt phiên ghim `exam_session.pinned_price_version_id` = phiên bản giá hiện hành của giảng viên — **không đổi**. Vì bảng giá được chép nguyên, một phiên bản giá chứa dòng giá của **mọi** dòng áp dụng; phiên của rubric A đọc đúng các dòng của A.
- `planReapply`: map giá = `rubric_error_price` của phiên bản hiện hành **chỉ cho các dòng áp dụng của rubric của phiên** (`rubric_name` suy từ `exam_session.rubric_id`), khoá bằng `error_rule_id` để `repriceBreakdown` giữ nguyên chữ ký.
- Sửa điểm trừ ở rubric B **không** làm đổi "áp giá mới" của phiên thuộc rubric A (T-RBE-PRICE-4).

### 3.5 `mismatchedRules` còn lại

`computeScore` giữ phép lọc `rubricKeys.has(criterionKey)` — nhưng nay nó chỉ bắt dòng áp dụng gắn tiêu chí đã bị xoá khỏi **bản rubric của bài đó**. Cột "N bài lệch tiêu chí" **biến mất** khỏi giao diện; `danglingCount` của `overview` thay nó và báo ở dải trạng thái (mục 5.3).

### 3.6 Ngoại lệ cấp lỗi và tách bản riêng

> **Bổ sung 2026-10-08 (review cuối):** `error_rule.split_from_rule_id` ghi lỗi gốc của một bản tách (migration `1789550000001`). Hồ sơ lượt chấm cũ định danh lỗi "AI đọc bài" bằng `rule_key` của lỗi gốc, nên khi chấm điểm các khoá của tổ tiên được đổi sang khoá hiện hành (`aliasMapOf`), và "áp giá mới cho phiên đã chốt" đi theo dòng dõi để lấy giá của bản tách. Dòng áp dụng đã gỡ vẫn góp giá cuối của nó cho việc áp giá.

`teacher_review(kind = 'error_exception', error_rule_id)` trỏ luật theo `error_rule.id`. Khi **tách bản riêng**, luật mới có id mới, nên ngoại lệ đã đặt cho bài của rubric đó sẽ mất hiệu lực lặng lẽ. Để giữ quyết định của giảng viên, tách bản riêng **chép các ngoại lệ hiện hành** của bài thuộc rubric đó sang luật mới, bằng đúng đường ghi của `ErrorExceptionService.writeReview` (một dòng `teacher_review` mỗi bài, `reviewed_at` hiện tại) — T-RBE-SPLIT-3.

### 3.7 Đánh dấu "tiêu chí này không trừ điểm" qua các phiên bản rubric

`criterion_waiver` hôm nay gắn **phiên bản** rubric (`rubric_id`), nên lưu bản mới thì đánh dấu mất. Với D2, `RubricService.saveNewVersion` **chép các đánh dấu còn hiệu lực** sang bản mới cho những tiêu chí còn tồn tại ở bản mới, trong cùng transaction (T-RBE-WAIVER-1). Bảng và các route `GET/POST /rubrics/:id/criterion-waivers` giữ nguyên; giao diện dùng `overview.rubricId` (bản mới nhất). Thông báo "đánh dấu lại cho bản mới" ở `CeilingCard` bị bỏ cùng thẻ đó.

## 4. Hợp đồng API

Mọi route `@Roles('teacher')`, giảng viên lấy từ JWT (không route nào nhận `teacherId` ở body); rubric hay luật của người khác → 404 (T-POL-8). `rubricName` đi bằng query (GET) hoặc body (ghi). Lỗi trả tiếng Việt, như hôm nay.

### 4.1 Tổng quan rubric

`GET /rubric-errors/overview` → `RubricOverview[]` — một phần tử cho **mỗi rubric** (theo tên), sắp theo thời điểm lưu bản mới nhất giảm dần (phần tử đầu là rubric mở mặc định), nuôi ô chọn, trạng thái và dải việc cần làm:

```ts
interface RubricOverview {
  rubricName: string;
  rubricId: string;                 // phiên bản mới nhất — dùng cho đánh dấu tiêu chí và hộp thoại sửa
  totalPoints: number;
  criteria: { key: string; description: string; maxPoints: number; errorCount: number;
              waiverId: string | null }[];       // waiverId ≠ null = "không trừ điểm"
  errorCount: number;               // dòng áp dụng chưa gỡ
  unpricedCount: number;
  danglingCount: number;            // mục 2.3.4
  proposalCount: number;            // lỗi AI đề xuất thấy ở rubric này + lỗi cũ chưa rõ nơi thấy
  sessions: { id: string; name: string; semesterName: string;
              state: 'not_started' | 'grading' | 'finalized'; resultCount: number }[];
  semesters: string[];              // suy từ sessions, không trùng
}
```
`state` của phiên: `not_started` khi chưa có `grading_result`; `finalized` khi mọi kết quả ở `finalized`/`exported` (cùng điều kiện `planReapply`); còn lại `grading`.

### 4.2 Dòng áp dụng của một rubric

- `GET /rubric-errors?rubricName=` → `RubricErrorItem[]`
  ```ts
  interface RubricErrorItem {
    id: string;                     // rubric_error.id
    ruleId: string; ruleKey: string;
    name: string; description: string;
    predicate: RulePredicate | null; checkedBy: 'machine' | 'model'; origin: 'teacher' | 'seed' | 'agent_reported';
    criterionKey: string; criterionDangling: boolean;
    deduction: string | null;       // "1.50" | null
    appliedTo: { results: number; sessions: number };   // lượt tính mới nhất của bài THUỘC RUBRIC NÀY, counted <> 'excluded'
    alsoIn: { rubricName: string; criterionKey: string; deduction: string | null }[];
  }
  ```
- `POST /rubric-errors` — thêm một lỗi vào rubric. Body: `{ rubricName, criterionKey, deduction?: string|null }` cộng **đúng một** trong:
  - `ruleId` (lỗi có sẵn trong thư viện, hoặc lỗi `proposed` được duyệt) kèm `changes?: { name?, description?, predicate? }` (chỉ áp cho lỗi `proposed`: sửa rồi kích hoạt);
  - `newRule: { name, description, predicate: RulePredicate | null, ruleKey?: string }` — `ruleKey` do server sinh từ tên, **tự thêm hậu tố `_2`, `_3`…** nếu trùng (giảng viên không bao giờ thấy 409 vì khoá họ chưa từng thấy). `ruleKey` tường minh chỉ dành cho công cụ (lệnh diễn tập cần khoá cố định để so với kỳ vọng); nếu gửi mà đã có → 409. Giao diện **không bao giờ** gửi nó.
  → `{ rubricErrorId, ruleId, recompute: RecomputeSummary | null }`. Dòng đã tồn tại nhưng đã gỡ thì bật lại (mục 2.3.2). Dòng đang dùng → 409 `Lỗi này đã có trong rubric`. `ruleId` phải là luật `active` hoặc `proposed` của chính giảng viên; `dismissed` / `retired` → 409. Tiêu chí không có ở bản mới nhất của rubric → 400 (mục 2.3.3).
- `PATCH /rubric-errors/:id` `{ criterionKey }` — chuyển sang tiêu chí khác của rubric → `{ recompute }`.
- `DELETE /rubric-errors/:id` — gỡ khỏi rubric này (đặt `removed_at`) → `{ recompute }`. Lỗi vẫn ở thư viện, rubric khác không đổi.
- `PUT /rubric-errors/:id/price` `{ deduction: string | null }` → `{ versionId, recompute }`; `POST /rubric-errors/:id/price/preview` → `PricePreview` (mục 3.2). Điểm trừ gửi đi là **chuỗi thập phân** hoặc `null` (server 400 nếu là số JSON — như hôm nay).
- `POST /rubric-errors/copy` `{ fromRubricName, toRubricName }` — sao chép các dòng áp dụng chưa gỡ của nguồn sang đích, **ghép theo `criterion_key`**; dòng đích đã có lỗi đó thì bỏ qua; dòng có tiêu chí không có ở **bản mới nhất** của đích thì bỏ qua và đếm. Điểm trừ lấy từ phiên bản giá hiện hành của nguồn, ghi **một** phiên bản giá mới. → `{ copied, skippedNoCriterion, skippedExisting, recompute }`. Nguồn = đích → 400.

### 4.3 Thư viện lỗi và lỗi AI đề xuất

- `GET /rules` → `LibraryRule[]` (`state = 'active'`): `{ id, ruleKey, origin, revision: {id, revision, name, description, predicate}, checkedBy, uses: { rubricName, criterionKey, deduction }[] }`. Mất `criterionKey`, `deduction`, `appliedTo`, `mismatchedIn` ở cấp luật.
- `GET /rules/missing?rubricName=` → `ProposalItem[]`: `{ id, ruleKey, name, description, sightings: { sessions: {id, name}[]; results: number }, legacy: boolean }`. Có `rubricName`: chỉ lỗi có `error_rule_sighting` ở rubric đó, kèm số liệu **của rubric đó**; cộng các lỗi `legacy` (không có sighting nào — báo trước khi có bảng này). Không có `rubricName`: mọi lỗi `proposed`.
- `PATCH /rules/:id` `{ name?, description?, predicate? }` — **cả N rubric**. → `{ revisionId, recompute }` (tính lại cả giảng viên khi `predicate` đổi, như hôm nay).
- `POST /rules/:id/split` `{ rubricName, changes: { name?, description?, predicate? } }` — **chỉ rubric đó**: tạo luật mới (`origin 'teacher'`, `ruleKey` mới duy nhất), bản sửa 1 sao từ luật cũ kèm `changes`, **chuyển** dòng áp dụng của rubric đó sang luật mới (giữ tiêu chí và toàn bộ lịch sử dòng giá — dòng giá khoá theo dòng áp dụng nên đi theo), chép ngoại lệ (mục 3.6). Luật cũ và dòng áp dụng ở rubric khác không đổi. Luật không dùng ở ≥ 2 rubric → 409 (nút đó không tồn tại trong trường hợp ấy). → `{ ruleId, rubricErrorId, recompute }`.
- `POST /rules/:id/state` `{ state: 'dismissed' | 'retired' }` — giữ cho "Không phải lỗi". `state: 'active'` **bỏ** (duyệt đi qua `POST /rubric-errors`).

### 4.4 Gỡ bỏ

`POST /rules` (tạo luật không gắn rubric), `POST /rules/preview`, `PUT /rules/:id/price`, `POST /rules/:id/price/preview` — **xoá**, thay bằng các route mục 4.2. Không có client nào khác ngoài `apps/web` (đã kiểm: `apps/agent` không gọi). Client OpenAPI (`packages/shared/src/api/schema.d.ts`) sinh lại từ API đang chạy (quy trình ở memory `cine-openapi-client-regeneration`).

## 5. Giao diện

Nguồn sự thật là **mock-up đã duyệt**; mục này chỉ ghi điều mock-up không tự nói được. Trạng thái 1–13 của mock-up là bảng nghiệm thu thủ công (mục 7.6).

### 5.1 Cấu trúc trang `/teacher/rules`

```
PageHeader "Bảng lỗi"  ·  [Thêm lỗi]  (một nút chính duy nhất)
RubricSwitcher         ≤ 4 rubric: hàng thẻ (tên + tình trạng) · ≥ 5: "Rubric đang mở" + Đổi rubric + Gần đây + tóm tắt + lọc học kỳ
RubricMeta             điểm tổng · số tiêu chí · "Dùng ở: <phiên> (đang chấm|đã chốt)" · [Sửa tiêu chí & điểm tối đa]
ReadinessBanner        cần làm | sẵn sàng | rubric mới (kèm chọn rubric nguồn để sao chép)
Tabs                   Lỗi theo tiêu chí · Lỗi AI đề xuất (n) · Thư viện lỗi (m)
  └ CriterionGroup × k ─ ErrorRow × n (Lỗi · Cách phát hiện · Điểm trừ · Đã gặp · ⋯) · [Thêm lỗi vào "tiêu chí"]
Drawers/Dialogs        AddErrorDrawer · EditErrorDrawer · RubricDialog · PricePopover
```
Rubric đang mở nằm trong URL: `/teacher/rules?rubric=<tên>` (mở trực tiếp được, giữ khi tải lại). Không có `rubric`, hoặc tên không còn tồn tại → phần tử đầu của `overview` (rubric lưu gần nhất); chưa có rubric nào → màn hình lần đầu. Tab đang mở là state cục bộ.

### 5.2 Trạng thái của một rubric (thuần, `lib/rubric-board.ts`)

```
việc cần làm = [ tiêu chí chưa có lỗi và chưa đánh dấu không-trừ-điểm,
                 lỗi chưa có điểm trừ,
                 lỗi AI đề xuất (proposalCount > 0),
                 lỗi gắn tiêu chí không còn (danglingCount > 0) ]   // mỗi loại có mặt đếm một
errorCount = 0 và không phải mọi tiêu chí đều đã đánh dấu  →  'new'   "Chưa có lỗi nào"
còn việc                                                    →  'todo'  "Còn N việc"
không còn việc                                              →  'ready' "Sẵn sàng chấm tự động"
```
Câu trong dải: *"Cho tới khi xong, bài chấm theo rubric này sẽ chuyển sang "Cần bạn xem" thay vì tự duyệt."* — đúng với T-FLOOR-6 (tiêu chí không có luật và không đánh dấu thì không tự quyết).

### 5.3 Dải trạng thái và lối vào

Mỗi dòng việc là một nút: *Thêm lỗi* (cuộn tới nhóm và nháy khung), *Đặt điểm trừ* (cuộn tới dòng đầu tiên chưa có điểm trừ), *Xem lỗi AI đề xuất* (mở tab), và với `danglingCount`: *Chuyển sang tiêu chí khác* (mở nhóm "Chưa có tiêu chí" ở cuối tab, nơi các dòng mồ côi nằm kèm ⋯).

### 5.4 Ngăn kéo "Thêm lỗi"

Đầu ngăn kéo cố định **rubric › tiêu chí (điểm tối đa)**; mở từ nút toàn trang thì tiêu chí là một ô chọn. Hai tab: *Chọn lỗi có sẵn* (thư viện, trừ lỗi đã có ở rubric này; gợi ý điểm trừ lấy từ rubric khác đang dùng lỗi đó, **sửa được**) và *Tạo lỗi mới* (tên, mô tả, cách phát hiện, nhóm test nếu Tự động, điểm trừ). Mở từ *Lỗi AI đề xuất* → tab *Tạo lỗi mới* điền sẵn, tiêu chí chưa chọn (nút lưu khoá, có `title` nói lý do). Khối *Lưu thì áp vào đâu* mô tả theo từng phiên của rubric (mục 1.1).

### 5.5 Sửa lỗi dùng chung (ngăn kéo "Sửa lỗi")

Mở từ ⋯ → *Sửa tên, mô tả, cách phát hiện*, hoặc từ Thư viện lỗi. Lỗi ở ≥ 2 rubric: hai nút theo D4, mỗi nút kèm một dòng hệ quả; từ Thư viện chỉ có *Lưu cho cả N rubric* + hướng dẫn đổi riêng. Lỗi ở 1 rubric: một nút *Lưu*. Khoá khi không có thay đổi hợp lệ (tên/mô tả rỗng, nhóm test rỗng khi Tự động). Luật cũ mang mẫu "máy chưa đo được" (D9): cách phát hiện hiện *AI đọc bài*, kèm dòng chữ ghi điều kiện; sửa tên/mô tả giữ nguyên `predicate`; đổi sang *Tự động* thay `predicate` bằng `test_group_failed`.

### 5.6 Nhiều rubric

Ngưỡng `MANY = 4`. Bảng *Đổi rubric*: tìm (bỏ dấu + `đ`→`d`), nút lọc *Tất cả / Cần làm / Sẵn sàng / Mới* (đếm theo học kỳ đang chọn), ô *Học kỳ* (danh sách dựng từ chính các phiên, mới nhất trước, "Chưa gắn học kỳ" cuối), ô *Sắp xếp* (gần đây / A–Z locale `vi` / cần làm trước), ↑↓ Enter Esc. Đang lọc học kỳ thì hiện chip "Học kỳ: … · Bỏ lọc" và nút ghi "(4/14)". Tạo rubric mới đặt lại bộ lọc học kỳ về Tất cả. Lọc học kỳ **không bao giờ chặn thao tác** (`CLAUDE.md` §1.2).

### 5.7 Từ vựng

| Hôm nay | Sản phẩm |
|---|---|
| Luật / Bảng lỗi | Lỗi (tên trang vẫn là "Bảng lỗi") |
| Giá · Đặt giá · Chưa có giá | Điểm trừ · Đặt điểm trừ · Chưa có điểm trừ |
| Cách khớp: Máy kiểm / Bằng lời / Máy chưa đo được | Cách phát hiện: Tự động (chạy test) / AI đọc bài |
| Trần · Trần điểm theo tiêu chí | Điểm tối đa (ngay tiêu đề nhóm tiêu chí) |
| Đang áp vào | Đã gặp |
| Luật còn thiếu | Lỗi AI đề xuất |
| Tiêu chí này không có luật trừ | Tiêu chí này không trừ điểm |
| Phiên bản rubric · Sửa trần | (ẩn) · Sửa tiêu chí & điểm tối đa |
| Lệch tiêu chí | (biến mất; thay bằng `danglingCount`) |

### 5.8 Điều hướng từ nơi khác

Các trang chấm điểm đang liên kết `/teacher/rules` (`CaseFlagsBanner`, `ErrorList`, `LeverageLine`, `ReapplyPricesPanel`, `RubricRow`, `RubricPicker` của tạo phiên, `preflight.ts`). Giữ nguyên đường dẫn; ở các chỗ biết rubric của phiên thì thêm `?rubric=<tên>` để mở đúng rubric (T-RBE-UI-9). Không thêm `?criterion=` ở đợt này.

## 6. Di chuyển dữ liệu

Một migration `…-RubricErrors.ts` (mốc sau `1789540000000`), gồm DDL mục 2.2 và `BACKFILL_SQL` xuất riêng để test chạy được trên dữ liệu dựng sẵn:

1. **Dòng áp dụng:** với mỗi luật `active` (giảng viên T, tiêu chí K ở bản sửa hiện hành) và mỗi **tên** rubric N của T mà *một phiên bản nào đó* của N có tiêu chí K → một `rubric_error(T, N, rule, K)`. Đây đúng là tập (luật, rubric) mà tính điểm hôm nay *thực sự áp* (mục 0.2).
2. **Giá:** với mỗi `price_table_version` và mỗi dòng `rule_price(V, rule, deduction)` → mỗi dòng áp dụng vừa tạo của `rule` nhận `rubric_error_price(V, dòng, T, deduction)`. Chép **mọi** phiên bản giá, để mọi phiên đã chốt (ghim phiên bản cũ) đọc được giá cũ qua bảng mới.
3. **Luật `proposed`:** giữ nguyên, không dòng áp dụng, không sighting → hiện là `legacy` (mục 4.3).
4. `ALTER … DROP NOT NULL` ở `criterion_key`.
5. `BACKFILL_SQL` nhận tham số giảng viên (`NULL` = tất cả) và **idempotent** (`ON CONFLICT DO NOTHING`), để test chạy trên một giảng viên dựng riêng.

**Kiểm chứng:** T-RBE-MIG-1…3. **Hoàn tác (`down`):** đặt `criterion_key = 'chua_gan'` cho dòng NULL, `SET NOT NULL`, xoá ba bảng mới và hàm không còn dùng; `rule_price` còn nguyên nên điểm cũ tính lại được. Migration chạy **trên DB local** (`DATABASE_URL` ghi đè — `apps/api/.env` trỏ Supabase từ xa; memory `cine-migration-hits-supabase`), và trên Supabase chỉ sau khi đối soát bảng `migrations` (memory `cine-migration-history-drift`).

## 7. Kiểm thử

Quy ước repo: e2e chạy **tuần tự** (`npx jest --config ./test/jest-e2e.json --runInBand`), cần Postgres + MinIO + bucket (memory `cine-e2e-test-prerequisites`); web `vitest run`; `pnpm check:cycles` phải ra 0.

### 7.1 Dữ liệu và migration
- **T-RBE-DATA-1** Một dòng giá không trỏ được dòng áp dụng của giảng viên khác (khoá ngoại ghép bắn).
- **T-RBE-DATA-2** `rubric_error_price` chỉ thêm (UPDATE/DELETE bị từ chối); `rubric_error` không xoá được; `uq_rubric_error` chặn trùng.
- **T-RBE-DATA-3** Ghi dòng áp dụng với rubric không tồn tại **cho giảng viên này** → 404 (cùng khuôn T-POL-8, không lộ rubric của người khác); tiêu chí không có ở bản mới nhất của rubric → 400.
- **T-RBE-MIG-1** `BACKFILL_SQL` trên dữ liệu dựng (2 giảng viên, 3 rubric, trong đó 1 rubric nhiều phiên bản và 2 rubric trùng khoá tiêu chí): số dòng áp dụng và giá đúng như mục 6.
- **T-RBE-MIG-2** **Tương đương:** với từng **phiên bản** rubric đã dựng, tập `RuleSnapshot` của loader mới bằng tập của loader cũ (SQL cũ giữ nguyên trong file test) **sau khi lọc theo tiêu chí của phiên bản đó** — đúng phép lọc `rubricKeys.has(criterionKey)` mà `computeScore` làm — ở mọi `ruleId`, `criterionKey`, `deductionHundredths`; rồi `computeScore` trên cùng hồ sơ cho cùng điểm. (Loader cũ trả cả luật không thuộc rubric; loader mới không trả — chỉ so phần còn lại sau lọc.)
- **T-RBE-MIG-3** Chạy `BACKFILL_SQL` hai lần không đổi gì; luật `proposed` không sinh dòng nào.

### 7.2 Tính điểm
- **T-RBE-SCORE-1** Bài của rubric A không thấy luật chỉ có ở rubric B (không còn `mismatchedRules` sinh từ luật của rubric khác).
- **T-RBE-SCORE-2** Cùng một lỗi trừ 1,0 ở A và 2,0 ở B → hai bài cùng vi phạm cho hai điểm khác nhau.
- **T-RBE-SCORE-3** Dòng áp dụng gắn tiêu chí đã xoá khỏi bản mới: bài chấm theo bản mới có `mismatchedRules`, bài ghim bản cũ thì không.
- **T-RBE-SCORE-4** `loadRuleEntries` chỉ trả lỗi của rubric của bài; cờ `priced` theo giá của **dòng áp dụng đó**.

### 7.3 Giá, chốt, tính lại
- **T-RBE-PRICE-1** `setPrice` ở rubric A không đổi `rubric_error_price` của rubric B ở phiên bản giá mới; chỉ bài của A (phiên chưa chốt) được tính lại.
- **T-RBE-PRICE-2** Phiên bản giá mới chép đủ mọi dòng (kể cả rubric khác); đặt `null` hợp lệ.
- **T-RBE-PRICE-3** `PricePreview` đếm đúng phiên đang chấm / đã chốt **của rubric đó**.
- **T-RBE-PRICE-4** Phiên đã chốt giữ giá đã ghim; `reapply` của phiên thuộc A không bị đổi bởi giá ở B; từ chối khi một luật lúc chốt có giá nay chưa có giá (như hôm nay).
- **T-RBE-PRICE-5** Hai giảng viên không thấy/không ghi được dòng của nhau (404).

### 7.4 API
- **T-RBE-API-1** `overview`: đếm tiêu chí rỗng, chưa có điểm trừ, mồ côi, đề xuất; `semesters` suy từ phiên; `state` của phiên đúng ba giá trị.
- **T-RBE-API-2** `POST /rubric-errors`: ba đường (`ruleId` thư viện; `ruleId` đề xuất + `changes` → kích hoạt; `newRule` sinh `ruleKey` và tự thêm hậu tố khi trùng); thêm lại dòng đã gỡ bật lại cùng id; dòng đang dùng → 409.
- **T-RBE-API-3** `PATCH` chuyển tiêu chí / `DELETE` gỡ: tính lại đúng phạm vi `{ rubricName }`, rubric khác không bị tính lại.
- **T-RBE-API-4** `POST /rubric-errors/copy`: ghép theo khoá, bỏ qua dòng đã có, bỏ qua tiêu chí không có, đếm đúng ba con số, một phiên bản giá mới; nguồn = đích → 400.
- **T-RBE-API-5** `GET /rules/missing?rubricName=`: lọc theo sighting, số bài/phiên **của rubric đó**; lỗi `legacy` có mặt ở mọi rubric.
- **T-RBE-API-6** `recordMissingRules` ghi sighting một lần mỗi (luật, bài); chạy lại không nhân đôi.
- **T-RBE-API-7** Route đã gỡ trả 404; mọi route mới từ chối vai trò khác `teacher`.

### 7.5 Sửa lỗi dùng chung và tách bản riêng
- **T-RBE-SPLIT-1** `PATCH /rules/:id` đổi ở **cả** rubric dùng nó; `split` chỉ đổi ở rubric đó và rubric còn lại giữ nguyên nội dung cũ.
- **T-RBE-SPLIT-2** `split` giữ tiêu chí, điểm trừ và `appliedTo` của rubric đó; `ruleKey` mới duy nhất; luật chỉ ở 1 rubric → 409.
- **T-RBE-SPLIT-3** Ngoại lệ cấp lỗi đã đặt cho bài của rubric đó theo sang luật mới (điểm bài không đổi sau tách); bài rubric khác không bị chép.
- **T-RBE-WAIVER-1** Lưu rubric bản mới chép đánh dấu "không trừ điểm" cho tiêu chí còn lại, bỏ đánh dấu của tiêu chí đã xoá.

### 7.6 Web
- **T-RBE-UI-1** `rubric-board.ts`: trạng thái `new/todo/ready` và các loại việc (bảng chân trị trên 8 tổ hợp), `capNames`, `fold`, danh sách học kỳ (thứ tự, `Chưa gắn` cuối), lọc/sắp xếp bảng chọn, hợp của bộ lọc học kỳ + tình trạng + từ khoá.
- **T-RBE-UI-2** Trang: ≤ 4 rubric → hàng thẻ, ≥ 5 → ô chọn; rubric theo `?rubric=`; đổi rubric đổi mọi thứ bên dưới; không có chữ "giá", "Cách khớp", "trần", "luật", "cần backend", `chua_gan`.
- **T-RBE-UI-3** Dải trạng thái: mỗi dòng việc là nút làm đúng việc; rubric mới hiện ô chọn nguồn **không chọn sẵn**, nút Sao chép khoá tới khi chọn, dòng xem trước đúng số.
- **T-RBE-UI-4** `PricePopover`: nhận dấu phẩy, từ chối "abc"/âm/3 số lẻ, rỗng gửi `null`, xem tác động theo phiên, lưu ghi lỗi máy chủ nguyên văn, chỉ đổi dòng của rubric đang mở.
- **T-RBE-UI-5** `AddErrorDrawer`: ngữ cảnh cố định; gợi ý điểm trừ từ rubric khác sửa được; nút lưu khoá khi thiếu tiêu chí và nói vì sao; mở từ đề xuất điền sẵn.
- **T-RBE-UI-6** `EditErrorDrawer`: hai nút khi dùng ở ≥ 2 rubric (cùng dòng hệ quả), một nút ở Thư viện, một nút khi dùng ở 1 rubric; khoá khi không đổi; luật cũ "máy chưa đo được" hiện AI đọc bài + ghi chú và giữ `predicate` khi chỉ đổi tên.
- **T-RBE-UI-7** Lỗi AI đề xuất: ngữ cảnh phiên/số bài; *Không phải lỗi* hỏi xác nhận nêu hệ quả rồi hiện kết quả tính lại bằng lời.
- **T-RBE-UI-8** Thư viện: chặn trần "và N nơi dùng khác"; mọi chỗ liệt kê rubric chặn trần.
- **T-RBE-UI-9** Liên kết từ trang chấm điểm mang `?rubric=` khi biết rubric; `/teacher/rules/new` và `/teacher/rules/[ruleId]` chuyển hướng.
- **T-RBE-UI-10** Lọc học kỳ: mặc định Tất cả; giữ sau khi chọn rubric; hiện chip + Bỏ lọc; tạo rubric mới đặt lại về Tất cả; lọc không vô hiệu hoá nút nào.

### 7.7 Nghiệm thu thủ công và đo lường
- Duyệt từng trạng thái 1–13 của mock-up trên bản chạy thật, đối chiếu ảnh chụp.
- **Diễn tập chấm điểm chạy lại** (`pnpm rehearsal`, bản ghi ở `docs/rehearsals/`): đợt này đổi **đường nạp bảng lỗi** nên *có thể* đổi điểm. Theo `grading-benchmark-history`, sửa chỉ "xong" khi lượt chạy lại **chứng minh** — ghi bản ghi mới, so với lượt trước (độ chính xác điểm, recall/precision lỗi, quyết định tự duyệt đúng, cờ giả/sót). Kỳ vọng: **không đổi** (D12).

## 8. Ngoài phạm vi

- Xoá bảng `rule_price` và cột `error_rule_revision.criterion_key` (đợt dọn sau, khi chắc không còn đọc).
- Lưu trữ / ẩn rubric (D10); học kỳ thành bảng có khoá ngoại ở rubric.
- Thêm lỗi ngay từ màn chấm bài (kiểu "mục rubric động" của Gradescope).
- Mức độ (performance levels) cho tiêu chí chủ quan; đo độ nhất quán riêng cho tiêu chí "Trình bày".
- `?criterion=` trong liên kết sâu; ô tìm trong ô chọn rubric nguồn; lịch sử "gần đây" đồng bộ qua máy chủ.
- Tạo mới mẫu điều kiện "máy chưa đo được" từ giao diện (D9).
- Ghim **phiên bản lỗi** (revision) vào dòng áp dụng/phiên chốt: hôm nay chấm theo bản sửa hiện hành; sửa *cả N rubric* ảnh hưởng phiên chưa chốt của mọi rubric đó (mục 9, R2).

## 9. Rủi ro và câu hỏi mở

**Câu hỏi đã chốt (2026-10-08):**
- **Q1 (D9).** ✅ Bỏ khả năng *tạo mới* ba mẫu điều kiện máy chưa đo được — làm theo plan / D9. Luật cũ mang mẫu đó vẫn chạy, hiện *AI đọc bài* + ghi chú điều kiện.
- **Q2.** ✅ Giữ như mock-up: ngưỡng `MANY = 4` (≥ 5 → picker), "gần đây" = 3 chip (`RECENT_SHOWN`), lưu tối đa 8 trong `localStorage`.

**Rủi ro:**
- **R1. Nhiều mảnh chạm tính điểm.** Mọi thay đổi chạm đường chấm đều phải qua diễn tập chạy lại (mục 7.7) — không đủ chỉ test xanh.
- **R2. Sửa "cả N rubric" đổi cách chấm của phiên chưa chốt ở rubric khác.** Giảm nhẹ bằng khối hệ quả liệt kê tên phiên; chưa ghim phiên bản lỗi theo phiên (mục 8). Đây là chỗ Canvas phải khoá; ở đây cho giảng viên chọn.
- **R3. Tách bản riêng sinh hai lỗi cùng tên trong thư viện** (bản cũ và bản riêng). Thư viện luôn hiện kèm *đang dùng ở rubric nào* nên phân biệt được; nếu vẫn rối, thêm hậu tố hiển thị ở đợt sau.
- **R4. Ngoại lệ cấp lỗi khi tách** (mục 3.6) là thao tác ghi thêm hồ sơ; nếu sai sẽ đổi điểm bài đã duyệt. T-RBE-SPLIT-3 là bài kiểm thử bắt buộc, chạy trước khi nối route.
- **R5. Không có khoá ngoại `rubric_name`.** Toàn vẹn nằm ở service (T-RBE-DATA-3). Chấp nhận vì rubric không bao giờ bị xoá và danh tính rubric theo `CLAUDE.md` §5.1 là (giảng viên, tên).
- **R6. `<select>` gốc ở ô chọn nguồn sao chép** với hàng chục rubric chỉ tìm được bằng gõ ký tự đầu. Biết và chấp nhận ở đợt này.
- **R7. Hợp đồng API đổi hẳn.** Web và API phải cùng đợt; plan tách hai phần có cổng giữa (OpenAPI sinh lại). Làm trên nhánh hiện tại của checkout (không tách worktree riêng).

## 10. Tệp bị ảnh hưởng

**API (`apps/api/src`):** `database/migrations/…-RubricErrors.ts` (mới), `database/verify-schema.ts`; `grading/entities/` (+ `rubric-error.entity.ts`, `rubric-error-price.entity.ts`, `error-rule-sighting.entity.ts`; sửa `error-rule-revision.entity.ts`); `grading/scoring/score-inputs.ts`, `score.service.ts`; `grading/pipeline/rule-entries.ts`, `investigation-context.service.ts`; `grading/rules/` (`error-rule.service.ts`, `price.service.ts`, `missing-rules.ts`, `rules.controller.ts`, `rule-input.ts`, `dto/`; + `rubric-error.service.ts`, `rubric-overview.service.ts`); `grading/rubric.service.ts` (chép đánh dấu); `grading/grading.module.ts`; `eval/` và `eval/rehearsal/` (dựng bảng lỗi theo rubric).
**Web (`apps/web/src`):** viết lại `app/teacher/rules/**`; `lib/api/rules.ts` + `lib/api/rubric-errors.ts` (mới); `hooks/useRules.ts` + `hooks/useRubricErrors.ts` (mới); `lib/rubric-board.ts` (mới); xoá `lib/rules-filter.ts`, `lib/rule-form.ts`, các component cũ; sửa các liên kết ở mục 5.8; `packages/shared/src/api/schema.d.ts` (sinh lại).
**Tài liệu:** `docs/update-grading-system-guide.md` (rev kế tiếp), `docs/rehearsals/` (bản ghi mới), `CLAUDE.md` (một dòng ở mục AI Grading Strategy: *điểm can thiệp là bảng lỗi **của từng rubric***).
