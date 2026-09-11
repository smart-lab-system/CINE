import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Escape hatch của admin để chuyển chủ một phiên thi (CLAUDE.md §7.2.6).
 *
 * Lỗ hổng nó vá, ở §5.5: Trưởng khoa đổi `class.teacher_id` KHÔNG kéo theo
 * các `ExamSession` đã tạo trước đó — chúng vẫn thuộc giảng viên cũ, và
 * trước thay đổi này không role nào có đường sửa. Giảng viên mới nhìn lớp
 * của mình mà không thấy phiên thi nào.
 *
 * Đây là thao tác tầng SỞ HỮU, không phải Tham chiếu: đổi `teacher_id`
 * đổi luôn ai đọc được bài nộp và điểm đã thu. Vì vậy audit là bắt buộc,
 * và giảng viên cũ mất quyền đọc ngay lập tức — hai điều đó là nội dung
 * của spec này.
 */
describe('ExamSession teacher reassignment (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let adminToken: string;
  let headToken: string;
  let roomId: string;
  let courseId: string;

  const PASSWORD = 'correct-horse-battery';

  // Mỗi phiên thi một ngày riêng: một phòng dùng chung cho cả spec, nên
  // hai phiên trùng khung giờ sẽ đụng ex_exam_session_room_overlap. Tính
  // theo NGÀY cũng giữ mọi phiên nằm ngoài tầm quét của
  // ExamSessionScheduler, thứ sẽ finalize một phiên khi end_time đã qua.
  let windowCursor = 0;
  function futureWindow() {
    windowCursor += 1;
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + windowCursor);
    start.setUTCHours(8, 0, 0, 0);
    const end = new Date(start);
    end.setUTCHours(10);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }

  async function makeAccount(prefix: string, role: 'admin' | 'teacher' | 'department_admin') {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const id = await createTestAccount(dataSource, { email, password: PASSWORD, role });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD });
    return { id, email, token: login.body.accessToken as string };
  }

  /** Một phiên thi thật, do `teacher` sở hữu, dưới một lớp họ dạy. */
  async function seedSessionOwnedBy(teacherId: string, teacherToken: string) {
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseId, `Nhóm ${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, teacherId],
    );

    const { startTime, endTime } = futureWindow();
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: `Phiên chuyển chủ ${Date.now()}`,
        classId: klass.id,
        roomId,
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx'],
      });
    expect(created.status).toBe(201);
    return { id: created.body.id as string, classId: klass.id as string };
  }

  function auditEntriesFor(sessionId: string) {
    return dataSource.query(
      `SELECT action, old_value, new_value, actor_id
         FROM examcollect.audit_log
        WHERE target_type = 'exam_session' AND target_id = $1
        ORDER BY occurred_at ASC`,
      [sessionId],
    );
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    adminToken = (await makeAccount('reassign_admin', 'admin')).token;
    headToken = (await makeAccount('reassign_head', 'department_admin')).token;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Reassign Semester ${Date.now()}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Reassign Test Course', $2) RETURNING id`,
      [`RA${Date.now()}`.slice(0, 20), semester.id],
    );
    courseId = course.id;
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity)
       VALUES ($1, 30) RETURNING id`,
      [`Reassign Room ${Date.now()}`],
    );
    roomId = room.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('moves the session to another teacher, and the old owner loses access immediately', async () => {
    const oldTeacher = await makeAccount('reassign_old', 'teacher');
    const newTeacher = await makeAccount('reassign_new', 'teacher');
    const session = await seedSessionOwnedBy(oldTeacher.id, oldTeacher.token);

    const response = await request(app.getHttpServer())
      .patch(`/exam-sessions/${session.id}/teacher`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacherId: newTeacher.id });

    expect(response.status).toBe(200);
    expect(response.body.teacherId).toBe(newTeacher.id);

    // Không có thời gian ân hạn: mọi check sở hữu đọc `teacher_id` trực
    // tiếp, nên đổi cột là thu hồi quyền đọc.
    const asOldTeacher = await request(app.getHttpServer())
      .get(`/exam-sessions/${session.id}`)
      .set('Authorization', `Bearer ${oldTeacher.token}`);
    expect(asOldTeacher.status).toBe(403);

    const asNewTeacher = await request(app.getHttpServer())
      .get(`/exam-sessions/${session.id}`)
      .set('Authorization', `Bearer ${newTeacher.token}`);
    expect(asNewTeacher.status).toBe(200);
  });

  it('records the transfer in audit_log, naming both the old and the new teacher', async () => {
    const oldTeacher = await makeAccount('reassign_audit_old', 'teacher');
    const newTeacher = await makeAccount('reassign_audit_new', 'teacher');
    const session = await seedSessionOwnedBy(oldTeacher.id, oldTeacher.token);

    const admin = await makeAccount('reassign_audit_admin', 'admin');
    await request(app.getHttpServer())
      .patch(`/exam-sessions/${session.id}/teacher`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ teacherId: newTeacher.id });

    const entries = await auditEntriesFor(session.id);
    const transfer = entries.find(
      (e: { action: string }) => e.action === 'exam_session.reassign_teacher',
    );

    expect(transfer).toBeDefined();
    // Cả hai đầu phải có tên: chỉ ghi "đã chuyển sang X" thì sáu tháng sau
    // không ai trả lời được câu "trước đó của ai".
    expect(transfer.old_value).toMatchObject({ teacherId: oldTeacher.id });
    expect(transfer.new_value).toMatchObject({ teacherId: newTeacher.id });
    expect(transfer.actor_id).toBe(admin.id);
  });

  it('refuses reassignment to a department_admin', async () => {
    const oldTeacher = await makeAccount('reassign_403_old', 'teacher');
    const newTeacher = await makeAccount('reassign_403_new', 'teacher');
    const session = await seedSessionOwnedBy(oldTeacher.id, oldTeacher.token);

    const response = await request(app.getHttpServer())
      .patch(`/exam-sessions/${session.id}/teacher`)
      .set('Authorization', `Bearer ${headToken}`)
      .send({ teacherId: newTeacher.id });

    expect(response.status).toBe(403);
  });

  it('refuses reassignment to the owning teacher themselves', async () => {
    const oldTeacher = await makeAccount('reassign_self_old', 'teacher');
    const newTeacher = await makeAccount('reassign_self_new', 'teacher');
    const session = await seedSessionOwnedBy(oldTeacher.id, oldTeacher.token);

    const response = await request(app.getHttpServer())
      .patch(`/exam-sessions/${session.id}/teacher`)
      .set('Authorization', `Bearer ${oldTeacher.token}`)
      .send({ teacherId: newTeacher.id });

    // Người sở hữu tự chuyển phiên đi là một cách lách khỏi audit — họ
    // vẫn là chủ, nhưng không phải người được phép quyết định điều đó.
    expect(response.status).toBe(403);
  });

  it('rejects a target account that is not a teacher', async () => {
    const oldTeacher = await makeAccount('reassign_notgv_old', 'teacher');
    const head = await makeAccount('reassign_notgv_head', 'department_admin');
    const session = await seedSessionOwnedBy(oldTeacher.id, oldTeacher.token);

    const response = await request(app.getHttpServer())
      .patch(`/exam-sessions/${session.id}/teacher`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacherId: head.id });

    // Mọi UI của giảng viên lọc theo `teacher_id`; trỏ cột này vào một
    // Trưởng khoa tạo ra phiên thi không màn hình nào chạm tới được.
    expect(response.status).toBe(400);
  });

  it('rejects a deactivated teacher as the target', async () => {
    const oldTeacher = await makeAccount('reassign_off_old', 'teacher');
    const disabled = await makeAccount('reassign_off_new', 'teacher');
    const session = await seedSessionOwnedBy(oldTeacher.id, oldTeacher.token);

    await request(app.getHttpServer())
      .patch(`/accounts/${disabled.id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    const response = await request(app.getHttpServer())
      .patch(`/exam-sessions/${session.id}/teacher`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacherId: disabled.id });

    // Chuyển phiên cho một tài khoản không đăng nhập được nữa là làm phiên
    // thi biến mất khỏi mọi màn hình mà không ai báo lỗi.
    expect(response.status).toBe(400);
  });

  it('404s for a session that does not exist, and writes no audit entry', async () => {
    const newTeacher = await makeAccount('reassign_404_new', 'teacher');
    const missingId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app.getHttpServer())
      .patch(`/exam-sessions/${missingId}/teacher`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacherId: newTeacher.id });

    expect(response.status).toBe(404);
    expect(await auditEntriesFor(missingId)).toHaveLength(0);
  });

  it('is a no-op that still 400s when the target is already the owner', async () => {
    const teacher = await makeAccount('reassign_same', 'teacher');
    const session = await seedSessionOwnedBy(teacher.id, teacher.token);

    const response = await request(app.getHttpServer())
      .patch(`/exam-sessions/${session.id}/teacher`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacherId: teacher.id });

    // Ghi một dòng audit "chuyển từ A sang A" làm loãng sổ bằng những
    // dòng không mô tả thay đổi nào.
    expect(response.status).toBe(400);
    expect(await auditEntriesFor(session.id)).toHaveLength(0);
  });
});
