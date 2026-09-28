import { ActualSubmission, evaluateRun, isRehearsalSession, renderIndex, RehearsalScenario, RunRecord, scenarioRows } from './score-run';

const SCENARIO: RehearsalScenario = {
  id: 'ngan-xep-v1',
  rubric: {
    name: 'r',
    criteria: [
      { key: 'dung_dan', description: 'd', maxPoints: 6 },
      { key: 'trinh_bay', description: 't', maxPoints: 2 },
      { key: 'quan_ly_bo_nho', description: 'q', maxPoints: 2 },
    ],
  },
  rules: [
    { ruleKey: 'sai_ca_co_ban', name: 'a', description: 'a', criterionKey: 'dung_dan', predicate: { kind: 'test_group_failed', group: 'co_ban' }, price: '3' },
    { ruleKey: 'sai_ca_bien', name: 'b', description: 'b', criterionKey: 'dung_dan', predicate: { kind: 'test_group_failed', group: 'bien' }, price: '1.5' },
    { ruleKey: 'ten_bien_vo_nghia', name: 'c', description: 'c', criterionKey: 'trinh_bay', predicate: null, price: '0.5' },
    { ruleKey: 'thieu_chu_thich', name: 'd', description: 'd', criterionKey: 'trinh_bay', predicate: null, price: '0.5' },
    { ruleKey: 'ro_ri_bo_nho', name: 'e', description: 'e', criterionKey: 'quan_ly_bo_nho', predicate: null, price: '1' },
  ],
  question: 'q',
  tests: [],
  submissions: [
    { mssv: 'S1', name: 'n1', label: 'đúng hoàn toàn', code: '', expect: { errors: [], decision: 'auto', suspectedLenses: [] } },
    { mssv: 'S2', name: 'n2', label: 'sai thứ tự', code: '', expect: { errors: ['sai_ca_co_ban', 'sai_ca_bien'], decision: 'auto', suspectedLenses: [] } },
    {
      mssv: 'S3', name: 'n3', label: 'hard-code', code: '',
      expect: { errors: ['thieu_chu_thich'], optionalErrors: ['ten_bien_vo_nghia'], decision: 'review', suspectedLenses: ['gian_lan'], optionalSuspected: ['bo_sot'] },
    },
  ],
};

const note = (lens: string, suspected: boolean, text = 'ok') => ({ lens, suspected, note: text });
const err = (ruleKey: string, counted = 'counted', source = 'llm_only') => ({ ruleKey, source, counted });

function actual(over: Partial<ActualSubmission> & { mssv: string }): ActualSubmission {
  return { status: 'auto_approved', score: 10, confidence: 1, errors: [], verdicts: [], caseNotes: [], caseFlags: [], finishedAtSec: 60, ...over };
}

