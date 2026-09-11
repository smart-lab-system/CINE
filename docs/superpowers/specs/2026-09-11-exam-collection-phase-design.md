# Giai đoạn "Đang thu bài" và hành động "Thu lại" — Thiết kế

**Ngày:** 2026-09-11 · **rev 2** (sau review)
**Trạng thái:** chờ review lại
**Nguồn:** task #4 "Thu lại bài thi" (session `0f3ad631`, mở từ 2026-08-31, chưa từng thi công)

---

## 1. Vấn đề

Khi hết giờ làm bài, `ExamSessionScheduler` chuyển phiên thẳng từ `active` sang `completed`. Nghĩa là **`completed` hiện mang nghĩa "đồng hồ hết giờ", không phải "giảng viên đã xác nhận xong"**.

Hệ quả: không có khoảnh khắc nào trong hệ thống để giảng viên đứng tại phòng thi nhìn lại và xử lý những em thiếu bài. Phiên đã đóng trước khi họ kịp nhìn.

Cụ thể, ba thứ thiếu:

1. Không có trạng thái nào nghĩa là "hết giờ rồi, đang gom bài về, chưa chốt".
2. Không có hành động **"Thu lại"** — không route, không sự kiện socket nào yêu cầu agent nộp lại.
3. Không có hành động **"Xác nhận kết thúc"** — vì phiên đã `completed` từ lúc chuông reo, chẳng còn gì để xác nhận.

### 1.1 Phần lớn "Đang thu bài" đã tồn tại — ở dạng dẫn xuất

Điều tra code ngày 2026-09-11 cho thấy bản thiết kế nháp cũ đã lỗi thời. Những thứ sau **đã có**:

| Thành phần | Nơi có |
|---|---|
| Phase `'collecting'` nhãn "Đang thu bài", có màu, có test | `apps/web/src/lib/submission-attention.ts` — `getSessionPhase()` |
| Cửa sổ ân hạn 30 phút | `SUBMISSION_GRACE_PERIOD_MS`, `apps/api/src/submission/submission.types.ts` |
| Nhận upload sau khi hết giờ | `isAcceptingUploads()` — cho upload khi `active` **hoặc** `completed`, tới `endTime + 30'` |
| Bộ lọc "đã dự thi nhưng không có bài" | `attendedNoSubmissionCount`, `AttentionKind: 'attended-no-submission'` |
| Bộ lọc "nộp thiếu file" | `AttentionKind: 'partial'` |
| Đường server → agent | `agentRoom(sessionId)`, tiền lệ `exam:finalize` và `exam:materials-updated` |
| Định danh sinh viên trên socket | `client.data.studentId` — **là MSSV**, xem §6.2 |
| Upload trùng là upsert, không lỗi | `upsertCollected()` rẽ sang update khi đụng `uq_submission_identity` |
| Giá trị `submission_via: 'manual_pull'` | Khai trong enum từ `InitialSchema`, **0 nơi dùng** |

Nói cách khác: khái niệm đã có tên, có nhãn, có hành vi backend. Thứ thiếu là **trạng thái thật trong DB** và **hai hành động của giảng viên**.

---

## 2. Phạm vi

### Trong phạm vi

- Giá trị mới `collecting` trong enum `exam_session_status`
- Hai cột mới `completed_at` / `completed_by` (§4) — cần cho §7.3 và cho hợp đồng với Task 3 ở §8.1
- Scheduler chuyển `active → collecting` khi hết giờ (thay cho `→ completed`)
- Route "Xác nhận kết thúc": `collecting → completed`
- Quét dự phòng `collecting → completed` tại `endTime + grace` nếu giảng viên không bấm
- Route + sự kiện socket "Thu lại", nhắm sinh viên **chưa nộp đủ file bắt buộc** (gồm cả nộp thiếu — §6.1)
- Rà toàn bộ chỗ so sánh `status`, gom thành predicate dùng chung
- Hai nút trên màn hình phòng thi

### Ngoài phạm vi, có lý do

