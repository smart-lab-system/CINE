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

  it('GET list/chi tiết trả camelCase, không lộ tên cột SQL (case_count, approved_at...)', async () => {
    const owner = await login('c1');
    const session = await seedSession(ds, 'bundle-c1', {
      teacherId: owner.id,
      deliverableType: 'code_project',
      language: 'cpp',
    });

    const created = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.sessionId}/test-bundles`)
      .set(as(owner.token))
      .send({ cases: [{ caseKey: 'ca1', group: 'public', input: '1\n', expectedOutput: '1\n' }] });
    const bundleId = created.body.id as string;

    const list = await request(app.getHttpServer())
      .get(`/exam-sessions/${session.sessionId}/test-bundles`)
      .set(as(owner.token));
    expect(list.status).toBe(200);
    expect(list.body).toEqual([
      { id: bundleId, version: 1, approvedAt: null, origin: 'teacher', caseCount: 1 },
    ]);

    const detail = await request(app.getHttpServer())
      .get(`/exam-sessions/${session.sessionId}/test-bundles/${bundleId}`)
      .set(as(owner.token));
    expect(detail.status).toBe(200);
    expect(detail.body).toEqual({
      id: bundleId,
      version: 1,
      approvedAt: null,
      cases: [
        { caseKey: 'ca1', group: 'public', input: '1\n', expectedOutput: '1\n', constraintQuote: null, autoDroppedReason: null },
      ],
    });
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

  async function makeBundle(token: string, sessionId: string, cases: object[]) {
    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/test-bundles`)
      .set(as(token))
      .send({ cases });
    expect(res.status).toBe(201);
    return res.body as { id: string; version: number };
  }
  const two = [
    { caseKey: 'ca1', group: 'public', input: '1\n', expectedOutput: '1\n', constraintQuote: 'Cho 1 ≤ n ≤ 100' },
    { caseKey: 'ca2', group: 'public', input: '2\n', expectedOutput: '2\n' },
  ];

  it('get trả constraintQuote khi giảng viên đã trích, và null khi không', async () => {
    const owner = await login('d1');
    const session = await seedSession(ds, 'bundle-d1', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    const bundle = await makeBundle(owner.token, session.sessionId, two);

    const res = await request(app.getHttpServer())
      .get(`/exam-sessions/${session.sessionId}/test-bundles/${bundle.id}`)
      .set(as(owner.token));

    expect(res.status).toBe(200);
    expect(res.body.cases.map((c: { caseKey: string; constraintQuote: string | null }) => [c.caseKey, c.constraintQuote])).toEqual([
      ['ca1', 'Cho 1 ≤ n ≤ 100'],
      ['ca2', null],
    ]);
  });

  it('bỏ ca khỏi gói chưa duyệt -> sinh phiên bản mới, đủ ca trừ một, giữ nguyên origin', async () => {
    const owner = await login('d2');
    const session = await seedSession(ds, 'bundle-d2', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    const bundle = await makeBundle(owner.token, session.sessionId, two);

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.sessionId}/test-bundles/${bundle.id}/drop-case`)
      .set(as(owner.token))
      .send({ caseKey: 'ca2' });

    expect(res.status).toBe(201);
    expect(res.body.version).toBe(bundle.version + 1);
    const detail = await request(app.getHttpServer())
      .get(`/exam-sessions/${session.sessionId}/test-bundles/${res.body.id}`)
      .set(as(owner.token));
    expect(detail.body.cases.map((c: { caseKey: string }) => c.caseKey)).toEqual(['ca1']);
    expect(detail.body.approvedAt).toBeNull();
    // Gói cũ còn nguyên: bảng là append-only, "bỏ" là phiên bản mới.
    const list = await request(app.getHttpServer())
      .get(`/exam-sessions/${session.sessionId}/test-bundles`)
      .set(as(owner.token));
    expect(list.body.map((b: { id: string; origin: string }) => [b.id, b.origin]).sort()).toEqual(
      [[bundle.id, 'teacher'], [res.body.id, 'teacher']].sort(),
    );
  });

  // Review Focus #6: duyệt là lúc giảng viên đứng ra bảo lưng nội dung gói.
  it('bỏ ca khỏi gói ĐÃ duyệt -> 409, không sinh phiên bản', async () => {
    const owner = await login('d3');
    const session = await seedSession(ds, 'bundle-d3', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    const bundle = await makeBundle(owner.token, session.sessionId, two);
    await request(app.getHttpServer())
      .post(`/exam-sessions/${session.sessionId}/test-bundles/${bundle.id}/approve`)
      .set(as(owner.token))
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.sessionId}/test-bundles/${bundle.id}/drop-case`)
      .set(as(owner.token))
      .send({ caseKey: 'ca1' });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('đã được duyệt');
    const list = await request(app.getHttpServer())
      .get(`/exam-sessions/${session.sessionId}/test-bundles`)
      .set(as(owner.token));
    expect(list.body).toHaveLength(1);
  });

  it('bỏ một ca không thuộc gói -> 404', async () => {
    const owner = await login('d4');
    const session = await seedSession(ds, 'bundle-d4', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    const bundle = await makeBundle(owner.token, session.sessionId, two);

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.sessionId}/test-bundles/${bundle.id}/drop-case`)
      .set(as(owner.token))
      .send({ caseKey: 'khong_ton_tai' });

    expect(res.status).toBe(404);
    // Phân biệt với "không có route" (cũng 404): câu này chỉ có khi service tìm ca rồi không thấy.
    expect(res.body.message).toContain('khong_ton_tai');
  });

  it('bỏ ca của gói thuộc phiên KHÁC -> 404, và caseKey sai khuôn -> 400', async () => {
    const owner = await login('d5');
    const sessionA = await seedSession(ds, 'bundle-d5a', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    const sessionB = await seedSession(ds, 'bundle-d5b', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp', startHoursAgo: 10 });
    const bundle = await makeBundle(owner.token, sessionA.sessionId, two);

    const other = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionB.sessionId}/test-bundles/${bundle.id}/drop-case`)
      .set(as(owner.token))
      .send({ caseKey: 'ca1' });
    expect(other.status).toBe(404);

    const bad = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionA.sessionId}/test-bundles/${bundle.id}/drop-case`)
      .set(as(owner.token))
      .send({ caseKey: 'có dấu cách' });
    expect(bad.status).toBe(400);
  });

  // Phát hiện ở lượt browser pass: `dropCase` chép các ca nhưng bỏ cột auto_dropped_reason, nên một ca hệ thống đã
  // tự bỏ sống lại thành ca THẬT ở phiên bản mới — và số ca của gói tăng lên sau khi giảng viên bỏ bớt một ca.
  it('bỏ một ca không làm sống lại ca hệ thống đã tự bỏ ở phiên bản mới', async () => {
    const owner = await login('d6');
    const session = await seedSession(ds, 'bundle-d6', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    const [bundle] = await ds.query(
      `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by)
       VALUES ($1, 1, 'teacher', $2) RETURNING id`,
      [session.sessionId, owner.id],
    );
    await ds.query(
      `INSERT INTO examcollect.grading_test_case (bundle_id, case_key, "group", input, expected_output, auto_dropped_reason)
       VALUES ($1, 'k1', 'public', '1', '1', NULL), ($1, 'k2', 'public', '2', '2', NULL),
              ($1, 'tu-bo', 'public', '3', '3', 'đề không ràng buộc n = 3')`,
      [bundle.id],
    );

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.sessionId}/test-bundles/${bundle.id}/drop-case`)
      .set(as(owner.token))
      .send({ caseKey: 'k2' });
    expect(res.status).toBe(201);

    const detail = await request(app.getHttpServer())
      .get(`/exam-sessions/${session.sessionId}/test-bundles/${res.body.id}`)
      .set(as(owner.token));
    expect(detail.body.cases.map((c: { caseKey: string; autoDroppedReason: string | null }) => [c.caseKey, c.autoDroppedReason])).toEqual([
      ['k1', null],
      ['tu-bo', 'đề không ràng buộc n = 3'],
    ]);
    const list = await request(app.getHttpServer())
      .get(`/exam-sessions/${session.sessionId}/test-bundles`)
      .set(as(owner.token));
    const next = list.body.find((b: { id: string }) => b.id === res.body.id);
    expect(next.caseCount).toBe(1);
  });
});
