import type { ExamSessionStatus } from './entities/exam-session.entity';
import { DeliverableType } from './entities/required-deliverable.entity';

// Every deliverable declared through POST /exam-sessions is a plain
// document submission for this demo's scope (Task 1's ruling, carried
// forward into Task 2) — the client never selects deliverableType, and no
// other value is ever produced by this module.
export const DEFAULT_DELIVERABLE_TYPE: DeliverableType = 'document';

// Session code generation (Task 1 review ruling, handled at the
// application layer instead of a DB-level uppercase constraint): 6-char
// uppercase alphanumeric, retried on a unique-constraint collision so
// session-code matching stays case-consistent with the WebSocket gateway
// (Task 3), which normalizes any incoming sessionCode to uppercase before
// querying.
export const EXAM_SESSION_CODE_LENGTH = 6;
// `O`/`0` and `I`/`1` deliberately excluded — a code the teacher reads
// aloud and a student hand-types is exactly where those pairs cause real
// mistypes (see the student-agent-electron-design spec, §5.1). Only
// consulted here, at generation time: matching a typed-in code is an
// exact-match DB lookup (see ExamSessionGateway.handleAgentJoin), never a
// character-class check, so this change is backward-compatible by
// construction — a session created before this change keeps whatever code
// it already has, `O`/`I`/`0`/`1` included, and still joins fine.
export const EXAM_SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const EXAM_SESSION_CODE_MAX_ATTEMPTS = 5;

/**
 * "Kỳ thi đã qua" — đúng cho cả `collecting` lẫn `completed`.
 *
 * Tồn tại vì cả ba chỗ dùng nó trước đây đều viết `=== 'completed'` khi
 * `completed` còn là trạng thái hậu-thi DUY NHẤT. Thêm `collecting` làm
 * cả ba sai một cách im lặng. Trạng thái thứ tư sau này chỉ phải sửa ở
 * đây, không phải đi tìm lại từng chuỗi so sánh.
 */
export function isExamOver(status: ExamSessionStatus): boolean {
  return status === 'collecting' || status === 'completed';
}

/**
 * Huỷ được khi phiên chưa mở. Tùy chỉnh hoặc nhập danh sách trước lúc
 * mở không chặn — những dòng đó chưa phải ảnh chốt của ca thi.
 */
export function canCancelExamSession(status: ExamSessionStatus): boolean {
  return (
    status === 'draft' ||
    status === 'scheduled' ||
    status === 'not_ready' ||
    status === 'missed'
  );
}

/** 10 phút trước giờ bắt đầu — lượt quét thử mở phiên trong cửa sổ này. */
export const AUTO_OPEN_LEAD_MS = 10 * 60 * 1000;

/**
 * Sinh viên được vào phòng sớm nhất bao lâu trước giờ bắt đầu.
 * Phiên phải đã `active`. Đề thi không mở theo cửa này.
 */
export const EARLY_JOIN_LEAD_MS = 5 * 60 * 1000;

/**
 * Cửa `agent:join`. `active`, và đồng hồ nằm trong
 * `[startTime − 5 phút, endTime]`.
 */
export function isAgentJoinOpen(
  status: ExamSessionStatus,
  startTime: Date,
  endTime: Date,
  now: Date,
): boolean {
  if (status !== 'active') {
    return false;
  }
  const at = now.getTime();
  return at >= startTime.getTime() - EARLY_JOIN_LEAD_MS && at <= endTime.getTime();
}

/**
 * Còn chờ mở: giảng viên vẫn sửa được, và lượt quét vẫn thử mở.
 * `missed` không nằm ở đây — phiên đó không dùng được nữa.
 */
export function isAwaitingOpen(status: ExamSessionStatus): boolean {
  return status === 'scheduled' || status === 'not_ready';
}

/**
 * Không còn chiếm phòng, lớp, hay khoảng nghỉ của giảng viên.
 * `missed` có trong danh sách: ca thi không diễn ra thì nhả chỗ.
 * `not_ready` không có: còn có thể mở lúc giờ bắt đầu.
 */
export const SLOT_FREE_STATUSES = ['collecting', 'completed', 'cancelled', 'missed'] as const;

/** Vị từ SQL khớp exclusion trên `exam_session`. `statusExpr` là `s.status` hoặc `"status"`. */
export function slotStillHeldSql(statusExpr: string): string {
  return SLOT_FREE_STATUSES.map((status) => `${statusExpr} <> '${status}'`).join(' AND ');
}

/**
 * Phiên còn nhận bài nộp về.
 *
 * KHÁC `isExamOver`, và khác có chủ đích: `active` là còn nhận nhưng
 * chưa qua. Gộp hai hàm thành một sẽ xoá mất đúng sự khác biệt đó.
 */
export function isCollectionOpen(status: ExamSessionStatus): boolean {
  return status === 'active' || status === 'collecting' || status === 'completed';
}
