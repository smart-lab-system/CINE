import { parseEvalArgs } from './cli-args';

describe('parseEvalArgs — review I2', () => {
  it('mặc định: fast, dev, 3 luồng, mọi đề', () => {
    expect(parseEvalArgs([])).toEqual({ ok: true, args: { tier: 'fast', split: 'dev', concurrency: 3, only: undefined } });
  });

  it('đọc đủ các cờ, bỏ qua "--" mà pnpm chèn vào', () => {
    expect(parseEvalArgs(['--', '--tier=full', '--split=test', '--concurrency=2', '--de=sap-xep'])).toEqual({
      ok: true,
      args: { tier: 'full', split: 'test', concurrency: 2, only: 'sap-xep' },
    });
  });

  it.each([
    ['--tier=ful', /tier/],
    ['--split=prod', /split/],
    ['--concurrency=abc', /concurrency/],
    ['--concurrency=0', /concurrency/],
    ['--concurrency=1.5', /concurrency/],
  ])('%s → lỗi nêu đúng cờ, không chạy với giá trị đoán', (flag, re) => {
    const r = parseEvalArgs([flag]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(re);
  });
});