| Không làm | Vì sao |
|---|---|
| Trạng thái `vắng thi` cho `Submission` | Thuộc Plan C Task 3 (§7.1.2). Ranh giới đã chốt: spec này chỉ động `exam_session_status`, Task 3 động `submission_status` — **hai migration không giao nhau**. Xem §8 |
| Agent rớt mạng vào lại được trong lúc `collecting` | `agent:join` hiện yêu cầu `status === 'active'` và trong `[startTime, endTime]`. Nới ra sẽ mở đường cho một sinh viên **chưa từng dự thi** join lúc thu bài và nộp. Làm đúng thì phải giới hạn theo attendance log — một thay đổi riêng. Xem §9.2 |
| Đổi tên sự kiện `exam:finalize` | Agent đang chạy lắng nghe đúng tên đó. Đổi tên là phá agent đã triển khai, đổi lại chỉ được sự chỉnh chu về chữ nghĩa. Ghi thành nợ kỹ thuật trong code |
| Đổi tên trạng thái file 0 byte thành "unchange" | Nằm trong danh sách #4 gốc nhưng không liên quan tới vòng đời thu bài. Tách riêng để spec này không phình |

---

## 3. Vòng đời mới

```
draft / scheduled
      │
      ▼
   active
      │
      ├── scheduler: now >= endTime ─────────┐
      │                                     │
      └── "Chốt bài ngay" (thủ công) ────────┤
                                            ▼
                                       collecting  ◄── "Thu lại" (không đổi trạng thái)
                                            │
      ┌── "Xác nhận kết thúc" ───────────────┤   completed_by = <gv>
      │                                     │
      └── scheduler: now >= endTime + grace ─┘   completed_by = NULL
                      │
                      ▼
                  completed
```

Ba điều cần nói rõ:

**`exam:finalize` bắn ở `active → collecting`, không phải ở `→ completed`.** Đây là chỗ dễ sai nhất. Agent nộp bài khi nhận `exam:finalize`; nếu dời sự kiện xuống `→ completed` thì agent chỉ nộp sau khi giảng viên bấm xác nhận — ngược hoàn toàn ý đồ. Sự kiện gắn với **"hết giờ, nộp đi"**, không gắn với trạng thái cuối.

**"Chốt bài ngay" thủ công (đã có) giờ dẫn tới `collecting`, không tới `completed`.** Giảng viên bấm nó lúc 10 giờ cho phiên đến 11 giờ nghĩa là "cả phòng làm xong rồi, nộp đi" — vẫn cần giai đoạn thu bài sau đó.

**Hai đường tới `completed` KHÔNG tương đương nhau**, và sự khác biệt đó được ghi lại chứ không bị xoá — xem §4.2 và §8.1. Đây là điểm sửa lớn nhất của rev 2.

### 3.1 "Xác nhận kết thúc" KHÔNG chặn upload

Quyết định của chủ đồ án, 2026-09-11, phương án (a).

Giảng viên bấm xác nhận lúc `endTime + 5'`; một file tới lúc `endTime + 10'` **vẫn được nhận**. Cửa sổ nhận file do `endTime + grace` quyết định, không do nút bấm.

Lý do: hệ thống này đã chọn "không bao giờ vứt bài thật" ở mọi chỗ khác — grace 30 phút, cho rejoin sau khi chốt sĩ số, nhận upload cả khi `completed` (có comment giải thích ngay trong `isAcceptingUploads`). Để nút xác nhận chặn upload là tạo ra một cách làm mất bài của sinh viên mà **không ai phát hiện cho tới lúc chấm**.

Đánh đổi phải nói ra: con số giảng viên vừa nhìn có thể đổi sau lưng họ. Xử lý bằng hiển thị (§7.3), không bằng cách chặn — và §7.3 **chỉ implement được nhờ `completed_at` ở §4**.

---

## 4. Thay đổi dữ liệu

Một migration, **ba** câu lệnh:

