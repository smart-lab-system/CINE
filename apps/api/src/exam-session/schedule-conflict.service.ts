import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamSessionEntity } from './entities/exam-session.entity';

/**
 * Reports a booking that would collide, in words the lecturer can act on.
 *
 * This is ADVISORY. The authority on the rule is the pair of EXCLUDE
 * constraints on `exam_session` (see AddExamSessionOverlapConstraints):
 * they are what holds when two lecturers submit at the same instant, and
 * what covers write paths that do not go through this service. What this
 * adds is the only thing a constraint cannot — naming the room, the
 * session already holding it, and when — because otherwise the lecturer
 * gets PostgresExceptionFilter's "This request conflicts with an existing
 * record" and no way to act on it.
 *
 * The queries below mirror those constraints exactly: same half-open
 * range, same status predicate. They have to. A pre-check stricter than
 * the constraint refuses valid bookings; a looser one hands back the
 * generic database 409 this class exists to avoid.
 */

/** Formatted for the lecturer reading the error, not for the server's
 * locale. The API has no timezone convention of its own and a VPS commonly
 * runs on UTC, so an unqualified format would report an hour nobody in the
 * room experienced. */
const CLASH_TIME = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const CLASH_DATE = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
});

export function describeWindow(start: Date, end: Date): string {
  const startDay = CLASH_DATE.format(start);
  const endDay = CLASH_DATE.format(end);
  // A window that crosses midnight needs both dates, or "23:00–01:00 ngày
  // 05/09" reads as a session that ran backwards. Lab exams effectively
  // never do this, but the message should not be wrong when one does.
  if (startDay !== endDay) {
    return `${CLASH_TIME.format(start)} ngày ${startDay} đến ${CLASH_TIME.format(end)} ngày ${endDay}`;
  }
  return `${CLASH_TIME.format(start)}–${CLASH_TIME.format(end)} ngày ${startDay}`;
}

interface ScheduleClash {
  sessionName: string;
  ownerName: string;
  startTime: Date;
  endTime: Date;
}

/**
 * Which resource is being checked. Both values are module-level constants,
 * never anything a caller supplies, so interpolating them into SQL below
 * carries no injection surface — only the key and the window are bound
 * parameters, and they are the only caller-supplied values.
 */
interface ClashTarget {
  /** Column on exam_session holding the resource id. */
  column: 'room_id' | 'class_id';
  /** Table the resource's display name comes from. */
  table: 'room' | 'class';
}

const ROOM: ClashTarget = { column: 'room_id', table: 'room' };
const CLASS: ClashTarget = { column: 'class_id', table: 'class' };

@Injectable()
export class ScheduleConflictService {
  constructor(
    @InjectRepository(ExamSessionEntity)
    private readonly sessions: Repository<ExamSessionEntity>,
  ) {}

  /**
   * Throws if this room or this class is already spoken for.
   *
   * The room clash is reported in preference to the class clash: changing
   * room is the cheaper fix, and a lecturer told about both at once has to
   * work out which to act on.
   *
   * NOTE for a future reschedule endpoint: an UPDATE must pass the row's
   * own id so it is excluded from these queries. The EXCLUDE constraints
   * self-exclude automatically — a row cannot conflict with itself — but
   * these queries do not, so without it a reschedule would report the
   * session clashing with where it already is.
   */
  async assertNone(
    roomId: string,
    classId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<void> {
    const roomClash = await this.findClash(ROOM, roomId, startTime, endTime);
    if (roomClash) {
      throw new ConflictException(
        `Phòng ${roomClash.ownerName} đã có phiên thi "${roomClash.sessionName}" lúc ` +
          `${describeWindow(roomClash.startTime, roomClash.endTime)}. ` +
          `Hãy chọn phòng khác hoặc đổi khung giờ.`,
      );
    }

    const classClash = await this.findClash(CLASS, classId, startTime, endTime);
    if (classClash) {
      throw new ConflictException(
        `Lớp ${classClash.ownerName} đã có phiên thi "${classClash.sessionName}" lúc ` +
          `${describeWindow(classClash.startTime, classClash.endTime)}. ` +
          `Một lớp không thể thi hai ca cùng lúc.`,
      );
    }
  }

  private async findClash(
    target: ClashTarget,
    key: string,
    startTime: Date,
    endTime: Date,
  ): Promise<ScheduleClash | undefined> {
    const raw = await this.sessions
      .createQueryBuilder('s')
      .innerJoin(target.table, 'o', `o.id = s.${target.column}`)
      .select([
        's.name AS "sessionName"',
        'o.name AS "ownerName"',
        's.start_time AS "startTime"',
        's.end_time AS "endTime"',
      ])
      .where(`s.${target.column} = :key`, { key })
      // Matches the constraint's predicate EXACTLY — including
      // `collecting`, added 2026-09-11. A finished, collecting or
      // cancelled exam holds nothing, which is what lets a session that
      // ended early free its room for the rest of its declared window.
      //
      // Leaving `collecting` out here while the constraint excludes it
      // makes this pre-check stricter than the constraint, which is the
      // failure this class's own doc comment warns about: it refuses
      // bookings the database would have accepted.
      .andWhere(
        `s.status <> 'collecting' AND s.status <> 'completed' AND s.status <> 'cancelled'`,
      )
      .andWhere(
        `tstzrange(s.start_time, s.end_time, '[)') && tstzrange(:startTime, :endTime, '[)')`,
        { startTime, endTime },
      )
      .orderBy('s.start_time', 'ASC')
      .limit(1)
      .getRawOne<ScheduleClash>();

    if (!raw) {
      return undefined;
    }
    // getRawOne bypasses entity hydration, so these arrive however the
    // driver returned them.
    return {
      ...raw,
      startTime: new Date(raw.startTime),
      endTime: new Date(raw.endTime),
    };
  }
}
