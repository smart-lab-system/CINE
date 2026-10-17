import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  ensureDefaultProblem,
  resolveProblemConfig,
  setSessionRubricAndProblem,
  setSessionTestBundleAndProblem,
} from '../src/grading/problem/resolve-problem-config';
import { seedCriterion, seedSession, SeedSession } from './helpers/grading-seed';

async function seedBundle(ds: DataSource, ctx: SeedSession): Promise<string> {
  const [bundle] = await ds.query(
    `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by)
     VALUES ($1, 1, 'teacher', $2) RETURNING id`,
    [ctx.sessionId, ctx.teacherId],
  );
  return bundle.id;
}

describe('P1a — resolveProblemConfig và ghi kép (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => app.close());

  it('phiên có cấu hình: trả rubric, giảng viên và điểm của câu 1', async () => {
    const ctx = await seedSession(ds, 'rs-config');
    await seedCriterion(ds, ctx.rubricId, 'dung_dan', 6);
    await seedCriterion(ds, ctx.rubricId, 'trinh_bay', 4);
    await ds.transaction((m) => ensureDefaultProblem(m, ctx.sessionId));

    const cfg = await ds.transaction((m) => resolveProblemConfig(m, ctx.sessionId));

    expect(cfg).toMatchObject({
      ordinal: 1,
      teacherId: ctx.teacherId,
      rubricId: ctx.rubricId,
      testBundleId: null,
      pointsHundredths: 1000,
    });
  });

  it('phiên chưa cấu hình gì: không ném, trả câu với rubric rỗng và điểm 0', async () => {
    const ctx = await seedSession(ds, 'rs-empty');
    await ds.query(`UPDATE examcollect.exam_session SET rubric_id = NULL WHERE id = $1`, [ctx.sessionId]);
    await ds.transaction((m) => ensureDefaultProblem(m, ctx.sessionId));

    const cfg = await ds.transaction((m) => resolveProblemConfig(m, ctx.sessionId));

    expect(cfg).toMatchObject({ rubricId: null, testBundleId: null, pointsHundredths: 0 });
  });

  it('phiên không tồn tại → null', async () => {
    const cfg = await ds.transaction((m) =>
      resolveProblemConfig(m, '00000000-0000-4000-8000-000000000000'),
    );
    expect(cfg).toBeNull();
  });

  it('ensureDefaultProblem: gọi lần hai trả cùng id và không tạo thêm câu', async () => {
    const ctx = await seedSession(ds, 'rs-idem');
    const first = await ds.transaction((m) => ensureDefaultProblem(m, ctx.sessionId));
    const second = await ds.transaction((m) => ensureDefaultProblem(m, ctx.sessionId));
    expect(second).toBe(first);
    const [{ n }] = await ds.query(
      `SELECT count(*)::int AS n FROM examcollect.exam_problem WHERE exam_session_id = $1`,
      [ctx.sessionId],
    );
    expect(n).toBe(1);
  });

  it('ghi kép rubric: phiên và câu 1 cùng trỏ rubric mới, điểm câu = tổng tiêu chí × 100', async () => {
    const ctx = await seedSession(ds, 'rs-dual-rubric');
    const [rubric2] = await ds.query(
      `INSERT INTO examcollect.rubric (version, teacher_id, name) VALUES (1, $1, $2) RETURNING id`,
      [ctx.teacherId, `Rubric ghi kép ${ctx.sessionId}`],
    );
    await seedCriterion(ds, rubric2.id, 'a', 3);
    await seedCriterion(ds, rubric2.id, 'b', 2);

    await ds.transaction((m) => setSessionRubricAndProblem(m, ctx.sessionId, rubric2.id));

    const [session] = await ds.query(`SELECT rubric_id FROM examcollect.exam_session WHERE id = $1`, [ctx.sessionId]);
    const [problem] = await ds.query(
      `SELECT rubric_id, points_hundredths FROM examcollect.exam_problem WHERE exam_session_id = $1 AND ordinal = 1`,
      [ctx.sessionId],
    );
    expect(session.rubric_id).toBe(rubric2.id);
    expect(problem).toEqual({ rubric_id: rubric2.id, points_hundredths: 500 });
  });

  it('ghi kép gói test: phiên và câu 1 cùng trỏ gói test đã gắn', async () => {
    const ctx = await seedSession(ds, 'rs-dual-bundle');
    const bundleId = await seedBundle(ds, ctx);

    await ds.transaction((m) => setSessionTestBundleAndProblem(m, ctx.sessionId, bundleId));

    const [session] = await ds.query(`SELECT test_bundle_id FROM examcollect.exam_session WHERE id = $1`, [ctx.sessionId]);
    const [problem] = await ds.query(
      `SELECT test_bundle_id FROM examcollect.exam_problem WHERE exam_session_id = $1 AND ordinal = 1`,
      [ctx.sessionId],
    );
    expect(session.test_bundle_id).toBe(bundleId);
    expect(problem.test_bundle_id).toBe(bundleId);
  });
});
