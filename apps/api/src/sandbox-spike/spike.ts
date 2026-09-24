import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HostFingerprint, MeasureResult, SANDBOX_CONTRACT_VERSION } from '../sandbox/contract';
import { spawnCli } from '../sandbox-worker/docker-cli';
import { readFingerprint } from '../sandbox-worker/fingerprint';
import { handleExec, WorkerDeps } from '../sandbox-worker/handle-exec';
import { handleMeasure } from '../sandbox-worker/handle-measure';
import { CPP_FORKER, referenceOf, SPIKE_PROGRAMS, specOf, SpikeProgram } from './programs';
import { renderReport } from './report';
import { decide, RuntimeFacts, sessionOf, summarize } from './stats';

type Mode = 'in_process' | 'process';
type Runtime = 'runc' | 'runsc';
const IMAGES = { cpp: 'cine-sandbox-cpp:1', python: 'cine-sandbox-python:1' };

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function depsFor(runtime: Runtime, workRoot: string): Promise<WorkerDeps> {
  const docker = spawnCli();
  const host = await readFingerprint(docker, { runtime, images: IMAGES, version: 'spike' });
  return { runner: { docker, runtime, images: IMAGES, fetchPolicy: { allowedHosts: [], allowHttp: false, maxBytes: 1 << 26 } }, host, workRoot };
}

function measureOnce(deps: WorkerDeps, p: SpikeProgram, mode: Mode, slot: string): Promise<MeasureResult> {
  return handleMeasure(
    {
      contract: SANDBOX_CONTRACT_VERSION, kind: 'measure', jobId: randomUUID(), language: p.language, timingMode: mode,
      submission: specOf(p, mode), reference: referenceOf(p.language, mode),
      points: p.ns.map((n) => ({ n, stdin: { kind: 'generate', generator: 'int_array', n, lo: 0, hi: 1_000_000, seed: n } })),
      repeats: 5, limits: { wallMsPerCase: 20_000, memoryMb: 1_024 },
    },
    deps,
    slot,
  );
}

async function caseP95(deps: WorkerDeps, runs: number): Promise<number> {
  const ms: number[] = [];
  for (let i = 0; i < runs; i++) {
    const r = await handleExec(
      {
        contract: SANDBOX_CONTRACT_VERSION, kind: 'exec', jobId: randomUUID(), language: 'cpp', sanitize: true,
        program: { files: [{ path: 'main.cpp', ref: { kind: 'inline', content: '#include <cstdio>\nint main(){std::puts("ok");}\n' } }], driver: null, entry: null },
        cases: [{ name: 'a', group: null, stdin: { kind: 'inline', content: '' }, expected: { kind: 'inline', content: 'ok\n' } }],
      },
      deps,
      null,
    );
    if (r.cases[0]?.status !== 'pass') throw new Error(`ca thử chi phí không qua: ${JSON.stringify(r).slice(0, 300)}`);
    ms.push(r.cases[0].ms);
  }
  ms.sort((a, b) => a - b);
  return ms[Math.min(ms.length - 1, Math.floor(0.95 * ms.length))];
}

