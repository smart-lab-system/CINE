# Giai đoạn "Đang thu bài" và hành động "Thu lại" — Thiết kế

**Ngày:** 2026-09-11
**Trạng thái:** đã duyệt hướng, chờ review spec
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

Điều tra code ngày 2026-09-11 cho thấy bản thiết kế nháp năm ngoái đã lỗi thời. Những thứ sau **đã có**:

| Thành phần | Nơi có |
|---|---|
| Phase `'collecting'` nhãn "Đang thu bài", có màu, có test | `apps/web/src/lib/submission-attention.ts` — `getSessionPhase()` |
| Cửa sổ ân hạn 30 phút | `SUBMISSION_GRACE_PERIOD_MS`, `apps/api/src/submission/submission.types.ts` |
| Nhận upload sau khi hết giờ | `isAcceptingUploads()` — cho upload khi `active` **hoặc** `completed`, tới `endTime + 30'` |
| Bộ lọc "đã dự thi nhưng không có bài" | `attendedNoSubmissionCount`, `AttentionKind: 'attended-no-submission'` |
| Đường server → agent | `agentRoom(sessionId)`, tiền lệ `exam:finalize` và `exam:materials-updated` |
| Định danh sinh viên trên socket | `client.data.studentId`, đặt lúc `agent:join` |
| Giá trị `submission_via: 'manual_pull'` | Khai trong enum từ `InitialSchema`, **0 nơi dùng** |

Nói cách khác: khái niệm đã có tên, có nhãn, có hành vi backend. Thứ thiếu là **trạng thái thật trong DB** và **hai hành động của giảng viên**.

---

## 2. Phạm vi

### Trong phạm vi

- Giá trị mới `collecting` trong enum `exam_session_status`
- Scheduler chuyển `active → collecting` khi hết giờ (thay cho `→ completed`)
- Route "Xác nhận kết thúc": `collecting → completed`
- Quét dự phòng `collecting → completed` tại `endTime + grace` nếu giảng viên không bấm
- Route + sự kiện socket "Thu lại", nhắm đúng những sinh viên thiếu bài
- Rà toàn bộ chỗ so sánh `status`, gom thành một predicate dùng chung
- Hai nút trên màn hình phòng thi

### Ngoài phạm vi, có lý do

| Không làm | Vì sao |
|---|---|
| Trạng thái `vắng thi` cho `Submission` | Thuộc Plan C Task 3 (§7.1.2). Ranh giới đã chốt: spec này chỉ động `exam_session_status`, Task 3 động `submission_status` — **hai migration không giao nhau**. Xem §8 |
| Agent rớt mạng vào lại được trong lúc `collecting` | `agent:join` hiện yêu cầu `status === 'active'` và trong `[startTime, endTime]`. Nới ra sẽ mở đường cho một sinh viên **chưa từng dự thi** join lúc thu bài và nộp. Làm đúng thì phải giới hạn theo attendance log — một thay đổi riêng, không gộp vào đây. Xem §9.2 |
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
      ┌── "Xác nhận kết thúc" ───────────────┤
      │                                     │
      └── scheduler: now >= endTime + grace ─┘
                      │
                      ▼
                  completed
