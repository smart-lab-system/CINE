import { familyOf, warnIfSameFamily } from './model-family';

describe('familyOf()', () => {
  it('bỏ tiền tố nhà cung cấp và hậu tố biến thể', () => {
    expect(familyOf('cnb/glm-5.3')).toBe('glm-5.3');
    expect(familyOf('spd/glm-5.3-flash')).toBe('glm-5.3');
    expect(familyOf('claude-sonnet-5')).toBe('claude-sonnet-5');
  });
});

describe('warnIfSameFamily()', () => {
  it('bậc chấm và bậc phản biện cùng họ → gọi log cảnh báo', () => {
    const log = jest.fn();
    warnIfSameFamily(['cnb/glm-5.3'], ['spd/glm-5.3-flash'], log);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('cùng họ'));
  });

  it('khác họ → không log', () => {
    const log = jest.fn();
    warnIfSameFamily(['claude-sonnet-5'], ['spd/glm-5.3-flash'], log);
    expect(log).not.toHaveBeenCalled();
  });
});
