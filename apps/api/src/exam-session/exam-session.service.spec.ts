import { DataSource, Repository } from 'typeorm';
import { ExamSessionService } from './exam-session.service';
import { ExamSessionEvents } from './exam-session.events';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { RequiredDeliverableEntity } from './entities/required-deliverable.entity';
import { ClassService } from '../course/class.service';
import { AttendanceService } from '../agent-connection/attendance.service';
import { ScheduleConflictService } from './schedule-conflict.service';
import { RubricEntity } from '../grading/entities/rubric.entity';

/**
 * Covers the exam_session state machine added in the submission phase:
 * `active -> completed`, one-way, performed in exactly one place
 * (finalizeExamSession) by both the scheduled sweep and the teacher's
 * manual finalize.
 *
 * The repository is mocked down to the query builder here — the real
 * UPDATE runs against Postgres in exam-session.e2e-spec.ts. What can only
 * be asserted at this level is the part that would rot silently otherwise:
 * that the broadcast is tied to `affected`, not to the call.
 */

interface UpdateBuilderMock {
  update: jest.Mock;
  set: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  execute: jest.Mock;
}

function createHarness(affected: number) {
  const builder = {} as UpdateBuilderMock;
  builder.update = jest.fn(() => builder);
  builder.set = jest.fn(() => builder);
  builder.where = jest.fn(() => builder);
  builder.andWhere = jest.fn(() => builder);
  builder.execute = jest.fn().mockResolvedValue({ affected });

  const sessions = {
    createQueryBuilder: jest.fn(() => builder),
    findOne: jest.fn(),
  };
  const deliverables = { find: jest.fn().mockResolvedValue([]) };

  const events = new ExamSessionEvents();
  const published: unknown[] = [];
  events.finalized$.subscribe((event) => published.push(event));

  const service = new ExamSessionService(
    {} as DataSource,
    sessions as unknown as Repository<ExamSessionEntity>,
    deliverables as unknown as Repository<RequiredDeliverableEntity>,
    // Same reasoning as ClassService below: only create() reads a rubric,
    // and every test here is about finalize.
    {} as Repository<RubricEntity>,
    events,
    // Only create() touches it, and these tests are about finalize. Left
    // unimplemented on purpose: if a finalize path ever starts resolving a
    // class, that is a real change and this should fail loudly rather than
    // quietly return a convenient stub.
    {} as ClassService,
    {} as AttendanceService,
    // Same reasoning as ClassService above: only create() consults it, and
    // every test here is about finalize.
    {} as ScheduleConflictService,
  );

  return { service, sessions, builder, published };
}

describe('ExamSessionService.finalizeExamSession', () => {
  it('flips an active session to completed and broadcasts exam:finalize once', async () => {
    const { service, builder, published } = createHarness(1);

    const changed = await service.finalizeExamSession('session-1', 'scheduled');

    expect(changed).toBe(true);
    expect(builder.set).toHaveBeenCalledWith({ status: 'completed' });
    expect(published).toEqual([{ examSessionId: 'session-1', reason: 'scheduled' }]);
  });

  it('guards the UPDATE with a status predicate instead of reading then writing', async () => {
    const { service, builder, sessions } = createHarness(1);

    await service.finalizeExamSession('session-1', 'manual');

    // The whole point of the WHERE clause: a read-then-write would let a
    // job tick and a teacher's manual finalize both observe 'active' and
    // both proceed. Postgres serializes the two UPDATEs on the row lock
    // instead, so exactly one of them comes back with affected > 0.
    expect(builder.andWhere).toHaveBeenCalledWith('status = :active', { active: 'active' });
    expect(sessions.findOne).not.toHaveBeenCalled();
  });

  it('does not broadcast when the session was already finalized', async () => {
    const { service, published } = createHarness(0);

    const changed = await service.finalizeExamSession('session-1', 'manual');

    // Zero rows matched — already completed, or never active. Not an error,
    // but the agents must not be told to upload a second time.
    expect(changed).toBe(false);
    expect(published).toEqual([]);
  });

  it('broadcasts exactly once when finalize is called twice in a row', async () => {
    const { service, builder, published } = createHarness(1);

    await service.finalizeExamSession('session-1', 'manual');
    // Second call: the row is no longer active, so the DB matches nothing.
    builder.execute.mockResolvedValue({ affected: 0 });
    await service.finalizeExamSession('session-1', 'scheduled');

    expect(published).toHaveLength(1);
    expect(published[0]).toEqual({ examSessionId: 'session-1', reason: 'manual' });
  });
});
