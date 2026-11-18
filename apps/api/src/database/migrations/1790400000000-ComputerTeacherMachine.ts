import { MigrationInterface, QueryRunner } from 'typeorm';

export class ComputerTeacherMachine1790400000000 implements MigrationInterface {
  name = 'ComputerTeacherMachine1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."computer"
        ADD COLUMN "is_teacher_machine" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."computer"
        ADD COLUMN "agent_machine_id" character varying(64) NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_computer_room_teacher_machine"
        ON "examcollect"."computer" ("room_id")
        WHERE "is_teacher_machine" = true
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_computer_room_agent_machine_id"
        ON "examcollect"."computer" ("room_id", "agent_machine_id")
        WHERE "agent_machine_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "examcollect"."uq_computer_room_agent_machine_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "examcollect"."uq_computer_room_teacher_machine"`);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."computer" DROP COLUMN IF EXISTS "agent_machine_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."computer" DROP COLUMN IF EXISTS "is_teacher_machine"
    `);
  }
}
