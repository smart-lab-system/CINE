import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { drawnForStudentAudit } from '../src/grading/audit-sampling';
import { ScoreService } from '../src/grading/scoring/score.service';
import { seedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

/**
 * `ScoreService` đọc env lúc KHỞI TẠO (như `theta`), nên mỗi mức tỉ lệ cần một app RIÊNG dựng sau khi đặt env.
 * `restore` trả env về như cũ — Jest có thể dùng chung `process.env` giữa các file trong một worker.
 */
async function boot(percent: string | undefined) {
  const before = process.env.GRADING_AUDIT_SAMPLE_PERCENT;
  if (percent === undefined) delete process.env.GRADING_AUDIT_SAMPLE_PERCENT;
  else process.env.GRADING_AUDIT_SAMPLE_PERCENT = percent;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app: INestApplication = moduleRef.createNestApplication();
  await app.init();
  const restore = () => {
    if (before === undefined) delete process.env.GRADING_AUDIT_SAMPLE_PERCENT;
    else process.env.GRADING_AUDIT_SAMPLE_PERCENT = before;
  };
  return { app, ds: app.get(DataSource), scores: app.get(ScoreService), restore };
}

/** Phiên, hai luật, bảng giá v1: sai_bien 1,50 và ten_bien 0,50 — bài `storedWith(SEEN)` ra 8,50 và tự quyết. */
async function world(ds: DataSource, label: string) {
  const ctx = await seedSession(ds, label);
  await seedInvestigatorSession(ds, ctx);
  const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
  const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
  await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });
  return { ctx, bien, ten };
}
const rowOf = async (ds: DataSource, id: string) =>
  (await ds.query(`SELECT status, audit_sampled, audit_sampled_at FROM examcollect.grading_result WHERE id = $1`, [id]))[0];

describe('Rút mẫu ở quyết định đầu tiên — 100 % (e2e)', () => {
  let ctxApp: Awaited<ReturnType<typeof boot>>;
  beforeAll(async () => {
    ctxApp = await boot('100');
  }, 60_000);
  afterAll(async () => {
    await ctxApp.app.close();
    ctxApp.restore();
  });

  it('bài tự quyết ngay từ đầu → audit_pending, cờ và mốc ghi CÙNG một câu lệnh (T-AUDIT-1)', async () => {
    const { ds, scores } = ctxApp;
    const { ctx } = await world(ds, 'samp-first');
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));

    const out = await scores.computeInitial(resultId);

    expect(out.outcome).toBe('auto'); // quyết định vẫn là tự quyết; rút mẫu là bước sau nó
    const row = await rowOf(ds, resultId);
    expect(row.status).toBe('audit_pending');
    expect(row.audit_sampled).toBe(true);
    expect(row.audit_sampled_at).not.toBeNull();
  });

  it('bài bị gắn cờ ở lượt đầu KHÔNG vào mẫu', async () => {
    const { ds, scores } = ctxApp;
    const { ctx } = await world(ds, 'samp-flagged');
    // Một luật máy kiểm chưa có giá, có lỗi → chặn tự quyết (§2.1).
    await seedRule(ds, ctx.teacherId, 'bien_2', 'trinh_bay', { kind: 'test_group_failed', group: 'bien' });
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));

    expect(await scores.computeInitial(resultId)).toMatchObject({ outcome: 'flagged' });

    expect(await rowOf(ds, resultId)).toMatchObject({ status: 'flagged_for_review', audit_sampled: false, audit_sampled_at: null });
  });

  // T-SAMP-5, Review Focus #2: đặt giá cho luật đang chặn đưa bài lên tự quyết — nhưng lúc còn gắn cờ giảng viên
  // có thể đã mở hồ sơ, nên nhãn của nó lệch và nó KHÔNG vào khung rút, kể cả ở 100%.
  it('bài thành tự quyết SAU khi bị gắn cờ (đặt giá) không được rút, dù ở 100 %', async () => {
    const { ds, scores } = ctxApp;
    const { ctx, bien, ten } = await world(ds, 'samp-promote');
    const extra = await seedRule(ds, ctx.teacherId, 'bien_2', 'trinh_bay', { kind: 'test_group_failed', group: 'bien' });
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    expect(await scores.computeInitial(resultId)).toMatchObject({ outcome: 'flagged' });

    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50', [extra.ruleId]: '0.25' });
    const sum = await ds.transaction((m) =>
      scores.recomputeForTeacher(m, ctx.teacherId, 'price_change', ctx.teacherId, { ruleId: extra.ruleId }),
    );

    expect(sum.promoted).toBe(1);
    expect(await rowOf(ds, resultId)).toMatchObject({ status: 'auto_approved', audit_sampled: false, audit_sampled_at: null });
  });
});

describe('Rút mẫu phụ thuộc seed và id, không phụ thuộc gì khác — 5 % (e2e)', () => {
  let ctxApp: Awaited<ReturnType<typeof boot>>;
  beforeAll(async () => {
    ctxApp = await boot('5');
  }, 60_000);
  afterAll(async () => {
    await ctxApp.app.close();
    ctxApp.restore();
  });

  /**
   * Chọn một seed mà `drawnForStudentAudit(seed, mssv, 5)` trả `want` — hàm là tất định nên chọn trước được. Từ P1b
   * (Task 10) khoá rút mẫu là MSSV của sinh viên, không còn là id bài.
   */
  function seedFor(mssv: string, want: boolean): string {
    for (let i = 0; i < 500; i++) {
      const seed = randomUUID();
      if (drawnForStudentAudit(seed, mssv, 5) === want) return seed;
    }
    throw new Error('không tìm được seed phù hợp sau 500 lần thử');
  }

  it.each([[true, 'audit_pending'], [false, 'auto_approved']])(
    'seed đã chọn để rút=%s → %s',
    async (want, expected) => {
      const { ds, scores } = ctxApp;
      const { ctx } = await world(ds, `samp-seed-${want}`);
      const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
      const [{ student_mssv: mssv }] = await ds.query(
        `SELECT s.student_mssv FROM examcollect.grading_result g JOIN examcollect.submission s ON s.id = g.submission_id WHERE g.id = $1`,
        [resultId],
      );
      await ds.query(`UPDATE examcollect.exam_session SET grading_seed = $2 WHERE id = $1`, [ctx.sessionId, seedFor(mssv as string, want)]);

      await scores.computeInitial(resultId);

      expect((await rowOf(ds, resultId)).status).toBe(expected);
    },
  );
});

describe('Rút mẫu dưới NODE_ENV=test khi env chưa đặt (e2e)', () => {
  let ctxApp: Awaited<ReturnType<typeof boot>>;
  beforeAll(async () => {
    ctxApp = await boot(undefined);
  }, 60_000);
  afterAll(async () => {
    await ctxApp.app.close();
    ctxApp.restore();
  });

  // Review Focus #4: đây là ca giữ cho `score-service.e2e-spec.ts:57` và cả chục suite khác không đỏ ngẫu nhiên.
  it('tắt: bài tự quyết vẫn là auto_approved, không bao giờ audit_pending', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    const { ds, scores } = ctxApp;
    for (let i = 0; i < 5; i++) {
      const { ctx } = await world(ds, `samp-off-${i}`);
      const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
      await scores.computeInitial(resultId);
      expect(await rowOf(ds, resultId)).toMatchObject({ status: 'auto_approved', audit_sampled: false });
    }
  });
});
