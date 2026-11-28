/**
 * Lịch tiết 1-16 (mỗi tiết 50 phút). Phải khớp byte-for-byte với
 * apps/web/src/lib/school-periods.ts — form map tiết → startTime/endTime
 * theo bảng này.
 *
 * Tiết bắt đầu → giờ bắt đầu tiết đó.
 * Tiết kết thúc → giờ kết thúc tiết đó.
 */

export type SchoolPeriod = {
  period: number;
  /** Phút từ nửa đêm (local). */
  startMinutes: number;
  endMinutes: number;
  label: string;
};

function hm(h: number, m: number): number {
  return h * 60 + m;
}

export const SCHOOL_PERIODS: readonly SchoolPeriod[] = [
  { period: 1, startMinutes: hm(6, 30), endMinutes: hm(7, 20), label: 'Buổi sáng' },
  { period: 2, startMinutes: hm(7, 20), endMinutes: hm(8, 10), label: 'Buổi sáng' },
  { period: 3, startMinutes: hm(8, 10), endMinutes: hm(9, 0), label: 'Buổi sáng' },
  { period: 4, startMinutes: hm(9, 10), endMinutes: hm(10, 0), label: 'Buổi sáng' },
  { period: 5, startMinutes: hm(10, 0), endMinutes: hm(10, 50), label: 'Buổi sáng' },
  { period: 6, startMinutes: hm(10, 50), endMinutes: hm(11, 40), label: 'Buổi sáng' },
  { period: 7, startMinutes: hm(12, 30), endMinutes: hm(13, 20), label: 'Buổi chiều' },
  { period: 8, startMinutes: hm(13, 20), endMinutes: hm(14, 10), label: 'Buổi chiều' },
  { period: 9, startMinutes: hm(14, 10), endMinutes: hm(15, 0), label: 'Buổi chiều' },
  { period: 10, startMinutes: hm(15, 10), endMinutes: hm(16, 0), label: 'Buổi chiều' },
  { period: 11, startMinutes: hm(16, 0), endMinutes: hm(16, 50), label: 'Buổi chiều' },
  { period: 12, startMinutes: hm(16, 50), endMinutes: hm(17, 40), label: 'Buổi chiều' },
  { period: 13, startMinutes: hm(18, 0), endMinutes: hm(18, 50), label: 'Buổi tối' },
  { period: 14, startMinutes: hm(18, 50), endMinutes: hm(19, 40), label: 'Buổi tối' },
  { period: 15, startMinutes: hm(19, 50), endMinutes: hm(20, 40), label: 'Buổi tối' },
  { period: 16, startMinutes: hm(20, 40), endMinutes: hm(21, 30), label: 'Buổi tối' },
] as const;

export const MIN_SCHOOL_PERIOD = 1;
export const MAX_SCHOOL_PERIOD = 16;

/** Các mức thời gian thi chuẩn (phút) - khớp form web. */
export const EXAM_DURATION_OPTIONS = [45, 60, 75, 90] as const;
export type ExamDurationMinutes = (typeof EXAM_DURATION_OPTIONS)[number];

export function isExamDurationMinutes(value: number): value is ExamDurationMinutes {
  return (EXAM_DURATION_OPTIONS as readonly number[]).includes(value);
}

export function getSchoolPeriod(period: number): SchoolPeriod | undefined {
  return SCHOOL_PERIODS.find((p) => p.period === period);
}

export function isValidSchoolPeriod(period: number): boolean {
  return Number.isInteger(period) && period >= MIN_SCHOOL_PERIOD && period <= MAX_SCHOOL_PERIOD;
}

/** Phút từ nửa đêm của một Date (theo local timezone của process). */
export function localMinutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function formatPeriodClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/**
 * Kiểm start/end/period/duration khớp nhau (API create + updateSchedule).
 * Không siết startTime phải đúng phút bắt đầu tiết - e2e / backdate live
 * window dùng đồng hồ tường; form web đã map tiết → ISO.
 */
export function examScheduleCoherenceError(
  startTime: Date,
  endTime: Date,
  startPeriod: number,
  endPeriod: number,
  durationMinutes: number,
): string | null {
  if (!(endTime > startTime)) {
    return 'endTime phải sau startTime.';
  }
  if (!isValidSchoolPeriod(startPeriod) || !isValidSchoolPeriod(endPeriod)) {
    return 'startPeriod/endPeriod phải trong khoảng 1-16.';
  }
  if (endPeriod < startPeriod) {
    return 'endPeriod phải lớn hơn hoặc bằng startPeriod.';
  }
  if (!isExamDurationMinutes(durationMinutes)) {
    return `durationMinutes phải là một trong: ${EXAM_DURATION_OPTIONS.join(', ')}.`;
  }

  const actualMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60_000);
  if (actualMinutes !== durationMinutes) {
    return `durationMinutes (${durationMinutes}) không khớp endTime - startTime (${actualMinutes} phút).`;
  }

  const start = getSchoolPeriod(startPeriod);
  const end = getSchoolPeriod(endPeriod);
  if (!start || !end) {
    return 'startPeriod/endPeriod không hợp lệ.';
  }
  const examEndMinutes = start.startMinutes + durationMinutes;
  if (end.endMinutes < examEndMinutes) {
    return `endPeriod (tiết ${endPeriod}) kết thúc sớm hơn khung giờ thi (${durationMinutes} phút từ tiết ${startPeriod}).`;
  }
  return null;
}
