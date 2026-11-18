import { scoreQs } from './score-qs';
import { selectWinningApproach } from './select-approach';
import type { QsApproach, QsStepResult } from './qs.types';

const sliding: QsApproach = {
  key: 'sliding_window',
  name: 'Sliding Window',
  steps: [
    { key: 'sw_bounds', description: 'bounds', maxPoints: 1 },
    { key: 'sw_track', description: 'track', maxPoints: 1 },
    { key: 'sw_logic', description: 'logic', maxPoints: 2 },
    { key: 'sw_update', description: 'update', maxPoints: 1 },
    { key: 'sw_divide', description: 'divide', maxPoints: 1 },
    { key: 'sw_return', description: 'return', maxPoints: 1 },
  ],
};

const brute: QsApproach = {
  key: 'brute_force',
  name: 'Brute Force',
  steps: [
    { key: 'bf_loops', description: 'loops', maxPoints: 1 },
    { key: 'bf_product', description: 'product', maxPoints: 1 },
    { key: 'bf_max', description: 'max', maxPoints: 1 },
    { key: 'bf_edge', description: 'edge', maxPoints: 1 },
    { key: 'bf_complexity', description: 'complexity', maxPoints: 1 },
  ],
};

/** Hướng A = 7, B = 9 — ví dụ quy đổi theo M = 9. */
const approachA7: QsApproach = {
  key: 'a7',
  name: 'A',
  steps: Array.from({ length: 7 }, (_, i) => ({
    key: `a${i}`,
    description: `a${i}`,
    maxPoints: 1,
  })),
};

const approachB9: QsApproach = {
  key: 'b9',
  name: 'B',
  steps: Array.from({ length: 9 }, (_, i) => ({
    key: `b${i}`,
    description: `b${i}`,
    maxPoints: 1,
  })),
};

const allMet = (approach: QsApproach): QsStepResult[] =>
  approach.steps.map((s) => ({ stepKey: s.key, verdict: 'met' as const }));

describe('scoreQs', () => {
  it('một hướng: M = tổng hướng đó; full → full thang', () => {
    const out = scoreQs({
      approaches: [sliding],
      selectedApproachKey: 'sliding_window',
      stepResults: allMet(sliding),
    });
    expect(out.approachMaxHundredths).toBe(700);
    expect(out.scaleMaxHundredths).toBe(700);
    expect(out.earnedHundredths).toBe(700);
    expect(out.scoreHundredths).toBe(700);
  });

  it('quy theo M = max mọi hướng: A full 7, B max 9, câu 5đ → 7/9×5', () => {
    const out = scoreQs({
      approaches: [approachA7, approachB9],
      selectedApproachKey: 'a7',
      stepResults: allMet(approachA7),
      problemPointsHundredths: 500,
    });
    expect(out.scaleMaxHundredths).toBe(900);
    expect(out.earnedHundredths).toBe(700);
    // 700/900*500 = 388.8… → 389
    expect(out.scoreHundredths).toBe(389);
  });

  it('hướng B full trên M=9, câu 5đ → 5', () => {
    const out = scoreQs({
      approaches: [approachA7, approachB9],
      selectedApproachKey: 'b9',
      stepResults: allMet(approachB9),
      problemPointsHundredths: 500,
    });
    expect(out.scoreHundredths).toBe(500);
  });

  it('quy về điểm câu khi chỉ một hướng (M = tổng hướng)', () => {
    const out = scoreQs({
      approaches: [brute],
      selectedApproachKey: 'brute_force',
      stepResults: allMet(brute),
      problemPointsHundredths: 1000,
    });
    expect(out.earnedHundredths).toBe(500);
    expect(out.scoreHundredths).toBe(1000);
  });

  it('partially_met lấy một nửa mark bước; mẫu số vẫn là M', () => {
    const out = scoreQs({
      approaches: [brute, sliding],
      selectedApproachKey: 'brute_force',
      stepResults: [
        { stepKey: 'bf_loops', verdict: 'met' },
        { stepKey: 'bf_product', verdict: 'partially_met' },
        { stepKey: 'bf_max', verdict: 'not_met' },
        { stepKey: 'bf_edge', verdict: 'not_met' },
        { stepKey: 'bf_complexity', verdict: 'not_met' },
      ],
    });
    // earned 150; M = sliding 700; mặc định problemPoints = 700 → 150/700*700 = 150
    expect(out.earnedHundredths).toBe(150);
    expect(out.scaleMaxHundredths).toBe(700);
    expect(out.scoreHundredths).toBe(150);
  });

  it('bước thiếu trong stepResults coi như not_met', () => {
    const out = scoreQs({
      approaches: [brute],
      selectedApproachKey: 'brute_force',
      stepResults: [{ stepKey: 'bf_loops', verdict: 'met' }],
    });
    expect(out.earnedHundredths).toBe(100);
  });

  it('ném khi hướng không tồn tại', () => {
    expect(() =>
      scoreQs({ approaches: [brute], selectedApproachKey: 'nope', stepResults: [] }),
    ).toThrow(/không có/);
  });
});

describe('selectWinningApproach', () => {
  it('chọn hướng earned cao hơn — không cộng dồn hai hướng', () => {
    const map = new Map<string, QsStepResult[]>([
      ['sliding_window', allMet(sliding)],
      [
        'brute_force',
        [
          { stepKey: 'bf_loops', verdict: 'met' },
          { stepKey: 'bf_product', verdict: 'not_met' },
          { stepKey: 'bf_max', verdict: 'not_met' },
          { stepKey: 'bf_edge', verdict: 'not_met' },
          { stepKey: 'bf_complexity', verdict: 'not_met' },
        ],
      ],
    ]);
    const { selectedApproachKey, candidates } = selectWinningApproach([sliding, brute], map);
    expect(selectedApproachKey).toBe('sliding_window');
    expect(candidates).toHaveLength(2);
  });

  it('hòa earned → giữ hướng đứng trước trong danh sách', () => {
    const half = (a: QsApproach): QsStepResult[] =>
      a.steps.map((s, i) => ({
        stepKey: s.key,
        verdict: i === 0 ? ('met' as const) : ('not_met' as const),
      }));
    const { selectedApproachKey } = selectWinningApproach(
      [sliding, brute],
      new Map([
        ['sliding_window', half(sliding)],
        ['brute_force', half(brute)],
      ]),
    );
    expect(selectedApproachKey).toBe('sliding_window');
  });
});
