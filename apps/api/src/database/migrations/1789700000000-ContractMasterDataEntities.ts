import { MigrationInterface, QueryRunner } from 'typeorm';
import { contractProblems, countContractBlockers } from '../master-data/contract-preconditions';

/**
 * Nửa THU HẸP của đợt khôi phục master data (spec 2026-10-04 §8.4 bước 4) — và là điểm KHÔNG QUAY LẠI ĐƯỢC.
 *
 * Làm bốn việc, theo thứ tự bắt buộc:
 *   1. DỪNG nếu còn dữ liệu hình dạng cũ (cùng hàm đếm với backfill — "backfill xong" và "thu hẹp được phép" không thể nói hai điều khác nhau).
 *   2. Bỏ view `class_label` (nó đọc `class.name`), thu hẹp `class`/`exam_session`/`enrollment`, rồi DỰNG LẠI view không còn nhánh dự phòng.
 *   3. `NOT NULL` cho `class.semester_id`, `class.administrative_class_id`, `exam_session.room_id`; bỏ ràng buộc chống trùng phòng theo TÊN (chỉ còn theo
 *      `room_id`).
 *   4. Khoá ngoại `enrollment.student_mssv → student.mssv`, và bỏ hai cột cũ `class.name`, `enrollment.student_name`.
 *
 * Bỏ `class.name` kéo theo chỉ mục `uq_class_teacher_course_name` (nó có cột đó); khoá duy nhất thay thế `uq_class_semester_admin_group` đã có từ migration
 * mở rộng. Cột `room_name`/`semester_name` trên `exam_session` GIỮ NGUYÊN: chúng là BẢN CHỤP lúc tạo phiên (bảng điểm, tên file `{PHONG}`), không phải bản sao.
 *
 * Code PR2 không đọc hai cột cũ, nên thứ tự deploy là CODE TRƯỚC, MIGRATION SAU — chạy migration này trước khi deploy PR2 làm code cũ (còn
 * `COALESCE(…, e.student_name)`) hỏng ở từng câu truy vấn.
 *
 * `down()` KHÔNG khôi phục được dữ liệu và không giả vờ ngược lại (như `ContractMasterData`): tên lớp và tên sinh viên trong hai cột bị bỏ không suy ra được từ
 * chỗ nào còn lại.
 */
export class ContractMasterDataEntities1789700000000 implements MigrationInterface {
  name = 'ContractMasterDataEntities1789700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.startTransaction();
    try {
      const problems = contractProblems(await countContractBlockers(q));
      if (problems.length > 0) {
        throw new Error(`Không thu hẹp được — DỪNG, không đoán và không "tạm gán":\n  - ${problems.join('\n  - ')}`);
      }

      await q.query(`DROP VIEW "examcollect"."class_label"`);

      await q.query(`
        ALTER TABLE "examcollect"."class"
          ALTER COLUMN "semester_id" SET NOT NULL,
          ALTER COLUMN "administrative_class_id" SET NOT NULL,
          DROP COLUMN "name"
      `);

      await q.query(`ALTER TABLE "examcollect"."exam_session" ALTER COLUMN "room_id" SET NOT NULL`);
      await q.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "ex_exam_session_room_overlap_legacy"`);

      await q.query(`ALTER TABLE "examcollect"."enrollment" DROP COLUMN "student_name"`);
      await q.query(`
        ALTER TABLE "examcollect"."enrollment"
          ADD CONSTRAINT "fk_enrollment_student" FOREIGN KEY ("student_mssv")
              REFERENCES "examcollect"."student"("mssv") ON DELETE RESTRICT
      `);
      // Khoá ngoại cần chỉ mục ở phía tham chiếu để kiểm tra xoá sinh viên không quét cả bảng; cũng là chỉ mục cho "lớp nào có sinh viên này".
      await q.query(`CREATE INDEX "idx_enrollment_student_mssv" ON "examcollect"."enrollment" ("student_mssv")`);

      // Nhãn lớp — MỘT nguồn duy nhất (spec §2.5). Nay mọi lớp đều có mã danh nghĩa và học kỳ nên không còn nhánh dự phòng về `class.name`.
      await q.query(`
        CREATE VIEW "examcollect"."class_label" AS
        SELECT c.id AS class_id,
               ac.code::text || CASE WHEN c.group_name = '' THEN '' ELSE ' – ' || c.group_name END AS label,
               ac.code::text || CASE WHEN c.group_name = '' THEN '' ELSE ' – ' || c.group_name END
                 || ' · ' || examcollect.semester_label(sem.academic_year_start, sem.term) AS label_with_semester
          FROM examcollect.class c
          JOIN examcollect.administrative_class ac ON ac.id = c.administrative_class_id
          JOIN examcollect.semester sem ON sem.id = c.semester_id
      `);

      await q.commitTransaction();
    } catch (error) {
      await q.rollbackTransaction();
      throw error;
    }
  }

  public async down(): Promise<void> {
    throw new Error(
      'ContractMasterDataEntities không quay ngược được. Hai cột class.name và enrollment.student_name đã bị bỏ cùng nội dung của chúng, và ' +
        'phòng/lớp đã được gắn bằng khoá ngoại. Khôi phục từ bản dump chụp trước cutover (docs/runbooks/master-data-cutover.md, mục 1) và deploy ' +
        'lại tag pre-master-data-restore.',
    );
  }
}
