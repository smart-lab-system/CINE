import { groupResults, MULTI_GROUP_LABEL, NONE_GROUP_LABEL } from './review-group';

/** Gom bài theo lỗi của lượt tính mới nhất (spec duyệt nhanh 2026-10-21 §5.4). Hàm thuần: không DB, không tên luật. */
describe('groupResults', () => {
  it('bài cùng một ruleId vào cùng nhóm single', () => {
    const g = groupResults([
      { resultId: 'a', errors: [{ ruleId: 'R1', source: 'llm_with_tools' }] },
      { resultId: 'b', errors: [{ ruleId: 'R1', source: 'deterministic' }] },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ key: 'R1', kind: 'single', resultIds: ['a', 'b'], sampleResultIds: ['a', 'b'] });
    expect(g[0].sources.sort()).toEqual(['deterministic', 'llm_with_tools']);
  });

  it('bài có nhiều lỗi đứng riêng trong nhóm multi', () => {
    const g = groupResults([
      { resultId: 'a', errors: [{ ruleId: 'R1', source: 'deterministic' }, { ruleId: 'R2', source: 'deterministic' }] },
    ]);
    expect(g.find((x) => x.kind === 'multi')!.resultIds).toEqual(['a']);
  });

  it('bài không lỗi đứng riêng trong nhóm none', () => {
    const g = groupResults([{ resultId: 'a', errors: [] }]);
    expect(g[0]).toMatchObject({ key: 'none', kind: 'none' });
  });

  it('cùng luật ở hai phiên bản rubric là hai ruleId, hai nhóm', () => {
    const g = groupResults([
      { resultId: 'a', errors: [{ ruleId: 'R1-v1', source: 'deterministic' }] },
      { resultId: 'b', errors: [{ ruleId: 'R1-v2', source: 'deterministic' }] },
    ]);
    expect(g).toHaveLength(2);
  });

  it('bài mẫu tối đa 3', () => {
    const rows = ['a', 'b', 'c', 'd'].map((resultId) => ({ resultId, errors: [{ ruleId: 'R1', source: 'deterministic' }] }));
    expect(groupResults(rows)[0].sampleResultIds).toEqual(['a', 'b', 'c']);
  });

  it('không có bài nào → không có nhóm nào (không trả nhóm rỗng)', () => {
    expect(groupResults([])).toEqual([]);
  });

  it('thứ tự nhóm: đơn lỗi theo ruleId tăng dần, rồi multi, rồi none', () => {
    const g = groupResults([
      { resultId: 'n1', errors: [] },
      { resultId: 'm1', errors: [{ ruleId: 'R1', source: 'deterministic' }, { ruleId: 'R2', source: 'llm_only' }] },
      { resultId: 's2', errors: [{ ruleId: 'R2', source: 'deterministic' }] },
      { resultId: 's1', errors: [{ ruleId: 'R1', source: 'deterministic' }] },
    ]);
    expect(g.map((x) => x.key)).toEqual(['R1', 'R2', 'multi', 'none']);
  });

  it('hình dạng đủ trường: single mang ruleId và nhãn tạm là ruleId; multi/none không có ruleId', () => {
    const g = groupResults([
      { resultId: 'a', errors: [{ ruleId: 'R1', source: 'deterministic' }] },
      { resultId: 'b', errors: [{ ruleId: 'R1', source: 'llm_only' }, { ruleId: 'R2', source: 'llm_with_tools' }] },
      { resultId: 'c', errors: [] },
    ]);
    expect(g).toEqual([
      {
        key: 'R1',
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
      { resultId: 'a', errors: [{ ruleId: 'R1', source: 'deterministic' }, { ruleId: 'R1', source: 'llm_only' }] },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ key: 'R1', kind: 'single', resultIds: ['a'], sources: ['deterministic', 'llm_only'] });
  });

  it('nguồn không trùng trong một nhóm', () => {
    const g = groupResults([
      { resultId: 'a', errors: [{ ruleId: 'R1', source: 'deterministic' }] },
      { resultId: 'b', errors: [{ ruleId: 'R1', source: 'deterministic' }] },
    ]);
    expect(g[0].sources).toEqual(['deterministic']);
  });

  it('không sửa mảng đầu vào', () => {
    const rows = [
      { resultId: 'b', errors: [{ ruleId: 'R1', source: 'llm_only' }] },
      { resultId: 'a', errors: [{ ruleId: 'R1', source: 'deterministic' }] },
    ];
    const snapshot = JSON.parse(JSON.stringify(rows));
    groupResults(rows);
    expect(rows).toEqual(snapshot);
  });
});
