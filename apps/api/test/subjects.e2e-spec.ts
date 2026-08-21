import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

describe('Subjects (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;

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

    dataSource = app.get(DataSource);
    const adminUsername = `subjects_admin_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Subjects Test Admin',
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

  let createdSubjectId: string;

  it('rejects creating a subject without a token', async () => {
    const response = await request(app.getHttpServer())
      .post('/subjects')
      .send({ code: `nope_${Date.now()}`, name: 'No Auth' });

    expect(response.status).toBe(401);
  });

  it('creates a subject as admin', async () => {
    const response = await request(app.getHttpServer())
      .post('/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `SUBJ_${Date.now()}`, name: 'Data Structures', credits: 4 });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    createdSubjectId = response.body.id;
  });

  it('searches subjects', async () => {
    const response = await request(app.getHttpServer())
      .get('/subjects?search=Data+Structures&page=1&pageSize=20')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThanOrEqual(1);
    expect(
      response.body.items.some((item: any) => item.id === createdSubjectId),
    ).toBe(true);
  });

  it('updates a subject', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/subjects/${createdSubjectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Data Structures & Algorithms', credits: 5 });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Data Structures & Algorithms');
    expect(response.body.credits).toBe(5);
  });

  it('rejects soft-deleting a subject that still has an active course section', async () => {
    const [{ id: termId }] = await dataSource.query(
      `INSERT INTO lab_management.academic_terms (code, name, starts_on, ends_on)
       VALUES ($1, 'Guard Test Term', now(), now() + interval '1 day')
       RETURNING id`,
      [`GUARDTERM_${Date.now()}`],
    );
    await dataSource.query(
      `INSERT INTO lab_management.course_sections
         (subject_id, academic_term_id, section_code)
       VALUES ($1, $2, $3)`,
      [createdSubjectId, termId, `GUARDSEC_${Date.now()}`],
    );

    const response = await request(app.getHttpServer())
      .delete(`/subjects/${createdSubjectId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(409);

    const [{ deleted_at }] = await dataSource.query(
      `SELECT deleted_at FROM lab_management.subjects WHERE id = $1`,
      [createdSubjectId],
    );
    expect(deleted_at).toBeNull();
  });
});
