import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * `exam_session.semester_name` — ảnh chụp học kỳ lúc tạo phiên
 * (CLAUDE.md §7.1.5).
 *
 * Vì sao không join `course → semester` mỗi lần cần: bảng điểm phải tự
 * khai được nó thuộc kỳ nào, độc lập với mọi thay đổi sau đó. Test thứ
 * hai là toàn bộ lý do cột này tồn tại — nếu nó xanh cả khi bỏ cột đi
 * thì cột đó không cần thiết.
 *
 * Tên cột là `semester_name`, KHÔNG phải `semester_code` như plan bản
 * gốc: bảng `semester` không có cột `code` nào — chỉ `name`,
 * `start_date`, `end_date` — nên `_code` sẽ là tên sai cho một giá trị
 * bất biến.
 */
describe('exam_session.semester_name snapshot (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let teacherToken: string;
  let teacherId: string;
  let adminToken: string;

  const PASSWORD = 'correct-horse-battery';
  let seedCursor = 0;

  async function makeAccount(prefix: string, role: 'teacher' | 'admin') {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const id = await createTestAccount(dataSource, { email, password: PASSWORD, role });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD });
    return { id, token: login.body.accessToken as string };
  }

  /** Một lớp + tên môn/phòng/kỳ RIÊNG cho mỗi ca, để hai ca không giẫm
   *  lên nhau. Không còn bảng nào để dựng: ba cái tên chỉ là chuỗi. */
  async function seedCourseTree() {
    seedCursor += 1;
    const suffix = `${seedCursor}_${Date.now()}`;
    const semesterName = `HK Snapshot ${suffix}`;
    const course = { name: 'Snapshot Course' };
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [course.name, `Nhóm ${suffix}`, teacherId],
    );
    const room = { name: `Snapshot Room ${suffix}` };
    return {
      semesterName,
      classId: klass.id as string,
      roomName: room.name as string,
    };
  }

  // Mỗi phiên một khung giờ riêng: hai phiên CÙNG LỚP chồng giờ nhau bị
  // `ex_exam_session_class_overlap` chặn bằng 409, và ca "hai phiên khai
  // hai học kỳ" cần đúng hai phiên cùng lớp.
  let windowCursor = 0;

  function createSession(tree: {
    classId: string;
    roomName: string;
    semesterName: string;
  }) {
    windowCursor += 1;
    const start = Date.now() + windowCursor * 3 * 3_600_000;
    return request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: 'Thi thử snapshot',
        classId: tree.classId,
        roomName: tree.roomName,
        semesterName: tree.semesterName,
        examType: 'CK',
        startTime: new Date(start).toISOString(),
        endTime: new Date(start + 3_600_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
      });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const teacher = await makeAccount('snapshot_gv', 'teacher');
    teacherId = teacher.id;
    teacherToken = teacher.token;
    adminToken = (await makeAccount('snapshot_admin', 'admin')).token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('chụp tên học kỳ vào lúc tạo phiên', async () => {
    const tree = await seedCourseTree();

    const res = await createSession(tree);

    expect(res.status).toBe(201);
    expect(res.body.semesterName).toBe(tree.semesterName);
  });

  it('học kỳ thuộc về PHIÊN, nên hai phiên cùng lớp khai khác nhau được', async () => {
    // Ca này TỪNG đổi tên một hàng trong bảng `semester` rồi khẳng định
    // bản chụp không đổi theo. Bảng đó không còn, nên ca ấy không viết
    // được nữa — nhưng tính chất mà nó bảo vệ thì còn nguyên và quan
    // trọng hơn trước: giá trị này KHÔNG suy ra từ đâu cả, nó là thứ
    // giảng viên khai cho đúng phiên đó.
    const tree = await seedCourseTree();
    const first = await createSession(tree);
    expect(first.status).toBe(201);

    const second = await createSession({
      ...tree,
      semesterName: `${tree.semesterName} (kỳ sau)`,
    });
    expect(second.status).toBe(201);

    expect(first.body.semesterName).toBe(tree.semesterName);
    expect(second.body.semesterName).toBe(`${tree.semesterName} (kỳ sau)`);
  });

  it('cột không ghi đè được, kể cả khi save() mang giá trị khác', async () => {
    // `{ update: false }` ở tầng TypeORM. JSDoc "KHÔNG BAO GIỜ sửa" chỉ là
    // lời hứa; khi một cột kỳ bị ghi đè thì bảng điểm chỉ đơn giản ghi
    // sai kỳ, vĩnh viễn, và không có triệu chứng nào để ai phát hiện.
    const tree = await seedCourseTree();
    const created = await createSession(tree);
    const id = created.body.id as string;

    const repo = dataSource.getRepository('ExamSessionEntity');
    await repo.save({ id, semesterName: 'KỲ BỊ GHI ĐÈ', name: 'Tên mới' });

    const [row] = await dataSource.query(
      `SELECT semester_name, name FROM examcollect.exam_session WHERE id = $1`,
      [id],
    );
    expect(row.semester_name).toBe(tree.semesterName);
    // Cột thường vẫn ghi được — nếu ca này cũng không đổi thì test trên
    // xanh vì save() không chạy, chứ không phải vì cột được bảo vệ.
    expect(row.name).toBe('Tên mới');
  });
});
