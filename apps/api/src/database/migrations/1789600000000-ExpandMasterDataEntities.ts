import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Khôi phục dữ liệu nền có phân tầng — nửa MỞ RỘNG (spec 2026-10-04 §8.4 bước 1).
 *
 * Nửa này chỉ THÊM, cộng hai nới lỏng có chủ ý. Lý do tách làm hai nửa: migration
 * chạy TAY, DB dùng chung, code deploy riêng — nên mỗi trạng thái trung gian
 * (sau mở rộng, sau backfill, sau deploy) phải chạy được với cả code cũ lẫn mới.
 * Nửa THU HẸP (NOT NULL, khoá ngoại sinh viên, bỏ cột cũ) là một migration và một
 * PR riêng, sau khi backfill đã chạy (plan H).
 *
 * ## Hai nới lỏng ngoài "chỉ thêm"
 *
 * 1. `class.name` và `enrollment.student_name` bỏ NOT NULL. Code mới không còn
 *    ghi hai cột này (tên lớp là biểu thức của mã + nhóm; tên sinh viên nằm ở
 *    `student`). Giữ NOT NULL thì mọi lần tạo lớp hay thêm sinh viên bằng code
 *    mới, giữa bước triển khai và bước thu hẹp, chết ở 23502.
 * 2. `ex_exam_session_room_overlap` KHÔNG bị bỏ ngay. Nó được dựng lại theo
 *    `room_id`, còn bản theo TÊN giữ lại dưới tên `..._legacy` và chỉ áp cho dòng
 *    chưa có `room_id`. Code cũ còn chạy giữa bước mở rộng và bước triển khai
 *    không ghi `room_id`; bỏ hẳn bản cũ thì khoảng đó đặt trùng phòng không ai chặn.
 *    Chỉ áp cho `room_id IS NULL` còn tránh một lỗi ngược: hai phòng THẬT khác
 *    nhau cùng mang một bản chụp tên (một phòng từng đổi tên) không được coi là
 *    đặt trùng.
 *
 * ## Vì sao bất biến nằm ở DB
 *
 * "Không đổi kỳ của lớp đã có phiên" và "không đổi năm/kỳ của học kỳ đã có lớp"
 * là trigger, không chỉ là kiểm tra trong service: service không phải đường ghi
 * duy nhất vào bảng (backfill, SQL tay, lần sửa sau). Service chỉ thêm câu báo
 * lỗi đọc được.
 *
 * Trigger chỉ chặn khi giá trị CŨ khác NULL: gán lần đầu (NULL -> giá trị) là việc
 * backfill phải làm cho mọi lớp đã có phiên, và không phải là một "thay đổi".
 *
 * ## Không có ở đây
 *
 * - Khoá ngoại `enrollment.student_mssv -> student.mssv`: code cũ còn ghi
 *   enrollment cho MSSV chưa có trong `student`. Nó đến cùng migration thu hẹp.
 * - Dòng dữ liệu nào: backfill là một script riêng, chạy lại được (plan H).
 */
