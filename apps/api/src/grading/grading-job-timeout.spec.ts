import { gradeJobTimeoutMs } from './grading.queue';
import { CHALLENGE_PHASE_BUDGET_MS } from './investigator/lens-loop';

describe('gradeJobTimeoutMs — trần giờ job phải rộng hơn trần giờ điều tra (§7)', () => {
  it('mặc định = trần giờ điều tra + 60 s + ngân sách pha phản biện (bước 6): job không bị giết đúng lúc investigate() hay bốn lăng kính đang tự dừng có trật tự', () => {
    expect(gradeJobTimeoutMs({})).toBe(300_000 + 60_000 + CHALLENGE_PHASE_BUDGET_MS);
    expect(gradeJobTimeoutMs({ INVESTIGATE_MAX_WALL_MS: '600000' })).toBe(660_000 + CHALLENGE_PHASE_BUDGET_MS);
  });

  it('GRADE_JOB_TIMEOUT_MS đặt tay thì thắng; đặt sai thì từ chối khởi động (luật của envPositiveInt)', () => {
    expect(gradeJobTimeoutMs({ GRADE_JOB_TIMEOUT_MS: '120000' })).toBe(120_000);
    expect(() => gradeJobTimeoutMs({ GRADE_JOB_TIMEOUT_MS: 'abc' })).toThrow(/không phải số nguyên dương/);
  });
});
