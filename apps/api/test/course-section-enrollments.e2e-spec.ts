import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

describe('CourseSectionEnrollments (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;
  let sectionId: string;
  let studentId: string;

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
    const adminUsername = `enroll_admin_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Enrollments Test Admin',
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
      .send({ code: `ENRSUBJ_${Date.now()}`, name: 'Enrollments Test Subject' });

    const termResponse = await request(app.getHttpServer())
      .post('/academic-terms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `ENRTERM_${Date.now()}`,
        name: 'Enrollments Test Term',
        startsOn: '2026-09-01',
        endsOn: '2027-01-15',
      });

    const sectionResponse = await request(app.getHttpServer())
      .post('/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId: subjectResponse.body.id,
        academicTermId: termResponse.body.id,
        sectionCode: `ENRSEC_${Date.now()}`,
      });
    sectionId = sectionResponse.body.id;

    const studentResponse = await request(app.getHttpServer())
      .post('/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentCode: `ENRSTU_${Date.now()}`, fullName: 'Enrollment Test Student' });
    studentId = studentResponse.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects enrolling into a non-existent course section', async () => {
    const response = await request(app.getHttpServer())
      .post('/course-sections/00000000-0000-0000-0000-000000000000/enrollments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId });

    expect(response.status).toBe(404);
  });

  it('enrolls a student into a course section', async () => {
    const response = await request(app.getHttpServer())
      .post(`/course-sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
  });

  it('rejects enrolling the same student twice', async () => {
    const response = await request(app.getHttpServer())
      .post(`/course-sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId });

    expect(response.status).toBe(409);
  });

  it('lists enrollments with joined student display fields', async () => {
    const response = await request(app.getHttpServer())
      .get(`/course-sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].student.id).toBe(studentId);
  });

  it('unenrolls a student', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/course-sections/${sectionId}/enrollments/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(204);
  });

  it('404s unenrolling a student who is not (or no longer) enrolled', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/course-sections/${sectionId}/enrollments/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });
});
