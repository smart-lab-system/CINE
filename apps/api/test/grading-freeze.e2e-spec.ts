import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GradingService } from '../src/grading/grading.service';
import { forceStatus, scoreResult, seedResult, seedSession, SeedSession } from './helpers/grading-seed';

/**
 * §2.3 luật 6: phiên khoá khi có ít nhất một bài MANG ĐIỂM hoặc ĐANG CHẤM; mở lại khi mọi kết
 * quả là bài không chấm được đã dừng hẳn. Trước luật này: *"có một dòng kết quả là khoá"*.
 */
describe('Luật đóng băng §2.3 luật 6 (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let grading: GradingService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    grading = app.get(GradingService);
  });
  afterAll(async () => app.close());

  async function ungradable(ctx: SeedSession): Promise<string> {
    const { resultId } = await seedResult(ds, ctx);
    await forceStatus(ds, resultId, 'flagged_for_review', { ungradable_class: 'system', ungradable_reason: 'sandbox chết', confidence: 0 });
    return resultId;
  }

  it('T-FREEZE-3: 40 bài đều không chấm được, 0 bài mang điểm → KHÔNG khoá; thêm 1 bài mang điểm → khoá', async () => {
    const ctx = await seedSession(ds, 'freeze3');
    for (let i = 0; i < 40; i++) await ungradable(ctx);
    expect(await grading.isGradingLocked(ctx.sessionId)).toBe(false);

    const { resultId } = await seedResult(ds, ctx);
    await scoreResult(ds, resultId);
    expect(await grading.isGradingLocked(ctx.sessionId)).toBe(true);
  });

  it('bài đang chấm (ai_grading, ai_graded) → khoá, kể cả khi chưa bài nào ra điểm — chặn kẽ chạy đua', async () => {
    const a = await seedSession(ds, 'freeze-running');
    await ungradable(a);
    await seedResult(ds, a); // ai_grading
    expect(await grading.isGradingLocked(a.sessionId)).toBe(true);
  });

  it('bài không chấm được mà giảng viên đã CHẤM TAY → khoá: bài đó đã mang điểm', async () => {
    const ctx = await seedSession(ds, 'freeze-manual');
    const id = await ungradable(ctx);
    await ds.query(
      `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score, kind) VALUES ($1, $2, 6, 'manual_score')`,
      [id, ctx.teacherId],
    );
    expect(await grading.isGradingLocked(ctx.sessionId)).toBe(true);
  });

  it('phiên chưa có kết quả nào → không khoá', async () => {
    const ctx = await seedSession(ds, 'freeze-empty');
    expect(await grading.isGradingLocked(ctx.sessionId)).toBe(false);
  });
});