```sql
ALTER TYPE "examcollect"."exam_session_status" ADD VALUE IF NOT EXISTS 'collecting' AFTER 'active';

ALTER TABLE "examcollect"."exam_session" ADD COLUMN "completed_at" timestamptz;
ALTER TABLE "examcollect"."exam_session" ADD COLUMN "completed_by" uuid
  REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT;
```

> **Sửa ở rev 2.** Bản đầu viết "một migration, một câu lệnh" và đồng thời yêu cầu §7.3 so sánh `submitted_at > completed_at`. Cột đó **không tồn tại** — đã kiểm `\d examcollect.exam_session`: bảng có `attendance_confirmed_at`, `archived_at`, `attention_closed_at`, không có `completed_at`. §7.3 là toàn bộ phần giảm nhẹ cho quyết định (a), nên bỏ sót này làm hỏng chính chỗ đó.

`ADD VALUE` chỉ đụng catalog — không rewrite bảng. Hai `ADD COLUMN` nullable cũng không rewrite (Postgres 11+).

**Không dùng `updated_at` thay `completed_at`.** `updated_at` đổi theo mọi UPDATE — đổi rubric, archive, đóng attention đều chạm nó. Dòng cảnh báo §7.3 sẽ sai ngẫu nhiên và không ai truy ra vì sao.

**`down()` ném lỗi, không im lặng.** Postgres không xoá được giá trị enum. Một `down()` rỗng trông như revert thành công; ném lỗi kèm giải thích là trung thực hơn. Hai cột thì `DROP COLUMN` được, nhưng `down()` vẫn ném ngay từ đầu vì enum không lùi được.

### 4.1 Ràng buộc GiST — đã kiểm, không ảnh hưởng

`ex_exam_session_room_overlap` và `ex_exam_session_class_overlap` có predicate `WHERE status <> 'completed' AND status <> 'cancelled'`. Phiên ở `collecting` vẫn nằm trong ràng buộc thêm tối đa 30 phút.

Không gây vấn đề: khoảng `tstzrange(start_time, end_time, '[)')` của phiên đó **đã trôi qua**, nên một phiên mới bắt đầu từ `endTime` trở đi không chồng lấn. Kiểm bằng test, không chỉ bằng lập luận (§10).

### 4.2 `completed_by` là thứ phân biệt hai đường

| Đường | `completed_at` | `completed_by` |
|---|---|---|
| Giảng viên bấm "Xác nhận kết thúc" | thời điểm bấm | `id` của giảng viên |
| Quét dự phòng tại `endTime + grace` | thời điểm quét | **`NULL`** |

`NULL` ở đây mang nghĩa cụ thể và phải giữ đúng nghĩa đó: **không người nào xác nhận phiên này**. Task 3 đọc chính cột này để biết được phép kết luận "vắng thi" hay không (§8.1).

---

## 5. Rà soát chỗ so sánh trạng thái

Đây là phần rủi ro nhất của thay đổi này. Ba guard hiện viết `=== 'completed'` vì `completed` từng là **trạng thái hậu-thi duy nhất**. Thêm `collecting` tách đôi nghĩa đó, và bỏ sót bất kỳ chỗ nào đều gây lỗi im lặng.

| Chỗ | Hiện tại | Sau | Bỏ sót thì sao |
|---|---|---|---|
| `isAcceptingUploads` (`submission.service.ts`) | `active \|\| completed` | `isCollectionOpen()` | **File bay về trong lúc thu bài bị từ chối** — hỏng đúng thứ tính năng này sinh ra để cứu |
| `buildDiscrepancy` (`attendance.service.ts:194`) | `status !== 'completed'` → bỏ qua | `isExamOver()` | Báo cáo "nộp bài mà không được điểm danh" **biến mất đúng lúc giảng viên cần nó** để chọn thu lại ai |
| Xoá đề thi (`exam-material.service.ts:175`) | chặn khi `completed` | `isExamOver()` | Đề thi **mở khoá xoá trở lại** suốt cửa sổ thu bài |
| `findFinalizableIds` | `active` + `endTime <= now` | điều kiện tìm **giữ nguyên**; đích chuyển đổi thành `collecting` | — |
| *(mới)* `findCollectionExpiredIds` | — | `collecting` + `endTime + grace <= now` | Phiên treo ở `collecting` vĩnh viễn |
| `SearchExamSessionsDto` | 5 giá trị | 6 | Lọc theo trạng thái mới trả rỗng |
| `getSessionPhase` (web) | suy từ `status` + đồng hồ | **đọc `status` thẳng, xoá suy diễn** — xem dưới | Hai nguồn sự thật |
| `agent:join` | `status === 'active'` | **giữ nguyên** | Cố ý — xem §2, ngoài phạm vi |

