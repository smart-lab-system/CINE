export interface EvalArgs {
  tier: 'fast' | 'full';
  split: 'dev' | 'test';
  concurrency: number;
  only: string | undefined;
}

/**
 * Đọc cờ của lệnh `eval`. Giá trị sai thì báo lỗi, không đoán: `--tier=ful`
 * từng âm thầm thành k = 1 không chạy bù (cổng không bao giờ đỏ), và
 * `--concurrency=abc` thành NaN — không lượt nào chạy mà kết luận vẫn xanh.
 */
export function parseEvalArgs(argv: string[]): { ok: true; args: EvalArgs } | { ok: false; error: string } {
  const get = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

  const tier = get('tier') ?? 'fast';
  if (tier !== 'fast' && tier !== 'full') {
    return { ok: false, error: `--tier phải là fast hoặc full, đang là ${JSON.stringify(tier)}` };
  }
  const split = get('split') ?? 'dev';
  if (split !== 'dev' && split !== 'test') {
    return { ok: false, error: `--split phải là dev hoặc test, đang là ${JSON.stringify(split)}` };
  }
  const rawConcurrency = get('concurrency') ?? '3';
  const concurrency = Number(rawConcurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    return { ok: false, error: `--concurrency phải là số nguyên ≥ 1, đang là ${JSON.stringify(rawConcurrency)}` };
  }
  return { ok: true, args: { tier, split, concurrency, only: get('de') } };
}
