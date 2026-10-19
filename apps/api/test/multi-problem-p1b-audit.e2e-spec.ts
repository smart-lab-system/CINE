import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { auditBucketByStudent } from '../src/grading/audit-sampling';
import { ScoreService } from '../src/grading/scoring/score.service';
import { ensureDefaultProblem } from '../src/grading/problem/resolve-problem-config';
import { createTestAccount } from './helpers/create-account';
import { seedSession, SeedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

/**
 * P1b Task 10 — rút mẫu kiểm theo sinh viên. Một sinh viên được rút thì MỌI câu tự duyệt của em đều vào kiểm mẫu;
 * một sinh viên không được rút thì mọi câu của em đều tự duyệt. Không bao giờ tách đôi.
 *
 * Tỉ lệ 50 % được đặt qua biến môi trường, và hai MSSV được chọn bằng đúng hàm băm của hệ thống, nên kết quả
 * tất định theo seed của phiên.
 */
describe('P1b — rút mẫu kiểm theo sinh viên (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();
  const PASSWORD = 'correct-horse-battery';
  const SEEN = [
    { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
    { ruleKey: 'ten_bien', checkedBy: 'model' as const },
  ];

  beforeAll(async () => {
    process.env.GRADING_AUDIT_SAMPLE_PERCENT = '50';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
  }, 60_000);
  afterAll(async () => {
    delete process.env.GRADING_AUDIT_SAMPLE_PERCENT;
    await app.close();
  });

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `p1b_audit_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: res.body.accessToken as string };
  }

  /** Hai câu của một sinh viên: mỗi câu một bài tự quyết trên yêu cầu nộp riêng. Trả hai id kết quả. */
  async function twoQuestions(ctx: SeedSession, mssv: string, p2: string, d2: string): Promise<string[]> {
    const ids: string[] = [];
    for (const [problemId, deliverableId] of [
      [await ensureDefaultProblem(ds.manager, ctx.sessionId), ctx.deliverableId],
      [p2, d2],
    ] as const) {
      const seeded = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
      const [g] = await ds.query(`SELECT submission_id FROM examcollect.grading_result WHERE id = $1`, [seeded.resultId]);
      await ds.query(`UPDATE examcollect.submission SET student_mssv = $2, required_deliverable_id = $3 WHERE id = $1`, [
        g.submission_id,
        mssv,
        deliverableId,
      ]);
      await ds.query(`UPDATE examcollect.grading_result SET problem_id = $2 WHERE id = $1`, [seeded.resultId, problemId]);
      ids.push(seeded.resultId);
    }
    return ids;
  }

  it('sinh viên được rút: cả hai câu vào kiểm mẫu; sinh viên không được rút: cả hai câu tự duyệt', async () => {
    const owner = await login('draw');
    const ctx = await seedSession(ds, 'audit-draw', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    await seedInvestigatorSession(ds, ctx);
    const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });

    // Câu 2: yêu cầu nộp riêng và bản ghi problem riêng (uq_submission_identity: một bài cho một sinh viên trên một yêu cầu).
    const [d2] = await ds.query(
      `INSERT INTO examcollect.required_deliverable (exam_session_id, required_filename, deliverable_type, language)
       VALUES ($1, 'Cau2.docx', 'code_project', 'cpp') RETURNING id`,
      [ctx.sessionId],
    );
    const [p2] = await ds.query(
      `INSERT INTO examcollect.exam_problem (exam_session_id, ordinal, title, points_hundredths, required_deliverable_id)
       VALUES ($1, 2, 'Câu 2', 500, $2) RETURNING id`,
      [ctx.sessionId, d2.id],
    );

    // Chọn bốn MSSV được rút và bốn MSSV không, bằng đúng hàm băm. Bốn-bốn chứ không phải một-một: với một cặp,
    // cách băm theo id bài vẫn cho ra đúng kết quả mong đợi khoảng một lần trong bốn (đã đo: test cũ xanh cả với đột biến).
    const [{ grading_seed: seed }] = await ds.query(`SELECT grading_seed FROM examcollect.exam_session WHERE id = $1`, [
      ctx.sessionId,
    ]);
    const candidates = Array.from({ length: 200 }, (_, i) => `AUD${String(i).padStart(4, '0')}`);
    const drawnMssvs = candidates.filter((m) => auditBucketByStudent(seed as string, m) < 5000).slice(0, 4);
    const keptMssvs = candidates.filter((m) => auditBucketByStudent(seed as string, m) >= 5000).slice(0, 4);
    expect(drawnMssvs).toHaveLength(4);
    expect(keptMssvs).toHaveLength(4);

    const drawnPairs: string[][] = [];
    for (const m of drawnMssvs) drawnPairs.push(await twoQuestions(ctx, m, p2.id as string, d2.id as string));
    const keptPairs: string[][] = [];
    for (const m of keptMssvs) keptPairs.push(await twoQuestions(ctx, m, p2.id as string, d2.id as string));
    for (const id of [...drawnPairs.flat(), ...keptPairs.flat()]) {
      await app.get(ScoreService).computeInitial(id);
    }

    const statusOf = async (id: string): Promise<string> =>
      (await ds.query(`SELECT status FROM examcollect.grading_result WHERE id = $1`, [id]))[0].status as string;

    for (const pair of drawnPairs) {
      expect(await Promise.all(pair.map(statusOf))).toEqual(['audit_pending', 'audit_pending']);
    }
    for (const pair of keptPairs) {
      expect(await Promise.all(pair.map(statusOf))).toEqual(['auto_approved', 'auto_approved']);
    }
  });
});
