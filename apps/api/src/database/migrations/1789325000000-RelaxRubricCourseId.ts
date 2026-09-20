import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nửa sau của bước MỞ RỘNG, và nó tồn tại vì bước đầu thiếu đúng một thứ.
 *
 * `ExpandMasterDataToText` thêm `rubric.teacher_id` + `rubric.name` cạnh
 * `rubric.course_id`, nhưng để `course_id` NOT NULL. Thế là đường ghi không
 * chuyển sang chủ sở hữu mới được: lúc `RubricService.saveNewVersion` thôi
 * điền `course_id` — vì rubric không còn biết môn nào cả — mọi lượt tạo
 * rubric nổ NOT NULL. Một trạng thái trung gian không chạy được, tức là
 * đúng thứ khuôn expand/contract sinh ra để tránh.
 *
 * Migration này chỉ nới ràng buộc, không bỏ cột. Cột biến mất ở
 * `ContractMasterData`; giữ nó lại ở đây để lượt triển khai này vẫn quay
 * ngược được, và để dữ liệu cũ còn nguyên chỗ đối chiếu.
 *
 * `uq_rubric_course_version` không cần đụng tới: Postgres coi mỗi NULL là
 * một giá trị khác nhau trong chỉ mục duy nhất, nên các dòng mới không va
 * nhau, còn các dòng cũ vẫn được ràng buộc y như trước.
 */
export class RelaxRubricCourseId1789325000000 implements MigrationInterface {
  name = 'RelaxRubricCourseId1789325000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "examcollect"."rubric" ALTER COLUMN "course_id" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Quay ngược được, nhưng chỉ khi chưa có rubric nào được tạo theo lối
    // mới. Nói thẳng con số thay vì để Postgres ném một thông báo về ràng
    // buộc mà người đọc phải tự dịch ra nguyên nhân.
    await queryRunner.query(`
      DO $$
      DECLARE n int;
      BEGIN
        SELECT count(*) INTO n FROM examcollect.rubric WHERE course_id IS NULL;
        IF n > 0 THEN
          RAISE EXCEPTION
            'Có % rubric không gắn môn nào (tạo sau khi rubric về tay giảng viên). Không suy ngược ra môn được — khôi phục từ bản sao lưu nếu thật sự cần quay lại.', n;
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "examcollect"."rubric" ALTER COLUMN "course_id" SET NOT NULL`,
    );
  }
}
