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
 * Who is in the room, answered from the log rather than from a browser tab.
 *
 * Before this, attendance lived only in the teacher's page state: one
 * refresh and it was gone, and there was no baseline to compare submissions
 * against afterwards. `agent_connection_event` existed for exactly this and
 * had never been written to.
 *
 * The three things worth pinning are all about NOT flattening distinctions:
 * a make-up student is not an unfamiliar name, a machine that crashed and
 * came back is not someone who appeared after the count, and a headcount is
 * an observation rather than a lock on the door.
 */
describe('Attendance (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;

  let teacherToken: string;
  let teacherId: string;
  let otherToken: string;
  let courseId: string;
  let classId: string;
  let siblingClassId: string;
  let roomId: string;

  const sockets: Socket[] = [];
  const stamp = Date.now().toString(36);

  const IN_CLASS_A = `A${stamp}`.slice(0, 20);
  const IN_CLASS_B = `B${stamp}`.slice(0, 20);
  const IN_CLASS_C = `C${stamp}`.slice(0, 20);
  const MAKEUP = `M${stamp}`.slice(0, 20);

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    return response.body.accessToken;
  }

  /** Drives one agent through `agent:join` and resolves when it is in. */
  function joinAgent(sessionCode: string, studentId: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
      sockets.push(socket);
      // Cleared on both outcomes. A pending timer keeps the event loop alive
      // after the suite is done, and Jest then force-kills the worker
      // mid-teardown — which is a warning on a good day and a spurious
      // failure in some other suite on a bad one.
      const timer = setTimeout(
        () => reject(new Error(`${studentId}: join timed out`)),
        5_000,
      );
      socket.on('connect', () => socket.emit('agent:join', { studentId, sessionCode }));
      socket.on('agent:join:ack', () => {
        clearTimeout(timer);
        resolve(socket);
      });
      socket.on('agent:join:error', (error: { code: string }) => {
        clearTimeout(timer);
        reject(new Error(`${studentId}: ${error.code}`));
      });
    });
  }

  /**
   * socket.io-client fires its own `disconnect` synchronously on
   * `.disconnect()`, so waiting for that event proves nothing about the
   * server: it has not run handleDisconnect yet, let alone written the row.
   * Wait on the clock instead.
   */
  function close(socket: Socket): Promise<void> {
    socket.disconnect();
    return new Promise((resolve) => setTimeout(resolve, 500));
  }

  async function attendance(sessionId: string, token = teacherToken) {
    const response = await request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}/attendance`)
      .set('Authorization', `Bearer ${token}`);
    return response;
  }

  async function createSession(name: string, startOffsetMs = -60_000): Promise<{ id: string; code: string }> {
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: `${name} ${Date.now()}`,
        classId,
        roomId,
        examType: 'TK',
        startTime: new Date(Date.now() + startOffsetMs).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(created.status).toBe(201);
    // Guard §7.1.1: agent:join từ chối phiên chưa đóng băng danh sách
    // dự thi. Roster của lớp này đã nhập ở beforeAll.
    await openSession(app, teacherToken, created.body.id);
    return { id: created.body.id, code: created.body.code };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.listen(0);
    dataSource = app.get(DataSource);
    baseUrl = await app.getUrl().then((url) => url.replace('[::1]', 'localhost'));

    const teacherEmail = `attendance_teacher_${stamp}@example.com`;
    teacherId = await createTestAccount(dataSource, {
      email: teacherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    teacherToken = await login(teacherEmail);

    const otherEmail = `attendance_other_${stamp}@example.com`;
    await createTestAccount(dataSource, {
      email: otherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    otherToken = await login(otherEmail);

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Attendance Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn điểm danh', $2) RETURNING id`,
      [`AT${stamp}`.slice(0, 20), semester.id],
    );
    courseId = course.id;

    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseId, `Nhóm chính ${stamp}`, teacherId],
    );
    classId = klass.id;

    const [sibling] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseId, `Nhóm N05 ${stamp}`, teacherId],
    );
    siblingClassId = sibling.id;

    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Attendance Room ${stamp}`],
    );
    roomId = room.id;

    // Three students in this class, one enrolled in the course through a
    // different class — the make-up case the course-level auth exists for.
    for (const [mssv, name, home] of [
      [IN_CLASS_A, 'Nguyễn Văn A', classId],
      [IN_CLASS_B, 'Trần Thị B', classId],
      [IN_CLASS_C, 'Lê Văn C', classId],
      [MAKEUP, 'Phạm Thi Bù', siblingClassId],
    ] as const) {
      await dataSource.query(
        `INSERT INTO examcollect.enrollment
           (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [mssv, name, courseId, home, teacherId],
      );
    }
  });

  // Every test here creates its own live session, and they all have to use
  // the same class: the in-class / make-up split under test is decided by
  // enrollment.home_class_id against the session's class, so swapping in a
  // fresh class per test would change what is being measured. Two live
  // sessions cannot share a class (ex_exam_session_class_overlap), so the
  // previous test's session is closed instead — which is what would have
  // happened in life anyway, and is exactly the transition that releases a
  // room and a class.
  afterEach(async () => {
    await dataSource.query(
      `UPDATE examcollect.exam_session SET status = 'completed'
       WHERE room_id = $1 AND status <> 'completed'`,
      [roomId],
    );
  });

  afterAll(async () => {
    for (const socket of sockets) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    // Let the server finish its own disconnect handlers before the pool
    // goes away — otherwise every still-open agent logs a 'Connection
    // terminated' error on the way out and the run's output is noise.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await app.close();
  });

  it('records a join in the log, so attendance survives a page refresh', async () => {
    const session = await createSession('Log Survives');
    await joinAgent(session.code, IN_CLASS_A);

    const response = await attendance(session.id);

    expect(response.status).toBe(200);
    // Nothing about this answer came from a browser: the page that asked
    // has never seen the join event.
    expect(response.body.present.map((s: { mssv: string }) => s.mssv)).toEqual([IN_CLASS_A]);
    expect(response.body.rosterSize).toBe(3);

    const [row] = await dataSource.query(
      `SELECT event_type FROM examcollect.agent_connection_event
        WHERE exam_session_id = $1 AND student_mssv = $2`,
      [session.id, IN_CLASS_A],
    );
    expect(row.event_type).toBe('connected');
  });

  it('splits the room into in-class, missing, and make-up', async () => {
    const session = await createSession('Three Groups');
    await joinAgent(session.code, IN_CLASS_A);
    await joinAgent(session.code, MAKEUP);

    const response = await attendance(session.id);

    expect(response.body.present.map((s: { mssv: string }) => s.mssv)).toEqual([IN_CLASS_A]);
    // B and C are on the roster and not here — the names to call out.
    expect(response.body.absent.map((s: { mssv: string }) => s.mssv).sort()).toEqual(
      [IN_CLASS_B, IN_CLASS_C].sort(),
    );
    // The make-up student reads as "from N05, sitting here", not as an
    // unfamiliar name among familiar ones.
    expect(response.body.makeup).toHaveLength(1);
    expect(response.body.makeup[0]).toMatchObject({
      mssv: MAKEUP,
      name: 'Phạm Thi Bù',
      homeClassName: `Nhóm N05 ${stamp}`,
    });
    // A make-up student must never be counted as missing from this class.
    expect(response.body.absent.map((s: { mssv: string }) => s.mssv)).not.toContain(MAKEUP);
  });

  it('marks a student who joined after start_time as late, without refusing them', async () => {
    const session = await createSession('Late Join');
    await joinAgent(session.code, IN_CLASS_A);

    const response = await attendance(session.id);

    // The session started a minute ago. Late is automatic and carries no
    // approval step — adding friction for a fully legitimate student is the
    // wrong trade, and their time is already shorter.
    expect(response.body.present[0].joinedLate).toBe(true);
  });

  it('keeps a dropped student out of "present" but remembers they were here', async () => {
    const session = await createSession('Dropped');
    const socket = await joinAgent(session.code, IN_CLASS_A);
    await close(socket);

    const response = await attendance(session.id);

    expect(response.body.present).toHaveLength(0);
    const dropped = response.body.absent.find((s: { mssv: string }) => s.mssv === IN_CLASS_A);
    // "Never turned up" and "was here and their machine died" need the same
    // action from an invigilator but not the same explanation.
    expect(dropped.firstSeenAt).not.toBeNull();
  });

  it('logs a return as `reconnected`, not as a second `connected`', async () => {
    const session = await createSession('Reconnect');
    const first = await joinAgent(session.code, IN_CLASS_A);
    await close(first);
    await joinAgent(session.code, IN_CLASS_A);

    const rows = await dataSource.query(
      `SELECT event_type FROM examcollect.agent_connection_event
        WHERE exam_session_id = $1 AND student_mssv = $2
        ORDER BY occurred_at ASC`,
      [session.id, IN_CLASS_A],
    );
    expect(rows.map((r: { event_type: string }) => r.event_type)).toEqual([
      'connected',
      'disconnected',
      'reconnected',
    ]);
  });

  describe('headcount', () => {
    it('records the count without closing the door', async () => {
      const session = await createSession('Headcount');
      await joinAgent(session.code, IN_CLASS_A);
      await joinAgent(session.code, IN_CLASS_B);

      const confirmed = await request(app.getHttpServer())
        .post(`/exam-sessions/${session.id}/attendance/confirm`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(confirmed.status).toBe(200);
      expect(confirmed.body.confirmedCount).toBe(2);
      expect(confirmed.body.confirmedAt).not.toBeNull();

      // A crashed machine must be able to come back. Blocking that to
      // protect a number harms a real student.
      await expect(joinAgent(session.code, IN_CLASS_C)).resolves.toBeDefined();

      const after = await attendance(session.id);
      expect(after.body.present).toHaveLength(3);
    });

    it('tells a machine that came back apart from someone who appeared late', async () => {
      const session = await createSession('After Headcount');
      const crashed = await joinAgent(session.code, IN_CLASS_A);
      await close(crashed);

      await request(app.getHttpServer())
        .post(`/exam-sessions/${session.id}/attendance/confirm`)
        .set('Authorization', `Bearer ${teacherToken}`);

      await joinAgent(session.code, IN_CLASS_A); // came back
      await joinAgent(session.code, IN_CLASS_B); // never seen before

      const response = await attendance(session.id);
      const byMssv = Object.fromEntries(
        response.body.present.map((s: { mssv: string }) => [s.mssv, s]),
      );

      // Showing both as one "joined after the count" label would bury the
      // case the headcount exists to catch underneath the routine one.
      expect(byMssv[IN_CLASS_A].afterHeadcount).toBe('returned');
      expect(byMssv[IN_CLASS_B].afterHeadcount).toBe('new');
    });

    it('refuses to move the baseline once the session is finalized', async () => {
      const session = await createSession('Locked Baseline');
      await joinAgent(session.code, IN_CLASS_A);
      await request(app.getHttpServer())
        .post(`/exam-sessions/${session.id}/attendance/confirm`)
        .set('Authorization', `Bearer ${teacherToken}`);

      await request(app.getHttpServer())
        .post(`/exam-sessions/${session.id}/finalize`)
        .set('Authorization', `Bearer ${teacherToken}`);

      const again = await request(app.getHttpServer())
        .post(`/exam-sessions/${session.id}/attendance/confirm`)
        .set('Authorization', `Bearer ${teacherToken}`);

      // Recounting mid-exam is legitimate. Recounting after finalize would
      // rewrite the number the discrepancy check is measured against.
      expect(again.status).toBe(409);
    });

    it('refuses a teacher who does not own the session', async () => {
      const session = await createSession('Not Yours');

      const confirmed = await request(app.getHttpServer())
        .post(`/exam-sessions/${session.id}/attendance/confirm`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(confirmed.status).toBe(403);

      const read = await attendance(session.id, otherToken);
      expect(read.status).toBe(403);
    });
  });

  it('names the student behind a 45-present / 46-submitted gap', async () => {
    const session = await createSession('Discrepancy');
    await joinAgent(session.code, IN_CLASS_A);

    await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/attendance/confirm`)
      .set('Authorization', `Bearer ${teacherToken}`);

    // Someone who was not in the room when it was counted submits anyway.
    await joinAgent(session.code, IN_CLASS_B);

    const [deliverable] = await dataSource.query(
      `SELECT id FROM examcollect.required_deliverable WHERE exam_session_id = $1`,
      [session.id],
    );
    for (const mssv of [IN_CLASS_A, IN_CLASS_B]) {
      await dataSource.query(
        // UPSERT, không phải INSERT, từ 2026-09-11: mở phiên gieo sẵn một
        // dòng `not_submitted` cho mỗi (sinh viên × file), nên "chưa nộp"
        // không còn là sự VẮNG MẶT của một dòng. Một INSERT thuần ở đây
        // đụng uq_submission_identity.
        //
        // Dừng ở `received` chứ không nhảy tới `collected`: trigger vòng
        // đời chỉ cho đi từng bước, và ca này chỉ cần một bài nộp TỒN TẠI
        // để báo cáo lệch điểm danh đếm được.
        `INSERT INTO examcollect.submission
           (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
            home_class_id, home_teacher_id, storage_key, checksum, file_size,
            submitted_via, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, 'normal', 'received')
         ON CONFLICT (exam_session_id, required_deliverable_id, student_mssv)
         DO UPDATE SET storage_key = EXCLUDED.storage_key,
                       checksum    = EXCLUDED.checksum,
                       file_size   = EXCLUDED.file_size,
                       status      = 'received'`,
        [session.id, deliverable.id, mssv, mssv, classId, teacherId, `k/${mssv}`, 'a'.repeat(64)],
      );
    }

    await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/finalize`)
      .set('Authorization', `Bearer ${teacherToken}`);

    const response = await attendance(session.id);

    expect(response.body.discrepancy).toMatchObject({
      confirmedCount: 1,
      submittedCount: 2,
    });
    // Named, not just counted: this is the question enrollment and
    // submission alone cannot answer.
    expect(
      response.body.discrepancy.unaccounted.map((s: { mssv: string }) => s.mssv),
    ).toEqual([IN_CLASS_B]);
  });
});
