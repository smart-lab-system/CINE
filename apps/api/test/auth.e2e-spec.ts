import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
  });

  afterAll(async () => {
    await app.close();
  });

  const username = `auth_test_${Date.now()}`;

  it('registers a new account', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username,
        password: 'correct-horse-battery',
        displayName: 'Auth Test User',
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
  });

  it('rejects login with the wrong password', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'wrong-password' });

    expect(response.status).toBe(401);
  });

  it('logs in with the correct password and returns tokens', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'correct-horse-battery' });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
    expect(response.body.user.username).toBe(username);
  });

  it('excludes a soft-deleted role assignment from the login roles claim', async () => {
    const roleUsername = `auth_test_role_${Date.now()}`;

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: roleUsername,
        password: 'correct-horse-battery',
        displayName: 'Auth Role Test User',
      });
    const userId: string = registerResponse.body.id;

    const [studentRole] = await dataSource.query(
      `SELECT id FROM lab_management.roles WHERE code = $1`,
      ['student'],
    );

    const [userRoleRow] = await dataSource.query(
      `INSERT INTO lab_management.user_roles (user_id, role_id)
       VALUES ($1, $2)
       RETURNING id`,
      [userId, studentRole.id],
    );

    const loginWithRole = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: roleUsername, password: 'correct-horse-battery' });

    expect(loginWithRole.status).toBe(200);
    expect(loginWithRole.body.user.roles).toContain('student');

    await dataSource.query(
      `UPDATE lab_management.user_roles SET deleted_at = now() WHERE id = $1`,
      [userRoleRow.id],
    );

    const loginAfterSoftDelete = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: roleUsername, password: 'correct-horse-battery' });

    expect(loginAfterSoftDelete.status).toBe(200);
    expect(loginAfterSoftDelete.body.user.roles).not.toContain('student');
  });
});
