import { execFileSync } from 'node:child_process';
import { HostFingerprint } from '../sandbox/contract';
import { LoadedDataset } from './load-dataset';
import { CaseRecord } from './runner-core';

/**
 * Bài nhóm 5 là bài của sinh viên THẬT (§12.7): nằm ngoài git, trong `eval/private/`. File nào
 * ở đó mà git đang theo dõi thì runner từ chối chạy (T-EVAL-6) — một thư mục lượt chạy phải
 * commit được mà không mang theo bài của ai.
 */
export function trackedPrivateFiles(apiRoot: string): string[] {
  const out = execFileSync('git', ['ls-files', '--', 'eval/private'], { cwd: apiRoot, encoding: 'utf8' });
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

/** `cases.jsonl` của nhóm 5 chỉ có nhãn, kết cục và con số — không mã nguồn, không investigation. */
export function stripForGroup5(record: CaseRecord): CaseRecord {
  if (record.group !== 5) return record;
  return { ...record, investigation: null, summaryText: null, error: record.error === null ? null : 'lỗi (đã ẩn — nhóm 5)' };
}

/**
 * Duyệt Q8: bài thật chỉ được CHẠY trên máy sandbox riêng (§3.5), không trên máy của người phát
 * triển. Điều kiện là MÁY (tên trong `SANDBOX_TRUSTED_HOSTS`), không phải runtime: máy sandbox thật
 * chạy runc theo quyết định D2 của bước 1. Dấu vân tay do worker tự khai — đây là rào chống nhầm.
 */
export function group5Gate(
  host: HostFingerprint | null,
  env: NodeJS.ProcessEnv,
): { allowed: true } | { allowed: false; reason: string } {
  const trusted = (env.SANDBOX_TRUSTED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  if (host && trusted.includes(host.hostname)) return { allowed: true };
  const where = host ? `máy ${host.hostname} (${host.runtime})` : 'máy không rõ';
  return {
    allowed: false,
    reason: `worker ở ${where} không nằm trong SANDBOX_TRUSTED_HOSTS — bài thật không chạy trên máy phát triển (§3.5)`,
  };
}

/** Bộ dữ liệu không có ca nhóm 5, và số ca đã bỏ. Không sửa bộ dữ liệu gốc. */
export function withoutGroup5(dataset: LoadedDataset): { dataset: LoadedDataset; dropped: number } {
  let dropped = 0;
  const des = dataset.des.map((de) => {
    const cases = de.manifest.cases.filter((c) => c.group !== 5);
    dropped += de.manifest.cases.length - cases.length;
    return { ...de, manifest: { ...de.manifest, cases } };
  });
  return { dataset: { ...dataset, des }, dropped };
}
