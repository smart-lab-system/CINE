import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Bộ lọc kỳ trên danh sách lớp của giảng viên (CLAUDE.md §7.2.3).
 *
 * `semesterId` **hẹp thêm** phạm vi đã bị owner-scope chặn, không thay thế
 * nó — điều đó là phần quan trọng nhất ở đây: một `orWhere` đặt sai chỗ sẽ
 * biến bộ lọc thành đường mở ra lớp của giảng viên khác.
 *
 * Và theo §1.2, học kỳ ở đây là tham số lọc chứ không phải trạng thái:
 * vắng `semesterId` là "tất cả học kỳ", không phải lỗi. Không có ca nào
 * trong spec này mà hệ thống TỪ CHỐI một thao tác vì lý do học kỳ.
 */
describe('GET /classes/teaching?semesterId= (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let teacherToken: string;
  let teacherId: string;
  let otherToken: string;

  let semesterA: string;
  let semesterB: string;
  let classInA: string;
  let classInB: string;
  let otherTeacherClassInA: string;

  const PASSWORD = 'correct-horse-battery';

  async function makeAccount(prefix: string, role: 'teacher') {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const id = await createTestAccount(dataSource, { email, password: PASSWORD, role });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD });
    return { id, token: login.body.accessToken as string };
  }

  async function seedSemesterWithClass(label: string, ownerId: string) {
    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Filter Semester ${label} ${Date.now()}_${Math.random().toString(36).slice(2, 7)}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [
        `FL${label}${Date.now()}`.slice(0, 20),
        `Môn kỳ ${label}`,
        semester.id,
      ],
    );
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [course.id, `Nhóm kỳ ${label}`, ownerId],
    );
    return { semesterId: semester.id as string, classId: klass.id as string };
  }

  function teachingClasses(token: string, semesterId?: string) {
    const url = semesterId
      ? `/classes/teaching?semesterId=${semesterId}`
      : '/classes/teaching';
    return request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    const teacher = await makeAccount('filter_gv', 'teacher');
    teacherId = teacher.id;
    teacherToken = teacher.token;
    const other = await makeAccount('filter_gv_other', 'teacher');
    otherToken = other.token;

    const a = await seedSemesterWithClass('A', teacherId);
    semesterA = a.semesterId;
    classInA = a.classId;

    const b = await seedSemesterWithClass('B', teacherId);
    semesterB = b.semesterId;
    classInB = b.classId;

    // Lớp của giảng viên KHÁC, trong CÙNG kỳ A — đây là hàng mà một bộ
    // lọc viết sai (OR thay vì AND) sẽ để lọt ra.
    const [course] = await dataSource.query(
      `SELECT id FROM examcollect.course WHERE semester_id = $1 LIMIT 1`,
      [semesterA],
    );
    const [foreign] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [course.id, `Nhóm của người khác ${Date.now()}`, other.id],
    );
    otherTeacherClassInA = foreign.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('narrows to the classes whose course is in the given semester', async () => {
    const response = await teachingClasses(teacherToken, semesterA);

    expect(response.status).toBe(200);
    const ids = response.body.map((c: { id: string }) => c.id);
    expect(ids).toContain(classInA);
    expect(ids).not.toContain(classInB);
  });

  it('still hides another teacher\'s class in that same semester', async () => {
    const response = await teachingClasses(teacherToken, semesterA);

    // Bộ lọc AND vào owner-scope, không thay thế nó. Nếu hàng này lọt ra,
    // bộ lọc đã trở thành một lỗ phân quyền, không phải một tiện ích.
    expect(response.body.map((c: { id: string }) => c.id)).not.toContain(otherTeacherClassInA);
  });

  it('returns every semester when semesterId is absent — unchanged behaviour', async () => {
    const response = await teachingClasses(teacherToken);

    expect(response.status).toBe(200);
    const ids = response.body.map((c: { id: string }) => c.id);
    expect(ids).toContain(classInA);
    expect(ids).toContain(classInB);
  });

  it('returns an empty list, not an error, for a semester the teacher has nothing in', async () => {
    const [empty] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Filter Semester Empty ${Date.now()}`],
    );

    const response = await teachingClasses(teacherToken, empty.id);

    // §1.2: học kỳ không bao giờ là lý do để từ chối một thao tác. Kỳ
    // không có lớp nào là một câu trả lời, không phải một lỗi.
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('rejects a malformed semesterId with 400 rather than ignoring it', async () => {
    const response = await request(app.getHttpServer())
      .get('/classes/teaching?semesterId=khong-phai-uuid')
      .set('Authorization', `Bearer ${teacherToken}`);

    // Bỏ qua âm thầm sẽ trả về TẤT CẢ các kỳ trong khi người dùng tin là
    // đang xem một kỳ — sai mà không có dấu hiệu nào.
    expect(response.status).toBe(400);
  });

  it('scopes to the caller, not to the filter — the other teacher sees only their own', async () => {
    const response = await teachingClasses(otherToken, semesterA);

    expect(response.status).toBe(200);
    const ids = response.body.map((c: { id: string }) => c.id);
    expect(ids).toContain(otherTeacherClassInA);
    expect(ids).not.toContain(classInA);
  });
});
