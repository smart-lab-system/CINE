import type { DataSource } from 'typeorm';
import { loadResultDetail } from './result-detail';
import type { GradingResultEntity } from '../entities/grading-result.entity';

function resultEntity(over: Partial<GradingResultEntity> = {}): GradingResultEntity {
  return {
    id: 'r1',
    pipeline: 'investigator',
    aiTotalScore: null,
    status: 'ai_graded',
    ungradableClass: null,
    ungradableReason: null,
    currentAttemptId: 'a1',
    ...over,
  } as unknown as GradingResultEntity;
}

/** Không có lượt tính điểm nào (`computation: null`), không có luật bị mismatch — nhánh ngắn nhất
 *  để kiểm riêng `challengeNotes`, không phải để kiểm mọi nhánh của loadResultDetail() (đã có từ
 *  trước bước 6, không thuộc phạm vi plan này). */
function mockQueries(ds: DataSource, attemptInvestigation: unknown): void {
  (ds.manager.query as jest.Mock) = jest.fn().mockResolvedValueOnce([]); // latestComputationRow → null
  (ds.query as unknown as jest.Mock) = jest
    .fn()
    .mockResolvedValueOnce([{ investigation: attemptInvestigation }]) // attempt
    .mockResolvedValueOnce([{ latestComputationScore: null, finalizedComputationScore: null, latestManualScore: null }]) // scoreSource
    .mockResolvedValueOnce([]); // latestReview
}

function fakeDataSource(): DataSource {
  return { manager: { query: jest.fn() }, query: jest.fn() } as unknown as DataSource;
}

describe('loadResultDetail() — challengeNotes (bước 6)', () => {
  it('challengeNotes lấy từ stored.challenge.caseNotes', async () => {
    const ds = fakeDataSource();
    mockQueries(ds, {
      version: 1,
      result: { kind: 'ungradable', ungradable: { class: 'system', reason: 'x' } },
      rulesSeen: [],
      ruleTable: [],
      modelCeiling: 1,
      challenge: { perError: [], caseNotes: [{ lens: 'gian_lan', suspected: true, concluded: true, note: 'x' }] },
    });
    const detail = await loadResultDetail(ds, resultEntity());
    expect(detail.challengeNotes).toEqual([{ lens: 'gian_lan', suspected: true, concluded: true, note: 'x' }]);
  });

  it('hồ sơ trước bước 6 (không có field challenge) → challengeNotes và challengeVerdicts rỗng, không lỗi', async () => {
    const ds = fakeDataSource();
    mockQueries(ds, {
      version: 1,
      result: { kind: 'ungradable', ungradable: { class: 'system', reason: 'x' } },
      rulesSeen: [],
      ruleTable: [],
      modelCeiling: 1,
    });
    const detail = await loadResultDetail(ds, resultEntity());
    expect(detail.challengeNotes).toEqual([]);
    expect(detail.challengeVerdicts).toEqual([]);
  });

  it('challengeVerdicts: mỗi (lăng kính per-error, lỗi) một dòng, kèm lý do khi unverified — kể cả khi lăng kính XÁC NHẬN', async () => {
    const ds = fakeDataSource();
    mockQueries(ds, {
      version: 1,
      result: { kind: 'ungradable', ungradable: { class: 'system', reason: 'x' } },
      rulesSeen: [],
      ruleTable: [],
      modelCeiling: 1,
      challenge: {
        perError: [
          {
            challenger: 'tinh_dung',
            perError: [
              { ruleKey: 'thieu_chu_thich', status: 'unverified', toolCallIds: [], reason: 'hết 4 lượt mà chưa kết luận' },
              { ruleKey: 'ro_ri_bo_nho', status: 'confirmed', toolCallIds: ['tinh_dung-tc-2'] },
            ],
          },
          { challenger: 'qua_tay', perError: [{ ruleKey: 'thieu_chu_thich', status: 'confirmed', toolCallIds: [] }] },
        ],
        caseNotes: [],
      },
    });
    const detail = await loadResultDetail(ds, resultEntity());
    expect(detail.challengeVerdicts).toEqual([
      { lens: 'tinh_dung', ruleKey: 'thieu_chu_thich', status: 'unverified', reason: 'hết 4 lượt mà chưa kết luận', toolCallIds: [] },
      { lens: 'tinh_dung', ruleKey: 'ro_ri_bo_nho', status: 'confirmed', reason: null, toolCallIds: ['tinh_dung-tc-2'] },
      { lens: 'qua_tay', ruleKey: 'thieu_chu_thich', status: 'confirmed', reason: null, toolCallIds: [] },
    ]);
  });

  it('bài chưa từng có lượt chấm nào (currentAttemptId null) → challengeNotes rỗng, không lỗi', async () => {
    const ds = fakeDataSource();
    (ds.manager.query as jest.Mock) = jest.fn().mockResolvedValueOnce([]);
    (ds.query as unknown as jest.Mock) = jest
      .fn()
      .mockResolvedValueOnce([{ latestComputationScore: null, finalizedComputationScore: null, latestManualScore: null }])
      .mockResolvedValueOnce([]);
    const detail = await loadResultDetail(ds, resultEntity({ currentAttemptId: null }));
    expect(detail.challengeNotes).toEqual([]);
  });
});

