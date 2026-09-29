import { describe, expect, it } from 'vitest';
import {
  MATCH_KIND_LABEL,
  describeRecompute,
  formatDeductionString,
  matchKindOf,
  originLabel,
  parseDeductionInput,
  slugifyRuleKey,
} from './rules-vocab';

const rule = (checkedBy: 'machine' | 'model', predicate: unknown) => ({
  checkedBy,
  revision: { predicate },
});

describe('matchKindOf (spec §2.2)', () => {
  it('máy đo được → machine', () => {
    expect(matchKindOf(rule('machine', { kind: 'test_group_failed', group: 'bien' }))).toBe('machine');
  });
  it('có predicate nhưng checkedBy=model → unmeasured (KHÔNG được coi là máy kiểm được)', () => {
    expect(matchKindOf(rule('model', { kind: 'calls_function', name: 'sort' }))).toBe('unmeasured');
    expect(matchKindOf(rule('model', { kind: 'complexity_exceeds_required' }))).toBe('unmeasured');
  });
  it('không có predicate → words', () => {
    expect(matchKindOf(rule('model', null))).toBe('words');
  });
  it('nhãn theo bảng quy đổi', () => {
    expect(MATCH_KIND_LABEL.machine).toBe('Máy kiểm');
    expect(MATCH_KIND_LABEL.unmeasured).toBe('Máy chưa đo được');
    expect(MATCH_KIND_LABEL.words).toBe('Bằng lời');
  });
});

describe('originLabel', () => {
  it('dịch nguồn của luật', () => {
    expect(originLabel('teacher')).toBe('của bạn');
    expect(originLabel('seed')).toBe('luật mồi');
    expect(originLabel('agent_reported')).toBe('agent đề xuất');
  });
  it('nguồn lạ vẫn hiện tên, không nuốt', () => {
    expect(originLabel('future_origin')).toBe('future_origin');
  });
});

describe('formatDeductionString', () => {
  it('"1.50" → "−1,5" (dấu trừ U+2212, dấu phẩy)', () => {
    expect(formatDeductionString('1.50')).toBe('−1,5');
  });
  it('0 hiện "0", không phải "−0,0"', () => {
    expect(formatDeductionString('0.00')).toBe('0');
  });
  it('null → "—"', () => {
    expect(formatDeductionString(null)).toBe('—');
  });
});

describe('parseDeductionInput (khớp regex của server /^(\\d{1,4})(?:\\.(\\d{1,2}))?$/)', () => {
  it.each([
    ['1,5', '1.5'],
    [' 2 ', '2'],
    ['0', '0'],
    ['0.25', '0.25'],
    ['1234.5', '1234.5'],
  ])('%j hợp lệ → %j', (raw, value) => {
    expect(parseDeductionInput(raw)).toEqual({ ok: true, value });
  });

  it('để trống = chưa có giá → null (không phải bỏ qua)', () => {
    expect(parseDeductionInput('')).toEqual({ ok: true, value: null });
    expect(parseDeductionInput('   ')).toEqual({ ok: true, value: null });
  });

  it.each(['abc', '-1', '1.234', '12345', '1,2,3', '1e3', '--'])('%j bị chặn kèm thông báo', (raw) => {
    const out = parseDeductionInput(raw);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toBe('Mức trừ: số không âm, tối đa hai chữ số lẻ.');
  });
});

describe('slugifyRuleKey (server: /^[a-z0-9_]{1,64}$/)', () => {
  it('bỏ dấu tiếng Việt, kể cả đ', () => {
    expect(slugifyRuleKey('Tên biến không nói lên vai trò')).toBe('ten_bien_khong_noi_len_vai_tro');
    expect(slugifyRuleKey('Đệ quy')).toBe('de_quy');
  });
  it('không bao giờ dài quá 64 ký tự và luôn khớp regex của server', () => {
    const key = slugifyRuleKey('a'.repeat(200));
    expect(key.length).toBeLessThanOrEqual(64);
    expect(key).toMatch(/^[a-z0-9_]{1,64}$/);
  });
  it('rút gọn dấu gạch dưới thừa, cắt hai đầu', () => {
    expect(slugifyRuleKey('  --Sập ở mảng rỗng!!  ')).toBe('sap_o_mang_rong');
  });
  it('không còn ký tự hợp lệ nào → khoá dự phòng', () => {
    expect(slugifyRuleKey('???')).toBe('luat_moi');
  });
});

describe('describeRecompute (kết quả tính lại đọc bằng lời — spec §3.1)', () => {
  it('không bài nào bị ảnh hưởng', () => {
    expect(describeRecompute({ recomputed: 0, promoted: 0, demoted: 0, belowFloor: 0 })).toBe(
      'Không có bài nào bị ảnh hưởng.',
    );
  });

  it('nói đủ từng phần: lên tự quyết, về "Cần bạn xem", dưới sàn', () => {
    expect(describeRecompute({ recomputed: 7, promoted: 5, demoted: 1, belowFloor: 2 })).toBe(
      'Đã tính lại 7 bài: 5 bài đủ điều kiện tự quyết; 1 bài chuyển về "Cần bạn xem"; 2 bài chưa cho điểm được (dưới sàn).',
    );
  });

  it('tính lại nhưng không bài nào đổi nhóm', () => {
    expect(describeRecompute({ recomputed: 3, promoted: 0, demoted: 0, belowFloor: 0 })).toBe(
      'Đã tính lại 3 bài, không bài nào đổi nhóm.',
    );
  });

  it('null (luật bằng lời không áp ngược) → nói đúng như vậy, không im lặng', () => {
    expect(describeRecompute(null)).toBe('Luật này không tính lại bài nào đã chấm — chỉ áp cho phiên chấm sau.');
  });
});
