import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nửa THU HẸP của expand/contract, và là điểm KHÔNG QUAY LẠI ĐƯỢC.
 *
 * Bỏ ba bảng dữ liệu nền của trường — `course`, `room`, `semester` — cùng
 * mọi khoá ngoại trỏ tới chúng, và rút vai trò tài khoản còn hai. Sau
 * migration này hệ thống không quản lý dữ liệu nền nữa; nó chỉ ghi lại
 * những gì giảng viên khai cho một phiên thi.
 *
 * `down()` KHÔNG khôi phục được dữ liệu và không giả vờ ngược lại — nó ném
 * lỗi trỏ tới bản sao lưu. Ba bảng bị bỏ mang nội dung mà không cột nào còn
 * lại suy ra được: mã môn, khoa sở hữu, sức chứa phòng, ngày bắt đầu và kết
 * thúc học kỳ. Tên thì còn, vì đã được chụp sang cột văn bản ở
 * `ExpandMasterDataToText`; phần còn lại thì không.
 *
 * THỨ TỰ BẮT BUỘC: bỏ chỉ mục → bỏ ràng buộc → bỏ cột → chuyển vai trò →
 * bỏ bảng. Đảo lại thì Postgres từ chối bỏ một bảng còn khoá ngoại trỏ vào,
 * và đó cũng là lý do plan cấm dùng `migration:generate` cho bước này:
 * generator không biết thứ tự an toàn.
 */
export class ContractMasterData1789330000000 implements MigrationInterface {
  name = 'ContractMasterData1789330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Chỉ mục khoá theo môn, thay bằng bản khoá theo lớp/giảng viên ---
    // Bản thay thế đã được tạo ở `ExpandMasterDataToText`
    // (`uq_enrollment_class_student`, `uq_rubric_teacher_name_version`),
    // nên không có khoảnh khắc nào dữ liệu đứng không ràng buộc.
    await queryRunner.query(`DROP INDEX IF EXISTS "examcollect"."uq_enrollment_course_student"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "examcollect"."uq_rubric_course_version"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "examcollect"."uq_class_course_name"`);

