import { MigrationInterface, QueryRunner } from 'typeorm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export class ExamEventRosters1756500000000 implements MigrationInterface {
  name = 'ExamEventRosters1756500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sql = readFileSync(
      join(__dirname, 'sql', '0003_exam_event_rosters.sql'),
      'utf8',
    );
    await queryRunner.query(sql);
  }

  public async down(): Promise<void> {
    throw new Error(
      'ExamEventRosters is not reversible — restore from a backup instead.',
    );
  }
}
