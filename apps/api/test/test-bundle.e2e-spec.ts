import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { seedSession } from './helpers/grading-seed';

/** Tạo, duyệt, ghim gói test của một phiên (§14.1, 3d2). */
describe('Test bundle — tạo, duyệt, ghim (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `bundle_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    return { id, token: res.body.accessToken as string };
  }
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
  });

  afterAll(async () => app.close());

  it('tạo gói (nháp) → ghim TRƯỚC khi duyệt bị chặn → duyệt → duyệt lại bị chặn → ghim → session.test_bundle_id đúng gói', async () => {
    const owner = await login('a1');
    const session = await seedSession(ds, 'bundle-a1', {
      teacherId: owner.id,
      deliverableType: 'code_project',
      language: 'cpp',
    });

    const created = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.sessionId}/test-bundles`)
      .set(as(owner.token))
      .send({ cases: [{ caseKey: 'ca1', group: 'public', input: '1 2\n', expectedOutput: '3\n' }] });
    expect(created.status).toBe(201);
    expect(created.body.version).toBe(1);
    const bundleId = created.body.id as string;

    // Review Focus #2 — ghim gói CHƯA duyệt phải bị chặn.
    const pinBeforeApprove = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.sessionId}/test-bundles/${bundleId}/pin`)
      .set(as(owner.token));
    expect(pinBeforeApprove.status).toBe(400);

    const approved = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.sessionId}/test-bundles/${bundleId}/approve`)
      .set(as(owner.token));
    expect(approved.status).toBe(201);

    // Review Focus #1 — duyệt lần hai phải là 409 từ service, không phải 500 từ trigger DB.
    const approveTwice = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.sessionId}/test-bundles/${bundleId}/approve`)
      .set(as(owner.token));
    expect(approveTwice.status).toBe(409);

    const pinned = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.sessionId}/test-bundles/${bundleId}/pin`)
      .set(as(owner.token));
    expect(pinned.status).toBe(201);

    const [row] = await ds.query(`SELECT test_bundle_id FROM examcollect.exam_session WHERE id = $1`, [
      session.sessionId,
    ]);
    expect(row.test_bundle_id).toBe(bundleId);

    // Route đọc phiên phải lộ ra cột này — UI (thẻ "Gói test") đọc từ đây,
    // không tự query DB.
    const detail = await request(app.getHttpServer())
      .get(`/exam-sessions/${session.sessionId}`)
      .set(as(owner.token));
    expect(detail.body.testBundleId).toBe(bundleId);
  });

  it('ghim gói thuộc phiên KHÁC → 404 (Review Focus #3)', async () => {
    const owner = await login('a2');
    const sessionA = await seedSession(ds, 'bundle-a2a', {
      teacherId: owner.id,
      deliverableType: 'code_project',
      language: 'cpp',
    });
    const sessionB = await seedSession(ds, 'bundle-a2b', {
      teacherId: owner.id,
      deliverableType: 'code_project',
      language: 'cpp',
      startHoursAgo: 10,
    });

    const created = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionA.sessionId}/test-bundles`)
      .set(as(owner.token))
      .send({ cases: [{ caseKey: 'ca1', group: 'public', input: '1\n', expectedOutput: '1\n' }] });
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionA.sessionId}/test-bundles/${created.body.id}/approve`)
      .set(as(owner.token));

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionB.sessionId}/test-bundles/${created.body.id}/pin`)
      .set(as(owner.token));
    expect(res.status).toBe(404);
  });

  it('một giảng viên khác không sở hữu phiên không tạo/duyệt/ghim được gói của nó (403)', async () => {
    const owner = await login('a3');
    const stranger = await login('a3-stranger');
    const session = await seedSession(ds, 'bundle-a3', {
      teacherId: owner.id,
      deliverableType: 'code_project',
      language: 'cpp',
    });

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.sessionId}/test-bundles`)
      .set(as(stranger.token))
      .send({ cases: [{ caseKey: 'ca1', group: 'public', input: '1\n', expectedOutput: '1\n' }] });
    expect(res.status).toBe(403);
  });

  it('caseKey trùng trong một lượt tạo → 409 (unique constraint của DB)', async () => {
    const owner = await login('a4');
    const session = await seedSession(ds, 'bundle-a4', {
      teacherId: owner.id,
      deliverableType: 'code_project',
      language: 'cpp',
    });

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.sessionId}/test-bundles`)
      .set(as(owner.token))
      .send({
        cases: [
          { caseKey: 'ca1', group: 'public', input: '1\n', expectedOutput: '1\n' },
          { caseKey: 'ca1', group: 'public', input: '2\n', expectedOutput: '2\n' },
        ],
      });
    expect(res.status).toBe(409);
  });
});
