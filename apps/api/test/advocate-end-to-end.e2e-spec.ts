import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { StorageService } from '../src/storage/storage.service';
import {
  ADVOCATE_PROVIDER,
  type AdvocateProvider,
  type AdvocateRequest,
} from '../src/grading/ai-provider/advocate-provider';
import { createTestAccount } from './helpers/create-account';

/**
 * Lượt phản biện chạy THẬT — đầu đến cuối.
 *
 * Đây là ca chứng minh của cả đợt 0→3. Trước nó, `advocate_opinion` chưa
 * bao giờ khác `null` trong một lần chạy thật: nhánh này đòi có đề bài
 * trong `grading_reference`, và không màn hình nào đặt được bản ghi đó.
 *
 * VÌ SAO PHẢI OVERRIDE PROVIDER, KHÔNG PHẢI VÌ TIỆN:
 * `selectAdvocateProvider()` trả `null` khi `NODE_ENV === 'test'` — cố ý,
 * để một bộ test không tiêu tiền thật. Guard đó phải Ở NGUYÊN. Cách đúng là
 * tiêm một provider của riêng test, và thứ bộ test này khẳng định cũng
 * không phải chất lượng của model: nó khẳng định CỔNG và ĐƯỜNG DỮ LIỆU —
 * có đề bài thì lượt phản biện chạy, không có thì không, và ý kiến đi được
 * tới payload mà màn hình đọc.
 */
class StubAdvocateProvider implements AdvocateProvider {
  readonly name = 'stub-advocate@test';
  /** Lời gọi cuối, để khẳng định đề bài THẬT SỰ tới nơi. */
  lastRequest: AdvocateRequest | null = null;

  async advocate(request: AdvocateRequest) {
    this.lastRequest = request;
    return {
      isCorrect: 'yes' as const,
      reasoning: 'Em ấy mô tả đúng cơ chế bù trừ, chỉ thiếu tên gọi của mẫu thiết kế.',
      evidence: [],
      suggestedVerdicts: [],
      unverifiedEvidence: null,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 },
    };
  }
}

