import { MigrationInterface, QueryRunner } from 'typeorm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export class LabRoomProposals1756600000000 implements MigrationInterface {
  name = 'LabRoomProposals1756600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sql = readFileSync(
      join(__dirname, 'sql', '0004_lab_room_proposals.sql'),
      'utf8',
    );
    await queryRunner.query(sql);
  }

  public async down(): Promise<void> {
    throw new Error(
      'LabRoomProposals is not reversible — restore from a backup instead.',
    );
  }
}
