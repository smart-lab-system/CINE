/**
 * Lịch tiết 1-16 (mỗi tiết 50 phút). Phải khớp với
 * apps/api/src/exam-session/school-periods.ts.
 *
 * Tiết bắt đầu → giờ bắt đầu tiết đó.
 * Tiết kết thúc → giờ kết thúc tiết đó.
 */

export type SchoolPeriod = {
  period: number;
  /** Phút từ nửa đêm (local browser). */
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

export function getSchoolPeriod(period: number): SchoolPeriod | undefined {
  return SCHOOL_PERIODS.find((p) => p.period === period);
}

export function isValidSchoolPeriod(period: number): boolean {
  return Number.isInteger(period) && period >= MIN_SCHOOL_PERIOD && period <= MAX_SCHOOL_PERIOD;
}

export function formatPeriodClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

export function periodSelectLabel(period: number): string {
  const row = getSchoolPeriod(period);
  if (!row) return `Tiết ${period}`;
  return `Tiết ${period} (${formatPeriodClock(row.startMinutes)} - ${formatPeriodClock(row.endMinutes)})`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` + phút trong ngày → `YYYY-MM-DDTHH:mm` (local, như datetime-local). */
export function dateAndMinutesToLocal(date: string, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${date}T${pad(h)}:${pad(m)}`;
}

/** Các mức thời gian thi chuẩn trên form (phút). */
export const EXAM_DURATION_OPTIONS = [45, 60, 75, 90] as const;
export type ExamDurationMinutes = (typeof EXAM_DURATION_OPTIONS)[number];

export function isExamDurationMinutes(value: number): value is ExamDurationMinutes {
  return (EXAM_DURATION_OPTIONS as readonly number[]).includes(value);
}

/**
 * Map ngày + tiết bắt đầu/kết thúc → cặp giá trị local cho Date/ISO.
 * Trả null nếu ngày hoặc tiết không hợp lệ / end < start.
 */
export function periodToLocalDateTimes(
  examDate: string,
  startPeriod: number,
  endPeriod: number,
): { startLocal: string; endLocal: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return null;
  const start = getSchoolPeriod(startPeriod);
  const end = getSchoolPeriod(endPeriod);
  if (!start || !end || endPeriod < startPeriod) return null;
  return {
    startLocal: dateAndMinutesToLocal(examDate, start.startMinutes),
    endLocal: dateAndMinutesToLocal(examDate, end.endMinutes),
  };
}

/** Tiết kết thúc gần nhất sao cho giờ kết thúc tiết ≥ phút kết thúc ca thi. */
export function inferEndPeriodFromEndMinutes(
  endMinutes: number,
  startPeriod: number,
): number | null {
  const exact = SCHOOL_PERIODS.find((p) => p.endMinutes === endMinutes);
  if (exact && exact.period >= startPeriod) return exact.period;
  const covering = SCHOOL_PERIODS.find(
    (p) =>
      p.period >= startPeriod &&
      p.startMinutes < endMinutes &&
      p.endMinutes >= endMinutes,
  );
  if (covering) return covering.period;
  const after = SCHOOL_PERIODS.find(
    (p) => p.period >= startPeriod && p.endMinutes >= endMinutes,
  );
  return after?.period ?? null;
}

/**
 * Ngày + tiết bắt đầu + thời gian thi (phút) → start/end local và tiết kết thúc tối thiểu suy ra.
 */
export function scheduleFromStartAndDuration(
  examDate: string,
  startPeriod: number,
  durationMinutes: number,
): { startLocal: string; endLocal: string; endPeriod: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  const start = getSchoolPeriod(startPeriod);
  if (!start) return null;
  const endMinutes = start.startMinutes + durationMinutes;
  // Không kéo sang ngày hôm sau trên form (ca tối tối đa hết tiết 16).
  if (endMinutes > hm(21, 30)) return null;
  const endPeriod = inferEndPeriodFromEndMinutes(endMinutes, startPeriod);
  if (endPeriod === null) return null;
  return {
    startLocal: dateAndMinutesToLocal(examDate, start.startMinutes),
    endLocal: dateAndMinutesToLocal(examDate, endMinutes),
    endPeriod,
  };
}

/**
 * Ngày + tiết BD/KT + thời lượng → ISO local.
 * endTime = bắt đầu tiết BD + duration (đếm ngược / thu bài).
 * Tiết KT phải ≥ tiết suy ra từ duration (khung tiết phủ hết giờ thi).
 */
export function scheduleFromPeriodsAndDuration(
  examDate: string,
  startPeriod: number,
  endPeriod: number,
  durationMinutes: number,
): { startLocal: string; endLocal: string } | null {
  if (endPeriod < startPeriod) return null;
  const fromDuration = scheduleFromStartAndDuration(examDate, startPeriod, durationMinutes);
  if (!fromDuration) return null;
  if (endPeriod < fromDuration.endPeriod) return null;
  const slot = periodToLocalDateTimes(examDate, startPeriod, endPeriod);
  if (!slot) return null;
  // Khung tiết phải kết thúc không sớm hơn giờ hết bài.
  if (slot.endLocal < fromDuration.endLocal) return null;
  return {
    startLocal: fromDuration.startLocal,
    endLocal: fromDuration.endLocal,
  };
}

/** Suy thời gian thi (phút) từ cặp ISO/local; khớp 45/60/75/90 thì trả đúng, không thì null. */
export function inferDurationMinutes(
  startLocalOrIso: string,
  endLocalOrIso: string,
): ExamDurationMinutes | null {
  const start = new Date(startLocalOrIso).getTime();
  const end = new Date(endLocalOrIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const minutes = Math.round((end - start) / 60_000);
  return isExamDurationMinutes(minutes) ? minutes : null;
}

function localMinutesOfDayFromIsoOrLocal(value: string): number | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

/** `YYYY-MM-DD` theo local timezone từ ISO hoặc datetime-local. */
export function toLocalDateParts(value: string): string | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localDateFromIsoOrLocal(value: string): string | null {
  return toLocalDateParts(value);
}

/**
 * Suy tiết từ start/end local hoặc ISO (phiên cũ không có period).
 * Khớp đúng phút bắt đầu/kết thúc của bảng tiết; không khớp → null.
 */
export function inferPeriodsFromLocal(
  startLocalOrIso: string,
  endLocalOrIso: string,
): { examDate: string; startPeriod: number; endPeriod: number } | null {
  const examDate = localDateFromIsoOrLocal(startLocalOrIso);
  const endDate = localDateFromIsoOrLocal(endLocalOrIso);
  if (!examDate || !endDate || examDate !== endDate) return null;

  const startMin = localMinutesOfDayFromIsoOrLocal(startLocalOrIso);
  const endMin = localMinutesOfDayFromIsoOrLocal(endLocalOrIso);
  if (startMin === null || endMin === null) return null;

  const startPeriod = SCHOOL_PERIODS.find((p) => p.startMinutes === startMin)?.period;
  if (startPeriod === undefined) return null;
  // endTime thường = start + duration (vd. 6h30 + 90 = 8h00), không phải
  // đúng phút kết thúc tiết - dùng suy tiết phủ như form tạo phiên.
  const endPeriod = inferEndPeriodFromEndMinutes(endMin, startPeriod);
  if (endPeriod === null || endPeriod < startPeriod) return null;
  return { examDate, startPeriod, endPeriod };
}
