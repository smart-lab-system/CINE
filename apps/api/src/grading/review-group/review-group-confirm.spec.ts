import { confirmVerdict, type ConfirmCandidate } from './review-group-confirm';

const C1 = 'c0000000-0000-4000-8000-000000000001';

/** Bài đủ điều kiện: gắn cờ, đường điều tra, không chấm tay, chấm được, có lượt tính mang điểm, nằm trong nhóm. */
function eligible(over: Partial<ConfirmCandidate> = {}): ConfirmCandidate {
  return {
    status: 'flagged_for_review',
    pipeline: 'investigator',
    ungradableClass: null,
    hasManualScore: false,
    latestComputation: { id: C1, score: '8.50' },
    inGroup: true,
    ...over,
  };
}

describe('confirmVerdict', () => {
  it('bài đủ điều kiện → xác nhận, trỏ lượt tính mới nhất', () => {
    expect(confirmVerdict(eligible())).toEqual({ kind: 'confirm', computationId: C1 });
  });

  it.each(['auto_approved', 'audit_pending', 'teacher_reviewed', 'finalized', 'exported', 'ai_grading', 'ai_graded'])(
    'trạng thái %s → not_flagged',
    (status) => {
      expect(confirmVerdict(eligible({ status }))).toEqual({ kind: 'skip', reason: 'not_flagged' });
    },
  );

  it('bài một-phát → not_investigator', () => {
    expect(confirmVerdict(eligible({ pipeline: 'one_shot', latestComputation: null }))).toEqual({
      kind: 'skip',
      reason: 'not_investigator',
    });
  });

  it('có dòng chấm tay → has_manual', () => {
    expect(confirmVerdict(eligible({ hasManualScore: true }))).toEqual({ kind: 'skip', reason: 'has_manual' });
  });

  it('lớp không chấm được → ungradable, kể cả khi chưa có lượt tính nào', () => {
    expect(confirmVerdict(eligible({ ungradableClass: 'system' }))).toEqual({ kind: 'skip', reason: 'ungradable' });
    expect(confirmVerdict(eligible({ ungradableClass: 'submission', latestComputation: null }))).toEqual({
      kind: 'skip',
      reason: 'ungradable',
    });
  });

  it('lượt tính mới nhất dưới sàn (điểm null) → ungradable', () => {
    expect(confirmVerdict(eligible({ latestComputation: { id: C1, score: null } }))).toEqual({
      kind: 'skip',
      reason: 'ungradable',
    });
  });

  it('chưa có lượt tính → no_computation', () => {
    expect(confirmVerdict(eligible({ latestComputation: null }))).toEqual({ kind: 'skip', reason: 'no_computation' });
  });

  it('đủ điều kiện nhưng không thuộc nhóm → other_group (người gọi từ chối cả lô)', () => {
    expect(confirmVerdict(eligible({ inGroup: false }))).toEqual({ kind: 'other_group' });
  });

  it('nhiều lý do cùng lúc: báo theo thứ tự trạng thái → đường → chấm tay → không chấm được → không lượt tính', () => {
    const all = { ungradableClass: 'system', hasManualScore: true, latestComputation: null, inGroup: false };
    expect(confirmVerdict(eligible({ ...all, status: 'teacher_reviewed', pipeline: 'one_shot' }))).toMatchObject({ reason: 'not_flagged' });
    expect(confirmVerdict(eligible({ ...all, pipeline: 'one_shot' }))).toMatchObject({ reason: 'not_investigator' });
    expect(confirmVerdict(eligible(all))).toMatchObject({ reason: 'has_manual' });
    expect(confirmVerdict(eligible({ ...all, hasManualScore: false }))).toMatchObject({ reason: 'ungradable' });
    expect(confirmVerdict(eligible({ latestComputation: null, inGroup: false }))).toMatchObject({ reason: 'no_computation' });
  });

  it('bài không đủ điều kiện nằm ngoài nhóm vẫn là skipped, không phải other_group', () => {
    expect(confirmVerdict(eligible({ status: 'finalized', inGroup: false }))).toEqual({ kind: 'skip', reason: 'not_flagged' });
  });
});
