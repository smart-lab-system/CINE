import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

describe('AcademicTerms (e2e)', () => {
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
    const adminUsername = `terms_admin_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Terms Test Admin',
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

  let createdTermId: string;

  it('rejects a term with endsOn before startsOn', async () => {
    const response = await request(app.getHttpServer())
      .post('/academic-terms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `BADTERM_${Date.now()}`,
        name: 'Bad Term',
        startsOn: '2026-09-01',
        endsOn: '2026-08-01',
      });

    expect(response.status).toBe(400);
  });

  it('creates an academic term as admin', async () => {
    const response = await request(app.getHttpServer())
      .post('/academic-terms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `TERM_${Date.now()}`,
        name: 'HK1 2026-2027',
        startsOn: '2026-09-01',
        endsOn: '2027-01-15',
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    createdTermId = response.body.id;
  });

  it('searches academic terms', async () => {
    const response = await request(app.getHttpServer())
      .get('/academic-terms?search=HK1&page=1&pageSize=20')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.items.some((item: any) => item.id === createdTermId),
    ).toBe(true);
  });

  it('updates an academic term', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/academic-terms/${createdTermId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'HK1 2026-2027 (Updated)', isActive: false });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('HK1 2026-2027 (Updated)');
    expect(response.body.isActive).toBe(false);
  });

  it('deletes an academic term with no active course sections', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/academic-terms/${createdTermId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(204);
  });
});
