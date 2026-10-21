import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { forceStatus, scoreResult, seedResult, seedSession } from './helpers/grading-seed';

const PASSWORD = 'correct-horse-battery';

/**
 * Spec duyệt nhanh 2026-10-21 §5.5: mốc mở bài `grading_result.opened_at`, ghi MỘT lần qua
 * `POST grading-results/:id/opened`. Đây là số đo `t` (thời gian giảng viên xem một bài) của view
 * `review_label_v`, nên lần mở ĐẦU TIÊN là lần duy nhất được tính — mở lại không được dời mốc.
 */
describe('Mốc mở bài (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
  }, 60_000);
  afterAll(async () => app.close());

  async function teacher(label: string) {
    const email = `${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: login.body.accessToken as string };
  }
  const open = (token: string, resultId: string) =>
    request(app.getHttpServer()).post(`/grading-results/${resultId}/opened`).set('Authorization', `Bearer ${token}`);

  /** `::text` giữ đủ micro giây — `Date` của JS chỉ giữ mili giây nên không đủ để chứng minh "không đổi". */
  const stamps = async (resultId: string) =>
    (
      await ds.query(
        `SELECT opened_at::text AS "openedAt", updated_at::text AS "updatedAt"
           FROM examcollect.grading_result WHERE id = $1`,
        [resultId],
      )
    )[0] as { openedAt: string | null; updatedAt: string };

  /** Dựng một bài của giảng viên mới. */
  async function seeded(label: string) {
    const t = await teacher(label);
    const ctx = await seedSession(ds, label, { teacherId: t.id });
    const { resultId } = await seedResult(ds, ctx);
    return { t, ctx, resultId };
  }

  it('lần đầu mở: ghi opened_at (204); lần hai: opened_at KHÔNG đổi và dòng không bị chạm', async () => {
    const { t, resultId } = await seeded('op-twice');
    expect((await stamps(resultId)).openedAt).toBeNull();

    const first = await open(t.token, resultId);
    expect(first.status).toBe(204);
    expect(first.text).toBe('');
    const afterFirst = await stamps(resultId);
    expect(afterFirst.openedAt).not.toBeNull();
    // Mốc là giờ máy chủ DB lúc mở, không phải giờ client: gần "bây giờ", không ở tương lai.
    const [{ lagSeconds }] = await ds.query(
      `SELECT EXTRACT(EPOCH FROM (now() - opened_at))::float AS "lagSeconds"
         FROM examcollect.grading_result WHERE id = $1`,
      [resultId],
    );
    expect(lagSeconds).toBeGreaterThanOrEqual(0);
    expect(lagSeconds).toBeLessThan(120);

    const second = await open(t.token, resultId);
    expect(second.status).toBe(204);
    const afterSecond = await stamps(resultId);
    expect(afterSecond.openedAt).toBe(afterFirst.openedAt);
    // `WHERE opened_at IS NULL` không khớp dòng nào → không UPDATE nào chạy, nên cả updated_at cũng đứng yên.
    expect(afterSecond.updatedAt).toBe(afterFirst.updatedAt);
  });

  it('hai lần mở đồng thời: vẫn chỉ MỘT mốc', async () => {
    const { t, resultId } = await seeded('op-parallel');
    const [a, b] = await Promise.all([open(t.token, resultId), open(t.token, resultId)]);
    expect([a.status, b.status]).toEqual([204, 204]);
    const settled = await stamps(resultId);
    expect(settled.openedAt).not.toBeNull();
    await open(t.token, resultId);
    expect((await stamps(resultId)).openedAt).toBe(settled.openedAt);
  });

  it('giảng viên không sở hữu phiên → 403, opened_at vẫn NULL', async () => {
    const { resultId } = await seeded('op-owner');
    const stranger = await teacher('op-stranger');
    const res = await open(stranger.token, resultId);
    expect(res.status).toBe(403);
    expect((await stamps(resultId)).openedAt).toBeNull();
  });

  it('bài không tồn tại → 404; id không phải uuid → 400', async () => {
    const t = await teacher('op-missing');
    expect((await open(t.token, randomUUID())).status).toBe(404);
    expect((await open(t.token, 'khong-phai-uuid')).status).toBe(400);
  });

  it('không đăng nhập → 401, opened_at vẫn NULL', async () => {
    const { resultId } = await seeded('op-anon');
    const res = await request(app.getHttpServer()).post(`/grading-results/${resultId}/opened`);
    expect(res.status).toBe(401);
    expect((await stamps(resultId)).openedAt).toBeNull();
  });

  // Giảng viên mở lại cả bài đã công bố để xem. Trigger vòng đời chỉ phản ứng khi `status`/`pipeline` đổi, nên cột này
  // phải ghi được ở MỌI trạng thái — kể cả `finalized` và `exported` (đặt thẳng bằng forceStatus, bỏ qua trigger).
  it.each(['audit_pending', 'flagged_for_review', 'finalized', 'exported'])(
    'bài ở trạng thái %s: vẫn ghi được opened_at',
    async (status) => {
      const { t, resultId } = await seeded(`op-st-${status}`.slice(0, 20));
      await forceStatus(ds, resultId, status);
      expect((await open(t.token, resultId)).status).toBe(204);
      expect((await stamps(resultId)).openedAt).not.toBeNull();
    },
  );

  // Review Focus 4: trigger guard_grading_result_ai_immutable khoá các cột đầu ra AI KHI ai_total_score đã có.
  // Bài được mở để duyệt gần như luôn đã có điểm AI, nên đây là ca thật chứ không phải ca góc.
  it('bài đã có điểm AI (trigger bất biến đang khoá): vẫn ghi được opened_at, cột AI nguyên vẹn', async () => {
    const { t, resultId } = await seeded('op-ai-scored');
    await scoreResult(ds, resultId, '7.00');
    const before = (
      await ds.query(
        `SELECT status, ai_total_score, confidence, model_used, criterion_results, flag_for_review, pipeline
           FROM examcollect.grading_result WHERE id = $1`,
        [resultId],
      )
    )[0];
    expect(before.ai_total_score).toBe('7.00');

    const res = await open(t.token, resultId);
    expect(res.status).toBe(204);

    const after = (
      await ds.query(
        `SELECT status, ai_total_score, confidence, model_used, criterion_results, flag_for_review, pipeline
           FROM examcollect.grading_result WHERE id = $1`,
        [resultId],
      )
    )[0];
    expect(after).toEqual(before);
    expect((await stamps(resultId)).openedAt).not.toBeNull();
  });
});
