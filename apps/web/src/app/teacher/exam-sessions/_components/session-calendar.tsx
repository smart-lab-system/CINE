'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EXAM_TYPE_LABELS } from '@/lib/exam-session-display';
import {
  SHIFTS,
  SHIFT_HINTS,
  SHIFT_LABELS,
  TEACHER_GAP_MINUTES,
  dayLabel,
  findGapViolations,
  formatTimeRange,
  isSameDay,
  sessionVisual,
  shiftOf,
  shortDate,
  weekDays,
} from '@/lib/exam-calendar';
import type { ExamSessionListItem } from '@/lib/api/exam-session';

/**
 * Lưới `Ca thi × 7 ngày` cho trang Quản lý kỳ thi.
 *
 * Là một `<table>` THẬT, không phải lưới div. Đây là dữ liệu dạng bảng đúng
 * nghĩa — hàng là ca, cột là ngày — nên `<th scope>` cho trình đọc màn hình
 * biết "ô này là ca nào, ngày nào" mà không phải thêm một dòng aria nào.
 *
 * Mỗi thẻ mang NHÃN CHỮ trạng thái, không chỉ màu: truyền thông tin bằng màu
 * đơn thuần là lỗi tiếp cận mức cao, và chú giải ở chân lưới chỉ là bổ trợ.
 */
