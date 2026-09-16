import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn "Đang thu bài" (spec §4).
 *
 * ⚠️ Migration này CỐ Ý không bọc `BEGIN/COMMIT` và CỐ Ý không dùng giá
 * trị `'collecting'` ở bất cứ đâu bên trong nó.
 *
 * `data-source.ts` đặt `migrationsTransactionMode: 'none'` (vì
 * `InitialSchema` tự viết transaction của nó), nên mỗi câu ở đây
 * autocommit và `ADD VALUE` có hiệu lực ngay. Nhưng chính quy ước đó là
 * cái bẫy: ai bọc file này trong `BEGIN/COMMIT` rồi thêm một backfill,
 * một CHECK hay một partial index chạm tới `'collecting'` sẽ nhận
 * `unsafe use of new value of enum type` — lúc deploy, không phải lúc
 * dev. Cần backfill thì tách thành migration thứ hai.
 *
 * Viết tay chứ không `migration:generate`: generator dựng một type mới
 * rồi `USING` cast cả cột, tức rewrite toàn bảng, và làm mất mệnh đề
 * `AFTER 'active'` khiến `enumsortorder` không còn khớp vòng đời.
 */
export class AddCollectingStatus1789102104624 implements MigrationInterface {
  name = 'AddCollectingStatus1789102104624';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "examcollect"."exam_session_status" ADD VALUE IF NOT EXISTS 'collecting' AFTER 'active'`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session" ADD COLUMN "completed_at" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session" ADD COLUMN "completed_by" uuid
         REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT`,
    );
  }

  public async down(): Promise<void> {
    // Postgres không xoá được một giá trị enum. Một `down()` rỗng sẽ
    // trông như revert thành công trong khi `'collecting'` vẫn còn trong
    // type — ném lỗi là câu trả lời trung thực.
    throw new Error(
      'AddCollectingStatus không revert được: Postgres không hỗ trợ xoá giá trị enum. ' +
        'Muốn lùi thì phải tạo lại type exam_session_status và cast cả bảng — làm tay, có chủ đích.',
    );
  }
}
