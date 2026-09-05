import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Two exams cannot share a room, and one class cannot sit two exams at
 * once. Until this existed, nothing checked either: a lecturer could book
 * an occupied lab and only find out on exam day.
 *
 * The rule lives in two places on purpose, and both are tested here.
 * `ExamSessionService` pre-checks so the lecturer gets a message naming
 * the room and the clash; the DB's EXCLUDE constraints are what make the
 * rule true, including for concurrent requests and for any write path that
 * does not go through the service. A pre-check alone loses the race; a
 * constraint alone can only say "conflicts with an existing record".
 */
describe('ExamSession schedule conflicts (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let ownerToken: string;
  let ownerId: string;
  let courseId: string;
  let classId: string;
  let otherClassId: string;
  let roomId: string;
  let roomName: string;
  let otherRoomId: string;

  /**
   * Every test gets its own day, so a session one test leaves behind can
   * never collide with another test's. The overlaps under test are all
   * built inside a single day, which keeps each case readable on its own.
   */
  let dayCursor = 0;
  function freshDay(): Date {
    dayCursor += 1;
    const day = new Date();
    day.setUTCDate(day.getUTCDate() + dayCursor);
    day.setUTCHours(0, 0, 0, 0);
    return day;
  }

  function windowAt(day: Date, startHour: number, endHour: number) {
    const startTime = new Date(day);
    startTime.setUTCHours(startHour);
    const endTime = new Date(day);
    endTime.setUTCHours(endHour);
    return { startTime: startTime.toISOString(), endTime: endTime.toISOString() };
  }

  function createSession(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        examType: 'TK',
        requiredFilenames: ['Cau1.docx'],
        ...body,
      });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirrors main.ts — without the filter, a constraint violation would
    // surface as a 500 here and the 409 assertions would pass for the
    // wrong reason.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);

    const ownerEmail = `schedule_conflict_owner_${Date.now()}@example.com`;
    ownerId = await createTestAccount(dataSource, {
      email: ownerEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ownerEmail, password: 'correct-horse-battery' });
    ownerToken = login.body.accessToken;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Schedule Conflict Semester ${Date.now()}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Schedule Conflict Course', $2) RETURNING id`,
      [`SC${Date.now()}`, semester.id],
    );
    courseId = course.id;

    roomName = `Phòng trùng lịch ${Date.now()}`;
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [roomName],
    );
    roomId = room.id;
    const [otherRoom] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Phòng khác ${Date.now()}`],
    );
    otherRoomId = otherRoom.id;

    // Two classes, both taught by the owner: the room rule and the class
    // rule have to be separable, and that needs a second class the same
    // lecturer is allowed to create sessions for.
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseId, `Lớp A ${Date.now()}`, ownerId],
    );
    classId = klass.id;
    const [otherClass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseId, `Lớp B ${Date.now()}`, ownerId],
    );
    otherClassId = otherClass.id;
  });

  afterAll(async () => {
    // This spec deliberately creates sessions that overlap each other, so
    // leaving them behind would make the very constraints under test
    // impossible to (re)create on this database afterwards — a migration
    // run after an un-cleaned test run fails to build the index. Scoped to
    // this spec's own rooms, so nothing else's data is touched.
    const rooms = [roomId, otherRoomId];
    const sessions = await dataSource.query(
      `SELECT id FROM examcollect.exam_session WHERE room_id = ANY($1)`,
      [rooms],
    );
    const ids = sessions.map((row: { id: string }) => row.id);
    if (ids.length > 0) {
      // Every FK into exam_session is ON DELETE RESTRICT, so children go
      // first, deepest first.
      for (const table of [
        'grade_export',
        'submission',
        'agent_connection_event',
        'exam_material',
        'required_deliverable',
      ]) {
        await dataSource.query(
          `DELETE FROM examcollect.${table} WHERE exam_session_id = ANY($1)`,
          [ids],
        );
      }
      await dataSource.query(`DELETE FROM examcollect.exam_session WHERE id = ANY($1)`, [
        ids,
      ]);
    }

    await app.close();
  });

  it('refuses a second session overlapping the same room', async () => {
    const day = freshDay();

    const first = await createSession({
      name: 'Ca sáng',
      classId,
      roomId,
      ...windowAt(day, 8, 10),
    });
    expect(first.status).toBe(201);

    const second = await createSession({
      name: 'Ca chồng lấn',
      classId: otherClassId,
      roomId,
      ...windowAt(day, 9, 11),
    });

    expect(second.status).toBe(409);
    // Specific enough to act on: which room, which session is holding it,
    // and when. A generic "conflicts with an existing record" would leave
    // the lecturer with nothing to change.
    expect(second.body.message).toContain(roomName);
    expect(second.body.message).toContain('Ca sáng');
    expect(second.body.message).toMatch(/\d{1,2}:\d{2}/);
  });

  it('allows a session starting exactly when the previous one ends', async () => {
    const day = freshDay();

    const first = await createSession({
      name: 'Ca liền trước',
      classId,
      roomId,
      ...windowAt(day, 8, 10),
    });
    expect(first.status).toBe(201);

    // Half-open ranges: 10:00-12:00 does not overlap 08:00-10:00. Back-to-back
    // exams in one lab are normal scheduling, not a conflict.
    const second = await createSession({
      name: 'Ca liền sau',
      classId: otherClassId,
      roomId,
      ...windowAt(day, 10, 12),
    });

    expect(second.status).toBe(201);
  });

  it('refuses the same class sitting two overlapping exams in different rooms', async () => {
    const day = freshDay();

    const first = await createSession({
      name: 'Thi môn sáng',
      classId,
      roomId,
      ...windowAt(day, 8, 10),
    });
    expect(first.status).toBe(201);

    const second = await createSession({
      name: 'Thi chồng giờ',
      classId,
      roomId: otherRoomId,
      ...windowAt(day, 9, 11),
    });

    expect(second.status).toBe(409);
    expect(second.body.message).toContain('Thi môn sáng');
  });

  it('allows overlapping sessions in different rooms for different classes', async () => {
    const day = freshDay();

    const first = await createSession({
      name: 'Phòng 1',
      classId,
      roomId,
      ...windowAt(day, 8, 10),
    });
    expect(first.status).toBe(201);

    const second = await createSession({
      name: 'Phòng 2',
      classId: otherClassId,
      roomId: otherRoomId,
      ...windowAt(day, 8, 10),
    });

    expect(second.status).toBe(201);
  });

  it('frees the room once a session finishes early', async () => {
    const day = freshDay();

    const first = await createSession({
      name: 'Kết thúc sớm',
      classId,
      roomId,
      ...windowAt(day, 8, 12),
    });
    expect(first.status).toBe(201);

    // The room is a scarce resource: an exam that finished at 09:00 must
    // not keep a lab blocked until the 12:00 it was scheduled to end at.
    const finalize = await request(app.getHttpServer())
      .post(`/exam-sessions/${first.body.id}/finalize`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(finalize.status).toBe(200);

    const second = await createSession({
      name: 'Dùng lại phòng',
      classId: otherClassId,
      roomId,
      ...windowAt(day, 9, 11),
    });

    expect(second.status).toBe(201);
  });

  it('frees the room once a session is cancelled', async () => {
    const day = freshDay();

    const first = await createSession({
      name: 'Sẽ bị huỷ',
      classId,
      roomId,
      ...windowAt(day, 8, 10),
    });
    expect(first.status).toBe(201);

    // Written directly: no endpoint sets 'cancelled' yet. The constraint
    // has to already treat it as releasing the room, or the first cancel
    // feature shipped would silently keep the lab blocked.
    await dataSource.query(
      `UPDATE examcollect.exam_session SET status = 'cancelled' WHERE id = $1`,
      [first.body.id],
    );

    const second = await createSession({
      name: 'Thế chỗ',
      classId: otherClassId,
      roomId,
      ...windowAt(day, 8, 10),
    });

    expect(second.status).toBe(201);
  });

  it('rejects an overlapping row written straight to the database', async () => {
    const day = freshDay();

    const first = await createSession({
      name: 'Giữ phòng',
      classId,
      roomId,
      ...windowAt(day, 8, 10),
    });
    expect(first.status).toBe(201);

    const { startTime, endTime } = windowAt(day, 9, 11);
    // Bypasses the service entirely. This is what proves the rule is a
    // property of the data rather than of one code path — a future
    // reschedule endpoint gets the same protection for free.
    await expect(
      dataSource.query(
        `INSERT INTO examcollect.exam_session
           (name, code, teacher_id, class_id, course_id, room_id, exam_type,
            start_time, end_time, submission_rule, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'TK', $7, $8, '{}'::jsonb, 'active')`,
        [
          'Chèn thẳng DB',
          `RAW${Date.now() % 1000}`,
          ownerId,
          otherClassId,
          courseId,
          roomId,
          startTime,
          endTime,
        ],
      ),
    ).rejects.toMatchObject({ code: '23P01' });
  });

  it('lets exactly one of two concurrent bookings win', async () => {
    const day = freshDay();
    const window = windowAt(day, 8, 10);

    const [a, b] = await Promise.all([
      createSession({ name: 'Đua A', classId, roomId, ...window }),
      createSession({ name: 'Đua B', classId: otherClassId, roomId, ...window }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('accepts a session declared slightly late', async () => {
    // The exam started, the lecturer forgot to create the session, and is
    // now creating it with the real start time. Refusing this would push
    // them into lying about when the exam began.
    const startTime = new Date(Date.now() - 10 * 60_000).toISOString();
    const endTime = new Date(Date.now() + 60 * 60_000).toISOString();

    const response = await createSession({
      name: 'Khai muộn 10 phút',
      classId,
      roomId: otherRoomId,
      startTime,
      endTime,
    });

    expect(response.status).toBe(201);
  });

  it('refuses a session backdated beyond the grace window', async () => {
    const startTime = new Date(Date.now() - 45 * 60_000).toISOString();
    const endTime = new Date(Date.now() + 60 * 60_000).toISOString();

    const response = await createSession({
      name: 'Khai muộn 45 phút',
      classId,
      roomId: otherRoomId,
      startTime,
      endTime,
    });

    expect(response.status).toBe(400);
  });
});
