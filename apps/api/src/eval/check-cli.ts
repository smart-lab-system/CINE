import { join } from 'node:path';
import { checkDe } from './check-dataset';
import { loadDataset } from './load-dataset';
import { DockerProgramRunner, DockerUnavailableError } from './program-runner';

/**
 * `pnpm --filter api eval:check [-- --de=<id>]` — chạy mã fixture trong Docker
 * trên máy dev để chứng minh sự thật nền (spec 2026-09-20 §12.2). Thoát 0 khi
 * sạch, 1 khi có vấn đề, 2 khi không chạy được (Docker tắt, fixture hỏng).
 */
async function main() {
  const root = join(__dirname, '..', '..', 'eval', 'fixtures');
  const only = process.argv.find((a) => a.startsWith('--de='))?.slice(5);
  const ds = await loadDataset(root, { only });
  const runner = new DockerProgramRunner();
  let bad = 0;
  for (const de of ds.des) {
    const problems = await checkDe(de, runner);
    console.log(`${de.manifest.id}: ${de.manifest.cases.length} ca, ${problems.length} vấn đề`);
    for (const p of problems) console.log(`  [${p.code}] ${p.caseId ?? '(đề)'}: ${p.message}`);
    bad += problems.length;
  }
  console.log(`datasetHash ${ds.datasetHash}`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof DockerUnavailableError ? error.message : error);
  process.exit(2);
});