export function SessionCalendar({
  sessions,
  weekStart,
}: {
  sessions: ExamSessionListItem[];
  weekStart: Date;
}) {
  const days = weekDays(weekStart);
  const today = new Date();
  const violations = findGapViolations(sessions);

  // Gom một lần thành `ngày|ca -> phiên[]` thay vì lọc lại ở mỗi trong 21 ô.
  const buckets = new Map<string, ExamSessionListItem[]>();
  for (const session of sessions) {
    const start = new Date(session.startTime);
    const key = `${start.toDateString()}|${shiftOf(session.startTime)}`;
    const list = buckets.get(key);
    if (list) list.push(session);
    else buckets.set(key, [session]);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Cuộn ngang nằm TRONG khung này, không phải body trang trượt: cuộn
          ngang cả trang là lỗi bố cục, còn cuộn ngang một bảng trong khung
          `overflow-x-auto` lại đúng là cách xử lý bảng rộng trên mobile. */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] table-fixed border-collapse text-small">
            <caption className="sr-only">
              Lịch phiên thi tuần {shortDate(days[0])} đến {shortDate(days[6])}, xếp theo ca
              thi và ngày
            </caption>
            <colgroup>
              <col className="w-[92px]" />
              {days.map((day) => (
                <col key={day.toISOString()} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-surface-2">
                <th
                  scope="col"
                  className="border-b border-r border-border px-3 py-2.5 text-left text-caption font-semibold text-muted-foreground"
                >
                  Ca thi
                </th>
                {days.map((day) => {
                  const isToday = isSameDay(day, today);
                  return (
                    <th
                      key={day.toISOString()}
                      scope="col"
                      className={cn(
                        'border-b border-r border-border px-2 py-2 last:border-r-0',
                        isToday && 'bg-accent-subtle',
                      )}
                    >
                      <div
                        className={cn(
                          'text-small font-semibold',
                          isToday ? 'text-accent-strong' : 'text-foreground',
                        )}
                      >
                        {dayLabel(day)}
                      </div>
                      <div
                        className={cn(
                          'text-caption font-medium',
                          isToday ? 'text-accent-strong' : 'text-muted-foreground',
                        )}
                      >
                        {shortDate(day)}
                        {isToday && ' · hôm nay'}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {SHIFTS.map((shift, shiftIndex) => (
                <tr key={shift}>
                  <th
                    scope="row"
                    className={cn(
                      'border-r border-border bg-surface-2 px-3 py-2.5 text-left align-top text-small font-semibold text-foreground',
                      shiftIndex < SHIFTS.length - 1 && 'border-b',
                    )}
                  >
                    {SHIFT_LABELS[shift]}
                    <div className="mt-0.5 text-caption font-medium text-muted-foreground">
                      {SHIFT_HINTS[shift]}
                    </div>
                  </th>
                  {days.map((day) => {
                    const cell = buckets.get(`${day.toDateString()}|${shift}`) ?? [];
                    return (
                      <td
                        key={day.toISOString()}
                        className={cn(
                          'border-r border-border p-2 align-top last:border-r-0',
                          shiftIndex < SHIFTS.length - 1 && 'border-b',
                          isSameDay(day, today) && 'bg-accent-subtle/25',
                        )}
                      >
                        {cell.length > 0 && (
                          // gap-2 = 8px: khoảng cách tối thiểu giữa hai đích
                          // chạm liền nhau, để không bấm nhầm phiên.
                          <div className="flex flex-col gap-2">
                            {cell.map((session) => (
                              <SessionCard
                                key={session.id}
                                session={session}
                                gapMinutes={violations.get(session.id)}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <CalendarLegend />
    </div>
  );
}

function SessionCard({
  session,
  gapMinutes,
}: {
  session: ExamSessionListItem;
  gapMinutes: number | undefined;
}) {
  const visual = sessionVisual(session.status, session.startTime, session.endTime);
  const hasGapIssue = gapMinutes !== undefined;

  return (
    // Cả thẻ là một <a>: Tab tới được và bấm đâu cũng vào phòng chờ. Một div
    // có onClick thì bàn phím bỏ qua hoàn toàn.
    <Link
      href={`/exam-sessions/${session.id}`}
      className={cn(
        'block rounded-lg border p-2.5 transition-shadow duration-150 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        visual.card,
        hasGapIssue && 'border-destructive',
      )}
    >
      <span className={cn('inline-flex items-center gap-1.5 text-caption font-semibold', visual.accent)}>
        <span
          aria-hidden="true"
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            session.status === 'draft' ? 'border border-current' : 'bg-current',
          )}
        />
        {visual.label}
      </span>
      <div
        className={cn(
          'mt-1.5 text-small font-semibold leading-snug text-foreground',
          visual.muted && 'line-through',
        )}
      >
        {session.name}
      </div>
      <div className={cn('text-small font-medium text-foreground', visual.muted && 'line-through')}>
        {formatTimeRange(session.startTime, session.endTime)}
      </div>
      <div className="mt-0.5 text-caption text-muted-foreground">
        {session.roomName} · {session.className} ·{' '}
        {EXAM_TYPE_LABELS[session.examType] ?? session.examType}
      </div>
      {hasGapIssue && (
        <div className="mt-1.5 flex items-start gap-1 border-t border-destructive/30 pt-1.5 text-caption font-semibold leading-snug text-destructive">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            {gapMinutes === 0
              ? 'Chồng giờ với phiên trước'
              : `Cách phiên trước ${gapMinutes} phút`}{' '}
            — cần tối thiểu {TEACHER_GAP_MINUTES}
          </span>
        </div>
      )}
    </Link>
  );
}

const LEGEND: Array<{ label: string; swatch: string }> = [
  { label: 'Chưa diễn ra', swatch: 'border-info/30 bg-info-subtle' },
  { label: 'Đang diễn ra', swatch: 'border-success/30 bg-success-subtle' },
  { label: 'Đang thu bài', swatch: 'border-warning/40 bg-warning-subtle' },
  { label: 'Đã hoàn thành', swatch: 'border-border bg-surface-2' },
  { label: 'Nháp', swatch: 'border-dashed border-border bg-surface' },
  { label: 'Đã huỷ', swatch: 'border-border bg-surface opacity-55' },
];

function CalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-muted-foreground">
      <span className="font-semibold text-foreground">Chú giải</span>
      {LEGEND.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-sm border', item.swatch)} />
          {item.label}
        </span>
      ))}
      {/* Nói thẳng ra rằng màu chỉ là bổ trợ — người đọc bằng trình đọc màn
          hình không mất gì, vì nhãn trạng thái đã nằm trong từng thẻ. */}
      <span className="italic">Màu chỉ bổ trợ — mỗi thẻ đã mang nhãn chữ riêng.</span>
    </div>
  );
}
