import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { openSession } from './helpers/open-session';
import { SubmissionEntity } from '../src/submission/entities/submission.entity';

/**
 * Task 5 của kế hoạch archive-content-validation — chỉ kiểm phần CHỤP và
 * ENQUEUE lúc `submission:confirm`. Không có processor nào chạy job ở giai
 * đoạn này (Task 6), nên các dòng dừng ở `pending` là kết quả ĐÚNG đợi ở
 * đây, không phải một job chưa kịp chạy.
 *
 * Cùng khuôn với submission-collection.e2e-spec.ts: Postgres + MinIO thật,
 * socket thật, không mock.
 */
describe('Archive content check — snapshot lúc submission:confirm (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;
  let socket: Socket;

  let sessionId: string;
  let sessionCode: string;
  let plainDeliverableId: string;
  let archiveDeliverableId: string;

  const MSSV = 'SV20120088';
  const STUDENT_NAME = 'Le Van Archive';
  const MACHINE_NAME = 'PM-A1-07';

  function ack<T>(event: string, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ack for ${event}`)), 15_000);
      socket.emit(event, payload, (reply: T) => {
        clearTimeout(timer);
        resolve(reply);
      });
    });
  }

  async function uploadAndConfirm(deliverableId: string, content: string) {
    const urlAck = await ack<{ ok: true; uploadUrl: string; storageKey: string }>(
      'submission:request-upload-url',
      { examSessionId: sessionId, studentId: MSSV, requiredDeliverableId: deliverableId },
    );
    expect(urlAck.ok).toBe(true);

    const put = await fetch(urlAck.uploadUrl, { method: 'PUT', body: content });
    expect(put.ok).toBe(true);

    return ack<{ ok: true; status: string }>('submission:confirm', {
      examSessionId: sessionId,
      studentId: MSSV,
      requiredDeliverableId: deliverableId,
      storageKey: urlAck.storageKey,
      checksum: createHash('sha256').update(content).digest('hex'),
      fileSize: Buffer.byteLength(content),
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.listen(0);
    baseUrl = await app.getUrl();
    dataSource = app.get(DataSource);

    const stamp = Date.now();
    const email = `archive_check_teacher_${stamp}@example.com`;
    const teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    const token: string = login.body.accessToken;

    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, 'N03', $2) RETURNING id`,
      ['Archive Check Course', teacherId],
    );
    const classId = klass.id;

    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4)`,
      [MSSV, STUDENT_NAME, classId, teacherId],
    );

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Archive Check Session ${stamp}`,
        classId,
        roomName: `Phòng ${stamp}`,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        startTime: new Date(Date.now() - 60_000).toISOString(),
        endTime: new Date(Date.now() + 3_600_000).toISOString(),
        requiredFilenames: [
          'BaoCao.docx',
          {
            filename: 'BaiThi_{MSSV}.zip',
            entries: ['BaoCao_{MSSV}.docx', 'Main.java'],
          },
        ],
      });
    expect(created.status).toBe(201);
    sessionId = created.body.id;
    sessionCode = created.body.code;
    plainDeliverableId = created.body.requiredDeliverables.find(
      (d: { requiredFilename: string }) => d.requiredFilename === 'BaoCao.docx',
    ).id;
    archiveDeliverableId = created.body.requiredDeliverables.find(
      (d: { requiredFilename: string }) => d.requiredFilename === 'BaiThi_{MSSV}.zip',
    ).id;

    await openSession(app, token, sessionId);

    socket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    await new Promise<void>((resolve, reject) => {
      socket.on('agent:join:ack', () => resolve());
      socket.on('agent:join:error', (e) => reject(new Error(JSON.stringify(e))));
      socket.emit('agent:join', {
        studentId: MSSV,
        sessionCode,
        machineName: MACHINE_NAME,
      });
    });
  });

  afterAll(async () => {
    socket?.removeAllListeners();
    socket?.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await app.close();
  });

  it('deliverable có khai entry -> pending + bản chụp đã render token, KHÔNG có UNKNOWN', async () => {
    const confirmAck = await uploadAndConfirm(archiveDeliverableId, 'noi dung zip gia lap');
    expect(confirmAck.ok).toBe(true);
    expect(confirmAck.status).toBe('collected');

    const row = await dataSource.getRepository(SubmissionEntity).findOneOrFail({
      where: {
        examSessionId: sessionId,
        studentMssv: MSSV,
        requiredDeliverableId: archiveDeliverableId,
      },
    });

    expect(row.archiveCheckStatus).toBe('pending');
    // {MSSV} render đúng MSSV thật; {SOMAY} render đúng machineName đã gửi
    // lúc agent:join — đây là bài test chốt chặn của chính cái bẫy §5.2:
    // machineName chỉ sống trong socket, và nếu code render lại trong job
    // (thay vì chụp lúc confirm) thì giá trị này sẽ là 'UNKNOWN'.
    expect(row.archiveExpectedEntries).toEqual([`BaoCao_${MSSV}.docx`, 'Main.java']);
    expect(row.archiveExpectedEntries?.join(',')).not.toContain('UNKNOWN');
    expect(row.archiveMissingEntries).toBeNull();
  });

  it('deliverable không khai entry -> not_applicable, không có bản chụp', async () => {
    const confirmAck = await uploadAndConfirm(plainDeliverableId, 'noi dung docx gia lap');
    expect(confirmAck.ok).toBe(true);
    expect(confirmAck.status).toBe('collected');

    const [row] = await dataSource.query(
      `SELECT archive_check_status, archive_expected_entries
         FROM examcollect.submission
        WHERE exam_session_id = $1 AND student_mssv = $2 AND required_deliverable_id = $3`,
      [sessionId, MSSV, plainDeliverableId],
    );

    expect(row.archive_check_status).toBe('not_applicable');
    expect(row.archive_expected_entries).toBeNull();
  });

  it('nộp lại thì tính lại: chụp mới, về pending, xoá kết quả cũ (spec §5.4)', async () => {
    // Giả lập kết quả cũ như thể job (Task 6) đã kết luận failed.
    await dataSource.query(
      `UPDATE examcollect.submission
          SET archive_check_status = 'failed',
              archive_missing_entries = ARRAY['Main.java']
        WHERE exam_session_id = $1 AND student_mssv = $2 AND required_deliverable_id = $3`,
      [sessionId, MSSV, archiveDeliverableId],
    );

    const confirmAck = await uploadAndConfirm(archiveDeliverableId, 'noi dung zip lan hai');
    expect(confirmAck.ok).toBe(true);

    const [row] = await dataSource.query(
      `SELECT archive_check_status, archive_missing_entries, archive_expected_entries
         FROM examcollect.submission
        WHERE exam_session_id = $1 AND student_mssv = $2 AND required_deliverable_id = $3`,
      [sessionId, MSSV, archiveDeliverableId],
    );

    expect(row.archive_check_status).toBe('pending');
    expect(row.archive_missing_entries).toBeNull();
    expect(row.archive_expected_entries).toEqual([`BaoCao_${MSSV}.docx`, 'Main.java']);
  });
});
