import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ảnh chụp tập anchor, đóng băng một lần lúc bấm "Bắt đầu chấm" (A3).
 *
 * VÌ SAO ĐÂY LÀ YÊU CẦU ĐÚNG ĐẮN, KHÔNG PHẢI HIỆU NĂNG:
 *
 * Giảng viên duyệt bài số 5 trong khi bài 6-40 còn nằm trong hàng đợi.
 * Không đóng băng thì lần duyệt đó lập tức thành anchor, và bài 6-40 được
 * chấm theo một chuẩn KHÁC bài 1-5 — trong cùng một lượt chấm, cùng một
 * lớp, cùng một đề. Cache chết chỉ là triệu chứng; cái hỏng là sự công
 * bằng giữa các sinh viên trong một phiên.
 *
 * Cùng nguyên tắc đã áp cho `session_roster` (CLAUDE.md §7.1.1) và
 * `grading_reference` (spec §3.3). Đây là lần thứ ba, và đó là dấu hiệu
 * nó là một NGUYÊN TẮC chứ không phải ba quyết định rời rạc.
 *
 * VÌ SAO BẢNG RIÊNG, KHÔNG PHẢI MỘT CỘT TRÊN `grading_reference`:
 * bảng đó là TÀI LIỆU giảng viên cấu hình trước khi chấm, và nó có guard
 * 409 chặn sửa khi đã có kết quả chấm. Ảnh chụp anchor thì ngược lại —
 * nó được tạo TẠI thời điểm bấm chấm, bởi hệ thống, không phải người.
 * Nhét chung sẽ buộc hai vòng đời khác nhau đi qua cùng một guard.
 *
 * `UNIQUE (exam_session_id)`: một phiên một ảnh chụp, tạo MỘT LẦN và
 * không bao giờ sửa. Bấm "Bắt đầu chấm" lần hai (chấm tiếp phần còn lại)
 * phải dùng lại đúng ảnh cũ — nếu không thì chính thao tác resume lại phá
 * cái mà A3 sinh ra để giữ.
 */
export class AddAnchorSnapshot1789260000000 implements MigrationInterface {
  name = 'AddAnchorSnapshot1789260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "examcollect"."grading_anchor_snapshot" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "exam_session_id" uuid NOT NULL,
        "rubric_id_version" uuid NOT NULL,
        "anchors" jsonb NOT NULL DEFAULT '[]',
        CONSTRAINT "uq_anchor_snapshot_session" UNIQUE ("exam_session_id"),
        CONSTRAINT "PK_grading_anchor_snapshot" PRIMARY KEY ("id")
      )
    `);

    // ON DELETE CASCADE, khác `grading_reference` (RESTRICT): ảnh chụp
    // không có giá trị độc lập với phiên thi của nó. Xoá phiên mà để lại
    // một ảnh chụp mồ côi là giữ lại rác không ai tra ngược được.
    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_anchor_snapshot"
      ADD CONSTRAINT "fk_anchor_snapshot_session"
      FOREIGN KEY ("exam_session_id")
      REFERENCES "examcollect"."exam_session"("id") ON DELETE CASCADE
    `);

    // RESTRICT ở đây: rubric version là thứ ảnh chụp được khoá theo (A1),
    // nên xoá nó khi còn ảnh chụp sẽ làm tập anchor mất nghĩa mà không
    // còn cách nào biết nó từng khoá theo gì.
    await queryRunner.query(`
      ALTER TABLE "examcollect"."grading_anchor_snapshot"
      ADD CONSTRAINT "fk_anchor_snapshot_rubric"
      FOREIGN KEY ("rubric_id_version")
      REFERENCES "examcollect"."rubric"("id") ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "examcollect"."grading_anchor_snapshot"`);
  }
}
