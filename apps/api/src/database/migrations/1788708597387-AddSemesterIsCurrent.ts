import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * "Kỳ hiện hành" là cờ tường minh, không suy từ ngày — spec §2.2.
 *
 * KHÔNG BACKFILL. Sau migration không kỳ nào hiện hành cho tới khi Phòng Đào
 * tạo gạt.
 *
 * Backfill "kỳ nào chứa hôm nay" nghe tiện, nhưng nó chính là heuristic mà
 * spec đã loại, chỉ khác là chạy một lần thay vì mỗi lần đọc — và ở ca kỳ hè
 * chồng kỳ chính nó vẫn chọn sai, chỉ khác là sai IM LẶNG: màn hình trông bình
 * thường nên không ai đi kiểm. Không backfill thì trạng thái sai là ỒN (mọi
 * trang nói "Chưa có học kỳ hiện hành") và ai đó sửa trong hai phút.
 *
 * Spec §9.2 — đừng thêm backfill vào đây về sau.
 *
 * Partial unique index: nhiều kỳ is_current = false là bình thường, chỉ true
 * mới phải duy nhất, và KHÔNG kỳ nào vẫn hợp lệ.
 */
export class AddSemesterIsCurrent1788708597387 implements MigrationInterface {
    name = 'AddSemesterIsCurrent1788708597387'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "examcollect"."semester" ADD "is_current" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_semester_single_current" ON "examcollect"."semester" ("is_current") WHERE "is_current"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "examcollect"."uq_semester_single_current"`);
        await queryRunner.query(`ALTER TABLE "examcollect"."semester" DROP COLUMN "is_current"`);
    }

}
