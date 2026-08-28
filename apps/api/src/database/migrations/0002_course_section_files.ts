import { MigrationInterface, QueryRunner } from 'typeorm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export class CourseSectionFiles1756400000000 implements MigrationInterface {
  name = 'CourseSectionFiles1756400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sql = readFileSync(
      join(__dirname, 'sql', '0002_course_section_files.sql'),
      'utf8',
    );
    await queryRunner.query(sql);
  }

  public async down(): Promise<void> {
    throw new Error(
      'CourseSectionFiles is not reversible — restore from a backup instead.',
    );
  }
}
