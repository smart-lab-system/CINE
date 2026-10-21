import { BREAKER_ALPHA, BREAKER_P0, binomialTailAtLeast, breakerVerdict } from './breaker-verdict';

/** Chuẩn đối chiếu: cộng thẳng từng số hạng bằng giai thừa. CHỈ dùng cho n nhỏ (n <= 20) trong test. */
const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
const naiveTail = (n: number, d: number, p: number): number => {
  let sum = 0;
  for (let k = d; k <= n; k++) {
    sum += (factorial(n) / (factorial(k) * factorial(n - k))) * p ** k * (1 - p) ** (n - k);
  }
  return sum;
};

describe('hằng số của cầu dao (spec §5.3)', () => {
  it('p0 = 0,05 và alpha = 0,05', () => {
    expect(BREAKER_P0).toBe(0.05);
    expect(BREAKER_ALPHA).toBe(0.05);
  });
});

describe('breakerVerdict — các ví dụ của spec §5.3', () => {
  it.each([
    [1, 1, false],
    [2, 2, true],
    [5, 1, false],
    [5, 2, true],
    [20, 3, false],
    [20, 4, true],
  ])('n=%i d=%i → trip=%s', (n, d, trip) => {
    expect(breakerVerdict({ n, disagreements: d }).trip).toBe(trip);
  });

  it('n=0 → không tắt, pValue = 1', () => {
    expect(breakerVerdict({ n: 0, disagreements: 0 })).toEqual({ trip: false, pValue: 1 });
  });

  it('d = 0 → không tắt, pValue đúng bằng 1 (không phải xấp xỉ)', () => {
    for (const n of [1, 5, 20, 1000]) {
      expect(breakerVerdict({ n, disagreements: 0 })).toEqual({ trip: false, pValue: 1 });
    }
  });

  it('so sánh NGHIÊM NGẶT: n=1, d=1 có pValue không thấp hơn alpha nên không tắt', () => {
    const v = breakerVerdict({ n: 1, disagreements: 1 });
    expect(v.pValue).not.toBeLessThan(BREAKER_ALPHA);
    expect(v.trip).toBe(false);
  });

  it('trả pValue cùng giá trị với binomialTailAtLeast ở p0', () => {
    const v = breakerVerdict({ n: 20, disagreements: 4 });
    expect(v.pValue).toBe(binomialTailAtLeast(20, 4, BREAKER_P0));
    expect(v.trip).toBe(v.pValue < BREAKER_ALPHA);
  });

  it('nhiều bất đồng hơn thì không bao giờ ít chắc hơn: tắt ở d thì tắt ở mọi d lớn hơn (cùng n)', () => {
    for (const n of [1, 2, 5, 10, 20, 50, 200]) {
      let tripped = false;
      for (let d = 0; d <= n; d++) {
        const { trip } = breakerVerdict({ n, disagreements: d });
        if (tripped) expect(trip).toBe(true);
        tripped = tripped || trip;
      }
    }
  });
});

