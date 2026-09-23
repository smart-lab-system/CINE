import { join } from 'node:path';
import { ClaudeGradingProvider } from '../grading/ai-provider/claude-grading.provider';
import { KeywordGradingProvider } from '../grading/ai-provider/keyword-grading.provider';
import { selectGradingProvider } from '../grading/ai-provider/select-grading-provider';
import { formatHundredths } from '../grading/scoring/hundredths';
import { runBaseline } from './baseline-runner';
import { loadDataset } from './load-dataset';
import { refuseReason } from './refuse';
import { gitState, makeRunId, writeRun } from './run-writer';

/**
 * `pnpm --filter api eval -- [--tier=fast|full] [--split=dev|test] [--concurrency=3] [--de=<id>]`
 *
 * Runner riêng, KHÔNG phải một file jest (spec 2026-09-20 §12.5 luật 1): gọi
 * model thật, tốn tiền, không mở DB. Kết quả ra `apps/api/eval/runs/<mã>/`.
 */
function arg(name: string, fallback: string): string {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
}

async function main() {
  const tier = arg('tier', 'fast') as 'fast' | 'full';
  const split = arg('split', 'dev') as 'dev' | 'test';
  const concurrency = Number(arg('concurrency', '3'));
  const only = process.argv.find((a) => a.startsWith('--de='))?.slice(5);

  const keyword = new KeywordGradingProvider();
  const provider = selectGradingProvider(new ClaudeGradingProvider(), keyword);
  const refused = refuseReason(process.env, provider, keyword);
  if (refused) {
    console.error(`Từ chối chạy eval: ${refused}`);
    process.exit(2);
  }

  const apiRoot = join(__dirname, '..', '..');
  const dataset = await loadDataset(join(apiRoot, 'eval', 'fixtures'), { split, only });
  if (dataset.des.length === 0) {
    console.error(`Không có đề nào ở tập ${split}${only ? ` khớp ${only}` : ''}`);
    process.exit(2);
  }
  const git = gitState(apiRoot);
  const startedAt = new Date();
  const { records, summary } = await runBaseline({ dataset, provider, tier, concurrency });
  const dir = await writeRun(
    join(apiRoot, 'eval', 'runs'),
    {
      runId: makeRunId(startedAt, git.sha),
      tier,
      split,
      k: tier === 'full' ? 3 : 1,
      gitSha: git.sha,
      gitDirty: git.dirty,
      datasetHash: dataset.datasetHash,
      config: { pipeline: 'baseline', reference: 'note-text', provider: provider.name },
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
    },
    summary,
    records,
  );

  console.log(`\nLượt chạy: ${dir}`);
  if (git.dirty) console.log('⚠ Cây làm việc BẨN lúc chạy — git_sha không tái tạo được đúng lượt này.');
  console.log(`Kết luận cổng: ${summary.verdict}`);
  for (const [gate, g] of Object.entries(summary.gates)) {
    console.log(`  ${gate}: xác nhận ${g.confirmed.length} [${g.confirmed.join(', ')}] · lượt lẻ ${g.odd.length}`);
  }
  if (summary.unstablePairs.length) console.log(`  Cặp injection không ổn định: ${summary.unstablePairs.join(', ')}`);
  for (const d of summary.perDe) {
    console.log(
      `  ${d.de}: ${d.cases} ca · tự duyệt ${(d.autoRate * 100).toFixed(0)}% · ` +
        `MAE ${d.maeHundredths === null ? '—' : formatHundredths(d.maeHundredths)} điểm · ` +
        `khớp kết cục ${(d.outcomeAgreement * 100).toFixed(0)}%`,
    );
  }
  console.log(`  Thời gian mỗi lượt p50 ${summary.wallMs.p50} ms · p95 ${summary.wallMs.p95} ms`);
  console.log(`  Token mỗi lượt p50 ${summary.tokens.p50} · p95 ${summary.tokens.p95}`);
  console.log(`  Model đã trả lời: ${summary.modelsUsed.join(', ') || '—'}`);
  console.log(`  Lượt lỗi: ${summary.errors.length}${summary.errors.length ? ` [${summary.errors.join(', ')}]` : ''}`);
  console.log(`  ${summary.group5}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
