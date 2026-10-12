import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gắn lớp học phần (`class`) với lớp danh nghĩa catalog (`nominal_class`).
 * Nullable — lớp legacy / chưa chọn vẫn hợp lệ.
 */
export class AddClassNominalClass1789560000000 implements MigrationInterface {
  name = 'AddClassNominalClass1789560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."class"
        ADD COLUMN "nominal_class_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."class"
        ADD CONSTRAINT "fk_class_nominal_class"
          FOREIGN KEY ("nominal_class_id")
          REFERENCES "examcollect"."nominal_class"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_class_nominal_class_id"
        ON "examcollect"."class" ("nominal_class_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "examcollect"."idx_class_nominal_class_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."class"
        DROP CONSTRAINT IF EXISTS "fk_class_nominal_class"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."class"
        DROP COLUMN IF EXISTS "nominal_class_id"
    `);
  }
}
