import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * The teacher's exam materials, end to end against real storage.
 *
 * Two things are being pinned. The file never passes through this server —
 * it goes to a presigned URL and back from another one (Security rule 5) —
 * and no row exists until the bytes really do, because a session that lists
 * a question paper nobody can open is worse than one that lists nothing.
 *
 * Security rule 2 (materials only after start_time) is decided in
 * ExamMaterialService and tested there, at both sides of the clock: over a
 * socket the closed side is unreachable, since `agent:join` independently
 * refuses a session that has not started.
 */
describe('Exam materials (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;

  let token: string;
  let otherToken: string;
  let sessionId: string;
  let sessionCode: string;
  const sockets: Socket[] = [];
  const stamp = Date.now().toString(36);
  const MSSV = `E${stamp}`.slice(0, 20);

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    return response.body.accessToken;
  }

  /** Uploads one material the way the web app does: URL, PUT, confirm. */
  async function upload(fileName: string, body: string) {
    const minted = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/materials/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName, fileSize: body.length });
    expect(minted.status).toBe(200);

    const put = await fetch(minted.body.uploadUrl, {
      method: 'PUT',
      body,
      headers: { 'Content-Type': 'application/pdf' },
    });
    expect(put.ok).toBe(true);

    return request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/materials`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        examMaterialId: minted.body.examMaterialId,
        storageKey: minted.body.storageKey,
        fileName,
        fileSize: body.length,
      });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.listen(0);
    dataSource = app.get(DataSource);
    baseUrl = await app.getUrl().then((url) => url.replace('[::1]', 'localhost'));

    const email = `material_teacher_${stamp}@example.com`;
    const teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    token = await login(email);

    const otherEmail = `material_other_${stamp}@example.com`;
    await createTestAccount(dataSource, {
      email: otherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    otherToken = await login(otherEmail);

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Material Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn có đề thi', $2) RETURNING id`,
      [`MT${stamp}`.slice(0, 20), semester.id],
    );
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [course.id, `Nhóm đề thi ${stamp}`, teacherId],
    );
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Material Room ${stamp}`],
    );
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [MSSV, 'Sinh viên đề thi', course.id, klass.id, teacherId],
    );

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Material Session ${stamp}`,
        classId: klass.id,
        roomId: room.id,
        examType: 'CK',
        startTime: new Date(Date.now() - 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(created.status).toBe(201);
    sessionId = created.body.id;
    sessionCode = created.body.code;
  });

  afterAll(async () => {
    for (const socket of sockets) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    await app.close();
  });

  it('uploads a material through storage and lists it back', async () => {
    const created = await upload('de-thi.pdf', '%PDF-1.4 fake exam paper');

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ fileName: 'de-thi.pdf' });

    const listed = await request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}/materials`)
      .set('Authorization', `Bearer ${token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.map((m: { fileName: string }) => m.fileName)).toContain('de-thi.pdf');
    // A signed URL, not the bytes: the file goes storage -> browser.
    expect(listed.body[0].downloadUrl).toContain('materials/');
  });

  it('refuses to record a material whose file never landed', async () => {
    const minted = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/materials/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'khong-tai-len.pdf', fileSize: 10 });

    const response = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/materials`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        examMaterialId: minted.body.examMaterialId,
        storageKey: minted.body.storageKey,
        fileName: 'khong-tai-len.pdf',
        fileSize: 10,
      });

    // A row without an object is a session that promises a question paper
    // and cannot produce one — discovered at the start of the exam.
    expect(response.status).toBe(400);
  });

  it('refuses a storage key that is not this material\'s', async () => {
    const minted = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/materials/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'lech-key.pdf', fileSize: 10 });

    const response = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/materials`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        examMaterialId: minted.body.examMaterialId,
        // Pointing at another session's prefix. The server rebuilds the key
        // from the id rather than believing this.
        storageKey: 'materials/00000000-0000-4000-8000-000000000000/x',
        fileName: 'lech-key.pdf',
        fileSize: 10,
      });

    expect(response.status).toBe(400);
  });

  it('refuses a teacher who does not own the session', async () => {
    const listed = await request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}/materials`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(listed.status).toBe(403);
  });

  it('tells a joining agent how many materials there are, never what they are', async () => {
    await upload('du-lieu.csv', 'a,b,c');

    const ack = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const socket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
      sockets.push(socket);
      socket.on('connect', () => socket.emit('agent:join', { studentId: MSSV, sessionCode }));
      socket.on('agent:join:ack', resolve);
      socket.on('agent:join:error', (e: { code: string }) => reject(new Error(e.code)));
      setTimeout(() => reject(new Error('join timed out')), 5_000);
    });

    // A count and a time. Putting the files themselves on the join ack is
    // exactly the leak Security rule 2 names — an agent may be in the lobby
    // before it may hold the paper.
    expect(ack.examMaterialCount).toBeGreaterThan(0);
    expect(typeof ack.materialsReleaseAt).toBe('string');
    expect(JSON.stringify(ack)).not.toContain('du-lieu.csv');
  });

  it('hands the materials to a joined agent that asks, after start_time', async () => {
    const socket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => socket.emit('agent:join', { studentId: MSSV, sessionCode }));
      socket.on('agent:join:ack', () => resolve());
      socket.on('agent:join:error', (e: { code: string }) => reject(new Error(e.code)));
      setTimeout(() => reject(new Error('join timed out')), 5_000);
    });

    const reply = await new Promise<{
      ok: boolean;
      materials?: { fileName: string; downloadUrl?: string }[];
    }>((resolve) => socket.emit('agent:request-materials', {}, resolve));

    expect(reply.ok).toBe(true);
    expect(reply.materials!.map((m) => m.fileName)).toContain('de-thi.pdf');

    // And the URL really works — the point of the whole arrangement is that
    // the agent fetches from storage, not from this server.
    const fetched = await fetch(reply.materials!.find((m) => m.fileName === 'de-thi.pdf')!.downloadUrl!);
    expect(fetched.ok).toBe(true);
    expect(await fetched.text()).toContain('fake exam paper');
  });

  it('refuses an agent that has not joined', async () => {
    const socket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));

    const reply = await new Promise<{ ok: boolean; code?: string }>((resolve) =>
      socket.emit('agent:request-materials', {}, resolve),
    );

    expect(reply.ok).toBe(false);
    expect(reply.code).toBe('NOT_JOINED');
  });

  it('deletes the object along with the row', async () => {
    const created = await upload('xoa-di.pdf', 'wrong file');
    const materialId = created.body.id;

    const listed = await request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}/materials`)
      .set('Authorization', `Bearer ${token}`);
    const url = listed.body.find((m: { id: string }) => m.id === materialId).downloadUrl;
    expect((await fetch(url)).ok).toBe(true);

    const removed = await request(app.getHttpServer())
      .delete(`/exam-sessions/${sessionId}/materials/${materialId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(204);

    // Dropping only the row would leave an exam paper the teacher believes
    // they deleted, still readable by anyone holding an old signed URL.
    expect((await fetch(url)).status).toBe(404);
  });
});
