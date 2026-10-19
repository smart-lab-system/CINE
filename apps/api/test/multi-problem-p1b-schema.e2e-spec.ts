import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ProblemBlueprint1789620000000 } from '../src/database/migrations/1789620000000-ProblemBlueprint';
import { seedSession, SeedSession } from './helpers/grading-seed';

describe('P1b — schema M3 (xác nhận đề cương và FK ghép gói test)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => app.close());

  async function bundleOf(ctx: SeedSession): Promise<string> {
    const [b] = await ds.query(
      `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by)
       VALUES ($1, 1, 'teacher', $2) RETURNING id`,
      [ctx.sessionId, ctx.teacherId],
    );
    return b.id as string;
  }

  it('exam_session có blueprint_confirmed_at và blueprint_confirmed_by, đều cho phép rỗng', async () => {
    const cols: { column_name: string; is_nullable: string }[] = await ds.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'examcollect' AND table_name = 'exam_session'
          AND column_name IN ('blueprint_confirmed_at', 'blueprint_confirmed_by')`,
    );
    expect(cols.map((c) => c.column_name).sort()).toEqual(['blueprint_confirmed_at', 'blueprint_confirmed_by']);
    expect(cols.every((c) => c.is_nullable === 'YES')).toBe(true);
  });

  it('exam_problem không nhận gói test của phiên khác (FK ghép theo phiên)', async () => {
    const a = await seedSession(ds, 'p1b-fk-a');
    const b = await seedSession(ds, 'p1b-fk-b');
    const bundleOfA = await bundleOf(a);
    await expect(
      ds.query(
        `INSERT INTO examcollect.exam_problem (exam_session_id, ordinal, title, points_hundredths, test_bundle_id)
         VALUES ($1, 2, 'Câu 2', 100, $2)`,
        [b.sessionId, bundleOfA],
      ),
    ).rejects.toThrow(/foreign key|fk_exam_problem/i);
  });

  it('exam_problem nhận gói test của chính phiên đó', async () => {
    const a = await seedSession(ds, 'p1b-fk-same');
    const bundleOfA = await bundleOf(a);
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await expect(
        qr.query(
          `INSERT INTO examcollect.exam_problem (exam_session_id, ordinal, title, points_hundredths, test_bundle_id)
           VALUES ($1, 3, 'Câu 3', 100, $2)`,
          [a.sessionId, bundleOfA],
        ),
      ).resolves.toBeDefined();
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
    }
  });

  it('down() gỡ đúng cột và FK của M3; up() đặt lại; chạy trong transaction và rollback', async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const migration = new ProblemBlueprint1789620000000();
      await migration.down(qr);
      const afterDown: { column_name: string }[] = await qr.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'examcollect' AND table_name = 'exam_session' AND column_name LIKE 'blueprint_confirmed_%'`,
      );
      expect(afterDown).toHaveLength(0);
      await migration.up(qr);
      const afterUp: { column_name: string }[] = await qr.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'examcollect' AND table_name = 'exam_session' AND column_name LIKE 'blueprint_confirmed_%'`,
      );
      expect(afterUp).toHaveLength(2);
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
    }
  });
});
