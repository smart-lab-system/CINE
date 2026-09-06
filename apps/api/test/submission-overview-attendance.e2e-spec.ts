import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Trục mức độ mới: tách "chưa nộp" thành "đã vào phòng mà mất bài" (đỏ) và
 * "chưa từng vào phòng" (vàng). Nguồn là agent_connection_event — quan hệ
 * một-nhiều THỨ TƯ của exam_session, nên có test riêng chống fan-out.
 */
describe('Submission overview — attendance tiers (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let schema: string;

  const stamp = Date.now();
  let token: string;
  let teacherId: string;
  let courseId: string;
  let classId: string;
  let roomId: string;

  const ROSTER = ['A', 'B', 'C', 'D'].map((s) => `AT${stamp}${s}`.slice(0, 20));

  /**
   * Mỗi phiên phải có cửa sổ thời gian RIÊNG, không chồng nhau.
   *
   * Ba luật cùng lúc bó buộc chỗ này, và cả ba đều có thật trong repo:
   *  - CreateExamSessionDto: startTime không được lùi quá 30 phút (MAX_BACKDATE_MINUTES).
   *  - CreateExamSessionDto: phiên phải dài tối thiểu 15 phút.
   *  - ex_exam_session_room_overlap / _class_overlap: hai phiên chưa
   *    completed/cancelled không được chồng khung giờ trên cùng phòng HOẶC
   *    cùng lớp — mà mọi phiên ở đây dùng chung cả phòng lẫn lớp.
   *
   * Nên: phiên thứ k chạy từ (now + 5 + 20k) phút, dài 15 phút.
   */
  let sessionIndex = 0;
  function nextWindow() {
    const offsetMs = (5 + 20 * sessionIndex) * 60_000;
    sessionIndex += 1;
    const start = Date.now() + offsetMs;
    return {
      startTime: new Date(start).toISOString(),
      endTime: new Date(start + 15 * 60_000).toISOString(),
    };
  }

  async function createSession(name: string, filenames: string[]) {
    const res = await request(app.getHttpServer())
      .post('/exam-sessions').set('Authorization', `Bearer ${token}`)
      .send({
        name, classId, roomId, examType: 'TK',
        ...nextWindow(),
        requiredFilenames: filenames,
      });
    expect(res.status).toBe(201);
    return {
      id: res.body.id as string,
      deliverableIds: (res.body.requiredDeliverables as { id: string }[]).map((d) => d.id),
    };
  }

  /** Trigger validate_submission_lifecycle cấm INSERT thẳng 'collected'. */
  async function collect(sessionId: string, deliverableId: string, mssv: string) {
    const [row] = await dataSource.query(
      `INSERT INTO ${schema}.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,'received') RETURNING id`,
      [sessionId, deliverableId, mssv, `SV ${mssv}`, classId, teacherId],
    );
    await dataSource.query(`UPDATE ${schema}.submission SET status='validated' WHERE id=$1`, [row.id]);
    await dataSource.query(`UPDATE ${schema}.submission SET status='collected' WHERE id=$1`, [row.id]);
  }

  async function connect(sessionId: string, mssv: string, times = 1) {
    for (let i = 0; i < times; i += 1) {
      await dataSource.query(
        `INSERT INTO ${schema}.agent_connection_event (exam_session_id, student_mssv, event_type)
         VALUES ($1, $2, $3)`,
        [sessionId, mssv, i % 2 === 0 ? 'connected' : 'disconnected'],
      );
    }
  }

  async function overview(id: string) {
    const res = await request(app.getHttpServer())
      .get('/submissions/overview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const found = (res.body.items as Record<string, unknown>[]).find((i) => i.id === id);
    if (!found) throw new Error(`session ${id} missing from overview`);
    return found as Record<string, number | string | null>;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);
    schema = (dataSource.options as { schema?: string }).schema ?? 'examcollect';

    const email = `attend_${stamp}@example.com`;
    teacherId = await createTestAccount(dataSource, {
      email, password: 'correct-horse-battery', role: 'teacher',
    });
    token = (await request(app.getHttpServer()).post('/auth/login')
      .send({ email, password: 'correct-horse-battery' })).body.accessToken;

    const [semester] = await dataSource.query(
      `INSERT INTO ${schema}.semester (name, start_date, end_date)
       VALUES ($1, '2026-09-01', '2027-01-15') RETURNING id`,
      [`Attend Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO ${schema}.course (code, name, semester_id)
       VALUES ($1, 'Attend Course', $2) RETURNING id`,
      [`AT${stamp}`.slice(0, 20), semester.id],
    );
    courseId = course.id;
    const [room] = await dataSource.query(
      `INSERT INTO ${schema}.room (name, capacity) VALUES ($1, 40) RETURNING id`,
      [`Attend Room ${stamp}`],
    );
    roomId = room.id;
    const [klass] = await dataSource.query(
      `INSERT INTO ${schema}.class (course_id, name, teacher_id) VALUES ($1, 'N01', $2) RETURNING id`,
      [courseId, teacherId],
    );
    classId = klass.id;

    for (const mssv of ROSTER) {
      await dataSource.query(
        `INSERT INTO ${schema}.enrollment
           (student_mssv, student_name, course_id, home_class_id, home_teacher_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [mssv, `SV ${mssv}`, courseId, classId, teacherId],
      );
    }
  }, 60_000);

  afterAll(async () => { await app.close(); });

  it('SV có event và 0 bài → attendedNoSubmission, KHÔNG phải neverAttended', async () => {
    const s = await createSession(`Attended ${stamp}`, ['Cau1.docx']);
    await connect(s.id, ROSTER[0]);

    const item = await overview(s.id);
    expect(item.attendedNoSubmissionCount).toBe(1);
    expect(item.neverAttendedCount).toBe(3);
    expect(item.expectedCount).toBe(4);
  }, 30_000);

  it('SV không event và 0 bài → neverAttended', async () => {
    const s = await createSession(`NeverAttended ${stamp}`, ['Cau1.docx']);

    const item = await overview(s.id);
    expect(item.attendedNoSubmissionCount).toBe(0);
    // "Không có gì ở phiên này" tách làm hai kể từ satElsewhereCount: SV có
    // mặt ở một phiên khác CÙNG MÔN + CÙNG LOẠI kỳ thi là thi bù, không phải
    // vắng thi. Mọi phiên ở đây dùng chung môn và đều là TK, nên SV đã kết
    // nối ở test trước rơi sang nhóm đó — điều đúng, và cũng là lý do con số
    // bất biến phải viết thành tổng chứ không phải một vế.
    expect((item.neverAttendedCount as number) + (item.satElsewhereCount as number)).toBe(4);
  }, 30_000);

  it('SV nộp thiếu → partial, bất kể có event hay không', async () => {
    const s = await createSession(`Partial ${stamp}`, ['Cau1.docx', 'Cau2.docx']);
    await connect(s.id, ROSTER[0]);
    await collect(s.id, s.deliverableIds[0], ROSTER[0]);   // có event, nộp 1/2
    await collect(s.id, s.deliverableIds[0], ROSTER[1]);   // không event, nộp 1/2

    const item = await overview(s.id);
    expect(item.partialCount).toBe(2);
    expect(item.attendedNoSubmissionCount).toBe(0);
    expect(item.neverAttendedCount).toBe(2);
  }, 30_000);

  it('CHỐNG FAN-OUT: 10 event của cùng 1 SV vẫn chỉ đếm là 1', async () => {
    const s = await createSession(`Fanout ${stamp}`, ['Cau1.docx']);
    await connect(s.id, ROSTER[0], 10);

    const item = await overview(s.id);
    // Không có DISTINCT trong CTE attended, universe sẽ nhân lên 10 lần và
    // expectedCount vọt lên 13 thay vì 4.
    expect(item.attendedNoSubmissionCount).toBe(1);
    expect(item.expectedCount).toBe(4);
    // Xem ghi chú ở test "SV không event và 0 bài": mọi phiên trong file này
    // cùng môn + cùng loại TK, nên SV đã có mặt ở phiên trước rơi sang
    // satElsewhere. Tổng hai nhóm mới là con số bất biến.
    expect((item.neverAttendedCount as number) + (item.satElsewhereCount as number)).toBe(3);
  }, 30_000);

  it('bất biến: 4 nhóm cộng lại bằng expectedCount', async () => {
    const s = await createSession(`Invariant ${stamp}`, ['Cau1.docx', 'Cau2.docx']);
    await connect(s.id, ROSTER[0]);
    await collect(s.id, s.deliverableIds[0], ROSTER[1]);
    await collect(s.id, s.deliverableIds[1], ROSTER[1]);   // đủ 2/2
    await collect(s.id, s.deliverableIds[0], ROSTER[2]);   // thiếu 1/2

    const item = await overview(s.id);
    expect(item.fullySubmittedCount).toBe(1);
    expect(item.partialCount).toBe(1);
    expect(item.attendedNoSubmissionCount).toBe(1);
    // Xem ghi chú ở test "SV không event và 0 bài": mọi phiên trong file này
    // cùng môn + cùng loại TK, nên SV đã có mặt ở phiên trước rơi sang
    // satElsewhere. Tổng hai nhóm mới là con số bất biến.
    expect(
      (item.neverAttendedCount as number) + (item.satElsewhereCount as number),
    ).toBe(1);
    // NĂM nhóm, không phải bốn.
    expect(
      (item.fullySubmittedCount as number) + (item.partialCount as number) +
      (item.attendedNoSubmissionCount as number) + (item.satElsewhereCount as number) +
      (item.neverAttendedCount as number),
    ).toBe(item.expectedCount);
  }, 30_000);

  it('trả về học kỳ và hai cột vòng đời', async () => {
    const s = await createSession(`Meta ${stamp}`, ['Cau1.docx']);

    let item = await overview(s.id);
    expect(item.semesterName).toBe(`Attend Semester ${stamp}`);
    expect(item.semesterId).toEqual(expect.any(String));
    expect(item.archivedAt).toBeNull();
    expect(item.attentionClosedAt).toBeNull();
    expect(item.notSubmittedCount).toBeUndefined();

    await request(app.getHttpServer())
      .post(`/exam-sessions/${s.id}/archive`).set('Authorization', `Bearer ${token}`);
    item = await overview(s.id);
    // Lọc là việc của client — API vẫn trả phiên đã lưu trữ, kèm mốc.
    expect(item.archivedAt).toEqual(expect.any(String));
    // Xem ghi chú ở test "SV không event và 0 bài": mọi phiên trong file này
    // cùng môn + cùng loại TK, nên SV đã có mặt ở phiên trước rơi sang
    // satElsewhere. Tổng hai nhóm mới là con số bất biến.
    expect((item.neverAttendedCount as number) + (item.satElsewhereCount as number)).toBe(4);
  }, 30_000);
});
