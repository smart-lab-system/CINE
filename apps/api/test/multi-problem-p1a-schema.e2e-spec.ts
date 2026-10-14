import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('P1a — schema chỉ thêm (M1)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => app.close());

  it('bảng exam_problem có đủ cột và khoá duy nhất theo (phiên, thứ tự)', async () => {
    const cols: { column_name: string }[] = await ds.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'examcollect' AND table_name = 'exam_problem'`,
    );
    const names = cols.map((c) => c.column_name);
    expect(names).toEqual(expect.arrayContaining([
      'id', 'exam_session_id', 'ordinal', 'title', 'points_hundredths', 'required_deliverable_id',
      'entry_name', 'language', 'statement', 'statement_quote', 'rubric_id', 'test_bundle_id',
    ]));
    const idx: { indexdef: string }[] = await ds.query(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'examcollect' AND tablename = 'exam_problem' AND indexdef ILIKE '%UNIQUE%'`,
    );
    expect(idx.some((r) => /exam_session_id.*ordinal/.test(r.indexdef))).toBe(true);
  });

  it('problem_id có ở grading_result, grading_test_bundle, grading_reference và đều cho phép rỗng', async () => {
    for (const table of ['grading_result', 'grading_test_bundle', 'grading_reference']) {
      const [col] = await ds.query(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = 'examcollect' AND table_name = $1 AND column_name = 'problem_id'`,
        [table],
      );
      expect(col?.is_nullable).toBe('YES');
    }
  });

  it('grading_reference có ruler_trust (cho phép rỗng) và unique (phiên, câu) mới', async () => {
    const [col] = await ds.query(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'examcollect' AND table_name = 'grading_reference' AND column_name = 'ruler_trust'`,
    );
    expect(col?.is_nullable).toBe('YES');
    const idx: { indexname: string }[] = await ds.query(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'examcollect' AND tablename = 'grading_reference'
          AND indexname = 'uq_grading_reference_session_problem'`,
    );
    expect(idx).toHaveLength(1);
  });
});
