import type { BadgeProps } from '@/components/ui/badge';
import type { SessionOverviewItem } from './api/submissions';

/**
 * Phải khớp SUBMISSION_GRACE_PERIOD_MS
 * (apps/api/src/submission/submission.types.ts). Agent còn được nộp tới
 * endTime + 30' — kêu "thiếu bài" trong khoảng đó là báo động giả, xem
 * spec §4.2.
 */
export const SUBMISSION_GRACE_MS = 30 * 60_000;

export type SessionPhase =
  | 'draft'
  | 'cancelled'
  | 'upcoming'
  | 'running'
  /** Hết giờ (hoặc đã chốt tay) nhưng còn trong grace — file đang bay về. */
  | 'collecting'
  | 'ended';

export const PHASE_LABELS: Record<SessionPhase, string> = {
  draft: 'Nháp',
  cancelled: 'Đã huỷ',
  upcoming: 'Chưa diễn ra',
  running: 'Đang diễn ra',
  collecting: 'Đang thu bài',
  ended: 'Đã kết thúc',
};

export const PHASE_VARIANTS: Record<SessionPhase, NonNullable<BadgeProps['variant']>> = {
  draft: 'default',
  cancelled: 'destructive',
  upcoming: 'info',
  running: 'success',
  collecting: 'info',
  ended: 'default',
};

export interface AttentionReason {
  kind: 'invalid' | 'partial' | 'not-submitted';
  count: number;
  label: string;
  variant: NonNullable<BadgeProps['variant']>;
  /** 1 gấp nhất. Xem bảng ưu tiên spec §4.1. */
  priority: 1 | 2 | 3;
}

/**
 * `ended` phải hỏi cả `status`, không chỉ đồng hồ: "Chốt bài ngay"
 * (FinalizeSessionButton) đặt status='completed' ngay lúc bấm, có thể trước
 * endTime cả tiếng. Chỉ so now với endTime thì phiên vừa chốt sẽ hiện "Đang
 * diễn ra" suốt quãng còn lại — spec §4.3.
 *
 * Nhưng biên grace vẫn là endTime + 30', KHÔNG phải thời-điểm-chốt + 30',
 * vì backend cho upload theo đúng công thức đó.
 */
export function getSessionPhase(item: SessionOverviewItem, now: number): SessionPhase {
  if (item.status === 'draft' || item.status === 'cancelled') {
    return item.status;
  }

  const start = new Date(item.startTime).getTime();
  const end = new Date(item.endTime).getTime();
  const ended = item.status === 'completed' || now > end;

  if (!ended) {
    return now < start ? 'upcoming' : 'running';
  }
  return now <= end + SUBMISSION_GRACE_MS ? 'collecting' : 'ended';
}

/** true khi hiển thị tỉ lệ "X/Y" là trung thực. Xem §3.3 và §4.2. */
export function hasRatio(item: SessionOverviewItem): boolean {
  return item.rosterKnown && item.requiredDeliverableCount > 0;
}

export function getAttentionReasons(
  item: SessionOverviewItem,
  now: number,
): AttentionReason[] {
  // Chỉ phiên đã thật sự xong mới bị kết luận. draft/cancelled là quyết định
  // có chủ ý của GV; collecting còn đang nhận file.
  if (getSessionPhase(item, now) !== 'ended') {
    return [];
  }
  // Không biết roster, hoặc chưa khai file bắt buộc -> không kết luận được
  // là "thiếu". §4.2(b) và §3.3.
  if (!hasRatio(item)) {
    return [];
  }

  const reasons: AttentionReason[] = [];
  if (item.invalidFileCount > 0) {
    reasons.push({
      kind: 'invalid',
      count: item.invalidFileCount,
      label: `${item.invalidFileCount} file không hợp lệ`,
      variant: 'destructive',
      priority: 1,
    });
  }
  if (item.partialCount > 0) {
    reasons.push({
      kind: 'partial',
      count: item.partialCount,
      label: `${item.partialCount} sinh viên nộp thiếu file`,
      variant: 'warning',
      priority: 2,
    });
  }
  if (item.notSubmittedCount > 0) {
    reasons.push({
      kind: 'not-submitted',
      count: item.notSubmittedCount,
      label: `${item.notSubmittedCount} sinh viên chưa nộp`,
      variant: 'default',
      priority: 3,
    });
  }
  return reasons;
}

/** 4 = không cần chú ý; nhỏ hơn là gấp hơn. */
function attentionRank(item: SessionOverviewItem, now: number): number {
  const reasons = getAttentionReasons(item, now);
  return reasons.length === 0 ? 4 : reasons[0].priority;
}

/** Lý do gấp hơn trước; cùng mức thì phiên mới hơn trước. */
export function compareSessions(
  a: SessionOverviewItem,
  b: SessionOverviewItem,
  now: number,
): number {
  const byRank = attentionRank(a, now) - attentionRank(b, now);
  if (byRank !== 0) return byRank;
  return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
}

export interface SessionGroup {
  key: string;
  courseName: string;
  className: string | null;
  sessions: SessionOverviewItem[];
  /** Bao nhiêu phiên trong nhóm này cần chú ý — hiện ở header nhóm, §4.4. */
  attentionCount: number;
}

/**
 * Nhóm theo Môn → Lớp. Phiên cần chú ý VẪN Ở LẠI nhóm gốc dù nó cũng hiện ở
 * dải ghim trên: nhóm phải là danh sách đầy đủ của môn đó, nếu lọc bớt thì
 * GV duyệt theo môn sẽ tưởng phiên đã bị xoá — spec §4.4.
 */
export function groupByCourseClass(
  items: SessionOverviewItem[],
  now: number,
): SessionGroup[] {
  const groups = new Map<string, SessionGroup>();

  for (const item of items) {
    const key = `${item.courseId}::${item.classId ?? 'no-class'}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        courseName: item.courseName,
        className: item.className,
        sessions: [],
        attentionCount: 0,
      };
      groups.set(key, group);
    }
    group.sessions.push(item);
  }

  const newestStart = (group: SessionGroup) =>
    Math.max(...group.sessions.map((s) => new Date(s.startTime).getTime()));

  for (const group of groups.values()) {
    group.sessions.sort((a, b) => compareSessions(a, b, now));
    group.attentionCount = group.sessions.filter(
      (s) => getAttentionReasons(s, now).length > 0,
    ).length;
  }

  return [...groups.values()].sort((a, b) => newestStart(b) - newestStart(a));
}
