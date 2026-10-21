import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import * as advance from '../src/grading/lifecycle/advance';
import { ScoreService } from '../src/grading/scoring/score.service';
import { createTestAccount } from './helpers/create-account';
import { forceStatus, scoreResult, seedResult, seedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

/** `sai_bien` máy kiểm (nhóm `bien` fail → lỗi), `ten_bien` model kiểm. */
const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

/**
 * Xác nhận hàng loạt bài điều tra theo nhóm lỗi (spec duyệt nhanh 2026-10-21 §5.4): `POST
 * exam-sessions/:id/review-groups/confirm` ghi một dòng `system_confirm` trỏ lượt tính mới nhất và chuyển bài
 * `flagged_for_review → teacher_reviewed`, mọi bài trong MỘT giao dịch. Mỗi ca một giảng viên mới.
 */
describe('Xác nhận hàng loạt theo nhóm lỗi (e2e)', () => {
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
  afterAll(async () => app.close());
  afterEach(() => jest.restoreAllMocks());

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `rgc_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: res.body.accessToken as string };
  }
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Phiên điều tra, hai luật có giá: `sai_bien` 1,50, `ten_bien` 0,50. */
  async function world(label: string) {
    const owner = await login(label);
    const ctx = await seedSession(ds, `rgc-${label}`, { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    await seedInvestigatorSession(ds, ctx);
    const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });
    return { owner, ctx, bien, ten };
  }
  type World = Awaited<ReturnType<typeof world>>;

  /** Bài tự quyết thật (`computeInitial`): mặc định đúng một lỗi `sai_bien` (8,50); `modelErrors` thêm lỗi model. */
  async function autoResult(w: World, modelErrors: string[] = []): Promise<string> {
    const { resultId } = await seedInvestigatorResult(ds, w.ctx, storedWith(SEEN, modelErrors));
    expect(await scores.computeInitial(resultId)).toMatchObject({ outcome: 'auto' });
    return resultId;
  }
  /**
   * Bài bị gắn cờ: tự quyết rồi hạ về `flagged_for_review` bằng bước chuyển HỢP LỆ qua trigger vòng đời — đúng bước
   * cầu dao §5.3 làm (`auto_approved → flagged_for_review`, cờ bật). Lượt tính mới nhất giữ nguyên.
   */
  async function flagged(w: World, modelErrors: string[] = []): Promise<string> {
    const id = await autoResult(w, modelErrors);
    await ds.query(
      `UPDATE examcollect.grading_result SET status = 'flagged_for_review', flag_for_review = true WHERE id = $1 AND status = 'auto_approved'`,
      [id],
    );
    expect(await statusOf(id)).toBe('flagged_for_review');
    return id;
  }

  const listGroups = (token: string, sessionId: string) =>
    request(app.getHttpServer()).get(`/exam-sessions/${sessionId}/review-groups`).set(as(token));
  const confirm = (token: string, sessionId: string, body: object) =>
    request(app.getHttpServer()).post(`/exam-sessions/${sessionId}/review-groups/confirm`).set(as(token)).send(body);
  /** Khoá nhóm đơn của luật, lấy từ CHÍNH danh sách nhóm — test không tự dựng khoá. */
  async function keyOf(w: World, ruleId: string): Promise<string> {
    const res = await listGroups(w.owner.token, w.ctx.sessionId).expect(200);
    const group = (res.body as { key: string; ruleId: string | null }[]).find((g) => g.ruleId === ruleId);
    if (!group) throw new Error(`không có nhóm của luật ${ruleId}`);
    return group.key;
  }

  const statusOf = async (id: string): Promise<string> =>
    (await ds.query(`SELECT status FROM examcollect.grading_result WHERE id = $1`, [id]))[0].status as string;
  const reviewsOf = (id: string): Promise<{ kind: string; teacher_id: string; final_score: string | null; confirmed_computation_id: string | null }[]> =>
    ds.query(
      `SELECT kind, teacher_id, final_score, confirmed_computation_id FROM examcollect.teacher_review
        WHERE grading_result_id = $1 ORDER BY reviewed_at, id`,
      [id],
    );
  const latestComputation = async (id: string): Promise<{ id: string; score: string | null }> =>
    (
      await ds.query(
        `SELECT id, score FROM examcollect.score_computation WHERE grading_result_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
        [id],
      )
    )[0];
  const byId = <T extends { resultId: string }>(xs: T[]): T[] => [...xs].sort((a, b) => (a.resultId < b.resultId ? -1 : 1));

  it('(a) nhóm hai bài gắn cờ → confirmed 2; cả hai teacher_reviewed; mỗi bài một dòng system_confirm trỏ lượt tính mới nhất, final_score bằng điểm lượt đó', async () => {
    const w = await world('a');
    const a = await flagged(w);
    const b = await flagged(w);
    const key = await keyOf(w, w.bien.ruleId);
    const seen = { [a]: await latestComputation(a), [b]: await latestComputation(b) };

    const res = await confirm(w.owner.token, w.ctx.sessionId, { key }).expect(200);
    expect(res.body).toEqual({ confirmed: 2, skipped: [] });

    for (const id of [a, b]) {
      expect(await statusOf(id)).toBe('teacher_reviewed');
      expect(await reviewsOf(id)).toEqual([
        { kind: 'system_confirm', teacher_id: w.owner.id, final_score: seen[id].score, confirmed_computation_id: seen[id].id },
      ]);
      expect(seen[id].score).toBe('8.50');
      // Xác nhận không sinh lượt tính mới: dòng được trỏ vẫn là lượt mới nhất.
      expect((await latestComputation(id)).id).toBe(seen[id].id);
    }
    const [flag] = await ds.query(`SELECT bool_or(flag_for_review) AS any FROM examcollect.grading_result WHERE id = ANY($1::uuid[])`, [[a, b]]);
    expect(flag.any).toBe(false);
    // Nhóm đã hết bài gắn cờ → không còn trong danh sách.
    expect((await listGroups(w.owner.token, w.ctx.sessionId).expect(200)).body).toEqual([]);
  });

  it('(b) bài có manual_score trong nhóm → skipped has_manual, giữ nguyên; bài còn lại vẫn được xác nhận', async () => {
    const w = await world('b');
    const a = await flagged(w);
    const m = await flagged(w);
    // Dòng chấm tay trên bài còn gắn cờ: danh sách nhóm không lọc chấm tay, nên bài này nằm trong nhóm.
    await ds.query(
      `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score, kind, edited_criteria)
       VALUES ($1, $2, '4.00', 'manual_score', '[]'::jsonb)`,
      [m, w.owner.id],
    );
    const key = await keyOf(w, w.bien.ruleId);

    const res = await confirm(w.owner.token, w.ctx.sessionId, { key }).expect(200);
    expect(res.body).toEqual({ confirmed: 1, skipped: [{ resultId: m, reason: 'has_manual' }] });
    expect(await statusOf(a)).toBe('teacher_reviewed');
    expect(await statusOf(m)).toBe('flagged_for_review');
    expect((await reviewsOf(m)).map((r) => r.kind)).toEqual(['manual_score']);
  });

  it('(c) bài không chấm được (lớp ungradable, hoặc lượt tính mới nhất dưới sàn) → skipped ungradable, không dòng nào', async () => {
    const w = await world('c');
    const a = await flagged(w);
    // Không chấm được lớp `system`, chưa có lượt tính nào — như `closeUngradable` để lại.
    const { resultId: u1 } = await seedResult(ds, w.ctx, 'investigator');
    await forceStatus(ds, u1, 'flagged_for_review', { ungradable_class: 'system', ungradable_reason: 'sandbox chết', flag_for_review: true });
    // Lượt tính lại ra dưới sàn: một dòng điểm NULL, `breakdown.ungradable` mang lý do, `errors` rỗng (score.service).
    const u2 = await flagged(w);
    await ds.query(
      `INSERT INTO examcollect.score_computation
         (grading_result_id, attempt_id, price_table_version_id, rubric_id_version, test_bundle_id, reason, score, breakdown, created_by, created_at)
       SELECT grading_result_id, attempt_id, price_table_version_id, rubric_id_version, test_bundle_id, 'price_change', NULL,
              jsonb_set(jsonb_set(breakdown, '{errors}', '[]'::jsonb), '{ungradable}', '{"class":"system","reason":"lượt tính ra dưới sàn"}'::jsonb),
              created_by, clock_timestamp()
         FROM examcollect.score_computation WHERE grading_result_id = $1`,
      [u2],
    );
    expect((await latestComputation(u2)).score).toBeNull();
    const key = await keyOf(w, w.bien.ruleId);
    // Cả hai không có trong nhóm (danh sách loại bài dưới sàn); ở đây chúng đi vào bằng `resultIds`.
    const group = ((await listGroups(w.owner.token, w.ctx.sessionId)).body as { key: string; resultIds: string[] }[]).find((g) => g.key === key)!;
    expect(group.resultIds).toEqual([a]);

    const res = await confirm(w.owner.token, w.ctx.sessionId, { key, resultIds: [a, u1, u2] }).expect(200);
    expect(res.body.confirmed).toBe(1);
    expect(byId(res.body.skipped)).toEqual(byId([{ resultId: u1, reason: 'ungradable' }, { resultId: u2, reason: 'ungradable' }]));
    for (const id of [u1, u2]) {
      expect(await statusOf(id)).toBe('flagged_for_review');
      expect(await reviewsOf(id)).toEqual([]);
    }
    expect(await statusOf(a)).toBe('teacher_reviewed');
  });

  it('(c2) lý do bỏ còn lại: bài chưa có lượt tính → no_computation; bài một-phát → not_investigator', async () => {
    const w = await world('c2');
    const a = await flagged(w);
    const { resultId: none } = await seedInvestigatorResult(ds, w.ctx, storedWith(SEEN));
    await forceStatus(ds, none, 'flagged_for_review', { flag_for_review: true });
    const { resultId: oneShot } = await seedResult(ds, w.ctx, 'one_shot');
    await scoreResult(ds, oneShot);
    await ds.query(`UPDATE examcollect.grading_result SET status = 'flagged_for_review' WHERE id = $1`, [oneShot]);
    const key = await keyOf(w, w.bien.ruleId);

    const res = await confirm(w.owner.token, w.ctx.sessionId, { key, resultIds: [a, none, oneShot] }).expect(200);
    expect(res.body.confirmed).toBe(1);
    expect(byId(res.body.skipped)).toEqual(byId([{ resultId: none, reason: 'no_computation' }, { resultId: oneShot, reason: 'not_investigator' }]));
    expect(await reviewsOf(none)).toEqual([]);
    expect(await reviewsOf(oneShot)).toEqual([]);
  });

  it('(d) gọi lần hai với cùng bài → confirmed 0, các bài vào skipped not_flagged, không thêm dòng nào; nhóm hết bài → 404', async () => {
    const w = await world('d');
    const a = await flagged(w);
    const b = await flagged(w);
    const c = await flagged(w);
    const key = await keyOf(w, w.bien.ruleId);

    expect((await confirm(w.owner.token, w.ctx.sessionId, { key, resultIds: [a, b] }).expect(200)).body).toEqual({ confirmed: 2, skipped: [] });
    // Bài `c` còn gắn cờ nên nhóm vẫn còn; `a`, `b` không còn gắn cờ.
    const again = await confirm(w.owner.token, w.ctx.sessionId, { key, resultIds: [a, b] }).expect(200);
    expect(again.body.confirmed).toBe(0);
    expect(byId(again.body.skipped)).toEqual(byId([{ resultId: a, reason: 'not_flagged' }, { resultId: b, reason: 'not_flagged' }]));
    for (const id of [a, b]) expect((await reviewsOf(id)).map((r) => r.kind)).toEqual(['system_confirm']);
    expect(await statusOf(c)).toBe('flagged_for_review');
    expect(await reviewsOf(c)).toEqual([]);

    // Xác nhận nốt `c`; nhóm hết bài gắn cờ → khoá không còn khớp nhóm nào → 404, không ghi gì.
    expect((await confirm(w.owner.token, w.ctx.sessionId, { key }).expect(200)).body).toEqual({ confirmed: 1, skipped: [] });
    await confirm(w.owner.token, w.ctx.sessionId, { key }).expect(404);
    for (const id of [a, b, c]) expect(await reviewsOf(id)).toHaveLength(1);
  });

  it('(e) bài finalized không bị đụng tới: không dòng mới, trạng thái giữ nguyên — kể cả khi được nêu trong resultIds', async () => {
    const w = await world('e');
    const a1 = await flagged(w);
    const a2 = await flagged(w);
    const done = await autoResult(w);
    await forceStatus(ds, done, 'finalized', { finalized_by: w.owner.id, finalized_at: new Date() });
    const key = await keyOf(w, w.bien.ruleId);

    const named = await confirm(w.owner.token, w.ctx.sessionId, { key, resultIds: [a1, done] }).expect(200);
    expect(named.body).toEqual({ confirmed: 1, skipped: [{ resultId: done, reason: 'not_flagged' }] });
    // Không nêu `resultIds`: cả nhóm — bài đã chốt không thuộc nhóm nên không có mặt cả trong `skipped`.
    expect((await confirm(w.owner.token, w.ctx.sessionId, { key }).expect(200)).body).toEqual({ confirmed: 1, skipped: [] });
    expect(await statusOf(a2)).toBe('teacher_reviewed');
    expect(await statusOf(done)).toBe('finalized');
    expect(await reviewsOf(done)).toEqual([]);
  });

  it('một giao dịch: bài thứ hai hỏng giữa chừng → cả lô lùi, bài thứ nhất không còn dòng system_confirm, vẫn gắn cờ', async () => {
    const w = await world('tx');
    const a = await flagged(w);
    const b = await flagged(w);
    const key = await keyOf(w, w.bien.ruleId);
    // Bước chuyển trạng thái của bài thứ nhất chạy thật; của bài thứ hai báo "dòng không ở trạng thái mong đợi".
    const real = advance.advanceStatus;
    jest
      .spyOn(advance, 'advanceStatus')
      .mockImplementationOnce(real)
      .mockImplementationOnce(async () => false);

    await confirm(w.owner.token, w.ctx.sessionId, { key }).expect(409);
    for (const id of [a, b]) {
      expect(await statusOf(id)).toBe('flagged_for_review');
      expect(await reviewsOf(id)).toEqual([]);
    }
  });

  it('khoá không khớp nhóm nào → 404; bài của phiên khác → 400; bài đủ điều kiện nhưng thuộc nhóm khác → 409 — không ghi gì', async () => {
    const w = await world('guard');
    const a = await flagged(w);
    const multi = await flagged(w, ['ten_bien']); // hai luật → nhóm `multi`
    const key = await keyOf(w, w.bien.ruleId);
    const other = await world('guard-other');
    const foreign = await flagged(other);

    await confirm(w.owner.token, w.ctx.sessionId, { key: `${key}x` }).expect(404);
    await confirm(w.owner.token, w.ctx.sessionId, { key: 'none' }).expect(404);
    await confirm(w.owner.token, w.ctx.sessionId, { key, resultIds: [a, foreign] }).expect(400);
    await confirm(w.owner.token, w.ctx.sessionId, { key, resultIds: [a, multi] }).expect(409);
    for (const id of [a, multi, foreign]) {
      expect(await statusOf(id)).toBe('flagged_for_review');
      expect(await reviewsOf(id)).toEqual([]);
    }
    // Khoá `multi` vẫn nhận được ở endpoint (giao diện không đưa ra, spec §5.4).
    expect((await confirm(w.owner.token, w.ctx.sessionId, { key: 'multi' }).expect(200)).body).toEqual({ confirmed: 1, skipped: [] });
    expect(await statusOf(multi)).toBe('teacher_reviewed');
  });

  it('phiên của giảng viên khác → 403; phiên không có → 404; thân sai dạng → 400 — không ghi gì', async () => {
    const w = await world('own');
    const a = await flagged(w);
    const key = await keyOf(w, w.bien.ruleId);
    const stranger = await login('own-stranger');

    await confirm(stranger.token, w.ctx.sessionId, { key }).expect(403);
    await confirm(w.owner.token, '00000000-0000-4000-8000-000000000000', { key }).expect(404);
    await confirm(w.owner.token, w.ctx.sessionId, {}).expect(400);
    await confirm(w.owner.token, w.ctx.sessionId, { key, resultIds: ['khong-phai-uuid'] }).expect(400);
    await confirm(w.owner.token, w.ctx.sessionId, { key, resultIds: [] }).expect(400);
    expect(await statusOf(a)).toBe('flagged_for_review');
    expect(await reviewsOf(a)).toEqual([]);
  });
});
