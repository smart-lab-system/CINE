import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { seedCriterion, seedSession } from './helpers/grading-seed';
import { rubricNameOf } from './helpers/investigator-seed';

describe('Route lỗi theo rubric (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();
  let idA: string;
  let tokenA: string;
  let tokenB: string;
  let nameA: string;
  let nameB: string;

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `rbe_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    return { id, token: res.body.accessToken as string };
  }
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    const a = await login('a');
    idA = a.id;
    tokenA = a.token;
    tokenB = (await login('b')).token;
    for (const label of ['x', 'y']) {
      const ctx = await seedSession(ds, `rbe-${label}`, { teacherId: idA, startHoursAgo: label === 'x' ? 20 : 40 });
      await seedCriterion(ds, ctx.rubricId, 'tinh_dung', 6);
      await seedCriterion(ds, ctx.rubricId, 'trinh_bay', 4);
      if (label === 'x') nameA = await rubricNameOf(ds, ctx.rubricId);
      else nameB = await rubricNameOf(ds, ctx.rubricId);
    }
  }, 60_000);
  afterAll(async () => app.close());

  it('thêm lỗi mới → 201; GET theo rubric thấy nó; trùng → 409; không token → 401; rubric lạ → 404; tiêu chí lạ → 400', async () => {
    const body = {
      rubricName: nameA,
      criterionKey: 'tinh_dung',
      deduction: '1.50',
      newRule: {
        name: 'Sai ca biên',
        description: 'Nhóm biên không đạt',
        predicate: { kind: 'test_group_failed', group: 'bien' },
      },
    };
    const created = await http().post('/rubric-errors').set(as(tokenA)).send(body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ rubricErrorId: expect.any(String), ruleId: expect.any(String) });
    const list = await http().get('/rubric-errors').query({ rubricName: nameA }).set(as(tokenA));
    expect(list.status).toBe(200);
    expect(list.body.map((i: { ruleKey: string; deduction: string }) => [i.ruleKey, i.deduction])).toEqual([
      ['sai_ca_bien', '1.50'],
    ]);
    expect(
      (await http().post('/rubric-errors').set(as(tokenA)).send({ ...body, newRule: undefined, ruleId: created.body.ruleId }))
        .status,
    ).toBe(409);
    expect((await http().post('/rubric-errors').send(body)).status).toBe(401);
    expect((await http().post('/rubric-errors').set(as(tokenA)).send({ ...body, rubricName: 'Không có' })).status).toBe(404);
    expect((await http().post('/rubric-errors').set(as(tokenA)).send({ ...body, criterionKey: 'khong_co' })).status).toBe(400);
    expect((await http().post('/rubric-errors').set(as(tokenA)).send({ ...body, deduction: 1.5 })).status).toBe(400);
    expect((await http().post('/rubric-errors').set(as(tokenA)).send({ rubricName: nameA, criterionKey: 'tinh_dung' })).status).toBe(
      400,
    );
    expect((await http().get('/rubric-errors').query({ rubricName: nameA }).set(as(tokenB))).status).toBe(404);
  });

  it('điểm trừ: xem trước không sinh phiên bản; lưu sinh đúng một; giảng viên khác → 404; số JSON → 400', async () => {
    const list = await http().get('/rubric-errors').query({ rubricName: nameA }).set(as(tokenA));
    const id = list.body[0].id as string;
    const versions = async () =>
      (await ds.query(`SELECT count(*)::int AS n FROM examcollect.price_table_version WHERE teacher_id = $1`, [idA]))[0].n as number;
    const before = await versions();
    const preview = await http().post(`/rubric-errors/${id}/price/preview`).set(as(tokenA)).send({ deduction: '2.00' });
    expect(preview.status).toBe(200);
    expect(preview.body).toEqual({ openSessions: [], finalizedSessions: [] });
    expect(await versions()).toBe(before);
    const put = await http().put(`/rubric-errors/${id}/price`).set(as(tokenA)).send({ deduction: '2.00' });
    expect(put.status).toBe(200);
    expect(await versions()).toBe(before + 1);
    expect((await http().put(`/rubric-errors/${id}/price`).set(as(tokenB)).send({ deduction: '3.00' })).status).toBe(404);
    expect((await http().put(`/rubric-errors/${id}/price`).set(as(tokenA)).send({ deduction: 1.5 })).status).toBe(400);
    expect((await http().put(`/rubric-errors/not-a-uuid/price`).set(as(tokenA)).send({ deduction: '1.00' })).status).toBe(400);
  });

  it('sao chép giữa rubric, chuyển tiêu chí, gỡ; nguồn = đích → 400', async () => {
    const copy = await http().post('/rubric-errors/copy').set(as(tokenA)).send({ fromRubricName: nameA, toRubricName: nameB });
    expect(copy.status).toBe(201);
    expect(copy.body).toMatchObject({ copied: 1, skippedNoCriterion: 0, skippedExisting: 0 });
    expect(
      (await http().post('/rubric-errors/copy').set(as(tokenA)).send({ fromRubricName: nameA, toRubricName: nameA })).status,
    ).toBe(400);
    const inB = (await http().get('/rubric-errors').query({ rubricName: nameB }).set(as(tokenA))).body[0] as {
      id: string;
      deduction: string;
    };
    expect(inB.deduction).toBe('2.00');
    expect((await http().patch(`/rubric-errors/${inB.id}`).set(as(tokenA)).send({ criterionKey: 'trinh_bay' })).status).toBe(200);
    expect((await http().patch(`/rubric-errors/${inB.id}`).set(as(tokenA)).send({ criterionKey: 'khong_co' })).status).toBe(400);
    expect((await http().delete(`/rubric-errors/${inB.id}`).set(as(tokenA))).status).toBe(200);
    expect((await http().get('/rubric-errors').query({ rubricName: nameB }).set(as(tokenA))).body).toEqual([]);
  });

  it('overview và thư viện: GET /rubric-errors/overview, GET /rules (uses), PATCH, split, state; route đã gỡ trả 404', async () => {
    const overview = await http().get('/rubric-errors/overview').set(as(tokenA));
    expect(overview.status).toBe(200);
    expect(overview.body.map((o: { rubricName: string }) => o.rubricName).sort()).toEqual([nameA, nameB].sort());
    const lib = await http().get('/rules').set(as(tokenA));
    const rule = lib.body.find((r: { ruleKey: string }) => r.ruleKey === 'sai_ca_bien') as { id: string; uses: unknown[] };
    expect(rule.uses).toHaveLength(1);
    const patched = await http().patch(`/rules/${rule.id}`).set(as(tokenA)).send({ name: 'Sai ca biên (đã sửa)' });
    expect(patched.status).toBe(200);
    expect(patched.body.revisionId).toEqual(expect.any(String));
    expect((await http().patch(`/rules/${rule.id}`).set(as(tokenA)).send({ criterionKey: 'x' })).status).toBe(200);
    expect(
      (await http().post(`/rules/${rule.id}/split`).set(as(tokenA)).send({ rubricName: nameA, changes: { name: 'Tách' } })).status,
    ).toBe(409);
    const missing = await http().get('/rules/missing').query({ rubricName: nameA }).set(as(tokenA));
    expect(missing.status).toBe(200);
    expect((await http().post(`/rules/${rule.id}/state`).set(as(tokenA)).send({ state: 'active' })).status).toBe(400);
    expect((await http().post(`/rules/${rule.id}/state`).set(as(tokenA)).send({ state: 'retired' })).status).toBe(200);
    for (const [method, path] of [
      ['post', '/rules'],
      ['post', '/rules/preview'],
      ['put', `/rules/${rule.id}/price`],
      ['post', `/rules/${rule.id}/price/preview`],
    ] as const) {
      expect((await http()[method](path).set(as(tokenA)).send({})).status).toBe(404);
    }
  });
});
