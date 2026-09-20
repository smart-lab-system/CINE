import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nửa MỞ RỘNG của expand/contract.
 *
 * Sau migration này mọi cột mới đã có và đã backfill, còn khoá ngoại cũ vẫn
 * nguyên — hệ thống đọc được ở cả hai đường, biên dịch được, deploy được.
 * Nửa THU HẸP (`ContractMasterData`) chạy sau khi mười file đã chuyển sang
 * đọc cột mới.
 *
 * Spec §8 nói migration + viết lại 10 file + xoá phải đi cùng một lần vì
 * tách ra sẽ có một commit ở giữa nơi hệ thống không chạy. Đúng với cách
 * tách THEO TẦNG. Tách theo expand/contract thì không: mỗi trạng thái trung
 * gian đều chạy được, và điểm không-quay-lại-được đứng riêng một migration
 * thay vì nằm giữa một khối không ai review nổi.
 */
export class ExpandMasterDataToText1789320000000 implements MigrationInterface {
  name = 'ExpandMasterDataToText1789320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------------------------------------------------------- class
    await queryRunner.query(`
      ALTER TABLE "examcollect"."class" ADD COLUMN "course_name" varchar(200)
    `);
    await queryRunner.query(`
      UPDATE "examcollect"."class" c
         SET "course_name" = co."name"
        FROM "examcollect"."course" co
       WHERE co."id" = c."course_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."class" ALTER COLUMN "course_name" SET NOT NULL
    `);

    // --------------------------------------------------------- exam_session
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD COLUMN "course_name" varchar(200),
        ADD COLUMN "room_name"   varchar(150)
    `);
    await queryRunner.query(`
      UPDATE "examcollect"."exam_session" es
         SET "course_name" = co."name",
             "room_name"   = r."name"
        FROM "examcollect"."course" co, "examcollect"."room" r
       WHERE co."id" = es."course_id" AND r."id" = es."room_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        ALTER COLUMN "course_name" SET NOT NULL,
        ALTER COLUMN "room_name"   SET NOT NULL
    `);

    // `class_id` BẮT BUỘC — và đây không chỉ là dọn dẹp.
    //
    // `ex_exam_session_class_overlap` là exclusion constraint trên
    // `class_id`, mà Postgres BỎ QUA dòng có khoá NULL. Nên tới hôm nay,
    // mọi phiên thi không gắn lớp đang thoát hoàn toàn khỏi phép chống
    // trùng lịch lớp. NOT NULL làm ràng buộc đó có hiệu lực LẦN ĐẦU TIÊN.
    //
    // Dừng thay vì đoán: gán bừa một lớp cho phiên thi là bịa ra một sự
    // thật về việc ai đã thi ở đâu.
    await queryRunner.query(`
      DO $$
      DECLARE n int;
      BEGIN
        SELECT count(*) INTO n FROM examcollect.exam_session WHERE class_id IS NULL;
        IF n > 0 THEN
          RAISE EXCEPTION
            'Còn % phiên thi chưa gắn lớp. Gán tay hoặc xoá trước khi chạy migration này — KHÔNG đoán.', n;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session" ALTER COLUMN "class_id" SET NOT NULL
    `);

    // --------------------------------------------------------------- rubric
    //
    // Đây là mục đích thật của cả đợt: gỡ rubric khỏi quyền sở hữu của môn
    // học. Quyền tạo rubric đang được suy ra bằng cách ĐẾM DÒNG TRONG BẢNG
    // `class` (`rubric.service.ts` `assertTeachesCourse`), nên mọi thiết kế
    // lại phần chấm điểm đều thừa kế ràng buộc đó nếu không cắt trước.
    await queryRunner.query(`
      ALTER TABLE "examcollect"."rubric"
        ADD COLUMN "teacher_id" uuid,
        ADD COLUMN "name"       varchar(200)
    `);

    // `DISTINCT ON (course_id) ... ORDER BY course_id, created_at` = lớp
    // được tạo SỚM NHẤT của môn đó. Tuỳ tiện nhưng XÁC ĐỊNH: một môn nhiều
    // giảng viên thì ai đó phải thắng, và "người tạo lớp đầu tiên" ít bất
    // ngờ hơn "ngẫu nhiên".
    await queryRunner.query(`
      UPDATE "examcollect"."rubric" ru
         SET "teacher_id" = sub.teacher_id,
             "name"       = sub.course_name
        FROM (
          SELECT DISTINCT ON (c."course_id")
                 c."course_id", c."teacher_id", co."name" AS course_name
            FROM "examcollect"."class" c
            JOIN "examcollect"."course" co ON co."id" = c."course_id"
           ORDER BY c."course_id", c."created_at"
        ) sub
       WHERE sub."course_id" = ru."course_id"
    `);

    // Rubric không suy ra được chủ (môn không có lớp nào) thì DỪNG, không
    // gán bừa cho admin — một rubric sai chủ là một giảng viên sửa được
    // điểm của người khác.
    await queryRunner.query(`
      DO $$
      DECLARE n int;
      BEGIN
        SELECT count(*) INTO n FROM examcollect.rubric WHERE teacher_id IS NULL;
        IF n > 0 THEN
          RAISE EXCEPTION
            'Còn % rubric không suy ra được chủ (môn không có lớp nào). Gán tay trước — KHÔNG gán bừa cho admin.', n;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."rubric"
        ALTER COLUMN "teacher_id" SET NOT NULL,
        ALTER COLUMN "name"       SET NOT NULL,
        ADD CONSTRAINT "fk_rubric_teacher"
            FOREIGN KEY ("teacher_id") REFERENCES "examcollect"."account"("id")
            ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_rubric_teacher_name_version"
          ON "examcollect"."rubric" ("teacher_id", "name", "version")
    `);

    // ----------------------------------------------------------- enrollment
    //
    // Khoá duy nhất MỚI dựng trước, khoá cũ bỏ ở nửa thu hẹp. Bản chất bảng
    // này là "sinh viên thuộc lớp nào", nên khoá theo lớp đúng hơn khoá
    // theo môn — và nó cho phép một sinh viên nằm ở hai lớp cùng môn, thứ
    // khoá cũ cấm mà không có lý do nghiệp vụ nào.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_enrollment_class_student"
          ON "examcollect"."enrollment" ("home_class_id", "student_mssv")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "examcollect"."uq_enrollment_class_student"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "examcollect"."uq_rubric_teacher_name_version"`);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."rubric"
        DROP CONSTRAINT IF EXISTS "fk_rubric_teacher",
        DROP COLUMN IF EXISTS "teacher_id",
        DROP COLUMN IF EXISTS "name"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session" ALTER COLUMN "class_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        DROP COLUMN IF EXISTS "course_name",
        DROP COLUMN IF EXISTS "room_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."class" DROP COLUMN IF EXISTS "course_name"
    `);
  }
}
