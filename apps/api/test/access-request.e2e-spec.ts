import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * The counterweight to enrollment enforcement.
 *
 * Refusing an unenrolled student closes Security rule 1, but on its own it
 * replaces a security gap with an availability one: a student the registrar
 * missed cannot sit the exam at all, discovered at a moment when nothing can
 * be fixed. The machine enforces the rule; a human can open it; the opening
 * leaves a trace. All three are required together.
 */
describe('Access request (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;

  let sessionId: string;
  let sessionCode: string;
  let courseId: string;
  let classId: string;
  let teacherId: string;
  let accessCookie: string;

  const STRANGER_MSSV = 'SV20127777';
  const STRANGER_NAME = 'Lê Văn C';
  const REASON = 'Đăng ký muộn, chưa có trong danh sách';

  const sockets: Socket[] = [];

  function open(headers?: Record<string, string>): Socket {
    const socket = io(`${baseUrl}/exam-live`, {
      reconnection: false,
      forceNew: true,
      extraHeaders: headers,
    });
    sockets.push(socket);
    return socket;
  }

  function connected(socket: Socket): Promise<void> {
    return new Promise((resolve) => socket.on('connect', () => resolve()));
  }

  function ack<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ack for ${event}`)), 10_000);
      socket.emit(event, payload, (reply: T) => {
        clearTimeout(timer);
        resolve(reply);
      });
    });
  }

  function once<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${event}`)), 10_000);
      socket.on(event, (body: T) => {
        clearTimeout(timer);
        resolve(body);
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
    const email = `access_teacher_${stamp}@example.com`;
    teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    const token: string = login.body.accessToken;
    accessCookie = `access_token=${token}`;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Access Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Access Course', $2) RETURNING id`,
      [`AC${stamp}`, semester.id],
    );
    courseId = course.id;
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Access Room ${stamp}`],
    );
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, 'N03', $2) RETURNING id`,
      [courseId, teacherId],
    );
    classId = klass.id;

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Access Session ${stamp}`,
        courseId,
        roomId: room.id,
        examType: 'TK',
        startTime: new Date(Date.now() - 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(created.status).toBe(201);
    sessionId = created.body.id;
    sessionCode = created.body.code;
  });

  afterAll(async () => {
    for (const socket of sockets) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    await app.close();
  });

  it('lets an approved student in, and records who opened the door', async () => {
    const teacher = open({ cookie: accessCookie });
    await connected(teacher);
    teacher.emit('teacher:subscribe', { examSessionId: sessionId });
    await new Promise((r) => setTimeout(r, 300));

    const agent = open();
    await connected(agent);

    // The refusal is what sends the student down this path in the first place.
    const refused = await new Promise<{ code: string }>((resolve) => {
      agent.on('agent:join:error', resolve);
      agent.emit('agent:join', {
        fullName: STRANGER_NAME,
        studentId: STRANGER_MSSV,
        sessionCode,
      });
    });
    expect(refused.code).toBe('NOT_ENROLLED');

    const pending = once<{ requestId: string; studentId: string; fullName: string; reason: string }>(
      teacher,
      'lobby:access_request',
    );

    const requested = await ack<{ ok: boolean; requestId?: string }>(
      agent,
      'agent:request-access',
      {
        sessionCode,
        studentId: STRANGER_MSSV,
        // A student with no roster row has no authoritative name, so this is
        // the one place the agent still asks for one.
        fullName: STRANGER_NAME,
        reason: REASON,
      },
    );
    expect(requested.ok).toBe(true);

    const seen = await pending;
    expect(seen.studentId).toBe(STRANGER_MSSV);
    expect(seen.fullName).toBe(STRANGER_NAME);
    expect(seen.reason).toBe(REASON);

    const granted = once<{ examSessionId: string }>(agent, 'agent:access-granted');
    const resolved = await ack<{ ok: boolean }>(teacher, 'teacher:resolve-access-request', {
      requestId: seen.requestId,
      approve: true,
      homeClassId: classId,
    });
    expect(resolved.ok).toBe(true);
    await granted;

    // Approval puts the student on the roster: a submission has to be
    // routable to a class and a teacher, and inventing that at collection
    // time would be exactly the guessing this design forbids.
    const [enrollment] = await dataSource.query(
      `SELECT student_name, home_class_id, home_teacher_id
         FROM examcollect.enrollment WHERE course_id = $1 AND student_mssv = $2`,
      [courseId, STRANGER_MSSV],
    );
    expect(enrollment).toBeDefined();
    expect(enrollment.student_name).toBe(STRANGER_NAME);
    expect(enrollment.home_class_id).toBe(classId);
    expect(enrollment.home_teacher_id).toBe(teacherId);

    // A machine-enforced rule opened by a human must leave a trace.
    const [entry] = await dataSource.query(
      `SELECT actor_id, actor_type, action, target_id, new_value
         FROM examcollect.audit_log
        WHERE target_id = $1 AND action = 'exam_session.access_granted'`,
      [sessionId],
    );
    expect(entry).toBeDefined();
    expect(entry.actor_type).toBe('user');
    expect(entry.actor_id).toBe(teacherId);
    expect(entry.new_value.studentMssv).toBe(STRANGER_MSSV);
    expect(entry.new_value.reason).toBe(REASON);

    // And the door is actually open now.
    const rejoined = open();
    await connected(rejoined);
    const ackBody = await new Promise<{ studentName: string }>((resolve, reject) => {
      rejoined.on('agent:join:ack', resolve);
      rejoined.on('agent:join:error', (e) => reject(new Error(JSON.stringify(e))));
      rejoined.emit('agent:join', {
        fullName: 'bỏ qua',
        studentId: STRANGER_MSSV,
        sessionCode,
      });
    });
    expect(ackBody.studentName).toBe(STRANGER_NAME);
  });

  it('tells the student when the invigilator refuses', async () => {
    const teacher = open({ cookie: accessCookie });
    await connected(teacher);
    teacher.emit('teacher:subscribe', { examSessionId: sessionId });
    await new Promise((r) => setTimeout(r, 300));

    const agent = open();
    await connected(agent);
    const pending = once<{ requestId: string }>(teacher, 'lobby:access_request');
    await ack(agent, 'agent:request-access', {
      sessionCode,
      studentId: 'SV20128888',
      fullName: 'Người Bị Từ Chối',
      reason: 'không có lý do hợp lệ',
    });
    const seen = await pending;

    const denied = once<{ examSessionId: string }>(agent, 'agent:access-denied');
    await ack(teacher, 'teacher:resolve-access-request', {
      requestId: seen.requestId,
      approve: false,
    });
    await denied;

    // A refusal must not quietly add anybody to the roster.
    const rows = await dataSource.query(
      `SELECT 1 FROM examcollect.enrollment WHERE course_id = $1 AND student_mssv = $2`,
      [courseId, 'SV20128888'],
    );
    expect(rows).toHaveLength(0);
  });

  it('refuses to resolve a request from someone who does not own the session', async () => {
    const stamp = Date.now();
    const otherEmail = `access_other_${stamp}@example.com`;
    await createTestAccount(dataSource, {
      email: otherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: otherEmail, password: 'correct-horse-battery' });

    const intruder = open({ cookie: `access_token=${otherLogin.body.accessToken}` });
    await connected(intruder);

    const agent = open();
    await connected(agent);
    const requested = await ack<{ ok: boolean; requestId: string }>(
      agent,
      'agent:request-access',
      {
        sessionCode,
        studentId: 'SV20126666',
        fullName: 'Người Thứ Ba',
        reason: 'thử',
      },
    );

    const reply = await ack<{ ok: boolean; code?: string }>(
      intruder,
      'teacher:resolve-access-request',
      { requestId: requested.requestId, approve: true, homeClassId: classId },
    );

    // Otherwise any authenticated teacher could admit students to any exam.
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe('FORBIDDEN');
  });
  it('replays still-pending requests to a teacher who subscribes later', async () => {
    const agent = open();
    await connected(agent);
    await ack(agent, 'agent:request-access', {
      sessionCode,
      studentId: 'SV20125555',
      fullName: 'Người Chờ Lâu',
      reason: 'máy hỏng, vào muộn',
    });

    // The invigilator refreshes the page — a brand-new socket that missed
    // the original broadcast. A request nobody can see is a student waiting
    // forever.
    const reopened = open({ cookie: accessCookie });
    await connected(reopened);
    // Collect the whole replay rather than the first event: earlier tests in
    // this file leave their own requests pending, and this one is about
    // "did mine survive", not "was mine the only one".
    const replayed: Array<{ studentId: string }> = [];
    reopened.on('lobby:access_request', (body: { studentId: string }) => {
      replayed.push(body);
    });
    reopened.emit('teacher:subscribe', { examSessionId: sessionId });
    await new Promise((r) => setTimeout(r, 500));

    expect(replayed.map((r) => r.studentId)).toContain('SV20125555');
  });
});
