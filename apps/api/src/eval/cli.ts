import { join } from 'node:path';
import { ClaudeGradingProvider } from '../grading/ai-provider/claude-grading.provider';
import { KeywordGradingProvider } from '../grading/ai-provider/keyword-grading.provider';
import { selectGradingProvider } from '../grading/ai-provider/select-grading-provider';
import { formatHundredths } from '../grading/scoring/hundredths';
import { runBaseline } from './baseline-runner';
import { parseEvalArgs } from './cli-args';
import { loadDataset } from './load-dataset';
import { ALL_COMPONENTS } from '../grading/investigator/investigate';
import { readAutoThreshold } from '../grading/decision/threshold';
import { readInvestigationBudget } from '../grading/investigator/budget';
import { buildInvestigatorTiers } from '../grading/investigator/model-pool';
import { HostFingerprint } from '../sandbox/contract';
import { createSandboxClient } from '../sandbox/sandbox.client';
import { compareRuns, modelConfound } from './compare';
import { group5Gate, trackedPrivateFiles, withoutGroup5 } from './group5';
import { runInvestigator } from './investigator-runner';
import { DockerProgramRunner, dockerImageId } from './program-runner';
import { refuseInvestigator, refuseReason } from './refuse';
import { CaseRecord, RunSummary } from './runner-core';
import { gitState, makeRunId, readRun, RunMeta, writeRun } from './run-writer';
import { readEvalSandboxConfig } from './sandbox-config';
import { BUNDLE_GENERATOR_IMAGE, buildTestBundle, checkBundleOnWorker, FrozenBundle } from './test-bundle';

/**
 * `pnpm --filter api eval -- [--tier=fast|full] [--split=dev|test] [--concurrency=3] [--de=<id>]`
 *
 * Runner riêng, KHÔNG phải một file jest (spec 2026-09-20 §12.5 luật 1): gọi
 * model thật, tốn tiền, không mở DB. Kết quả ra `apps/api/eval/runs/<mã>/`.
 */