> **Sửa ở rev 2.** Bản đầu viết "đọc `collecting` trực tiếp, **giữ suy diễn làm fallback**" ở cột giải pháp, trong khi cột rủi ro của chính dòng đó viết "Hai nguồn sự thật" — giải pháp chính là rủi ro. `getSessionPhase` **xoá hẳn** nhánh suy diễn `now > end`: khi `collecting` là trạng thái thật thì đồng hồ không còn tiếng nói. Nhánh `now <= end + grace ? 'collecting' : 'ended'` chỉ còn dùng cho **phiên `completed` tạo trước khi triển khai** (§9.3) — phạm vi hẹp đó ghi ngay trong hàm, không để mở.

### 5.1 Một predicate, không phải chuỗi rải rác

Chính sự rải rác của `=== 'completed'` tạo ra ba cái bẫy trên. Thêm hai hàm này vào `exam-session.types.ts`, import `ExamSessionStatus` từ `entities/exam-session.entity.ts` (nơi type đang khai) — `exam-session.types.ts` hiện chỉ chứa hằng số, nên đây là chỗ đúng cho predicate dùng chung mà không kéo entity vào mọi call site:

```ts
/**
 * "Kỳ thi đã qua" — đúng cho cả `collecting` lẫn `completed`.
 *
 * Tồn tại vì cả ba chỗ dùng nó trước đây đều viết `=== 'completed'` khi
 * `completed` còn là trạng thái hậu-thi DUY NHẤT. Thêm `collecting` làm
 * cả ba sai một cách im lặng. Trạng thái thứ tư sau này chỉ phải sửa ở
 * đây, không phải đi tìm lại từng chuỗi so sánh.
 */
export function isExamOver(status: ExamSessionStatus): boolean {
  return status === 'collecting' || status === 'completed';
}

/** Phiên còn nhận bài nộp về — khác `isExamOver`, và khác có chủ đích. */
export function isCollectionOpen(status: ExamSessionStatus): boolean {
  return status === 'active' || status === 'collecting' || status === 'completed';
}
```

Hai hàm chứ không một: "kỳ thi đã qua" và "còn nhận bài" **không trùng nhau** — `active` là còn nhận nhưng chưa qua, và đó chính là sự khác biệt mà một hàm duy nhất sẽ xoá mất.

---

## 6. "Thu lại"

### 6.1 Nhắm ai

**Sinh viên đã dự thi nhưng chưa nộp đủ file bắt buộc** — gồm cả em chưa nộp gì (`attended-no-submission`) **và** em nộp thiếu (`partial`).

> **Sửa ở rev 2.** Bản đầu chỉ nhắm `attendedNoSubmissionCount`, tức chỉ em **không có bài nộp nào**. Em đã upload `.zip` nhưng thiếu `.pdf` rơi ra ngoài — dù đó chính là ca thu lại có ích nhất, vì máy còn đó và chỉ thiếu một file.

Mở rộng này an toàn, đã kiểm: upload đi qua `upsertCollected()`, đụng `uq_submission_identity` thì **rẽ sang nhánh update** chứ không ném lỗi. Nên bảo agent gửi lại toàn bộ deliverable cho em nộp thiếu chỉ ghi đè phần đã có, không sinh bản ghi trùng.