describe('evaluateRun() — chấm một lượt diễn tập theo kỳ vọng của kịch bản', () => {
  it('bài đúng như kỳ vọng → không lỗi thiếu/thừa, quyết định đúng, điểm đúng', () => {
    const run = evaluateRun(SCENARIO, [actual({ mssv: 'S1' })]);
    expect(run.checks[0]).toMatchObject({ missedErrors: [], extraErrors: [], decisionOk: true, scoreOk: true, expectedScore: 10, falseFlags: [], missedFlags: [] });
  });

  it('diễn tập 2026-09-28 r2 (HS2410020) — lỗi đủ, nhưng hai cờ oan đẩy sang giảng viên → quyết định SAI, 2 cờ oan', () => {
    const run = evaluateRun(SCENARIO, [
      actual({
        mssv: 'S2', status: 'flagged_for_review', score: 5.5,
        errors: [err('sai_ca_bien', 'counted', 'deterministic'), err('sai_ca_co_ban', 'counted', 'deterministic')],
        caseNotes: [note('bo_sot', true), note('gian_lan', true)],
      }),
    ]);
    expect(run.checks[0]).toMatchObject({ missedErrors: [], decisionOk: false, actualDecision: 'review', scoreOk: true, expectedScore: 5.5, falseFlags: ['bo_sot', 'gian_lan'] });
  });

  it('diễn tập r2 (HS2410021) — bắt được gian lận, nhưng agent sót thieu_chu_thich → lỗi thiếu, điểm lệch; bo_sot nghi là CHẤP NHẬN được', () => {
    const run = evaluateRun(SCENARIO, [
      actual({ mssv: 'S3', status: 'flagged_for_review', score: 10, caseNotes: [note('bo_sot', true), note('gian_lan', true)] }),
    ]);
    expect(run.checks[0]).toMatchObject({ missedErrors: ['thieu_chu_thich'], decisionOk: true, scoreOk: false, expectedScore: 9.5, falseFlags: [], missedFlags: [] });
  });

  it('lỗi TÙY CHỌN tìm thấy → không tính thừa, điểm kỳ vọng trừ luôn nó', () => {
    const run = evaluateRun(SCENARIO, [
      actual({ mssv: 'S3', status: 'flagged_for_review', score: 9, errors: [err('thieu_chu_thich'), err('ten_bien_vo_nghia')], caseNotes: [note('gian_lan', true)] }),
    ]);
    expect(run.checks[0]).toMatchObject({ missedErrors: [], extraErrors: [], scoreOk: true, expectedScore: 9 });
  });

  it('lỗi kỳ vọng bị lăng kính BÁC BỎ → tính là thiếu (không bị trừ điểm) và nêu trong refuted', () => {
    const run = evaluateRun(SCENARIO, [actual({ mssv: 'S2', score: 7, errors: [err('sai_ca_co_ban', 'counted', 'deterministic'), err('sai_ca_bien', 'refuted')] })]);
    expect(run.checks[0].missedErrors).toEqual(['sai_ca_bien']);
    expect(run.checks[0].refuted).toEqual(['sai_ca_bien']);
  });

  it('lăng kính không kết luận được (ghi chú cấp bài hay unverified per-error) → đếm vào lensFailures', () => {
    const run = evaluateRun(SCENARIO, [
      actual({
        mssv: 'S1',
        caseNotes: [note('bo_sot', false, 'không kết luận được — hết bậc model (bad_output)'), note('gian_lan', false)],
        verdicts: [{ lens: 'tinh_dung', ruleKey: 'x', status: 'unverified', reason: 'hết giờ' }],
      }),
    ]);
    expect(run.checks[0].lensFailures).toEqual(['bo_sot', 'tinh_dung:x']);
  });

  it('diễn tập r3 (HS2410018) — agent sót lỗi luật BẰNG LỜI mà bo_sot KHÔNG nghi → bo_sot tính là cờ BỎ LỠ (đó chính là việc của nó)', () => {
    const run = evaluateRun(SCENARIO, [actual({ mssv: 'S3', status: 'auto_approved', score: 10, caseNotes: [note('bo_sot', false), note('gian_lan', true)] })]);
    expect(run.checks[0].missedErrors).toEqual(['thieu_chu_thich']);
    expect(run.checks[0].missedFlags).toEqual(['bo_sot']);
  });

  it('agent sót lỗi luật bằng lời và bo_sot CÓ nghi → không cờ oan, không bỏ lỡ, dù kịch bản không kỳ vọng bo_sot nghi', () => {
    const scenario: RehearsalScenario = {
      ...SCENARIO,
      submissions: [{ mssv: 'S9', name: 'n', label: 'rò rỉ', code: '', expect: { errors: ['ro_ri_bo_nho'], decision: 'review', suspectedLenses: [] } }],
    };
    const run = evaluateRun(scenario, [actual({ mssv: 'S9', status: 'flagged_for_review', score: 10, caseNotes: [note('bo_sot', true)] })]);
    expect(run.checks[0]).toMatchObject({ missedErrors: ['ro_ri_bo_nho'], falseFlags: [], missedFlags: [] });
  });

  it('agent chỉ sót lỗi luật MÁY KIỂM → bo_sot KHÔNG bị đòi nghi (luật máy do hệ thống tự áp, không phải việc của bo_sot)', () => {
    const run = evaluateRun(SCENARIO, [actual({ mssv: 'S2', status: 'auto_approved', score: 7, errors: [err('sai_ca_co_ban', 'counted', 'deterministic')] })]);
    expect(run.checks[0].missedErrors).toEqual(['sai_ca_bien']);
    expect(run.checks[0].missedFlags).toEqual([]);
  });

  it('TỰ DUYỆT SAI — bài tự duyệt với điểm sai (r3 HS2410018) hay lẽ ra phải chuyển giảng viên → đếm riêng, đây là lỗi nguy hiểm nhất', () => {
    const run = evaluateRun(SCENARIO, [
      actual({ mssv: 'S1' }), // tự duyệt, điểm đúng → không tính
      actual({ mssv: 'S2', status: 'auto_approved', score: 7, errors: [err('sai_ca_co_ban', 'counted', 'deterministic')] }), // điểm sai
      actual({ mssv: 'S3', status: 'auto_approved', score: 9.5, errors: [err('thieu_chu_thich')] }), // điểm đúng nhưng phải review (gian lận)
    ]);
    expect(run.checks.map((c) => c.wrongAuto)).toEqual([false, true, true]);
    expect(run.summary.wrongAuto).toBe(2);
  });

  it('bài chưa có kết quả (vẫn ai_grading khi hết giờ chờ) → quyết định "pending", sai', () => {
    const run = evaluateRun(SCENARIO, [actual({ mssv: 'S1', status: 'ai_grading', score: null, finishedAtSec: null })]);
    expect(run.checks[0]).toMatchObject({ actualDecision: 'pending', decisionOk: false, scoreOk: false });
  });

  it('tổng hợp: đếm đúng từng chỉ số trên cả lượt', () => {
    const run = evaluateRun(SCENARIO, [
      actual({ mssv: 'S1', finishedAtSec: 57 }),
      actual({ mssv: 'S2', status: 'flagged_for_review', score: 5.5, errors: [err('sai_ca_bien'), err('sai_ca_co_ban')], caseNotes: [note('bo_sot', true)], finishedAtSec: 87 }),
      actual({ mssv: 'S3', status: 'flagged_for_review', score: 10, caseNotes: [note('gian_lan', true)], finishedAtSec: 80 }),
    ]);
    expect(run.summary).toEqual({
      submissions: 3, scoreOk: 2, decisionOk: 2, autoApproved: 1, expectedAuto: 2, wrongAuto: 0,
      // S3: agent sót thieu_chu_thich (luật bằng lời) mà bo_sot không nghi → 1 cờ bỏ lỡ.
      errorsExpected: 3, errorsCaught: 2, extraErrors: 0, falseFlags: 1, missedFlags: 1, lensFailures: 0,
      maxSubmissionSec: 87,
    });
  });
});

