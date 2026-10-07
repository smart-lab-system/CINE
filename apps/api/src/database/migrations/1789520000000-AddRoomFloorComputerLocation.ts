import { MigrationInterface, QueryRunner } from 'typeorm';

/** Phòng: tầng (sau building). Máy: vị trí (sau hostname). */
export class AddRoomFloorComputerLocation1789520000000
  implements MigrationInterface
{
  name = 'AddRoomFloorComputerLocation1789520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."room"
        ADD COLUMN "floor" character varying(50)
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."computer"
        ADD COLUMN "location" character varying(100) NOT NULL DEFAULT ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."computer" DROP COLUMN "location"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."room" DROP COLUMN "floor"
    `);
  }
}
