import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GradingService } from '../src/grading/grading.service';
import { ScoreService } from '../src/grading/scoring/score.service';
import { seedResult, seedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

/** G1 §2, §4: mỗi dòng danh sách mang triage, loại bài nộp và ngôn ngữ đã khai. */
describe('GradingResultView — triage, loại bài nộp, ngôn ngữ (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let grading: GradingService;
  let scores: ScoreService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    grading = app.get(GradingService);
    scores = app.get(ScoreService);
  }, 60_000);
  afterAll(async () => app.close());

  const rowOf = async (sessionId: string, id: string) => (await grading.listForSession(sessionId)).find((v) => v.id === id)!;

  async function codeWorld(label: string, language: string | null) {
    const ctx = await seedSession(ds, label, { deliverableType: 'code_project', language });
    await seedInvestigatorSession(ds, ctx);
    const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
    return { ctx, bien };
  }

  it('bài đường điều tra đã có lượt tính → triage mang số lỗi và cờ; luật chưa có giá đếm là chờ giá', async () => {
    const { ctx, bien } = await codeWorld('triage-unpriced', 'python');
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50' }); // ten_bien không có dòng giá = chưa giá
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN, ['ten_bien']));
    await scores.computeInitial(resultId);

    const row = await rowOf(ctx.sessionId, resultId);
    expect(row.triage?.counts).toEqual({ counted: 1, unpriced: 1, refuted: 0, excluded: 0 });
    expect(row.triage?.errorFlags).toContainEqual({ ruleKey: 'ten_bien', code: 'unpriced' });
    expect(row).toMatchObject({ pipeline: 'investigator', deliverableType: 'code_project', deliverableLanguage: 'python' });
  });

  it('bài tự luận → triage null, loại document, không ngôn ngữ', async () => {
    const ctx = await seedSession(ds, 'triage-essay');
    const { resultId } = await seedResult(ds, ctx, 'one_shot');
    const row = await rowOf(ctx.sessionId, resultId);
    expect(row.triage).toBeNull();
    expect(row).toMatchObject({ deliverableType: 'document', deliverableLanguage: null });
  });

  it('bài code khai java → đường one_shot (chấm bằng đọc mã), vẫn thấy loại và ngôn ngữ', async () => {
    const ctx = await seedSession(ds, 'triage-java', { deliverableType: 'code_project', language: 'java' });
    const { resultId } = await seedResult(ds, ctx, 'one_shot');
    const row = await rowOf(ctx.sessionId, resultId);
    expect(row).toMatchObject({ pipeline: 'one_shot', deliverableType: 'code_project', deliverableLanguage: 'java', triage: null });
  });

  it('bài đường điều tra chưa có lượt tính nào → triage null', async () => {
    const { ctx } = await codeWorld('triage-nocomp', 'cpp');
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    expect((await rowOf(ctx.sessionId, resultId)).triage).toBeNull();
  });
});
