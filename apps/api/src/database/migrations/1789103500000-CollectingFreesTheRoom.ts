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
    await rebuild(
      queryRunner,
      `"status" <> 'collecting' AND "status" <> 'completed' AND "status" <> 'cancelled'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await rebuild(queryRunner, `"status" <> 'completed' AND "status" <> 'cancelled'`);
  }
}

/**
 * Dựng lại cả hai ràng buộc với một predicate mới, TRONG MỘT TRANSACTION.
 *
 * Transaction ở đây không phải thói quen — nó vá một cửa sổ hỏng thật.
 * `data-source.ts` đặt `migrationsTransactionMode: 'none'`, nên nếu
 * không mở tay thì bốn câu lệnh chạy rời nhau và giữa hai `DROP` với hai
 * `ADD` có một quãng bảng KHÔNG CÓ ràng buộc chống trùng phòng nào cả.
 *
 * Cái đáng sợ không phải là quãng đó ngắn hay dài. Nếu đúng lúc đó có
 * một INSERT chen vào tạo ra cặp phiên chồng lấn, câu `ADD CONSTRAINT`
 * sau đó sẽ NÉM LỖI, migration dừng lại sau khi đã DROP xong — và bảng ở
 * lại vĩnh viễn trong trạng thái không còn ràng buộc nào, im lặng. Mất
 * hẳn ràng buộc tệ hơn hẳn so với việc chặn ghi vài trăm mili giây.
 *
 * (Trên dữ liệu có sẵn thì `ADD` không thể fail: predicate mới loại trừ
 * NHIỀU dòng hơn predicate cũ, nên mọi dữ liệu thoả ràng buộc cũ đều
 * thoả ràng buộc mới. Đường hỏng duy nhất là ghi đồng thời.)
 *
 * ⚠️ Migration ANH EM của nó — `AddCollectingStatus` — thì TUYỆT ĐỐI
 * không được bọc như thế này: nó chạy `ALTER TYPE ... ADD VALUE`, và
 * Postgres cấm dùng giá trị enum mới trong cùng transaction sinh ra nó.
 * Đó chính là lý do hai việc nằm ở hai file.
 */
async function rebuild(queryRunner: QueryRunner, predicate: string): Promise<void> {
  await queryRunner.startTransaction();
  try {
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
         WHERE (${predicate})`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session"
         ADD CONSTRAINT "ex_exam_session_class_overlap"
         EXCLUDE USING gist ("class_id" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&)
         WHERE (${predicate})`,
    );
    await queryRunner.commitTransaction();
  } catch (error) {
    // Không nuốt: rollback trả hai ràng buộc CŨ về chỗ, rồi ném tiếp để
    // migration dừng lại một cách ồn ào. Một migration "thành công" mà
    // bảng không còn ràng buộc là thứ không ai phát hiện ra cho tới khi
    // hai lớp cùng được xếp vào một phòng.
    await queryRunner.rollbackTransaction();
    throw error;
  }
}
