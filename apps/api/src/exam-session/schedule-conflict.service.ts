import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamSessionEntity } from './entities/exam-session.entity';

/**
 * Reports a booking that would collide, in words the lecturer can act on.
 *
 * This is ADVISORY. The authority on the rule is the EXCLUDE constraints on `exam_session` (room, class, teacher gap):
 * they are what holds when two lecturers submit at the same instant, and what covers write paths that do not go through
 * this service. What this adds is the only thing a constraint cannot — naming the room, the session already holding it,
 * and when — because otherwise the lecturer gets PostgresExceptionFilter's "This request conflicts with an existing
 * record" and no way to act on it.
 *
 * The queries below mirror those constraints exactly: same half-open range, same status predicate. They have to. A
 * pre-check stricter than the constraint refuses valid bookings; a looser one hands back the generic database 409 this
 * class exists to avoid.
 */

/** Formatted for the lecturer reading the error, not for the server's locale. The API has no timezone convention of its
 *  own and a VPS commonly runs on UTC, so an unqualified format would report an hour nobody in the room experienced. */
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
  // A window that crosses midnight needs both dates, or "23:00–01:00 ngày 05/09" reads as a session that ran backwards.
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
 * Khoảng cách tối thiểu giữa hai phiên của CÙNG một giảng viên, tính từ `end_time` của phiên trước tới `start_time` của
 * phiên sau. Phải khớp con số 30 trong `examcollect.teacher_busy_range()` (migration `1789350000000-TeacherScheduleGap`).
 * Đổi một chỗ mà quên chỗ kia thì lớp kiểm này lệch khỏi ràng buộc.
 */
export const TEACHER_GAP_MINUTES = 30;

/** Một lịch đang được hỏi "có va chạm không". */
export interface ScheduleCheck {
  roomId: string;
  classId: string;
  teacherId: string;
  startTime: Date;
  endTime: Date;
  /**
   * Phiên cần LOẠI khỏi ba phép kiểm — dùng khi SỬA một phiên đã có. Ràng buộc EXCLUDE của DB tự bỏ qua chính dòng đang
   * UPDATE (một dòng không va chạm với chính nó), còn các truy vấn ở đây thì KHÔNG, nên không có tham số này thì sửa một
   * phiên sẽ báo nó va chạm với chính nơi nó đang ở. Chỉ loại ĐÚNG phiên này: phiên khác cùng phòng vẫn bị phát hiện.
   */
  excludeSessionId?: string;
}

/** Vị từ trạng thái của ba ràng buộc: collecting/completed/cancelled không còn giữ chỗ. */
const HOLDING = `s.status <> 'collecting' AND s.status <> 'completed' AND s.status <> 'cancelled'`;

@Injectable()
export class ScheduleConflictService {
  constructor(
    @InjectRepository(ExamSessionEntity)
    private readonly sessions: Repository<ExamSessionEntity>,
  ) {}

  /**
   * Throws if this room or this class is already spoken for, or the teacher is too close to another session.
   *
   * The room clash is reported in preference to the class clash: changing room is the cheaper fix, and a lecturer told
   * about both at once has to work out which to act on.
   */
  async assertNone(check: ScheduleCheck): Promise<void> {
    const exclude = check.excludeSessionId ?? null;

    const roomClash = await this.firstClash(
      `SELECT s.name AS "sessionName", r.name::text AS "ownerName",
              s.start_time AS "startTime", s.end_time AS "endTime"
         FROM examcollect.exam_session s
         JOIN examcollect.room r ON r.id = s.room_id
        WHERE s.room_id = $1
          AND ${HOLDING}
          AND tstzrange(s.start_time, s.end_time, '[)') && tstzrange($2, $3, '[)')
          AND ($4::uuid IS NULL OR s.id <> $4)
        ORDER BY s.start_time LIMIT 1`,
      [check.roomId, check.startTime, check.endTime, exclude],
    );
    if (roomClash) {
      throw new ConflictException(
        `Phòng ${roomClash.ownerName} đã có phiên thi "${roomClash.sessionName}" lúc ` +
          `${describeWindow(roomClash.startTime, roomClash.endTime)}. ` +
          `Hãy chọn phòng khác hoặc đổi khung giờ.`,
      );
    }

    const classClash = await this.firstClash(
      `SELECT s.name AS "sessionName", cl.label AS "ownerName",
              s.start_time AS "startTime", s.end_time AS "endTime"
         FROM examcollect.exam_session s
         JOIN examcollect.class_label cl ON cl.class_id = s.class_id
        WHERE s.class_id = $1 AND ${HOLDING}
          AND tstzrange(s.start_time, s.end_time, '[)') && tstzrange($2, $3, '[)')
          AND ($4::uuid IS NULL OR s.id <> $4)
        ORDER BY s.start_time LIMIT 1`,
      [check.classId, check.startTime, check.endTime, exclude],
    );
    if (classClash) {
      throw new ConflictException(
        `Lớp ${classClash.ownerName} đã có phiên thi "${classClash.sessionName}" lúc ` +
          `${describeWindow(classClash.startTime, classClash.endTime)}. ` +
          `Một lớp không thể thi hai ca cùng lúc.`,
      );
    }

    // Báo SAU hai cái trên, cố ý: trùng phòng hay trùng lớp là va chạm cứng, còn đây là luật đi lại. Nếu một lịch phạm cả
    // hai thì cái cứng hơn là cái giảng viên cần nghe trước.
    //
    // Gọi hàm SQL của chính migration thay vì chép lại phép cộng: một bản sao là một chỗ để lệch, và lệch ở đây thì triệu
    // chứng là 409 chung chung từ `PostgresExceptionFilter` — đúng thứ cả lớp này sinh ra để tránh. `collecting` cũng giải
    // phóng giảng viên (`finalize` là họ chủ động tuyên bố ca thi xong), nên vị từ trạng thái giống hệt hai phép trên.
    const gapClash = await this.firstClash(
      `SELECT s.name AS "sessionName", s.name AS "ownerName",
              s.start_time AS "startTime", s.end_time AS "endTime"
         FROM examcollect.exam_session s
        WHERE s.teacher_id = $1 AND ${HOLDING}
          AND examcollect.teacher_busy_range(s.start_time, s.end_time)
           && examcollect.teacher_busy_range($2, $3)
          AND ($4::uuid IS NULL OR s.id <> $4)
        ORDER BY s.start_time LIMIT 1`,
      [check.teacherId, check.startTime, check.endTime, exclude],
    );
    if (gapClash) {
      throw new ConflictException(
        `Bạn đã có phiên thi "${gapClash.sessionName}" lúc ` +
          `${describeWindow(gapClash.startTime, gapClash.endTime)}. ` +
          `Hai phiên của cùng một giảng viên phải cách nhau ít nhất ${TEACHER_GAP_MINUTES} phút.`,
      );
    }
  }

  private async firstClash(sql: string, params: unknown[]): Promise<ScheduleClash | undefined> {
    const [raw] = await this.sessions.query(sql, params);
    if (!raw) {
      return undefined;
    }
    // Truy vấn thô trả cột theo cách driver trả chúng.
    return { ...raw, startTime: new Date(raw.startTime), endTime: new Date(raw.endTime) };
  }
}
