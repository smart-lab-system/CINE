import { createHash } from 'crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { ExamSessionScheduler } from '../src/exam-session/exam-session.scheduler';
import { SUBMISSION_GRACE_PERIOD_MS } from '../src/submission/submission.types';
import { createTestAccount } from './helpers/create-account';
import { openSession } from './helpers/open-session';

/**
 * Giai đoạn "Đang thu bài" — spec
 * docs/superpowers/specs/2026-09-11-exam-collection-phase-design.md.
 *
 * Cách lái thời gian ở đây: KHÔNG sửa `end_time` trong DB. Cả hai lượt
 * quét đều nhận `now` làm tham số (`findFinalizableIds(now)`,
 * `findCollectionExpiredIds(now)`), nên test gọi thẳng scheduler với một
 * `now` đã chọn. Phiên vẫn có khung giờ thật ở tương lai, nghĩa là
 * `isAcceptingUploads` — thứ dùng đồng hồ THẬT — vẫn nằm trong cửa sổ, và
 * ta kiểm được đúng nhánh trạng thái của nó mà không phải giả lập giờ hệ
 * thống.
 */
describe('Collection phase (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let scheduler: ExamSessionScheduler;
  let baseUrl: string;

  let teacherToken: string;
  let teacherId: string;
  let otherTeacherToken: string;
  // Không có phòng và lớp dùng chung: mỗi phiên tự seed phòng và lớp
  // riêng (xem seedActiveSession), vì hai ràng buộc GiST loại trừ theo
  // khoảng thời gian và mọi phiên ở đây đều đang diễn ra. Môn học thì
  // dùng chung được — nó không nằm trong ràng buộc nào cả.
  let courseName: string;

  const PASSWORD = 'correct-horse-battery';
  let windowCursor = 0;

  async function makeAccount(prefix: string, role: 'teacher') {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const id = await createTestAccount(dataSource, { email, password: PASSWORD, role });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD });
    return { id, token: login.body.accessToken as string };
  }

  /**
   * Một phiên `active` đang diễn ra: bắt đầu trong quá khứ (agent join
   * được ngay), kết thúc ở tương lai (`isAcceptingUploads` còn mở theo
   * đồng hồ thật).
   *
   * PHÒNG và LỚP RIÊNG cho mỗi phiên. Hai ràng buộc GiST
   * `ex_exam_session_room_overlap` và `ex_exam_session_class_overlap`
   * loại trừ theo khoảng thời gian, và mọi phiên ở đây đều "đang diễn
   * ra" nên chúng chồng lấn nhau hoàn toàn — dùng chung phòng thì phiên
   * thứ hai trở đi nhận 409.
   */
  async function seedActiveSession(options: { requiredFilenames?: string[] } = {}) {
    windowCursor += 1;
    const suffix = `${windowCursor}_${Date.now()}`;
    const room = { name: `Collect Room ${suffix}` };
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseName, `Nhóm ${suffix}`, teacherId],
    );

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: `Phiên thu bài ${suffix}`,
        classId: klass.id,
        roomName: room.name,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        // Bắt đầu trong quá khứ để agent join được ngay; kết thúc ở
        // tương lai để `isAcceptingUploads` còn mở theo đồng hồ thật.
        startTime: new Date(Date.now() - 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
        requiredFilenames: options.requiredFilenames ?? ['Cau1.docx'],
      });
    expect(created.status).toBe(201);
    return {
      id: created.body.id as string,
      code: created.body.code as string,
      deliverableId: created.body.requiredDeliverables[0].id as string,
      endTime: new Date(created.body.endTime as string),
      classId: klass.id as string,
      roomName: room.name as string,
    };
  }

  /** Đưa phiên vào `collecting` bằng đúng đường thật: lượt quét hết giờ. */
  async function advanceToCollecting(session: { id: string; endTime: Date }) {
    await scheduler.sweep(new Date(session.endTime.getTime() + 1_000));
    expect((await sessionRow(session.id)).status).toBe('collecting');
  }

  function sessionRow(id: string): Promise<{
    status: string;
    completed_at: Date | null;
    completed_by: string | null;
  }> {
    return dataSource
      .query(
        `SELECT status, completed_at, completed_by FROM examcollect.exam_session WHERE id = $1`,
        [id],
      )
      .then((rows) => rows[0]);
  }

  function confirmEnd(id: string, token = teacherToken) {
    return request(app.getHttpServer())
      .post(`/exam-sessions/${id}/confirm-end`)
      .set('Authorization', `Bearer ${token}`);
  }

  /** Agent thật, join thật — cần cho các ca upload. */
  async function joinAgent(
    session: { id: string; code: string },
    mssv: string,
  ): Promise<Socket> {
    // Guard §7.1.1: agent:join từ chối phiên chưa đóng băng danh sách
    // dự thi. Idempotent, và đặt ở đây vì roster được nhập SAU khi tạo
    // phiên — nên nhận cả session object thay vì chỉ mã phiên.
    await openSession(app, teacherToken, session.id);
    const socket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
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

  async function submitFile(
    socket: Socket,
    sessionId: string,
    deliverableId: string,
    mssv: string,
  ): Promise<string> {
    const urlAck = await ack<{ ok: true; uploadUrl: string; storageKey: string }>(
      socket,
      'submission:request-upload-url',
      { examSessionId: sessionId, studentId: mssv, requiredDeliverableId: deliverableId },
    );
    const content = `bai lam cua ${mssv}\n`;
    const put = await fetch(urlAck.uploadUrl, { method: 'PUT', body: content });
    expect(put.ok).toBe(true);

    const confirmAck = await ack<{ ok: true; status: string }>(socket, 'submission:confirm', {
      examSessionId: sessionId,
      studentId: mssv,
      requiredDeliverableId: deliverableId,
      storageKey: urlAck.storageKey,
      checksum: createHash('sha256').update(content).digest('hex'),
      fileSize: Buffer.byteLength(content),
    });
    return confirmAck.status;
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

    const teacher = await makeAccount('collect_gv', 'teacher');
    teacherId = teacher.id;
    teacherToken = teacher.token;
    otherTeacherToken = (await makeAccount('collect_gv_other', 'teacher')).token;

    const course = { name: 'Collect Phase Course' };
    courseName = course.name;
  });

  afterAll(async () => {
    // Server còn handler disconnect phải chạy (attendance ghi một event
    // mỗi agent) — đóng pool ngay sẽ biến một lần chạy xanh thành một
    // bức tường ERROR không nghĩa gì.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await app.close();
  });

  async function enrol(mssv: string, name: string, homeClassId: string) {
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [mssv, name, homeClassId, teacherId],
    );
  }

  it('hết giờ thì scheduler đưa active → collecting, KHÔNG phải completed', async () => {
    const session = await seedActiveSession();

    await scheduler.sweep(new Date(session.endTime.getTime() + 1_000));

    const row = await sessionRow(session.id);
    expect(row.status).toBe('collecting');
    expect(row.completed_at).toBeNull();
    expect(row.completed_by).toBeNull();
  });

  it('exam:finalize vẫn bắn đúng một lần tại thời điểm hết giờ', async () => {
    // Agent nộp bài KHI nhận sự kiện này. Dời nó xuống bước xác nhận sẽ
    // khiến agent chỉ nộp sau khi giảng viên bấm — ngược hẳn ý đồ.
    const session = await seedActiveSession();
    await enrol('SVFIN001', 'Sinh viên finalize', session.classId);
    const socket = await joinAgent(session, 'SVFIN001');
    let fired = 0;
    socket.on('exam:finalize', () => {
      fired += 1;
    });

    await scheduler.sweep(new Date(session.endTime.getTime() + 1_000));
    await new Promise((r) => setTimeout(r, 300));

    expect(fired).toBe(1);
    socket.removeAllListeners();
    socket.disconnect();
  });

  it('trong collecting vẫn nhận upload', async () => {
    // Chống hồi quy `isAcceptingUploads`. Đây là ca mà cả giai đoạn này
    // sinh ra để phục vụ: quên thêm `collecting` vào guard thì mọi file
    // bay về đều bị từ chối.
    const session = await seedActiveSession();
    await enrol('SVUP001', 'Sinh viên upload', session.classId);
    const socket = await joinAgent(session, 'SVUP001');
    await advanceToCollecting(session);

    const status = await submitFile(socket, session.id, session.deliverableId, 'SVUP001');

    expect(status).toBe('collected');
    socket.removeAllListeners();
    socket.disconnect();
  });

  it('trong collecting vẫn chặn xoá đề thi', async () => {
    const session = await seedActiveSession();
    const [material] = await dataSource.query(
      `INSERT INTO examcollect.exam_material (exam_session_id, storage_key, file_name, file_size)
       VALUES ($1, $2, 'de-thi.pdf', 1024) RETURNING id`,
      [session.id, `materials/${session.id}/de-thi.pdf`],
    );
    await advanceToCollecting(session);

    const res = await request(app.getHttpServer())
      .delete(`/exam-sessions/${session.id}/materials/${material.id}`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(403);
  });

  it('"Xác nhận kết thúc" ghi cả completed_at lẫn completed_by', async () => {
    const session = await seedActiveSession();
    await advanceToCollecting(session);

    const res = await confirmEnd(session.id);

    expect(res.status).toBe(200);
    const row = await sessionRow(session.id);
    expect(row.status).toBe('completed');
    expect(row.completed_by).toBe(teacherId);
    expect(row.completed_at).not.toBeNull();

    // Và cả hai phải RA TỚI API, không chỉ nằm trong DB: màn hình phiên
    // đọc đúng cặp này để biết có được xưng "bạn" trong dòng cảnh báo
    // "có bài về sau khi bạn xác nhận" hay không (spec §7.3).
    expect(res.body.completedBy).toBe(teacherId);
    expect(res.body.completedAt).not.toBeNull();
  });

  it('gọi lần hai là no-op và KHÔNG ghi đè completed_at', async () => {
    const session = await seedActiveSession();
    await advanceToCollecting(session);
    await confirmEnd(session.id);
    const first = (await sessionRow(session.id)).completed_at;

    const res = await confirmEnd(session.id);

    expect(res.status).toBe(200);
    expect((await sessionRow(session.id)).completed_at).toEqual(first);
  });

  it('sau xác nhận, trong grace, upload VẪN được nhận', async () => {
    // Pin quyết định (a) ở spec §3.1: nút xác nhận là tín hiệu quy
    // trình, không phải cái khoá. Chặn ở đây là tạo ra một cách làm mất
    // bài của sinh viên mà không ai phát hiện tới lúc chấm.
    const session = await seedActiveSession();
    await enrol('SVLATE01', 'Sinh viên nộp muộn', session.classId);
    const socket = await joinAgent(session, 'SVLATE01');
    await advanceToCollecting(session);
    await confirmEnd(session.id);

    const status = await submitFile(socket, session.id, session.deliverableId, 'SVLATE01');

    expect(status).toBe('collected');
    socket.removeAllListeners();
    socket.disconnect();
  });

  it('giảng viên không bấm thì quét dự phòng đóng phiên với completed_by NULL', async () => {
    const session = await seedActiveSession();
    await advanceToCollecting(session);

    await scheduler.sweepExpiredCollection(
      new Date(session.endTime.getTime() + SUBMISSION_GRACE_PERIOD_MS + 1_000),
    );

    const row = await sessionRow(session.id);
    expect(row.status).toBe('completed');
    expect(row.completed_by).toBeNull();
    expect(row.completed_at).not.toBeNull();
  });

  it('trước endTime + grace thì quét dự phòng KHÔNG đụng tới phiên', async () => {
    const session = await seedActiveSession();
    await advanceToCollecting(session);

    await scheduler.sweepExpiredCollection(new Date(session.endTime.getTime() + 60_000));

    expect((await sessionRow(session.id)).status).toBe('collecting');
  });

  it('thua cuộc đua với scheduler: giảng viên bấm ngay sau vẫn ký được tên', async () => {
    // Spec §4.3. Không có cách "ưu tiên" hai UPDATE đồng thời, nên đường
    // của giảng viên phải nhận được cả phiên mà lượt quét vừa đóng — nếu
    // không, ý định của con người bị một @Interval ghi đè im lặng.
    const session = await seedActiveSession();
    await advanceToCollecting(session);
    await scheduler.sweepExpiredCollection(
      new Date(session.endTime.getTime() + SUBMISSION_GRACE_PERIOD_MS + 1_000),
    );
    expect((await sessionRow(session.id)).completed_by).toBeNull();

    const res = await confirmEnd(session.id);

    expect(res.status).toBe(200);
    expect((await sessionRow(session.id)).completed_by).toBe(teacherId);
  });

  it('nhưng quá cửa sổ grace thì không ký khống được nữa', async () => {
    // Phiên có khung giờ đã trôi qua hẳn — chèn thẳng vì POST
    // /exam-sessions không tạo được phiên trong quá khứ.
    const longAgoStart = new Date(Date.now() - 6 * 3_600_000);
    const longAgoEnd = new Date(Date.now() - 5 * 3_600_000);
    const oldRoom = { name: `Collect Room old ${Date.now()}` };
    const [oldClass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseName, `Nhóm quá hạn ${Date.now()}`, teacherId],
    );
    const [old] = await dataSource.query(
      // semester_name NOT NULL từ 2026-09-11 (§7.1.5). INSERT thô bỏ
      // qua service nên phải tự cấp — giá trị nào cũng được, ca này
      // không kiểm học kỳ.
      `INSERT INTO examcollect.exam_session
         (name, code, class_id, teacher_id, exam_type,
          start_time, end_time, status, semester_name,
          course_name, room_name)
       VALUES ($1, $2, $4, $6, 'TK', $7, $8, 'collecting', 'HK kiểm thử',
               $3, $5) RETURNING id`,
      [
        `Phiên quá hạn ${Date.now()}`,
        `OLD${Date.now()}`.slice(0, 20),
        courseName,
        oldClass.id,
        oldRoom.name,
        teacherId,
        longAgoStart.toISOString(),
        longAgoEnd.toISOString(),
      ],
    );
    await scheduler.sweepExpiredCollection(new Date());
    expect((await sessionRow(old.id)).status).toBe('completed');

    await confirmEnd(old.id);

    expect((await sessionRow(old.id)).completed_by).toBeNull();
  });

  it('chốt bài sớm đưa phiên vào collecting mà quét dự phòng chưa đụng tới', async () => {
    // Spec §9.5: mốc quét theo `endTime` theo lịch, không theo lúc vào
    // `collecting` — cùng công thức với `isAcceptingUploads`.
    const session = await seedActiveSession();

    const finalized = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/finalize`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(finalized.status).toBe(200);
    expect((await sessionRow(session.id)).status).toBe('collecting');

    await scheduler.sweepExpiredCollection(new Date());

    expect((await sessionRow(session.id)).status).toBe('collecting');
  });

  it('confirm-end từ chối giảng viên không phải chủ phiên', async () => {
    const session = await seedActiveSession();
    await advanceToCollecting(session);

    const res = await confirmEnd(session.id, otherTeacherToken);

    expect(res.status).toBe(403);
  });

  it('tạo được phiên mới cùng phòng ngay sau endTime khi phiên cũ đang collecting', async () => {
    // Ràng buộc GiST loại trừ theo `status <> completed AND <> cancelled`,
    // nên phiên `collecting` vẫn nằm trong đó — nhưng khoảng thời gian
    // của nó đã trôi qua, nên không chồng lấn. Spec §4.1.
    const session = await seedActiveSession();
    await advanceToCollecting(session);

    const res = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: `Phiên kế tiếp ${Date.now()}`,
        classId: session.classId,
        roomName: session.roomName,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        startTime: session.endTime.toISOString(),
        endTime: new Date(session.endTime.getTime() + 3_600_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
      });

    expect(res.status).toBe(201);
  });
});
