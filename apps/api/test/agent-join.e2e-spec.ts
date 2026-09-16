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
 * `agent:join` is the system's only authentication boundary for students,
 * and until now it had none: any student ID paired with a valid session
 * code was let in, which is the standing violation of CLAUDE.md Security
 * rule 1 ("a leaked session code alone must not grant access").
 *
 * These run against a real Postgres and a real socket because that is the
 * only way to exercise the thing being claimed — a mocked repository would
 * only prove the mock agrees with itself.
 */
describe('agent:join enrollment enforcement (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;
  let sessionCode: string;
  let templatedCode: string;
  let courseId: string;
  // Hoisted so the filename tests can build their own sessions from the
  // same fixtures instead of a second set that could drift from these.
  let token: string;
  let classId: string;
  let roomId: string;
  let roomName: string;

  const ENROLLED_MSSV = 'SV20120001';
  const ENROLLED_NAME = 'Nguyễn Văn A';
  const STRANGER_MSSV = 'SV20129999';

  const sockets: Socket[] = [];
  const fixtureStamp = Date.now();

  function connect(): Socket {
    const socket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
    sockets.push(socket);
    return socket;
  }

  /** Resolves with whichever of the two contracted replies arrives first. */
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    // A real port, not just init(): the socket.io server has to be listening
    // for a client to reach it.
    await app.listen(0);
    baseUrl = await app.getUrl();
    dataSource = app.get(DataSource);

    const stamp = fixtureStamp;
    const email = `agent_join_teacher_${stamp}@example.com`;
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
      [`Agent Join Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Agent Join Course', $2) RETURNING id`,
      [`AJ${stamp}`, semester.id],
    );
    courseId = course.id;
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Agent Join Room ${stamp}`],
    );
    roomId = room.id;
    // What {PHONG} renders to: separators dropped, each word capitalised.
    roomName = `AgentJoinRoom${stamp}`;
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, 'N01', $2) RETURNING id`,
      [courseId, teacherId],
    );
    classId = klass.id;

    // The two sessions below both run at the same time, so they cannot
    // share a room or a class (ex_exam_session_room_overlap /
    // ex_exam_session_class_overlap). The templated session keeps the room
    // above, because `roomName` is what its {PHONG} assertion expects; the
    // plain session gets these. Join authentication is at COURSE level, so
    // a second class in the same course changes nothing these tests are
    // about — the enrolled student still gets in.
    const [plainRoom] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Agent Join Plain Room ${stamp}`],
    );
    const [plainClass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, 'N02', $2) RETURNING id`,
      [courseId, teacherId],
    );

    // Lớp N02 cũng cần ÍT NHẤT một sinh viên, từ 2026-09-11: mở phiên
    // là đóng băng danh sách dự thi của LỚP phiên đó, và một lớp rỗng
    // thì không có gì để chụp. Em này không xuất hiện trong khẳng định
    // nào — xác thực vào thi vẫn ở cấp MÔN, đúng như các test dưới đây
    // kiểm.
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [`N02${stamp}`.slice(0, 20), 'Sinh viên lớp N02', courseId, plainClass.id, teacherId],
    );

    // One student on the roster, one deliberately absent from it.
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [ENROLLED_MSSV, ENROLLED_NAME, courseId, klass.id, teacherId],
    );

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Agent Join Session ${stamp}`,
        // The session names its CLASS; the course is derived from it. Join
        // authentication still happens at course level via enrollment —
        // that separation is what these tests are about.
        classId: plainClass.id,
        roomId: plainRoom.id,
        examType: 'TK',
        startTime: new Date(Date.now() - 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(created.status).toBe(201);
    // Guard §7.1.1: `agent:join` từ chối phiên chưa đóng băng danh sách
    // dự thi. Xem test/helpers/open-session.ts.
    await openSession(app, token, created.body.id);
    sessionCode = created.body.code;

    // A second session whose deliverable is declared as a PATTERN. Same
    // class, same roster — only the filename rule differs.
    const templated = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Agent Join Templated ${stamp}`,
        classId: klass.id,
        roomId: room.id,
        examType: 'TK',
        startTime: new Date(Date.now() - 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
        requiredFilenames: ['{PHONG}_{MSSV}_{TEN}_{SOMAY}.docx'],
      });
    expect(templated.status).toBe(201);
    // Guard §7.1.1: `agent:join` từ chối phiên chưa đóng băng danh sách
    // dự thi. Xem test/helpers/open-session.ts.
    await openSession(app, token, templated.body.id);
    templatedCode = templated.body.code;
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

  it('refuses a student with no enrollment for the session course', async () => {
    const reply = await join(connect(), {
      fullName: 'Người Lạ',
      studentId: STRANGER_MSSV,
      sessionCode,
    });

    // Knowing the code is not enough. This is the whole of Security rule 1.
    expect(reply.event).toBe('error');
    expect(reply.body.code).toBe('NOT_ENROLLED');
  });

  it('admits an enrolled student', async () => {
    const reply = await join(connect(), {
      fullName: 'Bất Kỳ Tên Nào',
      studentId: ENROLLED_MSSV,
      sessionCode,
    });

    expect(reply.event).toBe('ack');
  });

  it('answers with the roster name, not the name the student typed', async () => {
    const reply = await join(connect(), {
      // A typed name is no longer identity. Trusting it would mean matching
      // "Nguyen Van A" against "Nguyễn Văn A" — the fuzzy comparison this
      // design exists to avoid.
      fullName: 'Tên Bịa Đặt',
      studentId: ENROLLED_MSSV,
      sessionCode,
    });

    expect(reply.event).toBe('ack');
    expect(reply.body.studentName).toBe(ENROLLED_NAME);
  });

  describe('per-student filenames', () => {
    it('resolves a declared pattern into this student\'s own filename', async () => {
      const reply = await join(connect(), {
        studentId: ENROLLED_MSSV,
        sessionCode: templatedCode,
        machineName: 'MAY07',
      });

      expect(reply.event).toBe('ack');
      const ack = reply.body as unknown as {
        requiredFiles: string[];
        requiredDeliverables: { requiredFilename: string }[];
      };
      // The teacher declared one pattern; the student is told one finished
      // name. Nothing is composed on the agent's side, and nothing is
      // matched later — submission identity is still decided in advance,
      // it just now depends on who is sitting the exam.
      const expected = `${roomName}_${ENROLLED_MSSV}_NguyenVanA_MAY07.docx`;
      expect(ack.requiredFiles).toEqual([expected]);
      // Both fields carry the same name — an agent must never see two
      // different names for one deliverable.
      expect(ack.requiredDeliverables[0].requiredFilename).toBe(expected);
    });

    it('says UNKNOWN when the machine will not name itself', async () => {
      const reply = await join(connect(), {
        studentId: ENROLLED_MSSV,
        sessionCode: templatedCode,
      });

      const ack = reply.body as unknown as { requiredFiles: string[] };
      // A hole would render as "..._SV001_NguyenVanA_.docx", which reads as
      // a bug and hides which part is missing.
      expect(ack.requiredFiles[0]).toContain('_UNKNOWN.docx');
    });

    it('rejects a pattern with a token nobody defined', async () => {
      const response = await request(app.getHttpServer())
        .post('/exam-sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `Bad Token ${fixtureStamp}`,
          classId,
          roomId,
          examType: 'TK',
          startTime: new Date(Date.now() - 60_000).toISOString(),
          endTime: new Date(Date.now() + 3_600_000).toISOString(),
          requiredFilenames: ['{LOP}_Cau1.docx'],
        });

      // Otherwise it reaches every agent as a literal "{LOP}" and forty
      // students submit a file the teacher never asked for.
      expect(response.status).toBe(400);
    });
  });
});