describe('binomialTailAtLeast', () => {
  it('(2, 2, 0.05) ≈ 0,0025', () => {
    expect(binomialTailAtLeast(2, 2, 0.05)).toBeCloseTo(0.0025, 6);
  });

  it('d = 0 → đúng bằng 1', () => {
    expect(binomialTailAtLeast(0, 0, 0.05)).toBe(1);
    expect(binomialTailAtLeast(10, 0, 0.05)).toBe(1);
    expect(binomialTailAtLeast(10, 0, 0.5)).toBe(1);
  });

  it('khớp phép cộng thẳng bằng giai thừa với n <= 20', () => {
    for (const p of [0.05, 0.3, 0.5, 0.9]) {
      for (let n = 1; n <= 20; n++) {
        for (let d = 1; d <= n; d++) {
          const expected = naiveTail(n, d, p);
          const actual = binomialTailAtLeast(n, d, p);
          // sai số tương đối, vì đuôi có thể rất nhỏ
          expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-12 * Math.max(expected, 1e-300));
        }
      }
    }
  });

  it('d = n → p^n (không bị làm tròn qua log)', () => {
    expect(binomialTailAtLeast(1, 1, 0.05)).toBe(0.05);
    expect(binomialTailAtLeast(3, 3, 0.5)).toBe(0.125);
  });

  it('p = 0 và p = 1 là các biên suy biến', () => {
    expect(binomialTailAtLeast(10, 0, 0)).toBe(1);
    expect(binomialTailAtLeast(10, 1, 0)).toBe(0);
    expect(binomialTailAtLeast(10, 10, 1)).toBe(1);
    expect(binomialTailAtLeast(10, 4, 1)).toBe(1);
  });

  it('n lớn không tràn số và không về 0 giả: n=50000, d=1 gần 1', () => {
    // q^n = 0,95^50000 tràn dưới (underflow) nếu tính tuyến tính từ số hạng đầu; đuôi thật ≈ 1.
    const v = binomialTailAtLeast(50_000, 1, 0.05);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeCloseTo(1, 12);
  });

  it('n lớn: đuôi quanh trung bình ≈ 0,5 và nằm trong [0, 1]', () => {
    const v = binomialTailAtLeast(100_000, 5_000, 0.05);
    expect(v).toBeGreaterThan(0.45);
    expect(v).toBeLessThan(0.55);
  });

  it('n lớn, d xa trung bình → rất nhỏ nhưng không âm, không NaN', () => {
    const v = binomialTailAtLeast(100_000, 6_000, 0.05);
    expect(Number.isNaN(v)).toBe(false);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1e-20);
  });

  it('không tăng theo d và luôn trong [0, 1] (n = 2000)', () => {
    let prev = 1;
    for (let d = 0; d <= 2000; d += 25) {
      const v = binomialTailAtLeast(2000, d, 0.05);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it('p ngoài [0, 1] hoặc NaN → RangeError', () => {
    expect(() => binomialTailAtLeast(5, 1, -0.1)).toThrow(RangeError);
    expect(() => binomialTailAtLeast(5, 1, 1.1)).toThrow(RangeError);
    expect(() => binomialTailAtLeast(5, 1, Number.NaN)).toThrow(RangeError);
  });
});

describe('kiểm tra tham số → RangeError', () => {
  it('d > n, d âm hoặc không nguyên', () => {
    expect(() => breakerVerdict({ n: 2, disagreements: 3 })).toThrow(RangeError);
    expect(() => breakerVerdict({ n: 2, disagreements: -1 })).toThrow(RangeError);
    expect(() => breakerVerdict({ n: 2, disagreements: 0.5 })).toThrow(RangeError);
  });

  it('n âm hoặc không nguyên', () => {
    expect(() => breakerVerdict({ n: -1, disagreements: 0 })).toThrow(RangeError);
    expect(() => breakerVerdict({ n: 1.5, disagreements: 0 })).toThrow(RangeError);
  });

  it('NaN và Infinity bị từ chối', () => {
    expect(() => breakerVerdict({ n: Number.NaN, disagreements: 0 })).toThrow(RangeError);
    expect(() => breakerVerdict({ n: Number.POSITIVE_INFINITY, disagreements: 0 })).toThrow(RangeError);
    expect(() => breakerVerdict({ n: 5, disagreements: Number.NaN })).toThrow(RangeError);
  });

  it('n = 0 mà d > 0 là d > n → RangeError', () => {
    expect(() => breakerVerdict({ n: 0, disagreements: 1 })).toThrow(RangeError);
  });

  it('binomialTailAtLeast cũng kiểm tra n và d', () => {
    expect(() => binomialTailAtLeast(-1, 0, 0.05)).toThrow(RangeError);
    expect(() => binomialTailAtLeast(2, 3, 0.05)).toThrow(RangeError);
    expect(() => binomialTailAtLeast(2, 0.5, 0.05)).toThrow(RangeError);
  });
});
