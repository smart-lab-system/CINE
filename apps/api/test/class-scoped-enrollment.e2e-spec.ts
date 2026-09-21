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
 * Xác thực vào thi chạy ở mức LỚP, không còn ở mức MÔN.
 *
 * Đây là thay đổi hành vi THẤY ĐƯỢC của đợt thu hẹp master data, và nó đi
 * theo chiều CHẶT HƠN. Trước: `enrollment` khoá theo môn, nên một sinh viên
 * của lớp khác cùng môn vào thẳng được — cố ý, để ca thi bù không cần xử lý
 * riêng. Sau: bảng `course` biến mất, chỗ neo ấy mất theo, và em đó đi qua
 * luồng XIN PHÉP kèm lý do (đã có sẵn, đã ghi ai duyệt và vì sao).
 *
 * Bộ test này tồn tại để chiều mới là một LỰA CHỌN có người ký tên, không
 * phải một hồi quy mà ai đó "sửa" lại vào tháng sau.
 */
describe('Enrollment khoá theo lớp (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;

  let token: string;
  let teacherId: string;
  let courseName: string;
  let classAId: string;
  let classBId: string;
  let sessionId: string;
  let sessionCode: string;

  const stamp = Date.now().toString(36);
  const IN_CLASS = `CA${stamp}`.slice(0, 20);
  const OTHER_CLASS = `CB${stamp}`.slice(0, 20);

  const sockets: Socket[] = [];

  function connect(): Socket {
    const socket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
    sockets.push(socket);
    return socket;
  }

  /** Resolves with whichever of ack / error arrives first. */
  function join(socket: Socket, payload: unknown): Promise<{ event: string; body: unknown }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no reply to agent:join')), 10_000);
      const settle = (event: string) => (body: unknown) => {
        clearTimeout(timer);
        resolve({ event, body });
      };
      socket.on('agent:join:ack', settle('ack'));
      socket.on('agent:join:error', settle('error'));
      socket.on('connect', () => socket.emit('agent:join', payload));
    });
  }

  async function enroll(mssv: string, name: string, homeClassId: string) {
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4)`,
      [mssv, name, homeClassId, teacherId],
    );
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.listen(0);
    baseUrl = await app.getUrl();
    dataSource = app.get(DataSource);

    const email = `class_scope_${stamp}@example.com`;
    teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    token = login.body.accessToken;

    const course = { name: 'Mon khoa theo lop' };
    courseName = course.name;
    const room = { name: `Class Scope Room ${stamp}` };

    // Hai lớp CÙNG MỘT MÔN. Đó là toàn bộ điểm của bộ test: dưới luật cũ
    // hai lớp này không phân biệt được với nhau ở cổng vào.
    const [classA] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseName, `Nhom A ${stamp}`, teacherId],
    );
    classAId = classA.id;
    const [classB] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseName, `Nhom B ${stamp}`, teacherId],
    );
    classBId = classB.id;

    await enroll(IN_CLASS, 'Sinh vien lop A', classAId);
    await enroll(OTHER_CLASS, 'Sinh vien lop B', classBId);

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Phien khoa theo lop ${stamp}`,
        classId: classAId,
        roomName: room.name,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        startTime: new Date(Date.now() - 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(created.status).toBe(201);
    sessionId = created.body.id;
    sessionCode = created.body.code;
    await openSession(app, token, sessionId);
  }, 60_000);

  afterAll(async () => {
    for (const socket of sockets) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    // Handlers phía server còn phải chạy nốt (attendance ghi một event mỗi
    // agent). Đóng pool ngay sẽ biến một lượt xanh thành một tường ERROR.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await app.close();
  });

  it('T-RW-2: đóng băng danh sách dự thi chỉ lấy sinh viên LỚP của phiên', async () => {
    const frozen = await dataSource.query(
      `SELECT student_mssv FROM examcollect.session_roster
        WHERE exam_session_id = $1 ORDER BY student_mssv`,
      [sessionId],
    );

    const mssvs = frozen.map((row: { student_mssv: string }) => row.student_mssv);
    expect(mssvs).toContain(IN_CLASS);
    // Dưới luật cũ (enrollment khoá theo môn) em lớp B cũng bị chụp vào đây,
    // và ảnh chốt của lớp A đếm cả người không thuộc lớp A.
    expect(mssvs).not.toContain(OTHER_CLASS);
  });

  it('T-RW-3: sinh viên đúng lớp vào được', async () => {
    const reply = await join(connect(), {
      fullName: 'Bat ky ten nao',
      studentId: IN_CLASS,
      sessionCode,
    });

    expect(reply.event).toBe('ack');
  });

  it('T-RW-3: sinh viên lớp khác CÙNG MÔN bị từ chối — đi đường xin phép', async () => {
    const reply = await join(connect(), {
      fullName: 'Sinh vien lop B',
      studentId: OTHER_CLASS,
      sessionCode,
    });

    // Chiều này NGƯỢC với trước đợt thu hẹp master data. Xem docblock đầu
    // file: em vẫn thi được, nhưng qua `agent:request-access` có lý do và
    // có người duyệt, chứ không vào thẳng.
    expect(reply.event).toBe('error');
    expect((reply.body as { code: string }).code).toBe('NOT_ENROLLED');
  });

  it('T-RW-4: đường nối "thu lại" đi qua LỚP, không qua môn', async () => {
    // `RecollectService.findMissing` nối `enrollment` với `exam_session` qua
    // `home_class_id = class_id`. Nối sai khoá thì danh sách rỗng và giảng
    // viên bấm "thu lại" mà không máy nào nhận được lệnh — một lỗi im lặng,
    // nên nó đáng một khẳng định riêng.
    const rows = await dataSource.query(
      `SELECT e.student_mssv
         FROM examcollect.exam_session s
         JOIN examcollect.enrollment e ON e.home_class_id = s.class_id
        WHERE s.id = $1`,
      [sessionId],
    );

    const mssvs = rows.map((row: { student_mssv: string }) => row.student_mssv);
    expect(mssvs).toContain(IN_CLASS);
    expect(mssvs).not.toContain(OTHER_CLASS);
  });

  it('thêm tay lấy lớp gốc trong ĐÚNG MÔN của phiên, không lấy môn khác', async () => {
    // Khoá duy nhất của enrollment giờ là (home_class_id, student_mssv), nên
    // một sinh viên có NHIỀU dòng — mỗi lớp một dòng, kể cả khác môn. Câu tra
    // "lớp gốc của em" mà không giới hạn theo môn sẽ trả về dòng nào tuỳ thứ
    // tự DB, và bài của em bị định tuyến về một giảng viên chưa từng dạy môn
    // này. Trước đợt thu hẹp master data phép tra đó khoá theo `course_id`.
    const [otherTeacherEmail, otherCourse] = [
      `class_scope_other_${stamp}@example.com`,
      `Mon hoan toan khac ${stamp}`,
    ];
    const otherTeacherId = await createTestAccount(dataSource, {
      email: otherTeacherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const [foreignClass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [otherCourse, `Nhom mon khac ${stamp}`, otherTeacherId],
    );

    // Em này thuộc lớp B (cùng môn với phiên) VÀ một lớp của môn khác.
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4)`,
      [OTHER_CLASS, 'Sinh vien lop B', foreignClass.id, otherTeacherId],
    );

    const added = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/roster/students`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mssv: OTHER_CLASS, name: 'Sinh vien lop B' });
    expect(added.status).toBe(201);

    const [row] = await dataSource.query(
      `SELECT home_class_id, home_teacher_id FROM examcollect.session_roster
        WHERE exam_session_id = $1 AND student_mssv = $2`,
      [sessionId, OTHER_CLASS],
    );
    // Lớp B — cùng môn với phiên — chứ KHÔNG phải lớp của môn kia.
    expect(row.home_class_id).toBe(classBId);
    expect(row.home_teacher_id).toBe(teacherId);
  });
});
