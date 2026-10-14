import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import type { ChatTextRequest } from '../src/grading/ai-provider/openai-chat';
import { GRADING_QUEUE, type GradeSubmissionJob } from '../src/grading/grading.queue';
import { GradingService } from '../src/grading/grading.service';
import type { ModelTier } from '../src/grading/investigator/model-pool';
import { execResult, fakeSandbox } from '../src/grading/investigator/testing/fake-sandbox';
import { INVESTIGATOR_DEPS, InvestigatorDeps } from '../src/grading/pipeline/investigator-deps';
import { RegradeService } from '../src/grading/regrade.service';
import type { ExecRequest } from '../src/sandbox/sandbox.client';
import { StorageService } from '../src/storage/storage.service';
import { seedCodeSession, seedCodeSubmission } from './helpers/code-session-seed';

const USAGE = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 };
const call = (tool: string, extra: Record<string, unknown> = {}) => ({ tool, input: null, group: null, path: null, fromLine: null, toLine: null, ...extra });
const turn = (...calls: object[]) => JSON.stringify({ action: 'call', calls, verdict: null });
const final = (errors: object[], missingRules: object[] = []) =>
  JSON.stringify({ action: 'final', calls: [], verdict: { errors, missingRules, injectionAttempt: { detected: false, excerpt: null } } });

/** Model kịch bản: chạy gói test + đọc bài, rồi kết luận một lỗi lời. */
function scripted(): ModelTier & { requests: ChatTextRequest[] } {
  const script = [
    turn(call('run_tests'), call('read_file', { path: 'bai-nop/main.cpp' })),
    final([{ ruleKey: 'ten_bien', toolCallIds: ['tc-2'], note: null }]),
  ];
  const requests: ChatTextRequest[] = [];
  return {
    label: 'kịch bản', model: 'kich-ban', ceiling: 1, requests,
    async call(req) {
      requests.push(req);
      return { content: script[Math.min(requests.length - 1, script.length - 1)], usage: USAGE };
    },
  };
}
/** Môi trường chạy bài giả: nhóm `bien` fail, mọi ca khác đạt. */
const bienFails = () =>
  fakeSandbox((req: ExecRequest) =>
    execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: c.group === 'bien' ? 'fail' : c.expected ? 'pass' : 'ran' }))),
  );

/** G3 §6 Review Focus #6: chấm lại một bài code không chấm được → lượt chấm thứ hai có điểm. */
describe('Chấm lại — đường điều tra, đầu-cuối (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let storage: StorageService;
  let grading: GradingService;
  let queue: Queue;
  const deps: InvestigatorDeps = { models: [], sandbox: null, challengers: [], caseLenses: [], ceilingOf: () => 1, close: async () => undefined };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(INVESTIGATOR_DEPS).useValue(deps).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    storage = app.get(StorageService);
    grading = app.get(GradingService);
    queue = app.get<Queue>(getQueueToken(GRADING_QUEUE));
  }, 60_000);
  afterAll(async () => app.close());
  afterEach(() => jest.restoreAllMocks());

  const stateOf = async (resultId: string) =>
    (await ds.query(`SELECT status, ai_total_score, ungradable_class FROM examcollect.grading_result WHERE id = $1`, [resultId]))[0];

  it('môi trường chạy bài chưa cấu hình → không chấm được (system) → chấm lại → lượt thứ hai có điểm, lớp NULL', async () => {
    // Hàng đợi bị spy: không job thật nào tới worker, và ta gọi `gradeOneById` bằng tay đúng như worker sẽ làm.
    const add = jest.spyOn(queue, 'add').mockResolvedValue({ id: 'gia' } as never);
    jest.spyOn(queue, 'getJob').mockResolvedValue(undefined as never);
    deps.models = [scripted()];
    deps.sandbox = null;
    const s = await seedCodeSession(ds, storage, 'loop-a');
    const sub = await seedCodeSubmission(ds, storage, s);
    const job: GradeSubmissionJob = {
      deliverableType: 'code_project',
      resultId: sub.resultId,
      submissionId: sub.submissionId,
      requiredFilename: 'Cau1.docx',
      rubricId: s.ctx.rubricId,
      teacherId: s.ctx.teacherId,
    };

    await grading.gradeOneById(job); // lượt 1: môi trường chạy bài chưa cấu hình
    expect(await stateOf(sub.resultId)).toMatchObject({ status: 'flagged_for_review', ungradable_class: 'system' });

    deps.sandbox = bienFails(); // môi trường chạy bài "sống lại"
    const outcome = await app.get(RegradeService).regradeOne(s.ctx.teacherId, sub.resultId);
    expect(outcome).toEqual({ requeued: 1, skipped: [] });
    expect(add).toHaveBeenCalledTimes(1);
    expect(await stateOf(sub.resultId)).toMatchObject({ status: 'ai_grading', ungradable_class: null });

    await grading.gradeOneById(job); // worker chạy lại đúng job vừa được xếp

    const attempts = await ds.query(
      `SELECT attempt_no, outcome FROM examcollect.grading_attempt WHERE grading_result_id = $1 ORDER BY attempt_no`,
      [sub.resultId],
    );
    expect(attempts).toEqual([
      { attempt_no: 1, outcome: 'ungradable' },
      { attempt_no: 2, outcome: 'graded' },
    ]);
    const after = await stateOf(sub.resultId);
    expect(after.ungradable_class).toBeNull();
    expect(after.ai_total_score).not.toBeNull();
    expect(['auto_approved', 'flagged_for_review']).toContain(after.status);
  });
});
