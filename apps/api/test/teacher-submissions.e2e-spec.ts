import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * "Quản lý bài thu" (QA-reported gap) — GET /submissions, a real submission
 * collected end to end (real socket, real storage) across TWO different
 * exam sessions the same teacher owns, plus one session belonging to a
 * DIFFERENT teacher that must never leak in.
 *
 * Mirrors submission-collection.e2e-spec.ts's own real-stack setup
 * (Postgres + MinIO + a real socket) — this is the cross-session
 * aggregation half of that same collection path, not a different one.
 */
describe('Teacher submissions (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;

  const stamp = Date.now();
  let teacherToken: string;
  let teacherId: string;
  let sessionAId: string;
  let sessionBId: string;
  let foreignSessionId: string;

  async function collectOne(
    sessionId: string,
    sessionCode: string,
    deliverableId: string,
    mssv: string,
    content: string,
  ): Promise<void> {
    const socket: Socket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
    try {
      await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
      await new Promise<void>((resolve, reject) => {
        socket.on('agent:join:ack', () => resolve());
        socket.on('agent:join:error', (e) => reject(new Error(JSON.stringify(e))));
        socket.emit('agent:join', { fullName: 'ignored', studentId: mssv, sessionCode });
      });

      const urlAck = await new Promise<{ ok: true; uploadUrl: string; storageKey: string }>(
        (resolve) =>
          socket.emit(
            'submission:request-upload-url',
            { examSessionId: sessionId, studentId: mssv, requiredDeliverableId: deliverableId },
            resolve,
          ),
      );
      const put = await fetch(urlAck.uploadUrl, { method: 'PUT', body: content });
      if (!put.ok) throw new Error('PUT to storage failed');

      const confirmAck = await new Promise<{ ok: true; status: string }>((resolve) =>
        socket.emit(
          'submission:confirm',
          {
            examSessionId: sessionId,
            studentId: mssv,
            requiredDeliverableId: deliverableId,
            storageKey: urlAck.storageKey,
            checksum: createHash('sha256').update(content).digest('hex'),
            fileSize: Buffer.byteLength(content),
          },
          resolve,
        ),
      );
      if (!confirmAck.ok || confirmAck.status !== 'collected') {
        throw new Error(`confirm failed: ${JSON.stringify(confirmAck)}`);
      }
    } finally {
      socket.removeAllListeners();
      socket.disconnect();
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.listen(0);
    baseUrl = await app.getUrl();
    dataSource = app.get(DataSource);

    const email = `teacher_submissions_${stamp}@example.com`;
    teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    teacherToken = login.body.accessToken;

    const otherEmail = `teacher_submissions_other_${stamp}@example.com`;
    const otherTeacherId = await createTestAccount(dataSource, {
      email: otherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: otherEmail, password: 'correct-horse-battery' });
    const otherToken: string = otherLogin.body.accessToken;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Teacher Submissions Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Teacher Submissions Course', $2) RETURNING id`,
      [`TS${stamp}`, semester.id],
    );
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Teacher Submissions Room ${stamp}`],
    );
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id) VALUES ($1, 'N01', $2) RETURNING id`,
      [course.id, teacherId],
    );
    const classId = klass.id;

    // A second course/class/session belonging to the OTHER teacher — this
    // is the one that must never appear in the first teacher's list.
    const [foreignCourse] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Foreign Course', $2) RETURNING id`,
      [`TF${stamp}`, semester.id],
    );
    const [foreignClass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id) VALUES ($1, 'N01', $2) RETURNING id`,
      [foreignCourse.id, otherTeacherId],
    );

    const MSSV_A = `TSA${stamp}`.slice(0, 20);
    const MSSV_B = `TSB${stamp}`.slice(0, 20);
    const MSSV_FOREIGN = `TSF${stamp}`.slice(0, 20);

    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
       VALUES ($1, 'Sinh viên A', $2, $3, $4), ($5, 'Sinh viên B', $2, $3, $4)`,
      [MSSV_A, course.id, classId, teacherId, MSSV_B],
    );
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
       VALUES ($1, 'Sinh viên lạ', $2, $3, $4)`,
      [MSSV_FOREIGN, foreignCourse.id, foreignClass.id, otherTeacherId],
    );

    // All three sessions below run at the same time — every one of them
    // has to be live for its agent to connect and submit. That means no
    // two of them may share a room (ex_exam_session_room_overlap), so each
    // gets its own. `room` above is still the first one handed out.
    let roomsHandedOut = 0;
    async function freshRoomId(): Promise<string> {
      roomsHandedOut += 1;
      if (roomsHandedOut === 1) {
        return room.id as string;
      }
      const [extra] = await dataSource.query(
        `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
        [`Phòng nộp bài ${stamp}-${roomsHandedOut}`],
      );
      return extra.id as string;
    }

    async function createSession(name: string, forClassId: string, token: string) {
      const response = await request(app.getHttpServer())
        .post('/exam-sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name,
          classId: forClassId,
          roomId: await freshRoomId(),
          examType: 'TK',
          startTime: new Date(Date.now() - 60_000).toISOString(),
          endTime: new Date(Date.now() + 3_600_000).toISOString(),
          requiredFilenames: ['Cau1.docx'],
        });
      expect(response.status).toBe(201);
      return {
        id: response.body.id as string,
        code: response.body.code as string,
        deliverableId: response.body.requiredDeliverables[0].id as string,
      };
    }

    const sessionA = await createSession(`Phiên A ${stamp}`, classId, teacherToken);
    sessionAId = sessionA.id;
    // Its own class, for the same reason it needs its own room: A and B
    // run concurrently and one class cannot sit two exams at once. Join
    // authentication is at course level, so MSSV_B still gets in — and
    // "every session this teacher owns" is decided by who owns the class,
    // which is still this teacher.
    const [classBRow] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [course.id, `Nhóm B ${stamp}`, teacherId],
    );
    const sessionB = await createSession(`Phiên B ${stamp}`, classBRow.id, teacherToken);
    sessionBId = sessionB.id;
    const foreignSession = await createSession(`Phiên lạ ${stamp}`, foreignClass.id, otherToken);
    foreignSessionId = foreignSession.id;

    await collectOne(sessionA.id, sessionA.code, sessionA.deliverableId, MSSV_A, 'bai A\n');
    await collectOne(sessionB.id, sessionB.code, sessionB.deliverableId, MSSV_B, 'bai B\n');
    await collectOne(
      foreignSession.id,
      foreignSession.code,
      foreignSession.deliverableId,
      MSSV_FOREIGN,
      'bai la\n',
    );
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('aggregates collected submissions across every session this teacher owns, in one list', async () => {
    const response = await request(app.getHttpServer())
      .get('/submissions')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    const sessionIds = response.body.items.map((item: { examSessionId: string }) => item.examSessionId);
    expect(sessionIds).toContain(sessionAId);
    expect(sessionIds).toContain(sessionBId);
    // The carried-along context a single-session view already knows without
    // asking — this page is the one place that has to be told both.
    const item = response.body.items.find(
      (i: { examSessionId: string }) => i.examSessionId === sessionAId,
    );
    expect(item).toMatchObject({ requiredFilename: 'Cau1.docx', status: 'collected' });
    expect(typeof item.examSessionName).toBe('string');
  });

  it('never leaks a submission from a session this teacher does not own', async () => {
    const response = await request(app.getHttpServer())
      .get('/submissions')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    const sessionIds = response.body.items.map((item: { examSessionId: string }) => item.examSessionId);
    expect(sessionIds).not.toContain(foreignSessionId);
  });

  it('examSessionId narrows the list to exactly that session', async () => {
    const response = await request(app.getHttpServer())
      .get('/submissions')
      .query({ examSessionId: sessionAId })
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.items.every(
        (item: { examSessionId: string }) => item.examSessionId === sessionAId,
      ),
    ).toBe(true);
    expect(response.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('search matches the student MSSV, scoped to this teacher only', async () => {
    const response = await request(app.getHttpServer())
      .get('/submissions')
      .query({ search: `TSA${stamp}` })
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { examSessionId: string }) => item.examSessionId)).toEqual([
      sessionAId,
    ]);
  });

  it('refuses a non-teacher role with 403', async () => {
    const adminEmail = `teacher_submissions_admin_${stamp}@example.com`;
    await createTestAccount(dataSource, {
      email: adminEmail,
      password: 'correct-horse-battery',
      role: 'admin',
    });
    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: 'correct-horse-battery' });

    const response = await request(app.getHttpServer())
      .get('/submissions')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`);

    expect(response.status).toBe(403);
  });

  it('refuses a request with no token at all', async () => {
    const response = await request(app.getHttpServer()).get('/submissions');

    expect(response.status).toBe(401);
  });
});