Vẫn **không** phát cho cả phòng: em đã nộp đủ mà nhận lệnh nộp lại sẽ upload đè lên bài của chính mình, tốn băng thông và gây hoang mang.

### 6.2 Cơ chế

`client.data.studentId` **là MSSV**, không phải UUID — đã kiểm: `AgentJoinDto.studentId` validate `4-20 letters or digits`, và gateway dùng đúng giá trị đó làm `studentMssv` khi dựng tên file.

Nhưng có một cái bẫy thật ở đây:

```ts
// student_mssv là `citext` ở cả submission lẫn enrollment — Postgres coi
// 'SV001' và 'sv001' là MỘT sinh viên. `Set.has()` của JS thì không.
// So thẳng sẽ trượt LÚC ĐƯỢC LÚC KHÔNG tuỳ cách nhập roster, và kết quả
// là `reached: 0` trông y hệt "cả phòng đã ngắt kết nối" — giảng viên đọc
// con số đó rồi kết luận sai, ngay tại phòng thi. Sai lúc trúng lúc trượt
// còn tệ hơn sai đều: test may rủi sẽ xanh.
const missing = new Set(missingMssv.map((m) => m.toLowerCase()));

const sockets = await this.server.in(agentRoom(examSessionId)).fetchSockets();
const targets = sockets.filter((socket) => {
  const mssv = socket.data.studentId;
  return typeof mssv === 'string' && missing.has(mssv.toLowerCase());
});
```

Sự kiện **mới**, không tái dùng `exam:finalize`: agent đặt `examEnded = true` vĩnh viễn khi nhận `exam:finalize`, và bắn lại sẽ không đổi được gì ở phía nó. `exam:recollect` là lệnh riêng, agent xử lý bằng cách chạy lại chính đường upload đó **mà không** đụng `examEnded`.

Payload chỉ mang `{ examSessionId }`. Bản đầu có `reason: 'teacher_request'` với đúng một giá trị khả dĩ — một trường không phân biệt được gì thì không phải thông tin.

Bài nộp sinh ra từ đường này mang `submission_via: 'manual_pull'` — giá trị đã khai sẵn trong enum từ `InitialSchema` và cho tới nay chưa nơi nào dùng. Đây là chỗ nó được dùng, và nó làm bảng điểm phân biệt được "em tự nộp" với "giảng viên phải đi thu".

### 6.3 Trả về cho giảng viên cái gì

```ts
{ missing: 5, acknowledged: 3, unreachable: 2, unreachableNames: ['...', '...'] }
```

> **Sửa ở rev 2.** Bản đầu gọi con số này là `reached` và đếm số `socket.emit` đã gửi. `emit` là **bắn-và-quên**: socket còn kết nối nhưng tiến trình agent treo vẫn được tính. §6.3 trình bày con số này như thứ giảng viên hành động dựa vào, nên nó phải nghĩa là "agent đã nhận", không phải "server đã gửi".

Dùng ack có timeout của Socket.IO:

```ts
// 3 giây: agent chỉ cần trả lời đã nhận, chưa cần upload xong. Quá mốc
// này thì coi như không tới — thà báo thừa một máy không với được còn hơn
// báo thiếu, vì giảng viên còn đứng trong phòng và xử lý tay được.
await socket.timeout(3000).emitWithAck('exam:recollect', { examSessionId });
```

Hai con số lệch nhau là thông tin quan trọng nhất trên màn hình: 2 em `unreachable` sẽ **không nộp được** qua đường này, và giảng viên cần biết **ngay khi còn ở trong phòng**, chứ không phải phát hiện lúc chấm. `unreachableNames` là phần họ hành động dựa vào, không phải con số.

### 6.4 Bấm nhiều lần

Cho phép, không chặn. Thu lại là thao tác đọc-rồi-gửi, không đổi trạng thái gì ở server; bấm hai lần chỉ gửi hai lệnh. Sinh viên đã nộp giữa hai lần bấm tự rơi khỏi tập đích ở lần sau.

