import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { openSession } from './helpers/open-session';

/**
 * The whole collection path against the real stack — Postgres for the row,
 * MinIO for the object, a real socket for both handshakes. It replaces a
 * throwaway script that verified this once by hand and could never be run
 * again.
 *
 * Requires the dev MinIO from docker-compose to be up, like the API itself
 * does. A failure here means storage is unreachable, which is worth failing
 * loudly over rather than skipping.
 */
describe('Submission collection (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;
  let socket: Socket;

  let sessionId: string;
  let sessionCode: string;
  let deliverableId: string;
  let classId: string;
  let teacherId: string;

  const MSSV = 'SV20120042';
  const STUDENT_NAME = 'Trần Thị B';

  function ack<T>(event: string, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ack for ${event}`)), 15_000);
      socket.emit(event, payload, (reply: T) => {
        clearTimeout(timer);
        resolve(reply);
      });
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.listen(0);
    baseUrl = await app.getUrl();
    dataSource = app.get(DataSource);

    const stamp = Date.now();
    const email = `submission_teacher_${stamp}@example.com`;
    teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    const token: string = login.body.accessToken;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Submission Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Submission Course', $2) RETURNING id`,
      [`SB${stamp}`, semester.id],
    );
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Submission Room ${stamp}`],
    );
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, 'N02', $2) RETURNING id`,
      [course.id, teacherId],
    );
    classId = klass.id;

    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [MSSV, STUDENT_NAME, course.id, classId, teacherId],
    );

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Submission Session ${stamp}`,
        classId,
        roomId: room.id,
        examType: 'TK',
        startTime: new Date(Date.now() - 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(created.status).toBe(201);
    sessionId = created.body.id;
    // Guard §7.1.1: `agent:join` từ chối phiên chưa đóng băng danh sách
    // dự thi. Xem test/helpers/open-session.ts.
    await openSession(app, token, sessionId);
    sessionCode = created.body.code;
    deliverableId = created.body.requiredDeliverables[0].id;

    socket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    await new Promise<void>((resolve, reject) => {
      socket.on('agent:join:ack', () => resolve());
      socket.on('agent:join:error', (e) => reject(new Error(JSON.stringify(e))));
      socket.emit('agent:join', {
        fullName: 'ignored',
        studentId: MSSV,
        sessionCode,
      });
    });
  });

  afterAll(async () => {
    socket?.removeAllListeners();
    socket?.disconnect();
    // The server still has disconnect handlers to run — attendance writes
    // one event per agent. Closing the pool out from under them turns a
    // green run into a wall of red ERROR lines that mean nothing.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await app.close();
  });

  it('routes a collected submission to the home class and teacher from the roster', async () => {
    const urlAck = await ack<{ ok: true; uploadUrl: string; storageKey: string }>(
      'submission:request-upload-url',
      { examSessionId: sessionId, studentId: MSSV, requiredDeliverableId: deliverableId },
    );
    expect(urlAck.ok).toBe(true);

    const content = `bai lam cua ${MSSV}\n`;
    const put = await fetch(urlAck.uploadUrl, { method: 'PUT', body: content });
    expect(put.ok).toBe(true);

    const confirmAck = await ack<{ ok: true; status: string }>('submission:confirm', {
      examSessionId: sessionId,
      studentId: MSSV,
      requiredDeliverableId: deliverableId,
      storageKey: urlAck.storageKey,
      checksum: createHash('sha256').update(content).digest('hex'),
      fileSize: Buffer.byteLength(content),
    });
    expect(confirmAck.ok).toBe(true);
    expect(confirmAck.status).toBe('collected');

    const [row] = await dataSource.query(
      `SELECT home_class_id, home_teacher_id, student_name_input
         FROM examcollect.submission
        WHERE exam_session_id = $1 AND student_mssv = $2`,
      [sessionId, MSSV],
    );

    // Phase 4 of the submission module left these NULL because nothing could
    // resolve them. agent:join now requires an enrollment, so the answer is
    // known at join time and travels with the socket identity — a submission
    // that cannot be routed to a teacher is a submission nobody grades.
    expect(row.home_class_id).toBe(classId);
    expect(row.home_teacher_id).toBe(teacherId);
    // The roster spelling, not whatever the agent sent at join.
    expect(row.student_name_input).toBe(STUDENT_NAME);
  });
});
