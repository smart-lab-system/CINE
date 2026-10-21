import { createHash } from 'node:crypto';

/**
 * Rút mẫu kiểm (parent spec §8.1) — file THUẦN: không DB, không điểm, không đọc `process.env` trực tiếp.
 *
 * Bài được rút khi `hash(seed của phiên, id kết quả) < N`. Chỉ phụ thuộc seed và id — KHÔNG phụ thuộc điểm —
 * vì được chọn thì người ta chọn bài dễ (T-SAMP-3).
 */
export const AUDIT_DEFAULT_PERCENT = 20;
/** Sàn: dưới đây bộ hiệu chỉnh (§8) mất nguồn nhãn. */
export const AUDIT_FLOOR_PERCENT = 5;
const KEY = 'GRADING_AUDIT_SAMPLE_PERCENT';

export interface AuditSampling {
  enabled: boolean;
  percent: number;
  warning: string | null;
}

/**
 * N% từ env, theo khuôn của `readAutoThreshold` (`decision/threshold.ts`): hàm thuần nhận `env`, mặc định KÈM
 * cảnh báo khi giá trị vô nghĩa — không nổ lúc khởi động. KHÔNG nhánh nào cho ra `percent` dưới sàn, nên N
 * không bao giờ về 0.
 *
 * Thiếu hoặc rỗng → mặc định; riêng dưới `NODE_ENV=test` thì TẮT: hàng chục e2e có sẵn khẳng định `auto_approved`
 * ngay sau `computeInitial`, và 20% số bài sẽ sang `audit_pending`. Cùng tiền lệ với `selectAuthoringProvider`,
 * cũng giả lập dưới `NODE_ENV=test`. Đặt biến tường minh thì bật, kể cả ở test.
 */
export function readAuditSampling(env: NodeJS.ProcessEnv): AuditSampling {
  const raw = env[KEY];
  if (raw === undefined || raw.trim() === '') {
    return { enabled: env.NODE_ENV !== 'test', percent: AUDIT_DEFAULT_PERCENT, warning: null };
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    return {
      enabled: true,
      percent: AUDIT_DEFAULT_PERCENT,
      warning: `${KEY}=${JSON.stringify(raw)} không phải số nguyên từ 1 trở lên — dùng mặc định ${AUDIT_DEFAULT_PERCENT}%. Kiểm mẫu không bao giờ về 0.`,
    };
  }
  if (value < AUDIT_FLOOR_PERCENT) {
    return {
      enabled: true,
      percent: AUDIT_FLOOR_PERCENT,
      warning: `${KEY}=${value} thấp hơn sàn — nâng lên ${AUDIT_FLOOR_PERCENT}%. Kiểm mẫu không bao giờ về 0.`,
    };
  }
  if (value > 100) {
    return { enabled: true, percent: 100, warning: `${KEY}=${value} lớn hơn 100 — dùng 100%.` };
  }
  return { enabled: true, percent: value, warning: null };
}

/** Số nguyên trong [0, 9999], tất định theo (seed, id). SHA-256: đều, và đơn điệu khi so với `percent × 100`. */
export function auditBucket(seed: string, resultId: string): number {
  return createHash('sha256').update(`${seed}:${resultId}`).digest().readUInt32BE(0) % 10_000;
}

export function drawnForAudit(seed: string, resultId: string, percent: number): boolean {
  return auditBucket(seed, resultId) < percent * 100;
}

/**
 * Số nguyên trong [0, 9999], tất định theo (seed, MSSV chữ thường). Đường rút mẫu THEO SINH VIÊN (P1b §8): mọi câu
 * tự duyệt của một sinh viên cùng được rút, vì quyết định chỉ phụ thuộc MSSV và seed. `auditBucket` (theo id bài)
 * vẫn giữ nguyên cho dữ liệu đã rút trước đó.
 *
 * Bước chuyển: chỉ các quyết định TỰ DUYỆT MỚI (sau khi triển khai) đi qua đường này. Bài đã được rút theo id
 * giữ nguyên cờ của nó — không rút lại, vì rút lại là đổi thước dưới chân những bài đã mang kết cục.
 */
export function auditBucketByStudent(seed: string, mssv: string): number {
  return createHash('sha256').update(`${seed}:${mssv.toLowerCase()}`).digest().readUInt32BE(0) % 10_000;
}

export function drawnForStudentAudit(seed: string, mssv: string, percent: number): boolean {
  return auditBucketByStudent(seed, mssv) < percent * 100;
}

/** Số sinh viên tối thiểu có bài trong mẫu kiểm của phiên (spec §5.6). Đề xuất 2, chờ chủ đồ án xác nhận. */
export const AUDIT_MIN_PER_SESSION_DEFAULT = 2;
const MIN_PER_SESSION_KEY = 'AUDIT_MIN_PER_SESSION';

/** `AUDIT_MIN_PER_SESSION`: số nguyên không âm. Thiếu, rỗng hoặc vô nghĩa thì dùng mặc định 2 (không im lặng lấy số lớn). */
export function readAuditMinPerSession(env: NodeJS.ProcessEnv): number {
  const raw = env[MIN_PER_SESSION_KEY];
  if (raw === undefined || raw.trim() === '') return AUDIT_MIN_PER_SESSION_DEFAULT;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : AUDIT_MIN_PER_SESSION_DEFAULT;
}

/**
 * Bổ sung sinh viên vào mẫu cho đủ `min` (hoặc toàn bộ nếu ít hơn). HÀM THUẦN, tất định: sinh viên được bổ sung theo
 * thứ tự SHA-256 của MSSV chữ thường, không phụ thuộc thứ tự đầu vào. Trả về MSSV ở dạng gốc, không trùng; mã được
 * so sánh không phân biệt hoa thường (`SV0001` và `sv0001` là một sinh viên).
 */
export function ensureSessionMinimum(sampled: string[], students: string[], min: number): string[] {
  const chosen = new Map<string, string>();
  for (const m of sampled) chosen.set(m.toLowerCase(), m);
  const everyone = new Map<string, string>();
  for (const m of students) everyone.set(m.toLowerCase(), m);
  const target = Math.min(min, everyone.size);
  const pool = [...everyone.entries()]
    .filter(([key]) => !chosen.has(key))
    .sort(([a], [b]) => hashOfMssv(a).localeCompare(hashOfMssv(b)));
  for (const [key, original] of pool) {
    if (chosen.size >= target) break;
    chosen.set(key, original);
  }
  return [...chosen.values()];
}

function hashOfMssv(mssvLower: string): string {
  return createHash('sha256').update(mssvLower).digest('hex');
}
