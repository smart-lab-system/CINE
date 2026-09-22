import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { concurrentLiveWindow, releaseTeacherSessions } from './helpers/session-window';
import { openSession } from './helpers/open-session';

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

    const course = { name: 'Teacher Submissions Course' };
    const room = { name: `Teacher Submissions Room ${stamp}` };
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id) VALUES ($1, 'N01', $2) RETURNING id`,
      [course.name, teacherId],
    );
    const classId = klass.id;

    // A second course/class/session belonging to the OTHER teacher — this
    // is the one that must never appear in the first teacher's list.
    const foreignCourse = { name: 'Foreign Course' };
    const [foreignClass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id) VALUES ($1, 'N01', $2) RETURNING id`,
      [foreignCourse.name, otherTeacherId],
    );

    const MSSV_A = `TSA${stamp}`.slice(0, 20);
    const MSSV_B = `TSB${stamp}`.slice(0, 20);
    const MSSV_FOREIGN = `TSF${stamp}`.slice(0, 20);

    // Lớp của phiên B, dựng TRƯỚC khi ghi danh: xác thực vào thi đọc ảnh
    // chốt của phiên, mà ảnh chốt chụp từ enrollment của LỚP. Để MSSV_B ở
    // lớp N01 rồi cho em thi ở phiên của nhóm B — cách cũ, hợp lệ khi xác
    // thực còn ở cấp môn — giờ là một em không có tên trong phòng.
    const [classBRow] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [course.name, `Nhóm B ${stamp}`, teacherId],
    );

    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, 'Sinh viên A', $2, $3), ($4, 'Sinh viên B', $5, $3)`,
      [MSSV_A, classId, teacherId, MSSV_B, classBRow.id],
    );
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, 'Sinh viên lạ', $2, $3)`,
      [MSSV_FOREIGN, foreignClass.id, otherTeacherId],
    );

    // All three sessions below run at the same time — every one of them
    // has to be live for its agent to connect and submit. That means no
    // two of them may share a room (ex_exam_session_room_overlap), so each
    // gets its own. `room` above is still the first one handed out.
    let roomsHandedOut = 0;
    async function freshRoomId(): Promise<string> {
      roomsHandedOut += 1;
      if (roomsHandedOut === 1) {
        return room.name as string;
      }
      const extra = { name: `Phòng nộp bài ${stamp}-${roomsHandedOut}` };
      return extra.name as string;
    }

    async function createSession(
      name: string,
      forClassId: string,
      token: string,
      ownerId: string,
    ) {
      // Ca thi trước của CHÍNH người này đã xong — nhả họ ra, nếu không
      // `ex_exam_session_teacher_gap` chặn phiên này bằng 409. Vì thế khối
      // dựng bên dưới phải ĐAN XEN tạo phiên với thu bài: một phiên chỉ
      // được đóng sau khi agent của nó đã nộp xong.
      await releaseTeacherSessions(dataSource, ownerId);
      const response = await request(app.getHttpServer())
        .post('/exam-sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name,
          classId: forClassId,
          roomName: await freshRoomId(),
          semesterName: 'HK kiểm thử',
          examType: 'TK',
          ...concurrentLiveWindow(),
          requiredFilenames: ['Cau1.docx'],
        });
      expect(response.status).toBe(201);
      // Guard §7.1.1: agent:join từ chối phiên chưa đóng băng danh sách
      // dự thi. Lớp truyền vào phải đã có ít nhất một sinh viên.
      await openSession(app, token, response.body.id);
      return {
        id: response.body.id as string,
        code: response.body.code as string,
        deliverableId: response.body.requiredDeliverables[0].id as string,
      };
    }

    const sessionA = await createSession(`Phiên A ${stamp}`, classId, teacherToken, teacherId);
    sessionAId = sessionA.id;
    await collectOne(sessionA.id, sessionA.code, sessionA.deliverableId, MSSV_A, 'bai A\n');

    const sessionB = await createSession(`Phiên B ${stamp}`, classBRow.id, teacherToken, teacherId);
    sessionBId = sessionB.id;
    // Lớp riêng, cùng lý do phải có phòng riêng: một lớp không thể thi hai
    // ca cùng lúc. MSSV_B đã ghi danh ở lớp này từ đầu khối dựng.
    await collectOne(sessionB.id, sessionB.code, sessionB.deliverableId, MSSV_B, 'bai B\n');

    // Giảng viên KHÁC, nên phiên này không đụng luật 30 phút với A và B —
    // và đó cũng chính là thứ ca "không rò bài của phiên người khác" kiểm.
    const foreignSession = await createSession(`Phiên lạ ${stamp}`, foreignClass.id, otherToken, otherTeacherId);
    foreignSessionId = foreignSession.id;
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

  it('dẫn đầu bằng bài nộp thật, không phải bằng dòng chưa nộp', async () => {
    // Postgres mặc định NULLS FIRST cho DESC. Từ khi `submitted_at` được
    // phép NULL, thiếu `NULLS LAST` sẽ làm trang đầu của "Quản lý bài
    // thu" toàn dòng KHÔNG CÓ FILE — sắp theo một cột mà chúng không có
    // giá trị nào để sắp.
    const response = await request(app.getHttpServer())
      .get('/submissions')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    const times = response.body.items.map(
      (i: { submittedAt: string | null }) => i.submittedAt,
    );
    const firstNull = times.indexOf(null);
    const lastReal = times.reduce(
      (acc: number, t: string | null, i: number) => (t !== null ? i : acc),
      -1,
    );
    if (firstNull !== -1) {
      expect(firstNull).toBeGreaterThan(lastReal);
    }
    expect(times[0]).not.toBeNull();
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
