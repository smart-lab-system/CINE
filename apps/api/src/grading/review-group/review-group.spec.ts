import { groupResults, MULTI_GROUP_LABEL, NONE_GROUP_LABEL, singleGroupKey } from './review-group';

/** Phiên bản rubric và luật thật (uuid) cho các ca cần phân biệt khoá. */
const RV1 = '0a1b2c3d-1111-4111-8111-000000000001';
const RV2 = '0a1b2c3d-2222-4222-8222-000000000002';
const RULE = '5e6f7a8b-3333-4333-8333-000000000003';

/** Gom bài theo lỗi của lượt tính mới nhất (spec duyệt nhanh 2026-10-21 §5.4). Hàm thuần: không DB, không tên luật. */
describe('groupResults', () => {
  it('bài cùng một ruleId (cùng phiên bản rubric) vào cùng nhóm single', () => {
    const g = groupResults([
      { resultId: 'a', rubricVersionId: RV1, errors: [{ ruleId: 'R1', source: 'llm_with_tools' }] },
      { resultId: 'b', rubricVersionId: RV1, errors: [{ ruleId: 'R1', source: 'deterministic' }] },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({
      key: `${RV1}:R1`,
      kind: 'single',
      ruleId: 'R1',
      resultIds: ['a', 'b'],
      sampleResultIds: ['a', 'b'],
    });
    expect(g[0].sources.sort()).toEqual(['deterministic', 'llm_with_tools']);
  });

  it('bài có nhiều lỗi đứng riêng trong nhóm multi', () => {
    const g = groupResults([
      {
        resultId: 'a',
        rubricVersionId: RV1,
        errors: [{ ruleId: 'R1', source: 'deterministic' }, { ruleId: 'R2', source: 'deterministic' }],
      },
    ]);
    expect(g.find((x) => x.kind === 'multi')!.resultIds).toEqual(['a']);
  });

  it('bài không lỗi đứng riêng trong nhóm none', () => {
    const g = groupResults([{ resultId: 'a', rubricVersionId: RV1, errors: [] }]);
    expect(g[0]).toMatchObject({ key: 'none', kind: 'none' });
  });

  it('cùng một luật ở hai phiên bản rubric → hai nhóm single, cùng ruleId, khác khoá', () => {
    const g = groupResults([
      { resultId: 'a', rubricVersionId: RV1, errors: [{ ruleId: RULE, source: 'deterministic' }] },
      { resultId: 'b', rubricVersionId: RV2, errors: [{ ruleId: RULE, source: 'deterministic' }] },
    ]);
    expect(g).toHaveLength(2);
    expect(g.map((x) => [x.key, x.kind, x.ruleId, x.label, x.resultIds])).toEqual([
      [`${RV1}:${RULE}`, 'single', RULE, RULE, ['a']],
      [`${RV2}:${RULE}`, 'single', RULE, RULE, ['b']],
    ]);
  });

  it('cùng một luật và cùng phiên bản rubric → MỘT nhóm', () => {
    const g = groupResults([
      { resultId: 'b', rubricVersionId: RV1, errors: [{ ruleId: RULE, source: 'llm_only' }] },
      { resultId: 'a', rubricVersionId: RV1, errors: [{ ruleId: RULE, source: 'deterministic' }] },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ key: singleGroupKey(RV1, RULE), ruleId: RULE, resultIds: ['a', 'b'] });
  });

  it('phiên bản rubric không tách nhóm multi và none', () => {
    const g = groupResults([
      { resultId: 'a', rubricVersionId: RV1, errors: [{ ruleId: 'R1', source: 'deterministic' }, { ruleId: 'R2', source: 'deterministic' }] },
      { resultId: 'b', rubricVersionId: RV2, errors: [{ ruleId: 'R1', source: 'deterministic' }, { ruleId: 'R3', source: 'deterministic' }] },
      { resultId: 'c', rubricVersionId: RV1, errors: [] },
      { resultId: 'd', rubricVersionId: RV2, errors: [] },
    ]);
    expect(g.map((x) => [x.key, x.resultIds])).toEqual([
      ['multi', ['a', 'b']],
      ['none', ['c', 'd']],
    ]);
  });

  it('bài mẫu tối đa 3', () => {
    const rows = ['a', 'b', 'c', 'd'].map((resultId) => ({
      resultId,
      rubricVersionId: RV1,
      errors: [{ ruleId: 'R1', source: 'deterministic' }],
    }));
    expect(groupResults(rows)[0].sampleResultIds).toEqual(['a', 'b', 'c']);
  });

  it('không có bài nào → không có nhóm nào (không trả nhóm rỗng)', () => {
    expect(groupResults([])).toEqual([]);
  });

  it('thứ tự nhóm: đơn lỗi theo ruleId tăng dần (cùng luật thì theo phiên bản rubric), rồi multi, rồi none', () => {
    const g = groupResults([
      { resultId: 'n1', rubricVersionId: RV1, errors: [] },
      { resultId: 'm1', rubricVersionId: RV1, errors: [{ ruleId: 'R1', source: 'deterministic' }, { ruleId: 'R2', source: 'llm_only' }] },
      { resultId: 's3', rubricVersionId: RV2, errors: [{ ruleId: 'R1', source: 'deterministic' }] },
      { resultId: 's2', rubricVersionId: RV1, errors: [{ ruleId: 'R2', source: 'deterministic' }] },
      { resultId: 's1', rubricVersionId: RV1, errors: [{ ruleId: 'R1', source: 'deterministic' }] },
    ]);
    expect(g.map((x) => x.key)).toEqual([`${RV1}:R1`, `${RV2}:R1`, `${RV1}:R2`, 'multi', 'none']);
  });

  it('hình dạng đủ trường: single mang ruleId và nhãn tạm là ruleId; multi/none không có ruleId', () => {
    const g = groupResults([
      { resultId: 'a', rubricVersionId: RV1, errors: [{ ruleId: 'R1', source: 'deterministic' }] },
      { resultId: 'b', rubricVersionId: RV1, errors: [{ ruleId: 'R1', source: 'llm_only' }, { ruleId: 'R2', source: 'llm_with_tools' }] },
      { resultId: 'c', rubricVersionId: RV1, errors: [] },
    ]);
    expect(g).toEqual([
      {
        key: `${RV1}:R1`,
        label: 'R1',
        description: null,
        sources: ['deterministic'],
        kind: 'single',
        ruleId: 'R1',
        resultIds: ['a'],
        sampleResultIds: ['a'],
      },
      {
        key: 'multi',
        label: MULTI_GROUP_LABEL,
        description: null,
        sources: ['llm_only', 'llm_with_tools'],
        kind: 'multi',
        ruleId: null,
        resultIds: ['b'],
        sampleResultIds: ['b'],
      },
      {
        key: 'none',
        label: NONE_GROUP_LABEL,
        description: null,
        sources: [],
        kind: 'none',
        ruleId: null,
        resultIds: ['c'],
        sampleResultIds: ['c'],
      },
    ]);
  });

  it('kết quả xác định: thứ tự đầu vào không đổi danh sách bài, bài mẫu hay nguồn', () => {
    const rows = ['d', 'b', 'e', 'a', 'c'].map((resultId, i) => ({
      resultId,
      rubricVersionId: RV1,
      errors: [{ ruleId: 'R1', source: i % 2 === 0 ? 'llm_only' : 'deterministic' }],
    }));
    const forward = groupResults(rows);
    const backward = groupResults([...rows].reverse());
    expect(forward).toEqual(backward);
    expect(forward[0].resultIds).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(forward[0].sampleResultIds).toEqual(['a', 'b', 'c']);
    expect(forward[0].sources).toEqual(['deterministic', 'llm_only']);
  });

  it('một luật xuất hiện hai lần trong cùng bài vẫn là bài một lỗi (nhóm single)', () => {
    const g = groupResults([
      {
        resultId: 'a',
        rubricVersionId: RV1,
        errors: [{ ruleId: 'R1', source: 'deterministic' }, { ruleId: 'R1', source: 'llm_only' }],
      },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ key: `${RV1}:R1`, kind: 'single', resultIds: ['a'], sources: ['deterministic', 'llm_only'] });
  });

  it('nguồn không trùng trong một nhóm', () => {
    const g = groupResults([
      { resultId: 'a', rubricVersionId: RV1, errors: [{ ruleId: 'R1', source: 'deterministic' }] },
      { resultId: 'b', rubricVersionId: RV1, errors: [{ ruleId: 'R1', source: 'deterministic' }] },
    ]);
    expect(g[0].sources).toEqual(['deterministic']);
  });

  it('không sửa mảng đầu vào', () => {
    const rows = [
      { resultId: 'b', rubricVersionId: RV1, errors: [{ ruleId: 'R1', source: 'llm_only' }] },
      { resultId: 'a', rubricVersionId: RV1, errors: [{ ruleId: 'R1', source: 'deterministic' }] },
    ];
    const snapshot = JSON.parse(JSON.stringify(rows));
    groupResults(rows);
    expect(rows).toEqual(snapshot);
  });
});
