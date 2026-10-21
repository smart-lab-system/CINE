import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { countNoErrorLabelsSinceReset, countRuleLabelsSinceReset } from '../src/grading/auto-breaker/breaker-queries';
import { latestComputationRow } from '../src/grading/scoring/score-inputs';
import { ScoreService } from '../src/grading/scoring/score.service';
import { createTestAccount } from './helpers/create-account';
import { forceStatus, seedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

/** `sai_bien` máy kiểm (nhóm `bien` fail → lỗi), `ten_bien` model kiểm. */
const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

/**
 * Cầu dao tự chốt (spec duyệt nhanh 2026-10-21 §5.3): nhãn kiểm mẫu theo luật và theo lớp bài không lỗi, quy tắc tắt,
 * hạ bậc trong cùng giao dịch ghi nhãn, và bật lại. Mỗi ca một giảng viên mới — cầu dao và nhãn là theo giảng viên
 * (và theo luật, mà luật thuộc đúng một giảng viên), nên các ca không thấy dữ liệu của nhau.
 */
describe('Cầu dao tự chốt (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let scores: ScoreService;
  const stamp = Date.now();
  const PASSWORD = 'correct-horse-battery';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    scores = app.get(ScoreService);
  }, 60_000);
  afterAll(async () => {
    // TRUNCATE, không DELETE: `trg_auto_rule_breaker_no_delete` và `guard_append_only` chặn DELETE từng dòng — đúng
    // như thiết kế. Không bảng nào trỏ khoá ngoại vào ba bảng này.
    await ds.query(`TRUNCATE examcollect.audit_rule_label, examcollect.audit_no_error_label, examcollect.auto_rule_breaker`);
    await app.close();
  });

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `brk_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: res.body.accessToken as string };
  }
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Phiên điều tra, hai luật có giá: `sai_bien` 1,50 (luật R của các ca), `ten_bien` 0,50. */
  async function world(label: string) {
    const owner = await login(label);
    const ctx = await seedSession(ds, `brk-${label}`, { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    await seedInvestigatorSession(ds, ctx);
    const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });
    return { owner, ctx, bien, ten };
  }
  type World = Awaited<ReturnType<typeof world>>;

  /** Bài tự quyết (`auto_approved`): `withError` → có lỗi `sai_bien`; không → bài không lỗi. */
  async function autoResult(w: World, withError = true): Promise<string> {
    const { resultId } = await seedInvestigatorResult(ds, w.ctx, withError ? storedWith(SEEN) : storedWith(SEEN, [], false));
    expect(await scores.computeInitial(resultId)).toMatchObject({ outcome: 'auto' });
    return resultId;
  }
  /** Bài được rút vào kiểm mẫu (`audit_pending`). */
  async function sampled(w: World, withError = true): Promise<string> {
    const id = await autoResult(w, withError);
    await forceStatus(ds, id, 'audit_pending', { audit_sampled: true, audit_sampled_at: new Date() });
    return id;
  }

  const label = (token: string, resultId: string, picked: string[], extras: string[] = []) =>
    request(app.getHttpServer())
      .post(`/grading-results/${resultId}/audit-review`)
      .set(as(token))
      .send({ pickedRuleIds: picked, extraErrors: extras });
  const listBreakers = (token: string) => request(app.getHttpServer()).get('/auto-breakers').set(as(token));
  const resetBreaker = (token: string, id: string) =>
    request(app.getHttpServer()).post(`/auto-breakers/${id}/reset`).set(as(token));

  const statusOf = async (id: string): Promise<string> =>
    (await ds.query(`SELECT status FROM examcollect.grading_result WHERE id = $1`, [id]))[0].status as string;
  const reasons = async (id: string): Promise<string[]> =>
    (
      await ds.query(`SELECT reason FROM examcollect.score_computation WHERE grading_result_id = $1 ORDER BY created_at, id`, [id])
    ).map((r: { reason: string }) => r.reason);
  const latestFlags = async (id: string): Promise<string[]> =>
    (await latestComputationRow(ds.manager, id))!.breakdown.caseFlags.map((f) => f.code);
  const breakers = (teacherId: string) =>
    ds.query(
      `SELECT id, scope, rule_id, evidence, reset_at, reset_by FROM examcollect.auto_rule_breaker
        WHERE teacher_id = $1 ORDER BY tripped_at, id`,
      [teacherId],
    );
  const ruleLabels = (resultId: string) =>
    ds.query(`SELECT rule_id, verdict FROM examcollect.audit_rule_label WHERE grading_result_id = $1 ORDER BY rule_id`, [resultId]);
  const noErrorLabels = (teacherId: string) =>
    ds.query(`SELECT grading_result_id, agree FROM examcollect.audit_no_error_label WHERE teacher_id = $1 ORDER BY recorded_at`, [
      teacherId,
    ]);

  it('(a) hai nhãn bất đồng về luật R → đúng một cầu dao luật mở (n=2, d=2); bài tự quyết khác có R về duyệt; bài đã chốt có R không đụng', async () => {
    const w = await world('a');
    const s1 = await sampled(w);
    const s2 = await sampled(w);
    const other = await autoResult(w);
    const done = await autoResult(w);
    await forceStatus(ds, done, 'finalized', { finalized_by: w.owner.id, finalized_at: new Date() });

    await label(w.owner.token, s1, []).expect(201);
    // n=1, d=1: pValue đúng 0,05 — không tắt.
    expect(await breakers(w.owner.id)).toEqual([]);
    expect(await statusOf(other)).toBe('auto_approved');

    await label(w.owner.token, s2, []).expect(201);

    const rows = await breakers(w.owner.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ scope: 'rule', rule_id: w.bien.ruleId, reset_at: null, reset_by: null });
    expect(rows[0].evidence).toMatchObject({ n: 2, disagreements: 2, p0: 0.05, alpha: 0.05 });
    expect(rows[0].evidence.pValue).toBeCloseTo(0.0025, 10);
    expect(await ruleLabels(s2)).toEqual([{ rule_id: w.bien.ruleId, verdict: 'system_only' }]);
    // Bài tự quyết chưa chốt có R, không được rút mẫu: hạ về duyệt trong CÙNG giao dịch ghi nhãn.
    expect(await statusOf(other)).toBe('flagged_for_review');
    expect(await reasons(other)).toEqual(['initial', 'auto_rule_tripped']);
    expect(await latestFlags(other)).toContain('type_auto_disabled');
    // Bài đã chốt: không đổi trạng thái, không có lượt tính mới.
    expect(await statusOf(done)).toBe('finalized');
    expect(await reasons(done)).toEqual(['initial']);
  });

  it('(b) năm nhãn về luật R, một bất đồng → không có cầu dao', async () => {
    const w = await world('b');
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await sampled(w));

    await label(w.owner.token, ids[0], []).expect(201);
    for (const id of ids.slice(1)) await label(w.owner.token, id, [w.bien.ruleId]).expect(201);

    expect(await breakers(w.owner.id)).toEqual([]);
    expect(await countRuleLabelsSinceReset(ds.manager, w.bien.ruleId)).toEqual({ n: 5, disagreements: 1 });
  });

  it('(c) ghi nhãn lần hai cho cùng bài → 409 khoá như hôm nay; không có nhãn trùng', async () => {
    const w = await world('c');
    const id = await sampled(w);
    await label(w.owner.token, id, []).expect(201);

    const second = await label(w.owner.token, id, [w.bien.ruleId]);

    expect(second.status).toBe(409);
    expect(second.body.message).toContain('Nhận xét kiểm mẫu của bài này đã ghi');
    expect(await ruleLabels(id)).toEqual([{ rule_id: w.bien.ruleId, verdict: 'system_only' }]);
  });

  it('(d) bật lại: người không sở hữu → 404; chủ → reset_at, reset_by; không tính lại; nhãn trước lần bật lại không còn đếm', async () => {
    const w = await world('d');
    const stranger = await login('d-khac');
    const tripping = [await sampled(w), await sampled(w)];
    for (const id of tripping) await label(w.owner.token, id, []).expect(201);

    const open = await listBreakers(w.owner.token).expect(200);
    expect(open.body).toEqual([
      {
        id: expect.any(String),
        scope: 'rule',
        ruleId: w.bien.ruleId,
        ruleKey: 'sai_bien',
        trippedAt: expect.any(String),
        n: 2,
        disagreements: 2,
      },
    ]);
    const breakerId = open.body[0].id as string;
    expect((await listBreakers(stranger.token).expect(200)).body).toEqual([]);

    // Cầu dao mở: bài mới có R không tự chốt được ngay từ lượt tính đầu.
    const { resultId: blocked } = await seedInvestigatorResult(ds, w.ctx, storedWith(SEEN));
    expect(await scores.computeInitial(blocked)).toMatchObject({ outcome: 'flagged' });

    expect((await resetBreaker(stranger.token, breakerId)).status).toBe(404);
    expect((await resetBreaker(w.owner.token, randomUUID())).status).toBe(404);
    expect((await breakers(w.owner.id))[0]).toMatchObject({ reset_at: null, reset_by: null });

    await resetBreaker(w.owner.token, breakerId).expect(204);

    const [row] = await breakers(w.owner.id);
    expect(row.reset_at).not.toBeNull();
    expect(row.reset_by).toBe(w.owner.id);
    // Bật lại không tính lại bài: bài đã về duyệt giữ nguyên.
    expect(await statusOf(blocked)).toBe('flagged_for_review');
    expect(await reasons(blocked)).toEqual(['initial']);
    expect((await listBreakers(w.owner.token).expect(200)).body).toEqual([]);
    expect((await resetBreaker(w.owner.token, breakerId)).status).toBe(409);

    // Sau bật lại: R tự chốt lại được, và một nhãn `both` mới cho n=1, d=0 — hai nhãn trước lần bật lại không đếm.
    const fresh = await sampled(w);
    await label(w.owner.token, fresh, [w.bien.ruleId]).expect(201);
    expect(await countRuleLabelsSinceReset(ds.manager, w.bien.ruleId)).toEqual({ n: 1, disagreements: 0 });
    expect((await breakers(w.owner.id)).filter((b: { reset_at: Date | null }) => b.reset_at === null)).toEqual([]);
  });

  it('(e) lỗi trong lúc tính lại (luật) → giao dịch lùi: không nhãn, không nhận xét kiểm mẫu, không cầu dao; bài vẫn kiểm mẫu', async () => {
    const w = await world('e');
    const s1 = await sampled(w);
    const s2 = await sampled(w);
    await label(w.owner.token, s1, []).expect(201);

    const spy = jest.spyOn(scores, 'recomputeForTeacher').mockRejectedValueOnce(new Error('giả lập lỗi khi tính lại'));
    try {
      const res = await label(w.owner.token, s2, []);
      expect(res.status).toBe(500);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }

    expect(await ruleLabels(s2)).toEqual([]);
    expect(await ds.query(`SELECT 1 FROM examcollect.audit_sample_review WHERE grading_result_id = $1`, [s2])).toEqual([]);
    expect(await ds.query(`SELECT 1 FROM examcollect.audit_no_error_label WHERE grading_result_id = $1`, [s2])).toEqual([]);
    expect(await breakers(w.owner.id)).toEqual([]);
    expect(await statusOf(s2)).toBe('audit_pending');
    // Lần ghi trước là giao dịch riêng, đã commit: nhãn của nó còn.
    expect(await ruleLabels(s1)).toEqual([{ rule_id: w.bien.ruleId, verdict: 'system_only' }]);
  });

  it('(e) lỗi trong lúc tính lại (lớp không lỗi) → giao dịch lùi: nhãn lớp không lỗi cũng không còn', async () => {
    const w = await world('e-clean');
    const n1 = await sampled(w, false);
    const n2 = await sampled(w, false);
    await label(w.owner.token, n1, [], ['Thiếu kiểm tra đầu vào']).expect(201);

    const spy = jest.spyOn(scores, 'recomputeForTeacher').mockRejectedValueOnce(new Error('giả lập lỗi khi tính lại'));
    try {
      expect((await label(w.owner.token, n2, [], ['Thiếu kiểm tra đầu vào'])).status).toBe(500);
      expect(spy).toHaveBeenCalledWith(expect.anything(), w.owner.id, 'auto_rule_tripped', null, { noErrors: true, exceptResultId: n2 });
    } finally {
      spy.mockRestore();
    }

    expect(await noErrorLabels(w.owner.id)).toEqual([{ grading_result_id: n1, agree: false }]);
    expect(await ds.query(`SELECT 1 FROM examcollect.audit_sample_review WHERE grading_result_id = $1`, [n2])).toEqual([]);
    expect(await breakers(w.owner.id)).toEqual([]);
    expect(await statusOf(n2)).toBe('audit_pending');
  });

  it('(f) bài vừa được kiểm mẫu không có lượt tính mới do cầu dao; bài kiểm trước đó có', async () => {
    const w = await world('f');
    const s1 = await sampled(w);
    const s2 = await sampled(w);
    await label(w.owner.token, s1, []).expect(201);
    await label(w.owner.token, s2, []).expect(201);

    expect(await breakers(w.owner.id)).toHaveLength(1);
    expect(await reasons(s2)).toEqual(['initial']);
    expect(await reasons(s1)).toEqual(['initial', 'auto_rule_tripped']);
    expect(await statusOf(s1)).toBe('teacher_reviewed');
    expect(await statusOf(s2)).toBe('teacher_reviewed');
  });

  it('(g) lớp không lỗi: hai bài không lỗi bị chọn một luật → cầu dao no_error mở, rule_id rỗng; bài không lỗi tự quyết về duyệt; bài có lỗi giữ', async () => {
    const w = await world('g');
    const n1 = await sampled(w, false);
    const n2 = await sampled(w, false);
    const clean = await autoResult(w, false);
    const withError = await autoResult(w, true);

    await label(w.owner.token, n1, [w.ten.ruleId]).expect(201);
    expect((await breakers(w.owner.id)).filter((b: { scope: string }) => b.scope === 'no_error')).toEqual([]);
    await label(w.owner.token, n2, [w.ten.ruleId]).expect(201);

    const rows = await breakers(w.owner.id);
    const noError = rows.filter((b: { scope: string }) => b.scope === 'no_error');
    expect(noError).toHaveLength(1);
    expect(noError[0]).toMatchObject({ rule_id: null, reset_at: null });
    expect(noError[0].evidence).toMatchObject({ n: 2, disagreements: 2 });
    // `teacher_only` tính vào luật bị bỏ sót (§5.3): `ten_bien` cũng tắt, nhưng không bài nào có lỗi đó.
    expect(rows.filter((b: { scope: string }) => b.scope === 'rule').map((b: { rule_id: string }) => b.rule_id)).toEqual([w.ten.ruleId]);
    expect(await noErrorLabels(w.owner.id)).toEqual([
      { grading_result_id: n1, agree: false },
      { grading_result_id: n2, agree: false },
    ]);
    expect(await statusOf(clean)).toBe('flagged_for_review');
    expect(await reasons(clean)).toEqual(['initial', 'auto_rule_tripped']);
    expect(await latestFlags(clean)).toContain('no_error_auto_disabled');
    expect(await statusOf(withError)).toBe('auto_approved');
    expect(await reasons(withError)).toEqual(['initial']);
    expect(await reasons(n2)).toEqual(['initial']);

    // Bật lại cầu dao lớp: bài không lỗi mới tự chốt lại được.
    await resetBreaker(w.owner.token, noError[0].id as string).expect(204);
    await autoResult(w, false);
    expect(await countNoErrorLabelsSinceReset(ds.manager, w.owner.id)).toEqual({ n: 0, disagreements: 0 });
  });

  it('(h) bài không lỗi, giảng viên không chọn gì và không ghi lỗi khác → agree = true, không tắt', async () => {
    const w = await world('h');
    const n1 = await sampled(w, false);
    const n2 = await sampled(w, false);

    await label(w.owner.token, n1, []).expect(201);
    await label(w.owner.token, n2, []).expect(201);

    expect(await noErrorLabels(w.owner.id)).toEqual([
      { grading_result_id: n1, agree: true },
      { grading_result_id: n2, agree: true },
    ]);
    expect(await countNoErrorLabelsSinceReset(ds.manager, w.owner.id)).toEqual({ n: 2, disagreements: 0 });
    expect(await ruleLabels(n1)).toEqual([]);
    expect(await breakers(w.owner.id)).toEqual([]);
  });
});
