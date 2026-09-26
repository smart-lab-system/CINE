import { GRADING_LOCKED_SQL } from './grading-lock';

describe('luật đóng băng — câu chữ (§2.3 luật 6)', () => {
  it.each([
    ["'ai_grading', 'ai_graded'", 'đang chấm'],
    ['ai_total_score IS NOT NULL', 'điểm AI'],
    ['t.final_score IS NOT NULL', 'chấm tay'],
    ['score_computation', 'lượt tính điểm'],
  ])('có vế %s (%s)', (fragment) => {
    expect(GRADING_LOCKED_SQL).toContain(fragment);
  });
});