### 6.5 Chỉ chạy khi `collecting`

Route từ chối với 409 khi phiên không ở `collecting`. Bấm "Thu lại" cho phiên đã `completed` là gửi lệnh cho một buổi thi đã đóng — agent lúc đó có thể đã tắt, và bài về sau `endTime + grace` sẽ bị `isAcceptingUploads` từ chối, nên lệnh chỉ tạo kỳ vọng sai.

---

## 7. Giao diện

Hai nút nằm trên màn hình phòng thi (`/exam-sessions/[id]`) — nơi giảng viên đang theo dõi lớp, đúng chỗ họ đứng khi thao tác. Chỉ hiện khi phiên ở `collecting`.

### 7.1 "Thu lại"

- Nhãn kèm số: `Thu lại (5)`. Không có ai thiếu thì nút **disabled** kèm giải thích, không ẩn: ẩn đi làm giảng viên tưởng tính năng hỏng.
- Sau khi bấm: `3/5 máy đã nhận yêu cầu. 2 máy không phản hồi: <tên>, <tên>.`
- Danh sách tên là phần quan trọng nhất của thông báo này, không phải con số.

**Con số phải tự làm mới.** `collecting` là giai đoạn file đang bay về, nên `5` là ảnh chụp của một dữ liệu đang chạy: bấm "Thu lại (5)" trong khi 2 em đã nộp xong từ một phút trước là gửi lệnh thừa và đọc sai tình hình.

> **Bổ sung ở rev 2.** Bản đầu không nói UI làm mới thế nào.

Cách làm: trang phiên đã có socket của giảng viên (`teacher:subscribe`), nên số liệu làm mới theo sự kiện bài nộp về thay vì polling. Kèm mốc `tính đến HH:mm:ss` cạnh con số — khi socket rớt, mốc đứng yên và giảng viên **nhìn thấy** là nó đứng, thay vì tin vào một con số chết.

### 7.2 "Xác nhận kết thúc"

Hộp xác nhận nêu rõ hậu quả **và** giới hạn: *"Phiên chuyển sang Đã kết thúc. Bài nộp vẫn tiếp tục được nhận tới HH:mm (30 phút sau giờ thi) — xác nhận không chặn bài đang về."*

Câu thứ hai chống đúng cách hiểu sai mà lựa chọn (a) tạo ra.

### 7.3 Khi có bài về sau xác nhận

Không chặn, nhưng phải nói. Màn hình phiên hiện thêm một dòng khi có bài nộp với `submitted_at > completed_at`: *"Có N bài nộp về sau khi bạn xác nhận kết thúc."*

Đây là cách trả lời nhu cầu "con số cuối không đổi" mà không phải chặn upload — giảng viên biết con số đã đổi, thay vì không biết. Chỉ hiện khi `completed_by IS NOT NULL`: phiên do quét dự phòng đóng thì không có ai để nói "sau khi **bạn** xác nhận".

---

## 8. Quan hệ với Plan C

Ranh giới đã chốt 2026-09-11: **hai spec không đụng chung migration nào.**

```
Spec này   →  exam_session_status + completed_at/by
Plan C T3  →  submission_status : 'chưa nộp'/'vắng thi', trigger, bảng session_roster
```

### 8.1 Hợp đồng cấp cho Task 3 — và giới hạn của nó

§7.1.2 yêu cầu `chưa nộp` và `vắng thi` là **hai giá trị khác nhau**: dòng `chưa nộp` gieo lúc đóng băng roster, rồi đổi thành `vắng thi` khi chắc chắn em đó không nộp.

CLAUDE.md không nói **lúc nào** chuyển. Hết giờ thì quá sớm — file còn đang bay về. Câu trả lời đúng là **lúc "Xác nhận kết thúc"**: người duy nhất biết trong phòng còn ai.

