import { AUTO_APPROVE_CONFIDENCE } from '../grading.types';
import { readAutoBlockedRules, readAutoNoError, readAutoThreshold } from './threshold';

describe('readAutoThreshold — θ (§4.2)', () => {
  it('không đặt → hằng số hôm nay, không cảnh báo', () => {
    expect(readAutoThreshold({})).toEqual({ theta: AUTO_APPROVE_CONFIDENCE, warning: null });
    expect(AUTO_APPROVE_CONFIDENCE).toBe(0.85);
  });

  it('đọc được từ env', () => {
    expect(readAutoThreshold({ GRADING_AUTO_THRESHOLD: '0.9' }).theta).toBe(0.9);
  });

  it('rỗng, chữ, 0, âm, > 1 → mặc định KÈM cảnh báo', () => {
    for (const raw of ['', 'abc', '0', '-0.5', '1.5']) {
      const r = readAutoThreshold({ GRADING_AUTO_THRESHOLD: raw });
      expect(r.theta).toBe(AUTO_APPROVE_CONFIDENCE);
      expect(r.warning).toMatch(/GRADING_AUTO_THRESHOLD/);
    }
  });

  it('T-AUTO-1 — trong decision/ và eval/, CHỈ threshold.ts đọc hằng số; mọi chỗ khác đi qua θ được truyền vào', () => {
    const { readdirSync, readFileSync } = jest.requireActual<typeof import('node:fs')>('node:fs');
    const { join } = jest.requireActual<typeof import('node:path')>('node:path');
    const E = String.fromCharCode(101, 118, 97, 108);
    const dirs = [__dirname, join(__dirname, '..', '..', E)];
    const readers: string[] = [];
    for (const dir of dirs) {
      for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.spec.ts'))) {
        if (readFileSync(join(dir, f), 'utf8').includes('AUTO_APPROVE_CONFIDENCE')) readers.push(f);
      }
    }
    expect(readers).toEqual(['threshold.ts']);
  });
});

describe('readAutoBlockedRules — GRADING_AUTO_BLOCK_RULE_KEYS (§5.2)', () => {
  it('readAutoBlockedRules: chuỗi rỗng hoặc không đặt → tập rỗng, không cảnh báo', () => {
    expect(readAutoBlockedRules({}).keys.size).toBe(0);
    expect(readAutoBlockedRules({ GRADING_AUTO_BLOCK_RULE_KEYS: '' }).keys.size).toBe(0);
    expect(readAutoBlockedRules({}).warning).toBeNull();
    expect(readAutoBlockedRules({ GRADING_AUTO_BLOCK_RULE_KEYS: '' }).warning).toBeNull();
    expect(readAutoBlockedRules({ GRADING_AUTO_BLOCK_RULE_KEYS: '   ' })).toEqual({ keys: new Set(), warning: null });
  });

  it('readAutoBlockedRules: tách dấu phẩy, bỏ khoảng trắng', () => {
    expect([...readAutoBlockedRules({ GRADING_AUTO_BLOCK_RULE_KEYS: ' a , b ' }).keys]).toEqual(['a', 'b']);
  });

  it('bỏ mục rỗng giữa các dấu phẩy; khoá lặp chỉ còn một; khoá lạ KHÔNG cảnh báo (không kiểm với bảng lỗi ở đây)', () => {
    const r = readAutoBlockedRules({ GRADING_AUTO_BLOCK_RULE_KEYS: 'a,,b, ,a,khoa_khong_ton_tai' });
    expect([...r.keys]).toEqual(['a', 'b', 'khoa_khong_ton_tai']);
    expect(r.warning).toBeNull();
  });

  it('đặt mà toàn dấu phẩy (không ra khoá nào) → tập rỗng KÈM cảnh báo: im lặng là giấu một lần gõ nhầm', () => {
    const r = readAutoBlockedRules({ GRADING_AUTO_BLOCK_RULE_KEYS: ' , ,' });
    expect(r.keys.size).toBe(0);
    expect(r.warning).toMatch(/GRADING_AUTO_BLOCK_RULE_KEYS/);
  });
});

describe('readAutoNoError — GRADING_AUTO_NO_ERROR (§5.2)', () => {
  it('readAutoNoError: không đặt → true; "false" → false; giá trị khác → true kèm cảnh báo', () => {
    expect(readAutoNoError({}).enabled).toBe(true);
    expect(readAutoNoError({ GRADING_AUTO_NO_ERROR: 'false' }).enabled).toBe(false);
    expect(readAutoNoError({ GRADING_AUTO_NO_ERROR: 'yes' })).toMatchObject({ enabled: true });
    expect(readAutoNoError({ GRADING_AUTO_NO_ERROR: 'yes' }).warning).not.toBeNull();
  });

  it('"true"/"false" có khoảng trắng hai đầu vẫn nhận, không cảnh báo', () => {
    expect(readAutoNoError({ GRADING_AUTO_NO_ERROR: 'true' })).toEqual({ enabled: true, warning: null });
    expect(readAutoNoError({ GRADING_AUTO_NO_ERROR: ' false ' })).toEqual({ enabled: false, warning: null });
  });

  it('không đặt (undefined) → true, KHÔNG cảnh báo', () => {
    expect(readAutoNoError({})).toEqual({ enabled: true, warning: null });
  });

  it('đặt mà rỗng hay toàn khoảng trắng → true KÈM cảnh báo: công tắc khẩn cấp không được lặng lẽ rơi về giá trị dễ dãi', () => {
    for (const raw of ['', '   ']) {
      const r = readAutoNoError({ GRADING_AUTO_NO_ERROR: raw });
      expect(r.enabled).toBe(true);
      expect(r.warning).not.toBeNull();
      expect(r.warning).toMatch(/GRADING_AUTO_NO_ERROR/);
    }
  });

  it('chỉ đúng "true"/"false" (phân biệt hoa thường): "FALSE", "0", "no" → true KÈM cảnh báo nêu tên biến', () => {
    for (const raw of ['FALSE', '0', 'no', 'off']) {
      const r = readAutoNoError({ GRADING_AUTO_NO_ERROR: raw });
      expect(r.enabled).toBe(true);
      expect(r.warning).toMatch(/GRADING_AUTO_NO_ERROR/);
    }
  });
});
