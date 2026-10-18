import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ScoreService } from '../src/grading/scoring/score.service';
import { seedSession, SeedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedRule, storedWith } from './helpers/investigator-seed';

const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

/**
 * G2b A2a (§6.3b): thước `unverified` đưa bài về giảng viên ngay trong lúc TÍNH ĐIỂM, không chỉ khi chấm.
 * Đường đọc `ruler_trust` đi qua `loadScoreContext`, nên test kiểm đúng đường đó trên DB thật.
 */
describe('ruler_trust trong tính điểm (A2a, e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let scores: ScoreService;
  let ctx: SeedSession;
  let resultId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    scores = app.get(ScoreService);

    ctx = await seedSession(ds, 'ruler-trust');
    await seedInvestigatorSession(ds, ctx);
    // Mỗi tiêu chí có một luật, để bài đúng hoàn toàn không bị coi là "tiêu chí chưa có luật trừ".
    await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay', null);
    // Bài đúng hoàn toàn: không lỗi nào, mọi ca pass — trước A2a nó tự quyết.
    ({ resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN, [], false)));
  }, 60_000);
  afterAll(async () => app.close());

  async function setTrust(trust: string | null): Promise<void> {
    await ds.query(`DELETE FROM examcollect.grading_reference WHERE exam_session_id = $1`, [ctx.sessionId]);
    if (trust === null) return;
    await ds.query(
      `INSERT INTO examcollect.grading_reference (exam_session_id, model_answer_unverified, ruler_trust, created_by)
       VALUES ($1, $2, $3, $4)`,
      [ctx.sessionId, trust === 'unverified', trust, ctx.teacherId],
    );
  }

  it('nền: bài đúng, không có dòng thước → tự quyết', async () => {
    await setTrust(null);
    const out = await scores.preview(resultId, (rules) => rules);
    expect(out.outcome).toBe('auto');
  });

  it('thước unverified: bài đủ bằng chứng tính lại → về giảng viên, không tự quyết', async () => {
    await setTrust('unverified');
    const out = await scores.preview(resultId, (rules) => rules);
    expect(out.outcome).toBe('flagged');
  });

  it('thước teacher: cùng bài tính lại → tự quyết như nền', async () => {
    await setTrust('teacher');
    const out = await scores.preview(resultId, (rules) => rules);
    expect(out.outcome).toBe('auto');
  });
});
