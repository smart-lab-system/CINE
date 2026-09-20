import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { StorageService } from '../src/storage/storage.service';
import { createTestAccount } from './helpers/create-account';

/**
 * `GET /grading-results/:id/submission-text` — bài làm kèm VỊ TRÍ dẫn chứng.
 *
 * Ca quan trọng nhất ở đây là trích dẫn VẮT QUA RANH GIỚI ĐOẠN. Phép chuẩn
 * hoá gộp dòng trống thành một dấu cách, nên guard chấm nó `ok`; nếu route
 * này chẻ đoạn TRƯỚC khi định vị, nó sẽ trả về `unlocatable` cho đúng câu
 * mà guard đã xác nhận có thật — và màn hình sẽ vu cho AI bịa dẫn chứng.
 */
describe('SubmissionText (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let storage: StorageService;
  const stamp = Date.now();
  let tokenA: string;
  let tokenB: string;
  let idA: string;
  let courseId: string;
  let classId: string;
  let roomId: string;
  let rubricId: string;
  let criterionIds: string[];

  const BAI_LAM =
    'Ưu điểm lớn nhất là khả năng mở rộng từng phần.\n\n' +
    'Nhược điểm là dữ liệu bị phân mảnh giữa các dịch vụ khác nhau.';

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

  /**
   * Một kết quả chấm hoàn chỉnh, có file THẬT trong kho và dẫn chứng do ta
   * đặt — để kiểm đúng phép định vị chứ không kiểm model.
   */
  async function resultWithEvidence(evidences: string[]): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: `Phiên text ${stamp}-${dayCursor}`,
        classId,
        roomId,
        examType: 'TK',
        rubricId,
        // `.txt` để `extractText` đọc thẳng, không cần dựng một file docx thật.
        requiredFilenames: ['Cau1.txt'],
        ...freshWindow(),
      });
    expect(created.status).toBe(201);
    const sessionId = created.body.id as string;
    const deliverableId = created.body.requiredDeliverables[0].id as string;

    const mssv = `SVT${stamp}${dayCursor}`.slice(0, 20);
    const key = storage.buildSubmissionKey(sessionId, mssv, deliverableId);
    const { uploadUrl } = await storage.generateUploadUrl(key);
    const put = await fetch(uploadUrl, { method: 'PUT', body: BAI_LAM });
    expect(put.ok).toBe(true);

    const [row] = await dataSource.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, storage_key, checksum, file_size,
          submitted_via, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'normal', 'received')
       RETURNING id`,
      [
        sessionId, deliverableId, mssv, 'SV Text', classId, idA, key,
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

    const [result] = await dataSource.query(
      `INSERT INTO examcollect.grading_result
         (submission_id, rubric_id_version, grading_triggered_by, status)
       VALUES ($1, $2, $3, 'ai_grading') RETURNING id`,
      [row.id, rubricId, idA],
    );
    const criterionResults = evidences.map((evidence, index) => ({
      criterionId: criterionIds[index],
      verdict: 'met',
      points: 4,
      evidence,
    }));
    await dataSource.query(
      `UPDATE examcollect.grading_result
          SET status = 'ai_graded', ai_total_score = 8, confidence = 0.5,
              criterion_results = $2::jsonb
        WHERE id = $1`,
      [result.id, JSON.stringify(criterionResults)],
    );
    await dataSource.query(
      `UPDATE examcollect.grading_result SET status = 'flagged_for_review' WHERE id = $1`,
      [result.id],
    );
    return result.id as string;
  }

  function fetchText(resultId: string, token: string) {
    return request(app.getHttpServer())
      .get(`/grading-results/${resultId}/submission-text`)
      .set('Authorization', `Bearer ${token}`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);
    storage = app.get(StorageService);

    async function teacher(tag: string) {
      const email = `text_${tag}_${stamp}@example.com`;
      const id = await createTestAccount(dataSource, {
        email,
        password: 'correct-horse-battery',
        role: 'teacher',
      });
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'correct-horse-battery' });
      return { id, token: login.body.accessToken as string };
    }

    const a = await teacher('a');
    const b = await teacher('b');
    idA = a.id;
    tokenA = a.token;
    tokenB = b.token;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Text Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn xem bài làm', $2) RETURNING id`,
      [`TXT${stamp}`.slice(0, 20), semester.id],
    );
    courseId = course.id;
    const [room] = await dataSource.query(
      `INSERT INTO examcollect.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Phòng text ${stamp}`],
    );
    roomId = room.id;
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, course_name, name, teacher_id)
       VALUES ($1, (SELECT name FROM examcollect.course WHERE id = $1), $2, $3) RETURNING id`,
      [courseId, `Nhóm text ${stamp}`, idA],
    );
    classId = klass.id;
    for (let i = 1; i <= 6; i += 1) {
      await dataSource.query(
        `INSERT INTO examcollect.enrollment
           (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [`SVT${stamp}${i}`.slice(0, 20), 'SV Text', courseId, classId, idA],
      );
    }

    const rubric = await request(app.getHttpServer())
      .post('/rubrics')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: `Rubric trích văn bản ${stamp}`,
        criteria: [
          { description: 'Nêu được ưu điểm', maxPoints: 4 },
          { description: 'Nêu được nhược điểm', maxPoints: 4 },
        ],
      });
    expect(rubric.status).toBe(201);
    rubricId = rubric.body.id;
    criterionIds = rubric.body.criteria.map((c: { id: string }) => c.id);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('403 khi giảng viên KHÁC gọi — đây là bài làm của sinh viên', async () => {
    const resultId = await resultWithEvidence(['khả năng mở rộng từng phần']);
    await fetchText(resultId, tokenB).expect(403);
  });

  it('trả đoạn và toạ độ trỏ đúng chỗ trong đoạn', async () => {
    const resultId = await resultWithEvidence([
      'khả năng mở rộng từng phần',
      'dữ liệu bị phân mảnh',
    ]);
    const res = await fetchText(resultId, tokenA).expect(200);

    expect(res.body.paragraphs).toHaveLength(2);
    expect(res.body.unlocatable).toEqual([]);
    expect(res.body.truncatedByGrading).toBe(false);

    for (const span of res.body.spans) {
      const paragraph = res.body.paragraphs[span.paragraph] as string;
      const sliced = paragraph.slice(span.start, span.end);
      // Toạ độ phải cắt ra đúng chữ, không lệch một ký tự nào.
      expect(['khả năng mở rộng từng phần', 'dữ liệu bị phân mảnh']).toContain(sliced);
    }
  });

  it('trích dẫn VẮT QUA hai đoạn ra hai span cùng tiêu chí, KHÔNG vào unlocatable', async () => {
    // Guard chấm câu này `ok` vì chuẩn hoá gộp dòng trống thành dấu cách.
    // Route phải nói cùng một câu chuyện với guard.
    const resultId = await resultWithEvidence(['từng phần. Nhược điểm là dữ liệu']);
    const res = await fetchText(resultId, tokenA).expect(200);

    expect(res.body.unlocatable).toEqual([]);
    const spans = res.body.spans as { criterionId: string; paragraph: number }[];
    expect(spans).toHaveLength(2);
    expect(spans[0].criterionId).toBe(spans[1].criterionId);
    expect(spans.map((s) => s.paragraph)).toEqual([0, 1]);
  });

  it('dẫn chứng không có trong bài vào unlocatable, không sinh span', async () => {
    const resultId = await resultWithEvidence(['một hệ thống giám sát tập trung']);
    const res = await fetchText(resultId, tokenA).expect(200);

    expect(res.body.unlocatable).toEqual([criterionIds[0]]);
    expect(res.body.spans).toEqual([]);
  });

  it('dẫn chứng RỖNG không phải lỗi — không vào unlocatable', async () => {
    // Rỗng nghĩa là sinh viên không đề cập tiêu chí. Đó là tín hiệu hợp lệ
    // và là đầu vào của cổng phản biện, khác hẳn AI trích một câu không có.
    const resultId = await resultWithEvidence(['']);
    const res = await fetchText(resultId, tokenA).expect(200);

    expect(res.body.unlocatable).toEqual([]);
    expect(res.body.spans).toEqual([]);
  });
});
