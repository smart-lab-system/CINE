-- CHỈ dùng khi `migration:run` chết giữa chừng và để lại DB nửa vời.
--
-- Vì sao rủi ro này có thật: data-source.ts đặt
-- `migrationsTransactionMode: 'none'` — mỗi migration tự quản transaction của
-- nó, KHÔNG có transaction bao ngoài. Một migration hỏng ở bước thứ 20 để lại
-- 19 migration đã commit cộng một schema dở dang. Ở local bạn
-- `docker compose down -v` là xong; trên Supabase thì không có nút đó.
--
-- XOÁ SẠCH mọi dữ liệu trong schema examcollect. Không hoàn tác được.
-- Đọc lại tên project trên thanh địa chỉ trước khi bấm Run.

DROP SCHEMA IF EXISTS examcollect CASCADE;
CREATE SCHEMA examcollect;
