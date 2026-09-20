import { createHash } from 'crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { ExamSessionScheduler } from '../src/exam-session/exam-session.scheduler';
import { createTestAccount } from './helpers/create-account';
import { openSession } from './helpers/open-session';

/**
 * "Thu lại" — spec
 * docs/superpowers/specs/2026-09-11-exam-collection-phase-design.md §6.
 *
 * Đây là bộ test duy nhất chạy ack hai chiều thật: server gọi
 * `socket.timeout().emitWithAck()`, client socket.io thật trả lời. Không
 * giả lập được phần đó — con số giảng viên nhìn thấy là "bao nhiêu máy
 * ĐÃ TRẢ LỜI", và sự khác nhau giữa nó với "bao nhiêu lệnh đã gửi" chỉ
 * hiện ra khi có một agent thật im lặng.
 *
 * Mỗi phiên có PHÒNG và LỚP riêng: hai ràng buộc GiST loại trừ theo
 * khoảng thời gian, và mọi phiên ở đây đều đang diễn ra nên chúng chồng
 * lấn nhau hoàn toàn.
 */
describe('POST /exam-sessions/:id/recollect (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let scheduler: ExamSessionScheduler;
  let baseUrl: string;

  let teacherToken: string;
  let teacherId: string;
  let otherTeacherToken: string;
  let courseId: string;

  const PASSWORD = 'correct-horse-battery';
  let seedCursor = 0;
  const openSockets: Socket[] = [];

  async function makeAccount(prefix: string) {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const id = await createTestAccount(dataSource, { email, password: PASSWORD, role: 'teacher' });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD });
    return { id, token: login.body.accessToken as string };
  }

  interface SeededSession {
    id: string;
    code: string;
    deliverableIds: string[];
    endTime: Date;
    classId: string;
  }

  /**
   * Phiên `active` đang diễn ra: agent join được ngay, và đồng hồ THẬT
   * vẫn nằm trong cửa sổ nhận bài, nên upload trong `collecting` không
   * phải chống lại `isAcceptingUploads`.
   */
  async function seedActiveSession(requiredFilenames = ['Cau1.docx']): Promise<SeededSession> {
    seedCursor += 1;
    const suffix = `${seedCursor}_${Date.now()}`;
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 40) RETURNING id`,
      [`Recollect Room ${suffix}`],
    );
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, course_name, name, teacher_id)
       VALUES ($1, (SELECT name FROM examcollect.course WHERE id = $1), $2, $3) RETURNING id`,
      [courseId, `Nhóm ${suffix}`, teacherId],
    );

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: `Phiên thu lại ${suffix}`,
        classId: klass.id,
        roomId: room.id,
        examType: 'TK',
        startTime: new Date(Date.now() - 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
        requiredFilenames,
      });
    expect(created.status).toBe(201);
    return {
      id: created.body.id as string,
      code: created.body.code as string,
      deliverableIds: (created.body.requiredDeliverables as Array<{ id: string }>).map((d) => d.id),
      endTime: new Date(created.body.endTime as string),
      classId: klass.id as string,
    };
  }

  /** Đưa phiên vào `collecting` bằng đúng đường thật: lượt quét hết giờ. */
  async function advanceToCollecting(session: SeededSession): Promise<void> {
    await scheduler.sweep(new Date(session.endTime.getTime() + 1_000));
  }

  async function enrol(mssv: string, name: string, homeClassId: string): Promise<void> {
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [mssv, name, courseId, homeClassId, teacherId],
    );
  }

  async function joinAgent(session: SeededSession, mssv: string): Promise<Socket> {
    // Guard §7.1.1. Idempotent, nên gọi mỗi lần join là an toàn — và
    // đặt ở đây thay vì trong seed vì roster được nhập SAU khi tạo phiên.
    await openSession(app, teacherToken, session.id);
    const socket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
    openSockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    await new Promise<void>((resolve, reject) => {
      socket.on('agent:join:ack', () => resolve());
      socket.on('agent:join:error', (e) => reject(new Error(JSON.stringify(e))));
      socket.emit('agent:join', { fullName: 'ignored', studentId: mssv, sessionCode: session.code });
    });
    return socket;
  }

  function ack<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ack for ${event}`)), 15_000);
      socket.emit(event, payload, (reply: T) => {
        clearTimeout(timer);
        resolve(reply);
      });
    });
  }

  async function submitOne(
    socket: Socket,
    session: SeededSession,
    mssv: string,
    deliverableId: string,
  ): Promise<void> {
    const urlAck = await ack<{ ok: true; uploadUrl: string; storageKey: string }>(
      socket,
      'submission:request-upload-url',
      { examSessionId: session.id, studentId: mssv, requiredDeliverableId: deliverableId },
    );
    const content = `bai lam cua ${mssv} cho ${deliverableId}\n`;
    const put = await fetch(urlAck.uploadUrl, { method: 'PUT', body: content });
    expect(put.ok).toBe(true);
    const confirmAck = await ack<{ ok: true; status: string }>(socket, 'submission:confirm', {
      examSessionId: session.id,
      studentId: mssv,
      requiredDeliverableId: deliverableId,
      storageKey: urlAck.storageKey,
      checksum: createHash('sha256').update(content).digest('hex'),
      fileSize: Buffer.byteLength(content),
    });
    expect(confirmAck.status).toBe('collected');
  }

  async function submitAll(socket: Socket, session: SeededSession, mssv: string): Promise<void> {
    for (const deliverableId of session.deliverableIds) {
      await submitOne(socket, session, mssv, deliverableId);
    }
  }

  function recollect(id: string, token = teacherToken) {
    return request(app.getHttpServer())
      .post(`/exam-sessions/${id}/recollect`)
      .set('Authorization', `Bearer ${token}`);
  }

  /** Agent trả lời ngay, như một máy còn sống. */
  function answerRecollect(socket: Socket, onReceive?: () => void): void {
    socket.on('exam:recollect', (_payload: unknown, ackFn?: (reply: { ok: boolean }) => void) => {
      onReceive?.();
      ackFn?.({ ok: true });
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();

    dataSource = app.get(DataSource);
    scheduler = app.get(ExamSessionScheduler);

    const teacher = await makeAccount('recollect_gv');
    teacherId = teacher.id;
    teacherToken = teacher.token;
    otherTeacherToken = (await makeAccount('recollect_gv_other')).token;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Recollect Semester ${Date.now()}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Recollect Course', $2) RETURNING id`,
      [`RC${Date.now()}`.slice(0, 20), semester.id],
    );
    courseId = course.id;
  });

  afterAll(async () => {
    for (const socket of openSockets) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    // Handler disconnect phía server còn phải chạy (attendance ghi một
    // event mỗi agent) — đóng pool ngay sẽ biến một lần chạy xanh thành
    // một bức tường ERROR không nghĩa gì.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await app.close();
  });

  it('chỉ agent của em chưa nộp đủ nhận exam:recollect', async () => {
    const session = await seedActiveSession();
    await enrol('SVRC001', 'Em đã nộp', session.classId);
    await enrol('SVRC002', 'Em chưa nộp', session.classId);
    const done = await joinAgent(session, 'SVRC001');
    const missing = await joinAgent(session, 'SVRC002');
    await advanceToCollecting(session);
    await submitAll(done, session, 'SVRC001');

    const received: string[] = [];
    answerRecollect(done, () => received.push('SVRC001'));
    answerRecollect(missing, () => received.push('SVRC002'));

    const res = await recollect(session.id);

    expect(res.status).toBe(200);
    // Em đã nộp đủ mà nhận lệnh nộp lại sẽ upload đè lên bài của chính
    // mình — đó là lý do lệnh nhắm từng máy chứ không phát cả phòng.
    expect(received).toEqual(['SVRC002']);
    expect(res.body).toMatchObject({ missing: 1, acknowledged: 1, unreachable: 0 });
  });

  it('em nộp thiếu 1/2 file VẪN nhận', async () => {
    // Ca thu lại có ích nhất: máy còn đó, chỉ thiếu một file. Bản đầu của
    // spec bỏ sót nhóm này — nó chỉ đếm em trắng tay.
    const session = await seedActiveSession(['Cau1.docx', 'Cau2.docx']);
    await enrol('SVRC010', 'Em nộp thiếu', session.classId);
    const agent = await joinAgent(session, 'SVRC010');
    await advanceToCollecting(session);
    await submitOne(agent, session, 'SVRC010', session.deliverableIds[0]);

    let got = false;
    answerRecollect(agent, () => {
      got = true;
    });

    const res = await recollect(session.id);

    expect(got).toBe(true);
    expect(res.body).toMatchObject({ missing: 1, acknowledged: 1 });
  });

  it('MSSV lệch hoa thường vẫn nhắm trúng', async () => {
    // `student_mssv` là citext — Postgres coi 'SVRC020' và 'svrc020' là
    // MỘT sinh viên, `Set.has()` của JS thì không. Danh sách đích lấy
    // cách viết TỪ ROSTER, còn agent tự khai cách viết của nó, nên hai
    // đầu lệch nhau là chuyện bình thường. So thẳng sẽ ra
    // `acknowledged: 0`, trông hệt như cả phòng đã ngắt kết nối.
    const session = await seedActiveSession();
    await enrol('SVRC020', 'Em gõ thường', session.classId);
    const agent = await joinAgent(session, 'svrc020');
    await advanceToCollecting(session);

    let got = false;
    answerRecollect(agent, () => {
      got = true;
    });

    const res = await recollect(session.id);

    expect(got).toBe(true);
    expect(res.body.acknowledged).toBe(1);
    expect(res.body.unreachable).toBe(0);
  });

  it('agent không ack trong 3 giây rơi vào unreachable, kèm tên', async () => {
    const session = await seedActiveSession();
    await enrol('SVRC030', 'Em còn sống', session.classId);
    await enrol('SVRC031', 'Em treo máy', session.classId);
    const alive = await joinAgent(session, 'SVRC030');
    const mute = await joinAgent(session, 'SVRC031');
    await advanceToCollecting(session);

    answerRecollect(alive);
    // Socket còn kết nối, tiến trình agent thì treo. `emit` bắn-và-quên
    // sẽ đếm máy này là đã nhận lệnh; chỉ ack mới phân biệt được.
    mute.on('exam:recollect', () => {
      /* cố ý không ack */
    });

    const res = await recollect(session.id);

    expect(res.body).toMatchObject({ missing: 2, acknowledged: 1, unreachable: 1 });
    // Con số nói có vấn đề; cái tên mới nói giảng viên phải đi tới bàn nào.
    expect(res.body.unreachableNames).toEqual(['Em treo máy']);
  });

  it('máy đã ngắt kết nối tính là unreachable', async () => {
    const session = await seedActiveSession();
    await enrol('SVRC040', 'Em đã tắt máy', session.classId);
    const agent = await joinAgent(session, 'SVRC040');
    await advanceToCollecting(session);
    agent.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 300));

    const res = await recollect(session.id);

    expect(res.body).toMatchObject({ missing: 1, acknowledged: 0, unreachable: 1 });
    expect(res.body.unreachableNames).toEqual(['Em đã tắt máy']);
  });

  it('sau khi nộp lại, em đó rời khỏi tập đích ở lần bấm sau', async () => {
    // Vòng khép kín của tính năng: bấm, em nộp, bấm lại thì không còn ai.
    const session = await seedActiveSession();
    await enrol('SVRC050', 'Em nộp muộn', session.classId);
    const agent = await joinAgent(session, 'SVRC050');
    await advanceToCollecting(session);
    answerRecollect(agent);

    expect((await recollect(session.id)).body.missing).toBe(1);
    await submitAll(agent, session, 'SVRC050');

    expect((await recollect(session.id)).body.missing).toBe(0);
  });

  it('phiên không ở collecting thì 409', async () => {
    // Gửi lệnh cho một buổi thi chưa hết giờ chỉ tạo kỳ vọng sai: chưa
    // ai đến hạn phải nộp cả.
    const session = await seedActiveSession();

    const res = await recollect(session.id);

    expect(res.status).toBe(409);
  });

  it('từ chối giảng viên không phải chủ phiên', async () => {
    const session = await seedActiveSession();
    await advanceToCollecting(session);

    const res = await recollect(session.id, otherTeacherToken);

    expect(res.status).toBe(403);
  });
});
