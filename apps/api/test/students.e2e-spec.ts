import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

describe('Students (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // e2e tests build the app independently of main.ts's bootstrap(), so the
    // global exception filter isn't picked up automatically — same fix
    // accounts.e2e-spec.ts already applies.
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    const dataSource = app.get(DataSource);
    const adminUsername = `students_admin_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Students Test Admin',
    });

    const [{ id: userId }] = await dataSource.query(
      `SELECT id FROM lab_management.users WHERE username = $1`,
      [adminUsername],
    );
    const [{ id: roleId }] = await dataSource.query(
      `SELECT id FROM lab_management.roles WHERE code = 'admin'`,
    );
    await dataSource.query(
      `INSERT INTO lab_management.user_roles (user_id, role_id) VALUES ($1, $2)`,
      [userId, roleId],
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'correct-horse-battery' });
    adminToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  let createdStudentId: string;

  it('rejects creating a student without a token', async () => {
    const response = await request(app.getHttpServer())
      .post('/students')
      .send({ studentCode: `nope_${Date.now()}`, fullName: 'No Auth' });

    expect(response.status).toBe(401);
  });

  it('creates a student as admin', async () => {
    const response = await request(app.getHttpServer())
      .post('/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        studentCode: `SV_${Date.now()}`,
        fullName: 'Tran Thi B',
        classCode: 'D20CQCE01',
        cohortYear: 2020,
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    createdStudentId = response.body.id;
  });

  it('searches students', async () => {
    const response = await request(app.getHttpServer())
      .get('/students?search=Tran+Thi+B&page=1&pageSize=20')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.items.some((item: any) => item.id === createdStudentId),
    ).toBe(true);
  });

  it('updates a student', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/students/${createdStudentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ classCode: 'D20CQCE02' });

    expect(response.status).toBe(200);
    expect(response.body.classCode).toBe('D20CQCE02');
  });

  it('deletes a student with no active enrollments', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/students/${createdStudentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(204);
  });
});