/** Định tuyến theo nội dung SQL, không theo thứ tự gọi: một lượt đọc có nhiều truy vấn, thứ tự dễ đổi. */
function routedDataSource(routes: [RegExp, unknown][]): DataSource {
  const query = jest.fn(async (sql: string) => {
    const hit = routes.find(([pattern]) => pattern.test(sql));
    if (!hit) throw new Error(`không có route cho SQL: ${sql.slice(0, 90)}`);
    return hit[1];
  });
  return { manager: { query }, query } as unknown as DataSource;
}

describe('loadResultDetail() — hồ sơ có lượt tính điểm (Task 13, E1)', () => {
  const stored = {
    version: 1,
    modelCeiling: 1,
    rulesSeen: [],
    ruleTable: [],
    result: {
      kind: 'verdict',
      verdict: null,
      rejected: [],
      ungradable: null,
      flags: [],
      confidenceCap: 1,
      replay: null,
      summary: '',
      investigation: {
        toolCalls: [{ id: 'tc-1', tool: 'run_tests', status: 'ok', structuredRef: 'tc-1' }],
        structuredResults: {
          'tc-1': {
            kind: 'run_tests',
            compile: null,
            aborted: false,
            host: null,
            cases: [
              { name: 'c1', group: 'bien', status: 'pass', diff: null, ms: 3 },
              { name: 'c2', group: 'bien', status: 'fail', diff: '- 4\n+ 5', ms: 5 },
            ],
          },
        },
      },
      usage: { inputTokens: 0, outputTokens: 0 },
    },
  };

  function fixture(): DataSource {
    return routedDataSource([
      [/test_bundle_id, breakdown FROM examcollect\.score_computation/, [{
        id: 'c-1', score: '7.00', price_table_version_id: 'pv-1', test_bundle_id: 'b-1',
        breakdown: {
          errors: [{ ruleId: 'rule-1', revisionId: 'rev-1', ruleKey: 'sai_ca_bien', criterionKey: 'c', source: 'llm_only', toolCallIds: [], deductionHundredths: 100, counted: 'counted' }],
          perCriterion: [], caseFlags: [], errorFlags: [], confidence: 0.5, mismatchedRules: [], notConsidered: [], ungradable: null,
        },
      }]],
      [/FROM examcollect\.grading_attempt/, [{ investigation: stored }]],
      [/SELECT es\.teacher_id FROM examcollect\.grading_result/, [{ teacher_id: 't-1' }]],
      [/v\.description, v\.predicate FROM examcollect\.error_rule/, [{ id: 'rule-1', name: 'Sai ca biên', description: 'Thiếu ca biên', predicate: { kind: 'test_group_failed', group: 'bien' } }]],
      [/FROM examcollect\.audit_rule_label/, [{ n: '3', disagreements: '1' }]],
      [/scope = 'rule' AND rule_id = \$2/, [{ open: true }]],
      [/FROM examcollect\.audit_no_error_label/, [{ n: '2', disagreements: '0' }]],
      [/scope = 'no_error' AND reset_at IS NULL/, [{ open: false }]],
      [/FROM examcollect\.grading_test_bundle WHERE id/, [{ id: 'b-1', version: 2, origin: 'teacher', filename: 'de.json', approved_at: new Date('2026-10-20') }]],
      [/FROM examcollect\.grading_test_case WHERE bundle_id/, [
        { caseKey: 'c1', group: 'bien', input: '1', expectedOutput: '2', constraintQuote: 'Đọc n', autoDroppedReason: null },
        { caseKey: 'c2', group: 'bien', input: '2', expectedOutput: '4', constraintQuote: null, autoDroppedReason: null },
      ]],
      [/JOIN examcollect\.rubric rb ON rb\.id = g\.rubric_id_version/, [{ name: 'Lập trình C' }]],
      [/FROM examcollect\.rubric_error re/, [{ rule_id: 'rule-1', revision_id: 'rev-1', rule_key: 'sai_ca_bien', criterion_key: 'c', predicate: { kind: 'test_group_failed', group: 'bien' }, deduction: '1.00' }]],
      [/FROM examcollect\.grading_result g\s+LEFT JOIN examcollect\.score_computation fc/, [{ latestComputationScore: '7.00', finalizedComputationScore: null, latestManualScore: null }]],
      [/FROM examcollect\.teacher_review tr/, []],
    ]);
  }

  it('lỗi mang luật và mô tả, điều kiện đo, và độ khớp; cầu dao đang mở thì paused = true', async () => {
    const detail = await loadResultDetail(fixture(), resultEntity());
    expect(detail.breakdown?.errors[0]).toMatchObject({
      ruleName: 'Sai ca biên',
      ruleDescription: 'Thiếu ca biên',
      predicate: { kind: 'test_group_failed', group: 'bien' },
      agreement: { n: 3, disagreements: 1, paused: true },
    });
  });

  it('bảng đóng góp confidence và độ khớp của lớp không lỗi', async () => {
    const detail = await loadResultDetail(fixture(), resultEntity());
    expect(detail.confidenceTerms).toEqual([{ ruleKey: 'sai_ca_bien', source: 'llm_only', cap: 0.5, deductionHundredths: 100 }]);
    expect(detail.noErrorAgreement).toEqual({ n: 2, disagreements: 0, paused: false });
  });

  it('gói test: ca chạy có kết quả, ca không chạy là not_run, luật đang trừ được đánh dấu', async () => {
    const detail = await loadResultDetail(fixture(), resultEntity());
    expect(detail.testBundle).toMatchObject({ id: 'b-1', version: 2, origin: 'teacher', approved: true, caseCount: 2 });
    const bien = detail.testBundle!.groups.find((g) => g.group === 'bien')!;
    expect(bien.cases.map((c) => [c.caseKey, c.status])).toEqual([
      ['c2', 'fail'],
      ['c1', 'pass'],
    ]);
    expect(bien.rules).toEqual([{ ruleId: 'rule-1', ruleKey: 'sai_ca_bien', deductionHundredths: 100, triggered: true }]);
  });

  it('hồ sơ cũ không có modelCeiling → bảng đóng góp rỗng; bài không ghim gói test → testBundle null', async () => {
    const legacy = { ...stored, modelCeiling: undefined };
    const ds = routedDataSource([
      [/test_bundle_id, breakdown FROM examcollect\.score_computation/, [{
        id: 'c-1', score: '7.00', price_table_version_id: null, test_bundle_id: null,
        breakdown: {
          errors: [{ ruleId: 'rule-1', revisionId: 'rev-1', ruleKey: 'sai_ca_bien', criterionKey: 'c', source: 'llm_only', toolCallIds: [], deductionHundredths: 100, counted: 'counted' }],
          perCriterion: [], caseFlags: [], errorFlags: [], confidence: 0.5, mismatchedRules: [], notConsidered: [], ungradable: null,
        },
      }]],
      [/FROM examcollect\.grading_attempt/, [{ investigation: legacy }]],
      [/SELECT es\.teacher_id FROM examcollect\.grading_result/, [{ teacher_id: 't-1' }]],
      [/v\.description, v\.predicate FROM examcollect\.error_rule/, []],
      [/FROM examcollect\.audit_rule_label/, [{ n: '0', disagreements: '0' }]],
      [/scope = 'rule' AND rule_id = \$2/, [{ open: false }]],
      [/FROM examcollect\.audit_no_error_label/, [{ n: '0', disagreements: '0' }]],
      [/scope = 'no_error' AND reset_at IS NULL/, [{ open: false }]],
      [/FROM examcollect\.grading_result g\s+LEFT JOIN examcollect\.score_computation fc/, [{ latestComputationScore: '7.00', finalizedComputationScore: null, latestManualScore: null }]],
      [/FROM examcollect\.teacher_review tr/, []],
    ]);
    const detail = await loadResultDetail(ds, resultEntity());
    expect(detail.confidenceTerms).toEqual([]);
    expect(detail.testBundle).toBeNull();
  });
});
