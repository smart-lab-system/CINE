import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { ensureDefaultProblem } from '../src/grading/problem/resolve-problem-config';
import { createTestAccount } from './helpers/create-account';
import { seedCriterion, seedSession, SeedSession } from './helpers/grading-seed';

/**
 * P1b Task 4 — thêm và bỏ câu thủ công, xác nhận đề cương (§10.3 mục (b)).
 *
 * Mọi ghi xin khoá giảng viên trước hàng phiên. Thêm hoặc bỏ câu sau khi đã xác nhận đề cương bị 409, vì xác
 * nhận là lúc giảng viên chốt danh sách câu. Quyền sở hữu theo quy ước `findOwnedBy` của mọi route phiên: người
 * khác nhận 403, không phải 404.
 */
describe('P1b — thêm, bỏ câu thủ công và xác nhận đề cương (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();
  const PASSWORD = 'correct-horse-battery';

  interface Owner {
    id: string;
    token: string;
  }

  async function login(label: string): Promise<Owner> {
    const email = `p1b_manual_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: res.body.accessToken as string };
  }
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Phiên cpp với rubric tổng 5 điểm, và câu 1 mặc định đã có sẵn (như sau khi gắn đề hoặc ghi đáp án). */
  async function freshSession(label: string): Promise<{ owner: Owner; session: SeedSession }> {
    const owner = await login(label);
    const session = await seedSession(ds, label, { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    await seedCriterion(ds, session.rubricId, 'tieu_chi_1', 5);
    await ensureDefaultProblem(ds.manager, session.sessionId);
    return { owner, session };
  }

  function addProblem(owner: Owner, sessionId: string, session: SeedSession, overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/problems`)
      .set(as(owner.token))
      .send({
        title: 'Câu thêm tay',
        pointsHundredths: 500,
        requiredDeliverableId: session.deliverableId,
        rubricId: session.rubricId,
        language: 'cpp',
        ...overrides,
      });
  }

  function removeProblem(owner: Owner, sessionId: string, problemId: string) {
    return request(app.getHttpServer())
      .delete(`/exam-sessions/${sessionId}/problems/${problemId}`)
      .set(as(owner.token));
  }

  function confirmBlueprint(owner: Owner, sessionId: string) {
    return request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/blueprint/confirm`)
      .set(as(owner.token));
  }

  function putReference(owner: Owner, sessionId: string) {
    return request(app.getHttpServer())
      .put(`/exam-sessions/${sessionId}/grading-reference`)
      .set(as(owner.token))
      .send({ modelAnswerNote: 'ghi chú manual' });
  }

  async function problemIdOf(sessionId: string, ordinal: number): Promise<string> {
    const [row] = await ds.query(
      `SELECT id FROM examcollect.exam_problem WHERE exam_session_id = $1 AND ordinal = $2`,
      [sessionId, ordinal],
    );
    return row.id as string;
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

  it('thêm câu 2 → 201 với ordinal 2; sau đó đường một câu cũ (PUT đáp án) bị 409 vì phiên đã nhiều câu', async () => {
    const { owner, session } = await freshSession('m1');

    const added = await addProblem(owner, session.sessionId, session);
    expect(added.status).toBe(201);
    expect(added.body.ordinal).toBe(2);
    expect(typeof added.body.problemId).toBe('string');

    const put = await putReference(owner, session.sessionId);
    expect(put.status).toBe(409);
    expect(put.body.message).toMatch(/phiên này có 2 câu/);
  });

  it('bỏ câu chưa có gì → 200; bỏ câu 1 → 409; bỏ câu đã có gói test → 409', async () => {
    const { owner, session } = await freshSession('m2');

    const second = await addProblem(owner, session.sessionId, session);
    const third = await addProblem(owner, session.sessionId, session, { title: 'Câu sẽ có gói' });
    expect(second.status).toBe(201);
    expect(third.status).toBe(201);

    expect((await removeProblem(owner, session.sessionId, second.body.problemId)).status).toBe(200);

    const first = await problemIdOf(session.sessionId, 1);
    const cannotDropFirst = await removeProblem(owner, session.sessionId, first);
    expect(cannotDropFirst.status).toBe(409);
    expect(cannotDropFirst.body.message).toMatch(/Câu 1/);

    // Gói test là bản ghi chỉ-thêm và FK RESTRICT: câu đã có gói thì không bỏ được.
    await ds.query(
      `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by, problem_id)
       VALUES ($1, 1, 'teacher', $2, $3)`,
      [session.sessionId, owner.id, third.body.problemId],
    );
    const blocked = await removeProblem(owner, session.sessionId, third.body.problemId);
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/gói test/);
  });

  it('xác nhận đề cương: phiên một câu rỗng → 400; có đáp án → 200; xác nhận lại → 200 và giữ nguyên thời điểm', async () => {
    const { owner, session } = await freshSession('m3');

    const empty = await confirmBlueprint(owner, session.sessionId);
    expect(empty.status).toBe(400);

    expect((await putReference(owner, session.sessionId)).status).toBe(200);

    const first = await confirmBlueprint(owner, session.sessionId);
    expect(first.status).toBe(200);
    const [row1] = await ds.query(`SELECT blueprint_confirmed_at FROM examcollect.exam_session WHERE id = $1`, [
      session.sessionId,
    ]);
    expect(row1.blueprint_confirmed_at).not.toBeNull();

    const again = await confirmBlueprint(owner, session.sessionId);
    expect(again.status).toBe(200);
    const [row2] = await ds.query(`SELECT blueprint_confirmed_at FROM examcollect.exam_session WHERE id = $1`, [
      session.sessionId,
    ]);
    expect(new Date(row2.blueprint_confirmed_at).getTime()).toBe(new Date(row1.blueprint_confirmed_at).getTime());

    // Sau khi xác nhận: thêm, bỏ câu và route cũ đều bị chặn.
    const addAfter = await addProblem(owner, session.sessionId, session);
    expect(addAfter.status).toBe(409);
    expect(addAfter.body.message).toMatch(/xác nhận đề cương/);
    expect((await putReference(owner, session.sessionId)).status).toBe(409);
  });

  it('người không phải chủ phiên: thêm, bỏ, xác nhận đều 403 (quy ước findOwnedBy)', async () => {
    const { session } = await freshSession('m4');
    const intruder = await login('m4-intruder');

    expect((await addProblem(intruder, session.sessionId, session)).status).toBe(403);
    expect((await confirmBlueprint(intruder, session.sessionId)).status).toBe(403);
    const firstId = await problemIdOf(session.sessionId, 1);
    expect((await removeProblem(intruder, session.sessionId, firstId)).status).toBe(403);
  });

  it('điểm câu thêm khác tổng tiêu chí của rubric phiên (D1) → 400, và không có dòng nào được tạo', async () => {
    const { owner, session } = await freshSession('m5');

    const res = await addProblem(owner, session.sessionId, session, { pointsHundredths: 300 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/tổng tiêu chí/);

    const rows = await ds.query(`SELECT ordinal FROM examcollect.exam_problem WHERE exam_session_id = $1`, [
      session.sessionId,
    ]);
    expect(rows).toHaveLength(1);
  });
});
