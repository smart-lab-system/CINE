import { promptVersionOf } from './prompt-version';

describe('promptVersionOf()', () => {
  it('12 ký tự hex, ổn định giữa các lần gọi', () => {
    expect(promptVersionOf()).toMatch(/^[0-9a-f]{12}$/);
    expect(promptVersionOf()).toBe(promptVersionOf());
  });
});
