import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Field máy đề xuất parity với `computer` — spec §5.1 / §7.4.
 */
export class LabRoomProposalMachineComputerFields1789660000000
  implements MigrationInterface
{
  name = 'LabRoomProposalMachineComputerFields1789660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."lab_room_proposal_machine"
        ADD COLUMN "cpu" character varying(200) NOT NULL DEFAULT 'Chưa cập nhật',
        ADD COLUMN "ram_gb" integer NOT NULL DEFAULT 16,
        ADD COLUMN "storage" character varying(200) NOT NULL DEFAULT 'Chưa cập nhật',
        ADD COLUMN "gpu" character varying(200),
        ADD COLUMN "mac_address" character varying(17) NOT NULL DEFAULT '',
        ADD COLUMN "status" "examcollect"."computer_status" NOT NULL DEFAULT 'active'
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."lab_room_proposal_machine"
        ALTER COLUMN "cpu" DROP DEFAULT,
        ALTER COLUMN "ram_gb" DROP DEFAULT,
        ALTER COLUMN "storage" DROP DEFAULT,
        ALTER COLUMN "mac_address" DROP DEFAULT
    `);

    await queryRunner.query(`
      UPDATE "examcollect"."lab_room_proposal_machine"
      SET "os" = 'Chưa cập nhật'
      WHERE "os" IS NULL OR TRIM("os") = ''
    `);

    await queryRunner.query(`
      UPDATE "examcollect"."lab_room_proposal_machine"
      SET "local_ip" = ''
      WHERE "local_ip" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."lab_room_proposal_machine"
        ALTER COLUMN "os" SET NOT NULL,
        ALTER COLUMN "local_ip" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."lab_room_proposal_machine"
        ADD CONSTRAINT "ck_lab_room_proposal_machine_ram_gb" CHECK ("ram_gb" > 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."lab_room_proposal_machine"
        DROP CONSTRAINT IF EXISTS "ck_lab_room_proposal_machine_ram_gb"
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."lab_room_proposal_machine"
        ALTER COLUMN "os" DROP NOT NULL,
        ALTER COLUMN "local_ip" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."lab_room_proposal_machine"
        DROP COLUMN IF EXISTS "status",
        DROP COLUMN IF EXISTS "mac_address",
        DROP COLUMN IF EXISTS "gpu",
        DROP COLUMN IF EXISTS "storage",
        DROP COLUMN IF EXISTS "ram_gb",
        DROP COLUMN IF EXISTS "cpu"
    `);
  }
}
