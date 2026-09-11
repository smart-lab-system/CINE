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
 * Spec: docs/superpowers/specs/2026-09-01-student-agent-electron-design.md
 * §5.2 (per-MSSV rate limiting, survives a reconnect, unlike the existing
 * per-socket limiter) and §6 (teacher broadcast on SESSION_NOT_ACTIVE).
 *
 * Separate from agent-join.e2e-spec.ts on purpose: that file is about
 * enrollment enforcement (Security rule 1); this one is about abuse
 * tracking and teacher notification — a different responsibility, sharing
 * only the `agent:join` entry point.
 */
describe('agent:join rate limiting and teacher broadcast (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;
  let token: string;
  let activeSessionCode: string;
  let pendingSessionCode: string;
  let pendingSessionId: string;
  let courseId: string;

  const sockets: Socket[] = [];
  const fixtureStamp = Date.now();
  const NONEXISTENT_CODE = 'NOPE99';

  function connect(): Socket {
    const socket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
    sockets.push(socket);
    return socket;
  }

  function join(
    socket: Socket,
    payload: Record<string, unknown>,
  ): Promise<{ event: 'ack' | 'error'; body: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no reply to agent:join')), 10_000);
      socket.on('agent:join:ack', (body) => {
        clearTimeout(timer);
        resolve({ event: 'ack', body });
      });
      socket.on('agent:join:error', (body) => {
        clearTimeout(timer);
        resolve({ event: 'error', body });
      });
      socket.on('connect', () => socket.emit('agent:join', payload));
    });
  }

  /** Every failure test needs its own MSSV — the lock store is keyed by
   *  MSSV and persists for the whole app instance across `it` blocks. */
  async function enrollFreshStudent(suffix: string): Promise<string> {
    const mssv = `RL${String(fixtureStamp).slice(-8)}${suffix}`;
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
       SELECT $1, $2, $3, c.id, c.teacher_id
       FROM examcollect.class c WHERE c.course_id = $3 LIMIT 1`,
      [mssv, `Rate Limit Student ${suffix}`, courseId],
    );
    return mssv;
  }

  async function subscribeTeacher(examSessionId: string): Promise<Socket> {
    const socket = io(`${baseUrl}/exam-live`, {
      reconnection: false,
      forceNew: true,
      extraHeaders: { cookie: `access_token=${token}` },
    });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    socket.emit('teacher:subscribe', { examSessionId });
    // No ack event on success — same settle-delay pattern as
    // access-request.e2e-spec.ts.
    await new Promise((resolve) => setTimeout(resolve, 300));
    return socket;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.listen(0);
    baseUrl = await app.getUrl();
    dataSource = app.get(DataSource);

    const stamp = fixtureStamp;
    const email = `rate_limit_teacher_${stamp}@example.com`;
    const teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    token = login.body.accessToken;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Rate Limit Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Rate Limit Course', $2) RETURNING id`,
      [`RL${stamp}`, semester.id],
    );
    courseId = course.id;
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Rate Limit Room ${stamp}`],
    );
    await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, 'N01', $2) RETURNING id`,
      [courseId, teacherId],
    );

    const active = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Rate Limit Active ${stamp}`,
        classId: (
          await dataSource.query(`SELECT id FROM examcollect.class WHERE course_id = $1 LIMIT 1`, [courseId])
        )[0].id,
        roomId: room.id,
        examType: 'TK',
        startTime: new Date(Date.now() - 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(active.status).toBe(201);
    // Guard §7.1.1: agent:join từ chối phiên chưa đóng băng danh sách
    // dự thi. Cần ít nhất một em trong lớp để có gì mà chụp — em này
    // không tham gia khẳng định nào, mọi ca dưới đây dùng MSSV riêng.
    await enrollFreshStudent('SEED');
    await openSession(app, token, active.body.id);
    activeSessionCode = active.body.code;

    // Not yet started — status is 'active' but the window hasn't opened,
    // so agent:join answers SESSION_NOT_ACTIVE (§6's trigger).
    const pending = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Rate Limit Pending ${stamp}`,
        classId: (
          await dataSource.query(`SELECT id FROM examcollect.class WHERE course_id = $1 LIMIT 1`, [courseId])
        )[0].id,
        roomId: room.id,
        examType: 'TK',
        startTime: new Date(Date.now() + 3_600_000).toISOString(),
        endTime: new Date(Date.now() + 7_200_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(pending.status).toBe(201);
    pendingSessionCode = pending.body.code;
    pendingSessionId = pending.body.id;
  });

  afterAll(async () => {
    for (const socket of sockets) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    await app.close();
  });

  describe('per-MSSV lockout (§5.2)', () => {
    it('does not lock out before the 5th cumulative failure', async () => {
      const mssv = await enrollFreshStudent('A');
      for (let i = 0; i < 4; i++) {
        const reply = await join(connect(), { studentId: mssv, sessionCode: NONEXISTENT_CODE });
        expect(reply.event).toBe('error');
        expect(reply.body.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('locks out on the 5th cumulative failure, with a retryAfterMs close to 5 minutes', async () => {
      const mssv = await enrollFreshStudent('B');
      for (let i = 0; i < 4; i++) {
        await join(connect(), { studentId: mssv, sessionCode: NONEXISTENT_CODE });
      }
      const fifth = await join(connect(), { studentId: mssv, sessionCode: NONEXISTENT_CODE });
      expect(fifth.event).toBe('error');
      expect(fifth.body.code).toBe('RATE_LIMITED');
      const retryAfterMs = fifth.body.retryAfterMs as number;
      expect(retryAfterMs).toBeGreaterThan(290_000);
      expect(retryAfterMs).toBeLessThanOrEqual(300_000);
    });

    it('answers a locked-out MSSV with RATE_LIMITED even on an otherwise-correct attempt', async () => {
      const mssv = await enrollFreshStudent('C');
      for (let i = 0; i < 5; i++) {
        await join(connect(), { studentId: mssv, sessionCode: NONEXISTENT_CODE });
      }
      // This attempt would otherwise succeed — proves the lock intercepts
      // regardless of what the underlying outcome would have been.
      const attempt = await join(connect(), { studentId: mssv, sessionCode: activeSessionCode });
      expect(attempt.event).toBe('error');
      expect(attempt.body.code).toBe('RATE_LIMITED');
    });

    it('does not count NOT_ENROLLED toward the lockout', async () => {
      const stranger = `RL${String(fixtureStamp).slice(-8)}D`;
      for (let i = 0; i < 6; i++) {
        const reply = await join(connect(), { studentId: stranger, sessionCode: activeSessionCode });
        expect(reply.event).toBe('error');
        expect(reply.body.code).toBe('NOT_ENROLLED');
      }
    });

    it('does not count SESSION_NOT_ACTIVE toward the lockout', async () => {
      const mssv = await enrollFreshStudent('E');
      for (let i = 0; i < 6; i++) {
        const reply = await join(connect(), { studentId: mssv, sessionCode: pendingSessionCode });
        expect(reply.event).toBe('error');
        expect(reply.body.code).toBe('SESSION_NOT_ACTIVE');
      }
    });

    it('lets a successful join clear the failure count', async () => {
      const mssv = await enrollFreshStudent('F');
      for (let i = 0; i < 4; i++) {
        await join(connect(), { studentId: mssv, sessionCode: NONEXISTENT_CODE });
      }
      const success = await join(connect(), { studentId: mssv, sessionCode: activeSessionCode });
      expect(success.event).toBe('ack');

      // 4 more failures should not lock out — the counter was reset, not
      // still sitting at 4/5 from before the success.
      for (let i = 0; i < 4; i++) {
        const reply = await join(connect(), { studentId: mssv, sessionCode: NONEXISTENT_CODE });
        expect(reply.body.code).toBe('SESSION_NOT_FOUND');
      }
    });
  });

  describe('teacher broadcast on SESSION_NOT_ACTIVE (§6)', () => {
    it('notifies the teacher room once, and throttles an immediate repeat', async () => {
      const mssv = await enrollFreshStudent('G');
      const teacherSocket = await subscribeTeacher(pendingSessionId);

      const events: Record<string, unknown>[] = [];
      teacherSocket.on('lobby:join_attempt_failed', (body) => events.push(body));

      await join(connect(), { studentId: mssv, sessionCode: pendingSessionCode });
      await join(connect(), { studentId: mssv, sessionCode: pendingSessionCode });
      // Give the (locally-emitted, no real network hop) broadcast a moment
      // to be delivered before asserting on it.
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(events).toHaveLength(1);
      expect(events[0].studentId).toBe(mssv);
      expect(events[0].code).toBe('SESSION_NOT_ACTIVE');
      expect(typeof events[0].occurredAt).toBe('string');
    });
  });
});
