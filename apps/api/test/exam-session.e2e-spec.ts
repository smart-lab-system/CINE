import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

// Pins Task 2's own stated acceptance criteria as real, automated tests —
// they were only manually verified when Task 2 shipped (see
// .superpowers/sdd/2026-08-27-exam-live-demo/task-2-report.md), which means
// nothing would have caught a regression to either the path-traversal-
// adjacent filename validation or the ownership check on GET/:id. Final
// whole-branch review, Important #3.
describe('ExamSession (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let ownerToken: string;
  let otherToken: string;
  let adminToken: string;
  let courseId: string;
  let roomId: string;

  function futureWindow() {
    const startTime = new Date(Date.now() + 60_000).toISOString();
    const endTime = new Date(Date.now() + 3_600_000).toISOString();
    return { startTime, endTime };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirrors main.ts exactly (see accounts.e2e-spec.ts) — without both of
    // these, a 400 from bad DTO input or a 409 from the DB's unique index
    // would surface differently than what a real client sees.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);

    const ownerEmail = `exam_session_owner_${Date.now()}@example.com`;
    await createTestAccount(dataSource, {
      email: ownerEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const ownerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ownerEmail, password: 'correct-horse-battery' });
    ownerToken = ownerLogin.body.accessToken;

    const otherEmail = `exam_session_other_${Date.now()}@example.com`;
    await createTestAccount(dataSource, {
      email: otherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: otherEmail, password: 'correct-horse-battery' });
    otherToken = otherLogin.body.accessToken;

    // Role fixture for the RolesGuard test below. An admin is a fully
    // valid, fully authenticated account, so a 403 on POST can only come
    // from the role check — never from a missing/expired token.
    const adminEmail = `exam_session_admin_${Date.now()}@example.com`;
    await createTestAccount(dataSource, {
      email: adminEmail,
      password: 'correct-horse-battery',
      role: 'admin',
    });
    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: 'correct-horse-battery' });
    adminToken = adminLogin.body.accessToken;

    // courseId/roomId/examType are required on CreateExamSessionDto as of
    // the frontend rebuild's Phase 2 — every POST /exam-sessions below
    // needs a real course + room to reference.
    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Test Semester ${Date.now()}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Exam Session Test Course', $2) RETURNING id`,
      [`ES${Date.now()}`, semester.id],
    );
    courseId = course.id;
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity)
       VALUES ($1, 30) RETURNING id`,
      [`Exam Session Test Room ${Date.now()}`],
    );
    roomId = room.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an exam session with a unique code (happy path)', async () => {
    const { startTime, endTime } = futureWindow();

    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Happy Path Session',
        courseId,
        roomId,
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx', 'Cau2.docx'],
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(response.body.requiredDeliverables).toHaveLength(2);

    // A second session's code must never collide with the first — cheap
    // extra assurance the generator/retry loop actually produces distinct
    // codes, not just "a code".
    const second = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Happy Path Session 2',
        courseId,
        roomId,
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx'],
      });
    expect(second.status).toBe(201);
    expect(second.body.code).not.toBe(response.body.code);
  });

  it('rejects an unsafe (path-traversal-adjacent) required filename with 400', async () => {
    const { startTime, endTime } = futureWindow();

    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Unsafe Filename Session',
        courseId,
        roomId,
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['../etc/passwd'],
      });

    expect(response.status).toBe(400);

    // Nothing should have been persisted for a request the DTO rejected.
    const rows = await dataSource.query(
      `SELECT id FROM examcollect.exam_session WHERE name = $1`,
      ['Unsafe Filename Session'],
    );
    expect(rows).toHaveLength(0);
  });

  it('rejects a duplicate required filename with 400, not 409 (Important #2 fix)', async () => {
    const { startTime, endTime } = futureWindow();

    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Duplicate Filename Session',
        courseId,
        roomId,
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx', 'Cau1.docx'],
      });

    // Before @ArrayUnique() this reached the DB's unique index and came
    // back as a 409 — asserting 400 here pins the DTO-level fix, not just
    // "some 4xx".
    expect(response.status).toBe(400);
  });

  it('rejects exam session creation without a token (401)', async () => {
    const { startTime, endTime } = futureWindow();

    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .send({
        name: 'No Token Session',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx'],
      });

    expect(response.status).toBe(401);
  });

  it('returns 403 when a non-owner requests GET /exam-sessions/:id', async () => {
    const { startTime, endTime } = futureWindow();

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Ownership Check Session',
        courseId,
        roomId,
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx'],
      });
    expect(created.status).toBe(201);
    const sessionId: string = created.body.id;

    const ownerView = await request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerView.status).toBe(200);
    expect(ownerView.body.id).toBe(sessionId);

    const otherView = await request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(otherView.status).toBe(403);
  });

  it('rejects exam session creation by a non-teacher role with 403', async () => {
    const { startTime, endTime } = futureWindow();
    // Unique per run: the "nothing was persisted" assertion below queries by
    // name, so a row left behind by an earlier (pre-guard) run must not be
    // able to fail a later, correct one.
    const sessionName = `Admin Role Rejected Session ${Date.now()}`;

    // Before @Roles('teacher') landed on the handler, this returned 201:
    // ExamSessionController only had JwtAuthGuard, so ANY authenticated
    // account could create a session it would then own via `teacher_id`.
    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: sessionName,
        courseId,
        roomId,
        examType: 'TK',
        startTime,
        endTime,
        requiredFilenames: ['Cau1.docx'],
      });

    expect(response.status).toBe(403);

    // Rejected at the guard, so nothing may have been persisted.
    const rows = await dataSource.query(
      `SELECT id FROM examcollect.exam_session WHERE name = $1`,
      [sessionName],
    );
    expect(rows).toHaveLength(0);
  });

  it('still lets a teacher read their own sessions after the role guard (no regression)', async () => {
    const response = await request(app.getHttpServer())
      .get('/exam-sessions')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.items)).toBe(true);
  });
  describe('POST /exam-sessions/:id/finalize', () => {
    // Every session here uses a FUTURE window on purpose: the scheduled
    // sweep (ExamSessionScheduler, running for real inside this app
    // instance) only touches sessions whose end_time has passed, so it
    // can never race these assertions.
    async function createSession(name: string): Promise<string> {
      const { startTime, endTime } = futureWindow();
      const created = await request(app.getHttpServer())
        .post('/exam-sessions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: `${name} ${Date.now()}`,
          courseId,
          roomId,
          examType: 'TK',
          startTime,
          endTime,
          requiredFilenames: ['Cau1.docx'],
        });
      expect(created.status).toBe(201);
      expect(created.body.status).toBe('active');
      return created.body.id as string;
    }

    it('flips an active session owned by the caller to completed', async () => {
      const sessionId = await createSession('Manual Finalize');

      const response = await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/finalize`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('completed');

      // The response is not the only thing that must be right — the
      // column is now the source of truth the UI reads back.
      const [row] = await dataSource.query(
        `SELECT status FROM examcollect.exam_session WHERE id = $1`,
        [sessionId],
      );
      expect(row.status).toBe('completed');
    });

    it('is idempotent — a second finalize still returns 200/completed', async () => {
      const sessionId = await createSession('Double Finalize');

      const first = await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/finalize`)
        .set('Authorization', `Bearer ${ownerToken}`);
      const second = await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/finalize`)
        .set('Authorization', `Bearer ${ownerToken}`);

      // Finalizing twice (teacher clicks, or a tick lands at the same
      // moment) must not error — finalizeExamSession's WHERE clause makes
      // the second one a no-op rather than a second transition.
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.status).toBe('completed');
    });

    it('rejects a teacher who does not own the session with 403', async () => {
      const sessionId = await createSession('Non Owner Finalize');

      const response = await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/finalize`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(403);

      const [row] = await dataSource.query(
        `SELECT status FROM examcollect.exam_session WHERE id = $1`,
        [sessionId],
      );
      expect(row.status).toBe('active');
    });

    it('rejects a non-teacher role with 403', async () => {
      const sessionId = await createSession('Admin Finalize');

      const response = await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/finalize`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(403);
    });

    it('rejects an unknown session with 404', async () => {
      const response = await request(app.getHttpServer())
        .post('/exam-sessions/00000000-0000-4000-8000-000000000000/finalize')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(404);
    });
  });
});
