import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { ScoreService } from '../src/grading/scoring/score.service';
import { createTestAccount } from './helpers/create-account';
import { forceStatus, seedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

/** T-SAMP-2 và T-SAMP-4 (parent spec), cùng tiết lộ, quyền và các lỗi 4xx. */
describe('Nhận xét kiểm mẫu (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `audrev_${label}_${stamp}@example.com`;
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
  }, 60_000);
  afterAll(async () => app.close());

  /** Một bài kiểm mẫu: hệ thống thấy `sai_bien` (bị trừ 1,50 → 8,50); `ten_bien` không có lỗi. */
  async function world(label: string) {
    const owner = await login(label);
    const ctx = await seedSession(ds, `audrev-${label}`, { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    await seedInvestigatorSession(ds, ctx);
    const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    await app.get(ScoreService).computeInitial(resultId);
    await forceStatus(ds, resultId, 'audit_pending', { audit_sampled: true, audit_sampled_at: new Date() });
    return { owner, ctx, bien, ten, resultId };
  }
  const post = (token: string, resultId: string, body: object) =>
    request(app.getHttpServer()).post(`/grading-results/${resultId}/audit-review`).set(as(token)).send(body);
  const statusOf = async (id: string) =>
    (await ds.query(`SELECT status, audit_sampled FROM examcollect.grading_result WHERE id = $1`, [id]))[0];
  const labelOf = async (id: string) =>
    (await ds.query(`SELECT teacher_id, picked_rule_ids, extra_errors FROM examcollect.audit_sample_review WHERE grading_result_id = $1`, [id]));

  it('ghi nhãn và tiết lộ: điểm hệ thống, lỗi hệ thống giữ, so sánh từng luật; bài sang teacher_reviewed', async () => {
    const w = await world('ok');

    const res = await post(w.owner.token, w.resultId, { pickedRuleIds: [w.bien.ruleId], extraErrors: [] });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'teacher_reviewed', currentScore: 8.5, currentScoreSource: 'computation' });
    expect(res.body.systemErrors).toEqual([
      expect.objectContaining({ ruleId: w.bien.ruleId, ruleKey: 'sai_bien', counted: 'counted' }),
    ]);
    expect(res.body.perRule).toEqual([
      { ruleId: w.bien.ruleId, ruleKey: 'sai_bien', ruleName: 'sai_bien', verdict: 'both' },
    ]);
    expect(res.body.summary).toEqual({ both: 1, teacherOnly: 0, systemOnly: 0, neither: 1, extra: 0, agreement: 'full' });
    expect(await statusOf(w.resultId)).toMatchObject({ status: 'teacher_reviewed', audit_sampled: true });
    expect(await labelOf(w.resultId)).toEqual([
      { teacher_id: w.owner.id, picked_rule_ids: [w.bien.ruleId], extra_errors: [] },
    ]);
  });

  // T-SAMP-2, nửa "vẫn là nhãn dù bước sau chọn gì": bất đồng, rồi chấm tay — nhãn không đổi.
  it('bất đồng với hệ thống vẫn ghi nhãn, và chấm tay sau đó không đụng nhãn', async () => {
    const w = await world('disagree');

    const res = await post(w.owner.token, w.resultId, { pickedRuleIds: [w.ten.ruleId], extraErrors: ['  Thiếu chú thích  '] });

    expect(res.status).toBe(201);
    expect(Object.fromEntries(res.body.perRule.map((r: { ruleKey: string; verdict: string }) => [r.ruleKey, r.verdict]))).toEqual({
      ten_bien: 'teacher_only', sai_bien: 'system_only',
    });
    expect(res.body.summary).toMatchObject({ teacherOnly: 1, systemOnly: 1, extra: 1, agreement: 'none' });
    expect(res.body.extraErrors).toEqual(['Thiếu chú thích']);

    // Giờ bài ở teacher_reviewed nên sửa được bằng đường có sẵn.
    await request(app.getHttpServer())
      .post(`/grading-results/${w.resultId}/manual-score`).set(as(w.owner.token)).send({ score: '7.00' }).expect(201);
    expect(await labelOf(w.resultId)).toEqual([
      { teacher_id: w.owner.id, picked_rule_ids: [w.ten.ruleId], extra_errors: ['Thiếu chú thích'] },
    ]);
  });

  // T-SAMP-2, nửa "ghi rồi thì khoá".
  it('ghi lần hai → 409 nói nhãn đã khoá, không có dòng thứ hai, nhãn đầu giữ nguyên', async () => {
    const w = await world('twice');
    await post(w.owner.token, w.resultId, { pickedRuleIds: [w.bien.ruleId], extraErrors: [] }).expect(201);

    const second = await post(w.owner.token, w.resultId, { pickedRuleIds: [w.ten.ruleId], extraErrors: [] });

    expect(second.status).toBe(409);
    expect(second.body.message).toContain('Nhận xét kiểm mẫu của bài này đã ghi');
    const rows = await labelOf(w.resultId);
    expect(rows).toHaveLength(1);
    expect(rows[0].picked_rule_ids).toEqual([w.bien.ruleId]);
  });

  it('bài không ở trạng thái kiểm mẫu → 409', async () => {
    const w = await world('notaudit');
    await forceStatus(ds, w.resultId, 'auto_approved', { audit_sampled: false, audit_sampled_at: null });

    const res = await post(w.owner.token, w.resultId, { pickedRuleIds: [], extraErrors: [] });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('không ở trạng thái kiểm mẫu');
    expect(await labelOf(w.resultId)).toEqual([]);
  });

  it('luật của giảng viên khác → 400, không ghi gì, bài vẫn kiểm mẫu', async () => {
    const w = await world('foreign');
    const other = await world('foreign-other');

    const res = await post(w.owner.token, w.resultId, { pickedRuleIds: [other.bien.ruleId], extraErrors: [] });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('không thuộc bảng lỗi đang dùng');
    expect(await labelOf(w.resultId)).toEqual([]);
    expect((await statusOf(w.resultId)).status).toBe('audit_pending');
  });

  it('luật đã thôi dùng → 400', async () => {
    const w = await world('retired');
    await ds.query(`UPDATE examcollect.error_rule SET state = 'retired' WHERE id = $1`, [w.ten.ruleId]);

    const res = await post(w.owner.token, w.resultId, { pickedRuleIds: [w.ten.ruleId], extraErrors: [] });

    expect(res.status).toBe(400);
  });

  it('dòng "lỗi khác" chỉ có khoảng trắng → 400; id không phải uuid → 400', async () => {
    const w = await world('bad');
    expect((await post(w.owner.token, w.resultId, { pickedRuleIds: [], extraErrors: ['   '] })).status).toBe(400);
    expect((await post(w.owner.token, w.resultId, { pickedRuleIds: ['khong-phai-uuid'], extraErrors: [] })).status).toBe(400);
    expect((await post(w.owner.token, w.resultId, { pickedRuleIds: [] })).status).toBe(400);
  });

  // Spec D8: độ dài của dòng "lỗi khác" tính SAU khi trim.
  it('dòng "lỗi khác" dài quá 500 ký tự sau khi trim → 400; đúng 500 ký tự kèm khoảng trắng hai đầu → nhận', async () => {
    const w = await world('long');
    const tooLong = await post(w.owner.token, w.resultId, { pickedRuleIds: [], extraErrors: ['x'.repeat(501)] });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.message).toContain('tối đa 500 ký tự');
    expect(await labelOf(w.resultId)).toEqual([]);

    const padded = await post(w.owner.token, w.resultId, { pickedRuleIds: [], extraErrors: [`  ${'x'.repeat(500)}  `] });
    expect(padded.status).toBe(201);
    expect(padded.body.extraErrors).toEqual(['x'.repeat(500)]);
  });

  it('giảng viên khác → 403; bài không tồn tại → 404', async () => {
    const w = await world('perm');
    const stranger = await login('perm-khac');
    expect((await post(stranger.token, w.resultId, { pickedRuleIds: [], extraErrors: [] })).status).toBe(403);
    expect((await post(w.owner.token, randomUUID(), { pickedRuleIds: [], extraErrors: [] })).status).toBe(404);
  });

  // T-SAMP-4: bài kiểm mẫu chưa kiểm chặn chốt điểm — và hết chặn ngay khi nhận xét được ghi.
  it('còn bài kiểm mẫu chưa kiểm → chốt điểm 409; nhận xét xong → chốt được', async () => {
    const w = await world('finalize');
    const finalize = () => request(app.getHttpServer()).post(`/exam-sessions/${w.ctx.sessionId}/finalize-grades`).set(as(w.owner.token));

    const blocked = await finalize();
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toContain('chưa duyệt xong');

    await post(w.owner.token, w.resultId, { pickedRuleIds: [w.bien.ruleId], extraErrors: [] }).expect(201);
    const done = await finalize();
    expect(done.status).toBe(200);
    expect((await statusOf(w.resultId)).status).toBe('finalized');
  });

  describe('GET /grading-results/:id/submission-download', () => {
    it('bài chưa có file trên kho → 404 với câu tiếng Việt', async () => {
      const w = await world('dl-none');
      const res = await request(app.getHttpServer()).get(`/grading-results/${w.resultId}/submission-download`).set(as(w.owner.token));
      expect(res.status).toBe(404);
      expect(res.body.message).toContain('chưa có file');
    });

    it('bài có file → URL ký cho đúng khoá của bài, kèm tên file đã khai', async () => {
      const w = await world('dl-ok');
      const key = `submissions/${randomUUID()}/mssv/deliverable`;
      await ds.query(
        `UPDATE examcollect.submission SET storage_key = $2 WHERE id = (SELECT submission_id FROM examcollect.grading_result WHERE id = $1)`,
        [w.resultId, key],
      );

      const res = await request(app.getHttpServer()).get(`/grading-results/${w.resultId}/submission-download`).set(as(w.owner.token));

      expect(res.status).toBe(200);
      expect(res.body.fileName).toBe('Cau1.docx');
      expect(res.body.downloadUrl).toContain(key);
    });

    it('giảng viên khác → 403', async () => {
      const w = await world('dl-perm');
      const stranger = await login('dl-perm-khac');
      const res = await request(app.getHttpServer()).get(`/grading-results/${w.resultId}/submission-download`).set(as(stranger.token));
      expect(res.status).toBe(403);
    });
  });
});