async function main() {
  const parsed = parseEvalArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`Từ chối chạy eval: ${parsed.error}`);
    process.exit(2);
  }
  const { tier, split, concurrency, only, pipeline, compareTo, replayCheck } = parsed.args;
  const apiRoot = join(__dirname, '..', '..');
  const runsRoot = join(apiRoot, 'eval', 'runs');
  const dataset = await loadDataset(join(apiRoot, 'eval', 'fixtures'), { split, only });
  if (dataset.des.length === 0) {
    console.error(`Không có đề nào ở tập ${split}${only ? ` khớp ${only}` : ''}`);
    process.exit(2);
  }

  // So ghép cặp chỉ có nghĩa trên CÙNG bộ dữ liệu. Đọc và kiểm TRƯỚC khi tiêu tiền.
  let baseRun: { meta: RunMeta; records: CaseRecord[] } | undefined;
  if (compareTo) {
    baseRun = await readRun(runsRoot, compareTo);
    if (baseRun.meta.datasetHash !== dataset.datasetHash) {
      console.error(
        `Từ chối so với ${compareTo}: lượt đó chạy trên bộ dữ liệu khác ` +
          `(datasetHash ${baseRun.meta.datasetHash.slice(0, 12)} ≠ ${dataset.datasetHash.slice(0, 12)})`,
      );
      process.exit(2);
    }
  }
  const git = gitState(apiRoot);
  const leaked = trackedPrivateFiles(apiRoot);
  if (leaked.length > 0) {
    console.error(`Từ chối chạy eval: bài nhóm 5 đang bị git theo dõi — ${leaked.join(', ')} (T-EVAL-6). Gỡ khỏi git trước.`);
    process.exit(2);
  }
  const startedAt = new Date();

  let records: CaseRecord[];
  let summary: RunSummary;
  let config: RunMeta['config'];
  if (pipeline === 'baseline') {
    const keyword = new KeywordGradingProvider();
    const provider = selectGradingProvider(new ClaudeGradingProvider(), keyword);
    const refused = refuseReason(process.env, provider, keyword);
    if (refused) {
      console.error(`Từ chối chạy eval: ${refused}`);
      process.exit(2);
    }
    ({ records, summary } = await runBaseline({ dataset, provider, tier, concurrency, stubModels: [keyword.name] }));
    config = { pipeline: 'baseline', reference: 'note-text', provider: provider.name };
  } else {
    const tiers = buildInvestigatorTiers();
    const sandboxCfg = readEvalSandboxConfig(process.env);
    const refused = refuseInvestigator(process.env, tiers, sandboxCfg);
    if (refused || !sandboxCfg.ok) {
      console.error(`Từ chối chạy eval: ${refused}`);
      process.exit(2);
    }
    const { budget, warnings } = readInvestigationBudget(process.env);
    // θ của công thức tự quyết (§4.2) — một chỗ đọc, truyền xuống decide().
    const { theta, warning: thetaWarning } = readAutoThreshold(process.env);
    if (thetaWarning) console.warn(`⚠ ${thetaWarning}`);
    for (const w of warnings) console.warn(`⚠ ${w}`);
    // Duyệt Q5 lớp 1: sinh output mong đợi bằng ĐÚNG image của worker.
    const generatorImageId = await dockerImageId(BUNDLE_GENERATOR_IMAGE);
    if (!generatorImageId) {
      console.error(`Từ chối chạy eval: thiếu image ${BUNDLE_GENERATOR_IMAGE} — chạy pnpm --filter api sandbox:images`);
      process.exit(2);
    }
    const generator = new DockerProgramRunner({ image: BUNDLE_GENERATOR_IMAGE });
    const bundles = new Map<string, FrozenBundle>();
    for (const de of dataset.des) bundles.set(de.manifest.id, await buildTestBundle(de, generator));
    const { client, close } = createSandboxClient({
      redisUrl: sandboxCfg.config.redisUrl,
      prefix: sandboxCfg.config.prefix,
      // Hạn chờ của client = budgetMs của job + số này. Job của vòng điều tra đã mang budgetMs theo
      // phần thời gian còn lại (review I1), nên đây là chỗ duy nhất còn vượt được trần §7 — giữ nhỏ.
      queueWaitMs: { exec: 30_000, measure: 60_000 },
      log: (line) => console.warn(`⚠ ${line}`),
    });
    const components = { ...ALL_COMPONENTS, replayCheck };
    try {
      // Duyệt Q5 lớp 2: đáp án mẫu phải đạt 100% gói của chính nó trên worker thật, TRƯỚC bài đầu tiên.
      let host: HostFingerprint | null = null;
      for (const de of dataset.des) {
        const check = await checkBundleOnWorker(de, bundles.get(de.manifest.id)!, client);
        if (!check.ok) {
          console.error(`Lỗi hạ tầng — dừng lượt chạy, chưa chấm bài nào: ${check.reason}`);
          await close();
          process.exit(3);
        }
        host = check.host;
      }
      if (host && host.images.cpp !== generatorImageId) {
        console.warn(`⚠ Image của bộ sinh (${generatorImageId}) khác image của worker (${host.images.cpp}). Phép kiểm tự nhất quán đã đạt; ghi lại để truy.`);
      }
      // Duyệt Q8: bài thật chỉ chạy trên máy sandbox riêng.
      const gate = group5Gate(host, process.env);
      const { dataset: runDataset, dropped } = gate.allowed ? { dataset, dropped: 0 } : withoutGroup5(dataset);
      const out = await runInvestigator({
        dataset: runDataset, bundles, tier, concurrency, budget, components, theta,
        ceilings: new Map(tiers.map((t) => [t.model, t.ceiling])),
        deps: { models: tiers, sandbox: client },
      });
      records = out.records;
      summary = out.summary;
      if (!gate.allowed && dropped > 0) summary.group5 = `Nhóm 5: ${dropped} ca bị bỏ — ${gate.reason}`;
      config = {
        pipeline: 'investigator',
        // Bước 3a: code quyết luật `test_group_failed`; `complexity`, `calls_function`, `no_recursion`
        // chưa đo được (bước 4–5), nên `predicates` ghi đúng mẫu đã có, không ghi "đủ".
        ablation: ['−run_scaled', '−probe', '−advocate'],
        predicates: 'test_group_failed',
        theta,
        models: tiers.map((t) => t.label),
        components,
        budget,
        bundles: [...bundles.values()].map((b) => ({ id: b.id, generatorImage: BUNDLE_GENERATOR_IMAGE, generatorImageId })),
        sandbox: { prefix: sandboxCfg.config.prefix, host },
      };
    } finally {
      await close();
    }
  }

  let comparison: Record<string, unknown> | undefined;
  let sameModels = true;
  if (baseRun) {
    const models = modelConfound(baseRun.records, records);
    sameModels = models.same;
    // Từ 3a cả hai pipeline đều tự quyết (Q4 hết hiệu lực), nên "khớp kết cục" so được giữa mọi lượt.
    comparison = {
      against: compareTo,
      againstPipeline: baseRun.meta.config.pipeline,
      absScoreError: compareRuns(baseRun.records, records, 'abs_score_error'),
      gradableAgreement: compareRuns(baseRun.records, records, 'gradable_agreement'),
      outcomeAgreement: compareRuns(baseRun.records, records, 'outcome_agreement'),
      // Duyệt Q10: khác bộ model thì Δ không phải hiệu ứng của kiến trúc.
      models,
    };
  }

  const dir = await writeRun(
    runsRoot,
    {
      runId: makeRunId(startedAt, git.sha),
      tier, split, k: tier === 'full' ? 3 : 1,
      gitSha: git.sha, gitDirty: git.dirty, datasetHash: dataset.datasetHash,
      config: comparison ? { ...config, comparison } : config,
      startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
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
  if (summary.unmeasured.length) {
    console.log(`  ⚠ Ca mang cổng cứng KHÔNG đo được lượt nào: ${summary.unmeasured.join(', ')}`);
  }
  const pctOf = (v: number) => `${(v * 100).toFixed(0)}%`;
  for (const d of summary.perDe) {
    console.log(
      `  ${d.de}: ${d.cases} ca · tự duyệt ${pctOf(d.autoRate)} · ` +
        `MAE ${d.maeHundredths === null ? '—' : formatHundredths(d.maeHundredths)} điểm` +
        `${d.maeExcluded ? ` (bỏ ${d.maeExcluded} lượt không có điểm)` : ''} · ` +
        `khớp kết cục ${pctOf(d.outcomeAgreement)} · khớp chấm-được ${pctOf(d.gradableAgreement)}`,
    );
  }
  console.log(`  Thời gian mỗi lượt p50 ${summary.wallMs.p50} ms · p95 ${summary.wallMs.p95} ms`);
  console.log(`  Token mỗi lượt p50 ${summary.tokens.p50} · p95 ${summary.tokens.p95}`);
  console.log(`  Model đã trả lời: ${summary.modelsUsed.join(', ') || '—'}`);
  if (summary.modelsUsed.length > 1) {
    console.log('  ⚠ Nhiều model cùng trả lời một lượt chạy — số liệu trộn hai bậc, đọc kèm cases.jsonl');
  }
  console.log(`  Lượt lỗi: ${summary.errors.length}${summary.errors.length ? ` [${summary.errors.join(', ')}]` : ''}`);
  for (const e of summary.errorReasons) console.log(`    ×${e.count} ${e.reason}`);
  if (summary.ruleMetrics) {
    const m = summary.ruleMetrics;
    const pct = (v: number | null) => (v === null ? '—' : v.toFixed(2));
    console.log(`  Luật (nhóm 1): precision ${pct(m.precision)} · recall ${pct(m.recall)} (tp ${m.tp}, fp ${m.fp}, fn ${m.fn}) — ước lượng điểm, chưa có khoảng tin cậy`);
  }
  const share = summary.machineDeductionShare;
  console.log(
    `  Tự quyết: ${summary.autoDecision.count} lượt (${pctOf(summary.autoDecision.rate)}) · precision nhóm tự quyết ` +
      `${summary.autoDecision.precision === null ? '—' : summary.autoDecision.precision.toFixed(2)} · ` +
      `mức trừ do máy quyết ${share === null ? '—' : pctOf(share)} — ước lượng điểm, chưa có khoảng tin cậy`,
  );
  if (summary.toolCallsPerCase) console.log(`  Lời gọi công cụ mỗi lượt p50 ${summary.toolCallsPerCase.p50} · p95 ${summary.toolCallsPerCase.p95}`);
  if (Object.keys(summary.stopReasons).length) console.log(`  Lý do dừng: ${JSON.stringify(summary.stopReasons)}`);
  if (comparison) {
    console.log(
      `  So với ${compareTo}: ${JSON.stringify({
        sai_so_diem: comparison.absScoreError,
        cham_duoc: comparison.gradableAgreement,
        ket_cuc: comparison.outcomeAgreement,
      })}`,
    );
    if (!sameModels) {
      console.log(
        `  ⚠ Hai lượt chấm bằng HAI BỘ MODEL khác nhau ${JSON.stringify(comparison.models)} — ` +
          'Δ trên trộn hiệu ứng model, KHÔNG được gọi là cải thiện của kiến trúc (duyệt Q10).',
      );
    }
  }
  console.log(`  ${summary.group5}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
