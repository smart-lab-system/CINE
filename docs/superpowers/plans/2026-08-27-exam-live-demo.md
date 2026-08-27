# Exam-Live Demo — Kế hoạch triển khai

Spec / nguồn sự thật cho định hướng sản phẩm: `CLAUDE.md` ở gốc repo. Kế
hoạch này là một lát cắt demo hẹp của schema/luồng nghiệp vụ đầy đủ mô tả ở
đó — nơi kế hoạch và CLAUDE.md mâu thuẫn về phạm vi, CLAUDE.md không bị
ràng buộc bởi phạm vi demo hẹp này (demo được phép bỏ qua Enrollment,
AI grading, v.v. một cách có chủ đích — xem mục 0 dưới).

## 0. Mục tiêu & phạm vi demo này

Chứng minh 2 quyết định kiến trúc rủi ro nhất của hệ thống, không phải build
tính năng dễ:

1. Agent luôn là bên chủ động connect ra server (WebSocket), không cần
   server biết trước IP máy sinh viên.
2. Bài nộp được định danh bằng tên file cố định khai báo TRƯỚC lúc thi
   (RequiredDeliverable) — agent tự tạo file đúng tên, không đoán/không
   cần sinh viên chọn.

### Trong phạm vi (build trong demo này)

- Backend: ExamSession + RequiredDeliverable (2 bảng tối thiểu, các field
  khác trong plan gốc để nullable/bỏ qua)
- REST: tạo phiên thi + lấy chi tiết phiên thi
- WebSocket Gateway: agent join, validate, trả về danh sách file bắt buộc,
  broadcast real-time cho giáo viên
- Frontend: 1 trang tạo phiên thi + 1 trang lobby real-time
- Agent thật: CLI script Node.js tối thiểu (không đóng gói app)
- Mock Agent: script giả lập nhiều agent cùng lúc, dùng để test functional
  + xem hệ thống chịu tải cơ bản ra sao

### Ngoài phạm vi (KHÔNG động vào)

- S3/presigned URL, snapshot/backup định kỳ, chốt bài
- AI grading pipeline toàn bộ
- Admin module, audit log, cost budget
- Course/Semester/ClassRoster/Enrollment (xác thực cấp môn học) — demo này
  dùng session code trực tiếp, KHÔNG check Enrollment
- Đóng gói Agent thành ứng dụng desktop thật

## Global Constraints

Áp dụng cho **mọi** task bên dưới, không lặp lại trong từng task riêng.

### Definition of Done

Trước khi coi 1 task là xong và chuyển sang task kế tiếp, phải tự xác nhận
đủ các mục sau:

- [ ] Build pass: `nest build` (backend) hoặc `next build` (frontend) hoặc
      `tsc --noEmit` (agent script) chạy không lỗi.
- [ ] Lint pass: eslint chạy không lỗi (warning có thể chấp nhận nếu không
      liên quan tới task, nhưng phải nêu rõ lý do).
- [ ] Self code-review theo checklist bên dưới — trả lời từng câu, không bỏ
      qua.
- [ ] Acceptance criteria của task đã liệt kê đều pass — test thủ công theo
      đúng bước mô tả trong task.
- [ ] Không có secret/API key hardcode trong code vừa viết.
- [ ] Commit riêng cho task này với message rõ ràng (vd
      `feat(exam-session): add create/get REST endpoints`), không gộp
      nhiều task vào 1 commit.

Nếu bất kỳ mục nào KHÔNG đạt, phải tự sửa trước khi báo cáo hoàn thành task
— không được báo "xong" khi còn mục chưa đạt.

### Checklist code-review (tự áp dụng cho mọi task có code)

**Bảo mật:**

- Input từ client (REST body, WebSocket payload) có được validate bằng
  DTO/class-validator (hoặc zod ở frontend) trước khi dùng không?
- Có chỗ nào dùng input người dùng để build file path/query mà không
  sanitize không? (path traversal risk — đặc biệt với `required_filename`
  và mọi input liên quan tới tên file)
- Endpoint REST có đúng guard (JWT cho giáo viên, public cho agent join)
  như thiết kế không?