> **Sửa ở rev 2 — mâu thuẫn đã được review chỉ ra.** Bản đầu lập luận "hết grace thì tuỳ tiện, không ai quan sát" để bác mốc đó, rồi ở §3 lại đặt đúng một đường quét dự phòng đi tới `completed` tại `endTime + grace` mà không ai quan sát. Hợp đồng "Task 3 chỉ cần cắm vào" chỉ đúng trên **một trong hai** đường.

Cách giải: **`completed_by` phân biệt hai đường** (§4.2), và Task 3 đọc nó.

| `completed_by` | Nghĩa | Task 3 được phép làm gì |
|---|---|---|
| `NOT NULL` | Giảng viên đã xác nhận, đã nhìn phòng | Đánh `vắng thi` cho các dòng còn `chưa nộp` |
| `NULL` | Quét dự phòng đóng, **không ai quan sát** | **Giữ nguyên `chưa nộp`** |

`chưa nộp` tồn dư sau khi phiên đã `completed` vì thế mang nghĩa rõ ràng: *"không có ai xác nhận buổi thi này"* — một trạng thái dữ liệu trung thực, không phải một phán xét học vụ mà máy tự đưa ra.

**Hệ quả cần thấy trước:** những phiên đó sẽ để lại `chưa nộp` vĩnh viễn nếu không ai quay lại xử lý. Đó là lựa chọn có chủ đích — thà để dữ liệu nói "chưa ai kết luận" còn hơn để một `@Interval` 30 giây tuyên bố một sinh viên vắng thi.

### 8.2 Vì sao thứ tự này, không phải ngược lại

Nếu Task 3 làm trước, dòng `chưa nộp` gieo sẵn phải chuyển sang `received` khi file về. Trigger `validate_submission_lifecycle` (đọc từ `pg_proc` 2026-09-10) chỉ cho `INSERT` ở `received`/`invalid` và **không có đường vào từ trạng thái khác** — sẽ phải viết một migration sửa trigger, rồi spec này viết migration thứ hai.

### 8.3 Phần Plan C không bị ảnh hưởng

Task 1 (giới hạn file), Task 2 (`semester_code`), Task 4 (BullMQ), Task 5 (Claude provider), Task 6 (cascade) không đụng luồng thu bài — chạy song song bất cứ lúc nào.

---

## 9. Rủi ro

### 9.1 Agent đang chạy chưa biết `exam:recollect`

Agent cũ nhận sự kiện lạ thì bỏ qua — không crash, nhưng cũng không nộp lại, **và không ack**, nên nó rơi vào `unreachable` (§6.3). Đó là kết quả đúng: máy đó thật sự không thu lại được. Vì agent nằm cùng monorepo và triển khai cùng lúc với server, đây không phải vấn đề thật ở quy mô đồ án.

### 9.2 Máy rớt mạng không thu lại được

`agent:join` yêu cầu `status === 'active'`, nên agent rớt kết nối rồi vào lại trong lúc `collecting` bị từ chối. Sinh viên đó **không thu lại được** — §6.3 làm điều này hiện rõ thay vì âm thầm.

Nới `agent:join` cho `collecting` phải kèm điều kiện "chỉ MSSV đã có trong attendance log của phiên này". Không có điều kiện đó thì một sinh viên **chưa từng dự thi** join được lúc thu bài và nộp — đổi một tiện ích lấy một lỗ hổng liêm chính.

### 9.3 Phiên `completed` tạo trước khi triển khai

Migration không đụng dữ liệu sẵn có: chúng vẫn `completed`, `completed_at`/`completed_by` đều `NULL`. Không có nút nào cho chúng, và đúng như vậy — chúng đã kết thúc thật.

Lưu ý cho §7.3: `completed_at IS NULL` phải đọc là "không biết", không phải "chưa xác nhận". Dòng cảnh báo không hiện cho các phiên này.

### 9.4 Chủ phiên chưa chắc là người đang đứng trong phòng

`exam_session.teacher_id` không tự đổi khi `class.teacher_id` đổi (CLAUDE.md §5.5). Người coi thi thay không phải chủ phiên thì **không bấm được "Thu lại"** — và khác với finalize (hậu quả là chấm muộn), ở đây cửa sổ chỉ dài 30 phút và đóng lại vĩnh viễn.

