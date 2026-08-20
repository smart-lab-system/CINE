import { MigrationInterface, QueryRunner } from 'typeorm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export class InitialSchema1755600000000 implements MigrationInterface {
  name = 'InitialSchema1755600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sql = readFileSync(
      join(__dirname, 'sql', '0001_initial_schema.sql'),
      'utf8',
    );
    await queryRunner.query(sql);
  }

  public async down(): Promise<void> {
    throw new Error(
      'InitialSchema is not reversible — restore from a backup or drop the database instead.',
    );
  }
}