async function main() {
  const out = arg('out') ?? join(process.cwd(), 'spike-out');
  const cpusets = (arg('cpusets') ?? '').split('|').filter(Boolean);
  if (cpusets.length === 0) throw new Error('--cpusets bắt buộc, ví dụ --cpusets="2|3|4|5" — buổi thử phải ghim lõi');
  const sessions = Number(arg('sessions') ?? 8);
  const phase = arg('phase') ?? 'a';
  const workRoot = join(out, 'work');
  mkdirSync(workRoot, { recursive: true });
  const log = join(out, 'samples.jsonl');
  const factsFile = join(out, 'facts.json');
  const facts: Record<string, RuntimeFacts> = existsSync(factsFile) ? JSON.parse(readFileSync(factsFile, 'utf8')) : {};
  const hosts: Partial<Record<string, HostFingerprint>> = {};
  const record = (row: object) => appendFileSync(log, `${JSON.stringify(row)}\n`);

  if (phase === 'a') {
    const iso = new Set((arg('iso-passed') ?? '').split(',').filter(Boolean));
    for (const runtime of ['runc', 'runsc'] as Runtime[]) {
      let deps: WorkerDeps;
      try {
        deps = await depsFor(runtime, workRoot);
      } catch (error) {
        console.log(`bỏ qua ${runtime}: ${error instanceof Error ? error.message : error}`);
        continue;
      }
      hosts[runtime] = deps.host;
      const forker = await handleMeasure(
        {
          contract: SANDBOX_CONTRACT_VERSION, kind: 'measure', jobId: randomUUID(), language: 'cpp', timingMode: 'in_process',
          submission: specOf({ language: 'cpp', work: CPP_FORKER }, 'in_process'), reference: null,
          points: [{ n: 100, stdin: { kind: 'generate', generator: 'int_array', n: 100, lo: 0, hi: 9, seed: 1 } }], repeats: 1,
        },
        deps,
        cpusets[0],
      );
      facts[runtime] = { isoPassed: iso.has(runtime), interferenceDetected: forker.aborted === 'interference', caseP95Ms: await caseP95(deps, 30) };
      writeFileSync(factsFile, JSON.stringify(facts, null, 2));
      for (const mode of ['in_process', 'process'] as Mode[]) {
        for (const p of SPIKE_PROGRAMS) {
          for (let s = 0; s < sessions; s++) {
            const result = await measureOnce(deps, p, mode, cpusets[0]);
            record({ runtime, mode, k: 1, program: p.id, session: s, result });
            console.log(`${runtime} ${mode} K=1 ${p.id} #${s}: ${result.unavailable ?? result.aborted ?? 'ok'}`);
          }
        }
      }
    }
  } else {
    const runtime = arg('runtime') as Runtime;
    const mode = arg('mode') as Mode;
    const deps = await depsFor(runtime, workRoot);
    hosts[runtime] = deps.host;
    for (const k of [2, 4]) {
      if (k > cpusets.length) {
        console.log(`bỏ qua K=${k}: máy chỉ có ${cpusets.length} khe`);
        continue;
      }
      for (const p of SPIKE_PROGRAMS) {
        for (let s = 0; s < sessions; s += k) {
          const batch = await Promise.all(cpusets.slice(0, k).map((slot) => measureOnce(deps, p, mode, slot)));
          batch.forEach((result, j) => record({ runtime, mode, k, program: p.id, session: s + j, result }));
          console.log(`${runtime} ${mode} K=${k} ${p.id} #${s}…${s + k - 1}`);
        }
      }
    }
  }

  const byKey = new Map<string, MeasureResult[]>();
  for (const line of readFileSync(log, 'utf8').split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    const key = `${row.runtime}|${row.mode}|${row.k}|${row.program}`;
    byKey.set(key, [...(byKey.get(key) ?? []), row.result]);
  }
  const summaries = new Map([...byKey].map(([k, rs]) => [k, summarize(rs.map((r) => sessionOf(r, 'innerNs')))]));
  const outer = new Map([...byKey].map(([k, rs]) => [k, summarize(rs.map((r) => sessionOf(r, 'outerNs')))]));
  const ks = [...new Set([...byKey.keys()].map((k) => Number(k.split('|')[2])))];
  const decision = decide({
    summaries, facts,
    programs: SPIKE_PROGRAMS.map((p) => p.id),
    cppPrograms: SPIKE_PROGRAMS.filter((p) => p.language === 'cpp').map((p) => p.id),
    ks,
  });
  writeFileSync(join(out, 'summary.json'), JSON.stringify({ summaries: [...summaries], outer: [...outer], facts, decision }, null, 2));
  writeFileSync(join(out, 'report-draft.md'), renderReport({ hosts, summaries, outer, facts, decision, sessions }));
  console.log(decision.reasons.join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