Escape hatch **đã tồn tại** từ 2026-09-11: `PATCH /exam-sessions/:id/teacher` (§7.2.6, PR #30) chuyển chủ phiên, có audit. Nhưng route đó **admin-only**, nên trong cửa sổ 30 phút tại phòng thi nó gần như không dùng được trên thực tế.

Spec này **làm hậu quả của lỗ hổng đó nặng thêm** và không giải quyết nó. Ghi lại để lần sau cân nhắc §7.2.6 có nên mở cho `department_admin` hay có đường nhanh hơn.

### 9.5 Triển khai giữa chừng

Phiên đang `active` có `endTime` đã qua từ lâu sẽ bị quét sang `collecting`, rồi gần như ngay lập tức sang `completed` ở tick sau — và `exam:finalize` bắn cho một buổi thi đã chết, không còn agent nào nghe. Vô hại nhưng ồn trong log. Một lần, lúc triển khai.

---

## 10. Kiểm thử

Ở tầng e2e vì phần lớn là chuyển trạng thái + guard:

| Ca | Khẳng định |
|---|---|
| Hết giờ | Scheduler đưa `active → collecting`, **không** `→ completed` |
| Hết giờ | `exam:finalize` vẫn bắn đúng một lần tại thời điểm đó |
| Trong `collecting` | Upload **được nhận** (chống hồi quy `isAcceptingUploads`) |
| Trong `collecting` | Báo cáo lệch điểm danh **vẫn dựng** (chống hồi quy `buildDiscrepancy`) |
| Trong `collecting` | Xoá đề thi **bị chặn** (chống hồi quy `exam-material`) |
| "Xác nhận kết thúc" | `collecting → completed`, `completed_by` = giảng viên, `completed_at` được ghi |
| "Xác nhận kết thúc" | Gọi lần hai là no-op, không lỗi, **không ghi đè** `completed_at` |
| Sau xác nhận, trong grace | Upload **vẫn được nhận** — pin quyết định (a) |
| Giảng viên không bấm | Quét dự phòng đưa `collecting → completed` với `completed_by` = **NULL** |
| Trước `endTime + grace` | Quét dự phòng **không** đụng tới phiên |
| "Thu lại" | Chỉ agent của em **chưa nộp đủ** nhận `exam:recollect`; em đã nộp đủ **không** nhận |
| "Thu lại" | Em nộp thiếu 1/2 file **có** nhận (pin sửa M1 của rev 2) |
| "Thu lại" | MSSV lệch hoa thường (`SV001` roster / `sv001` agent) **vẫn nhắm trúng** (pin sửa B3) |
| "Thu lại" | `acknowledged` < `missing` khi một agent không ack trong 3s |
| "Thu lại" | Phiên **không** ở `collecting` → 409 |
| Phân quyền | Cả hai route teacher-only + owner-only, như `finalize` |
| GiST | Tạo được phiên mới cùng phòng, bắt đầu từ `endTime`, khi phiên cũ đang `collecting` |

---

## 11. Câu chưa chốt

1. **Grace 30 phút làm mốc quét dự phòng** — đứng được, nhưng phải hiểu đúng vì sao. Nếu đường quét **cũng** đánh `vắng thi` thì `SUBMISSION_GRACE_PERIOD_MS`, một hằng số kỹ thuật về cửa sổ upload, bỗng quyết định một **phán xét học vụ**. §8.1 tránh được điều đó bằng cách để đường quét **không** kết luận gì. Nếu sau này ai đó muốn đường quét tự đánh vắng thi, họ phải quay lại đọc mục này trước — đổi mốc và đổi ngữ nghĩa là hai việc, không phải một.
2. **Phiên `draft`/`scheduled` quá giờ** — scheduler không đụng tới chúng, spec này không đổi. Chúng treo mãi ở trạng thái đó. Vấn đề có sẵn, không do thay đổi này, nhưng đáng ghi lại.
