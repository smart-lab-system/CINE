import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Ba cột đếm read-only trên danh sách lớp của Trưởng khoa (CLAUDE.md
 * §7.2.5): sĩ số roster, số phiên thi, số bài đã chấm.
 *
 * Không có ba con số này thì tầm nhìn của Trưởng khoa dừng lại đúng lúc
 * họ tạo lớp và gán giảng viên — sau đó lớp có ai học, có thi hay không,
 * chấm được bao nhiêu, họ không biết gì.
 *
 * **CHỈ ĐẾM.** Đây là lần đầu `department_admin` chạm tới tầng Sở hữu
 * (§1.1), dù chỉ qua một con số. Ranh giới giữ tường minh bằng cách không
 * `SELECT` bất kỳ cột nào của `submission`/`grading_result` ngoài
 * `COUNT()` — spec này khẳng định cả điều đó, không chỉ các con số.
 *
 * Test ở tầng e2e chứ không phải unit: ba con số này là SQL thuần (ba
 * `LEFT JOIN` + `COUNT(DISTINCT)` với một subquery tương quan). Mock query
 * builder rồi khẳng định nó trả về số đã mock chỉ kiểm tra cái mock.
 */
describe('Department class counts (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let headToken: string;
  let headId: string;
  let otherHeadToken: string;
  let teacherToken: string;
  let teacherId: string;
  let roomId: string;
  let semesterId: string;

  const PASSWORD = 'correct-horse-battery';

  let windowCursor = 0;
  let rubricVersionCursor = 0;
  function futureWindow() {
    windowCursor += 1;
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + windowCursor);
    start.setUTCHours(8, 0, 0, 0);
    const end = new Date(start);
    end.setUTCHours(10);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }

  async function makeAccount(prefix: string, role: 'teacher' | 'department_admin') {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const id = await createTestAccount(dataSource, { email, password: PASSWORD, role });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD });
    return { id, token: login.body.accessToken as string };
  }

  async function seedCourse(ownerId: string | null, label: string) {
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id, department_head_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        `CN${label}${Date.now()}`.slice(0, 20),
        `Môn đếm ${label}`,
        semesterId,
        ownerId,
      ],
    );
    return course.id as string;
  }

  async function seedClass(courseId: string, name: string, ownerId: string) {
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, course_name, name, teacher_id)
       VALUES ($1, (SELECT name FROM examcollect.course WHERE id = $1), $2, $3) RETURNING id`,
      [courseId, name, ownerId],
    );
    return klass.id as string;
  }

  async function seedEnrollments(courseId: string, classId: string, count: number) {
    for (let i = 0; i < count; i++) {
      await dataSource.query(
        `INSERT INTO examcollect.enrollment
           (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          `SV${Date.now()}${i}${Math.random().toString(36).slice(2, 5)}`.slice(0, 20),
          `Sinh viên ${i}`,
          courseId,
          classId,
          teacherId,
        ],
      );
    }
  }

  async function seedSession(classId: string) {
    const { startTime, endTime } = futureWindow();
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: `Phiên đếm ${Date.now()}`,
        classId,
        roomId,
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx'],
      });
    expect(created.status).toBe(201);
    return created.body.id as string;
  }

  /**
   * Đường đi hợp lệ tới mỗi trạng thái `grading_result`, theo đúng trigger
   * `validate_grading_result_lifecycle` trong DB (đã đọc từ `pg_proc`,
   * không suy đoán). Trigger từ chối INSERT ở bất cứ trạng thái nào ngoài
   * `ai_grading`, và mỗi UPDATE chỉ được nhảy một bước — nên muốn dựng
   * một hàng `finalized` thì phải đi hết chuỗi.
   */
  const GRADING_PATHS: Record<string, string[]> = {
    ai_grading: [],
    ai_graded: ['ai_graded'],
    auto_approved: ['ai_graded', 'auto_approved'],
    flagged_for_review: ['ai_graded', 'flagged_for_review'],
    teacher_reviewed: ['ai_graded', 'flagged_for_review', 'teacher_reviewed'],
    finalized: ['ai_graded', 'flagged_for_review', 'teacher_reviewed', 'finalized'],
    exported: [
      'ai_graded',
      'flagged_for_review',
      'teacher_reviewed',
      'finalized',
      'exported',
    ],
  };

  /**
   * Một `grading_result` ở trạng thái `status`, gắn với một bài nộp thật
   * của phiên đã cho. Chèn thẳng SQL: đi qua đường chấm thật cần một
   * rubric, một AI provider và cả vòng đời bài nộp — không cái nào liên
   * quan tới việc câu đếm có đúng hay không.
   */
  async function seedGradingResult(sessionId: string, status: string) {
    const [deliverable] = await dataSource.query(
      `SELECT id FROM examcollect.required_deliverable WHERE exam_session_id = $1 LIMIT 1`,
      [sessionId],
    );
    const [klass] = await dataSource.query(
      `SELECT class_id, course_id FROM examcollect.exam_session WHERE id = $1`,
      [sessionId],
    );
    const mssv = `SVG${Date.now()}${Math.random().toString(36).slice(2, 5)}`.slice(0, 20);
    // `validate_submission_lifecycle` từ chối INSERT ở bất cứ trạng thái
    // nào ngoài `received`/`invalid`, rồi chỉ cho `received → validated →
    // collected`. Phải đi từng bước, không nhảy thẳng.
    const [submission] = await dataSource.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, status)
       VALUES ($1, $2, $3, 'Sinh viên chấm', $4, $5, 'received') RETURNING id`,
      [sessionId, deliverable.id, mssv, klass.class_id, teacherId],
    );
    for (const next of ['validated', 'collected']) {
      await dataSource.query(
        `UPDATE examcollect.submission SET status = $1 WHERE id = $2`,
        [next, submission.id],
      );
    }

    // `uq_rubric_course_version` là (course_id, version), và mỗi test
    // dùng course riêng — nhưng một course có thể cần nhiều rubric trong
    // cùng test, nên version phải khác nhau mỗi lần gọi.
    rubricVersionCursor += 1;
    const [rubric] = await dataSource.query(
      `INSERT INTO examcollect.rubric (course_id, version, teacher_id, name)
       VALUES ($1, $2, (SELECT teacher_id FROM examcollect.class WHERE course_id = $1 ORDER BY created_at LIMIT 1), (SELECT name FROM examcollect.course WHERE id = $1)) RETURNING id`,
      [klass.course_id, rubricVersionCursor],
    );

    const [result] = await dataSource.query(
      `INSERT INTO examcollect.grading_result
         (submission_id, rubric_id_version, grading_triggered_by, status)
       VALUES ($1, $2, $3, 'ai_grading') RETURNING id`,
      [submission.id, rubric.id, teacherId],
    );
    for (const next of GRADING_PATHS[status]) {
      await dataSource.query(
        `UPDATE examcollect.grading_result SET status = $1 WHERE id = $2`,
        [next, result.id],
      );
    }
  }

  function myClasses(token: string) {
    return request(app.getHttpServer())
      .get('/classes/mine')
      .set('Authorization', `Bearer ${token}`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    const head = await makeAccount('counts_head', 'department_admin');
    headId = head.id;
    headToken = head.token;
    otherHeadToken = (await makeAccount('counts_other_head', 'department_admin')).token;
    const teacher = await makeAccount('counts_gv', 'teacher');
    teacherId = teacher.id;
    teacherToken = teacher.token;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Counts Semester ${Date.now()}`],
    );
    semesterId = semester.id;
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity)
       VALUES ($1, 40) RETURNING id`,
      [`Counts Room ${Date.now()}`],
    );
    roomId = room.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports roster, session and graded counts for a class', async () => {
    const courseId = await seedCourse(headId, 'A');
    const classId = await seedClass(courseId, `Nhóm đếm A ${Date.now()}`, teacherId);
    await seedEnrollments(courseId, classId, 3);
    const sessionOne = await seedSession(classId);
    await seedSession(classId);
    await seedGradingResult(sessionOne, 'auto_approved');

    const response = await myClasses(headToken);

    expect(response.status).toBe(200);
    const row = response.body.find((k: { id: string }) => k.id === classId);
    expect(row).toMatchObject({
      rosterCount: 3,
      examSessionCount: 2,
      gradedCount: 1,
    });
  });

  it('reports zeroes for a brand-new class rather than omitting it', async () => {
    const courseId = await seedCourse(headId, 'B');
    const classId = await seedClass(courseId, `Nhóm đếm B ${Date.now()}`, teacherId);

    const response = await myClasses(headToken);
    const row = response.body.find((k: { id: string }) => k.id === classId);

    // Ba `LEFT JOIN`, không phải `INNER`: một lớp vừa tạo chưa có gì vẫn
    // phải nằm trong danh sách — đó chính là lớp Trưởng khoa cần nhìn
    // thấy nhất.
    expect(row).toMatchObject({ rosterCount: 0, examSessionCount: 0, gradedCount: 0 });
  });

  it('does not double-count the roster when a class has several sessions', async () => {
    const courseId = await seedCourse(headId, 'C');
    const classId = await seedClass(courseId, `Nhóm đếm C ${Date.now()}`, teacherId);
    await seedEnrollments(courseId, classId, 2);
    await seedSession(classId);
    await seedSession(classId);
    await seedSession(classId);

    const response = await myClasses(headToken);
    const row = response.body.find((k: { id: string }) => k.id === classId);

    // Ba join song song trên cùng một hàng lớp nhân bản hàng với nhau.
    // Không có `COUNT(DISTINCT)` thì sĩ số 2 sẽ báo thành 6.
    expect(row).toMatchObject({ rosterCount: 2, examSessionCount: 3 });
  });

  it('counts only grading results that reached a graded state', async () => {
    const courseId = await seedCourse(headId, 'D');
    const classId = await seedClass(courseId, `Nhóm đếm D ${Date.now()}`, teacherId);
    const sessionId = await seedSession(classId);
    await seedGradingResult(sessionId, 'ai_grading');
    await seedGradingResult(sessionId, 'ai_graded');
    await seedGradingResult(sessionId, 'flagged_for_review');
    await seedGradingResult(sessionId, 'finalized');

    const response = await myClasses(headToken);
    const row = response.body.find((k: { id: string }) => k.id === classId);

    // `ai_grading` là "đang chạy" và `ai_graded` là "máy xong, chưa qua
    // ngưỡng nào" — đếm chúng là báo cho Trưởng khoa một tiến độ chưa tồn
    // tại. Chỉ `flagged_for_review` và `finalized` ở đây là đã chấm.
    expect(row.gradedCount).toBe(2);
  });

  it('never leaks submission or grade content — only numbers', async () => {
    const courseId = await seedCourse(headId, 'E');
    const classId = await seedClass(courseId, `Nhóm đếm E ${Date.now()}`, teacherId);
    const sessionId = await seedSession(classId);
    await seedGradingResult(sessionId, 'finalized');

    const response = await myClasses(headToken);
    const row = response.body.find((k: { id: string }) => k.id === classId);

    // Ranh giới §7.2.5 là một hợp đồng về HÌNH DẠNG payload, không phải
    // một ý định. Khoá danh sách khoá lại: thêm điểm hay tên file vào đây
    // sau này sẽ làm test này đỏ.
    expect(Object.keys(row).sort()).toEqual([
      'courseId',
      'examSessionCount',
      'gradedCount',
      'id',
      'name',
      'rosterCount',
      'teacherId',
    ]);
  });

  it('still shows another head nothing of this department', async () => {
    const courseId = await seedCourse(headId, 'F');
    const classId = await seedClass(courseId, `Nhóm đếm F ${Date.now()}`, teacherId);
    await seedEnrollments(courseId, classId, 1);

    const response = await myClasses(otherHeadToken);

    // Ba cột đếm mới không được nới phạm vi: chúng bám vào cùng cái
    // `course.department_head_id` mà `findForHead` vẫn luôn bám vào.
    expect(response.body.map((k: { id: string }) => k.id)).not.toContain(classId);
  });
});
