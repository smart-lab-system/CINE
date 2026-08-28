import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000001';
const EVENT_START = '2026-12-01T01:00:00.000Z';
const EVENT_END = '2026-12-01T09:00:00.000Z';
const INSIDE_START = '2026-12-01T02:00:00.000Z';
const INSIDE_END = '2026-12-01T04:00:00.000Z';
const OUTSIDE_START = '2026-12-01T10:00:00.000Z';
const OUTSIDE_END = '2026-12-01T11:00:00.000Z';

describe('Lab Sessions (e2e)', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  const suffix = Date.now();

  let subjectId: string;
  let labAId: string;
  let layoutAId: string;
  let labBId: string;
  let layoutBId: string;
  let eventId: string;
  let inheritEventId: string;
  let cancelledEventId: string;
  let sessionId: string;
  let sessionCode: string;
  let leadLecturerId: string;
  let assistantLecturerId: string;
  let secondLeadLecturerId: string;
  let leadProctorId: string;
  let assistantProctorId: string;
  let attachedSectionId: string;
  let unattachedSectionId: string;
  let studentOnEventId: string;
  let studentOnEvent2Id: string;
  let studentOffEventId: string;
  let seatAId: string;
  let seatBId: string;
  let participantId: string;
  let participant2Id: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const adminUsername = `ls_admin_${suffix}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Lab Sessions Admin',
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
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `LSS${suffix}`.slice(0, 16),
        name: 'Session Subject',
        credits: 3,
      });
    expect(subjectRes.status).toBe(201);
    subjectId = subjectRes.body.id;

    const labARes = await request(app.getHttpServer())
      .post('/labs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `LSA${suffix}`.slice(0, 16),
        name: 'Session Lab A',
        capacity: 40,
      });
    expect(labARes.status).toBe(201);
    labAId = labARes.body.id;

    const layoutARes = await request(app.getHttpServer())
      .post(`/labs/${labAId}/layouts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Layout A', isActive: true });
    expect(layoutARes.status).toBe(201);
    layoutAId = layoutARes.body.id;

    const labBRes = await request(app.getHttpServer())
      .post('/labs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `LSB${suffix}`.slice(0, 16),
        name: 'Session Lab B',
        capacity: 20,
      });
    expect(labBRes.status).toBe(201);
    labBId = labBRes.body.id;

    const layoutBRes = await request(app.getHttpServer())
      .post(`/labs/${labBId}/layouts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Layout B', isActive: true });
    expect(layoutBRes.status).toBe(201);
    layoutBId = layoutBRes.body.id;

    eventId = await insertDraftEvent(`LSE${suffix}`.slice(0, 16));
    inheritEventId = await insertDraftEvent(`LSI${suffix}`.slice(0, 16));
    cancelledEventId = await insertDraftEvent(`LSC${suffix}`.slice(0, 16));
    await dataSource.query(
      `UPDATE lab_management.exam_events SET status = 'cancelled' WHERE id = $1`,
      [cancelledEventId],
    );

    leadLecturerId = await createLinkedLecturer(
      `LPL${suffix}`.slice(0, 16),
      'Lead Proctor',
    );
    assistantLecturerId = await createLinkedLecturer(
      `LPA${suffix}`.slice(0, 16),
      'Assistant Proctor',
    );
    secondLeadLecturerId = await createLinkedLecturer(
      `LPB${suffix}`.slice(0, 16),
      'Second Lead',
    );

    const termRes = await request(app.getHttpServer())
      .post('/academic-terms')
      .set(auth())
      .send({
        code: `LST${suffix}`.slice(0, 16),
        name: 'Session term',
        startsOn: '2026-09-01',
        endsOn: '2027-01-15',
      });
    expect(termRes.status).toBe(201);

    const attachedSectionRes = await request(app.getHttpServer())
      .post('/course-sections')
      .set(auth())
      .send({
        subjectId,
        academicTermId: termRes.body.id,
        sectionCode: `LSC${suffix}`.slice(0, 16),
        name: 'Attached section',
      });
    expect(attachedSectionRes.status).toBe(201);
    attachedSectionId = attachedSectionRes.body.id;

    const unattachedSectionRes = await request(app.getHttpServer())
      .post('/course-sections')
      .set(auth())
      .send({
        subjectId,
        academicTermId: termRes.body.id,
        sectionCode: `LSU${suffix}`.slice(0, 16),
        name: 'Unattached section',
      });
    expect(unattachedSectionRes.status).toBe(201);
    unattachedSectionId = unattachedSectionRes.body.id;

    const attachRes = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sections`)
      .set(auth())
      .send({ courseSectionId: attachedSectionId });
    expect(attachRes.status).toBe(201);

    studentOnEventId = await createEnrolledStudent(
      `P1${suffix}`.slice(0, 16),
      'On-event student 1',
      attachedSectionId,
    );
    studentOnEvent2Id = await createEnrolledStudent(
      `P2${suffix}`.slice(0, 16),
      'On-event student 2',
      attachedSectionId,
    );
    studentOffEventId = await createEnrolledStudent(
      `P3${suffix}`.slice(0, 16),
      'Off-event student',
      unattachedSectionId,
    );

    const seatsRes = await request(app.getHttpServer())
      .put(`/labs/${labAId}/layouts/${layoutAId}/seats`)
      .set(auth())
      .send({
        seats: [
          { seatCode: 'A01', positionX: 40, positionY: 60 },
          { seatCode: 'A02', positionX: 140, positionY: 60 },
        ],
      });
    expect(seatsRes.status).toBe(200);
    expect(seatsRes.body.total).toBe(2);
    seatAId = seatsRes.body.items.find(
      (s: { seatCode: string }) => s.seatCode === 'A01',
    ).id;
    seatBId = seatsRes.body.items.find(
      (s: { seatCode: string }) => s.seatCode === 'A02',
    ).id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function insertDraftEvent(code: string): Promise<string> {
    const [row] = await dataSource.query(
      `INSERT INTO lab_management.exam_events (
         code, title, subject_id, session_type,
         scheduled_start_at, scheduled_end_at, duration_minutes
       ) VALUES ($1, $2, $3, 'exam', $4::timestamptz, $5::timestamptz, 90)
       RETURNING id`,
      [code, `Event ${code}`, subjectId, EVENT_START, EVENT_END],
    );
    return row.id;
  }

  async function createLinkedLecturer(
    employeeCode: string,
    fullName: string,
  ): Promise<string> {
    const username = `ls_${employeeCode}`.slice(0, 64);
    const register = await request(app.getHttpServer()).post('/auth/register').send({
      username,
      password: 'correct-horse-battery',
      displayName: fullName,
    });
    expect(register.status).toBe(201);

    const lecturerRes = await request(app.getHttpServer())
      .post('/lecturers')
      .set(auth())
      .send({
        employeeCode,
        fullName,
        userId: register.body.id,
      });
    expect(lecturerRes.status).toBe(201);
    return lecturerRes.body.id;
  }

  async function createEnrolledStudent(
    studentCode: string,
    fullName: string,
    courseSectionId: string,
  ): Promise<string> {
    const studentRes = await request(app.getHttpServer())
      .post('/students')
      .set(auth())
      .send({ studentCode, fullName, status: 'active' });
    expect(studentRes.status).toBe(201);

    const enrollRes = await request(app.getHttpServer())
      .post(`/course-sections/${courseSectionId}/enrollments`)
      .set(auth())
      .send({ studentId: studentRes.body.id });
    expect(enrollRes.status).toBe(201);
    return studentRes.body.id;
  }

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  const sittingPayload = (overrides: Record<string, unknown> = {}) => ({
    code: `LSN${suffix}`.slice(0, 16),
    title: 'Lab A sitting',
    labId: labAId,
    layoutId: layoutAId,
    scheduledStartAt: INSIDE_START,
    scheduledEndAt: INSIDE_END,
    ...overrides,
  });

  it('rejects sitting creation without a token', async () => {
    const response = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sessions`)
      .send(sittingPayload());
    expect(response.status).toBe(401);
  });

  it('creates a sitting inside the event window', async () => {
    const payload = sittingPayload();
    const response = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sessions`)
      .set(auth())
      .send(payload);
    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    sessionId = response.body.id;
    sessionCode = payload.code as string;
  });

  it('lists sittings for the event', async () => {
    const response = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/sessions`)
      .set(auth());
    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThanOrEqual(1);
    expect(
      response.body.items.some((i: { id: string }) => i.id === sessionId),
    ).toBe(true);
  });

  it('gets sitting detail with rowVersion and empty proctor/participant summaries', async () => {
    const response = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/sessions/${sessionId}`)
      .set(auth());
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(sessionId);
    expect(response.body.examEventId).toBe(eventId);
    expect(response.body.code).toBe(sessionCode);
    expect(response.body.title).toBe('Lab A sitting');
    expect(response.body.labId).toBe(labAId);
    expect(response.body.layoutId).toBe(layoutAId);
    expect(new Date(response.body.scheduledStartAt).toISOString()).toBe(
      INSIDE_START,
    );
    expect(new Date(response.body.scheduledEndAt).toISOString()).toBe(
      INSIDE_END,
    );
    expect(response.body.status).toBe('draft');
    expect(response.body.rowVersion).toBe(0);
    expect(response.body.proctors).toEqual([]);
    expect(response.body.participantCount).toBe(0);
  });

  it('inherits the event window when sitting times are omitted', async () => {
    const response = await request(app.getHttpServer())
      .post(`/exam-events/${inheritEventId}/sessions`)
      .set(auth())
      .send({
        code: `LSH${suffix}`.slice(0, 16),
        title: 'Inherited window',
        labId: labAId,
        layoutId: layoutAId,
      });
    expect(response.status).toBe(201);

    const detail = await request(app.getHttpServer())
      .get(`/exam-events/${inheritEventId}/sessions/${response.body.id}`)
      .set(auth());
    expect(detail.status).toBe(200);
    expect(new Date(detail.body.scheduledStartAt).toISOString()).toBe(
      EVENT_START,
    );
    expect(new Date(detail.body.scheduledEndAt).toISOString()).toBe(EVENT_END);
  });

  it('rejects a sitting whose window is outside the event', async () => {
    const response = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sessions`)
      .set(auth())
      .send(
        sittingPayload({
          code: `LSO${suffix}`.slice(0, 16),
          scheduledStartAt: OUTSIDE_START,
          scheduledEndAt: OUTSIDE_END,
        }),
      );
    expect(response.status).toBe(400);
  });

  it('rejects a layout that does not belong to the given lab', async () => {
    const response = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sessions`)
      .set(auth())
      .send(
        sittingPayload({
          code: `LSM${suffix}`.slice(0, 16),
          labId: labAId,
          layoutId: layoutBId,
        }),
      );
    expect(response.status).toBe(400);
  });

  it('patches a draft sitting', async () => {
    const before = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/sessions/${sessionId}`)
      .set(auth());
    const response = await request(app.getHttpServer())
      .patch(`/exam-events/${eventId}/sessions/${sessionId}`)
      .set(auth())
      .send({
        title: 'Lab A sitting (updated)',
        rowVersion: before.body.rowVersion,
      });
    expect(response.status).toBe(200);
    expect(response.body.title).toBe('Lab A sitting (updated)');
    expect(response.body.rowVersion).toBeGreaterThan(before.body.rowVersion);
  });

  it('soft-deletes a draft sitting', async () => {
    const toDelete = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sessions`)
      .set(auth())
      .send(
        sittingPayload({
          code: `LSD${suffix}`.slice(0, 16),
          title: 'To delete',
        }),
      );
    expect(toDelete.status).toBe(201);

    const response = await request(app.getHttpServer())
      .delete(`/exam-events/${eventId}/sessions/${toDelete.body.id}`)
      .set(auth());
    expect(response.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/sessions/${toDelete.body.id}`)
      .set(auth());
    expect(getRes.status).toBe(404);
  });

  it('rejects adding a sitting after the event is no longer draft', async () => {
    const response = await request(app.getHttpServer())
      .post(`/exam-events/${cancelledEventId}/sessions`)
      .set(auth())
      .send(
        sittingPayload({
          code: `LSZ${suffix}`.slice(0, 16),
          title: 'Too late',
        }),
      );
    expect(response.status).toBe(409);
  });

  it('returns 404 for an unknown exam event', async () => {
    const response = await request(app.getHttpServer())
      .post(`/exam-events/${UNKNOWN_ID}/sessions`)
      .set(auth())
      .send(sittingPayload({ code: `LSU${suffix}`.slice(0, 16) }));
    expect(response.status).toBe(404);
  });

  it('assigns a lead proctor whose lecturer is linked to an active user', async () => {
    const response = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sessions/${sessionId}/proctors`)
      .set(auth())
      .send({ lecturerId: leadLecturerId, role: 'lead' });
    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    leadProctorId = response.body.id;

    const detail = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/sessions/${sessionId}`)
      .set(auth());
    expect(detail.status).toBe(200);
    expect(detail.body.proctors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: leadProctorId,
          lecturerId: leadLecturerId,
          role: 'lead',
        }),
      ]),
    );
  });

  it('rejects a second lead proctor', async () => {
    const response = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sessions/${sessionId}/proctors`)
      .set(auth())
      .send({ lecturerId: secondLeadLecturerId, role: 'lead' });
    expect(response.status).toBe(409);
  });

  it('removes an assistant proctor', async () => {
    const added = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sessions/${sessionId}/proctors`)
      .set(auth())
      .send({ lecturerId: assistantLecturerId, role: 'assistant' });
    expect(added.status).toBe(201);
    assistantProctorId = added.body.id;

    const response = await request(app.getHttpServer())
      .delete(
        `/exam-events/${eventId}/sessions/${sessionId}/proctors/${assistantProctorId}`,
      )
      .set(auth());
    expect(response.status).toBe(204);

    const detail = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/sessions/${sessionId}`)
      .set(auth());
    expect(detail.status).toBe(200);
    expect(
      detail.body.proctors.some((p: { id: string }) => p.id === assistantProctorId),
    ).toBe(false);
    expect(
      detail.body.proctors.some((p: { id: string }) => p.id === leadProctorId),
    ).toBe(true);
  });

  it('adds a participant enrolled in an attached section', async () => {
    const response = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sessions/${sessionId}/participants`)
      .set(auth())
      .send({
        studentId: studentOnEventId,
        courseSectionId: attachedSectionId,
      });
    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    participantId = response.body.id;
  });

  it('lists the sitting roster and participant count', async () => {
    const list = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/sessions/${sessionId}/participants`)
      .set(auth());
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: participantId,
          studentId: studentOnEventId,
          courseSectionId: attachedSectionId,
          seatId: null,
          status: 'registered',
        }),
      ]),
    );

    const detail = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/sessions/${sessionId}`)
      .set(auth());
    expect(detail.status).toBe(200);
    expect(detail.body.participantCount).toBe(1);
  });

  it('rejects a student from a section not attached to the event', async () => {
    const response = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sessions/${sessionId}/participants`)
      .set(auth())
      .send({
        studentId: studentOffEventId,
        courseSectionId: unattachedSectionId,
      });
    expect(response.status).toBe(400);
  });

  it('rejects a duplicate student on the same sitting', async () => {
    const response = await request(app.getHttpServer())
      .post(`/exam-events/${eventId}/sessions/${sessionId}/participants`)
      .set(auth())
      .send({
        studentId: studentOnEventId,
        courseSectionId: attachedSectionId,
      });
    expect(response.status).toBe(409);
  });

  it('bulk-adds enrolled students from an attached section', async () => {
    const response = await request(app.getHttpServer())
      .post(
        `/exam-events/${eventId}/sessions/${sessionId}/participants/bulk`,
      )
      .set(auth())
      .send({
        studentIds: [studentOnEvent2Id],
        courseSectionId: attachedSectionId,
      });
    expect(response.status).toBe(201);
    expect(response.body.ids).toHaveLength(1);
    participant2Id = response.body.ids[0];
  });

  it('assigns a seat and rejects a second occupant of the same seat', async () => {
    const seated = await request(app.getHttpServer())
      .patch(
        `/exam-events/${eventId}/sessions/${sessionId}/participants/${participantId}`,
      )
      .set(auth())
      .send({ seatId: seatAId, notes: 'aisle' });
    expect(seated.status).toBe(200);
    expect(seated.body.seatId).toBe(seatAId);
    expect(seated.body.notes).toBe('aisle');

    const conflict = await request(app.getHttpServer())
      .patch(
        `/exam-events/${eventId}/sessions/${sessionId}/participants/${participant2Id}`,
      )
      .set(auth())
      .send({ seatId: seatAId });
    expect(conflict.status).toBe(409);

    const otherSeat = await request(app.getHttpServer())
      .patch(
        `/exam-events/${eventId}/sessions/${sessionId}/participants/${participant2Id}`,
      )
      .set(auth())
      .send({ seatId: seatBId });
    expect(otherSeat.status).toBe(200);
    expect(otherSeat.body.seatId).toBe(seatBId);
  });

  it('rejects a seat that does not belong to the sitting layout', async () => {
    const foreignSeats = await request(app.getHttpServer())
      .put(`/labs/${labBId}/layouts/${layoutBId}/seats`)
      .set(auth())
      .send({
        seats: [{ seatCode: 'B01', positionX: 10, positionY: 10 }],
      });
    expect(foreignSeats.status).toBe(200);
    const foreignSeatId = foreignSeats.body.items[0].id;

    const response = await request(app.getHttpServer())
      .patch(
        `/exam-events/${eventId}/sessions/${sessionId}/participants/${participantId}`,
      )
      .set(auth())
      .send({ seatId: foreignSeatId });
    expect(response.status).toBe(400);
  });

  it('removes a participant', async () => {
    const response = await request(app.getHttpServer())
      .delete(
        `/exam-events/${eventId}/sessions/${sessionId}/participants/${participant2Id}`,
      )
      .set(auth());
    expect(response.status).toBe(204);

    const list = await request(app.getHttpServer())
      .get(`/exam-events/${eventId}/sessions/${sessionId}/participants`)
      .set(auth());
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(
      list.body.items.some((p: { id: string }) => p.id === participant2Id),
    ).toBe(false);
  });
});
