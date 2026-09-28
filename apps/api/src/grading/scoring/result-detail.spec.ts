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
      challenge: { perError: [], caseNotes: [{ lens: 'gian_lan', suspected: true, note: 'x' }] },
    });
    const detail = await loadResultDetail(ds, resultEntity());
    expect(detail.challengeNotes).toEqual([{ lens: 'gian_lan', suspected: true, note: 'x' }]);
  });

  it('hồ sơ trước bước 6 (không có field challenge) → challengeNotes rỗng, không lỗi', async () => {
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
