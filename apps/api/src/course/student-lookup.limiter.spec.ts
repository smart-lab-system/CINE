import { StudentLookupLimiter } from './student-lookup.limiter';

describe('StudentLookupLimiter', () => {
  let now = 1_000_000;
  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  it('cho 30 lần trong một phút, lần thứ 31 bị chặn và báo còn bao lâu', () => {
    const limiter = new StudentLookupLimiter();
    for (let i = 0; i < 30; i++) {
      expect(limiter.consume('gv1')).toEqual({ allowed: true });
      now += 100;
    }
    const verdict = limiter.consume('gv1');
    expect(verdict.allowed).toBe(false);
    // Lần đầu là lúc 1_000_000; cửa sổ 60_000 ms; hiện tại 1_003_000.
    expect(verdict).toEqual({ allowed: false, retryAfterMs: 57_000 });
  });

  it('cửa sổ trượt: lần cũ nhất rơi ra thì có chỗ trống', () => {
    const limiter = new StudentLookupLimiter();
    for (let i = 0; i < 30; i++) limiter.consume('gv1');
    expect(limiter.consume('gv1').allowed).toBe(false);
    now += 60_001;
    expect(limiter.consume('gv1')).toEqual({ allowed: true });
  });

  it('mỗi giảng viên một phần riêng — người này hết lượt không chặn người kia', () => {
    const limiter = new StudentLookupLimiter();
    for (let i = 0; i < 30; i++) limiter.consume('gv1');
    expect(limiter.consume('gv1').allowed).toBe(false);
    expect(limiter.consume('gv2')).toEqual({ allowed: true });
  });

  it('lần bị chặn KHÔNG tính vào hạn mức (không tự kéo dài việc bị chặn)', () => {
    const limiter = new StudentLookupLimiter();
    for (let i = 0; i < 30; i++) limiter.consume('gv1');
    for (let i = 0; i < 50; i++) limiter.consume('gv1');
    now += 60_001;
    expect(limiter.consume('gv1')).toEqual({ allowed: true });
  });
});
