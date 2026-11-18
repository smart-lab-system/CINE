import { groupQsApproaches, qsOverviewTotalPoints } from './rubric-overview-qs';

describe('rubric-overview-qs', () => {
  it('groupQsApproaches nhóm bước theo hướng, giữ thứ tự', () => {
    const approaches = groupQsApproaches([
      {
        key: 'bf_s1',
        description: 'Vòng lồng',
        maxPoints: 2,
        errorCount: 1,
        waiverId: null,
        approachKey: 'brute_force',
        approachName: 'Brute force',
        approachSort: 0,
        stepSort: 0,
      },
      {
        key: 'sw_s1',
        description: 'Cửa sổ',
        maxPoints: 3,
        errorCount: 0,
        waiverId: null,
        approachKey: 'sliding',
        approachName: 'Sliding window',
        approachSort: 1,
        stepSort: 0,
      },
      {
        key: 'bf_s2',
        description: 'Cập nhật max',
        maxPoints: 1,
        errorCount: 0,
        waiverId: null,
        approachKey: 'brute_force',
        approachName: 'Brute force',
        approachSort: 0,
        stepSort: 1,
      },
    ]);
    expect(approaches.map((a) => [a.key, a.maxPoints, a.steps.map((s) => s.key)])).toEqual([
      ['brute_force', 3, ['bf_s1', 'bf_s2']],
      ['sliding', 3, ['sw_s1']],
    ]);
  });

  it('qsOverviewTotalPoints = max các hướng', () => {
    expect(
      qsOverviewTotalPoints([
        { key: 'a', name: 'A', maxPoints: 7, steps: [] },
        { key: 'b', name: 'B', maxPoints: 9, steps: [] },
      ]),
    ).toBe(9);
  });
});
