import type { BadgeProps } from '@/components/ui/badge';
import { getDisplaySessionStatus } from '@/lib/exam-session-display';

/**
 * Phép tính thuần cho chế độ xem LỊCH của trang Quản lý kỳ thi.
 *
 * Tách khỏi component vì đây là chỗ duy nhất có thể sai mà không ai nhìn ra
 * bằng mắt: một tuần bắt đầu lệch một ngày, hay một phiên rơi nhầm ca, đều
 * ra một cái lịch trông rất bình thường. Ở đây thì test khoá được.
 */

export const SHIFTS = ['morning', 'afternoon', 'evening'] as const;
export type Shift = (typeof SHIFTS)[number];

export const SHIFT_LABELS: Record<Shift, string> = {
  morning: 'Sáng',
  afternoon: 'Chiều',
  evening: 'Tối',
};

export const SHIFT_HINTS: Record<Shift, string> = {
  morning: 'trước 12:00',
  afternoon: '12:00–18:00',
  evening: 'từ 18:00',
};

/**
 * Ca thi suy từ GIỜ BẮT ĐẦU, không từ khoảng thời gian.
 *
 * Một phiên 11:00–13:00 nằm ở ô Sáng, không phải cả hai ô. Lý do không phải
 * lười: một phiên hiện ở hai ô thì giảng viên đếm nhầm số ca trong ngày, và
 * thẻ luôn in giờ thật nên không có gì mơ hồ để mà cần vẽ hai lần.
 *
 * Cùng quy ước với bộ lọc `from`/`to` ở API, vốn cũng lọc trên `start_time`.
 */
export function shiftOf(startTime: string): Shift {
  const hour = new Date(startTime).getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/** Thứ Hai của tuần chứa `date`, 00:00 giờ địa phương. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0 = Chủ nhật. Tuần ở VN bắt đầu THỨ HAI, nên Chủ nhật phải lùi
  // 6 ngày chứ không phải 0 — đây đúng là chỗ lệch một ngày mà không ai thấy
  // trừ phi hôm đó là Chủ nhật.
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Bảy ngày của tuần chứa `date`, từ Thứ Hai. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const DAY_LABELS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export function dayLabel(date: Date): string {
  return DAY_LABELS[date.getDay()];
}

export function shortDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

export function formatTimeRange(startTime: string, endTime: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  return `${fmt(startTime)} – ${fmt(endTime)}`;
}

/**
 * Khoảng gửi lên API cho một tuần: `[thứ Hai 00:00, thứ Hai kế 00:00)`.
 *
 * Nửa mở, cùng quy ước với `tstzrange(..., '[)')` ở backend — một phiên bắt
 * đầu đúng 00:00 thứ Hai thuộc về tuần MỚI, không phải cả hai.
 */
export function weekRange(weekStart: Date): { from: string; to: string } {
  return {
    from: weekStart.toISOString(),
    to: addDays(weekStart, 7).toISOString(),
  };
}

/**
 * Màu thẻ theo trạng thái.
 *
 * KHÔNG dùng `EXAM_SESSION_STATUS_BADGE_VARIANT` được: nó gán `info` cho CẢ
 * `scheduled` lẫn `collecting`. Trên bảng thì chữ trong badge phân biệt được
 * hai cái; trên lịch thì **màu làm việc một mình**, nên trùng màu là một lỗi.
 * `collecting` lấy `warning` vì đó là trạng thái còn nút chờ ai bấm.
 */
export interface SessionVisual {
  label: string;
  /** Lớp Tailwind cho nền + viền thẻ. */
  card: string;
  /** Lớp Tailwind cho nhãn chữ + chấm màu. */
  accent: string;
  /** Huỷ thì mờ đi và gạch ngang tên. */
  muted: boolean;
}

const VISUALS: Record<string, Omit<SessionVisual, 'label'>> = {
  scheduled: { card: 'border-info/30 bg-info-subtle', accent: 'text-info-strong', muted: false },
  active: { card: 'border-success/30 bg-success-subtle', accent: 'text-success-strong', muted: false },
  collecting: { card: 'border-warning/40 bg-warning-subtle', accent: 'text-warning-strong', muted: false },
  completed: { card: 'border-border bg-surface-2', accent: 'text-muted-foreground', muted: false },
  draft: { card: 'border-dashed border-border bg-surface', accent: 'text-muted-foreground', muted: false },
  cancelled: { card: 'border-border bg-surface opacity-55', accent: 'text-muted-foreground', muted: true },
};

const FALLBACK: Omit<SessionVisual, 'label'> = VISUALS.completed;

/**
 * Nhãn lấy từ `getDisplaySessionStatus` để lịch và bảng không bao giờ gọi
 * cùng một phiên bằng hai tên khác nhau — nó cũng là chỗ suy "Sắp diễn ra"
 * / "Đã kết thúc" từ đồng hồ cho các dòng `active`.
 */
export function sessionVisual(
  status: string,
  startTime: string,
  endTime: string,
): SessionVisual {
  const display: { label: string; variant: NonNullable<BadgeProps['variant']> } =
    getDisplaySessionStatus(status, startTime, endTime);
  return { label: display.label, ...(VISUALS[status] ?? FALLBACK) };
}

/**
 * Khoảng cách tối thiểu giữa hai phiên của cùng một giảng viên.
 *
 * Phải khớp `TEACHER_GAP_MINUTES` ở apps/api và con số 30 trong
 * `examcollect.teacher_busy_range()`. Ở đây nó chỉ để BÁO, không để chặn —
 * server mới là nơi từ chối.
 */
export const TEACHER_GAP_MINUTES = 30;

interface GapInput {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
}

/**
 * Những phiên cách phiên liền trước dưới 30 phút.
 *
 * Trang này chỉ hiện phiên CỦA CHÍNH giảng viên đang đăng nhập, nên mọi cặp
 * ở đây đều là "cùng một người" — không cần so `teacher_id`.
 *
 * Vì sao vẫn tính ở client dù server đã chặn: ràng buộc chỉ chặn phiên TẠO
 * MỚI. Dữ liệu có trước migration vẫn vi phạm và vẫn nằm đó, và lịch chính
 * là màn hình đầu tiên phơi nó ra. Trả về số phút thật để thẻ nói được "cách
 * 15 phút" thay vì một cảnh báo chung chung.
 *
 * Bỏ qua `cancelled`/`completed`/`collecting` — cùng vị từ với ràng buộc, nếu
 * không giao diện sẽ báo động về những phiên mà server coi là đã nhả chỗ.
 */
export function findGapViolations(sessions: GapInput[]): Map<string, number> {
  const out = new Map<string, number>();
  const live = sessions
    .filter((s) => !['cancelled', 'completed', 'collecting'].includes(s.status))
    .slice()
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));

  for (let i = 1; i < live.length; i += 1) {
    const prev = live[i - 1];
    const curr = live[i];
    const gapMs = Date.parse(curr.startTime) - Date.parse(prev.endTime);
    if (gapMs < TEACHER_GAP_MINUTES * 60_000) {
      // Âm nghĩa là CHỒNG giờ, không phải "cách -10 phút". Kẹp về 0 và để
      // thẻ tự nói "chồng giờ" — một con số âm trên giao diện là vô nghĩa.
      out.set(curr.id, Math.max(0, Math.round(gapMs / 60_000)));
    }
  }
  return out;
}
