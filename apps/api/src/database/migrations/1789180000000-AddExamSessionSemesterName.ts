import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `exam_session.semester_name` — chụp tên học kỳ lúc tạo phiên
 * (CLAUDE.md §7.1.5).
 *
 * VIẾT TAY, không dùng `migration:generate`. Bản sinh tự động sẽ ra
 * `ADD "semester_name" character varying(150) NOT NULL` trong một câu —
 * và câu đó **nổ trên bảng đã có dữ liệu**. Chuỗi đúng là ba bước:
 * thêm cột nullable → backfill → siết `NOT NULL`. Tiền lệ trong repo:
 * `AddCourseRoomExamType.up()`.
 *
 * Backfill là lần DUY NHẤT quan hệ `exam_session → course → semester`
 * được dùng để suy ra giá trị này. Sau migration này không code nào được
 * suy `semester_name` từ `course` nữa — làm thế là dựng lại đúng cái
 * phụ thuộc mà cột này sinh ra để cắt.
 *
 * Đã đếm trước khi viết, trên DB dev (2026-09-11):
 *
 *   SELECT count(*) FROM examcollect.exam_session es
 *     LEFT JOIN examcollect.course c   ON c.id = es.course_id
 *     LEFT JOIN examcollect.semester s ON s.id = c.semester_id
 *    WHERE s.name IS NULL;                                  -- → 0
 *
 * Nên `SET NOT NULL` đi qua được và không cần giá trị dự phòng. Nếu con
 * số đó khác 0 ở một môi trường khác, migration sẽ dừng ở bước ba với
 * lỗi rõ ràng — đó là hành vi mong muốn, không phải thứ cần bọc
 * `COALESCE` cho qua: một phiên thi không truy được học kỳ là dữ liệu
 * hỏng cần người nhìn, không phải thứ để điền đại một chuỗi vào.
 */
export class AddExamSessionSemesterName1789180000000 implements MigrationInterface {
  name = 'AddExamSessionSemesterName1789180000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session" ADD "semester_name" character varying(150)`,
    );

    await queryRunner.query(`
      UPDATE "examcollect"."exam_session" es
         SET "semester_name" = s."name"
        FROM "examcollect"."course" c
        JOIN "examcollect"."semester" s ON s."id" = c."semester_id"
       WHERE c."id" = es."course_id"
         AND es."semester_name" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session" ALTER COLUMN "semester_name" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session" DROP COLUMN "semester_name"`,
    );
  }
}
