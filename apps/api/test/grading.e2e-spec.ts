import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { liveSessionWindow } from './helpers/session-window';
import { StorageService } from '../src/storage/storage.service';

/**
 * The grading pipeline, and the boundary in front of it.
 *
 * CLAUDE.md's central structural rule for this system is that collection
 * and grading are two pipelines joined by one explicit teacher action, and
 * that they must never be one continuous job. Everything here is about
 * keeping that true: nothing grades itself, a rubric is never rewritten
 * under results that cite it, and the AI's own output is never edited.
 */
describe('Grading (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let storage: StorageService;

  let token: string;
  let otherToken: string;
  let teacherId: string;
  let courseName: string;
  let sessionId: string;
  let deliverableId: string;
  const stamp = Date.now().toString(36);
  const MSSV = `G${stamp}`.slice(0, 20);

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    return response.body.accessToken;
  }

  const RUBRIC_NAME = `Rubric chấm ${stamp}`;

  function saveRubric(descriptions: string[], asToken = token) {
    return request(app.getHttpServer())
      .post('/rubrics')
      .set('Authorization', `Bearer ${asToken}`)
      .send({
        name: RUBRIC_NAME,
        criteria: descriptions.map((description) => ({ description, maxPoints: 5 })),
      });
  }

  /** Puts a real object in storage and writes the matching collected row. */
  async function collectSubmission(mssv: string, body: string) {
    const key = storage.buildSubmissionKey(sessionId, mssv, deliverableId);
    const { uploadUrl } = await storage.generateUploadUrl(key);
    const put = await fetch(uploadUrl, { method: 'PUT', body });
    expect(put.ok).toBe(true);

    // received -> validated -> collected, one statement each: the lifecycle
    // trigger refuses to see a submission appear already collected.
    const [row] = await dataSource.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, storage_key, checksum, file_size,
          submitted_via, status)
       VALUES ($1, $2, $3, $4,
         (SELECT id FROM examcollect.class WHERE course_name = $5 LIMIT 1), $6, $7,
         $8, $9, 'normal', 'received')
       RETURNING id`,
      [
        // The real key, with no extension — that is what a submission key
        // looks like, and the reason extraction is told the DECLARED
        // filename separately rather than reading the key.
        sessionId, deliverableId, mssv, `Sinh viên ${mssv}`, courseName, teacherId,
        key, 'a'.repeat(64), body.length,
      ],
    );
    await dataSource.query(
      `UPDATE examcollect.submission SET status = 'validated' WHERE id = $1`,
      [row.id],
    );
    await dataSource.query(
      `UPDATE examcollect.submission SET status = 'collected' WHERE id = $1`,
      [row.id],
    );
    return row.id as string;
  }

  /**
   * Chờ hàng đợi chấm xong phiên này.
   *
   * Cần từ 2026-09-11: `POST .../start-grading` trả về ngay sau khi xếp
   * hàng, nên mọi khẳng định về KẾT QUẢ phải chờ worker chạy.
   *
   * Hỏi `grading-progress` chứ không ngủ một khoảng cố định: ngủ đủ lâu
   * thì test chậm, ngủ không đủ thì test chớp tắt — và một test chớp tắt
   * ở đường chấm điểm là thứ người ta sẽ bắt đầu chạy lại cho tới khi nó
   * xanh, tức là hỏng hẳn tác dụng.
   */
  async function waitForGrading(examSessionId: string, timeoutMs = 20_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const progress = await request(app.getHttpServer())
        .get(`/exam-sessions/${examSessionId}/grading-progress`)
        .set('Authorization', `Bearer ${token}`);
      if (progress.status === 200 && progress.body.pending === 0 && progress.body.total > 0) {
        return;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `hàng đợi chấm chưa xong sau ${timeoutMs}ms: ${JSON.stringify(progress.body)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);
    storage = app.get(StorageService);

    const email = `grading_teacher_${stamp}@example.com`;
    teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    token = await login(email);

    const otherEmail = `grading_other_${stamp}@example.com`;
    await createTestAccount(dataSource, {
      email: otherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    otherToken = await login(otherEmail);

    const course = { name: 'Môn được chấm' };
    courseName = course.name;
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseName, `Nhóm chấm ${stamp}`, teacherId],
    );
    const room = { name: `Grading Room ${stamp}` };
    await dataSource.query(
      `INSERT INTO examcollect.enrollment
         (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4)`,
      [MSSV, 'Sinh viên được chấm', klass.id, teacherId],
    );

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Grading Session ${stamp}`,
        classId: klass.id,
        roomName: room.name,
        semesterName: 'HK kiểm thử',
        examType: 'CK',
        ...liveSessionWindow(),
        requiredFilenames: ['Cau1.txt'],
      });
    expect(created.status).toBe(201);
    sessionId = created.body.id;
    deliverableId = created.body.requiredDeliverables[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('rubric versioning (Security rule 7)', () => {
    it('creates version 1 and makes it the active one', async () => {
      const response = await saveRubric(['Trình bày thuật toán rõ ràng']);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ version: 1, isActive: true, totalPoints: 5 });
    });

    it('saving again makes a NEW version and retires the old one', async () => {
      const second = await saveRubric([
        'Trình bày thuật toán rõ ràng',
        'Có kiểm thử cho các trường hợp biên',
      ]);

      expect(second.status).toBe(201);
      expect(second.body.version).toBe(2);

      const listed = await request(app.getHttpServer())
        .get('/rubrics')
        .set('Authorization', `Bearer ${token}`);

      // Version 1 is still there, unchanged. Results that cite it must keep
      // meaning what they meant — a calibration run against a rubric that
      // had since been rewritten compares nothing.
      const versions = listed.body.map((r: { version: number; isActive: boolean }) => r);
      expect(versions.find((r: { version: number }) => r.version === 1).isActive).toBe(false);
      expect(versions.find((r: { version: number }) => r.version === 2).isActive).toBe(true);
      expect(versions.find((r: { version: number }) => r.version === 1).criteria).toHaveLength(1);
    });

    it('T-OWN-3: rubric của giảng viên khác không lọt vào danh sách của mình', async () => {
      // Đợt thu hẹp master data ĐẢO quy tắc ở đây. Trước: rubric thuộc MÔN,
      // nên một giảng viên không dạy môn đó bị chặn bằng 403 lúc soạn. Sau:
      // rubric thuộc NGƯỜI, nên ai cũng soạn được rubric của mình — cái
      // không được phép là NHÌN THẤY của người khác.
      // Tên RIÊNG, không dùng RUBRIC_NAME: phiên bản đánh số theo
      // (giảng viên, tên), nên mượn tên của khối versioning phía trên sẽ
      // đẩy số bản của nó lên và làm ba ca khác đỏ ở một khẳng định không
      // liên quan gì tới quyền sở hữu.
      const isolated = `Rubric riêng ${stamp}`;
      const post = (asToken: string, description: string) =>
        request(app.getHttpServer())
          .post('/rubrics')
          .set('Authorization', `Bearer ${asToken}`)
          .send({ name: isolated, criteria: [{ description, maxPoints: 5 }] });

      const mine = await post(token, 'Của tôi');
      expect(mine.status).toBe(201);

      const theirs = await post(otherToken, 'Của người khác');
      expect(theirs.status).toBe(201);
      expect(theirs.body.teacherId).not.toBe(mine.body.teacherId);

      const listed = await request(app.getHttpServer())
        .get('/rubrics')
        .set('Authorization', `Bearer ${otherToken}`);
      const ids = listed.body.map((r: { id: string }) => r.id);
      expect(ids).toContain(theirs.body.id);
      expect(ids).not.toContain(mine.body.id);

      const peek = await request(app.getHttpServer())
        .get(`/rubrics/${mine.body.id}`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(peek.status).toBe(403);
    });
  });

  describe('the boundary between collecting and grading', () => {
    // The session above was created before any rubric existed — the
    // versioning block is what creates them — and a session is now graded
    // against the rubric it PINNED, not against whichever version happens
    // to be active. So pin the current one here, through the same endpoint
    // a teacher uses.
    beforeAll(async () => {
      const rubrics = await request(app.getHttpServer())
        .get('/rubrics')
        .set('Authorization', `Bearer ${token}`);
      const active = rubrics.body.find((rubric: { isActive: boolean }) => rubric.isActive);
      expect(active).toBeDefined();

      const patched = await request(app.getHttpServer())
        .patch(`/exam-sessions/${sessionId}/rubric`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rubricId: active.id });
      expect(patched.status).toBe(200);
    });

    it('does not grade anything on its own', async () => {
      // Wording chosen to overlap the rubric's criteria: this is what makes
      // a non-zero score assertable further down, which is what caught
      // extraction silently returning nothing.
      await collectSubmission(
        MSSV,
        'Bai lam: trinh bay thuat toan ro rang, co kiem thu cho cac truong hop bien.',
      );

      const results = await request(app.getHttpServer())
        .get(`/exam-sessions/${sessionId}/grading-results`)
        .set('Authorization', `Bearer ${token}`);

      // A submission reaching `collected` triggers nothing. The two
      // pipelines are joined by a teacher's click and by nothing else.
      expect(results.body).toEqual([]);
    });

    it('grades only when the teacher asks, and records which rubric version', async () => {
      const started = await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/start-grading`)
        .set('Authorization', `Bearer ${token}`);

      expect(started.status).toBe(200);
      // `queued` nghĩa là ĐÃ XẾP HÀNG, không phải ĐÃ CHẤM — đổi nghĩa từ
      // 2026-09-11 khi chấm điểm chuyển lên BullMQ. Mọi khẳng định về kết
      // quả phải chờ worker, và đó là lý do có `waitForGrading` bên dưới.
      expect(started.body).toMatchObject({ queued: 1, rubricVersion: 2 });
      await waitForGrading(sessionId);

      const results = await request(app.getHttpServer())
        .get(`/exam-sessions/${sessionId}/grading-results`)
        .set('Authorization', `Bearer ${token}`);
      expect(results.body).toHaveLength(1);
      expect(results.body[0]).toMatchObject({
        studentMssv: MSSV,
        // Named honestly: a calibration run comparing "AI" against humans
        // is meaningless if nobody can say which AI.
        modelUsed: 'keyword-match@1',
      });
      // Ngữ cảnh THẬT SỰ đã dùng phải được LƯU, không chỉ được provider
      // khai rồi rơi mất: `grading-readiness` báo mức theo cấu hình, còn
      // hai cột này là thứ duy nhất nói lượt chấm đọc được những gì. Thiếu
      // chúng thì calibration §11.2 không tách nổi nhánh A khỏi nhánh B.
      const [contextRow] = await dataSource.query(
        `SELECT context_used_question, context_used_model_answer
           FROM examcollect.grading_result gr
           JOIN examcollect.submission s ON s.id = gr.submission_id
          WHERE s.exam_session_id = $1`,
        [sessionId],
      );
      // Keyword provider chỉ đếm từ trên rubric — không đọc đề bài.
      expect(contextRow.context_used_question).toBe(false);
      expect(contextRow.context_used_model_answer).toBe(false);

      // Kết quả KIỂM DẪN CHỨNG phải được lưu theo từng tiêu chí.
      //
      // `applyGuards` tính nó miễn phí cho 100% số bài rồi trước
      // 2026-09-15 vứt đi. Spec §11.5 dựa vào đúng con số này cho một
      // trong hai chỉ số calibration KHÔNG cần người chấm — và tính lại
      // offline là bất khả, vì `verifyEvidence` cần bài làm nguyên văn
      // (ở object storage) cộng một bản cài đặt thứ hai bằng Python.
      const [checkRow] = await dataSource.query(
        `SELECT gr.criterion_results
           FROM examcollect.grading_result gr
           JOIN examcollect.submission s ON s.id = gr.submission_id
          WHERE s.exam_session_id = $1`,
        [sessionId],
      );
      const checks = (checkRow.criterion_results as { check?: string }[]).map((c) => c.check);
      expect(checks.length).toBeGreaterThan(0);
      for (const check of checks) {
        expect(['ok', 'empty', 'unverified']).toContain(check);
      }
      // Evidence, not just a number — the teacher's job is to check the
      // reasoning, and there is nothing to check without it.
      expect(results.body[0].criterionResults[0].evidence).toBeTruthy();
      // The file was actually READ. A submission's storage key is built
      // from ids and carries no extension, so extraction has to be told the
      // declared filename instead — this asserts that it was, because a
      // structural check alone passed happily while every submission
      // extracted to nothing and scored zero.
      expect(results.body[0].aiTotalScore).toBeGreaterThan(0);
      expect(results.body[0].confidence).toBeGreaterThan(0);
    });

    it('sends everything the local provider grades to a human', async () => {
      const results = await request(app.getHttpServer())
        .get(`/exam-sessions/${sessionId}/grading-results`)
        .set('Authorization', `Bearer ${token}`);

      // Word overlap is evidence a topic was mentioned, never that it was
      // answered. Nothing it produces should clear auto-approval.
      expect(results.body[0].status).toBe('flagged_for_review');
      expect(results.body[0].flagForReview).toBe(true);
    });

    it('clicking twice does not produce a second opinion', async () => {
      const again = await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/start-grading`)
        .set('Authorization', `Bearer ${token}`);

      expect(again.body).toMatchObject({ queued: 0, alreadyGraded: 1 });

      const results = await request(app.getHttpServer())
        .get(`/exam-sessions/${sessionId}/grading-results`)
        .set('Authorization', `Bearer ${token}`);
      expect(results.body).toHaveLength(1);
    });

    it('refuses a teacher who does not own the session', async () => {
      const response = await request(app.getHttpServer())
        .post(`/exam-sessions/${sessionId}/start-grading`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe("the AI's own output", () => {
    it('cannot be edited once written (Security rule 6)', async () => {
      const [result] = await dataSource.query(
        `SELECT g.id FROM examcollect.grading_result g
           JOIN examcollect.submission s ON s.id = g.submission_id
          WHERE s.exam_session_id = $1 LIMIT 1`,
        [sessionId],
      );

      // A teacher's edit creates a TeacherReview row instead. The original
      // is what calibration measures against, so overwriting it destroys
      // the only record of what the model actually said.
      await expect(
        dataSource.query(
          // A value the rubric cannot produce. The guard fires on a CHANGE, so
          // a constant that happened to equal the real score would make this
          // test pass by writing nothing at all.
          `UPDATE examcollect.grading_result SET ai_total_score = 999.99 WHERE id = $1`,
          [result.id],
        ),
      ).rejects.toThrow();
    });

    it('cannot be created already approved', async () => {
      const [submission] = await dataSource.query(
        `SELECT id FROM examcollect.submission WHERE exam_session_id = $1 LIMIT 1`,
        [sessionId],
      );
      // Tra theo (giảng viên, tên) chứ không theo môn: rubric đổi chủ ở đợt
      // thu hẹp master data, và `course_id` không còn được ghi.
      const [rubric] = await dataSource.query(
        `SELECT id FROM examcollect.rubric WHERE name = $1 AND version = 1`,
        [RUBRIC_NAME],
      );

      // A row that is auto_approved without ever having been ai_grading is
      // a mark nobody and nothing produced.
      await expect(
        dataSource.query(
          `INSERT INTO examcollect.grading_result
             (submission_id, rubric_id_version, grading_triggered_by, status)
           VALUES ($1, $2, $3, 'auto_approved')`,
          [submission.id, rubric.id, teacherId],
        ),
      ).rejects.toThrow();
    });
  });

  it('says so instead of grading when the SESSION has no rubric', async () => {
    const otherCourse = { id: `Môn chưa có rubric ${stamp}` };
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [otherCourse.id, `Nhóm chưa rubric ${stamp}`, teacherId],
    );
    // Its own room, not `SELECT ... LIMIT 1`. Sharing a room with another
    // session running at the same time is refused by
    // ex_exam_session_room_overlap, and the session creation then fails —
    // which used to make this test pass for the wrong reason, since the
    // undefined id produced a 400 from ParseUUIDPipe rather than the 400
    // this test is actually about.
    const room = { name: `No Rubric Room ${stamp}` };
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `No Rubric Session ${stamp}`,
        classId: klass.id,
        roomName: room.name,
        semesterName: 'HK kiểm thử',
        examType: 'CK',
        ...liveSessionWindow(),
        requiredFilenames: ['Cau1.txt'],
      });

    const response = await request(app.getHttpServer())
      .post(`/exam-sessions/${created.body.id}/start-grading`)
      .set('Authorization', `Bearer ${token}`);

    // Not a silent zero-out-of-zero for every student.
    expect(response.status).toBe(400);
    // And it names the right thing. The message used to say the COURSE had
    // no rubric, which was the wrong place to look once a session pins its
    // own: a course can have several rubrics while this session pinned none.
    expect(response.body.message).toContain('Phiên thi');
  });
});
