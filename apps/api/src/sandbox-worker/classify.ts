import { LimitHit, RECURSION_EXIT_CODE, SandboxLanguage } from '../sandbox/contract';

export type RunOutcome = 'ran' | 'timeout' | 'runtime_crash' | 'recursion_limit' | 'output_limit';

/**
 * Mã thoát → kết cục của một ca (spec §4.5). Thứ tự các nhánh là có chủ đích:
 * vượt trần output thắng mọi thứ (worker đã tự giết container), rồi tới trần
 * RAM, rồi tới hết giờ.
 *
 * 137 = bị SIGKILL. Trong container không mạng chỉ có hai nguồn, đã đo cả hai
 * (2026-09-24): `timeout -k` giết bài chặn TERM sau khi đã chạy HẾT trần, và
 * OOM killer — `State.OOMKilled` ra `true` cho ca này, kể cả khi có `--init`.
 * `oomKilled: null` = không có cờ để hỏi (job đo dùng `docker exec`): khi đó
 * một cú KILL sớm được coi là trần RAM.
 */
export function classifyExit(p: {
  exitCode: number;
  oomKilled: boolean | null;
  outputTruncated: boolean;
  language: SandboxLanguage;
  elapsedMs: number;
  wallMs: number;
}): { status: RunOutcome; limitsHit: LimitHit[] } {
  if (p.outputTruncated) return { status: 'output_limit', limitsHit: ['output'] };
  if (p.oomKilled === true) return { status: 'runtime_crash', limitsHit: ['memory'] };
  if (p.exitCode === 0) return { status: 'ran', limitsHit: [] };
  if (p.exitCode === 124) return { status: 'timeout', limitsHit: ['time'] };
  if (p.exitCode === 137) {
    if (p.elapsedMs >= p.wallMs) return { status: 'timeout', limitsHit: ['time'] };
    return { status: 'runtime_crash', limitsHit: p.oomKilled === null ? ['memory'] : [] };
  }
  if (p.language === 'python' && p.exitCode === RECURSION_EXIT_CODE) {
    return { status: 'recursion_limit', limitsHit: [] };
  }
  return { status: 'runtime_crash', limitsHit: [] };
}

/**
 * Docker tự thất bại (125 = daemon lỗi, 126/127 = không chạy được lệnh), khác
 * với bài thoát bằng đúng mã đó. Phân biệt bằng lời của docker trên stderr:
 * không có lời đó thì coi là mã của bài. Nghiêng về phía "lỗi hạ tầng" chỉ khi
 * có bằng chứng — ngược lại thì một bài `return 125;` sẽ luôn ra unavailable.
 */
export function isDockerFailure(exitCode: number, stderr: string): boolean {
  if (exitCode < 125 || exitCode > 127) return false;
  return /^docker: |Error response from daemon|OCI runtime/m.test(stderr);
}
