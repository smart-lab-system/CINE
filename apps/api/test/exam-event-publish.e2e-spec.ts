import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

const EVENT_START = '2027-03-01T01:00:00.000Z';
const EVENT_END = '2027-03-01T09:00:00.000Z';
const SIT_START = '2027-03-01T02:00:00.000Z';
const SIT_END = '2027-03-01T04:00:00.000Z';
const OVERLAP_START = '2027-06-01T01:00:00.000Z';
const OVERLAP_END = '2027-06-01T09:00:00.000Z';
const OVERLAP_SIT_START = '2027-06-01T02:00:00.000Z';
const OVERLAP_SIT_END = '2027-06-01T04:00:00.000Z';

describe('Exam event publish (e2e)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  const suffix = Date.now();

  let subjectId: string;
  let sectionId: string;
  let labId: string;
  let layoutId: string;
  let leadLecturerId: string;
  let secondLeadLecturerId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const adminUsername = `pb_admin_${suffix}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Publish Admin',
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
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'correct-horse-battery' });
    adminToken = login.body.accessToken;

    const subjectRes = await request(app.getHttpServer())
      .post('/subjects')
      .set(auth())
      .send({
        code: `PBS${suffix}`.slice(0, 16),
        name: 'Publish Subject',
        credits: 3,
      });
    expect(subjectRes.status).toBe(201);
    subjectId = subjectRes.body.id;

    const termRes = await request(app.getHttpServer())
      .post('/academic-terms')
      .set(auth())
      .send({
        code: `PBT${suffix}`.slice(0, 16),
        name: 'Publish term',
        startsOn: '2026-09-01',
        endsOn: '2027-08-31',
      });
    expect(termRes.status).toBe(201);

    const sectionRes = await request(app.getHttpServer())
      .post('/course-sections')
      .set(auth())
      .send({
        subjectId,
        academicTermId: termRes.body.id,
        sectionCode: `PBN${suffix}`.slice(0, 16),
        name: 'Publish section',
      });
    expect(sectionRes.status).toBe(201);
    sectionId = sectionRes.body.id;

    const studentRes = await request(app.getHttpServer())
      .post('/students')
      .set(auth())
      .send({
        studentCode: `P1${suffix}`.slice(0, 16),
        fullName: 'Publish student',
        status: 'active',
      });
    expect(studentRes.status).toBe(201);
    const enrollRes = await request(app.getHttpServer())
      .post(`/course-sections/${sectionId}/enrollments`)
      .set(auth())
      .send({ studentId: studentRes.body.id });
    expect(enrollRes.status).toBe(201);

    const labRes = await request(app.getHttpServer())
      .post('/labs')
      .set(auth())
      .send({
        code: `PBL${suffix}`.slice(0, 16),
        name: 'Publish Lab',
        capacity: 40,
      });
    expect(labRes.status).toBe(201);
    labId = labRes.body.id;

    const layoutRes = await request(app.getHttpServer())
      .post(`/labs/${labId}/layouts`)
      .set(auth())
      .send({ name: 'Publish layout', isActive: true });
    expect(layoutRes.status).toBe(201);
    layoutId = layoutRes.body.id;

    leadLecturerId = await createLinkedLecturer(
      `PBL${suffix}`.slice(0, 16),
      'Publish Lead',
    );
    secondLeadLecturerId = await createLinkedLecturer(
      `PB2${suffix}`.slice(0, 16),
      'Second Publish Lead',
    );
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  async function createLinkedLecturer(
    employeeCode: string,
    fullName: string,
  ): Promise<string> {
    const username = `pb_${employeeCode}`.slice(0, 64);
    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username,
        password: 'correct-horse-battery',
        displayName: fullName,
      });
    expect(register.status).toBe(201);

    const lecturerRes = await request(app.getHttpServer())
      .post('/lecturers')
      .set(auth())
      .send({ employeeCode, fullName, userId: register.body.id });
    expect(lecturerRes.status).toBe(201);
    return lecturerRes.body.id;
  }

  async function createStoredObject(objectKey: string): Promise<string> {
    const sha256Hex = createHash('sha256').update(objectKey).digest('hex');
    const response = await request(app.getHttpServer())
      .post('/stored-objects')
      .set(auth())
      .send({
        bucketName: 'cine-exams',
        objectKey,
        objectUri: `s3://cine-exams/${objectKey}`,
        sha256Hex,
        sizeBytes: 2048,
        contentType: 'application/pdf',
      });
    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    return response.body.id as string;
  }

  async function createDraftEvent(opts: {
    eventCode: string;
    sessionCode: string;
    lecturerId?: string;
    withLead?: boolean;
    withQuestionFile?: boolean;
    scheduledStartAt?: string;
    scheduledEndAt?: string;
    sittingStartAt?: string;
    sittingEndAt?: string;
  }): Promise<{ eventId: string; sessionId: string; rowVersion: number }> {
    const eventRes = await request(app.getHttpServer())
      .post('/exam-events')
      .set(auth())
      .send({
        code: opts.eventCode,
        title: `Publish ${opts.eventCode}`,
        subjectId,
        sessionType: 'exam',
        scheduledStartAt: opts.scheduledStartAt ?? EVENT_START,
        scheduledEndAt: opts.scheduledEndAt ?? EVENT_END,
        durationMinutes: 90,
      });
    expect(eventRes.status).toBe(201);
    const eventId = eventRes.body.id as string;

    const attachRes = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sections`)
      .set(auth())
      .send({ courseSectionId: sectionId });
    expect(attachRes.status).toBe(201);

    const sittingRes = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sessions`)
      .set(auth())
      .send({
        code: opts.sessionCode,
        title: 'Publish sitting',
        labId,
        layoutId,
        scheduledStartAt: opts.sittingStartAt ?? SIT_START,
        scheduledEndAt: opts.sittingEndAt ?? SIT_END,
      });
    expect(sittingRes.status).toBe(201);
    const sessionId = sittingRes.body.id as string;

    if (opts.withLead !== false) {
      const proctorRes = await request(app.getHttpServer())
        .post(`/exam-events/${eventId}/sessions/${sessionId}/proctors`)
        .set(auth())
        .send({ lecturerId: opts.lecturerId ?? leadLecturerId, role: 'lead' });
      expect(proctorRes.status).toBe(201);
    }

    if (opts.withQuestionFile !== false) {
      const storedObjectId = await createStoredObject(
        `questions/${opts.eventCode}.pdf`,
      );
      const fileRes = await request(app.getHttpServer())
        .post(`/exam-events/${eventId}/files`)
        .set(auth())
        .send({
          storedObjectId,
          fileRole: 'question',
          title: 'Question paper',
          sortOrder: 0,
        });
      expect(fileRes.status).toBe(201);
    }

    const detail = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}`)
      .set(auth());
    expect(detail.status).toBe(200);

    return {
      eventId,
      sessionId,
      rowVersion: detail.body.rowVersion as number,
    };
  }

  async function publishEvent(eventId: string, rowVersion: number) {
    return request(app.getHttpServer())
      .post(`/exam-events/${eventId}/status`)
      .set(auth())
      .send({
        toStatus: 'scheduled',
        reason: 'Ready to publish',
        rowVersion,
      });
  }

  it('rejects stored-object creation without a token', async () => {
    const response = await request(app.getHttpServer())
      .post('/stored-objects')
      .send({
        bucketName: 'cine-exams',
        objectKey: 'questions/unauth.pdf',
        objectUri: 's3://cine-exams/questions/unauth.pdf',
        sha256Hex: createHash('sha256').update('unauth').digest('hex'),
        sizeBytes: 1,
      });
    expect(response.status).toBe(401);
  });

  it('creates a stub stored object and attaches it as a question file', async () => {
    const { eventId } = await createDraftEvent({
      eventCode: `PBF${suffix}`.slice(0, 16),
      sessionCode: `PBS${suffix}`.slice(0, 16),
      withQuestionFile: false,
    });
    const storedObjectId = await createStoredObject(
      `questions/attach-${suffix}.pdf`,
    );

    const fileRes = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/files`)
      .set(auth())
      .send({
        storedObjectId,
        fileRole: 'question',
        title: 'Midterm questions',
      });
    expect(fileRes.status).toBe(201);
    expect(fileRes.body.id).toBeDefined();

    const detail = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}`)
      .set(auth());
    expect(detail.status).toBe(200);
    expect(detail.body.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: fileRes.body.id,
          storedObjectId,
          fileRole: 'question',
          title: 'Midterm questions',
        }),
      ]),
    );
  });

  it('rejects publish when the event has no question file', async () => {
    const { eventId, rowVersion } = await createDraftEvent({
      eventCode: `PBQ${suffix}`.slice(0, 16),
      sessionCode: `PBQ${suffix}`.slice(0, 16),
      withQuestionFile: false,
    });

    const response = await publishEvent(eventId, rowVersion);
    expect([400, 409]).toContain(response.status);
    expect(String(response.body.message)).toMatch(/question file/i);

    const detail = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}`)
      .set(auth());
    expect(detail.body.status).toBe('draft');
    expect(detail.body.manifestSha256).toBeNull();
  });

  it('rejects publish when a sitting has no lead proctor', async () => {
    const { eventId, rowVersion } = await createDraftEvent({
      eventCode: `PBNL${suffix}`.slice(0, 16),
      sessionCode: `PBNL${suffix}`.slice(0, 16),
      withLead: false,
    });

    const response = await publishEvent(eventId, rowVersion);
    expect([400, 409]).toContain(response.status);
    expect(String(response.body.message)).toMatch(/lead proctor/i);

    const detail = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}`)
      .set(auth());
    expect(detail.body.status).toBe('draft');
  });

  it('publishes a complete draft: event and rooms become scheduled and the manifest hash is set', async () => {
    const { eventId, sessionId, rowVersion } = await createDraftEvent({
      eventCode: `PBH${suffix}`.slice(0, 16),
      sessionCode: `PBH${suffix}`.slice(0, 16),
    });

    const response = await publishEvent(eventId, rowVersion);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('scheduled');
    expect(response.body.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(response.body.manifestPublishedAt).toBeDefined();
    expect(response.body.rowVersion).toBeGreaterThan(rowVersion);

    const [row] = await dataSource.query(
      `SELECT status, encode(manifest_sha256, 'hex') AS manifest
       FROM lab_management.exam_events WHERE id = $1`,
      [eventId],
    );
    expect(row.status).toBe('scheduled');
    expect(row.manifest).toMatch(/^[a-f0-9]{64}$/);

    const sessions = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/sessions`)
      .set(auth());
    expect(sessions.status).toBe(200);
    const sitting = sessions.body.items.find(
      (s: { id: string }) => s.id === sessionId,
    );
    expect(sitting.status).toBe('scheduled');

    const detail = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}`)
      .set(auth());
    expect(detail.body.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: sessionId, status: 'scheduled' }),
      ]),
    );

    const frozen = await request(app.getHttpServer())
      .patch(`/exam-events/${eventId}`)
      .set(auth())
      .send({ title: 'should not apply', rowVersion: response.body.rowVersion });
    expect(frozen.status).toBe(409);
  });

  it('rejects overlapping scheduled sittings on the same lab with 409', async () => {
    const first = await createDraftEvent({
      eventCode: `PBO1${suffix}`.slice(0, 16),
      sessionCode: `PBO1${suffix}`.slice(0, 16),
      lecturerId: leadLecturerId,
      scheduledStartAt: OVERLAP_START,
      scheduledEndAt: OVERLAP_END,
      sittingStartAt: OVERLAP_SIT_START,
      sittingEndAt: OVERLAP_SIT_END,
    });
    const second = await createDraftEvent({
      eventCode: `PBO2${suffix}`.slice(0, 16),
      sessionCode: `PBO2${suffix}`.slice(0, 16),
      lecturerId: secondLeadLecturerId,
      scheduledStartAt: OVERLAP_START,
      scheduledEndAt: OVERLAP_END,
      sittingStartAt: OVERLAP_SIT_START,
      sittingEndAt: OVERLAP_SIT_END,
    });

    const firstPublish = await publishEvent(first.eventId, first.rowVersion);
    expect(firstPublish.status).toBe(200);

    const secondPublish = await publishEvent(second.eventId, second.rowVersion);
    expect(secondPublish.status).toBe(409);
    expect(String(secondPublish.body.message)).toMatch(
      /lab|overlap|booked|conflict/i,
    );

    const secondDetail = await request(app.getHttpServer())
      .get(`/exam-events/${second.eventId}`)
      .set(auth());
    expect(secondDetail.body.status).toBe('draft');
  });
});
