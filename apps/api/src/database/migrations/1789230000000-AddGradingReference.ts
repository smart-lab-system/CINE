import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tài liệu tham chiếu để chấm: ĐỀ BÀI và ĐÁP ÁN MẪU.
 *
 * Vì sao cần: hôm nay model chưa bao giờ nhìn thấy đề bài. `GradingRequest`
 * chỉ mang `{ studentMssv, content, deliverableType, criteria }`, và
 * `criteria.description` là text tự do. Tức hệ thống đang hỏi model "bài
 * này có đạt tiêu chí 'Trình bày thuật toán' không?" mà không nói đề yêu
 * cầu thuật toán gì. Với việc đối chiếu rubric thì còn gượng được; với
 * việc phán đoán một câu trả lời NGOÀI DỰ LIỆU của rubric thì bất khả —
 * và không kiến trúc agent nào lấy lại được thông tin chưa từng có trong
 * context.
 *
 * VÌ SAO KHÔNG DÙNG `exam_material` CHO ĐÁP ÁN MẪU:
 * `ExamMaterialService.listForAgent()` trả về MỌI dòng của bảng đó, kèm
 * URL tải, ngay khi qua `start_time`, không lọc theo loại. Để đáp án mẫu
 * ở đó là gửi đáp án về máy cả 40 sinh viên — loại lỗi không sửa lại được
 * sau khi đã xảy ra.
 *
 * Đề bài thì NGƯỢC LẠI: nó vốn đã ở `exam_material` vì sinh viên phải tải
 * được. Nên bảng này chỉ TRỎ tới nó, không chép lại.
 */
export class AddGradingReference1789230000000 implements MigrationInterface {
  name = 'AddGradingReference1789230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "examcollect"."grading_reference" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "exam_session_id" uuid NOT NULL,
        "question_material_id" uuid,
        "model_answer_storage_key" text,
        "model_answer_filename" character varying(255),
        "model_answer_note" text,
        "created_by" uuid NOT NULL,
        CONSTRAINT "uq_grading_reference_session" UNIQUE ("exam_session_id"),
        CONSTRAINT "PK_grading_reference" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_reference"
        ADD CONSTRAINT "fk_grading_reference_session"
        FOREIGN KEY ("exam_session_id") REFERENCES "examcollect"."exam_session"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    // RESTRICT có chủ đích: sau khi đã chấm, giảng viên không xoá được file
    // đề nữa. `ExamMaterialService.remove()` xoá cả dòng LẪN object trong
    // storage, nên không có ràng buộc này thì sáu tháng sau không ai tái
    // dựng được bài chấm để đối chiếu — và một điểm số không tái dựng được
    // là một điểm số không bảo vệ được.
    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_reference"
        ADD CONSTRAINT "fk_grading_reference_material"
        FOREIGN KEY ("question_material_id") REFERENCES "examcollect"."exam_material"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_reference"
        ADD CONSTRAINT "fk_grading_reference_account"
        FOREIGN KEY ("created_by") REFERENCES "examcollect"."account"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_grading_reference_updated_at
      BEFORE UPDATE ON examcollect.grading_reference
      FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Object đáp án mẫu trong storage KHÔNG bị xoá theo — DROP TABLE không
    // biết gì về S3/MinIO. Trước khi revert trên dữ liệu thật, dọn prefix
    // `grading-reference/` bằng tay, nếu không những file ấy nằm lại vĩnh
    // viễn và vẫn đọc được bằng một signed URL cũ.
    await queryRunner.query(`DROP TABLE "examcollect"."grading_reference"`);
  }
}
