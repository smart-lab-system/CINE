import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { seedSession, SeedSession } from './helpers/grading-seed';

/**
 * P1b — route cấp phiên (sửa tài liệu chấm MỘT CÂU) bị chặn bằng 409 khi phiên đã nhiều câu hoặc
 * đã xác nhận đề cương (§3.4, §6.3b). Ca một câu chưa xác nhận phải chạy như cũ: đó là Review Focus #1
 * của P1b, vì chặn quá tay sẽ làm hỏng toàn bộ đường một câu đang chạy.
 */
describe('P1b — route cấp phiên bị chặn khi nhiều câu / đã xác nhận đề cương (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();
  const PASSWORD = 'correct-horse-battery';

  interface Owner {
    id: string;
    token: string;
  }

  const CONFIRMED_MESSAGE = 'phiên đã xác nhận đề cương — sửa tài liệu chấm theo từng câu';
  const multiMessage = (n: number) => `phiên này có ${n} câu — sửa tài liệu chấm theo từng câu`;

  async function login(label: string): Promise<Owner> {
    const email = `p1b_guard_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: res.body.accessToken as string };
  }
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function freshSession(label: string): Promise<{ owner: Owner; session: SeedSession }> {
    const owner = await login(label);
    const session = await seedSession(ds, label, { teacherId: owner.id });
    return { owner, session };
  }

  async function countProblems(sessionId: string): Promise<number> {
    const [row] = await ds.query(`SELECT COUNT(*)::int AS n FROM examcollect.exam_problem WHERE exam_session_id = $1`, [
      sessionId,
    ]);
    return row.n as number;
  }

  async function addProblem(sessionId: string, ordinal: number): Promise<void> {
    await ds.query(
      `INSERT INTO examcollect.exam_problem (exam_session_id, ordinal, title, points_hundredths)
       VALUES ($1, $2, $3, 100)`,
      [sessionId, ordinal, `Câu ${ordinal}`],
    );
  }

  function putReference(owner: Owner, sessionId: string) {
    return request(app.getHttpServer())
      .put(`/exam-sessions/${sessionId}/grading-reference`)
      .set(as(owner.token))
      .send({ modelAnswerNote: 'ghi chú kiểm guard' });
  }

  function createBundle(owner: Owner, sessionId: string, caseKeys: string[] = ['ca1']) {
    return request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles`)
      .set(as(owner.token))
      .send({
        cases: caseKeys.map((caseKey) => ({ caseKey, group: 'public', input: '1 2\n', expectedOutput: '3\n' })),
      });
  }

  function approveBundle(owner: Owner, sessionId: string, bundleId: string) {
    return request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles/${bundleId}/approve`)
      .set(as(owner.token));
  }

  function pinBundle(owner: Owner, sessionId: string, bundleId: string) {
    return request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles/${bundleId}/pin`)
      .set(as(owner.token));
  }

  function dropCase(owner: Owner, sessionId: string, bundleId: string, caseKey: string) {
    return request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles/${bundleId}/drop-case`)
      .set(as(owner.token))
      .send({ caseKey });
  }

  function patchRubric(owner: Owner, sessionId: string, rubricId: string) {
    return request(app.getHttpServer())
      .patch(`/exam-sessions/${sessionId}/rubric`)
      .set(as(owner.token))
      .send({ rubricId });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
  });

  afterAll(async () => app.close());

  it('phiên một câu chưa xác nhận: PUT đáp án, tạo, duyệt, ghim gói và đổi rubric vẫn chạy như cũ', async () => {
    const { owner, session } = await freshSession('g1');
    expect(await countProblems(session.sessionId)).toBeLessThanOrEqual(1);

    expect((await putReference(owner, session.sessionId)).status).toBe(200);

    const created = await createBundle(owner, session.sessionId);
    expect(created.status).toBe(201);
    expect((await approveBundle(owner, session.sessionId, created.body.id)).status).toBe(201);
    expect((await pinBundle(owner, session.sessionId, created.body.id)).status).toBe(201);

    expect((await patchRubric(owner, session.sessionId, session.rubricId)).status).toBe(200);
  });

  it('phiên hai câu: PUT đáp án, tạo gói, duyệt, ghim, đổi rubric và bỏ ca đều bị 409 nêu đúng số câu', async () => {
    const { owner, session } = await freshSession('g2');

    // Gói đã duyệt khi phiên còn một câu: đây là gói để thử "ghim" bị chặn sau khi phiên đã nhiều câu.
    const pinned = await createBundle(owner, session.sessionId);
    expect(pinned.status).toBe(201);
    expect((await approveBundle(owner, session.sessionId, pinned.body.id)).status).toBe(201);

    // Gói nháp hai ca: để thử "duyệt" và "bỏ ca" bị chặn.
    const draft = await createBundle(owner, session.sessionId, ['ca1', 'ca2']);
    expect(draft.status).toBe(201);

    await addProblem(session.sessionId, 2);
    const n = await countProblems(session.sessionId);
    expect(n).toBeGreaterThanOrEqual(2);

    const put = await putReference(owner, session.sessionId);
    expect(put.status).toBe(409);
    expect(put.body.message).toBe(multiMessage(n));

    const created = await createBundle(owner, session.sessionId);
    expect(created.status).toBe(409);
    expect(created.body.message).toBe(multiMessage(n));

    const approved = await approveBundle(owner, session.sessionId, draft.body.id);
    expect(approved.status).toBe(409);
    expect(approved.body.message).toBe(multiMessage(n));

    const pin = await pinBundle(owner, session.sessionId, pinned.body.id);
    expect(pin.status).toBe(409);
    expect(pin.body.message).toBe(multiMessage(n));

    const dropped = await dropCase(owner, session.sessionId, draft.body.id, 'ca2');
    expect(dropped.status).toBe(409);
    expect(dropped.body.message).toBe(multiMessage(n));

    const rubric = await patchRubric(owner, session.sessionId, session.rubricId);
    expect(rubric.status).toBe(409);
    expect(rubric.body.message).toBe(multiMessage(n));

    // Lệnh duyệt bị chặn không được để lại dấu vết nào trên gói nháp.
    const [row] = await ds.query(`SELECT approved_at FROM examcollect.grading_test_bundle WHERE id = $1`, [
      draft.body.id,
    ]);
    expect(row.approved_at).toBeNull();
  });

  it('phiên một câu đã xác nhận đề cương: PUT đáp án, tạo gói và đổi rubric bị 409 nêu đúng lý do xác nhận', async () => {
    const { owner, session } = await freshSession('g3');
    await ds.query(
      `UPDATE examcollect.exam_session SET blueprint_confirmed_at = now(), blueprint_confirmed_by = $2 WHERE id = $1`,
      [session.sessionId, owner.id],
    );
    expect(await countProblems(session.sessionId)).toBeLessThanOrEqual(1);

    const put = await putReference(owner, session.sessionId);
    expect(put.status).toBe(409);
    expect(put.body.message).toBe(CONFIRMED_MESSAGE);

    const created = await createBundle(owner, session.sessionId);
    expect(created.status).toBe(409);
    expect(created.body.message).toBe(CONFIRMED_MESSAGE);

    const rubric = await patchRubric(owner, session.sessionId, session.rubricId);
    expect(rubric.status).toBe(409);
    expect(rubric.body.message).toBe(CONFIRMED_MESSAGE);
  });
});
