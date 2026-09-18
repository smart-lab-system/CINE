# Bước 4 — Đưa `apps/api` lên Railway

Runbook cho người deploy.

## Vì sao Railway chứ không phải Vercel

`apps/api` là một tiến trình sống dài, không phải request/response:

- **4 Socket.IO gateway**, tất cả trên namespace `/exam-live` — agent giữ kết
  nối suốt 60–120 phút của một phiên thi
- **BullMQ worker** chạy trong tiến trình (`GradingProcessor`)
- **hai `@Interval` 30 giây** (finalize sweep, collection sweep)

Vercel Functions không host được thứ nào trong ba thứ đó. Đây là lý do topology
chia đôi: `apps/web` → Vercel, `apps/api` → Railway.

## Cấu hình

`railway.toml` ở gốc repo dùng **Dockerfile**, không phải Nixpacks:

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "apps/api/Dockerfile"

[deploy]
startCommand = "node apps/api/dist/src/main.js"
healthcheckPath = "/health"
healthcheckTimeout = 60
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

Image này đã được dùng và kiểm qua `docker-compose`, và nó xử lý đúng một chi
tiết Nixpacks sẽ phải đoán: pnpm workspace hoist dependency vào
`node_modules/.pnpm` ở gốc và để lại symlink trong `apps/api/node_modules`, nên
phải copy cả cây `/app` thì symlink mới còn nguyên.

`healthcheckPath = "/health"` khiến cấu hình sai **chặn deploy** thay vì đẩy lên
một instance chết: Railway coi deploy là thất bại nếu healthcheck không xanh.

**Đừng đặt `PORT`.** Railway tự tiêm, và `main.ts` đọc `process.env.PORT ?? 4000`.

**Đừng đổi `app.listen(port)` thành `app.listen(port, '0.0.0.0')`.** Express
không truyền host thì bind vào `::`, tức cả IPv6 lẫn IPv4. Private networking
của Railway chỉ chạy IPv6 — ép về `0.0.0.0` là tự cắt nó đi.

## `.dockerignore` — đọc phần này trước khi deploy

Repo này trước đây **không có** `.dockerignore`, và `apps/api/Dockerfile` làm
`COPY apps/api ./apps/api`. Nghĩa là `apps/api/.env` — với password Supabase,
password Aiven, secret S3 và khoá API — **đi thẳng vào image**. Một image có
secret nướng sẵn không rút lại được: nó nằm trong layer, `docker history` đọc
ra, và nếu đã push lên registry thì coi như đã lộ.

Một chi tiết dễ sai: pattern trần `.env` trong `.dockerignore` **chỉ khớp file ở
gốc context**, không khớp `apps/api/.env`. Phải là `**/.env`. Tôi viết sai lần
đầu và chỉ phát hiện ra bằng cách build thật rồi `ls` bên trong image — nhìn
file `.dockerignore` không thấy được.

Biến môi trường phải được **tiêm lúc chạy** qua Railway Variables, không bao
giờ nằm trong image.

## Biến môi trường cần đặt trên Railway

| Nhóm | Biến |
| --- | --- |
| Database | `DATABASE_URL`, `DATABASE_SCHEMA`, `DATABASE_SSL=true` |
| Redis | `REDIS_URL` |
| Storage | `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET` |
| Auth | `ACCESS_TOKEN_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_SECRET`, `REFRESH_TOKEN_TTL` |
| CORS | `WEB_ORIGIN` = URL của frontend trên Vercel |
| Chấm điểm | `GRADING_TIER*_`, `ANTHROPIC_API_KEY` (tuỳ chọn — thiếu thì rơi về KeywordGradingProvider) |
| Runtime | `NODE_ENV=production` |

`WEB_ORIGIN` sai là mọi lời gọi từ trình duyệt bị CORS chặn, kể cả handshake
WebSocket.

## Đã kiểm được gì trước khi deploy

Chạy chính image đó bằng Docker local, biến tiêm lúc runtime — đúng cách Railway
chạy:

- build context **2,31 MB** (không có `.dockerignore` thì gồm cả `node_modules`
  và 31 bản sao repo trong `.claude/worktrees`)
- `/app/apps/api/.env` **không tồn tại** trong image; `docker history` không có
  dòng nào chứa secret
- `/health` trả **200**, log khởi động **không lỗi**, kết nối được Supabase +
  Aiven + Supabase Storage
- Socket.IO `/exam-live` connect được và **upgrade lên transport `websocket`**,
  kể cả khi ép `transports: ['websocket']` (không có polling để rơi về)

## Còn lại chưa kiểm được từ máy local

Hai thứ chỉ một deploy thật mới trả lời được:

1. **Railway proxy có cho WebSocket đi qua không.** Phép thử trên loại trừ được
   ứng dụng khỏi danh sách nghi vấn, nhưng proxy của Railway là biến số riêng.
2. **Kết nối WS sống được bao lâu** trước khi bị proxy cắt. Agent giữ kết nối
   suốt 60–120 phút. Nếu bị cắt giữa chừng, agent phải reconnect được mà không
   mất trạng thái phiên — hành vi đó cần kiểm bằng một phiên thi thật.

Kiểm cả hai bằng cách mở lobby một phiên thi và để nó chạy qua khung thời gian
dài hơn một buổi thi, không phải bằng một lần connect rồi đóng.
