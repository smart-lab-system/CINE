import type { BlankReason } from './grade-export.types';

/** Bốn nghĩa của một ô trống (§13.1 luật 5) — chữ này được ghi vào cột lý do nếu giảng viên chọn cột đó. */
export const BLANK_LABELS: Record<BlankReason, string> = {
  absent: 'Vắng — không có bài nộp',
  not_finished: 'Chưa chấm xong hoặc chưa chốt điểm',
  ungradable: 'Hệ thống không chấm được bài',
  flagged: 'Đang chờ giảng viên duyệt',
};

/**
 * Vì sao sinh viên này KHÔNG có điểm để ghi; `null` = bài đã công bố (`finalized`/`exported`), có điểm.
 * Một bài mới chỉ `teacher_reviewed`/`auto_approved` là "chưa chốt" dù đã có điểm tạm — điểm tạm không bao giờ
 * ra ngoài (§13.1 luật 5).
 */
export function blankReasonOf(input: { hasSubmission: boolean; status: string | null; ungradableClass: string | null }): BlankReason | null {
  if (!input.hasSubmission) return 'absent';
  if (input.status === null) return 'not_finished';
  if (input.status === 'finalized' || input.status === 'exported') return null;
  if (input.status === 'flagged_for_review') return input.ungradableClass ? 'ungradable' : 'flagged';
  if (input.status === 'audit_pending') return 'flagged';
  return 'not_finished';
}

const OWN_LABELS: ReadonlySet<string> = new Set(Object.values(BLANK_LABELS));

/** Chữ này do CHÍNH hệ thống ghi từ một lượt xuất trước → được phép xoá/ghi đè mà không hỏi (D13, D17). */
export const isOwnLabel = (text: string): boolean => OWN_LABELS.has(text.trim());
