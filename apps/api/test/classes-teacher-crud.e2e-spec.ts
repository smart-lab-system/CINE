import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Giảng viên tự tạo, sửa, xoá lớp của mình (spec thu hẹp master data §4.1).
 *
 * Trước đợt này, `class` đã có `teacher_id` trỏ thẳng tới giảng viên — nên
 * nhìn qua tưởng lớp đã thuộc về họ. Không phải: MỌI đường tạo và sửa đều
 * gắn `@Roles('department_admin')`, giảng viên chỉ được ĐỌC. Xoá vai trò
 * trưởng khoa mà không chuyển quyền trước sẽ làm hệ thống mất hẳn khả năng
 * tạo lớp, và luồng thi bù chết theo vì nó cần một lớp để định tuyến về.
 *
 * T-OWN-2 quan trọng hơn T-OWN-1: T-OWN-1 hỏng thì ai cũng thấy ngay, còn
 * T-OWN-2 hỏng thì không ai thấy cho tới khi có người mất dữ liệu.
 */
describe('Giảng viên CRUD lớp của mình (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let teacherToken: string;
  let teacherId: string;
  let otherTeacherToken: string;
  let otherTeacherId: string;
  let courseName: string;

  const PASSWORD = 'correct-horse-battery';

  async function makeTeacher(prefix: string) {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const id = await createTestAccount(dataSource, { email, password: PASSWORD, role: 'teacher' });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD });
    return { id, token: login.body.accessToken as string };
  }

  /** Lớp thuộc về `ownerId`, chèn thẳng — không đi qua route đang được test. */
  async function seedClassOwnedBy(ownerId: string): Promise<string> {
    const [row] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseName, `L${Date.now()}${Math.random().toString(36).slice(2, 5)}`, ownerId],
    );
    return row.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    const t = await makeTeacher('gv');
    teacherToken = t.token;
    teacherId = t.id;
    const o = await makeTeacher('gv_khac');
    otherTeacherToken = o.token;
    otherTeacherId = o.id;

    const suffix = `${Date.now()}`.slice(-9);
    const course = { name: 'Cấu trúc dữ liệu và Giải thuật' };
    courseName = course.name;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('T-OWN-1: giảng viên tạo được lớp của mình', async () => {
    const res = await request(app.getHttpServer())
      .post('/classes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: `CTDL-${Date.now()}`, courseName, teacherId })
      .expect(201);

    expect(res.body.teacherId).toBe(teacherId);
  });

  it('T-OWN-1b: chủ sở hữu là NGƯỜI GỌI, kể cả khi body khai người khác', async () => {
    // `dto.teacherId` bị bỏ qua hoàn toàn ở `createForTeacher`. Nếu nó được
    // tôn trọng thì một giảng viên tạo được lớp đứng tên người khác — và
    // người kia không xoá đi được vì họ không phải người tạo.
    const res = await request(app.getHttpServer())
      .post('/classes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: `CTDL-mao-${Date.now()}`, courseName, teacherId: otherTeacherId })
      .expect(201);

    expect(res.body.teacherId).toBe(teacherId);
    expect(res.body.teacherId).not.toBe(otherTeacherId);
  });

  it('T-OWN-2: giảng viên KHÔNG sửa hay xoá được lớp của người khác', async () => {
    const foreign = await seedClassOwnedBy(otherTeacherId);

    await request(app.getHttpServer())
      .patch(`/classes/${foreign}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'cướp lớp' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/classes/${foreign}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(403);

    // Và lớp đó còn nguyên — 403 phải là từ chối, không phải xoá rồi báo lỗi.
    const [still] = await dataSource.query(
      `SELECT teacher_id FROM examcollect.class WHERE id = $1`,
      [foreign],
    );
    expect(still.teacher_id).toBe(otherTeacherId);
  });

  it('T-OWN-2b: sửa lớp của mình KHÔNG đổi được chủ sở hữu', async () => {
    // `updateForHead` cho trưởng khoa đổi giảng viên, kèm cả một giao dịch
    // đồng bộ `enrollment.home_teacher_id`. Bản cho giảng viên cố ý bỏ
    // nhánh đó: cho phép nghĩa là đẩy lớp sang người khác rồi mất quyền,
    // hoặc kéo lớp người khác về.
    const mine = await seedClassOwnedBy(teacherId);

    await request(app.getHttpServer())
      .patch(`/classes/${mine}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'đổi tên thôi', teacherId: otherTeacherId })
      .expect(200);

    const [row] = await dataSource.query(
      `SELECT name, teacher_id FROM examcollect.class WHERE id = $1`,
      [mine],
    );
    expect(row.name).toBe('đổi tên thôi');
    expect(row.teacher_id).toBe(teacherId);
  });

  it('giảng viên xoá được lớp của mình', async () => {
    const mine = await seedClassOwnedBy(teacherId);

    await request(app.getHttpServer())
      .delete(`/classes/${mine}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(204);

    const rows = await dataSource.query(
      `SELECT id FROM examcollect.class WHERE id = $1`,
      [mine],
    );
    expect(rows).toHaveLength(0);
  });

  it('không phải giảng viên thì không vào được', async () => {
    await request(app.getHttpServer())
      .post('/classes')
      .send({ name: 'vo danh', courseName, teacherId })
      .expect(401);

    // Và một giảng viên khác vẫn tạo được lớp của CHÍNH HỌ — 403 ở trên là
    // về quyền sở hữu, không phải về vai trò.
    await request(app.getHttpServer())
      .post('/classes')
      .set('Authorization', `Bearer ${otherTeacherToken}`)
      .send({ name: `CTDL-khac-${Date.now()}`, courseName, teacherId: otherTeacherId })
      .expect(201);
  });
});