- Có log ra thông tin nhạy cảm (password, JWT token) ra console không?

**Performance:**

- Có N+1 query nào trong logic vừa viết không?
- WebSocket handler có block event loop bằng tác vụ đồng bộ nặng không?
- Có index cần thiết cho cột được query thường xuyên (vd `exam_session.code`)
  chưa?

**Khả năng truy cập (Accessibility) — áp dụng cho task frontend:**

- Mọi input đều có `<label>` gắn đúng `htmlFor`/`id` không?
- Button có text/aria-label rõ nghĩa (không chỉ icon không kèm text)
  không?
- Có thể thao tác toàn bộ form bằng bàn phím (Tab, Enter) không, không phụ
  thuộc chuột?
- Trạng thái loading/error có được thông báo cho screen reader
  (`aria-live` hoặc `role="status"`) không?

**Chất lượng chung:**

- Có xử lý lỗi (try/catch, error boundary) cho các trường hợp fail hợp lý
  (session không tồn tại, mất kết nối...) không, hay để crash?
- Code có tuân theo cấu trúc module đã quy định trong CLAUDE.md không (vd
  không gọi `api.x()` thẳng trong component)?

### WebSocket Event Contract (hợp đồng dùng chung — không được tự đổi khi code)

Định nghĩa 1 lần, dùng xuyên suốt Task 3-8. Backend/frontend/agent PHẢI
khớp chính xác payload dưới đây.

**Namespace & connection**

- Namespace: `/exam-live`
- Agent connect: không cần JWT (public), nhưng phải validate `sessionCode`
  + thời gian hiệu lực ngay khi nhận event `agent:join`.
- Giáo viên (frontend lobby) connect: đính kèm JWT trong
  `socket.handshake.auth.token`, gateway validate bằng guard có sẵn từ
  scaffold auth.

**Event: `agent:join` (Agent → Server)**

```ts
{
  fullName: string;      // 1-100 ký tự, bắt buộc
  studentId: string;     // MSSV, 1-20 ký tự, bắt buộc
  sessionCode: string;   // mã phiên thi, bắt buộc
}
```

**Event: `agent:join:ack` (Server → Agent, khi join thành công)**

```ts
{
  examSessionId: string;
  sessionName: string;
  requiredFiles: string[];   // vd ["Cau1.docx", "Cau2.docx"]
  endTime: string;            // ISO timestamp
}
```

**Event: `agent:join:error` (Server → Agent, khi join thất bại)**

```ts
{
  code: 'SESSION_NOT_FOUND' | 'SESSION_NOT_ACTIVE' | 'INVALID_INPUT';
  message: string;
}
```

- `SESSION_NOT_FOUND`: không tìm thấy `sessionCode`.
- `SESSION_NOT_ACTIVE`: tìm thấy nhưng ngoài khung `start_time`–`end_time`,
  hoặc `status != 'active'`.
- `INVALID_INPUT`: `fullName`/`studentId`/`sessionCode` rỗng hoặc sai định
  dạng.

**Event: `teacher:subscribe` (Frontend giáo viên → Server)**

```ts
{ examSessionId: string }
```

Server join socket này vào room `exam-session:{examSessionId}` sau khi
validate JWT + giáo viên là chủ phiên thi đó.

**Event: `lobby:student_joined` (Server → room `exam-session:{id}`)**

```ts
{
  studentId: string;
  fullName: string;
  joinedAt: string;   // ISO timestamp
}
```

Broadcast mỗi khi 1 agent join thành công vào đúng phiên thi đó.

**Event: `agent:disconnected` (Server → room, optional nhưng nên có)**

```ts
{ studentId: string; disconnectedAt: string; }
```

---

## Task 0 — Xác minh môi trường & scaffold hiện có

Mục tiêu: đảm bảo hiểu đúng source cũ trước khi thêm bất kỳ code nào,
tránh đoán sai cấu trúc.

Việc cần làm:

- Liệt kê cấu trúc thư mục hiện tại của `apps/api` và `apps/web` (tên thư
  mục thực tế trong repo này — plan gốc gọi là `apps/backend`/
  `apps/frontend`, xác nhận tên thật trước khi dùng trong mọi task sau).
