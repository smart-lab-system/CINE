import { createHash } from 'node:crypto';
import { BundleCase } from '../grading/investigator/types';
import { SandboxPort } from '../grading/investigator/tools';
import { HostFingerprint } from '../sandbox/contract';
import { LoadedDe } from './load-dataset';
import { ProgramRunner } from './program-runner';

export interface FrozenBundle {
  id: string;
  cases: BundleCase[];
}

/** Image mà bộ sinh output mong đợi phải dùng — đúng image worker chạy bài (duyệt Q5). */
export const BUNDLE_GENERATOR_IMAGE = 'cine-sandbox-cpp:1';
const MAX_CASES_PER_JOB = 200;

/**
 * Gói test ĐÓNG BĂNG cho một lượt chạy (§2.1 luật 1): mọi ca của mọi bài chạy trên đúng một
 * bộ. Ca sinh tự động lấy output mong đợi bằng cách CHẠY đáp án mẫu (Q5), với image và cờ biên
 * dịch của worker. Không chạy qua chính worker được: worker cắt stdout ở 64 KB. Việc này không
 * đo thời gian (§12.9). Đúng hay sai do `checkBundleOnWorker` quyết, không phải do hàm này.
 */
export async function buildTestBundle(de: LoadedDe, runner: ProgramRunner): Promise<FrozenBundle> {
  const missing = de.tests.filter((t) => t.expected === null);
  const produced = new Map<string, string>();
  if (missing.length > 0) {
    const r = await runner.run({
      driver: de.driverSource,
      source: de.modelSource,
      cases: missing.map((t) => ({ key: t.key, input: t.input })),
    });
    if (!r.compiled) throw new Error(`${de.manifest.id}: đáp án mẫu không biên dịch — không dựng được gói test`);
    for (const c of r.cases) {
      if (c.status !== 'ok') throw new Error(`${de.manifest.id}/${c.key}: đáp án mẫu ra ${c.status} — không dựng được output mong đợi`);
      produced.set(c.key, c.stdout);
    }
  }
  const cases = de.tests.map((t) => ({
    name: t.key,
    group: t.group,
    input: t.input,
    expected: t.expected ?? produced.get(t.key)!,
  }));
  const id = `${de.manifest.id}@${createHash('sha256').update(JSON.stringify(cases)).digest('hex').slice(0, 12)}`;
  return { id, cases };
}

/**
 * Kiểm tự nhất quán, đầu MỖI lượt chạy (duyệt Q5): chạy đáp án mẫu qua WORKER THẬT trên chính
 * gói test của nó, và mọi ca phải `pass`. Đây là lớp bắt được mọi lệch môi trường giữa bộ sinh
 * và worker — cờ biên dịch, tag image trôi, trần RAM, cả những lệch chưa ai nghĩ tới. Không đạt
 * thì người gọi dừng cả lượt với lỗi hạ tầng: chấm tiếp trên một thước sai là trừ oan có hệ thống.
 */
export async function checkBundleOnWorker(
  de: LoadedDe,
  bundle: FrozenBundle,
  sandbox: SandboxPort,
): Promise<{ ok: true; host: HostFingerprint } | { ok: false; reason: string }> {
  const where = `${de.manifest.id} (${bundle.id})`;
  if (bundle.cases.length > MAX_CASES_PER_JOB) {
    return { ok: false, reason: `${where}: gói có ${bundle.cases.length} ca, vượt trần ${MAX_CASES_PER_JOB} ca một job` };
  }
  const inline = (content: string) => ({ kind: 'inline' as const, content });
  const r = await sandbox.exec({
    language: de.manifest.language,
    program: { files: [{ path: 'main.cpp', ref: inline(de.modelSource) }], driver: inline(de.driverSource), entry: null },
    cases: bundle.cases.map((c) => ({ name: c.name, group: c.group, stdin: inline(c.input), expected: inline(c.expected) })),
  });
  if (r.unavailable !== null) return { ok: false, reason: `${where}: sandbox không phản hồi — ${r.unavailable}` };
  if (r.compile && !r.compile.ok) return { ok: false, reason: `${where}: đáp án mẫu không biên dịch trên worker` };
  if (r.aborted) return { ok: false, reason: `${where}: worker dừng giữa chừng (${r.aborted}) — chỉ có ${r.cases.length}/${bundle.cases.length} ca` };
  const got = new Map(r.cases.map((c) => [c.name, c.status]));
  const bad = bundle.cases.filter((c) => got.get(c.name) !== 'pass').map((c) => `${c.name}: ${got.get(c.name) ?? 'không có kết quả'}`);
  if (bad.length > 0) {
    return {
      ok: false,
      reason: `${where}: đáp án mẫu trượt chính gói test của nó trên worker — ${bad.slice(0, 5).join('; ')}${bad.length > 5 ? '; …' : ''}. Lệch môi trường giữa bộ sinh và worker, không phải lỗi của bài.`,
    };
  }
  if (!r.host) return { ok: false, reason: `${where}: kết quả không mang dấu vân tay máy` };
  return { ok: true, host: r.host };
}
