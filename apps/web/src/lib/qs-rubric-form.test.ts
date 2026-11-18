import { describe, expect, it } from 'vitest';
import {
  buildSaveQsInput,
  hasQsErrors,
  maxApproachCaps,
  newQsApproach,
  validateQsRubric,
} from './qs-rubric-form';

describe('qs-rubric-form', () => {
  it('maxApproachCaps lấy hướng cao nhất', () => {
    const a = newQsApproach('a1', 's1');
    a.name = 'Hướng A';
    a.steps[0].description = 'Bước 1 đủ dài';
    a.steps[0].maxPoints = '4';
    const b = newQsApproach('a2', 's2');
    b.name = 'Hướng B';
    b.steps[0].description = 'Bước 1 đủ dài';
    b.steps[0].maxPoints = '7';
    expect(maxApproachCaps([a, b])).toBe(7);
  });

  it('validate + buildSaveQsInput', () => {
    const a = newQsApproach('a1', 's1');
    a.name = 'DP';
    a.steps[0].description = 'Khởi tạo bảng';
    a.steps[0].maxPoints = '5';
    const errors = validateQsRubric(
      { name: 'Bai 1', nameEditable: true, existingNames: [], totalPoints: '10' },
      [a],
    );
    expect(hasQsErrors(errors)).toBe(false);
    const body = buildSaveQsInput('Bai 1', [a]);
    expect(body.kind).toBe('qs');
    expect(body.approaches).toHaveLength(1);
    expect(body.approaches[0].steps[0].maxPoints).toBe(5);
  });
});
