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

### 2. Cookie phiên sẽ không được gửi tới API

Đây là thứ khó thấy nhất và chắc chắn xảy ra.

`lib/auth-cookies.ts` đặt cookie với `sameSite: 'lax'` và **không có thuộc
tính `domain`**. Nghĩa là cookie là *host-only* của chính origin Vercel. Nhưng
`lib/api-client.ts` cho trình duyệt gọi **thẳng** sang API bằng
`credentials: 'include'`. Hai điều kiện phải đúng cùng lúc thì cookie mới đi
kèm, và hiện tại cả hai đều sai:

- **Cùng site**: `*.vercel.app` nằm trong Public Suffix List, nên
  `a.vercel.app` và `b.vercel.app` đã là hai site khác nhau — càng không cùng
  site với một domain tunnel. `SameSite=Lax` chặn thẳng.
- **Đúng domain**: cookie host-only chỉ được gửi tới đúng host đã đặt nó.

Triệu chứng: đăng nhập báo thành công, rồi mọi lời gọi API trả 401, và
WebSocket lobby không kết nối được.

Cách xử lý duy nhất chạy được với cả WebSocket: **một domain riêng, hai
subdomain**.

```
app.<domain>.vn   -> Vercel
api.<domain>.vn   -> backend (tunnel, hoặc host thật sau này)
```

Rồi `lib/auth-cookies.ts` phải thêm `domain: '.<domain>.vn'`. Đây là **thay
đổi code chưa làm** — nêu ra ở đây để nó không bị phát hiện lúc đang demo.

Vì sao không proxy API qua Next.js rewrites cho cookie thành first-party:
làm được cho HTTP, nhưng Vercel không proxy được WebSocket, mà
`lib/socket.ts` cần kết nối thẳng tới gateway `/exam-live` kèm cookie. Nửa
giải pháp ở đây tệ hơn không có, vì nó khiến phần hỏng còn lại khó truy hơn.

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
