import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000001';

describe('Exam Events (e2e)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let studentToken: string;
  const suffix = Date.now();

  let subjectId: string;
  let otherSubjectId: string;
  let sectionId: string;
  let otherSectionId: string;
  let eventId: string;
  let sectionLinkId: string;
  let eventCode: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);

    const adminUsername = `ex_admin_${suffix}`;
    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Exam Events Admin',
    });
    const [{ id: adminUserId }] = await dataSource.query(
      `SELECT id FROM lab_management.users WHERE username = $1`,
      [adminUsername],
    );
    const [{ id: adminRoleId }] = await dataSource.query(
      `SELECT id FROM lab_management.roles WHERE code = 'admin'`,
    );
    await dataSource.query(
      `INSERT INTO lab_management.user_roles (user_id, role_id) VALUES ($1, $2)`,
      [adminUserId, adminRoleId],
    );
    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'correct-horse-battery' });
    adminToken = adminLogin.body.accessToken;

    const studentUsername = `ex_stu_${suffix}`;
    await request(app.getHttpServer()).post('/auth/register').send({
      username: studentUsername,
      password: 'correct-horse-battery',
      displayName: 'Exam Events Student',
    });
    const [{ id: studentUserId }] = await dataSource.query(
      `SELECT id FROM lab_management.users WHERE username = $1`,
      [studentUsername],
    );
    const [{ id: studentRoleId }] = await dataSource.query(
      `SELECT id FROM lab_management.roles WHERE code = 'student'`,
    );
    await dataSource.query(
      `INSERT INTO lab_management.user_roles (user_id, role_id) VALUES ($1, $2)`,
      [studentUserId, studentRoleId],
    );
    const studentLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: studentUsername, password: 'correct-horse-battery' });
    studentToken = studentLogin.body.accessToken;

    const subjectRes = await request(app.getHttpServer())
      .post('/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `EXS${suffix}`.slice(0, 16),
        name: 'Exam Subject',
        credits: 3,
      });
    expect(subjectRes.status).toBe(201);
    subjectId = subjectRes.body.id;

    const otherSubjectRes = await request(app.getHttpServer())
      .post('/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `EXO${suffix}`.slice(0, 16),
        name: 'Other Subject',
        credits: 2,
      });
    expect(otherSubjectRes.status).toBe(201);
    otherSubjectId = otherSubjectRes.body.id;

    const termRes = await request(app.getHttpServer())
      .post('/academic-terms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `EXT${suffix}`.slice(0, 16),
        name: 'Exam term',
        startsOn: '2026-09-01',
        endsOn: '2027-01-15',
      });
    expect(termRes.status).toBe(201);

    const sectionRes = await request(app.getHttpServer())
      .post('/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId,
        academicTermId: termRes.body.id,
        sectionCode: `EXN${suffix}`.slice(0, 16),
        name: 'Exam section',
      });
    expect(sectionRes.status).toBe(201);
    sectionId = sectionRes.body.id;

    const otherSectionRes = await request(app.getHttpServer())
      .post('/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId: otherSubjectId,
        academicTermId: termRes.body.id,
        sectionCode: `EXX${suffix}`.slice(0, 16),
        name: 'Other section',
      });
    expect(otherSectionRes.status).toBe(201);
    otherSectionId = otherSectionRes.body.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  const createPayload = (overrides: Record<string, unknown> = {}) => ({
    code: `EX${suffix}`.slice(0, 16),
    title: 'Midterm Algorithms',
    subjectId,
    sessionType: 'exam',
    scheduledStartAt: '2026-11-01T07:00:00.000Z',
    scheduledEndAt: '2026-11-01T12:00:00.000Z',
    durationMinutes: 90,
    ...overrides,
  });

  it('rejects exam event creation without a token', async () => {
    const response = await request(app.getHttpServer())
      .post('/exam-events')
      .send(createPayload());
    expect(response.status).toBe(401);
  });

  it('rejects exam event creation for a non-admin', async () => {
    const response = await request(app.getHttpServer())
      .post('/exam-events')
      .set('Authorization', `Bearer ${studentToken}`)
      .send(createPayload());
    expect(response.status).toBe(403);
  });

  it('rejects create with an unknown subject', async () => {
    const response = await request(app.getHttpServer())
      .post('/exam-events')
      .set(auth())
      .send(createPayload({ subjectId: UNKNOWN_ID }));
    expect(response.status).toBe(404);
  });

  it('creates a draft exam event', async () => {
    const payload = createPayload({
      status: 'scheduled',
      manifestSha256: 'should-be-stripped',
    });
    const response = await request(app.getHttpServer())
      .post('/exam-events')
      .set(auth())
      .send(payload);
    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    eventId = response.body.id;
    eventCode = payload.code as string;
  });

  it('gets the exam event with empty sections, draft status, and rowVersion', async () => {
    const response = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}`)
      .set(auth());
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(eventId);
    expect(response.body.code).toBe(eventCode);
    expect(response.body.title).toBe('Midterm Algorithms');
    expect(response.body.subjectId).toBe(subjectId);
    expect(response.body.sessionType).toBe('exam');
    expect(response.body.status).toBe('draft');
    expect(response.body.durationMinutes).toBe(90);
    expect(response.body.rowVersion).toBe(0);
    expect(response.body.manifestSha256).toBeNull();
    expect(response.body.manifestPublishedAt).toBeNull();
    expect(response.body.sections).toEqual([]);
    expect(response.body.files).toEqual([]);
    expect(response.body.sessions).toEqual([]);
    expect(response.body.createdBy).toBeDefined();
  });

  it('lists exam events filtered by search, subject, and status', async () => {
    const response = await request(app.getHttpServer())
      .get('/exam-events')
      .query({
        search: eventCode,
        subjectId,
        status: 'draft',
        page: 1,
        pageSize: 20,
      })
      .set(auth());
    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThanOrEqual(1);
    expect(response.body.items.some((i: { id: string }) => i.id === eventId)).toBe(
      true,
    );
  });

  it('patches draft exam event metadata', async () => {
    const before = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}`)
      .set(auth());
    const response = await request(app.getHttpServer())
      .patch(`/exam-events/${eventId}`)
      .set(auth())
      .send({
        title: 'Midterm Algorithms (updated)',
        durationMinutes: 120,
        sessionType: 'practice',
        rowVersion: before.body.rowVersion,
      });
    expect(response.status).toBe(200);
    expect(response.body.title).toBe('Midterm Algorithms (updated)');
    expect(response.body.durationMinutes).toBe(120);
    expect(response.body.sessionType).toBe('practice');
    expect(response.body.status).toBe('draft');
    expect(response.body.rowVersion).toBeGreaterThan(before.body.rowVersion);
  });

  it('attaches a course section of the same subject', async () => {
    const response = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sections`)
      .set(auth())
      .send({ courseSectionId: sectionId });
    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    sectionLinkId = response.body.id;

    const detail = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}`)
      .set(auth());
    expect(detail.status).toBe(200);
    expect(detail.body.sections).toHaveLength(1);
    expect(detail.body.sections[0].id).toBe(sectionLinkId);
    expect(detail.body.sections[0].courseSectionId).toBe(sectionId);
    expect(detail.body.sections[0].subjectId).toBe(subjectId);
  });

  it('rejects attaching a course section from a different subject', async () => {
    const response = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sections`)
      .set(auth())
      .send({ courseSectionId: otherSectionId });
    expect(response.status).toBe(400);
  });

  it('rejects attaching an unknown course section', async () => {
    const response = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sections`)
      .set(auth())
      .send({ courseSectionId: UNKNOWN_ID });
    expect(response.status).toBe(404);
  });

  it('removes an attached course section', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/exam-events/${eventId}/sections/${sectionLinkId}`)
      .set(auth());
    expect(response.status).toBe(204);

    const detail = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}`)
      .set(auth());
    expect(detail.status).toBe(200);
    expect(detail.body.sections).toEqual([]);
  });

  it('soft-deletes a draft exam event and hides it from get/list', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/exam-events/${eventId}`)
      .set(auth());
    expect(response.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}`)
      .set(auth());
    expect(getRes.status).toBe(404);

    const listRes = await request(app.getHttpServer())
      .get('/exam-events')
      .query({ search: eventCode })
      .set(auth());
    expect(listRes.status).toBe(200);
    expect(
      listRes.body.items.some((i: { id: string }) => i.id === eventId),
    ).toBe(false);
  });
});