export class ExpandMasterDataEntities1789600000000 implements MigrationInterface {
  name = 'ExpandMasterDataEntities1789600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.startTransaction();
    try {
      // ------------------------------------------------------------ hàm nhãn
      await q.query(`
        CREATE FUNCTION "examcollect"."semester_label"(p_year integer, p_term smallint)
        RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
        AS $fn$ SELECT 'HK' || p_term::text || ' ' || p_year::text || '-' || (p_year + 1)::text $fn$
      `);

      // ------------------------------------------------------------ semester
      await q.query(`
        CREATE TABLE "examcollect"."semester" (
          "id"                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "created_at"          timestamptz NOT NULL DEFAULT now(),
          "updated_at"          timestamptz NOT NULL DEFAULT now(),
          "academic_year_start" integer  NOT NULL,
          "term"                smallint NOT NULL,
          "start_date"          date NOT NULL,
          "end_date"            date NOT NULL,
          CONSTRAINT "ck_semester_term"  CHECK ("term" IN (1, 2, 3)),
          CONSTRAINT "ck_semester_dates" CHECK ("end_date" >= "start_date"),
          CONSTRAINT "ck_semester_year"  CHECK ("academic_year_start" BETWEEN 2000 AND 2999),
          -- Cả hai ngày trong cửa sổ của năm học (01/06 năm đầu → 31/10 năm sau): bắt gõ lệch năm, nhầm chữ số — phản chiếu \`semesterProblems\`.
          CONSTRAINT "ck_semester_dates_in_year"
            CHECK ("start_date" >= make_date("academic_year_start", 6, 1)
               AND "end_date"   <= make_date("academic_year_start" + 1, 10, 31)),
          CONSTRAINT "ex_semester_dates_overlap"
            EXCLUDE USING gist (daterange("start_date", "end_date", '[]') WITH &&)
        )
      `);
      await q.query(`
        CREATE UNIQUE INDEX "uq_semester_year_term"
          ON "examcollect"."semester" ("academic_year_start", "term")
      `);

      // ------------------------------------------------- administrative_class
      await q.query(`
        CREATE TABLE "examcollect"."administrative_class" (
          "id"         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "created_at" timestamptz NOT NULL DEFAULT now(),
          "updated_at" timestamptz NOT NULL DEFAULT now(),
          "code"       citext NOT NULL,
          CONSTRAINT "ck_administrative_class_code"
            CHECK ("code"::text ~ '^[A-Z0-9]{3,30}$' AND "code"::text = upper("code"::text))
        )
      `);
      await q.query(`
        CREATE UNIQUE INDEX "uq_administrative_class_code"
          ON "examcollect"."administrative_class" ("code")
      `);

      // ----------------------------------------------------------------- room
      await q.query(`
        CREATE TABLE "examcollect"."room" (
          "id"         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "created_at" timestamptz NOT NULL DEFAULT now(),
          "updated_at" timestamptz NOT NULL DEFAULT now(),
          "name"       citext NOT NULL,
          "capacity"   integer,
          "is_active"  boolean NOT NULL DEFAULT true,
          CONSTRAINT "ck_room_name"
            CHECK ("name"::text = btrim("name"::text) AND "name"::text !~ '\\s{2,}' AND length("name"::text) BETWEEN 1 AND 100),
          CONSTRAINT "ck_room_capacity" CHECK ("capacity" IS NULL OR "capacity" BETWEEN 1 AND 1000)
        )
      `);
      await q.query(`CREATE UNIQUE INDEX "uq_room_name" ON "examcollect"."room" ("name")`);

      // -------------------------------------------------------------- student
      await q.query(`
        CREATE TABLE "examcollect"."student" (
          "id"         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "created_at" timestamptz NOT NULL DEFAULT now(),
          "updated_at" timestamptz NOT NULL DEFAULT now(),
          "mssv"       citext NOT NULL,
          "full_name"  varchar(150) NOT NULL,
          CONSTRAINT "ck_student_mssv" CHECK ("mssv" ~ '^[A-Za-z0-9]{4,20}$'),
          CONSTRAINT "ck_student_full_name" CHECK (btrim("full_name") <> '')
        )
      `);
      await q.query(`CREATE UNIQUE INDEX "uq_student_mssv" ON "examcollect"."student" ("mssv")`);

      // ---------------------------------------------------------------- class
      await q.query(`
        ALTER TABLE "examcollect"."class"
          ADD COLUMN "semester_id" uuid,
          ADD COLUMN "administrative_class_id" uuid,
          ADD COLUMN "group_name" varchar(50) NOT NULL DEFAULT '',
          ADD CONSTRAINT "fk_class_semester" FOREIGN KEY ("semester_id")
              REFERENCES "examcollect"."semester"("id") ON DELETE RESTRICT,
          ADD CONSTRAINT "fk_class_administrative_class" FOREIGN KEY ("administrative_class_id")
              REFERENCES "examcollect"."administrative_class"("id") ON DELETE RESTRICT,
          ADD CONSTRAINT "ck_class_group_name" CHECK ("group_name" = btrim("group_name")),
          ALTER COLUMN "name" DROP NOT NULL
      `);
      // `group_name` mặc định '' chứ không NULL: Postgres coi mọi NULL là khác
      // nhau, nên với NULL khoá duy nhất dưới đây bị vô hiệu — cùng lỗ hổng mà
      // spec 2026-09-20 §3.4 đã tìm thấy ở `exam_session.class_id`.
      await q.query(`
        CREATE UNIQUE INDEX "uq_class_semester_admin_group"
          ON "examcollect"."class" ("semester_id", "administrative_class_id", "group_name")
      `);

      // ----------------------------------------------------------- enrollment
      await q.query(`ALTER TABLE "examcollect"."enrollment" ALTER COLUMN "student_name" DROP NOT NULL`);

      // --------------------------------------------------------- exam_session
      await q.query(`
        ALTER TABLE "examcollect"."exam_session"
          ADD COLUMN "room_id" uuid,
          ADD CONSTRAINT "fk_exam_session_room" FOREIGN KEY ("room_id")
              REFERENCES "examcollect"."room"("id") ON DELETE RESTRICT
      `);
      await q.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "ex_exam_session_room_overlap"`);
      // Cùng vị từ trạng thái với hai ràng buộc anh em: collecting/completed/cancelled
      // không giữ phòng. NULL không bao giờ thoả `WITH =`, nên dòng chưa có room_id
      // không chạm ràng buộc này.
      await q.query(`
        ALTER TABLE "examcollect"."exam_session"
          ADD CONSTRAINT "ex_exam_session_room_overlap"
          EXCLUDE USING gist ("room_id" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&)
          WHERE ("status" <> 'collecting' AND "status" <> 'completed' AND "status" <> 'cancelled')
      `);
      await q.query(`
        ALTER TABLE "examcollect"."exam_session"
          ADD CONSTRAINT "ex_exam_session_room_overlap_legacy"
          EXCLUDE USING gist ("room_name" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&)
          WHERE ("status" <> 'collecting' AND "status" <> 'completed' AND "status" <> 'cancelled'
                 AND "room_id" IS NULL)
      `);

      // ---------------------------------------------------------- trigger kỳ
      // Mã lỗi là foreign_key_violation (23503): PostgresExceptionFilter đã đổi nó
      // thành 409 — đúng loại: xung đột với dữ liệu đang tồn tại.
      await q.query(`
        CREATE FUNCTION "examcollect"."guard_class_semester_change"()
        RETURNS trigger LANGUAGE plpgsql SET search_path = examcollect, public
        AS $$
        BEGIN
          IF OLD.semester_id IS NOT NULL
             AND NEW.semester_id IS DISTINCT FROM OLD.semester_id
             AND EXISTS (SELECT 1 FROM examcollect.exam_session s WHERE s.class_id = OLD.id) THEN
            RAISE EXCEPTION 'Không đổi được học kỳ của lớp % vì lớp đã có phiên thi', OLD.id
              USING ERRCODE = 'foreign_key_violation';
          END IF;
          RETURN NEW;
        END
        $$
      `);
      await q.query(`
        CREATE TRIGGER "trg_class_semester_guard"
          BEFORE UPDATE OF "semester_id" ON "examcollect"."class"
          FOR EACH ROW EXECUTE FUNCTION "examcollect"."guard_class_semester_change"()
      `);
      await q.query(`
        CREATE FUNCTION "examcollect"."guard_semester_key_change"()
        RETURNS trigger LANGUAGE plpgsql SET search_path = examcollect, public
        AS $$
        BEGIN
          IF (NEW.academic_year_start IS DISTINCT FROM OLD.academic_year_start
              OR NEW.term IS DISTINCT FROM OLD.term)
             AND EXISTS (SELECT 1 FROM examcollect.class c WHERE c.semester_id = OLD.id) THEN
            RAISE EXCEPTION 'Không đổi được năm học hay kỳ của học kỳ % vì đã có lớp thuộc nó', OLD.id
              USING ERRCODE = 'foreign_key_violation';
          END IF;
          RETURN NEW;
        END
        $$
      `);
      await q.query(`
        CREATE TRIGGER "trg_semester_key_guard"
          BEFORE UPDATE OF "academic_year_start", "term" ON "examcollect"."semester"
          FOR EACH ROW EXECUTE FUNCTION "examcollect"."guard_semester_key_change"()
      `);

      // ------------------------------------------------------------ class_label
      // MỘT nguồn duy nhất cho nhãn lớp (spec §2.5): mã danh nghĩa + nhóm, kèm kỳ
      // khi cần phân biệt. COALESCE về `class.name` chỉ để lớp CŨ chưa backfill
      // vẫn có nhãn; migration thu hẹp dựng lại view không còn nhánh đó.
      await q.query(`
        CREATE VIEW "examcollect"."class_label" AS
        SELECT c.id AS class_id,
               COALESCE(
                 ac.code::text || CASE WHEN c.group_name = '' THEN '' ELSE ' – ' || c.group_name END,
                 c.name
               ) AS label,
               COALESCE(
                 ac.code::text || CASE WHEN c.group_name = '' THEN '' ELSE ' – ' || c.group_name END
                   || ' · ' || examcollect.semester_label(sem.academic_year_start, sem.term),
                 ac.code::text || CASE WHEN c.group_name = '' THEN '' ELSE ' – ' || c.group_name END,
                 c.name
               ) AS label_with_semester
          FROM examcollect.class c
          LEFT JOIN examcollect.administrative_class ac ON ac.id = c.administrative_class_id
          LEFT JOIN examcollect.semester sem ON sem.id = c.semester_id
      `);

      await q.commitTransaction();
    } catch (error) {
      await q.rollbackTransaction();
      throw error;
    }
  }

  /**
   * Đảo ngược được (khác nửa thu hẹp): mọi thứ ở đây là thêm. Ngoại lệ là hai
   * câu `SET NOT NULL`, chúng sẽ nổ nếu đã có dòng NULL — đúng, vì khi đó "đảo
   * ngược" nghĩa là mất dữ liệu chứ không còn là một phép đảo.
   */
  public async down(q: QueryRunner): Promise<void> {
    await q.startTransaction();
    try {
      await q.query(`DROP VIEW IF EXISTS "examcollect"."class_label"`);
      await q.query(`DROP TRIGGER IF EXISTS "trg_semester_key_guard" ON "examcollect"."semester"`);
      await q.query(`DROP FUNCTION IF EXISTS "examcollect"."guard_semester_key_change"()`);
      await q.query(`DROP TRIGGER IF EXISTS "trg_class_semester_guard" ON "examcollect"."class"`);
      await q.query(`DROP FUNCTION IF EXISTS "examcollect"."guard_class_semester_change"()`);

      await q.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "ex_exam_session_room_overlap_legacy"`);
      await q.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "ex_exam_session_room_overlap"`);
      await q.query(`
        ALTER TABLE "examcollect"."exam_session"
          ADD CONSTRAINT "ex_exam_session_room_overlap"
          EXCLUDE USING gist ("room_name" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&)
          WHERE ("status" <> 'collecting' AND "status" <> 'completed' AND "status" <> 'cancelled')
      `);
      await q.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN "room_id"`);

      await q.query(`ALTER TABLE "examcollect"."enrollment" ALTER COLUMN "student_name" SET NOT NULL`);

      await q.query(`DROP INDEX "examcollect"."uq_class_semester_admin_group"`);
      await q.query(`
        ALTER TABLE "examcollect"."class"
          DROP COLUMN "group_name",
          DROP COLUMN "administrative_class_id",
          DROP COLUMN "semester_id",
          ALTER COLUMN "name" SET NOT NULL
      `);

      await q.query(`DROP TABLE "examcollect"."student"`);
      await q.query(`DROP TABLE "examcollect"."room"`);
      await q.query(`DROP TABLE "examcollect"."administrative_class"`);
      await q.query(`DROP TABLE "examcollect"."semester"`);
      await q.query(`DROP FUNCTION IF EXISTS "examcollect"."semester_label"(integer, smallint)`);
      await q.commitTransaction();
    } catch (error) {
      await q.rollbackTransaction();
      throw error;
    }
  }
}
