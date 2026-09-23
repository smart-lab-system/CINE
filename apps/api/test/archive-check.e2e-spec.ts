import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { io, Socket } from 'socket.io-client';
import * as yazl from 'yazl';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { openSession } from './helpers/open-session';
import { SubmissionEntity } from '../src/submission/entities/submission.entity';
import { ArchiveCheckService } from '../src/submission/archive-check/archive-check.service';
import { StorageService } from '../src/storage/storage.service';
import { ARCHIVE_CHECK_MAX_BYTES } from '../src/submission/archive-check/archive-check.constants';

const FIXTURES = join(__dirname, 'fixtures', 'archive');

/** Dựng một zip THẬT trong bộ nhớ — dùng cho các test kết luận của Task 6. */
function makeZip(files: Record<string, string>): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files)) {
    zip.addBuffer(Buffer.from(content), name);
  }
  zip.end();
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
  });
}

/**
 * Task 5 (CHỤP + ENQUEUE lúc `submission:confirm`) và Task 6 (processor
 * chạy phép kiểm thật qua hàng đợi) của kế hoạch archive-content-validation.
 *
 * Cùng khuôn với submission-collection.e2e-spec.ts: Postgres + MinIO thật,
 * socket thật, Redis thật, không mock.
 *
 * TỪ TASK 6, `ArchiveCheckProcessor` sống thật trong app này và bắt đầu
 * tiêu thụ job NGAY sau khi enqueue — nên `archive_check_status` đọc ngay
 * sau `submission:confirm` là một cuộc ĐUA, không phải một sự thật đứng
 * yên: worker cục bộ có thể đã chạy xong trước khi assertion tới lượt đọc.
 * Test nào chỉ cần chứng minh phần CHỤP (Task 5) upload nội dung KHÔNG PHẢI
 * zip/rar hợp lệ một cách có chủ ý, nên kết quả cuối cùng luôn xác định là
 * `unreadable` — không bao giờ ra `passed` — và assertion chấp nhận cả hai
 * nhãn `pending`/`unreadable` thay vì khoá cứng vào `pending`.
 * `archive_expected_entries` thì AN TOÀN khoá cứng: nó được ghi ĐỒNG BỘ,
 * trong cùng giao dịch với lượt `collected`, trước khi ack quay về —
 * processor không bao giờ đụng vào cột đó.
 */
