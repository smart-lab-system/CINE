export interface EvalArgs {
  tier: 'fast' | 'full';
  split: 'dev' | 'test';
  concurrency: number;
  only: string | undefined;
  pipeline: 'baseline' | 'investigator';
  /** Mã một lượt chạy cũ để so ghép cặp (§12.4). */
  compareTo: string | undefined;
  replayCheck: boolean;
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
  const pipeline = get('pipeline') ?? 'baseline';
  if (pipeline !== 'baseline' && pipeline !== 'investigator') {
    return { ok: false, error: `--pipeline phải là baseline hoặc investigator, đang là ${JSON.stringify(pipeline)}` };
  }
  const compareTo = get('compare-to');
  // Đúng hình dạng của makeRunId (+ hậu tố -2, -3… khi trùng): không thể là một đường dẫn.
  if (compareTo !== undefined && !/^\d{8}T\d{6}Z-[0-9a-f]{7}(-\d+)?$/.test(compareTo)) {
    return { ok: false, error: `--compare-to phải là một mã lượt chạy, đang là ${JSON.stringify(compareTo)}` };
  }
  const rawReplay = get('replay-check') ?? 'on';
  if (rawReplay !== 'on' && rawReplay !== 'off') {
    return { ok: false, error: `--replay-check phải là on hoặc off, đang là ${JSON.stringify(rawReplay)}` };
  }
  return {
    ok: true,
    args: { tier, split, concurrency, only: get('de'), pipeline, compareTo, replayCheck: rawReplay === 'on' },
  };
}
