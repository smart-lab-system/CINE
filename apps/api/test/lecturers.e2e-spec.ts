import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

describe('Lecturers (e2e)', () => {
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
    const adminUsername = `lecturers_admin_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Lecturers Test Admin',
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

  let createdLecturerId: string;

  it('rejects creating a lecturer without a token', async () => {
    const response = await request(app.getHttpServer())
      .post('/lecturers')
      .send({ employeeCode: `nope_${Date.now()}`, fullName: 'No Auth' });

    expect(response.status).toBe(401);
  });

  it('creates a lecturer as admin', async () => {
    const response = await request(app.getHttpServer())
      .post('/lecturers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeCode: `GV_${Date.now()}`,
        fullName: 'Nguyen Van A',
        department: 'Khoa CNTT',
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    createdLecturerId = response.body.id;
  });

  it('searches lecturers', async () => {
    const response = await request(app.getHttpServer())
      .get('/lecturers?search=Nguyen+Van+A&page=1&pageSize=20')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.items.some((item: any) => item.id === createdLecturerId),
    ).toBe(true);
  });

  it('updates a lecturer', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/lecturers/${createdLecturerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ academicTitle: 'Thac si' });

    expect(response.status).toBe(200);
    expect(response.body.academicTitle).toBe('Thac si');
  });

  it('deletes a lecturer with no active proctor assignments', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/lecturers/${createdLecturerId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(204);
  });
});
