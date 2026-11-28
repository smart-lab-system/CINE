import {
  getSchoolPeriod,
  inferDurationMinutes,
  inferPeriodsFromLocal,
  scheduleFromPeriodsAndDuration,
  toLocalDateParts,
} from '@/lib/school-periods';
import type { SetupInfoDraft } from './setup-draft';
import { toLocalInputValue } from './setup-draft';

const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

function localTimeOfDay(isoOrLocal: string): string {
  const local = toLocalInputValue(isoOrLocal);
  return local.length >= 16 ? local.slice(11, 16) : '';
}

function startMatchesPeriodStart(startTime: string, startPeriod: number): boolean {
  const period = getSchoolPeriod(startPeriod);
  if (!period) return false;
  const d = new Date(startTime);
  if (Number.isNaN(d.getTime())) return false;
  return d.getHours() * 60 + d.getMinutes() === period.startMinutes;
}

/** Ngày + giờ tường `HH:mm` + thời lượng → start/end local. */
export function scheduleFromStartTimeAndDuration(
  examDate: string,
  startTimeOfDay: string,
  durationMinutes: number,
): { startLocal: string; endLocal: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return null;
  if (!TIME_OF_DAY.test(startTimeOfDay)) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;

  const startLocal = `${examDate}T${startTimeOfDay}`;
  const startMs = new Date(startLocal).getTime();
  if (!Number.isFinite(startMs)) return null;
  const endLocal = toLocalInputValue(new Date(startMs + durationMinutes * 60_000).toISOString());
  if (!endLocal) return null;
  return { startLocal, endLocal };
}

/** Dựng draft lịch từ response phiên (period + duration hoặc suy từ giờ). */
export function infoDraftFromSession(session: {
  examType: string;
  roomId: string | null;
  startTime: string;
  endTime: string;
  startPeriod?: number | null;
  endPeriod?: number | null;
  durationMinutes?: number | null;
}): SetupInfoDraft {
  const examDate =
    toLocalDateParts(session.startTime) ??
    toLocalInputValue(session.startTime).slice(0, 10);
  const wallClock = localTimeOfDay(session.startTime);

  if (
    session.startPeriod != null &&
    session.startPeriod >= 1 &&
    session.endPeriod != null &&
    session.endPeriod >= 1 &&
    session.durationMinutes != null &&
    session.durationMinutes > 0
  ) {
    const usesPeriodStart = startMatchesPeriodStart(session.startTime, session.startPeriod);
    return {
      examType: session.examType,
      roomId: session.roomId ?? '',
      examDate,
      startTimeOfDay: usesPeriodStart ? '' : TIME_OF_DAY.test(wallClock) ? wallClock : '',
      startPeriod: session.startPeriod,
      endPeriod: session.endPeriod,
      durationMinutes: session.durationMinutes,
    };
  }

  const duration = inferDurationMinutes(session.startTime, session.endTime);
  const inferred = inferPeriodsFromLocal(session.startTime, session.endTime);
  if (duration && inferred) {
    return {
      examType: session.examType,
      roomId: session.roomId ?? '',
      examDate: inferred.examDate,
      startTimeOfDay: '',
      startPeriod: session.startPeriod ?? inferred.startPeriod,
      endPeriod: session.endPeriod ?? inferred.endPeriod,
      durationMinutes: duration,
    };
  }

  // Không khớp tiết - điền giờ tường để sửa mà không bắt buộc chọn tiết bắt đầu.
  return {
    examType: session.examType,
    roomId: session.roomId ?? '',
    examDate,
    startTimeOfDay: TIME_OF_DAY.test(wallClock) ? wallClock : '',
    startPeriod: session.startPeriod && session.startPeriod >= 1 ? session.startPeriod : 0,
    endPeriod: session.endPeriod && session.endPeriod >= 1 ? session.endPeriod : 0,
    durationMinutes: duration ?? 0,
  };
}

export function infoDraftToLocalRange(
  info: SetupInfoDraft,
): { startLocal: string; endLocal: string } | null {
  if (info.startTimeOfDay) {
    if (!info.examDate || !info.durationMinutes) return null;
    return scheduleFromStartTimeAndDuration(
      info.examDate,
      info.startTimeOfDay,
      info.durationMinutes,
    );
  }
  if (!info.examDate || !info.startPeriod || !info.endPeriod || !info.durationMinutes) {
    return null;
  }
  return scheduleFromPeriodsAndDuration(
    info.examDate,
    info.startPeriod,
    info.endPeriod,
    info.durationMinutes,
  );
}
