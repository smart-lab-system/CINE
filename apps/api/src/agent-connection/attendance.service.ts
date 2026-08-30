import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentConnectionEventEntity } from './entities/agent-connection-event.entity';
import { EnrollmentEntity } from '../course/entities/enrollment.entity';
import { ClassEntity } from '../course/entities/class.entity';
import { SubmissionEntity } from '../submission/entities/submission.entity';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import {
  AttendanceDiscrepancy,
  AttendanceStudentView,
  AttendanceView,
} from './attendance.types';

/** The events that mean "this student is currently in the room". */
const PRESENT_EVENTS = new Set(['connected', 'reconnected']);

/**
 * Attendance, written to the log and read back out of it.
 *
 * Before this, who had joined lived only in the invigilator's browser tab —
 * one refresh and it was gone, and there was no baseline to measure
 * submissions against afterwards. `agent_connection_event` was designed for
 * exactly this and had never been written to.
 *
 * Nothing here stores presence a second time. Every group, every mark, and
 * the discrepancy are all folded out of the event stream, so the answer can
 * never drift from the log that produced it.
 */
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @InjectRepository(AgentConnectionEventEntity)
    private readonly events: Repository<AgentConnectionEventEntity>,
    @InjectRepository(EnrollmentEntity)
    private readonly enrollments: Repository<EnrollmentEntity>,
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
    @InjectRepository(SubmissionEntity)
    private readonly submissions: Repository<SubmissionEntity>,
  ) {}

  /**
   * Writes `connected`, or `reconnected` if this MSSV has been seen in this
   * session before. The distinction is the whole point of §6.3: after a
   * headcount, a machine that crashed and came back must not read the same
   * as someone who appeared out of nowhere.
   *
   * `joinedLate` is set from the clock, never from an approval — CLAUDE.md
   * Phase 2 step 6. A legitimate student arriving late already loses time;
   * adding friction on top would be the wrong trade.
   *
   * Never throws into the join path: attendance is a record of what
   * happened, and failing to write it must not deny a student their exam.
   */
  async recordJoin(
    examSessionId: string,
    studentMssv: string,
    startTime: Date,
  ): Promise<void> {
    // Stamped here, not left to the column default. The default is the
    // moment the INSERT reaches Postgres, which is not the moment the thing
    // happened — and under load those two orders can disagree. A log whose
    // whole job is telling "came back" from "appeared afterwards" cannot
    // have its ordering decided by how busy the pool was.
    const occurredAt = new Date();
    try {
      const seenBefore = await this.events.count({
        where: { examSessionId, studentMssv },
      });
      await this.events.insert({
        examSessionId,
        studentMssv,
        eventType: seenBefore > 0 ? 'reconnected' : 'connected',
        joinedLate: occurredAt.getTime() > startTime.getTime(),
        occurredAt,
      });
    } catch (error) {
      this.logger.error(
        `could not log join for ${studentMssv} in session ${examSessionId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** Same contract as recordJoin: logged if possible, never fatal. */
  async recordDisconnect(examSessionId: string, studentMssv: string): Promise<void> {
    const occurredAt = new Date();
    try {
      await this.events.insert({
        examSessionId,
        studentMssv,
        eventType: 'disconnected',
        joinedLate: false,
        occurredAt,
      });
    } catch (error) {
      this.logger.error(
        `could not log disconnect for ${studentMssv} in session ${examSessionId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** How many students are in the room right now — the headcount's number. */
  async countPresent(examSessionId: string): Promise<number> {
    const events = await this.loadEvents(examSessionId);
    return [...this.fold(events).values()].filter((s) => s.connected).length;
  }

  /**
   * The lobby's whole answer: three groups, the headcount, and — once the
   * session is over — who submitted without having been counted.
   */
  async buildView(session: ExamSessionEntity): Promise<AttendanceView> {
    const events = await this.loadEvents(session.id);
    const seen = this.fold(events);

    // Course-scoped, not class-scoped: a make-up student IS enrolled here,
    // just through a different class, and resolving their name and home
    // class is the entire point of showing them separately.
    const enrolled = await this.enrollments.find({ where: { courseId: session.courseId } });
    const byMssv = new Map(enrolled.map((row) => [row.studentMssv.toLowerCase(), row]));

    const classNames = new Map(
      (await this.classes.find({ where: { courseId: session.courseId } })).map((row) => [
        row.id,
        row.name,
      ]),
    );

    const confirmedAt = session.attendanceConfirmedAt;
    const roster = enrolled.filter((row) => row.homeClassId === session.classId);

    const present: AttendanceStudentView[] = [];
    const absent: AttendanceStudentView[] = [];
    const makeup: AttendanceStudentView[] = [];

    for (const enrollment of roster) {
      const view = this.toView(enrollment.studentMssv, enrollment.studentName, seen, confirmedAt);
      (view.connected ? present : absent).push(view);
    }

    // Anyone with events who is not on this class's roster. Driven by the
    // log rather than by the roster, because that is exactly the population
    // the roster cannot describe.
    for (const [key, state] of seen) {
      const enrollment = byMssv.get(key);
      if (!enrollment || enrollment.homeClassId === session.classId) {
        continue;
      }
      if (!state.connected) {
        // Not in the room now: an invigilator has nothing to check.
        continue;
      }
      makeup.push({
        ...this.toView(enrollment.studentMssv, enrollment.studentName, seen, confirmedAt),
        homeClassName: classNames.get(enrollment.homeClassId),
      });
    }

    const byName = (a: AttendanceStudentView, b: AttendanceStudentView) =>
      a.mssv.localeCompare(b.mssv);

    return {
      classId: session.classId,
      className: session.classId ? (classNames.get(session.classId) ?? null) : null,
      rosterSize: roster.length,
      confirmedAt: confirmedAt ? confirmedAt.toISOString() : null,
      confirmedCount: session.attendanceConfirmedCount,
      present: present.sort(byName),
      absent: absent.sort(byName),
      makeup: makeup.sort(byName),
      discrepancy: await this.buildDiscrepancy(session, seen, byMssv, classNames),
    };
  }

  /**
   * "45 present, 46 submissions" — named, not just counted.
   *
   * Only after finalize: while the exam is running, a student who submits
   * before the invigilator gets round to counting is not an anomaly, and
   * flagging them would train everyone to ignore the flag.
   */
  private async buildDiscrepancy(
    session: ExamSessionEntity,
    seen: Map<string, StudentState>,
    byMssv: Map<string, EnrollmentEntity>,
    classNames: Map<string, string>,
  ): Promise<AttendanceDiscrepancy | null> {
    const confirmedAt = session.attendanceConfirmedAt;
    if (session.status !== 'completed' || !confirmedAt || session.attendanceConfirmedCount === null) {
      return null;
    }

    const rows = await this.submissions
      .createQueryBuilder('s')
      .select('DISTINCT s.student_mssv', 'mssv')
      .where('s.exam_session_id = :id', { id: session.id })
      .getRawMany<{ mssv: string }>();

    const unaccounted = rows
      .filter(({ mssv }) => !this.wasPresentAt(seen.get(mssv.toLowerCase()), confirmedAt))
      .map(({ mssv }) => {
        const enrollment = byMssv.get(mssv.toLowerCase());
        const view = this.toView(mssv, enrollment?.studentName ?? mssv, seen, confirmedAt);
        return enrollment && enrollment.homeClassId !== session.classId
          ? { ...view, homeClassName: classNames.get(enrollment.homeClassId) }
          : view;
      });

    return {
      confirmedCount: session.attendanceConfirmedCount,
      submittedCount: rows.length,
      unaccounted: unaccounted.sort((a, b) => a.mssv.localeCompare(b.mssv)),
    };
  }

  private wasPresentAt(state: StudentState | undefined, at: Date): boolean {
    if (!state) {
      return false;
    }
    const before = state.events.filter((e) => e.occurredAt.getTime() <= at.getTime());
    const latest = before[before.length - 1];
    return latest !== undefined && PRESENT_EVENTS.has(latest.eventType);
  }

  private toView(
    mssv: string,
    name: string,
    seen: Map<string, StudentState>,
    confirmedAt: Date | null,
  ): AttendanceStudentView {
    const state = seen.get(mssv.toLowerCase());
    if (!state) {
      return {
        mssv,
        name,
        connected: false,
        joinedLate: false,
        firstSeenAt: null,
        lastEventAt: null,
        afterHeadcount: null,
      };
    }

    return {
      mssv,
      name,
      connected: state.connected,
      joinedLate: state.joinedLate,
      firstSeenAt: state.events[0].occurredAt.toISOString(),
      lastEventAt: state.latest.occurredAt.toISOString(),
      afterHeadcount: this.classifyArrival(state, confirmedAt),
    };
  }

  /**
   * Null unless they are here *because of* a join that happened after the
   * count. `returned` vs `new` is decided by whether the log knew them
   * before the count at all.
   */
  private classifyArrival(
    state: StudentState,
    confirmedAt: Date | null,
  ): 'returned' | 'new' | null {
    if (!confirmedAt || !state.connected) {
      return null;
    }
    const arrival = state.latest;
    if (arrival.occurredAt.getTime() <= confirmedAt.getTime()) {
      return null;
    }
    const knownBefore = state.events.some(
      (e) => e.occurredAt.getTime() <= confirmedAt.getTime(),
    );
    return knownBefore ? 'returned' : 'new';
  }

  private async loadEvents(
    examSessionId: string,
  ): Promise<AgentConnectionEventEntity[]> {
    return this.events.find({
      where: { examSessionId },
      // Ties are possible: a fast reconnect can land in the same
      // millisecond as the disconnect it follows. `id` is not ordered, so
      // this is best-effort — the classification only ever compares against
      // a headcount timestamp seconds away from any such pair.
      order: { occurredAt: 'ASC' },
    });
  }

  /** One entry per MSSV, holding its whole event stream in order. */
  private fold(events: AgentConnectionEventEntity[]): Map<string, StudentState> {
    const byMssv = new Map<string, StudentState>();
    for (const event of events) {
      const key = event.studentMssv.toLowerCase();
      const existing = byMssv.get(key);
      if (existing) {
        existing.events.push(event);
        existing.latest = event;
        existing.connected = PRESENT_EVENTS.has(event.eventType);
        // Late-ness belongs to the student, not to one connection: a
        // student who arrived late and reconnected twice is still late.
        existing.joinedLate = existing.joinedLate || event.joinedLate;
      } else {
        byMssv.set(key, {
          events: [event],
          latest: event,
          connected: PRESENT_EVENTS.has(event.eventType),
          joinedLate: event.joinedLate,
        });
      }
    }
    return byMssv;
  }
}

interface StudentState {
  events: AgentConnectionEventEntity[];
  latest: AgentConnectionEventEntity;
  connected: boolean;
  joinedLate: boolean;
}
