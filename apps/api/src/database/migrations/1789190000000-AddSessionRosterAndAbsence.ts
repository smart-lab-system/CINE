import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đóng băng danh sách dự thi (CLAUDE.md §7.1.1) + cho sự vắng mặt một
 * chỗ ngồi (§7.1.2).
 *
 * HAI giá trị enum, không phải một (quyết định 2026-09-11, spec
 * collecting §8.1): `not_submitted` là sự thật về dữ liệu, `absent` là
 * phán xét học vụ. Gieo phán xét lúc phiên vừa mở nghĩa là bảng điểm
 * xuất năm phút sau ghi cả lớp vắng thi.
 *
 * ⚠️ KHÔNG bọc `BEGIN/COMMIT` quanh file này. `data-source.ts` đặt
 * `migrationsTransactionMode: 'none'`, và hai câu `ALTER TYPE ... ADD
 * VALUE` dưới đây commit ngay — nhưng nếu ai đó bọc transaction rồi
 * dùng `'not_submitted'` ở một backfill trong CÙNG file, Postgres ném
 * `unsafe use of new value of enum type`, LÚC DEPLOY chứ không phải lúc
 * dev. Đây là đúng cái bẫy mà `AddCollectingStatus` đã dặn.
 *
 * Vì lẽ đó migration này cố ý **không dùng** hai giá trị mới ở bất cứ
 * đâu trong chính nó — kể cả trong thân trigger, vốn chỉ là chuỗi
 * `CREATE OR REPLACE FUNCTION` được Postgres phân tích khi HÀM CHẠY,
 * không phải khi nó được tạo.
 */
export class AddSessionRosterAndAbsence1789190000000 implements MigrationInterface {
  name = 'AddSessionRosterAndAbsence1789190000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `ADD VALUE` chỉ sửa catalog, không rewrite bảng. `IF NOT EXISTS`
    // để chạy lại được sau một lần rollback nửa vời.
    await queryRunner.query(
      `ALTER TYPE "examcollect"."submission_status" ADD VALUE IF NOT EXISTS 'not_submitted' BEFORE 'received'`,
    );
    await queryRunner.query(
      `ALTER TYPE "examcollect"."submission_status" ADD VALUE IF NOT EXISTS 'absent'`,
    );

