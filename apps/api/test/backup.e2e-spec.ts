import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * The snapshot backup — the half of "reconnect" that is not free.
 *
 * A network blip already worked: the agent creates its files with the `wx`
 * flag, so an agent that comes back finds its work untouched. This covers
 * the case that needed building — a machine wiped or swapped mid-exam,
 * where the work is simply gone.
 *
 * The distinctions pinned here are all about the agent being able to tell
 * situations apart: "no snapshot yet" is not "storage is down", and a
 * presigned URL is scoped to one student's own key and nobody else's.
 */
describe('Backup (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;

  let sessionCode: string;
  let sessionId: string;
  const sockets: Socket[] = [];
  const stamp = Date.now().toString(36);
  const MSSV = `K${stamp}`.slice(0, 20);
  const OTHER_MSSV = `L${stamp}`.slice(0, 20);

  function connect(): Socket {
    const socket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
    sockets.push(socket);
    return socket;
  }

  function joined(studentId: string): Promise<{ socket: Socket; ack: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
      const socket = connect();
      // Cleared on both outcomes: a pending timer keeps the event loop alive
      // past teardown, and Jest force-kills the worker for it.
      const timer = setTimeout(() => reject(new Error('join timed out')), 5_000);
      socket.on('connect', () => socket.emit('agent:join', { studentId, sessionCode }));
      socket.on('agent:join:ack', (ack: Record<string, unknown>) => {
        clearTimeout(timer);
        resolve({ socket, ack });
      });
      socket.on('agent:join:error', (e: { code: string }) => {
        clearTimeout(timer);
        reject(new Error(e.code));
      });
    });
  }

  function ask<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${event} timed out`)), 5_000);
      socket.emit(event, {}, (reply: T) => {
        clearTimeout(timer);
        resolve(reply);
      });
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

    const email = `backup_teacher_${stamp}@example.com`;
    const teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    const token = login.body.accessToken;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Backup Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn sao lưu', $2) RETURNING id`,
      [`BK${stamp}`.slice(0, 20), semester.id],
    );
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [course.id, `Nhóm sao lưu ${stamp}`, teacherId],
    );
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Backup Room ${stamp}`],
    );

    for (const mssv of [MSSV, OTHER_MSSV]) {
      await dataSource.query(
        `INSERT INTO examcollect.enrollment
           (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [mssv, `Sinh viên ${mssv}`, course.id, klass.id, teacherId],
      );
    }

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Backup Session ${stamp}`,
        classId: klass.id,
        roomId: room.id,
        examType: 'TK',
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

  it('tells a joining agent there is no snapshot yet', async () => {
    const { ack } = await joined(MSSV);

    // A first join is the common case, and it must read as "nothing to
    // restore" rather than as a missing field the agent has to guess about.
    expect(ack.backupAvailable).toBe(false);
  });

  it('issues a PUT scoped to this student\'s own backup key', async () => {
    const { socket } = await joined(MSSV);

    const reply = await ask<{ ok: boolean; uploadUrl: string; storageKey: string }>(
      socket,
      'backup:request-upload-url',
    );

    expect(reply.ok).toBe(true);
    expect(reply.storageKey).toBe(`backups/${sessionId}/${MSSV}/latest.zip`);
    // One object per student per session, overwritten. No history: this
    // exists to survive a wiped machine, not to reconstruct how the work
    // was written.
    expect(reply.uploadUrl).toContain(`backups/${sessionId}/${MSSV}/latest.zip`);
  });

  it('never signs another student\'s key, whatever the payload says', async () => {
    const { socket } = await joined(MSSV);

    const reply = await new Promise<{ storageKey: string }>((resolve) => {
      // Identity comes from the socket, so these fields are not merely
      // untrusted — they are not read at all.
      socket.emit(
        'backup:request-upload-url',
        { examSessionId: sessionId, studentId: OTHER_MSSV },
        resolve,
      );
    });

    expect(reply.storageKey).toBe(`backups/${sessionId}/${MSSV}/latest.zip`);
  });

  it('answers NO_BACKUP rather than failing when nothing has been snapshotted', async () => {
    const { socket } = await joined(OTHER_MSSV);

    const reply = await ask<{ ok: boolean; code?: string }>(
      socket,
      'backup:request-download-url',
    );

    // "No backup" and "storage is down" mean different things to an agent:
    // one says carry on, the other says the student's safety net is missing.
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe('NO_BACKUP');
  });

  it('refuses a socket that has not joined', async () => {
    const socket = connect();
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));

    const reply = await ask<{ ok: boolean; code?: string }>(
      socket,
      'backup:request-upload-url',
    );

    expect(reply.ok).toBe(false);
    expect(reply.code).toBe('NOT_JOINED');
  });
});
