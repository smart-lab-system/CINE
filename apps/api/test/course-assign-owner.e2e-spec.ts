import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount, type TestAccountRole } from './helpers/create-account';

describe('PATCH /courses/:id/owner', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let academicToken: string;
  let headId: string;
  let teacherId: string;
  let semesterId: string;

  async function makeAccount(prefix: string, role: TestAccountRole) {
    const email = `${prefix}_${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`;
    const password = 'Password123!';
    const id = await createTestAccount(dataSource, { email, password, role });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    return { id, token: login.body.accessToken as string };
  }

  async function makeOrphanCourse() {
    const [row] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn mồ côi', $2) RETURNING id`,
      [`AO${Date.now()}${Math.random().toString(36).slice(2, 5)}`.slice(0, 20), semesterId],
    );
    return row.id as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    academicToken = (await makeAccount('assign_academic', 'academic_affairs')).token;
    headId = (await makeAccount('assign_head', 'department_admin')).id;
    teacherId = (await makeAccount('assign_teacher', 'teacher')).id;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-09-01', '2027-01-15') RETURNING id`,
      [`Kỳ phân công ${Date.now()}`],
    );
    semesterId = semester.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('gán cho một Trưởng khoa thì thành công VÀ ghi một dòng audit', async () => {
    const courseId = await makeOrphanCourse();

    const res = await request(app.getHttpServer())
      .patch(`/courses/${courseId}/owner`)
      .set('Authorization', `Bearer ${academicToken}`)
      .send({ departmentHeadId: headId });

    expect(res.status).toBe(200);
    expect(res.body.departmentHeadId).toBe(headId);

    // Vết audit là điều kiện, không phải phần thêm: đây là thao tác duy nhất
    // trong hệ thống dịch chuyển được "ai đọc được bài thi của ai".
    const entries = await dataSource.query(
      `SELECT action, target_type, target_id, old_value, new_value
         FROM examcollect.audit_log
        WHERE target_id = $1 AND target_type = 'course'`,
      [courseId],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('course.assign_owner');
    expect(entries[0].old_value.departmentHeadId).toBeNull();
    expect(entries[0].new_value.departmentHeadId).toBe(headId);
  });

  it('gán cho một giảng viên thì 400 — và KHÔNG ghi audit, KHÔNG đổi dữ liệu', async () => {
    const courseId = await makeOrphanCourse();

    const res = await request(app.getHttpServer())
      .patch(`/courses/${courseId}/owner`)
      .set('Authorization', `Bearer ${academicToken}`)
      .send({ departmentHeadId: teacherId });

    expect(res.status).toBe(400);

    // Gán cho teacher là ca tệ nhất: môn sẽ rời khỏi CẢ /courses/mine lẫn danh
    // sách chưa-có-chủ, tức biến mất khỏi mọi màn hình, không đường sửa qua UI.
    const [course] = await dataSource.query(
      `SELECT department_head_id FROM examcollect.course WHERE id = $1`,
      [courseId],
    );
    expect(course.department_head_id).toBeNull();

    const entries = await dataSource.query(
      `SELECT id FROM examcollect.audit_log WHERE target_id = $1`,
      [courseId],
    );
    expect(entries).toHaveLength(0);
  });

  it('gán cho một uuid không phải tài khoản nào thì 400, không phải 500', async () => {
    const courseId = await makeOrphanCourse();

    const res = await request(app.getHttpServer())
      .patch(`/courses/${courseId}/owner`)
      .set('Authorization', `Bearer ${academicToken}`)
      .send({ departmentHeadId: '00000000-0000-4000-8000-000000000000' });

    expect(res.status).toBe(400);
  });
});