    // --- Chống trùng lịch phòng, chuyển sang cột văn bản ---
    //
    // Bỏ `room_id` sẽ kéo theo exclusion constraint dựng trên nó, nên phải
    // dựng lại bản mới TRƯỚC KHI bỏ cột — nếu không tồn tại một khoảnh khắc
    // hai phiên đặt trùng phòng mà không gì chặn.
    //
    // Vị từ sao y bản cũ, GỒM CẢ `collecting`: một kỳ thi đã kết thúc, đang
    // thu bài, hoặc đã huỷ thì không giữ phòng nữa. Lệch khỏi vị từ này là
    // làm phép kiểm trước trong `ScheduleConflictService` chặt hơn chính
    // ràng buộc, tức từ chối những lượt đặt mà CSDL sẵn sàng nhận.
    //
    // SUY GIẢM CÓ CHỦ Ý (spec §3.4): khoá giờ là một chuỗi, nên "P.A101" và
    // "P A101" là hai phòng khác nhau với Postgres. Ràng buộc tụt từ BẢO
    // ĐẢM xuống NỖ LỰC TỐT NHẤT, và nó chỉ BỎ SÓT chứ không bao giờ báo
    // nhầm.
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        DROP CONSTRAINT IF EXISTS "ex_exam_session_room_overlap"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD CONSTRAINT "ex_exam_session_room_overlap"
        EXCLUDE USING gist (
          "room_name" WITH =,
          tstzrange("start_time", "end_time", '[)') WITH &&
        )
        WHERE (
          status <> 'collecting'
          AND status <> 'completed'
          AND status <> 'cancelled'
        )
    `);

    // --- Cấu hình pipeline chấm theo MÔN, một khái niệm vừa hết tồn tại ---
    //
    // Plan không nêu bảng này; nó lộ ra khi liệt kê khoá ngoại trỏ tới
    // `course`. `scope_id` chỉ từng trỏ tới một môn, nên phạm vi "course"
    // không còn nghĩa gì. Thu về `global` thay vì để `scope_id` thành một
    // uuid không trỏ tới đâu cả.
    await queryRunner.query(`
      DELETE FROM "examcollect"."grading_pipeline_config" WHERE "scope_type" = 'course'
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_pipeline_config"
        DROP CONSTRAINT IF EXISTS "FK_98dffb66c25a38b1100c9c49359",
        DROP CONSTRAINT IF EXISTS "ck_grading_pipeline_config_scope",
        ADD CONSTRAINT "ck_grading_pipeline_config_scope"
            CHECK ("scope_type" = 'global' AND "scope_id" IS NULL)
    `);

    // --- Bỏ khoá ngoại tới dữ liệu nền ---
    await queryRunner.query(`ALTER TABLE "examcollect"."enrollment"   DROP COLUMN "course_id"`);
    await queryRunner.query(`ALTER TABLE "examcollect"."rubric"       DROP COLUMN "course_id"`);
    await queryRunner.query(`ALTER TABLE "examcollect"."class"        DROP COLUMN "course_id"`);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        DROP COLUMN "course_id",
        DROP COLUMN "room_id"
    `);

    // Khoá duy nhất của lớp, viết lại quanh chủ sở hữu mới. Trước đây là
    // (course_id, name) — một môn không có hai lớp trùng tên. Giờ là
    // (teacher_id, course_name, name): một giảng viên không có hai lớp
    // trùng tên trong cùng một môn, còn hai giảng viên thì không đụng nhau.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_class_teacher_course_name"
          ON "examcollect"."class" ("teacher_id", "course_name", "name")
    `);

    // --- Vai trò: chỉ còn admin và teacher ---
    //
    // `account.role` là NOT NULL, nên các tài khoản mang vai trò sắp biến
    // mất phải được chuyển TRƯỚC khi thu enum. Đích là `teacher`, vai trò
    // ÍT QUYỀN HƠN: hạ quyền rồi nâng lại là một thao tác quản trị, còn
    // nâng nhầm thì không ai phát hiện ra.
    await queryRunner.query(`
      UPDATE "examcollect"."account"
         SET "role" = 'teacher'
       WHERE "role" IN ('department_admin', 'super_admin')
    `);

    // Postgres không bỏ được một nhãn khỏi enum đang dùng, nên dựng kiểu
    // mới rồi đổi cột sang. Giá trị mặc định (nếu có) phải gỡ trước khi đổi
    // kiểu và đặt lại sau — nếu không Postgres từ chối ép kiểu của nó.
    await queryRunner.query(`ALTER TYPE "examcollect"."account_role" RENAME TO "account_role_old"`);
    await queryRunner.query(`CREATE TYPE "examcollect"."account_role" AS ENUM ('admin', 'teacher')`);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."account"
        ALTER COLUMN "role" TYPE "examcollect"."account_role"
        USING "role"::text::"examcollect"."account_role"
    `);
    await queryRunner.query(`DROP TYPE "examcollect"."account_role_old"`);

    // --- Và cuối cùng, ba bảng ---
    await queryRunner.query(`DROP TABLE "examcollect"."room"`);
    await queryRunner.query(`DROP TABLE "examcollect"."course"`);
    await queryRunner.query(`DROP TABLE "examcollect"."semester"`);
  }

  public async down(): Promise<void> {
    throw new Error(
      'ContractMasterData không quay ngược được. Ba bảng course/room/semester đã bị bỏ ' +
        'cùng mọi cột trỏ tới chúng, và nội dung của chúng — mã môn, khoa sở hữu, sức ' +
        'chứa phòng, ngày của học kỳ — không suy ra được từ bất cứ cột nào còn lại. ' +
        'Khôi phục từ bản sao lưu chụp trước migration này (~/examcollect-backups/).',
    );
  }
}
