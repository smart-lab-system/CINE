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
