# Bước 1 — Đưa Postgres lên Supabase

Runbook cho người deploy ExamCollect lần đầu. Làm đúng thứ tự; mỗi bước có
cách kiểm chứng riêng, đừng bỏ qua phần kiểm chứng.

## 0. Bối cảnh: cái gì đổi, cái gì không

**Đổi:** `DATABASE_URL` của `apps/api` trỏ từ Docker Postgres sang Supabase.

**Không đổi:** không có gì khác. Cụ thể là **KHÔNG** cài `@supabase/supabase-js`,
`@supabase/ssr`, hay Prisma.

Hai quickstart mặc định của Supabase (Next.js và Prisma) không áp dụng được cho
repo này, vì chúng giả định một kiến trúc khác:

| Quickstart giả định | ExamCollect thực tế |
| --- | --- |
| Frontend query DB trực tiếp qua `supabase-js` | `apps/api` (NestJS + TypeORM) là lớp **duy nhất** chạm DB |
| Supabase Auth giữ session | Auth tự viết: argon2 + access/refresh JWT, đã có `apps/web/src/middleware.ts` |
| Bảng mở ra ngoài, chặn bằng RLS | Bảng do TypeORM tạo, **không có RLS policy nào** |
| Prisma làm ORM, cần `directUrl` | TypeORM, 28 migration đã tồn tại, không có khái niệm `directUrl` |

Làm theo quickstart Next.js sẽ gây hai hậu quả: `utils/supabase/middleware.ts`
tranh ghi cookie với `middleware.ts` sẵn có, và — nghiêm trọng hơn — publishable
key nằm trong bundle trình duyệt cộng với việc **không có RLS** nghĩa là bất kỳ
ai mở DevTools cũng đọc/ghi được toàn bộ `account` (kể cả `password_hash`),
`submission`, `grading_result`.

Với repo này, Supabase đóng đúng một vai: **một Postgres được quản lý**.

## 1. Lấy connection string

Supabase Dashboard → **Connect** → chọn **Session pooler**.

```
postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres
```

Bắt buộc là **Session pooler, cổng 5432**. Không dùng Transaction pooler (6543):
transaction mode không giữ session state và không cho prepared statement.
TypeORM giữ một connection pool sống dài (không phải mô hình serverless mà 6543
sinh ra để phục vụ), nên sẽ gặp lỗi lắt nhắt, không tái hiện đều, rất khó truy.

Ghi chú độ trễ: `ap-southeast-2` là Sydney, từ Việt Nam khoảng 100ms mỗi
round-trip. Một request API chạy nhiều query tuần tự sẽ cảm nhận rõ. Đây là
đánh đổi đã chấp nhận, không phải lỗi cấu hình.

## 2. Bootstrap schema và extension

Mở **SQL Editor** trên Supabase, chạy toàn bộ `docs/deploy/supabase-bootstrap.sql`.

Phải làm trước khi chạy migration. Lý do đầy đủ nằm trong comment của chính file
đó; tóm tắt: schema `examcollect` ở local do một hook riêng của Docker tạo ra,
Supabase không có hook đó, và TypeORM cần schema tồn tại sẵn thì mới ghi được
bảng bookkeeping `migrations` vào trong nó.

Kiểm chứng — chạy trong SQL Editor, phải ra đúng 3 dòng:

```sql
select extname from pg_extension
where extname in ('uuid-ossp', 'citext', 'btree_gist');
```

## 3. Trỏ API sang Supabase

Trong `apps/api/.env` (file này **không** được commit):

```dotenv
DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres
DATABASE_SCHEMA=examcollect
DATABASE_SSL=true
```

`DATABASE_SSL=true` là bắt buộc — Supabase từ chối kết nối plaintext. Mặc định
trong `.env.example` là `false` để Docker Postgres ở local chạy y như cũ.

Nếu password có ký tự đặc biệt (`@`, `:`, `/`, `?`, `#`), phải percent-encode nó
trong URL, nếu không chuỗi bị parse sai và lỗi báo ra sẽ trông như sai mật khẩu.

## 4. Chạy migration

```bash
pnpm --filter api migration:run
```

28 migration, chạy tuần tự. Theo dõi output cho tới `Migration ... has been executed successfully`
của migration cuối.

**Nếu chết giữa chừng:** `data-source.ts` đặt `migrationsTransactionMode: 'none'`,
nên mỗi migration tự quản transaction của nó và **không** có transaction bao
ngoài. Một lỗi ở migration thứ 20 để lại 19 cái đã commit cộng một schema dở
dang — chạy lại sẽ hỏng theo kiểu khác. Ở local bạn `docker compose down -v` là
xong; ở đây không có nút đó. Cách phục hồi: chạy `docs/deploy/supabase-reset.sql`
(xoá sạch schema), rồi làm lại từ bước 2.

Kiểm chứng — trong SQL Editor:

```sql
select count(*) from examcollect.migrations;              -- kỳ vọng: 28
select count(*) from information_schema.tables
where table_schema = 'examcollect';                       -- kỳ vọng: 26
```

## 5. Kiểm chứng bằng đường thật

Đếm bảng chưa đủ — nó không chứng minh API kết nối được. Chạy API và gọi một
route thật có đọc DB:

```bash
pnpm --filter api dev
curl -i http://localhost:4000/health
```

Sau đó đăng nhập một lần qua UI. Đây là phép thử có ý nghĩa vì nó đi qua đúng
đường mà một lỗi TLS hay lỗi search_path sẽ làm hỏng, trong khi `select count(*)`
chạy bằng kết nối của Supabase Dashboard thì không.

## 6. Dữ liệu cũ

Database mới **rỗng**. Không có tài khoản nào, kể cả admin.

Nếu cần đem dữ liệu dev sang, dump từ Docker Postgres và restore — chỉ phần
`examcollect`, không đụng các schema hệ thống của Supabase (`auth`, `storage`,
`realtime`):

```bash
docker compose exec -T postgres pg_dump \
  -U examcollect_admin -d examcollect \
  --schema=examcollect --no-owner --no-privileges \
  > examcollect-dump.sql
```

`--no-owner --no-privileges` là bắt buộc: role `examcollect_admin` không tồn tại
trên Supabase, thiếu hai cờ này thì restore chết ở mọi câu `ALTER ... OWNER TO`.

Restore bằng `psql` với chính connection string ở bước 1. Nếu làm bước này thì
**bỏ qua bước 4** — dump đã chứa cả bảng `migrations`, chạy migration lên trên
nó sẽ xung đột.

## Còn lại chưa xong ở bước này

- **Object storage** vẫn trỏ MinIO local (`STORAGE_ENDPOINT`). Bước 2 sẽ chuyển
  sang Supabase Storage qua endpoint S3-compatible.
- **Redis** vẫn là container local. Nó phải nằm cạnh backend — Supabase không
  cung cấp Redis.
- **`apps/api` chưa deploy đi đâu cả.** Nó không chạy được trên Vercel: 4 Socket.IO
  gateway, một BullMQ worker in-process, và hai `@Interval` 30 giây đều cần một
  tiến trình sống dài. Chỗ chạy cho nó là quyết định còn bỏ ngỏ.
