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
  let courseName: string;
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

    const course = { name: 'Access Course' };
    courseName = course.name;
    const room = { name: `Access Room ${stamp}` };
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, 'N03', $2) RETURNING id`,
      [courseName, teacherId],
    );
    classId = klass.id;

    // Một sinh viên CÓ trong roster, từ 2026-09-11: mở phiên là đóng
    // băng danh sách dự thi, và một lớp rỗng thì không có gì để chụp.
    // Điều này cũng làm bối cảnh test đúng hơn bối cảnh cũ: ca thật của
    // access-request là "roster CÓ tồn tại, em này không nằm trong đó",
    // không phải "lớp chưa có ai".
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4)`,
      [`AR${Date.now() % 100000}`, 'Sinh viên có trong roster', classId, teacherId],
    );

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Access Session ${stamp}`,
        classId,
        roomName: room.name,
        semesterName: 'HK kiểm thử',
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
  });

  afterAll(async () => {
    for (const socket of sockets) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    // The server still has disconnect handlers to run — attendance writes
    // one event per agent. Closing the pool out from under them turns a
    // green run into a wall of red ERROR lines that mean nothing.
    await new Promise((resolve) => setTimeout(resolve, 500));
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
         FROM examcollect.enrollment WHERE home_class_id = $1 AND student_mssv = $2`,
      [classId, STRANGER_MSSV],
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

    // Và em phải có CHỖ NGỒI, không chỉ có quyền vào.
    //
    // Đây là nửa còn lại của §7.1.2, đi qua một cửa khác. `enrollment`
    // trả lời "em được phép thi"; `session_roster` trả lời "em đáng lẽ
    // có mặt"; dòng `submission` là chỗ mà kết luận về em sẽ được ghi.
    // Thiếu cái thứ ba thì em được duyệt vào, ngồi xuống, không nộp gì,
    // rồi biến mất khỏi bảng điểm — không bị đánh vắng, không bị đếm,
    // chỉ là không tồn tại.
    const roster = await dataSource.query(
      `SELECT source FROM examcollect.session_roster
        WHERE exam_session_id = $1 AND student_mssv = $2`,
      [sessionId, STRANGER_MSSV],
    );
    expect(roster).toHaveLength(1);
    expect(roster[0].source).toBe('manual');

    const seats = await dataSource.query(
      `SELECT s.status, s.submitted_at
         FROM examcollect.submission s
        WHERE s.exam_session_id = $1 AND s.student_mssv = $2`,
      [sessionId, STRANGER_MSSV],
    );
    const deliverables = await dataSource.query(
      `SELECT count(*)::int AS n FROM examcollect.required_deliverable WHERE exam_session_id = $1`,
      [sessionId],
    );
    expect(seats).toHaveLength(deliverables[0].n);
    expect(seats.every((r: { status: string }) => r.status === 'not_submitted')).toBe(true);
    expect(seats.every((r: { submitted_at: Date | null }) => r.submitted_at === null)).toBe(true);
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
      `SELECT 1 FROM examcollect.enrollment WHERE home_class_id = $1 AND student_mssv = $2`,
      [classId, 'SV20128888'],
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