```

Ba điều cần nói rõ:

**`exam:finalize` bắn ở `active → collecting`, không phải ở `→ completed`.** Đây là chỗ dễ sai nhất. Agent nộp bài khi nhận `exam:finalize`; nếu dời sự kiện xuống `→ completed` thì agent chỉ nộp sau khi giảng viên bấm xác nhận — ngược hoàn toàn ý đồ. Sự kiện gắn với **"hết giờ, nộp đi"**, không gắn với trạng thái cuối.

**"Chốt bài ngay" thủ công (đã có) giờ dẫn tới `collecting`, không tới `completed`.** Giảng viên bấm nó lúc 10 giờ cho phiên đến 11 giờ nghĩa là "cả phòng làm xong rồi, nộp đi" — vẫn cần giai đoạn thu bài sau đó. Không có lý do nào để bấm sớm lại bỏ qua bước thu.

**Quét dự phòng là bắt buộc, không phải tuỳ chọn.** Giảng viên quên bấm, mất điện, đóng nhầm tab — phiên không được treo ở `collecting` vĩnh viễn. Mốc `endTime + grace` là mốc đúng: sau đó `isAcceptingUploads` đã từ chối mọi upload, nên xác nhận không còn thay đổi được gì.

### 3.1 "Xác nhận kết thúc" KHÔNG chặn upload

Quyết định của chủ đồ án, 2026-09-11, phương án (a).

Giảng viên bấm xác nhận lúc `endTime + 5'`; một file tới lúc `endTime + 10'` **vẫn được nhận**. Cửa sổ nhận file do `endTime + grace` quyết định, không do nút bấm.

Lý do: hệ thống này đã chọn "không bao giờ vứt bài thật" ở mọi chỗ khác — grace 30 phút, cho rejoin sau khi chốt sĩ số, nhận upload cả khi `completed` (có comment giải thích ngay trong `isAcceptingUploads`). Để nút xác nhận chặn upload là tạo ra một cách làm mất bài của sinh viên mà **không ai phát hiện cho tới lúc chấm**.

Đánh đổi phải nói ra: con số giảng viên vừa nhìn có thể đổi sau lưng họ. Xử lý bằng hiển thị (§7.3), không bằng cách chặn.

---

## 4. Thay đổi dữ liệu

Một migration, một câu lệnh:

```sql
ALTER TYPE "examcollect"."exam_session_status" ADD VALUE IF NOT EXISTS 'collecting' AFTER 'active';
```

`ADD VALUE` chỉ đụng catalog — không rewrite bảng, không khoá lâu. `AFTER 'active'` để `enumsortorder` khớp thứ tự vòng đời, giúp mọi câu `ORDER BY status` đọc ra tự nhiên.

**Không có `down()` thực chất.** Postgres không hỗ trợ xoá một giá trị enum. `down()` sẽ ném lỗi kèm thông báo giải thích, thay vì im lặng không làm gì — một `down()` rỗng trông như đã revert thành công.

### 4.1 Ràng buộc GiST — đã kiểm, không ảnh hưởng

`ex_exam_session_room_overlap` và `ex_exam_session_class_overlap` có predicate `WHERE status <> 'completed' AND status <> 'cancelled'`. Phiên ở `collecting` vẫn nằm trong ràng buộc thêm tối đa 30 phút.

Không gây vấn đề: khoảng `tstzrange(start_time, end_time, '[)')` của phiên đó **đã trôi qua**, nên một phiên mới bắt đầu từ `endTime` trở đi không chồng lấn. Kiểm bằng test, không chỉ bằng lập luận (§10).

---

## 5. Rà soát chỗ so sánh trạng thái

Đây là phần rủi ro nhất của thay đổi này. Ba guard hiện viết `=== 'completed'` vì `completed` từng là **trạng thái hậu-thi duy nhất**. Thêm `collecting` tách đôi nghĩa đó, và bỏ sót bất kỳ chỗ nào đều gây lỗi im lặng.

| Chỗ | Hiện tại | Sau | Bỏ sót thì sao |
|---|---|---|---|
| `isAcceptingUploads` (`submission.service.ts`) | `active \|\| completed` | `active \|\| collecting \|\| completed` | **File bay về trong lúc thu bài bị từ chối** — hỏng đúng thứ tính năng này sinh ra để cứu |
| `buildDiscrepancy` (`attendance.service.ts:194`) | `status !== 'completed'` → bỏ qua | dùng `isExamOver()` | Báo cáo "nộp bài mà không được điểm danh" **biến mất đúng lúc giảng viên cần nó** để chọn thu lại ai |
| Xoá đề thi (`exam-material.service.ts:175`) | chặn khi `completed` | dùng `isExamOver()` | Đề thi **mở khoá xoá trở lại** suốt cửa sổ thu bài |
| `findFinalizableIds` | `active` + `endTime <= now` | điều kiện tìm **giữ nguyên**; đích chuyển đổi thành `collecting` thay vì `completed` | — |
| *(mới)* `findCollectionExpiredIds` | — | `collecting` + `endTime + grace <= now` | Phiên treo ở `collecting` vĩnh viễn |
| `SearchExamSessionsDto` | 5 giá trị | 6 | Lọc theo trạng thái mới trả rỗng |
| `getSessionPhase` (web) | suy từ `status` + đồng hồ | đọc `collecting` trực tiếp, giữ suy diễn làm fallback | Hai nguồn sự thật |
| `agent:join` | `status === 'active'` | **giữ nguyên** | Cố ý — xem §2, ngoài phạm vi |

### 5.1 Một predicate, không phải chuỗi rải rác

Chính sự rải rác của `=== 'completed'` tạo ra ba cái bẫy trên. Thêm hai hàm này vào `exam-session.types.ts`, import `ExamSessionStatus` từ `entities/exam-session.entity.ts` (nơi type đang khai) — `exam-session.types.ts` hiện chỉ chứa hằng số, nên đây là chỗ đúng cho predicate dùng chung mà không kéo entity vào mọi call site:

```ts
/**
 * "Kỳ thi đã qua" — đúng hay sai cho cả `collecting` lẫn `completed`.
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

Chỉ những sinh viên **đã dự thi nhưng chưa có bài nộp nào** — tập mà `attendedNoSubmissionCount` đang đếm. Không phát cho cả phòng: em đã nộp xong mà nhận lệnh nộp lại sẽ upload đè lên bài của chính mình, tốn băng thông và gây hoang mang.

### 6.2 Cơ chế

Server đã biết socket nào của sinh viên nào (`client.data.studentId` đặt lúc `agent:join`), nên nhắm đích được:

```ts
const sockets = await this.server.in(agentRoom(examSessionId)).fetchSockets();
const targets = sockets.filter((s) => missingMssv.has(s.data.studentId as string));
for (const socket of targets) {
  socket.emit('exam:recollect', { examSessionId, reason: 'teacher_request' });
}
```

Sự kiện **mới**, không tái dùng `exam:finalize`: agent đặt `examEnded = true` vĩnh viễn khi nhận `exam:finalize`, và bắn lại sẽ không đổi được gì ở phía nó. `exam:recollect` là lệnh riêng, agent xử lý bằng cách chạy lại chính đường upload đó **mà không** đụng `examEnded`.

Bài nộp sinh ra từ đường này mang `submission_via: 'manual_pull'` — giá trị đã khai sẵn trong enum từ `InitialSchema` và cho tới nay chưa nơi nào dùng. Đây là chỗ nó được dùng, và nó làm bảng điểm phân biệt được "em tự nộp" với "giảng viên phải đi thu".

### 6.3 Trả về cho giảng viên cái gì

Route trả về **số agent thật sự nhận được lệnh**, không phải số sinh viên thiếu bài:

```ts
{ missing: 5, reached: 3, offline: 2 }
```

Hai con số này khác nhau là thông tin quan trọng nhất trên màn hình: 2 em `offline` sẽ **không bao giờ** nộp được qua đường này, và giảng viên cần biết điều đó **ngay khi còn ở trong phòng**, chứ không phải phát hiện lúc chấm. Trả về mỗi "đã gửi yêu cầu" là giấu đúng phần giảng viên phải hành động.

### 6.4 Bấm nhiều lần

Cho phép, không chặn. Thu lại là thao tác đọc-rồi-gửi, không đổi trạng thái gì ở server; bấm hai lần chỉ gửi hai lệnh. Sinh viên đã nộp giữa hai lần bấm sẽ tự rơi khỏi tập đích ở lần sau.

---

## 7. Giao diện

Hai nút nằm trên màn hình phòng thi (`/exam-sessions/[id]`) — nơi giảng viên đang theo dõi lớp, đúng chỗ họ đứng khi thao tác. Chỉ hiện khi phiên ở `collecting`.

### 7.1 "Thu lại"

- Nhãn kèm số: `Thu lại (5)` — 5 là số em thiếu bài. Không có ai thiếu thì nút **disabled** kèm giải thích, không ẩn: ẩn đi làm giảng viên tưởng tính năng hỏng.
- Sau khi bấm: hiện `Đã gửi yêu cầu tới 3/5 máy. 2 máy đã ngắt kết nối: <tên>, <tên>.`
- Danh sách tên em offline là phần quan trọng nhất của thông báo này, không phải con số.

### 7.2 "Xác nhận kết thúc"

- Mở hộp xác nhận nêu rõ hậu quả **và** giới hạn: *"Phiên chuyển sang Đã kết thúc. Bài nộp vẫn tiếp tục được nhận tới HH:mm (30 phút sau giờ thi) — xác nhận không chặn bài đang về."*
- Câu thứ hai chống đúng cách hiểu sai mà lựa chọn (a) tạo ra.

### 7.3 Khi có bài về sau xác nhận

Không chặn, nhưng phải nói. Màn hình phiên hiển thị thêm một dòng khi có bài nộp với `submitted_at > completed_at`: *"Có N bài nộp về sau khi bạn xác nhận kết thúc."*

Đây là cách trả lời nhu cầu "con số cuối không đổi" mà không phải chặn upload — giảng viên biết con số đã đổi, thay vì không biết.

---

## 8. Quan hệ với Plan C

Ranh giới đã chốt 2026-09-11: **hai spec không đụng chung migration nào.**

```
Spec này   →  exam_session_status  : thêm 'collecting'
Plan C T3  →  submission_status    : thêm 'chưa nộp'/'vắng thi', sửa trigger, bảng session_roster
```

### 8.1 Spec này cấp cho Task 3 thứ nó đang thiếu

§7.1.2 yêu cầu `chưa nộp` và `vắng thi` là **hai giá trị khác nhau**: dòng `chưa nộp` gieo lúc đóng băng roster, rồi đổi thành `vắng thi` khi chắc chắn em đó không nộp.

CLAUDE.md không nói **lúc nào** chuyển, và Task 3 tự nó không có câu trả lời. Hết giờ thì quá sớm — file còn đang bay về. Hết grace thì tuỳ tiện — không ai quan sát.

Câu trả lời đúng là **lúc "Xác nhận kết thúc"**: người duy nhất biết trong phòng còn ai. Spec này tạo ra khoảnh khắc đó. Task 3 sau này chỉ cần cắm vào nó.

### 8.2 Làm ngược thứ tự thì hỏng ở đâu

Nếu Task 3 làm trước, dòng `chưa nộp` gieo sẵn phải chuyển sang `received` khi file về. Trigger `validate_submission_lifecycle` (đọc từ `pg_proc` 2026-09-10) chỉ cho `INSERT` ở `received`/`invalid` và **không có đường vào từ trạng thái khác** — sẽ phải viết một migration sửa trigger, rồi spec này viết migration thứ hai. Theo đúng thứ tự thì chỉ một lần.

### 8.3 Phần Plan C không bị ảnh hưởng

Task 1 (giới hạn file), Task 2 (`semester_code`), Task 4 (BullMQ), Task 5 (Claude provider), Task 6 (cascade) không đụng luồng thu bài — chạy song song bất cứ lúc nào, không chờ spec này.

---

## 9. Rủi ro

### 9.1 Agent đang chạy chưa biết `exam:recollect`

Agent cũ nhận sự kiện lạ thì bỏ qua — không crash, nhưng cũng không nộp lại. Vì agent nằm cùng monorepo và triển khai cùng lúc với server, đây không phải vấn đề thật ở quy mô đồ án. Ghi ra để không bị bất ngờ nếu sau này agent được đóng gói riêng.

### 9.2 Máy rớt mạng không thu lại được

`agent:join` yêu cầu `status === 'active'`, nên agent rớt kết nối rồi vào lại trong lúc `collecting` bị từ chối. Sinh viên đó **không thu lại được** — §6.3 làm điều này hiện rõ thay vì âm thầm.

Nới `agent:join` cho `collecting` là một thay đổi riêng, và phải kèm điều kiện "chỉ những MSSV đã có trong attendance log của phiên này". Không có điều kiện đó thì một sinh viên **chưa từng dự thi** join được lúc thu bài và nộp bài — đổi một tiện ích lấy một lỗ hổng liêm chính.

### 9.3 Phiên cũ đang `completed` không có đường về `collecting`

Migration không đụng dữ liệu sẵn có. Phiên đã `completed` trước khi triển khai vẫn `completed`, không có nút nào cho chúng. Đúng như vậy: chúng đã kết thúc thật, và dựng lại một giai đoạn đã trôi qua không phục vụ ai.

---

## 10. Kiểm thử

Tối thiểu, ở tầng e2e vì phần lớn là chuyển trạng thái + guard:

| Ca | Khẳng định |
|---|---|
| Hết giờ | Scheduler đưa `active → collecting`, **không** `→ completed` |
| Hết giờ | `exam:finalize` vẫn bắn đúng một lần tại thời điểm đó |
| Trong `collecting` | Upload **được nhận** (chống hồi quy `isAcceptingUploads`) |
| Trong `collecting` | Báo cáo lệch điểm danh **vẫn dựng** (chống hồi quy `buildDiscrepancy`) |
| Trong `collecting` | Xoá đề thi **bị chặn** (chống hồi quy `exam-material`) |
| "Xác nhận kết thúc" | `collecting → completed`; gọi lần hai là no-op, không lỗi |
| Sau xác nhận, trong grace | Upload **vẫn được nhận** — pin quyết định (a) |
| Giảng viên không bấm | Quét dự phòng đưa `collecting → completed` tại `endTime + grace` |
| Trước `endTime + grace` | Quét dự phòng **không** đụng tới phiên |
| "Thu lại" | Chỉ agent của em thiếu bài nhận `exam:recollect`; em đã nộp **không** nhận |
| "Thu lại" | `reached` < `missing` khi có agent đã ngắt |
| Phân quyền | Cả hai route là teacher-only + owner-only, như `finalize` |
| GiST | Tạo được phiên mới trong cùng phòng, bắt đầu từ `endTime`, khi phiên cũ đang `collecting` |

---

## 11. Câu chưa chốt

1. **Grace 30 phút có phải mốc đúng cho quét dự phòng không?** Spec này dùng `endTime + grace` vì sau đó upload đã bị từ chối nên xác nhận vô nghĩa. Nếu thực tế cho thấy giảng viên cần lâu hơn, đổi mốc là một dòng — nhưng phải đổi cùng `SUBMISSION_GRACE_PERIOD_MS`, không tách rời.
2. **Phiên `draft`/`scheduled` quá giờ** — hiện scheduler không đụng tới chúng, và spec này không đổi. Chúng treo mãi ở trạng thái đó. Là vấn đề có sẵn, không phải do thay đổi này, nhưng đáng ghi lại.
