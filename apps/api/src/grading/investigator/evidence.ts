import { quoteAppearsInSubmission } from '../harness/submission-envelope';
import type { EvidenceClaim } from './types';

/** Số đoạn mã tối đa mỗi lỗi. Thừa thì cắt, không từ chối cả lượt (§5.9). */
export const EVIDENCE_MAX_ITEMS = 3;
/** Ký tự tối đa của một đoạn mã. Dài hơn thì cắt. */
export const EVIDENCE_QUOTE_MAX = 300;

const FILE_MAX = 512;

/**
 * Đọc `evidence` của một lỗi một cách KHOAN DUNG: đoạn hỏng bị bỏ, không làm hỏng cả lượt. Phần này chỉ để hiển thị;
 * một đoạn sai không được phép biến một lượt điều tra đúng thành bad_output.
 */
export function parseEvidenceClaims(raw: unknown): EvidenceClaim[] {
  if (!Array.isArray(raw)) return [];
  const out: EvidenceClaim[] = [];
  for (const item of raw) {
    if (out.length === EVIDENCE_MAX_ITEMS) break;
    const claim = readClaim(item);
    if (claim !== null) out.push(claim);
  }
  return out;
}

function readClaim(item: unknown): EvidenceClaim | null {
  if (typeof item !== 'object' || item === null) return null;
  const o = item as Record<string, unknown>;
  if (typeof o.file !== 'string' || o.file.trim() === '' || o.file.length > FILE_MAX) return null;
  if (typeof o.quote !== 'string') return null;
  const line = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : null);
  return {
    file: o.file,
    startLine: line(o.startLine),
    endLine: line(o.endLine),
    quote: o.quote.slice(0, EVIDENCE_QUOTE_MAX),
  };
}

/**
 * Harness đặt `verified` bằng cách đối chiếu nguyên văn đoạn mã với đúng file nó nêu. Đoạn không khớp, file không có,
 * hay đoạn rỗng đều là `verified: false` — và vẫn được GIỮ, để giảng viên thấy model đã dẫn gì.
 */
export function verifyEvidence(claims: EvidenceClaim[], files: { path: string; content: string }[]): EvidenceClaim[] {
  return claims.map((c) => {
    const file = files.find((f) => f.path === c.file);
    const verified = c.quote.trim() !== '' && file !== undefined && quoteAppearsInSubmission(c.quote, [file.content]);
    return { ...c, verified };
  });
}