- Xác nhận: NestJS version, ORM thực tế đang dùng (TypeORM hay khác) và có
  đang entity-driven hay schema-first, auth module hiện có (JWT strategy,
  guard tên gì), Next.js version, App Router hay Pages Router.
- Xác nhận `.env`/`.env.example` hiện có biến gì (DB connection, JWT
  secret...).
- Nếu có gì không khớp với giả định trong CLAUDE.md (vd ORM khác, cấu trúc
  thư mục khác), dừng lại và báo cáo trước, không tự ý đổi kiến trúc đã
  thống nhất.

Acceptance criteria:

- Có báo cáo ngắn gọn xác nhận stack thực tế khớp với CLAUDE.md, hoặc liệt
  kê rõ điểm lệch cần quyết định trước khi tiếp tục.

## Task 1 — Database schema: exam_session + required_deliverable

Mục tiêu: tạo 2 bảng tối thiểu cho demo, đúng schema đã chốt (bản rút
gọn).

Schema (rút gọn từ DBML gốc, các field không cần cho demo này để nullable
hoặc bỏ). Tên bảng/cột dưới đây là **rút gọn minh họa** — khớp với entity
`ExamSessionEntity`/`RequiredDeliverableEntity` đã tồn tại thật trong repo
(bảng số ít `exam_session`/`required_deliverable`, không phải
`exam_sessions`/`required_deliverables` như comment trong DBML gốc) và
convention entity-driven (TypeORM entity là nguồn sự thật,
`migration:generate` sinh migration — xem Task 0):

```
exam_session (
  id            uuid PK default gen_random_uuid()
  name          varchar not null
  code          varchar not null unique      -- mã phiên thi, dùng để agent join
  teacher_id    uuid not null                -- FK -> account.id (bảng account có sẵn từ scaffold auth)
  start_time    timestamp not null
  end_time      timestamp not null
  status        varchar not null default 'active'   -- active | closed
  created_at    timestamp not null default now()
)

required_deliverable (
  id                uuid PK default gen_random_uuid()
  exam_session_id   uuid not null   -- FK -> exam_session.id, ON DELETE CASCADE
  required_filename varchar not null
  created_at        timestamp not null default now()
)
```

**Lưu ý bắt buộc đọc trước khi làm task này**: `ExamSessionEntity` và
`RequiredDeliverableEntity` **đã tồn tại** trong repo
(`apps/api/src/exam-session/entities/`) với schema đầy đủ hơn bản rút gọn
trên (có `submission_rule`, `rubric_id`, `deliverable_type`, quan hệ tới
`CourseEntity`/`AccountEntity` bắt buộc, v.v. — theo CLAUDE.md gốc, không
theo phạm vi rút gọn của demo này). Việc của task này KHÔNG phải là tạo
bảng mới từ đầu, mà là **quyết định và thực hiện một trong hai hướng**,
ghi rõ lựa chọn + lý do vào commit message:

- **(A) Sửa entity hiện có** cho khớp bản rút gọn ở trên (nới lỏng các FK
  bắt buộc tới `Course`/`Rubric` thành optional/bỏ, thêm cột `name`/`code`/
  `status` nếu thiếu) rồi `migration:generate` — rủi ro: lệch khỏi schema
  CLAUDE.md gốc mà Task tương lai (ngoài phạm vi demo) sẽ cần dùng lại.
- **(B) Thêm entity/bảng riêng cho demo** (vd `DemoExamSessionEntity` /
  bảng `demo_exam_session`) độc lập với entity CLAUDE.md gốc, không đụng
  tới `ExamSessionEntity` hiện có — rủi ro: trùng lặp khái niệm, cần dọn
  lại khi build tính năng thật sau demo.

Nếu không chắc hướng nào đúng, đây là quyết định kiến trúc thật (không
phải chi tiết vụn) — dừng lại và hỏi trước khi migration, đừng tự chọn one
cách âm thầm.

Việc cần làm (sau khi đã chốt hướng A hoặc B):

