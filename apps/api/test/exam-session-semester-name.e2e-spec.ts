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

  /** Một kỳ + môn + lớp + phòng RIÊNG cho mỗi ca, để đổi tên kỳ ở ca này
   *  không ảnh hưởng ca khác. */
  async function seedCourseTree() {
    seedCursor += 1;
    const suffix = `${seedCursor}_${Date.now()}`;
    const semesterName = `HK Snapshot ${suffix}`;
    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [semesterName],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Snapshot Course', $2) RETURNING id`,
      [`SN${suffix}`.slice(0, 20), semester.id],
    );
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [course.id, `Nhóm ${suffix}`, teacherId],
    );
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 40) RETURNING id`,
      [`Snapshot Room ${suffix}`],
    );
    return {
      semesterId: semester.id as string,
      semesterName,
      classId: klass.id as string,
      roomId: room.id as string,
    };
  }

  function createSession(tree: { classId: string; roomId: string }) {
    return request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: 'Thi thử snapshot',
        classId: tree.classId,
        roomId: tree.roomId,
        examType: 'CK',
        startTime: new Date(Date.now() + 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
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

  it('KHÔNG đổi theo khi học kỳ bị đổi tên sau đó', async () => {
    // Đây là lý do cột này tồn tại. Bỏ cột đi và join `course → semester`
    // thì ca này đỏ, và bảng điểm của một kỳ đã kết thúc sẽ đổi tên kỳ
    // theo một thao tác hành chính xảy ra hàng tháng sau.
    const tree = await seedCourseTree();
    const created = await createSession(tree);
    expect(created.status).toBe(201);

    const renamed = await request(app.getHttpServer())
      .patch(`/semesters/${tree.semesterId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `${tree.semesterName} (đã đổi tên)` });
    expect(renamed.status).toBe(200);

    const after = await request(app.getHttpServer())
      .get(`/exam-sessions/${created.body.id}`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(after.status).toBe(200);
    expect(after.body.semesterName).toBe(tree.semesterName);
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
