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
  let courseName: string;
  let classId: string;
  let otherClassId: string;
  let roomName: string;
  let otherRoomName: string;

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
        semesterName: 'HK kiểm thử',
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

    const course = { name: 'Schedule Conflict Course' };
    courseName = course.name;

    roomName = `Phòng trùng lịch ${Date.now()}`;
    const otherRoom = { name: `Phòng khác ${Date.now()}` };
    otherRoomName = otherRoom.name;

    // Two classes, both taught by the owner: the room rule and the class
    // rule have to be separable, and that needs a second class the same
    // lecturer is allowed to create sessions for.
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseName, `Lớp A ${Date.now()}`, ownerId],
    );
    classId = klass.id;
    const [otherClass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseName, `Lớp B ${Date.now()}`, ownerId],
    );
    otherClassId = otherClass.id;
  });

  afterAll(async () => {
    // This spec deliberately creates sessions that overlap each other, so
    // leaving them behind would make the very constraints under test
    // impossible to (re)create on this database afterwards — a migration
    // run after an un-cleaned test run fails to build the index. Scoped to
    // this spec's own rooms, so nothing else's data is touched.
    const rooms = [roomName, otherRoomName];
    const sessions = await dataSource.query(
      `SELECT id FROM examcollect.exam_session WHERE room_name = ANY($1)`,
      [rooms],
    );
    const ids = sessions.map((row: { id: string }) => row.id);
    if (ids.length > 0) {
      // Every FK into exam_session is ON DELETE RESTRICT, so children go
      // first, deepest first. This list has to grow whenever a new table
      // gains an exam_session_id — a missing one surfaces here as a
      // foreign-key violation during teardown, not as a failing assertion,
      // so it is worth checking against the FKs on exam_session if this
      // afterAll ever starts throwing.
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
      roomName,
      ...windowAt(day, 8, 10),
    });
    expect(first.status).toBe(201);

    const second = await createSession({
      name: 'Ca chồng lấn',
      classId: otherClassId,
      roomName,
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
      roomName,
      ...windowAt(day, 8, 10),
    });
    expect(first.status).toBe(201);

    // Half-open ranges: 10:00-12:00 does not overlap 08:00-10:00. Back-to-back
    // exams in one lab are normal scheduling, not a conflict.
    const second = await createSession({
      name: 'Ca liền sau',
      classId: otherClassId,
      roomName,
      ...windowAt(day, 10, 12),
    });

    expect(second.status).toBe(201);
  });

  it('refuses the same class sitting two overlapping exams in different rooms', async () => {
    const day = freshDay();

    const first = await createSession({
      name: 'Thi môn sáng',
      classId,
      roomName,
      ...windowAt(day, 8, 10),
    });
    expect(first.status).toBe(201);

    const second = await createSession({
      name: 'Thi chồng giờ',
      classId,
      roomName: otherRoomName,
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
      roomName,
      ...windowAt(day, 8, 10),
    });
    expect(first.status).toBe(201);

    const second = await createSession({
      name: 'Phòng 2',
      classId: otherClassId,
      roomName: otherRoomName,
      ...windowAt(day, 8, 10),
    });

    expect(second.status).toBe(201);
  });

  it('frees the room once a session finishes early', async () => {
    const day = freshDay();

    const first = await createSession({
      name: 'Kết thúc sớm',
      classId,
      roomName,
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
      roomName,
      ...windowAt(day, 9, 11),
    });

    expect(second.status).toBe(201);
  });

  it('frees the room once a session is cancelled', async () => {
    const day = freshDay();

    const first = await createSession({
      name: 'Sẽ bị huỷ',
      classId,
      roomName,
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
      roomName,
      ...windowAt(day, 8, 10),
    });

    expect(second.status).toBe(201);
  });

  it('rejects an overlapping row written straight to the database', async () => {
    const day = freshDay();

    const first = await createSession({
      name: 'Giữ phòng',
      classId,
      roomName,
      ...windowAt(day, 8, 10),
    });
    expect(first.status).toBe(201);

    const { startTime, endTime } = windowAt(day, 9, 11);
    // Bypasses the service entirely. This is what proves the rule is a
    // property of the data rather than of one code path — a future
    // reschedule endpoint gets the same protection for free.
    await expect(
      dataSource.query(
        // semester_name NOT NULL từ 2026-09-11 (§7.1.5). Phải cấp, nếu
        // không INSERT chết ở 23502 trước khi chạm ràng buộc GiST mà ca
        // này sinh ra để kiểm — một test xanh-vì-sai-lý-do đảo ngược.
        `INSERT INTO examcollect.exam_session
           (name, code, teacher_id, class_id, exam_type,
            start_time, end_time, submission_rule, status, semester_name,
            course_name, room_name)
         VALUES ($1, $2, $3, $4, 'TK', $7, $8, '{}'::jsonb, 'active', 'HK kiểm thử',
                 $5, $6)`,
        [
          'Chèn thẳng DB',
          `RAW${Date.now() % 1000}`,
          ownerId,
          otherClassId,
          courseName,
          roomName,
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
      createSession({ name: 'Đua A', classId, roomName, ...window }),
      createSession({ name: 'Đua B', classId: otherClassId, roomName, ...window }),
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
      roomName: otherRoomName,
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
      roomName: otherRoomName,
      startTime,
      endTime,
    });

    expect(response.status).toBe(400);
  });

  it('T-CLS-1: phiên thi KHÔNG gắn lớp bị từ chối sạch sẽ', async () => {
    // `ex_exam_session_class_overlap` là exclusion constraint trên
    // `class_id`, mà Postgres BỎ QUA dòng có khoá NULL. Nên trước
    // `ExpandMasterDataToText`, mọi phiên không gắn lớp thoát hoàn toàn
    // khỏi phép chống trùng lịch lớp — cột nullable làm chính ràng buộc
    // ngay trên vô hiệu với một phần dữ liệu.
    //
    // Test ở tầng HTTP chứ không ở tầng SQL, vì thứ cần khoá là "API từ
    // chối SẠCH", không phải "DB nổ". Một 500 cũng chặn được dòng xấu,
    // nhưng nó chặn bằng cách làm hỏng request — và người dùng không đọc
    // được lý do từ một stack trace.
    const response = await createSession({
      name: `Khong gan lop ${Date.now()}`,
      roomName,
      ...windowAt(freshDay(), 8, 10),
    });

    expect(response.status).toBe(400);
    // Nói rõ thiếu trường nào. Một 400 chung chung vẫn chặn được dòng xấu
    // nhưng để giảng viên tự đoán mình gõ sai ở đâu.
    expect(JSON.stringify(response.body)).toContain('classId');
  });
});
