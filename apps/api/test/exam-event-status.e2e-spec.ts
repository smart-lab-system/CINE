import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

const FUTURE_START = '2027-09-01T01:00:00.000Z';
const FUTURE_END = '2027-09-01T09:00:00.000Z';

describe('Exam event and lab session status (e2e)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let adminUserId: string;
  const suffix = Date.now();
  let seq = 0;

  let subjectId: string;
  let sectionId: string;

  const UNKNOWN_ID = '00000000-0000-4000-8000-000000000001';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const adminUsername = `st_admin_${suffix}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Status Admin',
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
    adminUserId = userId;
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'correct-horse-battery' });
    adminToken = login.body.accessToken;

    const subjectRes = await request(app.getHttpServer())
      .post('/subjects')
      .set(auth())
      .send({
        code: `STS${suffix}`.slice(0, 16),
        name: 'Status Subject',
        credits: 3,
      });
    expect(subjectRes.status).toBe(201);
    subjectId = subjectRes.body.id;

    const termRes = await request(app.getHttpServer())
      .post('/academic-terms')
      .set(auth())
      .send({
        code: `STT${suffix}`.slice(0, 16),
        name: 'Status term',
        startsOn: '2026-09-01',
        endsOn: '2027-12-31',
      });
    expect(termRes.status).toBe(201);

    const sectionRes = await request(app.getHttpServer())
      .post('/course-sections')
      .set(auth())
      .send({
        subjectId,
        academicTermId: termRes.body.id,
        sectionCode: `STN${suffix}`.slice(0, 16),
        name: 'Status section',
      });
    expect(sectionRes.status).toBe(201);
    sectionId = sectionRes.body.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  function nextCode(prefix: string): string {
    seq += 1;
    return `${prefix}${seq}${suffix}`.slice(0, 16);
  }

  function liveWindow() {
    const start = new Date(Date.now() - 60_000);
    const end = new Date(Date.now() + 4 * 60 * 60 * 1000);
    return {
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: end.toISOString(),
      sittingStartAt: start.toISOString(),
      sittingEndAt: end.toISOString(),
    };
  }

  async function createLinkedLecturer(
    employeeCode: string,
    fullName: string,
  ): Promise<string> {
    const username = `st_${employeeCode}`.slice(0, 64);
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
    return lecturerRes.body.id as string;
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
    return response.body.id as string;
  }

  async function createDraftEvent(opts: {
    window?: {
      scheduledStartAt: string;
      scheduledEndAt: string;
      sittingStartAt: string;
      sittingEndAt: string;
    };
  } = {}): Promise<{
    eventId: string;
    sessionId: string;
    eventRowVersion: number;
  }> {
    const window = opts.window ?? {
      scheduledStartAt: FUTURE_START,
      scheduledEndAt: FUTURE_END,
      sittingStartAt: FUTURE_START,
      sittingEndAt: FUTURE_END,
    };

    const labRes = await request(app.getHttpServer())
      .post('/labs')
      .set(auth())
      .send({
        code: nextCode('STL'),
        name: 'Status Lab',
        capacity: 40,
      });
    expect(labRes.status).toBe(201);

    const layoutRes = await request(app.getHttpServer())
      .post(`/labs/${labRes.body.id}/layouts`)
      .set(auth())
      .send({ name: 'Status layout', isActive: true });
    expect(layoutRes.status).toBe(201);

    const lecturerId = await createLinkedLecturer(
      nextCode('STE'),
      'Status Lead',
    );

    const eventCode = nextCode('STE');
    const eventRes = await request(app.getHttpServer())
      .post('/exam-events')
      .set(auth())
      .send({
        code: eventCode,
        title: `Status ${eventCode}`,
        subjectId,
        sessionType: 'exam',
        scheduledStartAt: window.scheduledStartAt,
        scheduledEndAt: window.scheduledEndAt,
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
        code: nextCode('STS'),
        title: 'Status sitting',
        labId: labRes.body.id,
        layoutId: layoutRes.body.id,
        scheduledStartAt: window.sittingStartAt,
        scheduledEndAt: window.sittingEndAt,
      });
    expect(sittingRes.status).toBe(201);
    const sessionId = sittingRes.body.id as string;

    const proctorRes = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sessions/${sessionId}/proctors`)
      .set(auth())
      .send({ lecturerId, role: 'lead' });
    expect(proctorRes.status).toBe(201);

    const storedObjectId = await createStoredObject(
      `questions/${eventCode}.pdf`,
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

    const detail = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}`)
      .set(auth());
    expect(detail.status).toBe(200);

    return {
      eventId,
      sessionId,
      eventRowVersion: detail.body.rowVersion as number,
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

  async function getSession(eventId: string, sessionId: string) {
    return request(app.getHttpServer())
      .get(`/exam-events/${eventId}/sessions/${sessionId}`)
      .set(auth());
  }

  async function transitionSession(
    eventId: string,
    sessionId: string,
    toStatus: string,
    rowVersion: number,
    reason = 'status change',
  ) {
    return request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sessions/${sessionId}/status`)
      .set(auth())
      .send({ toStatus, reason, rowVersion });
  }

  it('starts a scheduled room inside the event window and the event becomes active', async () => {
    const { eventId, sessionId, eventRowVersion } = await createDraftEvent({
      window: liveWindow(),
    });

    const published = await publishEvent(eventId, eventRowVersion);
    expect(published.status).toBe(200);
    expect(published.body.status).toBe('scheduled');

    const sitting = await getSession(eventId, sessionId);
    expect(sitting.status).toBe(200);
    expect(sitting.body.status).toBe('scheduled');

    const started = await transitionSession(
      eventId,
      sessionId,
      'active',
      sitting.body.rowVersion as number,
      'Proctor opened the room',
    );
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('active');
    expect(started.status).not.toBe(500);

    const event = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}`)
      .set(auth());
    expect(event.status).toBe(200);
    expect(event.body.status).toBe('active');
  });

  it('cancels a draft event with no actual starts and cancels its rooms', async () => {
    const { eventId, sessionId, eventRowVersion } = await createDraftEvent();

    const cancelled = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/status`)
      .set(auth())
      .send({
        toStatus: 'cancelled',
        reason: 'Planner withdrew the draft',
        rowVersion: eventRowVersion,
      });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelled');

    const sitting = await getSession(eventId, sessionId);
    expect(sitting.status).toBe(200);
    expect(sitting.body.status).toBe('cancelled');
  });

  it('cancels a scheduled event with no actual starts and cancels its rooms', async () => {
    const { eventId, sessionId, eventRowVersion } = await createDraftEvent();

    const published = await publishEvent(eventId, eventRowVersion);
    expect(published.status).toBe(200);

    const cancelled = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/status`)
      .set(auth())
      .send({
        toStatus: 'cancelled',
        reason: 'Planner cancelled before start',
        rowVersion: published.body.rowVersion,
      });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelled');

    const sitting = await getSession(eventId, sessionId);
    expect(sitting.status).toBe(200);
    expect(sitting.body.status).toBe('cancelled');
  });

  it('rejects an illegal event transition with 400 or 409, not 500', async () => {
    const { eventId, eventRowVersion } = await createDraftEvent();

    const response = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/status`)
      .set(auth())
      .send({
        toStatus: 'completed',
        reason: 'skip the fsm',
        rowVersion: eventRowVersion,
      });
    expect([400, 409]).toContain(response.status);
    expect(response.status).not.toBe(500);

    const detail = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}`)
      .set(auth());
    expect(detail.body.status).toBe('draft');
  });

  it('rejects an illegal session transition with 400 or 409, not 500', async () => {
    const { eventId, sessionId, eventRowVersion } = await createDraftEvent();

    const published = await publishEvent(eventId, eventRowVersion);
    expect(published.status).toBe(200);

    const sitting = await getSession(eventId, sessionId);
    expect(sitting.status).toBe(200);

    const response = await transitionSession(
      eventId,
      sessionId,
      'completed',
      sitting.body.rowVersion as number,
      'skip the fsm',
    );
    expect([400, 409]).toContain(response.status);
    expect(response.status).not.toBe(500);

    const after = await getSession(eventId, sessionId);
    expect(after.body.status).toBe('scheduled');
  });

  it('completing the last active room lets the event complete via reconcile', async () => {
    const { eventId, sessionId, eventRowVersion } = await createDraftEvent({
      window: liveWindow(),
    });

    const published = await publishEvent(eventId, eventRowVersion);
    expect(published.status).toBe(200);

    const sitting = await getSession(eventId, sessionId);
    const started = await transitionSession(
      eventId,
      sessionId,
      'active',
      sitting.body.rowVersion as number,
      'Open room',
    );
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('active');

    const completed = await transitionSession(
      eventId,
      sessionId,
      'completed',
      started.body.rowVersion as number,
      'Close room',
    );
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe('completed');

    const event = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}`)
      .set(auth());
    expect(event.status).toBe(200);
    expect(event.body.status).toBe('completed');
  });

  it('aborts an active event and aborts its started rooms', async () => {
    const { eventId, sessionId, eventRowVersion } = await createDraftEvent({
      window: liveWindow(),
    });

    const published = await publishEvent(eventId, eventRowVersion);
    expect(published.status).toBe(200);

    const sitting = await getSession(eventId, sessionId);
    const started = await transitionSession(
      eventId,
      sessionId,
      'active',
      sitting.body.rowVersion as number,
      'Open room',
    );
    expect(started.status).toBe(200);

    const eventAfterStart = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}`)
      .set(auth());
    expect(eventAfterStart.body.status).toBe('active');

    const aborted = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/status`)
      .set(auth())
      .send({
        toStatus: 'aborted',
        reason: 'Incident during the sitting',
        rowVersion: eventAfterStart.body.rowVersion,
      });
    expect(aborted.status).toBe(200);
    expect(aborted.body.status).toBe('aborted');

    const after = await getSession(eventId, sessionId);
    expect(after.body.status).toBe('aborted');
  });

  it('rejects status-history reads without a token', async () => {
    const eventRes = await request(app.getHttpServer()).get(
      `/exam-events/${UNKNOWN_ID}/status-history`,
    );
    expect(eventRes.status).toBe(401);

    const sessionRes = await request(app.getHttpServer()).get(
      `/exam-events/${UNKNOWN_ID}/sessions/${UNKNOWN_ID}/status-history`,
    );
    expect(sessionRes.status).toBe(401);
  });

  it('returns 404 for status-history of an unknown event or sitting', async () => {
    const eventRes = await request(app.getHttpServer())
      .get(`/exam-events/${UNKNOWN_ID}/status-history`)
      .set(auth());
    expect(eventRes.status).toBe(404);

    const { eventId } = await createDraftEvent();
    const sessionRes = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/sessions/${UNKNOWN_ID}/status-history`)
      .set(auth());
    expect(sessionRes.status).toBe(404);
  });

  it('records created on insert and the GUC reason or status_transition on publish', async () => {
    const { eventId, sessionId, eventRowVersion } = await createDraftEvent();

    const afterCreate = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/status-history`)
      .set(auth());
    expect(afterCreate.status).toBe(200);
    expectHistoryList(afterCreate.body);
    expect(afterCreate.body.items).toHaveLength(1);
    expectCreatedRow(afterCreate.body.items[0], 'draft');

    const sessionAfterCreate = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/sessions/${sessionId}/status-history`)
      .set(auth());
    expect(sessionAfterCreate.status).toBe(200);
    expectHistoryList(sessionAfterCreate.body);
    expect(sessionAfterCreate.body.items).toHaveLength(1);
    expectCreatedRow(sessionAfterCreate.body.items[0], 'draft');

    const published = await publishEvent(eventId, eventRowVersion);
    expect(published.status).toBe(200);

    const afterPublish = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/status-history`)
      .set(auth());
    expect(afterPublish.status).toBe(200);
    expectHistoryList(afterPublish.body);
    expect(afterPublish.body.items.map((row: HistoryRow) => row.toStatus)).toEqual(
      ['draft', 'scheduled'],
    );
    expectCreatedRow(afterPublish.body.items[0], 'draft');
    expectTransitionRow(afterPublish.body.items[1], {
      fromStatus: 'draft',
      toStatus: 'scheduled',
      reasons: ['Ready to publish', 'status_transition:draft->scheduled'],
      actorType: 'user',
      changedBy: adminUserId,
    });

    const sessionAfterPublish = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/sessions/${sessionId}/status-history`)
      .set(auth());
    expect(sessionAfterPublish.status).toBe(200);
    expectHistoryList(sessionAfterPublish.body);
    expect(
      sessionAfterPublish.body.items.map((row: HistoryRow) => row.toStatus),
    ).toEqual(['draft', 'scheduled']);
    expectCreatedRow(sessionAfterPublish.body.items[0], 'draft');
    expectTransitionRow(sessionAfterPublish.body.items[1], {
      fromStatus: 'draft',
      toStatus: 'scheduled',
      reasons: [
        'event_scheduled',
        'Ready to publish',
        'status_transition:draft->scheduled',
      ],
    });
  });

  it('appends session start and event reconcile to status history in order', async () => {
    const { eventId, sessionId, eventRowVersion } = await createDraftEvent({
      window: liveWindow(),
    });

    const published = await publishEvent(eventId, eventRowVersion);
    expect(published.status).toBe(200);

    const sitting = await getSession(eventId, sessionId);
    const started = await transitionSession(
      eventId,
      sessionId,
      'active',
      sitting.body.rowVersion as number,
      'Proctor opened the room',
    );
    expect(started.status).toBe(200);

    const sessionHistory = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/sessions/${sessionId}/status-history`)
      .set(auth());
    expect(sessionHistory.status).toBe(200);
    expect(
      sessionHistory.body.items.map((row: HistoryRow) => row.toStatus),
    ).toEqual(['draft', 'scheduled', 'active']);
    expectTransitionRow(sessionHistory.body.items[2], {
      fromStatus: 'scheduled',
      toStatus: 'active',
      reasons: [
        'Proctor opened the room',
        'status_transition:scheduled->active',
      ],
      actorType: 'user',
      changedBy: adminUserId,
    });

    const eventHistory = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/status-history`)
      .set(auth());
    expect(eventHistory.status).toBe(200);
    expect(eventHistory.body.items.map((row: HistoryRow) => row.toStatus)).toEqual(
      ['draft', 'scheduled', 'active'],
    );
    expectTransitionRow(eventHistory.body.items[2], {
      fromStatus: 'scheduled',
      toStatus: 'active',
      reasons: [
        'first_lab_session_active',
        'Proctor opened the room',
        'status_transition:scheduled->active',
      ],
    });
  });
});

type HistoryRow = {
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  actorType: string;
  changedBy: string | null;
  commandId: string;
  createdAt: string;
};

function expectHistoryList(body: { items: HistoryRow[]; total?: number }) {
  expect(Array.isArray(body.items)).toBe(true);
  expect(body.items.length).toBeGreaterThan(0);
  if (body.total !== undefined) {
    expect(body.total).toBe(body.items.length);
  }
  for (const row of body.items) {
    expect(row.fromStatus === null || typeof row.fromStatus === 'string').toBe(
      true,
    );
    expect(typeof row.toStatus).toBe('string');
    expect(typeof row.reason).toBe('string');
    expect(['user', 'system']).toContain(row.actorType);
    expect(row.changedBy === null || typeof row.changedBy === 'string').toBe(
      true,
    );
    expect(row.commandId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(Number.isNaN(Date.parse(row.createdAt))).toBe(false);
  }
  for (let i = 1; i < body.items.length; i += 1) {
    expect(Date.parse(body.items[i - 1].createdAt)).toBeLessThanOrEqual(
      Date.parse(body.items[i].createdAt),
    );
  }
}

function expectCreatedRow(row: HistoryRow, toStatus: string) {
  expect(row.fromStatus).toBeNull();
  expect(row.toStatus).toBe(toStatus);
  expect(row.reason).toBe('created');
}

function expectTransitionRow(
  row: HistoryRow,
  opts: {
    fromStatus: string;
    toStatus: string;
    reasons: string[];
    actorType?: 'user' | 'system';
    changedBy?: string | null;
  },
) {
  expect(row.fromStatus).toBe(opts.fromStatus);
  expect(row.toStatus).toBe(opts.toStatus);
  expect(opts.reasons).toContain(row.reason);
  if (opts.actorType) {
    expect(row.actorType).toBe(opts.actorType);
  }
  if (opts.changedBy !== undefined) {
    expect(row.changedBy).toBe(opts.changedBy);
  } else if (row.actorType === 'system') {
    expect(row.changedBy).toBeNull();
  } else {
    expect(typeof row.changedBy).toBe('string');
  }
}
