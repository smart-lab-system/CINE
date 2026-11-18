# Playground

| Loại | Cách chạy | Kết quả |
|---|---|---|
| Console `c`/`cpp`/`java`/`python` | Docker toolchain | Terminal stdout |
| `static` | nginx | URL preview |
| `spring-boot` | Docker Compose: MariaDB + Maven/JDK 21 | URL `http://127.0.0.1:<port>/` |
| `vite-react` | `npm ci` + `vite build` → nginx SPA | URL `http://127.0.0.1:<port>/` |
| `express` | `npm ci` + `node app.js` (EJS + AWS) | URL `http://127.0.0.1:<port>/` |

## Samples (local, không commit)

Thư mục `sample project/` đã `.gitignore`. Giữ local hoặc trỏ env:

- Web tĩnh: `PLAYGROUND_SAMPLE_STATIC_DIR` → `…/M18_NguyenThanhHuy_22699781`
- Spring: `PLAYGROUND_SAMPLE_SPRING_DIR` → `…/22681861_NguyenGiaBao_Shopping`
- Vite: `PLAYGROUND_SAMPLE_VITE_DIR` → `…/PTUD`
- Express: `PLAYGROUND_SAMPLE_EXPRESS_DIR` → `…/CNM`

## Local

```bash
docker compose up -d postgres redis
pnpm --filter api migration:run
pnpm --filter api playground:image   # chỉ cần cho console
pnpm --filter api dev
pnpm --filter web dev
```

Docker Desktop phải bật. Lần đầu Spring sẽ kéo `mariadb:11.4`, `maven:3.9.9-eclipse-temurin-21`, `eclipse-temurin:21-jre-jammy` và build Maven — **có thể 5–10 phút**.

FE: `/teacher/playground` → chọn loại → **Nạp sample…** → đợi preview URL → **Mở giao diện**.

- Spring: mỗi lần = compose project riêng (`pg…`) → DB riêng; Stop = `compose down -v`.
- Vite: `docker build` (npm) + `docker run` nginx; Stop = `rm` container + image.
- Express: `docker build` + `docker run` Node :3000; AWS qua env host (`AWS_*` hoặc `PLAYGROUND_AWS_*`, `PLAYGROUND_DYNAMODB_TABLE_NAME`, `PLAYGROUND_S3_BUCKET_NAME`).

## File `.sql` khởi tạo / seed

Hai cách phổ biến:

1. **Spring SQL init** (playground dùng cách này): đặt `.sql` trong `src/main/resources/` (vd. `data.sql` hoặc `sql/data.sql`). Khi app start, Spring chạy script **sau** Hibernate `ddl-auto` (`defer-datasource-initialization`). Playground tự ghi `spring.sql.init.data-locations` nếu tìm thấy `.sql`.
2. **MariaDB `/docker-entrypoint-initdb.d`**: mount SQL vào DB image — chỉ hợp khi script tự `CREATE TABLE` (chạy trước app). Không phù hợp sample chỉ có `INSERT` + JPA tạo bảng.

## API thêm

- `POST /playground/runs/sample-spring-boot`
- `POST /playground/runs/sample-vite-react`
- `POST /playground/runs/sample-express`
- `language=spring-boot` / `vite-react` / `express` trên upload

Env: `PLAYGROUND_SAMPLE_SPRING_DIR`, `PLAYGROUND_SAMPLE_VITE_DIR`, `PLAYGROUND_SAMPLE_EXPRESS_DIR`, `PLAYGROUND_DB_NAME`, `PLAYGROUND_DB_PASSWORD`, `PLAYGROUND_PREVIEW_HOST`, `PLAYGROUND_AWS_*` / `AWS_*`.

## Express / CNM + AWS

App CNM dùng DynamoDB + S3. Server vẫn listen nếu thiếu credential, nhưng API list/upload sẽ lỗi cho đến khi set:

```bash
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
DYNAMODB_TABLE_NAME=...
S3_BUCKET_NAME=...
```
