import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GradingResultEntity } from '../src/grading/entities/grading-result.entity';
import { GradingService } from '../src/grading/grading.service';
import { GradeSubmissionJob } from '../src/grading/grading.queue';
import { ensureDefaultProblem } from '../src/grading/problem/resolve-problem-config';
import { loadSessionModelRules, sessionModelRulesWith } from '../src/grading/scoring/score-inputs';
import { scoreResult, seedResult, seedSession, SeedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, storedWith } from './helpers/investigator-seed';

/**
 * P1a — các bẫy §9 của spec, chốt bằng dữ liệu được seed ĐÚNG HÌNH DẠNG của P1a (unique(submission_id) còn).
 * Bẫy 1 chỉ lộ ra khi P2 bỏ unique: test này khoá hành vi trước, để P2 khỏi phải đoán.
 */
describe('P1a — bẫy §9 (e2e)', () => {
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

  describe('bẫy 1 — gradeOneById tra kết quả theo resultId', () => {
    it('job mang resultId: dòng chấm được tra theo id của kết quả, không theo submissionId', async () => {
      const ctx = await seedSession(ds, 'trap-1');
      const { resultId, submissionId } = await seedResult(ds, ctx);
      // Đã có điểm → gradeOneById thoát ngay sau khi tra dòng, không chạy pipeline.
      await scoreResult(ds, resultId);
      const repo = app.get<Repository<GradingResultEntity>>(getRepositoryToken(GradingResultEntity));
      const spy = jest.spyOn(repo, 'findOne');

      const job: GradeSubmissionJob = {
        resultId,
        submissionId,
        deliverableType: 'document',
        requiredFilename: 'bai.docx',
        rubricId: ctx.rubricId,
        teacherId: ctx.teacherId,
      };
      await grading.gradeOneById(job);

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ where: { id: resultId } }));
      spy.mockRestore();
    });
  });

  describe('bẫy 2 — luật lời tính theo từng câu', () => {
    /** Phiên có hai câu: câu 1 (mặc định) và câu 2. */
    async function twoProblems(label: string): Promise<{ ctx: SeedSession; problemA: string; problemB: string }> {
      const ctx = await seedSession(ds, label);
      const problemA = await ds.transaction((m) => ensureDefaultProblem(m, ctx.sessionId));
      const [b] = await ds.query(
        `INSERT INTO examcollect.exam_problem (exam_session_id, ordinal, title, points_hundredths)
         VALUES ($1, 2, 'Câu 2', 500) RETURNING id`,
        [ctx.sessionId],
      );
      return { ctx, problemA, problemB: b.id as string };
    }

    /** Một bài ĐÃ CHẤM (graded) của câu `problemId` có các luật lời `ruleKeys`. `null` = dòng ghi thẳng SQL. */
    async function gradedIn(ctx: SeedSession, problemId: string | null, ruleKeys: string[]): Promise<string> {
      const table = ruleKeys.map((ruleKey) => ({ ruleKey, checkedBy: 'model' as const }));
      const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith([], [], true, table));
      await ds.query(`UPDATE examcollect.grading_result SET problem_id = $2 WHERE id = $1`, [resultId, problemId]);
      return resultId;
    }

    it('loadSessionModelRules theo câu: chỉ tính các bài của câu được hỏi', async () => {
      const { ctx, problemA, problemB } = await twoProblems('trap-2-scope');
      await gradedIn(ctx, problemA, ['ten_bien']);
      await gradedIn(ctx, problemB, ['bo_nho']);

      const rules = await ds.transaction((m) => loadSessionModelRules(m, ctx.sessionId, problemA));

      expect([...rules]).toEqual(['ten_bien']);
    });

    it('sessionModelRulesWith theo câu: bài mới của câu A chỉ đối chiếu với bài khác của câu A', async () => {
      const { ctx, problemA, problemB } = await twoProblems('trap-2-with');
      await gradedIn(ctx, problemA, ['ten_bien']);
      await gradedIn(ctx, problemB, ['bo_nho']);
      // Bài đang chấm (chưa có kết cục): chưa graded nên không đếm vào tập của các bài khác.
      const { resultId } = await seedResult(ds, ctx, 'investigator');
      await ds.query(`UPDATE examcollect.grading_result SET problem_id = $2 WHERE id = $1`, [resultId, problemA]);
      const own = [
        { ruleKey: 'ten_bien', checkedBy: 'model' as const },
        { ruleKey: 'bo_nho', checkedBy: 'model' as const },
      ];

      const rules = await ds.transaction((m) => sessionModelRulesWith(m, ctx.sessionId, problemA, resultId, own));

      expect([...rules]).toEqual(['ten_bien']);
    });

    it('bài chưa có problem_id (ghi thẳng SQL) được tính vào câu mặc định', async () => {
      const { ctx, problemA, problemB } = await twoProblems('trap-2-null');
      await gradedIn(ctx, null, ['ten_bien']);
      await gradedIn(ctx, problemB, ['bo_nho']);

      const rules = await ds.transaction((m) => loadSessionModelRules(m, ctx.sessionId, problemA));

      expect([...rules]).toEqual(['ten_bien']);
    });
  });
});
