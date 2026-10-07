import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phòng/máy: available→active, retired→inactive (giữ maintenance).
 * Postgres RENAME VALUE — không đụng cột, chỉ đổi nhãn enum.
 */
export class RenameRoomComputerStatus1789510000000 implements MigrationInterface {
  name = 'RenameRoomComputerStatus1789510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "examcollect"."room_status" RENAME VALUE 'available' TO 'active'`,
    );
    await queryRunner.query(
      `ALTER TYPE "examcollect"."room_status" RENAME VALUE 'retired' TO 'inactive'`,
    );
    await queryRunner.query(
      `ALTER TYPE "examcollect"."computer_status" RENAME VALUE 'available' TO 'active'`,
    );
    await queryRunner.query(
      `ALTER TYPE "examcollect"."computer_status" RENAME VALUE 'retired' TO 'inactive'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "examcollect"."room_status" RENAME VALUE 'active' TO 'available'`,
    );
    await queryRunner.query(
      `ALTER TYPE "examcollect"."room_status" RENAME VALUE 'inactive' TO 'retired'`,
    );
    await queryRunner.query(
      `ALTER TYPE "examcollect"."computer_status" RENAME VALUE 'active' TO 'available'`,
    );
    await queryRunner.query(
      `ALTER TYPE "examcollect"."computer_status" RENAME VALUE 'inactive' TO 'retired'`,
    );
  }
}
