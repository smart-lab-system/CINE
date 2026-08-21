import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

describe('CourseSections (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;
  let subjectId: string;
  let termId: string;

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
    const adminUsername = `sections_admin_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Sections Test Admin',
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

    const subjectResponse = await request(app.getHttpServer())
      .post('/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `CSSUBJ_${Date.now()}`, name: 'Course Sections Test Subject' });
    subjectId = subjectResponse.body.id;

    const termResponse = await request(app.getHttpServer())
      .post('/academic-terms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `CSTERM_${Date.now()}`,
        name: 'Course Sections Test Term',
        startsOn: '2026-09-01',
        endsOn: '2027-01-15',
      });
    termId = termResponse.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  let createdSectionId: string;

  it('rejects a course section referencing a non-existent subject', async () => {
    const response = await request(app.getHttpServer())
      .post('/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId: '00000000-0000-0000-0000-000000000000',
        academicTermId: termId,
        sectionCode: `NOPE_${Date.now()}`,
      });

    expect(response.status).toBe(400);
  });

  it('creates a course section as admin', async () => {
    const response = await request(app.getHttpServer())
      .post('/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId,
        academicTermId: termId,
        sectionCode: `SEC_${Date.now()}`,
        nominalClassCode: 'D20CQCE01',
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    createdSectionId = response.body.id;
  });

  it('searches course sections with joined subject/term display fields', async () => {
    const response = await request(app.getHttpServer())
      .get(`/course-sections?academicTermId=${termId}&page=1&pageSize=20`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    const found = response.body.items.find(
      (item: any) => item.id === createdSectionId,
    );
    expect(found).toBeDefined();
    expect(found.subject.id).toBe(subjectId);
    expect(found.academicTerm.id).toBe(termId);
  });

  it('updates a course section', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/course-sections/${createdSectionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Section Name' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Updated Section Name');
  });

  it('deletes a course section with no active enrollments', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/course-sections/${createdSectionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(204);
  });
});
