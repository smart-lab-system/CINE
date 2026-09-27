import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `rubric_criterion.key` và `grading_reference.model_answer_origin` — spec §14.1, §14.4.
 *
 * Điền key cho tiêu chí cũ đụng `guard_rubric_criteria_immutable`: trigger bắn với mọi rubric đã
 * có kết quả chấm. §14.4 chốt cách làm: tắt ĐÚNG trigger đó, trong CÙNG transaction, chỉ đụng
 * cột mới, rồi bật lại. Lỗi giữa chừng → rollback → trigger không bao giờ nằm tắt.
 */
export class CriterionKeyAndAnswerOrigin1789435000000 implements MigrationInterface {
  name = 'CriterionKeyAndAnswerOrigin1789435000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."rubric_criterion" ADD COLUMN "key" text`);

    await q.startTransaction();
    try {
      await q.query(`ALTER TABLE "examcollect"."rubric_criterion" DISABLE TRIGGER "trg_rubric_criterion_guard_immutable"`);
      // Và trigger `updated_at`: §14.4 cho điền key bằng cách "chỉ đụng cột mới".
      await q.query(`ALTER TABLE "examcollect"."rubric_criterion" DISABLE TRIGGER "trg_rubric_criterion_updated_at"`);
      // THỨ TỰ GIẢNG VIÊN NHẬP, và đây là lần DUY NHẤT còn đọc được nó. Mọi tiêu chí của một lần
      // lưu chèn trong MỘT câu lệnh: `sort_order = 0` và cùng `created_at`, nên thứ tự chỉ còn nằm
      // ở vị trí vật lý (`ctid`) — đúng thứ tự chèn với dòng chưa từng bị UPDATE, mà tiêu chí thì
      // không bao giờ bị sửa. Chính câu UPDATE này ghi lại mọi dòng và xoá dấu vết đó, nên key đánh
      // số theo `ctid`, đệm ba chữ số, và code phá hoà bằng `key` (`RubricService.toView`).
      await q.query(`
        UPDATE "examcollect"."rubric_criterion" rc
           SET key = k.key
          FROM (SELECT id,
                       'tieu_chi_' || lpad(row_number() OVER (PARTITION BY rubric_id ORDER BY sort_order, created_at, ctid)::text, 3, '0') AS key
                  FROM "examcollect"."rubric_criterion") k
         WHERE rc.id = k.id AND rc.key IS NULL
      `);
      await q.query(`ALTER TABLE "examcollect"."rubric_criterion" ENABLE TRIGGER "trg_rubric_criterion_updated_at"`);
      await q.query(`ALTER TABLE "examcollect"."rubric_criterion" ENABLE TRIGGER "trg_rubric_criterion_guard_immutable"`);
      await q.commitTransaction();
    } catch (error) {
      await q.rollbackTransaction();
      throw error;
    }

    await q.query(`ALTER TABLE "examcollect"."rubric_criterion" ALTER COLUMN "key" SET NOT NULL`);
    await q.query(`ALTER TABLE "examcollect"."rubric_criterion" ADD CONSTRAINT "ck_rubric_criterion_key" CHECK (key ~ '^[a-z0-9_]{1,64}$')`);
    await q.query(`CREATE UNIQUE INDEX "uq_rubric_criterion_key" ON "examcollect"."rubric_criterion" ("rubric_id", "key")`);

    // ------------------------------------------------------------ nguồn gốc đáp án mẫu
    await q.query(`CREATE TYPE "examcollect"."model_answer_origin" AS ENUM ('teacher', 'authoring', 'generated')`);
    await q.query(`ALTER TABLE "examcollect"."grading_reference" ADD COLUMN "model_answer_origin" "examcollect"."model_answer_origin"`);
    // Phần soạn đề gắn đáp án bằng một tên file CỐ ĐỊNH (`ANSWER_KEY_FILENAME`); mọi đáp án khác
    // do giảng viên đưa. Không có đáp án thì không có nguồn gốc.
    await q.query(`
      UPDATE "examcollect"."grading_reference"
         SET model_answer_origin = CASE WHEN model_answer_filename = 'dap-an-va-test.docx' THEN 'authoring'::examcollect.model_answer_origin
                                        ELSE 'teacher'::examcollect.model_answer_origin END
       WHERE model_answer_storage_key IS NOT NULL OR model_answer_note IS NOT NULL
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."grading_reference" DROP COLUMN "model_answer_origin"`);
    await q.query(`DROP TYPE "examcollect"."model_answer_origin"`);
    await q.query(`DROP INDEX "examcollect"."uq_rubric_criterion_key"`);
    await q.query(`ALTER TABLE "examcollect"."rubric_criterion" DROP CONSTRAINT "ck_rubric_criterion_key"`);
    await q.query(`ALTER TABLE "examcollect"."rubric_criterion" DROP COLUMN "key"`);
  }
}