- Tạo/sửa entity + chạy `pnpm --filter api migration:generate
  src/database/migrations/<Name>` (đúng ORM/quy trình xác nhận ở Task 0).
- `code` phải có unique index — đây là cột được query mỗi lần agent join,
  cần nhanh.
- `required_filename`: chỉ validate ở tầng ứng dụng (Task 2) — chỉ cho
  phép ký tự chữ/số/`_`/`-`/`.`, cấm `..`, `/`, `\` (chống path traversal
  khi agent dùng tên này để tạo file). Không cần CHECK constraint ở DB cho
  việc này trong phạm vi demo.
- Foreign key `exam_session_id` trên `required_deliverable` dùng
  `ON DELETE CASCADE` (xoá phiên thi thì xoá luôn deliverable liên quan —
  hợp lý ở giai đoạn demo).

Acceptance criteria:

- Migration chạy thành công trên DB local/dev (`pnpm --filter api
  migration:run` sạch, không lỗi).
- Verify bằng cách insert thử 1 dòng `exam_session` + 2 dòng
  `required_deliverable` qua `psql`, query lại đúng dữ liệu.

## Task 2 — Backend: ExamSessionModule (REST)

Mục tiêu: giáo viên tạo và xem phiên thi qua REST API, bảo vệ bằng JWT
guard có sẵn (`JwtAuthGuard`/`RolesGuard` — xác nhận tên thật ở Task 0/1).

Cấu trúc file (theo đúng quy tắc CLAUDE.md — dùng tên thư mục
`exam-session` đã tồn tại sẵn trong repo, không tạo `modules/exam-session`
mới):

```
apps/api/src/exam-session/
├── exam-session.module.ts
├── exam-session.controller.ts
├── exam-session.service.ts
├── exam-session.types.ts
└── dto/
    ├── create-exam-session.dto.ts
    └── exam-session-response.dto.ts
