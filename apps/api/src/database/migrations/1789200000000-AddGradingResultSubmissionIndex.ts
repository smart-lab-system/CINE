import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Một chỉ mục DUY NHẤT trên `grading_result.submission_id`.
 *
 * Nó trả lời hai câu hỏi khác nhau, và đó là lý do nó là UNIQUE chứ không
 * phải một index thường.
 *
 * 1. HIỆU NĂNG. Postgres KHÔNG tự tạo index cho khoá ngoại. Cột này chỉ
 *    có `FK_fa607b916b8fc17bab3c0650f6b`, nên mọi câu join từ phía
 *    `grading_result` phải quét toàn bảng. Hai câu đó không hiếm:
 *
 *      - `GradingService.progress()` — bị màn hình Chấm điểm hỏi lại MỖI
 *        2 GIÂY trong suốt một lượt chấm, bởi từng giảng viên đang chấm.
 *      - `GradingService.hasResultsForSession()` — guard đổi rubric.
 *
 *    `grading_result` là bảng tích luỹ: một dòng cho mỗi bài, qua mọi kỳ,
 *    không bao giờ bị dọn. Sau vài học kỳ thì "quét toàn bảng mỗi 2 giây"
 *    là hình dạng sai ở đúng lúc hệ thống bận nhất.
 *
 * 2. ĐÚNG ĐẮN. `grading.service.ts` viết rằng tạo dòng lần hai sẽ "đụng
 *    `uq_grading_result_submission`" — ràng buộc đó CHƯA TỪNG TỒN TẠI.
 *    Chống chấm trùng hiện chỉ dựa vào hai lớp mềm: `jobId` trùng bị
 *    BullMQ bỏ, và bộ lọc `alreadyGraded` đọc trước khi ghi. Lớp thứ hai
 *    là TOCTOU thật — hai lần bấm "Bắt đầu chấm" gần nhau (hoặc một lần
 *    bấm và một lần retry) cùng đọc ra tập rỗng rồi cùng INSERT. Kết quả
 *    là hai dòng chấm cho một bài: bảng điểm có hai điểm khác nhau cho
 *    cùng một em, và tiền model bị tính hai lần.
 *
 *    Sau chỉ mục này, lần ghi thứ hai NỔ ở tầng DB thay vì âm thầm thành
 *    công — cùng nguyên tắc mà `trg_grading_result_guard_ai_immutable`
 *    đã đặt.
 *
 * ĐÁNH ĐỔI phải nói ra: bất biến "một bài một dòng chấm" từ nay là luật
 * của schema, không còn là quy ước. Nếu sau này cần CHẤM LẠI (đổi rubric,
 * đổi model) và thiết kế chọn cách ghi một dòng MỚI thay vì sửa dòng cũ,
 * chỉ mục này sẽ chặn — và phải gỡ bằng một migration có chủ đích. Đó là
 * kết cục đúng: hôm nay cả `startGrading`, `gradeOneById` lẫn bộ e2e đều
 * đã giả định một-một, nên thà ghi nó vào schema còn hơn để nó là một
 * giả định không ai bảo vệ.
 *
 * Không dùng CONCURRENTLY: bảng ở quy mô này khoá trong mili-giây, và
 * CONCURRENTLY thất bại để lại một index INVALID phải dọn tay — đắt hơn
 * thứ nó tiết kiệm. Nếu migration này NỔ vì đã có dòng trùng, đừng gỡ
 * UNIQUE: những dòng trùng đó là bug ở trên, hãy đi tìm chúng.
 */
export class AddGradingResultSubmissionIndex1789200000000 implements MigrationInterface {
  name = 'AddGradingResultSubmissionIndex1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_grading_result_submission"
         ON "examcollect"."grading_result" ("submission_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "examcollect"."uq_grading_result_submission"`);
  }
}
