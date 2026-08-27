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
});
