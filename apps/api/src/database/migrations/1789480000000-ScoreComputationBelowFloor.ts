import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lượt tính lại ra DƯỚI SÀN (§4.4) cũng là một dòng tính lại — với `score` null (review 3c I2).
 *
 * Trước migration này lượt tính dưới sàn không ghi được dòng nào (`score` NOT NULL), nên lượt tính
 * cũ — theo một bảng lỗi đã đổi — vẫn là "lượt tính mới nhất": điểm hiện tại (§14.2) là một con số
 * bảng lỗi hiện hành không còn cho ra, và chốt điểm công bố đúng con số đó. Null ở đây khớp chữ
 * §14.2: *"không có điểm → null — chưa có điểm"*; lý do nằm ở `breakdown.ungradable`.
 */
export class ScoreComputationBelowFloor1789480000000 implements MigrationInterface {
  name = 'ScoreComputationBelowFloor1789480000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."score_computation" ALTER COLUMN "score" DROP NOT NULL`);
    await q.query(`
      ALTER TABLE "examcollect"."score_computation"
        ADD CONSTRAINT "ck_score_computation_below_floor"
        CHECK ((score IS NULL) = (breakdown -> 'ungradable' IS NOT NULL AND breakdown -> 'ungradable' <> 'null'::jsonb))
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."score_computation" DROP CONSTRAINT "ck_score_computation_below_floor"`);
    // Nổ nếu đã có dòng dưới sàn — cố ý: xoá dòng tính lại là xoá lịch sử (§2.2).
    await q.query(`ALTER TABLE "examcollect"."score_computation" ALTER COLUMN "score" SET NOT NULL`);
  }
}
