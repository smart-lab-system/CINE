import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ExamSessionEntity } from '../src/exam-session/entities/exam-session.entity';
import { ensureDefaultProblem } from '../src/grading/problem/resolve-problem-config';
import { GradingReferenceService } from '../src/grading/grading-reference.service';
import { TestBundleService } from '../src/grading/test-bundle/test-bundle.service';
import { seedSession, SeedSession } from './helpers/grading-seed';

/**
 * P1a — các chỗ GHI tham chiếu và gói test phải gắn vào câu mặc định (problem_id, ruler_trust).
 * Đọc qua resolver không đổi hành vi, nên test đọc chỉ là chốt hồi quy; test ghi là cái đỏ trước khi sửa.
 */
describe('P1a — ghi tham chiếu và gói test gắn vào câu mặc định (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let references: GradingReferenceService;
  let bundles: TestBundleService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    references = app.get(GradingReferenceService);
    bundles = app.get(TestBundleService);
  });
  afterAll(async () => app.close());

  const asEntity = (ctx: SeedSession) => ({ id: ctx.sessionId }) as ExamSessionEntity;

  it('upsert đáp án do giảng viên gửi: gắn vào câu 1 và ruler_trust = teacher', async () => {
    const ctx = await seedSession(ds, 'w-ref-teacher');

    await references.upsert(asEntity(ctx), { modelAnswerNote: 'Đáp án mẫu của thầy' }, ctx.teacherId);

    const [row] = await ds.query(
      `SELECT r.ruler_trust, p.ordinal
         FROM examcollect.grading_reference r
         JOIN examcollect.exam_problem p ON p.id = r.problem_id
        WHERE r.exam_session_id = $1`,
      [ctx.sessionId],
    );
    expect(row).toEqual({ ruler_trust: 'teacher', ordinal: 1 });
  });

  it('upsert đáp án chưa kiểm chứng: ruler_trust = unverified', async () => {
    const ctx = await seedSession(ds, 'w-ref-unverified');

    await references.upsert(
      asEntity(ctx),
      { modelAnswerNote: 'Đáp án AI viết, chưa kiểm', modelAnswerUnverified: true },
      ctx.teacherId,
    );

    const [row] = await ds.query(
      `SELECT ruler_trust FROM examcollect.grading_reference WHERE exam_session_id = $1`,
      [ctx.sessionId],
    );
    expect(row.ruler_trust).toBe('unverified');
  });

  it('loadForGrading đọc tham chiếu của câu mặc định', async () => {
    const ctx = await seedSession(ds, 'w-ref-load');
    await references.upsert(asEntity(ctx), { modelAnswerNote: 'Đáp án để nạp' }, ctx.teacherId);

    const loaded = await references.loadForGrading(ctx.sessionId);

    expect(loaded.note).toBe('Đáp án để nạp');
  });

  it('loadForGrading đọc tham chiếu có problem_id rỗng (ghi thẳng SQL, không qua upsert)', async () => {
    const ctx = await seedSession(ds, 'w-ref-null-problem');
    await ds.query(
      `INSERT INTO examcollect.grading_reference (exam_session_id, model_answer_note, created_by) VALUES ($1, $2, $3)`,
      [ctx.sessionId, 'Đáp án ghi thẳng', ctx.teacherId],
    );
    await ds.transaction((m) => ensureDefaultProblem(m, ctx.sessionId));

    const loaded = await references.loadForGrading(ctx.sessionId);

    expect(loaded.note).toBe('Đáp án ghi thẳng');
  });

  it('create: gói tạo tay gắn vào câu 1', async () => {
    const ctx = await seedSession(ds, 'w-bundle-create');

    const bundle = await bundles.create(ctx.sessionId, ctx.teacherId, {
      cases: [{ caseKey: 'ca_1', group: 'nhom_1', input: '1 2', expectedOutput: '3' }],
    });

    const [row] = await ds.query(
      `SELECT p.ordinal
         FROM examcollect.grading_test_bundle b
         JOIN examcollect.exam_problem p ON p.id = b.problem_id
        WHERE b.id = $1`,
      [bundle.id],
    );
    expect(row).toEqual({ ordinal: 1 });
  });
});
