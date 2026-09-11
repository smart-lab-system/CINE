import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phiên ở `collecting` phải NHẢ phòng và nhả lớp.
 *
 * Hai ràng buộc GiST loại trừ theo `status <> 'completed' AND <>
 * 'cancelled'`, nghĩa là phiên `collecting` vẫn giữ chỗ. Trước
 * `AddCollectingStatus`, "chốt bài ngay" đưa phiên thẳng sang
 * `completed` nên phòng được nhả ngay lúc bấm; sau đó nó dừng ở
 * `collecting` và phòng bị khoá tới hết giờ THEO LỊCH.
 *
 * Đó là hồi quy thật, không phải thay đổi thiết kế:
 * `exam-schedule-conflict.e2e-spec.ts` đã pin hành vi này từ trước với
 * lý do viết ngay trong test — "an exam that finished at 09:00 must not
 * keep a lab blocked until the 12:00 it was scheduled to end at".
 *
 * Sau migration này chỉ `draft | scheduled | active` mới giữ chỗ. Đúng
 * về nghĩa: phòng bị chiếm bởi buổi thi CHƯA xong. Vào `collecting` là
 * đã thi xong — bài còn bay về qua mạng, nhưng cái phòng thì trống.
 *
 * ⚠️ Migration RIÊNG, không gộp vào `AddCollectingStatus`, và đó là chủ
 * đích: predicate dưới đây DÙNG giá trị `'collecting'`. Gộp chung với
 * câu `ALTER TYPE ... ADD VALUE` sinh ra nó sẽ ném `unsafe use of new
 * value of enum type` nếu có ai bọc transaction quanh file đó — đúng
 * cái bẫy mà doc comment của migration kia đã dặn phải tách.
 */
export class CollectingFreesTheRoom1789103500000 implements MigrationInterface {
  name = 'CollectingFreesTheRoom1789103500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "ex_exam_session_room_overlap"`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "ex_exam_session_class_overlap"`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session"
         ADD CONSTRAINT "ex_exam_session_room_overlap"
         EXCLUDE USING gist ("room_id" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&)
         WHERE ("status" <> 'collecting' AND "status" <> 'completed' AND "status" <> 'cancelled')`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session"
         ADD CONSTRAINT "ex_exam_session_class_overlap"
         EXCLUDE USING gist ("class_id" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&)
         WHERE ("status" <> 'collecting' AND "status" <> 'completed' AND "status" <> 'cancelled')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "ex_exam_session_room_overlap"`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "ex_exam_session_class_overlap"`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session"
         ADD CONSTRAINT "ex_exam_session_room_overlap"
         EXCLUDE USING gist ("room_id" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&)
         WHERE ("status" <> 'completed' AND "status" <> 'cancelled')`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session"
         ADD CONSTRAINT "ex_exam_session_class_overlap"
         EXCLUDE USING gist ("class_id" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&)
         WHERE ("status" <> 'completed' AND "status" <> 'cancelled')`,
    );
  }
}