describe('Archive content check — snapshot + processor (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;
  let socket: Socket;

  let sessionId: string;
  let sessionCode: string;
  let classId: string;
  let teacherId: string;
  let teacherToken: string;
  /** Socket của mỗi sinh viên phụ, dọn ở afterAll cùng socket chính. */
  const extraSockets: Socket[] = [];

  let plainDeliverableId: string;
  let archiveDeliverableId: string;
  /** Khai entries: ['Main.java'] — không token, khớp thẳng fixture RAR. */
  let rarDeliverableId: string;

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

  /**
   * Bản tổng quát của `uploadAndConfirm` — nhận thẳng socket + mssv, dùng
   * cho các test Task 6 cần MỘT SINH VIÊN RIÊNG mỗi ca (tránh đụng độ
   * `uq_submission_identity` với các test Task 5 và với nhau), và nhận
   * `content: Buffer` để tải lên byte zip/rar THẬT thay vì chuỗi giả lập.
   */
  async function uploadAndConfirmAs(
    studentSocket: Socket,
    mssv: string,
    deliverableId: string,
    content: Buffer,
  ) {
    const urlAck = await new Promise<{ ok: true; uploadUrl: string; storageKey: string }>(
      (resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no ack')), 15_000);
        studentSocket.emit(
          'submission:request-upload-url',
          { examSessionId: sessionId, studentId: mssv, requiredDeliverableId: deliverableId },
          (reply: { ok: true; uploadUrl: string; storageKey: string }) => {
            clearTimeout(timer);
            resolve(reply);
          },
        );
      },
    );
    expect(urlAck.ok).toBe(true);

    // `fetch`'s BodyInit union không nhận Buffer trực tiếp (dù Buffer LÀ
    // một Uint8Array khi chạy) — ép qua Uint8Array để khớp type.
    const put = await fetch(urlAck.uploadUrl, {
      method: 'PUT',
      body: new Uint8Array(content),
    });
    expect(put.ok).toBe(true);

    return new Promise<{ ok: true; status: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no ack')), 15_000);
      studentSocket.emit(
        'submission:confirm',
        {
          examSessionId: sessionId,
          studentId: mssv,
          requiredDeliverableId: deliverableId,
          storageKey: urlAck.storageKey,
          checksum: createHash('sha256').update(content).digest('hex'),
          fileSize: content.byteLength,
        },
        (reply: { ok: true; status: string }) => {
          clearTimeout(timer);
          resolve(reply);
        },
      );
    });
  }

  /**
   * Ghi danh một sinh viên MỚI vào cùng lớp, nối socket, và join phiên —
   * mỗi test kết luận (Task 6 Step 7) cần một danh tính riêng để không
   * đụng độ với nhau hay với các test Task 5 chạy trước.
   *
   * `openSession()` đã ĐÓNG BĂNG danh sách dự thi ở beforeAll (Security
   * rule 1 — CLAUDE.md §4), nên một enrollment tạo SAU thời điểm đó không
   * đủ để agent:join qua được: phải đi qua đường "thêm sinh viên thủ công"
   * (`POST :id/roster/students`, spec §5.3) như một giám thị thật sẽ làm
   * cho một em tới muộn.
   */
  async function joinAsStudent(mssv: string, name: string): Promise<Socket> {
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4)`,
      [mssv, name, classId, teacherId],
    );
    const rosterAdd = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/roster/students`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ mssv, name });
    if (rosterAdd.status !== 201) {
      throw new Error(
        `Không thêm được ${mssv} vào danh sách dự thi: ${rosterAdd.status} ` +
          `${JSON.stringify(rosterAdd.body)}`,
      );
    }

    const studentSocket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
    await new Promise<void>((resolve) => studentSocket.on('connect', () => resolve()));
    await new Promise<void>((resolve, reject) => {
      studentSocket.on('agent:join:ack', () => resolve());
      studentSocket.on('agent:join:error', (e) => reject(new Error(JSON.stringify(e))));
      studentSocket.emit('agent:join', { studentId: mssv, sessionCode });
    });
    extraSockets.push(studentSocket);
    return studentSocket;
  }

  /**
   * Chờ processor chạy xong — cùng khuôn `waitForGrading` của
   * grading-queue.e2e-spec.ts: poll DB tới khi rời `pending`, có deadline,
   * không sleep cố định.
   */
  async function waitForArchiveStatus(
    deliverableId: string,
    mssv: string,
    timeoutMs = 15_000,
  ): Promise<{
    archive_check_status: string;
    archive_missing_entries: string[] | null;
    archive_check_error: string | null;
  }> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const [row] = await dataSource.query(
        `SELECT archive_check_status, archive_missing_entries, archive_check_error
           FROM examcollect.submission
          WHERE exam_session_id = $1 AND student_mssv = $2 AND required_deliverable_id = $3`,
        [sessionId, mssv, deliverableId],
      );
      if (row && row.archive_check_status !== 'pending') {
        return row;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `archive-check chưa xong sau ${timeoutMs}ms cho ${mssv}: ${JSON.stringify(row)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
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
    teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    teacherToken = login.body.accessToken;

    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, 'N03', $2) RETURNING id`,
      ['Archive Check Course', teacherId],
    );
    classId = klass.id;

    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4)`,
      [MSSV, STUDENT_NAME, classId, teacherId],
    );

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
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
          // Không token: khớp thẳng nội dung cố định của các fixture .rar
          // (test/fixtures/archive), bất kể sinh viên nào nộp.
          {
            filename: 'BaiThi.rar',
            entries: ['Main.java'],
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
    rarDeliverableId = created.body.requiredDeliverables.find(
      (d: { requiredFilename: string }) => d.requiredFilename === 'BaiThi.rar',
    ).id;

    await openSession(app, teacherToken, sessionId);

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
    for (const s of extraSockets) {
      s.removeAllListeners();
      s.disconnect();
    }
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

    // 'noi dung zip gia lap' không phải zip/rar hợp lệ — kết cục CHẮC CHẮN
    // là 'unreadable' một khi processor chạy xong, không bao giờ 'passed',
    // nên chấp nhận cả hai nhãn ở phía "chưa/đã xử lý" mà không mất tính
    // chặt của bài test (xem ghi chú đầu file về cuộc đua Task 6).
    expect(['pending', 'unreadable']).toContain(row.archiveCheckStatus);
    // {MSSV} render đúng MSSV thật; {SOMAY} render đúng machineName đã gửi
    // lúc agent:join — đây là bài test chốt chặn của chính cái bẫy §5.2:
    // machineName chỉ sống trong socket, và nếu code render lại trong job
    // (thay vì chụp lúc confirm) thì giá trị này sẽ là 'UNKNOWN'. Cột này
    // AN TOÀN khoá cứng: ghi đồng bộ trước khi ack quay về, processor
    // không bao giờ đụng vào.
    expect(row.archiveExpectedEntries).toEqual([`BaoCao_${MSSV}.docx`, 'Main.java']);
    expect(row.archiveExpectedEntries?.join(',')).not.toContain('UNKNOWN');
    // An toàn ở CẢ HAI kết cục: snapshot ghi null lúc về pending,
    // markUnreadable cũng ghi null — không nhánh nào để lại giá trị cũ.
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
    // Giả lập kết quả cũ như thể processor đã kết luận failed.
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

    // 'noi dung zip lan hai' cũng không phải zip hợp lệ — cùng lý do nới
    // ở test đầu tiên: kết cục chắc chắn là 'unreadable', không bao giờ
    // 'passed', nên chấp nhận cả hai nhãn thay vì khoá cứng 'pending'.
    expect(['pending', 'unreadable']).toContain(row.archive_check_status);
    expect(row.archive_missing_entries).toBeNull();
    expect(row.archive_expected_entries).toEqual([`BaoCao_${MSSV}.docx`, 'Main.java']);
  });

  /**
   * Task 6 Step 2 — gọi `ArchiveCheckService.checkOne` TRỰC TIẾP (không qua
   * hàng đợi), để mock `storage.getObjectSize` một cách xác định. Nộp qua
   * socket trước để có một dòng `collected` hợp lệ với bản chụp — sau đó
   * `checkOne()` chạy lại trên chính dòng đó, bất kể processor thật đã
   * chạy xong hay chưa (guard đầu hàm chỉ cần `archiveCheckStatus !==
   * 'not_applicable'` và có `archiveExpectedEntries`, cả hai đều đúng dù
   * dòng đang `pending` hay đã `unreadable`).
   */
  describe('ArchiveCheckService.checkOne — chặn kích thước TRƯỚC KHI tải (spec §10.2)', () => {
    const SIZE_GATE_MSSV = 'SV20120099';
    let archiveCheckService: ArchiveCheckService;
    let storage: StorageService;
    let submissionId: string;

    beforeAll(async () => {
      archiveCheckService = app.get(ArchiveCheckService);
      storage = app.get(StorageService);
      const sizeGateSocket = await joinAsStudent(SIZE_GATE_MSSV, 'Sinh Vien Chan Kich Thuoc');
      await uploadAndConfirmAs(
        sizeGateSocket,
        SIZE_GATE_MSSV,
        archiveDeliverableId,
        Buffer.from('noi dung khong quan trong, size se bi mock'),
      );
      const row = await dataSource.getRepository(SubmissionEntity).findOneOrFail({
        where: {
          examSessionId: sessionId,
          studentMssv: SIZE_GATE_MSSV,
          requiredDeliverableId: archiveDeliverableId,
        },
      });
      submissionId = row.id;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('object lớn hơn trần -> unreadable, và KHÔNG gọi getObject', async () => {
      jest.spyOn(storage, 'getObjectSize').mockResolvedValue(ARCHIVE_CHECK_MAX_BYTES + 1);
      const getObjectSpy = jest.spyOn(storage, 'getObject');

      await archiveCheckService.checkOne(submissionId);

      const row = await dataSource
        .getRepository(SubmissionEntity)
        .findOneByOrFail({ id: submissionId });
      expect(row.archiveCheckStatus).toBe('unreadable');
      expect(row.archiveCheckError).toContain('quá lớn');
      expect(getObjectSpy).not.toHaveBeenCalled();
    });

    // Chứng minh cửa chặn KHÔNG dựng trên số client khai (spec §10.2).
    // Thiếu test này thì lỗ bảo mật lặng lẽ quay lại ở lần refactor sau:
    // ai đó thấy `submission.file_size` đã có sẵn và "tối ưu" bằng cách
    // đọc nó thay vì gọi HeadObject.
    it('HeadObject báo 5GB dù submission.file_size khai 1 byte -> vẫn unreadable', async () => {
      await dataSource.getRepository(SubmissionEntity).update(submissionId, { fileSize: '1' });
      jest.spyOn(storage, 'getObjectSize').mockResolvedValue(5 * 1024 * 1024 * 1024);

      await archiveCheckService.checkOne(submissionId);

      const row = await dataSource
        .getRepository(SubmissionEntity)
        .findOneByOrFail({ id: submissionId });
      expect(row.archiveCheckStatus).toBe('unreadable');
    });
  });

  /**
   * Task 6 Step 7 — đủ các kết luận, chạy qua HÀNG ĐỢI THẬT (không gọi
   * `checkOne` trực tiếp): mỗi test một sinh viên riêng, nộp qua socket,
   * rồi poll DB tới khi processor chạy xong.
   */
  describe('ArchiveCheckProcessor — kết luận qua hàng đợi thật (e2e)', () => {
    it('zip đủ file -> passed', async () => {
      const mssv = 'SV20120101';
      const studentSocket = await joinAsStudent(mssv, 'Sinh Vien Zip Du');
      const zip = await makeZip({ [`BaoCao_${mssv}.docx`]: 'noi dung', 'Main.java': 'code' });

      await uploadAndConfirmAs(studentSocket, mssv, archiveDeliverableId, zip);
      const row = await waitForArchiveStatus(archiveDeliverableId, mssv);

      expect(row.archive_check_status).toBe('passed');
      expect(row.archive_missing_entries).toEqual([]);
      expect(row.archive_check_error).toBeNull();
    });

    it('zip thiếu file -> failed + đúng danh sách thiếu', async () => {
      const mssv = 'SV20120102';
      const studentSocket = await joinAsStudent(mssv, 'Sinh Vien Zip Thieu');
      // Chỉ có Main.java — thiếu BaoCao_<mssv>.docx.
      const zip = await makeZip({ 'Main.java': 'code' });

      await uploadAndConfirmAs(studentSocket, mssv, archiveDeliverableId, zip);
      const row = await waitForArchiveStatus(archiveDeliverableId, mssv);

      expect(row.archive_check_status).toBe('failed');
      expect(row.archive_missing_entries).toEqual([`BaoCao_${mssv}.docx`]);
    });

    it('zip hỏng -> unreadable + có archive_check_error', async () => {
      const mssv = 'SV20120103';
      const studentSocket = await joinAsStudent(mssv, 'Sinh Vien Zip Hong');
      // Magic bytes ZIP thật, theo sau là rác — mở header được, đọc entry
      // thì hỏng giữa chừng.
      const broken = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('rac')]);

      await uploadAndConfirmAs(studentSocket, mssv, archiveDeliverableId, broken);
      const row = await waitForArchiveStatus(archiveDeliverableId, mssv);

      expect(row.archive_check_status).toBe('unreadable');
      expect(row.archive_check_error).toBeTruthy();
    });

    it('rar5 THẬT, đủ file -> passed', async () => {
      const mssv = 'SV20120104';
      const studentSocket = await joinAsStudent(mssv, 'Sinh Vien Rar5');
      const rar = readFileSync(join(FIXTURES, 'sample-rar5.rar'));

      await uploadAndConfirmAs(studentSocket, mssv, rarDeliverableId, rar);
      const row = await waitForArchiveStatus(rarDeliverableId, mssv);

      expect(row.archive_check_status).toBe('passed');
    });

    // Header mã hoá thì không đọc nổi DANH SÁCH — 'unreadable', KHÔNG phải
    // 'failed': hai kết luận dẫn tới hai hành động khác nhau của giảng
    // viên (spec §7). Không cần biết mật khẩu để CHỨNG MINH điều này —
    // chính việc không có mật khẩu là lý do nó không đọc được.
    it('rar mã hoá header -> unreadable (không phải failed)', async () => {
      const mssv = 'SV20120105';
      const studentSocket = await joinAsStudent(mssv, 'Sinh Vien Rar Ma Hoa');
      const rar = readFileSync(join(FIXTURES, 'sample-rar5-encrypted-headers.rar'));

      await uploadAndConfirmAs(studentSocket, mssv, rarDeliverableId, rar);
      const row = await waitForArchiveStatus(rarDeliverableId, mssv);

      expect(row.archive_check_status).toBe('unreadable');
      expect(row.archive_check_error).toBeTruthy();
    });

    // GIỚI HẠN ĐÃ BIẾT (ghi lại từ Task 3): không có fixture RAR4 thật.
    // WinRAR 7.23 trên máy dựng bộ test này đã bỏ khả năng TẠO rar4
    // (`-ma4` -> "Unknown option"), chỉ còn tạo được rar5. Nhận dạng magic
    // bytes rar4 đã có test ở archive-reader.spec.ts bằng byte dựng tay;
    // đường "đọc danh sách từ rar4 thật qua hàng đợi" thì chưa được đo.
  });

  /**
   * Task 7 — POST :id/archive-recheck. `@HttpCode(200)` chứ không mặc định
   * 201 của Nest: đây không tạo tài nguyên mới, cùng lý do `recollect`
   * (POST :id/recollect) cũng dùng 200 — xem doc comment của
   * ArchiveRecheckController. `@Roles('teacher')` một mình, không
   * 'admin': CLAUDE.md §2 nói admin "không xem bài nộp", và đường này
   * đụng thẳng vào submission.
   */
  describe('POST :id/archive-recheck (Task 7)', () => {
    it(
      'xếp hàng lại bài failed/unreadable/pending, KHÔNG đụng bytes bài nộp',
      async () => {
        const mssv = 'SV20120110';
        const studentSocket = await joinAsStudent(mssv, 'Sinh Vien Kiem Lai');
        // Zip THIẾU file — kết cục xác định là 'failed', ổn định để so
        // trước/sau (không như các test 'unreadable' race ở trên).
        const zip = await makeZip({ 'Main.java': 'code' });
        await uploadAndConfirmAs(studentSocket, mssv, archiveDeliverableId, zip);
        const before = await waitForArchiveStatus(archiveDeliverableId, mssv);
        expect(before.archive_check_status).toBe('failed');

        const beforeRow = await dataSource.getRepository(SubmissionEntity).findOneByOrFail({
          examSessionId: sessionId,
          studentMssv: mssv,
          requiredDeliverableId: archiveDeliverableId,
        });

        const res = await request(app.getHttpServer())
          .post(`/exam-sessions/${sessionId}/archive-recheck`)
          .set('Authorization', `Bearer ${teacherToken}`);
        expect(res.status).toBe(200);
        expect(res.body.requeued).toBeGreaterThanOrEqual(1);

        // Đúng NGAY sau khi request trả về — service ghi 'pending' bằng
        // UPDATE trước khi enqueue, nên không có cuộc đua ở bước này (khác
        // với chờ processor kết luận, việc đó test ở dưới).
        const rightAfter = await dataSource.getRepository(SubmissionEntity).findOneByOrFail({
          id: beforeRow.id,
        });
        expect(rightAfter.archiveCheckStatus).toBe('pending');
        expect(rightAfter.storageKey).toBe(beforeRow.storageKey);
        expect(rightAfter.checksum).toBe(beforeRow.checksum);
        expect(rightAfter.submittedAt).toEqual(beforeRow.submittedAt);
        // Bản chụp GIỮ NGUYÊN — không render lại (spec §5.3.2).
        expect(rightAfter.archiveExpectedEntries).toEqual(beforeRow.archiveExpectedEntries);

        // Và job thật sự chạy lại: lần này nộp đủ trước khi processor kịp
        // xử lý là không cần thiết — chỉ cần xác nhận nó rời 'pending' và
        // (vì zip vẫn thiếu file y nguyên trong storage) quay lại 'failed'
        // với đúng danh sách thiếu, không phải một trạng thái ngẫu nhiên.
        const after = await waitForArchiveStatus(archiveDeliverableId, mssv);
        expect(after.archive_check_status).toBe('failed');
        expect(after.archive_missing_entries).toEqual([`BaoCao_${mssv}.docx`]);
      },
      20_000,
    );

    it('không đụng bài not_applicable', async () => {
      // MSSV (sinh viên chính, beforeAll) đã có một dòng not_applicable
      // từ test Task 5 "deliverable không khai entry".
      const before = await dataSource.query(
        `SELECT archive_check_status FROM examcollect.submission
          WHERE exam_session_id = $1 AND student_mssv = $2 AND required_deliverable_id = $3`,
        [sessionId, MSSV, plainDeliverableId],
      );
      expect(before[0].archive_check_status).toBe('not_applicable');

      await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/archive-recheck`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);

      const after = await dataSource.query(
        `SELECT archive_check_status FROM examcollect.submission
          WHERE exam_session_id = $1 AND student_mssv = $2 AND required_deliverable_id = $3`,
        [sessionId, MSSV, plainDeliverableId],
      );
      expect(after[0].archive_check_status).toBe('not_applicable');
    });

    // KHÔNG assert `requeued: 0` tuyệt đối trên toàn phiên: phiên này dùng
    // CHUNG cho mọi test trong file (giảm chi phí dựng session), nên tại
    // thời điểm test này chạy có thể còn dòng failed/unreadable/pending từ
    // các test khác — dọn sạch bằng UPDATE trực tiếp từng đua với chính
    // background worker đang xử lý job của TEST TRƯỚC (đã đo được: test
    // này từng nhận `requeued: 2` vì "không đụng bài not_applicable" ở
    // trên gọi archive-recheck và enqueue lại một dòng mà không chờ nó
    // chạy xong). Thay vào đó, chỉ khẳng định đúng điều test này SỞ HỮU:
    // một dòng đã 'passed' của CHÍNH NÓ không bị requeue-recheck đụng vào.
    it('bỏ qua bài đã passed — không requeue dòng đã có kết luận đạt', async () => {
      const mssv = 'SV20120111';
      const studentSocket = await joinAsStudent(mssv, 'Sinh Vien Da Passed');
      const zip = await makeZip({ [`BaoCao_${mssv}.docx`]: 'noi dung', 'Main.java': 'code' });
      await uploadAndConfirmAs(studentSocket, mssv, archiveDeliverableId, zip);
      const settled = await waitForArchiveStatus(archiveDeliverableId, mssv);
      expect(settled.archive_check_status).toBe('passed');

      await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/archive-recheck`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);

      const row = await dataSource.getRepository(SubmissionEntity).findOneByOrFail({
        examSessionId: sessionId,
        studentMssv: mssv,
        requiredDeliverableId: archiveDeliverableId,
      });
      expect(row.archiveCheckStatus).toBe('passed');
    });

    it('phiên của giảng viên khác -> 403', async () => {
      const stamp = Date.now();
      const otherEmail = `archive_recheck_other_${stamp}@example.com`;
      await createTestAccount(dataSource, {
        email: otherEmail,
        password: 'correct-horse-battery',
        role: 'teacher',
      });
      const otherLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: otherEmail, password: 'correct-horse-battery' });
      const otherToken: string = otherLogin.body.accessToken;

      await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/archive-recheck`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });

    it('không token -> 401', async () => {
      await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/archive-recheck`)
        .expect(401);
    });
  });
});
