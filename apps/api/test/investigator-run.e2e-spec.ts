import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import type { ChatTextRequest } from '../src/grading/ai-provider/openai-chat';
import { GradingService } from '../src/grading/grading.service';
import type { GradeSubmissionJob } from '../src/grading/grading.queue';
import type { ModelTier } from '../src/grading/investigator/model-pool';
import { execResult, fakeSandbox } from '../src/grading/investigator/testing/fake-sandbox';
import { InvestigationContextService } from '../src/grading/pipeline/investigation-context.service';
import { INVESTIGATOR_DEPS, InvestigatorDeps } from '../src/grading/pipeline/investigator-deps';
import { ErrorRuleService } from '../src/grading/rules/error-rule.service';
import type { ExecRequest } from '../src/sandbox/sandbox.client';
import { StorageService } from '../src/storage/storage.service';
import { seedCodeSession, seedCodeSubmission } from './helpers/code-session-seed';

const USAGE = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 };
const call = (tool: string, extra: Record<string, unknown> = {}) => ({ tool, input: null, group: null, path: null, fromLine: null, toLine: null, ...extra });
const turn = (...calls: object[]) => JSON.stringify({ action: 'call', calls, verdict: null });
const final = (errors: object[], missingRules: object[] = []) =>
  JSON.stringify({ action: 'final', calls: [], verdict: { errors, missingRules, injectionAttempt: { detected: false, excerpt: null } } });

/** Model kịch bản (khuôn `investigate.spec.ts`): chạy gói test + đọc bài, rồi kết luận một lỗi lời và một luật còn thiếu. */
function scripted(): ModelTier & { requests: ChatTextRequest[] } {
  const script = [
    turn(call('run_tests'), call('read_file', { path: 'bai-nop/main.cpp' })),
    final([{ ruleKey: 'ten_bien', toolCallIds: ['tc-2'], note: null }], [{ description: 'Dùng biến toàn cục thay tham số', toolCallIds: ['tc-2'] }]),
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
/** Sandbox giả: nhóm `bien` fail, mọi ca khác đạt. */
const bienFails = () =>
  fakeSandbox((req: ExecRequest) =>
    execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: c.group === 'bien' ? 'fail' : c.expected ? 'pass' : 'ran' }))),
  );

describe('Nhánh investigator của worker (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let storage: StorageService;
  let grading: GradingService;
  // Provider thay bằng một object đổi được giữa các ca — service đọc nó lúc chạy.
  const deps: InvestigatorDeps = { models: [], sandbox: null, ceilingOf: () => 1, close: async () => undefined };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(INVESTIGATOR_DEPS).useValue(deps).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    storage = app.get(StorageService);
    grading = app.get(GradingService);
  });
  afterAll(async () => app.close());

  async function job(label: string) {
    const s = await seedCodeSession(ds, storage, label);
    const sub = await seedCodeSubmission(ds, storage, s);
    const j: GradeSubmissionJob = {
      deliverableType: 'code_project',
      submissionId: sub.submissionId,
      requiredFilename: 'Cau1.docx',
      rubricId: s.ctx.rubricId,
      teacherId: s.ctx.teacherId,
    };
    return { s, sub, j };
  }
  const attempts = (resultId: string) =>
    ds.query(`SELECT outcome, ungradable_class, ungradable_reason, investigation FROM examcollect.grading_attempt WHERE grading_result_id = $1 ORDER BY attempt_no`, [resultId]);
  const result = async (id: string) =>
    (await ds.query(`SELECT status, ai_total_score, ungradable_class FROM examcollect.grading_result WHERE id = $1`, [id]))[0];
  const computations = (id: string) => ds.query(`SELECT reason FROM examcollect.score_computation WHERE grading_result_id = $1`, [id]);

  it('đường chuẩn: một lượt chấm graded mang StoredInvestigation v1, lượt tính initial, luật còn thiếu thành proposed', async () => {
    deps.models = [scripted()];
    deps.sandbox = bienFails();
    const { s, sub, j } = await job('ir-ok');
    await grading.gradeOneById(j);
    const rows = await attempts(sub.resultId);
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe('graded');
    expect(rows[0].investigation).toMatchObject({
      version: 1,
      ruleTable: [{ ruleKey: 'sai_bien', checkedBy: 'machine' }, { ruleKey: 'ten_bien', checkedBy: 'model' }],
      result: { kind: 'verdict' },
    });
    expect(await computations(sub.resultId)).toEqual([{ reason: 'initial' }]);
    expect(['auto_approved', 'flagged_for_review']).toContain((await result(sub.resultId)).status);
    expect((await result(sub.resultId)).ai_total_score).not.toBeNull();
    expect(await app.get(ErrorRuleService).missing(s.ctx.teacherId)).toHaveLength(1);

    // Review Focus 1: cùng job chạy lại sau khi xong → không lượt chấm, không lượt tính thứ hai.
    await grading.gradeOneById(j);
    expect(await attempts(sub.resultId)).toHaveLength(1);
    expect(await computations(sub.resultId)).toHaveLength(1);
  });

  it('job chết giữa chừng rồi được thử lại → dùng lại đúng lượt đang chạy, chỉ một dòng lượt chấm', async () => {
    deps.models = [scripted()];
    deps.sandbox = bienFails();
    const { sub, j } = await job('ir-retry');
    const build = jest.spyOn(app.get(InvestigationContextService), 'build').mockRejectedValueOnce(new Error('đứt kết nối DB'));
    await expect(grading.gradeOneById(j)).rejects.toThrow(/đứt kết nối/);
    expect(await attempts(sub.resultId)).toEqual([expect.objectContaining({ outcome: null })]);
    build.mockRestore();
    await grading.gradeOneById(j);
    const rows = await attempts(sub.resultId);
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe('graded');
  });

  it('Review Focus 2: sandbox chưa cấu hình → không chấm được lớp system, nêu SANDBOX_REDIS_URL, không gọi model', async () => {
    const model = scripted();
    deps.models = [model];
    deps.sandbox = null;
    const { sub, j } = await job('ir-nosbx');
    await grading.gradeOneById(j);
    expect(await attempts(sub.resultId)).toEqual([
      expect.objectContaining({ outcome: 'ungradable', ungradable_class: 'system', ungradable_reason: expect.stringContaining('SANDBOX_REDIS_URL') }),
    ]);
    expect(await result(sub.resultId)).toMatchObject({ status: 'flagged_for_review', ungradable_class: 'system' });
    expect(model.requests).toHaveLength(0);
  });

  it('Review Focus 5: hết lượt thử khi đang có lượt chạy → markUngradable ĐÓNG lượt đó, không sinh lượt mới', async () => {
    deps.models = [scripted()];
    deps.sandbox = bienFails();
    const { sub, j } = await job('ir-exhausted');
    const build = jest.spyOn(app.get(InvestigationContextService), 'build').mockRejectedValueOnce(new Error('quá giờ'));
    await expect(grading.gradeOneById(j)).rejects.toThrow();
    build.mockRestore();
    await grading.markUngradable(sub.submissionId, 'hết lượt thử: quá giờ');
    expect(await attempts(sub.resultId)).toEqual([
      expect.objectContaining({ outcome: 'ungradable', ungradable_class: 'system', ungradable_reason: 'hết lượt thử: quá giờ' }),
    ]);
    expect(await result(sub.resultId)).toMatchObject({ status: 'flagged_for_review', ungradable_class: 'system' });
  });
});
