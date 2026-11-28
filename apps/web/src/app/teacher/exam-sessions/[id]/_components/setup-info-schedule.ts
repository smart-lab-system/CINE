import {
  inferDurationMinutes,
  inferPeriodsFromLocal,
  scheduleFromPeriodsAndDuration,
  toLocalDateParts,
} from '@/lib/school-periods';
import type { SetupInfoDraft } from './setup-draft';
import { toLocalInputValue } from './setup-draft';

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

  if (
    session.startPeriod != null &&
    session.startPeriod >= 1 &&
    session.endPeriod != null &&
    session.endPeriod >= 1 &&
    session.durationMinutes != null &&
    session.durationMinutes > 0
  ) {
    return {
      examType: session.examType,
      roomId: session.roomId ?? '',
      examDate,
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
      startPeriod: session.startPeriod ?? inferred.startPeriod,
      endPeriod: session.endPeriod ?? inferred.endPeriod,
      durationMinutes: duration,
    };
  }

  // Không khớp - buộc chọn lại khi sửa.
  return {
    examType: session.examType,
    roomId: session.roomId ?? '',
    examDate,
    startPeriod: session.startPeriod && session.startPeriod >= 1 ? session.startPeriod : 0,
    endPeriod: session.endPeriod && session.endPeriod >= 1 ? session.endPeriod : 0,
    durationMinutes: 0,
  };
}

export function infoDraftToLocalRange(
  info: SetupInfoDraft,
): { startLocal: string; endLocal: string } | null {
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
