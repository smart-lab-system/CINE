-- Chạy MỘT LẦN trong Supabase SQL Editor, TRƯỚC `pnpm --filter api migration:run`.
--
-- Vì sao cần file này: ở local, schema `examcollect` được tạo bởi
-- docker/postgres-init/001-create-schema.sql — một hook CHỈ TỒN TẠI ở image
-- postgres của Docker (/docker-entrypoint-initdb.d). Supabase không có chỗ
-- tương đương, nên bước đó phải làm tay.
--
-- Vòng lặp chết người nếu bỏ qua: TypeORM tạo bảng bookkeeping `migrations`
-- BÊN TRONG schema đã cấu hình (`examcollect`) trước khi chạy migration đầu
-- tiên — nhưng chính migration đầu tiên mới là thứ tạo ra schema đó. Không có
-- file này, lệnh migration chết ngay với "schema examcollect does not exist".

CREATE SCHEMA IF NOT EXISTS examcollect;

-- Ba extension mà migration phụ thuộc vào:
--   uuid-ossp  -> uuid_generate_v4(), mặc định của 26 khoá chính
--   citext     -> kiểu cột của email / course.code / student_mssv
--   btree_gist -> ràng buộc EXCLUDE chống trùng lịch thi
--     (1788585730160-AddExamSessionOverlapConstraints.ts)
--
-- TypeORM 0.3 tự chạy `CREATE EXTENSION IF NOT EXISTS` cho cả ba khi khởi
-- động (node_modules/typeorm/driver/postgres/PostgresDriver.js:302-352), nên
-- về lý thuyết không cần dòng nào dưới đây. Chúng có mặt để việc migration
-- chạy được KHÔNG phụ thuộc vào một hành vi ngầm của thư viện, và để lỗi
-- thiếu quyền (nếu có) nổ ra ở đây — nơi nhìn là hiểu — thay vì nổ giữa
-- chừng migration với DB đã nửa vời.
--
-- `IF NOT EXISTS` là no-op nếu Supabase đã cài sẵn ở schema `extensions`;
-- trường hợp đó hàm vẫn phân giải được vì `extensions` nằm trong search_path
-- mặc định của role postgres trên Supabase, và TypeORM KHÔNG hề đặt lại
-- search_path (đã kiểm: không có `SET search_path` nào trong PostgresDriver.js).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;
