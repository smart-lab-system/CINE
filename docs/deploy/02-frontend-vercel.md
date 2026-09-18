# Bước 2 — Đưa `apps/web` lên Vercel

Runbook cho người deploy. Đọc hết mục "Ba thứ chặn" trước khi bấm Deploy —
cấu hình build thì đã xong và đã kiểm, nhưng deploy xong mà chưa xử lý ba thứ
đó thì **đăng nhập sẽ không hoạt động**, và triệu chứng trông như lỗi backend.

## Cấu hình build (đã xong)

`vercel.json` ở gốc repo:

```json
{
  "framework": "nextjs",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm turbo run build --filter=web",
  "outputDirectory": "apps/web/.next",
  "regions": ["sin1"]
}
```

Vì sao build từ **gốc repo** chứ không đặt Root Directory = `apps/web`:
`apps/web` phụ thuộc `@cine/shared` qua `workspace:*`, và package đó export
TypeScript nguồn (`"main": "src/index.ts"`). Cài đặt phải chạy ở gốc để pnpm
dựng được symlink workspace.

`regions: ["sin1"]` (Singapore): `middleware.ts` gọi `API_URL` **ở phía server
trên mỗi request** để làm refresh token. Để mặc định (`iad1`, Washington) thì
mỗi lần điều hướng phải vượt Thái Bình Dương hai lần. Singapore cũng là nơi
Supabase đang đặt.

`next.config.ts` đặt `output` có điều kiện: `standalone` cho Docker,
`undefined` khi biến `VERCEL` có mặt. Đã kiểm cả hai đường — build Docker vẫn
sinh `.next/standalone`, build Vercel thì không và có `.next/BUILD_ID`.

## Biến môi trường

| Biến | Lúc nào đọc | Ghi chú |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | **Build time** | Bị nhúng thẳng vào bundle trình duyệt. Đổi nó phải **build lại**, đặt lại biến rồi redeploy là chưa đủ |
| `API_URL` | Runtime | `middleware.ts` và 3 route handler ở `app/api/auth/*` gọi server-to-server |

Trong hầu hết trường hợp hai biến này cùng một giá trị. Chúng tách nhau vì ở
Docker Compose, `web` gọi `api` qua tên service trong mạng nội bộ
(`http://api:4000`) còn trình duyệt gọi qua cổng host.

---

## Ba thứ chặn

### 1. Backend phải công khai qua HTTPS

`middleware.ts` và `app/api/auth/login/route.ts` chạy **trên máy chủ Vercel**,
không phải trong trình duyệt. `API_URL=http://localhost:4000` ở đó nghĩa là
localhost *của Vercel*, không phải máy bạn. Kết quả: `/api/auth/login` luôn
thất bại, và mọi lần điều hướng có refresh token đều đá về `/login`.

Backend đang chạy local thì phải mở ra ngoài bằng một tunnel có HTTPS
(`cloudflared tunnel`, `ngrok http 4000`). Dùng hostname cố định, vì mỗi lần
hostname đổi là phải build lại frontend (xem bảng trên).

### 2. Xác thực dùng Bearer token, không dùng cookie — ĐÃ XỬ LÝ

Mục này từng là thứ chặn nặng nhất. Nó đã được giải quyết; giữ lại phần giải
thích vì nó quyết định cách phần auth hoạt động và sẽ khó hiểu nếu chỉ đọc code.

**Vấn đề.** Cookie thuộc về host đã ĐẶT nó. Một cookie do `xxx.vercel.app`
đặt sẽ không bao giờ được gửi tới `yyy.up.railway.app` — đó là ràng buộc
domain, không phải `SameSite`, nên không giá trị `SameSite` nào đổi được. Và
`*.vercel.app` nằm trong Public Suffix List, nên ngay cả hai project Vercel
cũng là hai site khác nhau.

**Cách xử lý.** Access token đi trong header `Authorization: Bearer` cho REST
và trong `handshake.auth.token` cho WebSocket, thay vì dựa vào cookie.

| Thứ | Ở đâu | Vì sao |
| --- | --- | --- |
| `refresh_token` | cookie httpOnly trên origin Next.js | JS không đọc được. Nó chỉ cần tới `/api/auth/refresh`, vốn CÙNG origin |
| `access_token` | cookie httpOnly **và** bộ nhớ JS | Cookie cho `middleware.ts` định tuyến theo vai trò; bộ nhớ để đính vào header gửi sang API |

`GET /api/auth/token` là cây cầu: JS không đọc được cookie httpOnly, nên sau
mỗi lần F5 nó hỏi server hộ. Endpoint này chỉ ĐỌC, không xoay — dùng
`/api/auth/refresh` cho việc bootstrap sẽ xoay refresh token mỗi lần tải
trang, và hai tab mở gần nhau sẽ đăng xuất lẫn nhau.

**Đánh đổi, nói rõ:** access token đọc được bằng JS. Đó là cái giá của hướng
này. Giới hạn thiệt hại: nó sống 15 phút, và refresh token (7 ngày) không bao
giờ rời httpOnly — một lỗ XSS lấy được 15 phút, không phải 7 ngày.

**Đường cookie vẫn còn ở gateway** làm dự phòng, nên bộ e2e (nối socket bằng
`extraHeaders: { cookie }`) và dev local cùng origin không phải sửa gì.

**Hệ quả: không cần domain riêng.** Frontend ở `*.vercel.app` và API ở
`*.up.railway.app` chạy được với nhau. Mua domain vẫn tốt cho buổi bảo vệ,
nhưng không còn là điều kiện kỹ thuật.
### 3. `apps/api` không bao giờ lên Vercel được

Chỉ `apps/web` deploy lên đây. Backend có 4 Socket.IO gateway, một BullMQ
worker chạy trong tiến trình, và hai `@Interval` 30 giây — tất cả đều cần một
tiến trình sống dài. Vercel Functions là request/response.

---

## Các bước

1. Vercel → New Project → import repo, **Root Directory để nguyên gốc repo**
   (đừng đặt `apps/web`; `vercel.json` đã lo phần còn lại).
2. Đặt `NEXT_PUBLIC_API_URL` và `API_URL` = URL HTTPS công khai của backend.
3. Deploy.
4. Gắn domain riêng và xử lý mục 2 ở trên — **trước** khi thử đăng nhập, không
   phải sau.

## Kiểm chứng

Đếm build thành công là chưa đủ; nó không đụng tới thứ nào trong ba mục trên.
Phép thử tối thiểu có ý nghĩa:

1. Mở trang đã deploy, đăng nhập bằng một tài khoản thật.
2. DevTools → Network → chọn một lời gọi tới domain API → tab Headers, xác
   nhận request **có** header `Cookie`. Không có nghĩa là mục 2 chưa xong.
3. Mở một phiên thi, xác nhận WebSocket `/exam-live` chuyển sang trạng thái
   `101 Switching Protocols` chứ không phải lỗi.
