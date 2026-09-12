import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { ExamSessionScheduler } from '../src/exam-session/exam-session.scheduler';
import { createTestAccount } from './helpers/create-account';

/**
 * Đóng băng danh sách dự thi (CLAUDE.md §7.1.1) và cho sự vắng mặt một
 * chỗ ngồi (§7.1.2).
 *
 * Hai giá trị `not_submitted` / `absent`, không phải một — quyết định
 * 2026-09-11, xem spec collecting §8.1. `not_submitted` là sự thật về
 * dữ liệu; `absent` là phán xét học vụ, và chỉ người xác nhận mới được
 * đưa ra.
 */
describe('Đóng băng danh sách dự thi (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let scheduler: ExamSessionScheduler;
  let baseUrl: string;

  let teacherToken: string;
  let teacherId: string;
  let otherTeacherToken: string;

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

  interface Seeded {
    id: string;
    code: string;
    classId: string;
    courseId: string;
    endTime: Date;
    deliverableIds: string[];
    students: string[];
  }

  /** Phiên đang diễn ra, roster đã nhập, CHƯA mở (chưa đóng băng). */
  async function seedSession(options: { students: number; deliverables?: string[] } = { students: 2 }): Promise<Seeded> {
    seedCursor += 1;
    const suffix = `${seedCursor}_${Date.now()}`;
    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`HK Freeze ${suffix}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Freeze Course', $2) RETURNING id`,
      [`FZ${suffix}`.slice(0, 20), semester.id],
    );
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [course.id, `Nhóm ${suffix}`, teacherId],
    );
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 40) RETURNING id`,
      [`Freeze Room ${suffix}`],
    );

    const students: string[] = [];
    for (let i = 1; i <= options.students; i++) {
      const mssv = `FZ${seedCursor}X${i}${Date.now() % 100000}`.slice(0, 20);
      students.push(mssv);
      await dataSource.query(
        `INSERT INTO examcollect.enrollment
           (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [mssv, `Sinh viên ${i} của ${suffix}`, course.id, klass.id, teacherId],
      );
    }

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: `Phiên đóng băng ${suffix}`,
        classId: klass.id,
        roomId: room.id,
        examType: 'TK',
        startTime: new Date(Date.now() - 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
        requiredFilenames: options.deliverables ?? ['Cau1.docx'],
      });
    expect(created.status).toBe(201);

    return {
      id: created.body.id as string,
      code: created.body.code as string,
      classId: klass.id as string,
      courseId: course.id as string,
      endTime: new Date(created.body.endTime as string),
      deliverableIds: (created.body.requiredDeliverables as Array<{ id: string }>).map((d) => d.id),
      students,
    };
  }

  function open(id: string, token = teacherToken) {
    return request(app.getHttpServer())
      .post(`/exam-sessions/${id}/open`)
      .set('Authorization', `Bearer ${token}`);
  }

  function rosterRows(examSessionId: string) {
    return dataSource.query(
      `SELECT student_mssv, student_name, home_class_id, home_teacher_id, source
         FROM examcollect.session_roster
        WHERE exam_session_id = $1
        ORDER BY source, student_mssv`,
      [examSessionId],
    );
  }

  function submissionRows(examSessionId: string) {
    return dataSource.query(
      `SELECT student_mssv, status FROM examcollect.submission
        WHERE exam_session_id = $1 ORDER BY student_mssv`,
      [examSessionId],
    );
  }

  async function joinAgent(session: Seeded, mssv: string): Promise<Socket> {
    const socket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
    openSockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    return new Promise<Socket>((resolve, reject) => {
      socket.on('agent:join:ack', () => resolve(socket));
      socket.on('agent:join:error', (e) => reject(new Error(JSON.stringify(e))));
      socket.emit('agent:join', { fullName: 'ignored', studentId: mssv, sessionCode: session.code });
    });
  }

  /** Lỗi join, thay vì ack — cho ca guard tạm. */
  function joinExpectingError(session: Seeded, mssv: string): Promise<{ code: string; message: string }> {
    const socket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
    openSockets.push(socket);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('không nhận được agent:join:error')), 10_000);
      socket.on('connect', () => {
        socket.emit('agent:join', { fullName: 'ignored', studentId: mssv, sessionCode: session.code });
      });
      socket.on('agent:join:error', (error: { code: string; message: string }) => {
        clearTimeout(timer);
        resolve(error);
      });
      socket.on('agent:join:ack', () => {
        clearTimeout(timer);
        reject(new Error('join lẽ ra phải bị từ chối'));
      });
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
    const teacher = await makeAccount('freeze_gv');
    teacherId = teacher.id;
    teacherToken = teacher.token;
    otherTeacherToken = (await makeAccount('freeze_gv_other')).token;
  });

  afterAll(async () => {
    for (const socket of openSockets) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    await app.close();
  });

  it('chép roster lớp vào ảnh chốt và gieo một dòng chưa nộp cho mỗi (sinh viên × file)', async () => {
    const session = await seedSession({ students: 3, deliverables: ['Cau1.docx', 'Cau2.docx'] });

    const res = await open(session.id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ students: 3, submissionsSeeded: 6 });

    const frozen = await rosterRows(session.id);
    expect(frozen).toHaveLength(3);
    expect(frozen.every((r: { source: string }) => r.source === 'frozen')).toBe(true);
    expect(frozen.every((r: { home_class_id: string }) => r.home_class_id === session.classId)).toBe(true);

    const seeded = await submissionRows(session.id);
    expect(seeded).toHaveLength(6);
    // `not_submitted`, KHÔNG phải `absent`: chưa ai xác nhận gì cả. Gieo
    // phán xét ở đây nghĩa là bảng điểm xuất ngay sau đó ghi cả lớp vắng thi.
    expect(seeded.every((r: { status: string }) => r.status === 'not_submitted')).toBe(true);
  });

  it('miễn nhiễm với sửa roster sau khi đã chốt', async () => {
    const session = await seedSession({ students: 2 });
    await open(session.id);

    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [`FZLATE${Date.now() % 100000}`, 'Nguyễn Văn Muộn', session.courseId, session.classId, teacherId],
    );

    // 2, KHÔNG phải 3. Đây là toàn bộ lý do bảng này tồn tại.
    expect(await rosterRows(session.id)).toHaveLength(2);
  });

  it('bấm mở hai lần không nhân đôi ảnh chốt', async () => {
    const session = await seedSession({ students: 2 });
    await open(session.id);

    const second = await open(session.id);

    expect(second.status).toBe(200);
    // Chốt lại nghĩa là ảnh chốt đi theo roster hiện tại — tức mất đúng
    // tính chất khiến nó có giá trị.
    expect(second.body).toMatchObject({ students: 2, submissionsSeeded: 0 });
    expect(await rosterRows(session.id)).toHaveLength(2);
  });

  it('thêm tay tại phiên thi vẫn được, và đọc ra được là thêm tay', async () => {
    // Đường thoát hiểm §5.8, mà §7.1.1 đánh dấu "bắt buộc giữ": đóng băng
    // mà chặn luôn đường này thì một sinh viên đăng ký muộn hợp lệ không
    // thi được.
    const session = await seedSession({ students: 1 });
    await open(session.id);

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/roster/students`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ mssv: `FZMAN${Date.now() % 100000}`, name: 'Trần Thị Đăng Muộn' });

    expect(res.status).toBe(201);
    const frozen = await rosterRows(session.id);
    expect(frozen.map((r: { source: string }) => r.source)).toEqual(['frozen', 'manual']);
  });

  it('thêm tay cũng GIEO chỗ ngồi, không chỉ ghi ảnh chốt', async () => {
    // Lỗ hổng §7.1.2 quay lại bằng cửa sau. Trước sửa này, `addManually`
    // chỉ ghi `session_roster`; em được thêm tay rồi KHÔNG nộp gì sẽ
    // không có dòng submission nào — nên `markAbsentees` không đụng tới,
    // bảng điểm không có em, và mọi phép đếm bỏ qua em. Không phải "sai
    // điểm", mà là "không tồn tại".
    const session = await seedSession({ students: 1, deliverables: ['Cau1.docx', 'Cau2.docx'] });
    await open(session.id);
    const mssv = `FZSEAT${Date.now() % 100000}`;

    await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/roster/students`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ mssv, name: 'Lê Thị Thêm Tay' })
      .expect(201);

    const seats = (await submissionRows(session.id)).filter(
      (r: { student_mssv: string }) => r.student_mssv.toLowerCase() === mssv.toLowerCase(),
    );
    // Một dòng cho MỖI file bắt buộc — cùng hình dạng như đường đóng băng.
    expect(seats).toHaveLength(2);
    expect(seats.every((r: { status: string }) => r.status === 'not_submitted')).toBe(true);
  });

  it('em thêm tay rồi không nộp gì bị kết luận VẮNG THI, không biến mất', async () => {
    // Hệ quả thật của test trên, đo ở đầu ra thay vì ở bảng: đây mới là
    // điều người dùng thấy.
    const session = await seedSession({ students: 1 });
    await open(session.id);
    const mssv = `FZABS${Date.now() % 100000}`;
    await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/roster/students`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ mssv, name: 'Phạm Văn Không Đến' })
      .expect(201);

    await scheduler.sweep(new Date(session.endTime.getTime() + 1_000));
    await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/confirm-end`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    const rows = (await submissionRows(session.id)).filter(
      (r: { student_mssv: string }) => r.student_mssv.toLowerCase() === mssv.toLowerCase(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('absent');
  });

  it('thêm tay KHÔNG kéo ngược dòng của em đã nộp về chưa nộp', async () => {
    // `ON CONFLICT DO NOTHING` là thứ làm việc gieo dùng được ở giữa
    // buổi thi. Thêm tay một em đã có dòng `collected` mà ghi đè thành
    // `not_submitted` sẽ XOÁ một bài nộp thật khỏi bảng điểm.
    const session = await seedSession({ students: 1 });
    await open(session.id);
    const mssv = session.students[0];
    await dataSource.query(
      `UPDATE examcollect.submission SET status = 'received'
         WHERE exam_session_id = $1 AND student_mssv = $2 AND required_deliverable_id = $3`,
      [session.id, mssv, session.deliverableIds[0]],
    );

    // Trùng MSSV nên route trả 409 — nhưng điều cần khẳng định là dòng
    // submission KHÔNG bị đụng vào.
    await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/roster/students`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ mssv, name: 'Trùng người đã nộp' })
      .expect(409);

    const rows = await submissionRows(session.id);
    expect(rows.find((r: { student_mssv: string }) => r.student_mssv.toLowerCase() === mssv.toLowerCase())?.status).toBe(
      'received',
    );
  });

  it('giảng viên không phải chủ phiên không thêm được người vào ảnh chốt', async () => {
    // `session_roster` là chứng từ trả lời "ai đáng lẽ có mặt", và nó
    // chứa MSSV + họ tên — dữ liệu cá nhân của người thứ ba. Owner-only,
    // không phải teacher-only.
    const session = await seedSession({ students: 1 });
    await open(session.id);

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/roster/students`)
      .set('Authorization', `Bearer ${otherTeacherToken}`)
      .send({ mssv: `FZ403${Date.now() % 100000}`, name: 'Người ngoài' });

    expect(res.status).toBe(403);
    expect(await rosterRows(session.id)).toHaveLength(1);
  });

  it('thêm tay trùng MSSV trả 409, không phải lỗi DB thô', async () => {
    const session = await seedSession({ students: 1 });
    await open(session.id);

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/roster/students`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ mssv: session.students[0], name: 'Trùng người đã có' });

    expect(res.status).toBe(409);
  });

  it('không thêm tay được nữa sau khi phiên đã chốt', async () => {
    // Cùng nguyên tắc route "Thu lại" đã đặt (spec §6.5): gửi lệnh cho
    // một buổi thi đã đóng chỉ tạo kỳ vọng sai.
    const session = await seedSession({ students: 1 });
    await open(session.id);
    await scheduler.sweep(new Date(session.endTime.getTime() + 1_000));
    await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/confirm-end`)
      .set('Authorization', `Bearer ${teacherToken}`);

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/roster/students`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ mssv: `FZL8${Date.now() % 100000}`, name: 'Quá muộn' });

    expect(res.status).toBe(409);
  });

  it('lớp chưa có sinh viên nào thì từ chối mở, nói rõ phải làm gì', async () => {
    const session = await seedSession({ students: 0 });

    const res = await open(session.id);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/roster|danh sách/i);
  });

  it('giảng viên không phải chủ phiên không mở được', async () => {
    const session = await seedSession({ students: 1 });

    expect((await open(session.id, otherTeacherToken)).status).toBe(403);
  });

  describe('guard tạm — chưa mở phiên thì không ai vào được', () => {
    it('agent:join bị từ chối khi ảnh chốt còn rỗng, kèm việc cần làm', async () => {
      // Guard TẠM THỜI cho tới khi `scheduled` thành trạng thái thật
      // (CLAUDE.md §7.1.1b). Nó hỏng TO và SỚM — cả phòng bị chặn ở giây
      // đầu, giảng viên bấm một nút là xong — thay vì hỏng nhỏ và muộn,
      // tức một ảnh chốt thiếu người chỉ lộ ra lúc chấm.
      const session = await seedSession({ students: 1 });

      const error = await joinExpectingError(session, session.students[0]);

      expect(error.code).toBe('SESSION_NOT_OPEN');
      expect(error.message).toMatch(/Mở phiên thi/);
    });

    it('mở phiên xong thì vào được', async () => {
      const session = await seedSession({ students: 1 });
      await open(session.id);

      const socket = await joinAgent(session, session.students[0]);

      expect(socket.connected).toBe(true);
    });
  });

  describe('"Xác nhận kết thúc" mới được kết luận vắng thi', () => {
    it('giảng viên xác nhận → chưa nộp thành vắng thi', async () => {
      const session = await seedSession({ students: 2 });
      await open(session.id);
      await scheduler.sweep(new Date(session.endTime.getTime() + 1_000));

      const res = await request(app.getHttpServer())
        .post(`/exam-sessions/${session.id}/confirm-end`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(200);
      const rows = await submissionRows(session.id);
      expect(rows.every((r: { status: string }) => r.status === 'absent')).toBe(true);
    });

    it('quét dự phòng đóng phiên → GIỮ NGUYÊN chưa nộp', async () => {
      // Hợp đồng §8.1. Một `@Interval` 30 giây không phải thứ được phép
      // tuyên bố một sinh viên vắng thi. `not_submitted` tồn dư ở đây là
      // dữ liệu ĐÚNG, mang nghĩa "không ai xác nhận buổi thi này".
      const session = await seedSession({ students: 2 });
      await open(session.id);
      await scheduler.sweep(new Date(session.endTime.getTime() + 1_000));

      await scheduler.sweepExpiredCollection(
        new Date(session.endTime.getTime() + 31 * 60_000),
      );

      const [row] = await dataSource.query(
        `SELECT status, completed_by FROM examcollect.exam_session WHERE id = $1`,
        [session.id],
      );
      expect(row.status).toBe('completed');
      expect(row.completed_by).toBeNull();
      const rows = await submissionRows(session.id);
      expect(rows.every((r: { status: string }) => r.status === 'not_submitted')).toBe(true);
    });
  });
});
