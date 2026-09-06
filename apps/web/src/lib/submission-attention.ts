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

export type AttentionKind =
  | 'attended-no-submission'
  | 'partial'
  | 'never-attended'
  /** Có mặt ở một phiên khác cùng môn + cùng loại kỳ thi. Không phải lỗi. */
  | 'sat-elsewhere';

export interface AttentionReason {
  kind: AttentionKind;
  count: number;
  label: string;
  /** Ánh xạ sang màu ở tầng UI. Không dùng BadgeProps nữa: bảng dùng chấm
   *  tròn + chữ, không dùng pill (spec §5.4). `neutral` dành cho dòng chỉ
   *  thông báo — tô nó màu cảnh báo là dạy giảng viên bỏ qua màu cảnh báo. */
  tone: 'danger' | 'warning' | 'caution' | 'neutral';
  /** 1 gấp nhất. Bảng ưu tiên spec §1.2. */
  priority: 1 | 2 | 3 | 4;
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

/**
 * Ba cổng chặn, theo đúng thứ tự:
 *  1. archived/closed  — giảng viên đã nói "đừng nhắc nữa" (spec §1.3)
 *  2. phải là `ended`  — grace period còn đang nhận file, kết luận lúc này là
 *                        báo động giả
 *  3. hasRatio         — không biết roster hoặc chưa khai file bắt buộc thì
 *                        không thể nói ai thiếu
 *
 * `invalidFileCount` KHÔNG sinh lý do: chưa luồng production nào tạo ra
 * status 'invalid' (TODO ở submission.service.ts). Đừng để giảng viên tin hệ
 * thống đang canh một thứ nó không canh — spec §4.4.
 */
export function getAttentionReasons(
  item: SessionOverviewItem,
  now: number,
): AttentionReason[] {
  if (item.archivedAt !== null || item.attentionClosedAt !== null) return [];
  if (getSessionPhase(item, now) !== 'ended') return [];
  if (!hasRatio(item)) return [];

  const reasons: AttentionReason[] = [];
  if (item.attendedNoSubmissionCount > 0) {
    reasons.push({
      kind: 'attended-no-submission',
      count: item.attendedNoSubmissionCount,
      label: `${item.attendedNoSubmissionCount} sinh viên vào phòng nhưng không có bài`,
      tone: 'danger',
      priority: 1,
    });
  }
  if (item.partialCount > 0) {
    reasons.push({
      kind: 'partial',
      count: item.partialCount,
      label: `${item.partialCount} sinh viên nộp thiếu file`,
      tone: 'warning',
      priority: 2,
    });
  }
  if (item.neverAttendedCount > 0) {
    reasons.push({
      kind: 'never-attended',
      count: item.neverAttendedCount,
      label: `${item.neverAttendedCount} sinh viên vắng thi`,
      tone: 'caution',
      priority: 3,
    });
  }
  // Cuối danh sách, và cố ý: đây là câu trả lời cho một câu hỏi giảng viên
  // sắp hỏi ("còn em này đâu?"), không phải một việc phải làm. Xếp nó lên
  // trên "vắng thi" là đẩy thông tin lấn chỗ của việc thật.
  if (item.satElsewhereCount > 0) {
    reasons.push({
      kind: 'sat-elsewhere',
      count: item.satElsewhereCount,
      label: `${item.satElsewhereCount} sinh viên thi bù ở phiên khác`,
      tone: 'neutral',
      priority: 4,
    });
  }
  return reasons;
}

/** 5 = không cần chú ý; nhỏ hơn là gấp hơn. Phải nằm NGOÀI dải priority —
 *  khi 'sat-elsewhere' (priority 4) ra đời, một sentinel bằng 4 sẽ xếp phiên
 *  chỉ-thi-bù ngang hàng với phiên chẳng có gì để nói. */
function attentionRank(item: SessionOverviewItem, now: number): number {
  const reasons = getAttentionReasons(item, now);
  return reasons.length === 0 ? 5 : reasons[0].priority;
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
