import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { maxApproachPoints, parseDsaRubricText } from './parse-dsa-rubric';

const ROOT = join(__dirname, '../../../../../dsa_vi_03');

describe('parseDsaRubricText', () => {
  it('parse 01_largest_product: 5 hướng, sliding window 7 điểm', () => {
    const text = readFileSync(join(ROOT, '01_largest_product/rubric.txt'), 'utf8');
    const parsed = parseDsaRubricText(text);
    expect(parsed.approaches).toHaveLength(5);
    expect(parsed.approaches[0].name).toMatch(/Sliding Window/i);
    expect(parsed.approaches[0].steps).toHaveLength(6);
    expect(parsed.approaches[0].steps.reduce((s, x) => s + x.maxPoints, 0)).toBe(7);
    expect(maxApproachPoints(parsed.approaches)).toBe(7);
    // Bullet gộp vào bước 3
    expect(parsed.approaches[0].steps[2].description.toLowerCase()).toContain('nhân');
  });

  it('parse 03_maximum_subarray_sum với prefix số trước Solution', () => {
    const text = readFileSync(join(ROOT, '03_maximum_subarray_sum/rubric.txt'), 'utf8');
    const parsed = parseDsaRubricText(text);
    expect(parsed.approaches.length).toBeGreaterThanOrEqual(3);
    expect(parsed.approaches[0].steps[0].maxPoints).toBe(1);
  });

  it('parse 18_palindrome_linked_list', () => {
    const text = readFileSync(join(ROOT, '18_palindrome_linked_list/rubric.txt'), 'utf8');
    const parsed = parseDsaRubricText(text);
    expect(parsed.approaches.length).toBeGreaterThanOrEqual(3);
    for (const a of parsed.approaches) {
      expect(a.steps.length).toBeGreaterThan(0);
    }
  });
});