```

Endpoint cần có:

- `POST /exam-sessions` — JWT required (guard có sẵn từ auth scaffold,
  KHÔNG giới hạn role — bất kỳ account đã đăng nhập nào cũng tạo được
  phiên thi của chính mình trong phạm vi demo, không cần role riêng cho
  "teacher" tách biệt "admin" — xác nhận role model thật ở Task 0/1 nếu
  đã có sẵn khái niệm role).
  - Body: `{ name: string; startTime: string; endTime: string;
    requiredFilenames: string[] }`
  - Validate: `name` không rỗng; `startTime < endTime`; `requiredFilenames`
    có ít nhất 1 phần tử, mỗi filename khớp regex an toàn (xem Task 1 mục
    validate); tự sinh `code` ngẫu nhiên unique (vd 6 ký tự alphanumeric,
    retry nếu trùng).
  - Tạo `exam_session` + toàn bộ `required_deliverable` liên quan trong 1
    transaction (tránh trường hợp tạo session xong mà tạo deliverable lỗi
    giữa chừng để lại dữ liệu rác).
  - Response: thông tin phiên thi vừa tạo, gồm `code`.
- `GET /exam-sessions/:id` — JWT required, chỉ giáo viên sở hữu
  (`teacher_id` khớp `req.user.id`/`req.user.sub`) mới xem được — trả 403
  nếu không khớp.
  - Response gồm `requiredDeliverables` (join sẵn).

Acceptance criteria:

- `POST /exam-sessions` với payload hợp lệ → 201, trả về `code` unique.
- `POST` với `requiredFilenames` chứa filename không hợp lệ (vd
  `"../etc/passwd"`) → 400, không tạo được.
- `POST` không kèm JWT → 401.
- `GET /exam-sessions/:id` bởi tài khoản không sở hữu → 403.
- Test bằng curl/Postman, ghi lại kết quả trong báo cáo/commit message.

## Task 3 — Backend: WebSocket Gateway (agent:join + lobby broadcast)

Mục tiêu: phần lõi quan trọng nhất của demo — agent connect, validate,
nhận lại danh sách file, giáo viên thấy real-time.

File: `apps/api/src/exam-session/exam-session.gateway.ts`

Việc cần làm — theo đúng **WebSocket Event Contract** ở Global Constraints
(không tự đổi tên event/field):

- Tạo `@WebSocketGateway({ namespace: '/exam-live', cors: { origin: <đúng
  domain frontend, KHÔNG dùng '*'> } })`.
- Handler `@SubscribeMessage('agent:join')`:
  - Validate payload bằng class-validator (tạo DTO riêng cho WS payload,
    không tái dùng chay object không kiểu).
  - Query `exam_session` theo `code`. Không tìm thấy → emit
    `agent:join:error` code `SESSION_NOT_FOUND`.
  - Check `now() < start_time || now() > end_time || status != 'active'`
    → emit `agent:join:error` code `SESSION_NOT_ACTIVE`.
  - Hợp lệ → join socket vào room `exam-session:{examSessionId}`, lưu
    `studentId`/`examSessionId` vào `socket.data` (dùng cho disconnect
    handler), emit `agent:join:ack` kèm `requiredFiles` (map từ
    `required_deliverable`).
  - Broadcast `lobby:student_joined` cho room đó (không gửi lại cho chính
    agent vừa join, dùng `socket.to(room).emit(...)`).
- Handler `@SubscribeMessage('teacher:subscribe')`:
  - Validate JWT từ `socket.handshake.auth.token` (dùng lại JWT verify
    logic có sẵn từ auth module — KHÔNG viết lại logic verify token mới).
  - Validate giáo viên là chủ phiên thi (`teacher_id` khớp).
  - Join socket vào room `exam-session:{examSessionId}`.
- Handler `handleDisconnect`: nếu `socket.data.studentId` tồn tại,
  broadcast `agent:disconnected` cho đúng room.

Acceptance criteria:

- Dùng `wscat` hoặc script test nhỏ: connect, emit `agent:join` với
  `sessionCode` hợp lệ → nhận đúng `agent:join:ack` với `requiredFiles`
  khớp DB.
- Emit `agent:join` với `sessionCode` sai → nhận `agent:join:error` code
  `SESSION_NOT_FOUND`.
- Emit `agent:join` với phiên thi đã hết giờ (test bằng cách tạo session
  có `end_time` là quá khứ) → `SESSION_NOT_ACTIVE`.
- 2 client cùng subscribe 1 room, 1 agent join → cả 2 client giáo viên đều
  nhận `lobby:student_joined` (test tối thiểu 2 kết nối socket cùng lúc).
- Disconnect 1 agent → room nhận `agent:disconnected`.

## Task 4 — Backend: Rà soát bảo mật & hiệu năng riêng cho Gateway

Mục tiêu: task riêng để rà lại đúng phần dễ bị bỏ sót nhất (WebSocket ít
được review kỹ như REST).

Việc cần làm:

- Rate limit cơ bản cho `agent:join`: chống 1 client spam join liên tục.
  Dùng in-memory counter theo `socket.id` hoặc IP, giới hạn hợp lý (vd tối
  đa 5 lần/phút), vượt quá thì disconnect + log.
- CORS: xác nhận origin trong cors config KHÔNG phải `'*'`, trỏ đúng
  domain frontend dev (đọc từ biến môi trường, không hardcode).
- Validate lại `requiredFiles` trả về cho agent: đảm bảo không leak field
  nhạy cảm nào khác của `exam_session` (vd không trả `teacher_id` cho
  agent).
- Kiểm tra N+1: khi 10 agent join gần như đồng thời, mỗi lần join có đúng
  1 query lấy `exam_session` + 1 query lấy `required_deliverable` không
  (không query lặp lại không cần thiết trong loop).
- Ghi log lỗi (không log payload chứa thông tin cá nhân sinh viên ra log
  production-level, chỉ log ở debug level nếu cần).

Acceptance criteria:

- Spam gửi `agent:join` > rate limit từ 1 socket → bị chặn/disconnect
  đúng như thiết kế, có thể verify bằng mock agent script (Task 8, nếu đã
  hoàn thành — nếu chưa, verify bằng script test nhỏ riêng của task này).
- CORS config đọc từ `process.env`, không hardcode domain.
- Review lại response `agent:join:ack`, xác nhận chỉ có đúng 4 field đã
  định nghĩa trong WebSocket Event Contract, không dư field nào.

## Task 5 — Frontend: Trang tạo phiên thi

Mục tiêu: giáo viên tạo phiên thi + khai báo file bắt buộc qua UI.

File (dùng App Router thật của repo — xác nhận nhóm route hiện có ở Task 0
trước khi tạo `(exam-live)` mới, có thể route group đã tồn tại dưới tên
khác):

```
app/(exam-live)/exam-sessions/new/page.tsx
app/(exam-live)/exam-sessions/new/_components/RequiredFilenamesInput.tsx
hooks/useExamSession.ts
lib/api/exam-session.ts
```

Việc cần làm:

- Form (React Hook Form + Zod) với field: `name`, `startTime`, `endTime`,
  và danh sách động `requiredFilenames` (thêm/xoá dòng — component
  `RequiredFilenamesInput`).
- Zod schema validate ở client: `name` không rỗng, `startTime < endTime`,
  mỗi filename khớp đúng pattern an toàn (đồng bộ với backend), ít nhất 1
  filename.
- Submit qua `lib/api/exam-session.ts` (hàm `createExamSession`), gọi qua
  `hooks/useExamSession.ts` (TanStack Query mutation) — KHÔNG gọi
  `api.post` thẳng trong component, đúng quy tắc CLAUDE.md.
- Sau khi tạo thành công: hiển thị `code` vừa sinh ra rõ ràng (to, dễ đọc
  — vì đây là thứ giáo viên sẽ đọc cho sinh viên/hiện lên máy chiếu), và
  link chuyển sang trang lobby (Task 6).
- Accessibility: mọi input có `<label>`, nút "Thêm file" / "Xoá" có text
  rõ ràng (không chỉ icon), form submit được bằng Enter.

Acceptance criteria:

- Tạo phiên thi thành công qua UI → thấy `code` hiển thị, dữ liệu đúng
  trong DB.
- Submit form thiếu field bắt buộc → hiển thị lỗi inline, không gọi API.
- Test bằng bàn phím (Tab qua từng field, Enter submit) — không cần
  chuột.

## Task 6 — Frontend: Trang Lobby real-time

Mục tiêu: giáo viên thấy danh sách sinh viên join real-time.

File:

```
app/(exam-live)/exam-sessions/[id]/page.tsx
app/(exam-live)/exam-sessions/[id]/_components/LobbyList.tsx
lib/socket.ts   // socket.io-client instance, khởi tạo 1 lần
```

Việc cần làm:

- `lib/socket.ts`: khởi tạo `io('<backend-url>/exam-live', { auth: {
  token: <JWT từ store/localStorage hoặc cookie tùy pattern thật của repo
  — xác nhận ở Task 0> } })`, export instance dùng chung (không tạo mới
  mỗi lần render).
- Trang lobby: `useEffect` emit `teacher:subscribe` với `examSessionId` từ
  URL param, lắng nghe `lobby:student_joined` và `agent:disconnected`,
  cập nhật state danh sách sinh viên (`useState`, trừ khi repo đã có sẵn
  pattern state management khác — xác nhận ở Task 0).
- Cleanup: `useEffect` return function phải `socket.off(...)` đúng
  listener khi unmount — tránh listener bị đăng ký trùng khi component
  re-render.
- UI: hiển thị bảng/list — Họ tên, MSSV, giờ join, trạng thái (đang kết
  nối/mất kết nối). Accessibility: dùng `<table>` với `<th scope="col">`
  đúng ngữ nghĩa, hoặc list có role phù hợp nếu không dùng table; trạng
  thái cập nhật real-time nên có `aria-live="polite"` ở vùng đếm số lượng
  sinh viên.

Acceptance criteria:

- Mở trang lobby, chạy Agent thật (Task 7) hoặc Mock Agent (Task 8) join
  vào đúng session đó → thấy tên xuất hiện ngay trên UI không cần F5.
- Mở 2 tab lobby cùng lúc, 1 agent join → cả 2 tab đều cập nhật.
- Tắt agent (Ctrl+C) → trạng thái chuyển "mất kết nối" trên UI.

## Task 7 — Agent thật: CLI script tối thiểu

Mục tiêu: script Node.js chạy trên máy "sinh viên" (thực tế là máy demo),
chứng minh đúng cơ chế connect + tự tạo file.

Vị trí: `apps/agent/src/cli.ts` nếu `apps/agent` chưa tồn tại thì tạo mới
như 1 package riêng trong pnpm workspace (thêm vào
`pnpm-workspace.yaml`/root `package.json` nếu cần) — xác nhận ở Task 0
xem đã có `apps/agent` hay chưa trước khi quyết định tạo mới.

Việc cần làm:

- Nhận input qua command-line args hoặc prompt tương tác (dùng `readline`
  hoặc thư viện nhẹ như `prompts`): `fullName`, `studentId`,
  `sessionCode`.
- Connect `socket.io-client` tới `<backend-url>/exam-live`.
- Emit `agent:join`, lắng nghe `agent:join:ack`/`agent:join:error`.
- Khi nhận `agent:join:ack`:
  - Tạo thư mục `./exam-workspace/<studentId>/` (dùng
    `fs.mkdirSync(..., { recursive: true })`).
  - Với mỗi filename trong `requiredFiles`, tạo file rỗng
    (`fs.writeFileSync(path, '')`) — PHẢI dùng `path.join` và validate
    filename không chứa `..`/separator trước khi ghi, dù backend đã
    validate, agent vẫn nên tự vệ (defense in depth).
  - Log ra console: "Đã tạo N file, sẵn sàng làm bài."
- Khi nhận `agent:join:error`: log rõ message, thoát chương trình (exit
  code 1).
- Giữ tiến trình sống (không exit sau khi tạo file xong) — mô phỏng đúng
  agent thật chạy nền tới hết giờ thi.

Acceptance criteria:

- Chạy `node cli.js` (hoặc `ts-node`), nhập đúng thông tin phiên thi hợp
  lệ → thấy đúng số file được tạo trong thư mục, đúng tên đã khai báo lúc
  tạo phiên thi.
- Nhập sai `sessionCode` → thấy lỗi rõ ràng, không tạo file nào, không
  crash không rõ lý do.
- Kiểm tra thủ công 1 file tên chứa ký tự đặc biệt cố tình test path
  traversal (giả lập server trả về filename độc hại) → agent phải từ
  chối ghi file đó, log cảnh báo, không ghi ra ngoài thư mục workspace.

## Task 8 — Mock Agent: test harness giả lập nhiều agent

Mục tiêu: script riêng để test functional (nhiều agent join cùng lúc) mà
không cần ngồi gõ tay từng agent.

Vị trí: `apps/agent/src/mock-agent.ts` (cùng package với Task 7).

Việc cần làm:

- Nhận tham số dòng lệnh: `--session <code> --count <n>` (mặc định
  `count=10`).
- Sinh `n` bộ `{ fullName, studentId }` giả (vd `Sinh viên test 01`,
  `MSSV_TEST_01`, tăng dần) — KHÔNG dùng dữ liệu MSSV thật.
- Mở `n` kết nối socket song song (`Promise.all`), mỗi kết nối emit
  `agent:join` với cùng `sessionCode` nhưng `studentId` khác nhau.
- Ghi log kết quả tổng hợp: bao nhiêu join thành công (`agent:join:ack`),
  bao nhiêu lỗi (kèm lý do), thời gian trung bình từ lúc emit tới lúc
  nhận ack (đo bằng `Date.now()` trước/sau).
- Không tự động ghi file như Agent thật ở Task 7 (mock agent chỉ test kết
  nối/lobby, không cần workspace) — giữ mock agent nhẹ để chạy nhanh với
  số lượng lớn.
- Hỗ trợ flag `--keep-alive` (giữ kết nối sống để test hiển thị lobby lâu
  dài) và mặc định không có flag này thì disconnect sau khi nhận ack
  (test nhanh, xem broadcast `agent:disconnected` có đúng không).

Acceptance criteria:

- Chạy `node mock-agent.js --session <code> --count 20` → log ra tối
  thiểu: số lượng thành công/thất bại, thời gian trung bình.
- Mở trang lobby (Task 6) trước khi chạy mock agent với `--keep-alive` →
  thấy 20 dòng xuất hiện gần như đồng thời trên UI, không bị mất dòng nào
  (đối chiếu số lượng UI với số lượng log console).
- Chạy với `--count 50` để xem hệ thống có lỗi/timeout bất thường không ở
  mức tải nhỏ này — nếu có lỗi, đây là tín hiệu cần quay lại Task 4 (rate
  limit có thể đang chặn nhầm) trước khi demo thật.
- Chạy `--session` với code không tồn tại → toàn bộ 20 kết nối đều nhận
  đúng `agent:join:error`, không có kết nối nào "treo" không phản hồi.

## Task 9 — End-to-end manual test + demo runbook

Mục tiêu: kịch bản test thủ công đầy đủ 1 lượt, đồng thời là "bài chạy
thử" trước khi demo thật với giảng viên.

Việc cần làm:

- Viết file `DEMO-RUNBOOK.md` ở gốc repo `CINE` (ngắn gọn, dạng checklist)
  gồm các bước:
  1. Khởi động backend, frontend, kiểm tra kết nối DB.
  2. Đăng nhập giáo viên (dùng tài khoản test có sẵn từ auth scaffold —
     xem README "Getting a first admin account").
  3. Tạo phiên thi mới với 2-3 filename bắt buộc, ghi lại `code`.
  4. Mở trang lobby.
  5. Chạy Agent thật (Task 7) với thông tin sinh viên demo → xác nhận file
     được tạo đúng, lobby cập nhật đúng.
  6. Chạy Mock Agent (Task 8) với `--count 10 --keep-alive` → xác nhận
     lobby hiển thị đủ 10 dòng.
  7. Ngắt 1 agent → xác nhận trạng thái "mất kết nối" cập nhật đúng.
- Chạy đúng theo runbook này 1 lượt hoàn chỉnh, ghi nhận bất kỳ lỗi/độ trễ
  bất thường nào và sửa trước khi coi task hoàn thành.

Acceptance criteria:

- Chạy trọn vẹn runbook không gặp lỗi nào chưa xử lý (unhandled
  exception, UI treo, WebSocket không reconnect...).
- File `DEMO-RUNBOOK.md` đủ chi tiết để người khác (vd bạn cùng nhóm)
  chạy lại được mà không cần hỏi thêm.

## Task 10 — Rà soát cuối cùng trước demo

Mục tiêu: kiểm tra chéo toàn bộ tiêu chí đã đặt ra (bảo mật/hiệu
năng/khả năng truy cập) ở mức tổng thể, không chỉ từng task riêng lẻ.

Checklist tổng:

- [ ] Toàn bộ biến môi trường nhạy cảm (DB URL, JWT secret) không xuất
      hiện trong code, chỉ trong `.env` (đã có trong `.gitignore`).
- [ ] CORS origin đúng domain, không dùng wildcard.
- [ ] Rate limit trên `agent:join` hoạt động đúng (verify lại bằng mock
      agent).
- [ ] Toàn bộ input (REST + WebSocket) đều qua validate, không có chỗ
      nào tin tưởng input thô.
- [ ] Không còn `console.log` debug thừa nào chứa dữ liệu nhạy cảm.
- [ ] Frontend: test nhanh bằng bàn phím toàn bộ luồng tạo phiên thi
      (không dùng chuột) — pass.
- [ ] Build production (`next build`, `nest build`) cả 2 phía đều pass,
      không chỉ dev mode.
- [ ] Chạy lại `DEMO-RUNBOOK.md` (Task 9) lần cuối, đúng 1 lượt trơn tru
      trước giờ demo thật.
- [ ] Chuẩn bị sẵn câu framing cho giảng viên: đây là checkpoint chứng
      minh phần kiến trúc rủi ro nhất, các phần AI/snapshot/admin nằm
      trong roadmap tiếp theo.

Acceptance criteria: mọi mục trong checklist tổng đều pass; nếu không,
sửa trước khi coi kế hoạch hoàn thành.
