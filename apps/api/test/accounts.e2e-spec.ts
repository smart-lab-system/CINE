import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

describe('Accounts (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // `/auth/refresh` reads the token off `req.cookies`, which Express only
    // populates when cookie-parser is registered — without this the refresh
    // test below would pass for the wrong reason (401 because the cookie was
    // never parsed, not because the account was deactivated).
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // Mirrors main.ts — without it a Postgres trigger/constraint error
    // surfaces as a bare 500 instead of the mapped 409/400 a real client
    // sees.
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const adminEmail = `accounts_admin_${Date.now()}@example.com`;
    await createTestAccount(dataSource, {
      email: adminEmail,
      password: 'correct-horse-battery',
      role: 'admin',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: 'correct-horse-battery' });
    adminToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  let createdAccountId: string;

  it('rejects account creation without a token', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({
        name: 'Nobody',
        email: 'nobody@example.com',
        password: 'irrelevant-password',
        role: 'teacher',
      });

    expect(response.status).toBe(401);
  });

  it('rejects account creation for an authenticated account without the admin role', async () => {
    const teacherEmail = `accounts_teacher_${Date.now()}@example.com`;
    await createTestAccount(dataSource, {
      email: teacherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: teacherEmail, password: 'correct-horse-battery' });
    const teacherToken = loginResponse.body.accessToken;

    const response = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        name: 'Should Not Be Created',
        email: `should_not_be_created_${Date.now()}@example.com`,
        password: 'correct-horse-battery',
        role: 'teacher',
      });

    expect(response.status).toBe(403);
  });

  it('creates an account as admin', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Managed User',
        email: `managed_${Date.now()}@example.com`,
        password: 'correct-horse-battery',
        role: 'teacher',
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    createdAccountId = response.body.id;
  });

  it('searches accounts', async () => {
    const response = await request(app.getHttpServer())
      .get('/accounts?search=Managed&page=1&pageSize=20')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThanOrEqual(1);
    expect(
      response.body.items.some((item: any) => item.id === createdAccountId),
    ).toBe(true);
  });

  it('updates an account', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/accounts/${createdAccountId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Managed User (Updated)' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Managed User (Updated)');
  });

  it('deletes an account with nothing referencing it', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/accounts/${createdAccountId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(204);

    // Hard delete — there's no deleted_at column any more, so "gone" means
    // the row genuinely doesn't exist.
    const rows = await dataSource.query(
      `SELECT id FROM examcollect.account WHERE id = $1`,
      [createdAccountId],
    );
    expect(rows).toHaveLength(0);
  });

  it('rejects deleting an account that is still a home teacher on an active enrollment', async () => {
    // Real failure injection for the FK that replaced guard_master_soft_delete:
    // enrollment.home_teacher_id -> account(id) ON DELETE RESTRICT. Giving
    // the account an enrollment makes the delete fail for a real referential-
    // integrity reason, not a mocked one.
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Referenced Teacher',
        email: `referenced_${Date.now()}@example.com`,
        password: 'correct-horse-battery',
        role: 'teacher',
      });
    expect(createResponse.status).toBe(201);
    const accountId: string = createResponse.body.id;

    const courseName = 'Referenced Test Course';
    const [{ id: classId }] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseName, 'Referenced Test Class', accountId],
    );
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4)`,
      [`SV${Date.now()}`.slice(0, 20), 'Referenced Test Student', classId, accountId],
    );

    const deleteResponse = await request(app.getHttpServer())
      .delete(`/accounts/${accountId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // PostgresExceptionFilter maps the FK RESTRICT violation (23503) to 409.
    expect(deleteResponse.status).toBe(409);

    const rows = await dataSource.query(
      `SELECT id FROM examcollect.account WHERE id = $1`,
      [accountId],
    );
    expect(rows).toHaveLength(1);
  });

  /**
   * Vô hiệu hoá thay cho xoá cứng (CLAUDE.md §7.2.8).
   *
   * Xoá cứng một tài khoản đã dạy một lớp là bất khả — FK RESTRICT chặn,
   * và đúng như vậy (test ngay ở trên pin điều đó). Nhưng nhân sự nghỉ
   * việc là chuyện có thật, nên phải có một đường thật để chặn họ đăng
   * nhập mà không phá bất kỳ FK nào đang trỏ tới.
   */
  describe('deactivation', () => {
    const PASSWORD = 'correct-horse-battery';

    async function makeTeacher(prefix: string) {
      const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
      const id = await createTestAccount(dataSource, { email, password: PASSWORD, role: 'teacher' });
      return { id, email };
    }

    function login(email: string) {
      return request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    }

    it('blocks login for a deactivated account, and restores it on reactivate', async () => {
      const teacher = await makeTeacher('deact');

      expect((await login(teacher.email)).status).toBe(200);

      const deactivated = await request(app.getHttpServer())
        .patch(`/accounts/${teacher.id}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(deactivated.status).toBe(204);

      expect((await login(teacher.email)).status).toBe(401);

      const reactivated = await request(app.getHttpServer())
        .patch(`/accounts/${teacher.id}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(reactivated.status).toBe(204);

      expect((await login(teacher.email)).status).toBe(200);
    });

    it('stops a refresh token minted BEFORE the deactivation from issuing new sessions', async () => {
      const teacher = await makeTeacher('deact_refresh');

      const session = await login(teacher.email);
      expect(session.status).toBe(200);
      const refreshToken: string = session.body.refreshToken;

      await request(app.getHttpServer())
        .patch(`/accounts/${teacher.id}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Refresh token sống tới 7 ngày. Nếu chỉ chặn ở `login`, tài khoản
      // đã vô hiệu hoá vẫn tự cấp access token mới suốt một tuần — vô
      // hiệu hoá trên giấy, không có thật.
      const refreshed = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', [`refresh_token=${refreshToken}`]);
      expect(refreshed.status).toBe(401);
    });

    it('does not delete anything — the row and its FK references survive', async () => {
      const teacher = await makeTeacher('deact_keeps');

      await request(app.getHttpServer())
        .patch(`/accounts/${teacher.id}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      const rows = await dataSource.query(
        `SELECT is_active FROM examcollect.account WHERE id = $1`,
        [teacher.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].is_active).toBe(false);
    });

    it('surfaces isActive in the admin account list', async () => {
      const teacher = await makeTeacher('deact_view');
      await request(app.getHttpServer())
        .patch(`/accounts/${teacher.id}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      const listed = await request(app.getHttpServer())
        .get(`/accounts?search=${encodeURIComponent(teacher.email)}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(listed.status).toBe(200);
      const found = listed.body.items.find((a: { id: string }) => a.id === teacher.id);
      expect(found).toMatchObject({ isActive: false });
    });

    it('refuses deactivation to a teacher', async () => {
      const victim = await makeTeacher('deact_victim');
      const attacker = await makeTeacher('deact_attacker');
      const attackerToken = (await login(attacker.email)).body.accessToken;

      const response = await request(app.getHttpServer())
        .patch(`/accounts/${victim.id}/deactivate`)
        .set('Authorization', `Bearer ${attackerToken}`);

      expect(response.status).toBe(403);
    });

    it('404s on an account that does not exist', async () => {
      const response = await request(app.getHttpServer())
        .patch('/accounts/00000000-0000-0000-0000-000000000000/deactivate')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });
  });
});
