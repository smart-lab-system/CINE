import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreQs, selectWinningApproach } from './index';
import type { QsApproach, QsStepResult } from './qs.types';

interface PilotFile {
  kind: string;
  problemPoints: number;
  approaches: QsApproach[];
  submissions: { id: string; expectApproach: string | null }[];
}

describe('dsa-qs-01-largest-product pilot', () => {
  const path = join(__dirname, '../../../eval/fixtures/dsa-qs-01-largest-product/qs-pilot.json');
  const pilot = JSON.parse(readFileSync(path, 'utf8')) as PilotFile;

  it('là QS với đủ hướng từ rubric.txt', () => {
    expect(pilot.kind).toBe('qs');
    expect(pilot.approaches.map((a) => a.key)).toEqual([
      'sliding_window',
      'brute_force',
      'prefix_products',
      'two_pointer',
      'logarithm',
    ]);
    expect(pilot.approaches[0].steps.reduce((s, st) => s + st.maxPoints, 0)).toBe(7);
  });

  it('bài đúng sliding window: chọn hướng đó và được full trên thang câu 7', () => {
    const approach = pilot.approaches.find((a) => a.key === 'sliding_window')!;
    const stepResults: QsStepResult[] = approach.steps.map((s) => ({
      stepKey: s.key,
      verdict: 'met',
    }));
    const { selectedApproachKey } = selectWinningApproach(
      pilot.approaches,
      new Map([['sliding_window', stepResults]]),
    );
    expect(selectedApproachKey).toBe('sliding_window');
    const scored = scoreQs({
      approaches: pilot.approaches,
      selectedApproachKey: 'sliding_window',
      stepResults,
      problemPointsHundredths: pilot.problemPoints * 100,
    });
    expect(scored.scoreHundredths).toBe(700);
  });

  it('mọi submission pilot khai expectApproach hợp lệ hoặc null (CE)', () => {
    const keys = new Set(pilot.approaches.map((a) => a.key));
    for (const sub of pilot.submissions) {
      if (sub.expectApproach !== null) expect(keys.has(sub.expectApproach)).toBe(true);
    }
  });
});
