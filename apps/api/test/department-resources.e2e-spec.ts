import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Trưởng khoa owns the academic structure an exam session is built from.
 *
 * Scope is one column — `course.department_head_id` — with everything else
 * (class, exam_session, enrollment) reaching it through `course_id`. These
 * tests pin the part that column exists for: one head cannot touch another
 * head's course, and a teacher cannot touch any of it.
 */
describe('Department resources (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let headToken: string;
  let headId: string;
  let otherHeadToken: string;
  let teacherToken: string;
  let adminToken: string;
  let semesterId: string;
  let lecturerId: string;
  let lecturerToken: string;

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    return response.body.accessToken;
  }

  async function makeAccount(prefix: string, role: 'department_admin' | 'teacher' | 'admin') {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const id = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role,
    });
    return { id, token: await login(email) };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    const head = await makeAccount('dept_head', 'department_admin');
    headId = head.id;
    headToken = head.token;
    otherHeadToken = (await makeAccount('dept_other', 'department_admin')).token;
    teacherToken = (await makeAccount('dept_teacher', 'teacher')).token;
    adminToken = (await makeAccount('dept_admin', 'admin')).token;
    const lecturer = await makeAccount('dept_lecturer', 'teacher');
    lecturerId = lecturer.id;
    lecturerToken = lecturer.token;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Dept Semester ${Date.now()}`],
    );
    semesterId = semester.id;
  });

  afterAll(async () => {
    await app.close();
  });

  function newCourse(suffix: string) {
    return {
      code: `DC${Date.now()}${suffix}`.slice(0, 20),
      name: `Môn học ${suffix}`,
      semesterId,
    };
  }

  describe('courses', () => {
    it('stamps the creating head as the owner', async () => {
      const response = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${headToken}`)
        .send(newCourse('a'));

      expect(response.status).toBe(201);
      // Never taken from the request body: a head could otherwise create a
      // course owned by someone else.
      expect(response.body.departmentHeadId).toBe(headId);
    });

    it('refuses to let one head edit another head\'s course', async () => {
      const created = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${headToken}`)
        .send(newCourse('b'));
      expect(created.status).toBe(201);

      const response = await request(app.getHttpServer())
        .patch(`/courses/${created.body.id}`)
        .set('Authorization', `Bearer ${otherHeadToken}`)
        .send({ name: 'Đổi trộm' });

      expect(response.status).toBe(403);
    });

    it('refuses to let one head delete another head\'s course', async () => {
      const created = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${headToken}`)
        .send(newCourse('c'));

      const response = await request(app.getHttpServer())
        .delete(`/courses/${created.body.id}`)
        .set('Authorization', `Bearer ${otherHeadToken}`);

      expect(response.status).toBe(403);
    });

    it('lists only the calling head\'s own courses', async () => {
      const mine = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${headToken}`)
        .send(newCourse('d'));
      const theirs = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${otherHeadToken}`)
        .send(newCourse('e'));

      const response = await request(app.getHttpServer())
        .get('/courses/mine')
        .set('Authorization', `Bearer ${headToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.map((c: { id: string }) => c.id);
      expect(ids).toContain(mine.body.id);
      expect(ids).not.toContain(theirs.body.id);
    });

    it('refuses course creation by a teacher', async () => {
      const response = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send(newCourse('f'));

      expect(response.status).toBe(403);
    });
  });

  /**
   * Học kỳ và phòng thi là tài nguyên CẤP TRƯỜNG (CLAUDE.md §1.4/§2.2):
   * không ai sở hữu chúng, nên không có ownership check nào chặn được một
   * Trưởng khoa sửa/xoá dữ liệu của khoa khác. Cách duy nhất giữ ranh giới
   * là để đúng `admin` ghi. Read vẫn mở cho mọi role — mọi màn hình lọc
   * theo kỳ và mọi form tạo phiên thi đều cần hai danh sách này.
   */
  describe('semesters and rooms', () => {
    function semesterBody(suffix: string) {
      return {
        name: `Học kỳ ${Date.now()}${suffix}`,
        startDate: '2026-09-01',
        endDate: '2027-01-15',
      };
    }

    async function adminCreatesSemester(suffix: string): Promise<string> {
      const created = await request(app.getHttpServer())
        .post('/semesters')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(semesterBody(suffix));
      expect(created.status).toBe(201);
      return created.body.id;
    }

    async function adminCreatesRoom(suffix: string): Promise<string> {
      const created = await request(app.getHttpServer())
        .post('/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Phòng máy ${Date.now()}${suffix}`, capacity: 40 });
      expect(created.status).toBe(201);
      return created.body.id;
    }

    it('lets admin create a semester', async () => {
      const response = await request(app.getHttpServer())
        .post('/semesters')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(semesterBody('a'));

      expect(response.status).toBe(201);
    });

    it('refuses semester creation to a head', async () => {
      const response = await request(app.getHttpServer())
        .post('/semesters')
        .set('Authorization', `Bearer ${headToken}`)
        .send(semesterBody('b'));

      expect(response.status).toBe(403);
    });

    it('lets admin edit a semester, and refuses a head', async () => {
      const id = await adminCreatesSemester('c');

      const byHead = await request(app.getHttpServer())
        .patch(`/semesters/${id}`)
        .set('Authorization', `Bearer ${headToken}`)
        .send({ name: `Đổi trộm ${Date.now()}` });
      expect(byHead.status).toBe(403);

      const byAdmin = await request(app.getHttpServer())
        .patch(`/semesters/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Học kỳ đã sửa ${Date.now()}` });
      expect(byAdmin.status).toBe(200);
    });

    it('lets admin delete an empty semester, and refuses a head', async () => {
      const id = await adminCreatesSemester('d');

      const byHead = await request(app.getHttpServer())
        .delete(`/semesters/${id}`)
        .set('Authorization', `Bearer ${headToken}`);
      expect(byHead.status).toBe(403);

      const byAdmin = await request(app.getHttpServer())
        .delete(`/semesters/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(byAdmin.status).toBe(204);
    });

    it('rejects a duplicate semester name with 409, not a 500', async () => {
      const body = { name: `Học kỳ trùng ${Date.now()}`, startDate: '2026-09-01', endDate: '2027-01-15' };
      await request(app.getHttpServer())
        .post('/semesters')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body);

      const second = await request(app.getHttpServer())
        .post('/semesters')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body);

      // `uq_semester_name` giữ một namespace duy nhất cho cả trường; gõ
      // trùng tên là chuyện thường ngày, phải là 409 chứ không phải lỗi nội bộ.
      expect(second.status).toBe(409);
    });

    it('lets admin create a room, and refuses both a head and a teacher', async () => {
      const allowed = await request(app.getHttpServer())
        .post('/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Phòng máy ${Date.now()}`, capacity: 40 });
      expect(allowed.status).toBe(201);

      const byHead = await request(app.getHttpServer())
        .post('/rooms')
        .set('Authorization', `Bearer ${headToken}`)
        .send({ name: `Phòng máy ${Date.now()}h`, capacity: 40 });
      expect(byHead.status).toBe(403);

      const byTeacher = await request(app.getHttpServer())
        .post('/rooms')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ name: `Phòng máy ${Date.now()}x`, capacity: 40 });
      expect(byTeacher.status).toBe(403);
    });

    it('lets admin edit a room, and refuses a head', async () => {
      const id = await adminCreatesRoom('e');

      const byHead = await request(app.getHttpServer())
        .patch(`/rooms/${id}`)
        .set('Authorization', `Bearer ${headToken}`)
        .send({ capacity: 60 });
      expect(byHead.status).toBe(403);

      const byAdmin = await request(app.getHttpServer())
        .patch(`/rooms/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ capacity: 60 });
      expect(byAdmin.status).toBe(200);
      expect(byAdmin.body.capacity).toBe(60);
    });

    it('lets admin delete an unused room, and refuses a head', async () => {
      const id = await adminCreatesRoom('f');

      const byHead = await request(app.getHttpServer())
        .delete(`/rooms/${id}`)
        .set('Authorization', `Bearer ${headToken}`);
      expect(byHead.status).toBe(403);

      const byAdmin = await request(app.getHttpServer())
        .delete(`/rooms/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(byAdmin.status).toBe(204);
    });

    it('keeps read open to every role — write moving to admin must not blind the filters', async () => {
      for (const token of [headToken, teacherToken, adminToken]) {
        const semesters = await request(app.getHttpServer())
          .get('/semesters')
          .set('Authorization', `Bearer ${token}`);
        expect(semesters.status).toBe(200);

        const rooms = await request(app.getHttpServer())
          .get('/rooms')
          .set('Authorization', `Bearer ${token}`);
        expect(rooms.status).toBe(200);
      }
    });
  });

  describe('unowned courses', () => {
    it('shows admin the courses nobody owns, and lets them assign one', async () => {
      const [orphan] = await dataSource.query(
        `INSERT INTO examcollect.course (code, name, semester_id)
         VALUES ($1, 'Môn mồ côi', $2) RETURNING id`,
        [`OR${Date.now()}`.slice(0, 20), semesterId],
      );

      const listed = await request(app.getHttpServer())
        .get('/courses/unowned')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listed.status).toBe(200);
      expect(listed.body.map((c: { id: string }) => c.id)).toContain(orphan.id);

      const assigned = await request(app.getHttpServer())
        .patch(`/courses/${orphan.id}/owner`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ departmentHeadId: headId });
      expect(assigned.status).toBe(200);

      // Once owned it leaves the orphan list — otherwise the list would grow
      // forever and stop meaning anything.
      const after = await request(app.getHttpServer())
        .get('/courses/unowned')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(after.body.map((c: { id: string }) => c.id)).not.toContain(orphan.id);
    });

    it('refuses the orphan list to a head', async () => {
      const response = await request(app.getHttpServer())
        .get('/courses/unowned')
        .set('Authorization', `Bearer ${headToken}`);

      expect(response.status).toBe(403);
    });
  });
  describe('classes', () => {
    it('creates a class under a course the head owns, assigning a lecturer', async () => {
      const course = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${headToken}`)
        .send(newCourse('g'));

      const response = await request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${headToken}`)
        .send({ courseId: course.body.id, name: 'Nhóm 01', teacherId: lecturerId });

      expect(response.status).toBe(201);
      expect(response.body.teacherId).toBe(lecturerId);
    });

    it('refuses a class under a course the head does not own', async () => {
      const theirs = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${otherHeadToken}`)
        .send(newCourse('h'));

      const response = await request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${headToken}`)
        .send({ courseId: theirs.body.id, name: 'Nhóm 02', teacherId: lecturerId });

      // The scope column is on course; a class inherits it. Without this a
      // head could staff another department's classes.
      expect(response.status).toBe(403);
    });

    it('refuses to assign a non-teacher account as the lecturer', async () => {
      const course = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${headToken}`)
        .send(newCourse('i'));

      const response = await request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${headToken}`)
        .send({ courseId: course.body.id, name: 'Nhóm 03', teacherId: headId });

      // class.teacher_id is what scopes a lecturer to their own classes, so
      // pointing it at an admin or a head would create a class nobody can
      // run.
      expect(response.status).toBe(400);
    });

    it('moves the roster to the new lecturer when a class changes hands', async () => {
      const replacement = await makeAccount('dept_replacement', 'teacher');

      const course = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${headToken}`)
        .send(newCourse('j'));
      const klass = await request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${headToken}`)
        .send({ courseId: course.body.id, name: 'Nhóm bàn giao', teacherId: lecturerId });

      const student = `H${Date.now().toString(36)}`.slice(0, 20);
      // The LECTURER owns the roster, so the list is loaded as them. A head
      // creates the class and names who teaches it; from there the list is
      // the lecturer's.
      await request(app.getHttpServer())
        .post(`/classes/${klass.body.id}/roster`)
        .set('Authorization', `Bearer ${lecturerToken}`)
        .send({ students: [{ mssv: student, name: 'Sinh viên bàn giao' }] });

      const response = await request(app.getHttpServer())
        .patch(`/classes/${klass.body.id}`)
        .set('Authorization', `Bearer ${headToken}`)
        .send({ teacherId: replacement.id });
      expect(response.status).toBe(200);

      // enrollment.home_teacher_id is copied onto every submission the
      // student makes. A class that changes lecturer while its roster still
      // points at the old one routes work to someone who no longer teaches
      // it — and nothing about the submission would look wrong.
      const [row] = await dataSource.query(
        `SELECT home_teacher_id FROM examcollect.enrollment
         WHERE course_id = $1 AND student_mssv = $2`,
        [course.body.id, student],
      );
      expect(row.home_teacher_id).toBe(replacement.id);
    });
  });
  describe('department teachers list (QA-reported gap: point 7)', () => {
    it('lists a teacher only once, with the number of classes they teach across this head\'s courses', async () => {
      const teacher = await makeAccount('dept_teachers_a', 'teacher');
      const courseOne = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${headToken}`)
        .send(newCourse('k'));
      const courseTwo = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${headToken}`)
        .send(newCourse('l'));

      await request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${headToken}`)
        .send({ courseId: courseOne.body.id, name: 'Nhóm GV A - 1', teacherId: teacher.id });
      await request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${headToken}`)
        .send({ courseId: courseTwo.body.id, name: 'Nhóm GV A - 2', teacherId: teacher.id });

      const response = await request(app.getHttpServer())
        .get('/classes/teachers')
        .set('Authorization', `Bearer ${headToken}`);

      expect(response.status).toBe(200);
      const rows = response.body.filter((t: { id: string }) => t.id === teacher.id);
      // Two classes, ONE row — a head sees who is teaching for them, not
      // one line per class.
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ classCount: 2 });
      expect(rows[0].email).toBeDefined();
    });

    it('never lists a teacher who has no class under this head — the pick list stays global, this does not', async () => {
      const untouched = await makeAccount('dept_teachers_untouched', 'teacher');

      const response = await request(app.getHttpServer())
        .get('/classes/teachers')
        .set('Authorization', `Bearer ${headToken}`);

      expect(response.status).toBe(200);
      expect(response.body.map((t: { id: string }) => t.id)).not.toContain(untouched.id);
    });

    it('never lists a teacher who only teaches for a DIFFERENT head\'s department', async () => {
      const foreignTeacher = await makeAccount('dept_teachers_foreign', 'teacher');
      const foreignCourse = await request(app.getHttpServer())
        .post('/courses')
        .set('Authorization', `Bearer ${otherHeadToken}`)
        .send(newCourse('m'));
      await request(app.getHttpServer())
        .post('/classes')
        .set('Authorization', `Bearer ${otherHeadToken}`)
        .send({ courseId: foreignCourse.body.id, name: 'Nhóm khoa khác', teacherId: foreignTeacher.id });

      const response = await request(app.getHttpServer())
        .get('/classes/teachers')
        .set('Authorization', `Bearer ${headToken}`);

      expect(response.status).toBe(200);
      expect(response.body.map((t: { id: string }) => t.id)).not.toContain(foreignTeacher.id);
    });

    it('refuses the department teachers list to a teacher', async () => {
      const response = await request(app.getHttpServer())
        .get('/classes/teachers')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('teacher pick list', () => {
    it('lets a head read teacher options without exposing anything else', async () => {
      const response = await request(app.getHttpServer())
        .get('/accounts/teachers')
        .set('Authorization', `Bearer ${headToken}`);

      expect(response.status).toBe(200);
      const found = response.body.find((a: { id: string }) => a.id === lecturerId);
      expect(found).toBeDefined();
      // Narrower than search() on purpose: a head names a lecturer, they do
      // not audit accounts.
      expect(Object.keys(found).sort()).toEqual(['id', 'name']);
    });

    it('still refuses the full account list to a head', async () => {
      const response = await request(app.getHttpServer())
        .get('/accounts')
        .set('Authorization', `Bearer ${headToken}`);

      expect(response.status).toBe(403);
    });

    it('refuses the pick list to a teacher', async () => {
      const response = await request(app.getHttpServer())
        .get('/accounts/teachers')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(response.status).toBe(403);
    });
  });
});