describe('chặn dữ liệu sinh viên thật lọt vào bản ghi (bản ghi được commit vào git)', () => {
  it('chỉ phiên tên bắt đầu bằng "TEST " mới được ghi', () => {
    expect(isRehearsalSession('TEST dien tap ngan-xep-v1 - xoa sau 1790577267138')).toBe(true);
    expect(isRehearsalSession('Giữa kỳ CTDL — lớp DHKTPM18ATT')).toBe(false);
    expect(isRehearsalSession('test viết thường')).toBe(false);
  });

  it('chỉ giữ dòng của sinh viên CÓ trong kịch bản — sinh viên khác trong phiên bị bỏ', () => {
    const rows = [{ studentMssv: 'S1' }, { studentMssv: 'NGUOI_THAT' }, { studentMssv: 'S3' }];
    expect(scenarioRows(SCENARIO, rows).map((r) => r.studentMssv)).toEqual(['S1', 'S3']);
  });
});

describe('renderIndex() — bảng so sánh mọi lượt, cũ trước mới sau', () => {
  const base = (id: string, startedAt: string): RunRecord => ({
    id, startedAt, scenario: 'ngan-xep-v1', deploy: 'abc1234', note: 'ghi chú', wallSec: 94.2, backfilled: false,
    checks: [],
    summary: { submissions: 5, scoreOk: 4, decisionOk: 2, autoApproved: 1, expectedAuto: 3, wrongAuto: 1, errorsExpected: 8, errorsCaught: 7, extraErrors: 0, falseFlags: 3, missedFlags: 0, lensFailures: 0, maxSubmissionSec: 94.2 },
  });

  it('một dòng mỗi lượt, sắp theo thời điểm, có đủ cột so sánh', () => {
    const md = renderIndex([base('r2', '2026-09-28T06:40:00Z'), base('r1', '2026-09-28T03:40:00Z')]);
    const rows = md.split('\n').filter((l) => l.startsWith('| r'));
    expect(rows.map((r) => r.split('|')[1].trim())).toEqual(['r1', 'r2']);
    expect(rows[0]).toContain('4/5');
    expect(rows[0]).toContain('7/8');
    expect(rows[0]).toContain('1/3');
    expect(md).toContain('Cờ oan');
    expect(md).toContain('Tự duyệt SAI');
  });
});