describe('Lượt phản biện chạy thật (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let storage: StorageService;
  const advocate = new StubAdvocateProvider();
  const stamp = Date.now();
  let token: string;
  let teacherId: string;
  let courseName: string;
  let classId: string;
  let roomName: string;
  let rubricId: string;

  /** Không nhắc tới thuật ngữ mà rubric đòi, nên sẽ có tiêu chí chưa đạt. */
  const BAI_LAM =
    'Em ghi lại một bản ghi trạng thái trung gian rồi chạy một tiến trình nền ' +
    'đọc bản ghi đó để hoàn tác phần đã thực hiện.';

  let dayCursor = 0;
  function freshWindow() {
    dayCursor += 1;
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + dayCursor);
    start.setUTCHours(8, 0, 0, 0);
    const end = new Date(start);
    end.setUTCHours(10);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }

  /** Một phiên có một bài đã thu, kèm id tài liệu đề bài đã tải lên thật. */
  async function sessionReadyToGrade(): Promise<{
    sessionId: string;
    submissionId: string;
    materialId: string;
  }> {
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Phiên phản biện ${stamp}-${dayCursor}`,
        classId,
        roomName,
        semesterName: 'HK kiểm thử',
        examType: 'TK',
        rubricId,
        requiredFilenames: ['Cau1.txt'],
        ...freshWindow(),
      });
    expect(created.status).toBe(201);
    const sessionId = created.body.id as string;
    const deliverableId = created.body.requiredDeliverables[0].id as string;

    // Đề bài THẬT trong kho: `loadForGrading` đọc bytes ra, và `loadedLevel`
    // chỉ lên `with_question` khi đọc được.
    const questionBytes = Buffer.from('Đề bài: trình bày cách xử lý nhất quán dữ liệu.');
    const minted = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/materials/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'de-thi.txt', fileSize: questionBytes.length });
    expect(minted.status).toBe(200);
    const put = await fetch(minted.body.uploadUrl, { method: 'PUT', body: questionBytes });
    expect(put.ok).toBe(true);
    const material = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/materials`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        examMaterialId: minted.body.examMaterialId,
        storageKey: minted.body.storageKey,
        fileName: 'de-thi.txt',
        fileSize: questionBytes.length,
      });
    expect(material.status).toBe(201);

    const mssv = `SVA${stamp}${dayCursor}`.slice(0, 20);
    const key = storage.buildSubmissionKey(sessionId, mssv, deliverableId);
    const { uploadUrl } = await storage.generateUploadUrl(key);
    const uploaded = await fetch(uploadUrl, { method: 'PUT', body: BAI_LAM });
    expect(uploaded.ok).toBe(true);

    const [row] = await dataSource.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, storage_key, checksum, file_size,
          submitted_via, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'normal', 'received')
       RETURNING id`,
      [
        sessionId, deliverableId, mssv, 'SV Phản biện', classId, teacherId, key,
        'a'.repeat(64), Buffer.byteLength(BAI_LAM),
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

    return { sessionId, submissionId: row.id, materialId: material.body.id };
  }

  async function waitForGraded(submissionId: string, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const [row] = await dataSource.query(
        `SELECT id, status FROM examcollect.grading_result WHERE submission_id = $1`,
        [submissionId],
      );
      if (row && row.status !== 'ai_grading') return row.id as string;
      if (Date.now() > deadline) {
        throw new Error(
          `bài ${submissionId} chưa chấm xong sau ${timeoutMs}ms (status=${row?.status ?? 'chưa có dòng'})`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Guard NODE_ENV ở `selectAdvocateProvider` giữ nguyên; chỗ này chỉ
      // thay thứ nó trả về, cho riêng bộ test này.
      .overrideProvider(ADVOCATE_PROVIDER)
      .useValue(advocate)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);
    storage = app.get(StorageService);

    const email = `adv_${stamp}@example.com`;
    teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    token = login.body.accessToken as string;

    const course = { name: 'Môn phản biện' };
    courseName = course.name;
    const room = { name: `Phòng phản biện ${stamp}` };
    roomName = room.name;
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_name, name, teacher_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [courseName, `Nhóm phản biện ${stamp}`, teacherId],
    );
    classId = klass.id;
    for (let i = 1; i <= 4; i += 1) {
      await dataSource.query(
        `INSERT INTO examcollect.enrollment
           (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4)`,
        [`SVA${stamp}${i}`.slice(0, 20), 'SV Phản biện', classId, teacherId],
      );
    }

    const rubric = await request(app.getHttpServer())
      .post('/rubrics')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Rubric phản biện ${stamp}`,
        criteria: [
          { description: 'Nêu được mẫu thiết kế Saga hoặc Outbox', maxPoints: 4 },
        ],
      });
    expect(rubric.status).toBe(201);
    rubricId = rubric.body.id;
  }, 90_000);

  afterAll(async () => {
    await app?.close();
  });

  it('đặt đề bài → mức sẵn sàng lên 2 → chấm → có ý kiến phản biện', async () => {
    const { sessionId, submissionId, materialId } = await sessionReadyToGrade();

    // 1. Chưa cấu hình gì: mức 1.
    const before = await request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}/grading-readiness`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(before.body.level).toBe('rubric_only');

    // 2. Chỉ định ĐỀ BÀI — đường mà cho tới nay không màn hình nào đi.
    await request(app.getHttpServer())
      .put(`/exam-sessions/${sessionId}/grading-reference`)
      .set('Authorization', `Bearer ${token}`)
      .send({ questionMaterialId: materialId })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}/grading-readiness`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.level).toBe('with_question');
    expect(after.body.hasQuestion).toBe(true);

    // 3. Chấm.
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/start-grading`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await waitForGraded(submissionId);

    // 4. Đề bài PHẢI tới được lượt phản biện — không chỉ được ghi vào DB.
    expect(advocate.lastRequest).not.toBeNull();
    expect(advocate.lastRequest!.questionPdf).toBeDefined();

    // 5. Thứ chưa bao giờ đúng trước đợt này.
    const results = await request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}/grading-results`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(results.body[0].advocateOpinion).not.toBeNull();
    expect(results.body[0].advocateOpinion.isCorrect).toBe('yes');

    //  nói về BẬC MODEL ĐÃ TRẢ LỜI lượt chấm, KHÔNG về
    // cấu hình phiên. Ở môi trường test, bậc trả lời là provider sàn (đếm
    // từ khoá) và nó khai  một cách trung thực vì không đụng tới đề
    // bài. Lượt phản biện đọc đề bài bằng đường RIÊNG — đã khẳng định ở
    // bước 4 — nên hai cờ này không nói cùng một chuyện.
    expect(results.body[0].contextUsedQuestion).toBe(false);
  }, 90_000);

  it('KHÔNG có đề bài thì lượt phản biện không chạy', async () => {
    advocate.lastRequest = null;
    const { sessionId, submissionId } = await sessionReadyToGrade();

    // Bỏ hẳn bước chỉ định đề bài — đây là trạng thái mà toàn hệ thống đã
    // nằm trong đó cho tới hôm nay, và nó im lặng.
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/start-grading`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await waitForGraded(submissionId);

    expect(advocate.lastRequest).toBeNull();

    const results = await request(app.getHttpServer())
      .get(`/exam-sessions/${sessionId}/grading-results`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(results.body[0].advocateOpinion).toBeNull();
    expect(results.body[0].contextUsedQuestion).toBe(false);
  }, 90_000);
});
