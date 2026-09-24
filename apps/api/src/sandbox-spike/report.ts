import { HostFingerprint } from '../sandbox/contract';
import { Decision, RuntimeFacts, Summary } from './stats';

const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '—');

export function renderReport(p: {
  hosts: Partial<Record<string, HostFingerprint>>;
  summaries: Map<string, Summary>;
  outer: Map<string, Summary>;
  facts: Partial<Record<string, RuntimeFacts>>;
  decision: Decision;
  sessions: number;
}): string {
  const rows = [...p.summaries].sort(([a], [b]) => a.localeCompare(b)).map(([k, s]) => {
    const [runtime, mode, K, program] = k.split('|');
    const o = p.outer.get(k);
    return `| ${runtime} | ${mode} | ${K} | ${program} | ${f3(s.slopeMean)} | ${f3(s.slopeStd)} | ${f3(s.meanCv)} | ${o ? f3(o.slopeStd) : '—'} | ${s.sessions}/${s.sessions + s.failed} |`;
  });
  const hostRows = Object.entries(p.hosts).map(([r, h]) =>
    `| ${r} | ${h!.hostname} | ${h!.cpuModel} × ${h!.cpuCount} | ${h!.kernel} | ${h!.dockerVersion} | ${Object.values(h!.images).join('<br>')} |`);
  const factRows = Object.entries(p.facts).map(([r, f]) =>
    `| ${r} | ${f!.isoPassed ? 'xanh' : '**đỏ**'} | ${f!.interferenceDetected ? 'có' : '**không**'} | ${Math.round(f!.caseP95Ms)} |`);
  return [
    '## Máy',
    '',
    '| Runtime | Máy | CPU | Kernel | Docker | Image |',
    '|---|---|---|---|---|---|',
    ...hostRows,
    '',
    '## Cô lập và chi phí một ca',
    '',
    '| Runtime | `test:sandbox` | Phát hiện tiến trình nền | p95 một ca kiểm (ms) |',
    '|---|---|---|---|',
    ...factRows,
    '',
    `## Độ tản của phép đo — ${p.sessions} lượt mỗi ô`,
    '',
    'Độ dốc là độ dốc log–log của trung vị theo n sau khi trừ `c`. Chỉ dùng để đo độ tản; kết luận lớp độ phức tạp là việc của bước 4 (§3.1).',
    '',
    '| Runtime | Bấm giờ | K | Chương trình | Độ dốc TB | Độ lệch chuẩn độ dốc | CV TB | Độ lệch chuẩn độ dốc (số đo ngoài) | Lượt dùng được |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '## Quyết định theo luật D1–D4',
    '',
    ...p.decision.reasons.map((r) => `- ${r}`),
    '',
    `**Kết luận máy tính:** runtime \`${p.decision.runtime}\`, bấm giờ \`${p.decision.mode}\`, K = ${p.decision.k}, ${p.decision.usable ? 'dùng được' : '**không dùng được**'}.`,
    '',
  ].join('\n');
}
