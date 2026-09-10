import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Import Excel cho `Class` (CLAUDE.md §7.2.1).
 *
 * 50-150 lớp mỗi khoa mỗi kỳ không phải quy mô nhập tay. `Course` được
 * upsert như tác dụng phụ — Trưởng khoa vẫn là người bấm, không đụng phân
 * quyền hiện có, không thêm role.
 *
 * Hai quyết định thiết kế mà spec này khoá lại:
 *
 * 1. **Học kỳ hỏi đúng MỘT lần cho cả batch**, không phải mỗi dòng. Theo
 *    §3.2 chỉ có đúng một nơi hỏi "học kỳ nào" là form tạo `Course` — và
 *    ở đây màn import CHÍNH LÀ form tạo `Course`.
 * 2. **Một dòng lỗi KHÔNG chặn cả batch** — khác `RosterService.importForClass`,
 *    nơi một dòng lỗi chặn tất cả. Lý do khác nhau có chủ đích, xem doc
 *    comment của `importForHead`.
 */
describe('POST /classes/import (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let headToken: string;
  let headId: string;
  let otherHeadToken: string;
  let teacherToken: string;
  let semesterId: string;

  const PASSWORD = 'correct-horse-battery';
  let codeCursor = 0;

  async function makeAccount(prefix: string, role: 'teacher' | 'department_admin') {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const id = await createTestAccount(dataSource, { email, password: PASSWORD, role });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD });
    return { id, email, token: login.body.accessToken as string };
  }

  function freshCode() {
    codeCursor += 1;
    return `IM${codeCursor}${Date.now()}`.slice(0, 20);
  }

  function importRows(
    token: string,
    body: { semesterId: string; rows: unknown[] },
  ) {
    return request(app.getHttpServer())
      .post('/classes/import')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    const head = await makeAccount('import_head', 'department_admin');
    headId = head.id;
    headToken = head.token;
    otherHeadToken = (await makeAccount('import_other_head', 'department_admin')).token;
    teacherToken = (await makeAccount('import_gv_role', 'teacher')).token;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Import Semester ${Date.now()}`],
    );
    semesterId = semester.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates the course and the class, resolving the teacher by email', async () => {
    const teacher = await makeAccount('import_gv1', 'teacher');
    const code = freshCode();

    const response = await importRows(headToken, {
      semesterId,
      rows: [
        {
          courseCode: code,
          courseName: 'Nhập môn lập trình',
          className: 'Nhóm 01',
          teacherEmail: teacher.email,
        },
      ],
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      coursesCreated: 1,
      classesCreated: 1,
      classesUpdated: 0,
      errors: [],
    });

    const [course] = await dataSource.query(
      `SELECT department_head_id FROM examcollect.course WHERE code = $1 AND semester_id = $2`,
      [code, semesterId],
    );
    // Chủ môn LUÔN là người bấm import, không bao giờ lấy từ file — cùng
    // lý do `createForHead` không đọc `departmentHeadId` từ body.
    expect(course.department_head_id).toBe(headId);
  });

  it('reuses an existing course in the same semester instead of duplicating it', async () => {
    const teacherA = await makeAccount('import_gv_a', 'teacher');
    const teacherB = await makeAccount('import_gv_b', 'teacher');
    const code = freshCode();

    await importRows(headToken, {
      semesterId,
      rows: [
        { courseCode: code, courseName: 'Cấu trúc dữ liệu', className: 'Nhóm 01', teacherEmail: teacherA.email },
      ],
    });

    const second = await importRows(headToken, {
      semesterId,
      rows: [
        { courseCode: code, courseName: 'Cấu trúc dữ liệu', className: 'Nhóm 02', teacherEmail: teacherB.email },
      ],
    });

    expect(second.body).toMatchObject({
      coursesCreated: 0,
      classesCreated: 1,
      classesUpdated: 0,
      errors: [],
    });
  });

  it('creates both classes when one file lists two groups of the same course', async () => {
    const teacher = await makeAccount('import_gv_two', 'teacher');
    const code = freshCode();

    const response = await importRows(headToken, {
      semesterId,
      rows: [
        { courseCode: code, courseName: 'Giải tích', className: 'Nhóm 01', teacherEmail: teacher.email },
        { courseCode: code, courseName: 'Giải tích', className: 'Nhóm 02', teacherEmail: teacher.email },
      ],
    });

    // Môn được tạo ở dòng 1 phải được dòng 2 nhìn thấy — nếu hai dòng cùng
    // tạo môn, `uq_course_code_semester` sẽ nổ ở dòng thứ hai.
    expect(response.body).toMatchObject({
      coursesCreated: 1,
      classesCreated: 2,
      errors: [],
    });
  });

  it('re-importing the same file changes nothing and reports it as updated', async () => {
    const teacher = await makeAccount('import_gv_idem', 'teacher');
    const code = freshCode();
    const rows = [
      { courseCode: code, courseName: 'Vật lý', className: 'Nhóm 01', teacherEmail: teacher.email },
    ];

    await importRows(headToken, { semesterId, rows });
    const second = await importRows(headToken, { semesterId, rows });

    // Import lại cùng một file là chuyện thường (sửa một dòng rồi gửi lại
    // cả file). Nó phải là no-op, không phải nhân đôi lớp.
    expect(second.body).toMatchObject({
      coursesCreated: 0,
      classesCreated: 0,
      classesUpdated: 1,
      errors: [],
    });

    const rows2 = await dataSource.query(
      `SELECT c.id FROM examcollect.class c
         JOIN examcollect.course co ON co.id = c.course_id
        WHERE co.code = $1 AND co.semester_id = $2`,
      [code, semesterId],
    );
    expect(rows2).toHaveLength(1);
  });

  it('reassigns the lecturer when the same class comes back with a different email', async () => {
    const first = await makeAccount('import_gv_before', 'teacher');
    const second = await makeAccount('import_gv_after', 'teacher');
    const code = freshCode();

    await importRows(headToken, {
      semesterId,
      rows: [{ courseCode: code, courseName: 'Hoá', className: 'Nhóm 01', teacherEmail: first.email }],
    });
    const response = await importRows(headToken, {
      semesterId,
      rows: [{ courseCode: code, courseName: 'Hoá', className: 'Nhóm 01', teacherEmail: second.email }],
    });

    expect(response.body).toMatchObject({ classesUpdated: 1, errors: [] });
    const [klass] = await dataSource.query(
      `SELECT c.teacher_id FROM examcollect.class c
         JOIN examcollect.course co ON co.id = c.course_id
        WHERE co.code = $1 AND co.semester_id = $2 AND c.name = 'Nhóm 01'`,
      [code, semesterId],
    );
    expect(klass.teacher_id).toBe(second.id);
  });

  it('moves the roster with the class when import reassigns its lecturer', async () => {
    const before = await makeAccount('import_roster_before', 'teacher');
    const after = await makeAccount('import_roster_after', 'teacher');
    const code = freshCode();

    await importRows(headToken, {
      semesterId,
      rows: [{ courseCode: code, courseName: 'Môn bàn giao', className: 'Nhóm 01', teacherEmail: before.email }],
    });

    const [klass] = await dataSource.query(
      `SELECT c.id, c.course_id FROM examcollect.class c
         JOIN examcollect.course co ON co.id = c.course_id
        WHERE co.code = $1 AND co.semester_id = $2`,
      [code, semesterId],
    );
    const mssv = `SVI${Date.now()}`.slice(0, 20);
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
       VALUES ($1, 'Sinh viên bàn giao', $2, $3, $4)`,
      [mssv, klass.course_id, klass.id, before.id],
    );

    await importRows(headToken, {
      semesterId,
      rows: [{ courseCode: code, courseName: 'Môn bàn giao', className: 'Nhóm 01', teacherEmail: after.email }],
    });

    const [enrollment] = await dataSource.query(
      `SELECT home_teacher_id FROM examcollect.enrollment WHERE student_mssv = $1`,
      [mssv],
    );
    // `enrollment.home_teacher_id` được copy sang mọi bài nộp. Đường
    // import không được phép là một đường vòng quanh xử lý mà
    // `ClassService.updateForHead` đã làm cho đường UI.
    expect(enrollment.home_teacher_id).toBe(after.id);
  });

  it('reports an unknown teacher email on that row without failing the batch', async () => {
    const good = await makeAccount('import_gv_good', 'teacher');
    const codeBad = freshCode();
    const codeGood = freshCode();

    const response = await importRows(headToken, {
      semesterId,
      rows: [
        { courseCode: codeBad, courseName: 'Môn lỗi', className: 'Nhóm 01', teacherEmail: 'khong-ton-tai@truong.edu.vn' },
        { courseCode: codeGood, courseName: 'Môn tốt', className: 'Nhóm 01', teacherEmail: good.email },
      ],
    });

    expect(response.status).toBe(201);
    // Một dòng sai tên GV không được phép chặn 49 dòng còn lại nhập đúng.
    expect(response.body.classesCreated).toBe(1);
    expect(response.body.errors).toEqual([
      expect.objectContaining({ row: 0, reason: expect.stringContaining('khong-ton-tai@truong.edu.vn') }),
    ]);
  });

  it('does not leave an orphan course behind when its only row fails', async () => {
    const code = freshCode();

    await importRows(headToken, {
      semesterId,
      rows: [
        { courseCode: code, courseName: 'Môn mồ côi', className: 'Nhóm 01', teacherEmail: 'khong-ai@truong.edu.vn' },
      ],
    });

    // Tạo môn rồi bỏ dở vì email GV sai sẽ để lại đúng cái `Course` không
    // lớp nào mà /admin/unowned-courses tồn tại để dọn. Kiểm tra giảng
    // viên TRƯỚC khi tạo môn.
    const courses = await dataSource.query(
      `SELECT id FROM examcollect.course WHERE code = $1 AND semester_id = $2`,
      [code, semesterId],
    );
    expect(courses).toHaveLength(0);
  });

  it('refuses to touch a course owned by a different head in the same semester', async () => {
    const teacher = await makeAccount('import_gv_conflict', 'teacher');
    const code = freshCode();

    await importRows(headToken, {
      semesterId,
      rows: [{ courseCode: code, courseName: 'Môn tranh chấp', className: 'Nhóm 01', teacherEmail: teacher.email }],
    });

    const response = await importRows(otherHeadToken, {
      semesterId,
      rows: [{ courseCode: code, courseName: 'Môn tranh chấp', className: 'Nhóm 02', teacherEmail: teacher.email }],
    });

    // Im lặng dùng lại môn của khoa khác sẽ cho khoa B tạo lớp dưới môn
    // của khoa A — một lỗ hổng phạm vi, không phải một tiện ích.
    expect(response.body.classesCreated).toBe(0);
    expect(response.body.errors).toEqual([
      expect.objectContaining({ row: 0, reason: expect.stringContaining('khoa khác') }),
    ]);
  });

  it('rejects a non-teacher account named in teacherEmail', async () => {
    const notATeacher = await makeAccount('import_not_gv', 'department_admin');
    const code = freshCode();

    const response = await importRows(headToken, {
      semesterId,
      rows: [
        { courseCode: code, courseName: 'Môn sai vai', className: 'Nhóm 01', teacherEmail: notATeacher.email },
      ],
    });

    // `class.teacher_id` trỏ vào một Trưởng khoa tạo ra lớp không ai chạy
    // được — cùng lý do `createForHead` từ chối, không phải quy tắc riêng
    // của import.
    expect(response.body.classesCreated).toBe(0);
    expect(response.body.errors).toHaveLength(1);
  });

  it('refuses the whole endpoint to a teacher', async () => {
    const response = await importRows(teacherToken, { semesterId, rows: [] });
    expect(response.status).toBe(403);
  });

  it('rejects an empty batch with 400 rather than reporting a successful no-op', async () => {
    const response = await importRows(headToken, { semesterId, rows: [] });
    expect(response.status).toBe(400);
  });

  it('rejects a semesterId that is not a uuid', async () => {
    const response = await importRows(headToken, {
      semesterId: 'khong-phai-uuid',
      rows: [{ courseCode: 'X1', courseName: 'X', className: 'N', teacherEmail: 'a@b.com' }],
    });
    expect(response.status).toBe(400);
  });
});