    await queryRunner.query(
      `CREATE TYPE "examcollect"."session_roster_source" AS ENUM('frozen', 'manual')`,
    );
    await queryRunner.query(`
      CREATE TABLE "examcollect"."session_roster" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "exam_session_id" uuid NOT NULL,
        "student_mssv" citext NOT NULL,
        "student_name" character varying(150) NOT NULL,
        "home_class_id" uuid NOT NULL,
        "home_teacher_id" uuid NOT NULL,
        "source" "examcollect"."session_roster_source" NOT NULL DEFAULT 'frozen',
        CONSTRAINT "ck_session_roster_mssv" CHECK (student_mssv ~ '^[A-Za-z0-9]{4,20}$'),
        CONSTRAINT "PK_session_roster" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_session_roster_session_student" ON "examcollect"."session_roster" ("exam_session_id", "student_mssv")`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."session_roster" ADD CONSTRAINT "FK_session_roster_session" FOREIGN KEY ("exam_session_id") REFERENCES "examcollect"."exam_session"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."session_roster" ADD CONSTRAINT "FK_session_roster_class" FOREIGN KEY ("home_class_id") REFERENCES "examcollect"."class"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."session_roster" ADD CONSTRAINT "FK_session_roster_teacher" FOREIGN KEY ("home_teacher_id") REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(`
      CREATE TRIGGER trg_session_roster_updated_at
      BEFORE UPDATE ON "examcollect"."session_roster"
      FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at()
    `);

    // Mở trigger vòng đời cho ĐÚNG ba đường mới, không hơn.
    //
    //   INSERT thêm `not_submitted` — dòng gieo lúc đóng băng.
    //   not_submitted → received  : file đầu tiên của em đó bay về.
    //   not_submitted → absent    : "Xác nhận kết thúc", có người ký.
    //   absent        → received  : bài về SAU khi đã xác nhận. Không
    //                               chặn upload là quyết định (a) của
    //                               spec collecting §3.1 — nếu không mở
    //                               đường này, chính quyết định đó bị
    //                               trigger phủ nhận ở tầng DB.
    //
    // `invalid` vẫn là ngõ cụt, và `absent` KHÔNG có đường tới
    // `collected` hay `validated`: một bài chỉ tới `collected` bằng cách
    // đi qua `received → validated`, y như mọi bài khác. Đó là thứ giữ
    // cho `collected` luôn nghĩa là "đã đi hết đường kiểm tra".
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION examcollect.validate_submission_lifecycle()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path TO 'examcollect', 'public'
      AS $function$
            BEGIN
                IF TG_OP = 'INSERT' THEN
                    IF NEW.status NOT IN ('received', 'invalid', 'not_submitted') THEN
                        RAISE EXCEPTION 'A submission must be created as received, invalid or not_submitted'
                            USING ERRCODE = 'check_violation';
                    END IF;
                    RETURN NEW;
                END IF;

                IF NEW.status IS DISTINCT FROM OLD.status
                   AND NOT (
                        (OLD.status = 'received' AND NEW.status IN ('validated', 'invalid'))
                        OR (OLD.status = 'validated' AND NEW.status IN ('collected', 'invalid'))
                        OR (OLD.status = 'not_submitted' AND NEW.status IN ('received', 'absent'))
                        OR (OLD.status = 'absent' AND NEW.status = 'received')
                   ) THEN
                    RAISE EXCEPTION 'Invalid submission status transition: % -> %',
                        OLD.status,
                        NEW.status
                        USING ERRCODE = 'check_violation';
                END IF;

                RETURN NEW;
            END;
            $function$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION examcollect.validate_submission_lifecycle()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path TO 'examcollect', 'public'
      AS $function$
            BEGIN
                IF TG_OP = 'INSERT' THEN
                    IF NEW.status NOT IN ('received', 'invalid') THEN
                        RAISE EXCEPTION 'A submission must be created as received or invalid'
                            USING ERRCODE = 'check_violation';
                    END IF;
                    RETURN NEW;
                END IF;

                IF NEW.status IS DISTINCT FROM OLD.status
                   AND NOT (
                        (OLD.status = 'received' AND NEW.status IN ('validated', 'invalid'))
                        OR (OLD.status = 'validated' AND NEW.status IN ('collected', 'invalid'))
                   ) THEN
                    RAISE EXCEPTION 'Invalid submission status transition: % -> %',
                        OLD.status,
                        NEW.status
                        USING ERRCODE = 'check_violation';
                END IF;

                RETURN NEW;
            END;
            $function$
    `);

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_session_roster_updated_at ON "examcollect"."session_roster"`,
    );
    await queryRunner.query(`DROP TABLE "examcollect"."session_roster"`);
    await queryRunner.query(`DROP TYPE "examcollect"."session_roster_source"`);

    // Postgres KHÔNG xoá được một giá trị khỏi enum. `not_submitted` và
    // `absent` ở lại — ghi ra đây để người đọc sau không tưởng `down()`
    // bị viết thiếu.
    //
    // ĐÃ CHẠY THỬ (2026-09-12, DB nháp có đủ dữ liệu của cả ba tính
    // năng). Kết quả, không phải dự đoán:
    //
    //   - `session_roster` DROP sạch: không bảng nào tham chiếu tới nó,
    //     nên không có FK RESTRICT nào chặn.
    //   - Dòng `submission` SỐNG SÓT và vẫn mang `status = 'absent'` —
    //     một giá trị mà code đã lùi không có nhánh nào xử lý. Nó không
    //     nổ; nó rơi qua mọi `switch`/`filter` và được đếm sai.
    //   - Trigger cũ khôi phục ở trên sẽ từ chối mọi UPDATE chạm vào
    //     những dòng ấy (nó chỉ biết `received`/`validated`).
    //
    // Nên `down()` này KHÔNG phải một rollback thật: nó trả schema về,
    // không trả dữ liệu về. Trước khi revert trên dữ liệu đã dùng tính
    // năng, phải quyết những dòng `not_submitted`/`absent` đi đâu — xoá
    // chúng, hay đưa về `received`. Không có câu trả lời đúng chung, nên
    // migration này cố ý không tự chọn hộ.
  }
}
