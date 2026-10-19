import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { GradeExportDataService } from '../src/grade-export/grade-export.data';
import { ensureDefaultProblem } from '../src/grading/problem/resolve-problem-config';
import { TeacherReviewService } from '../src/grading/teacher-review.service';
import { createTestAccount } from './helpers/create-account';
import { scoreResult, seedSession, SeedSession } from './helpers/grading-seed';

/**
 * P1b Task 7 — xuất tổng một cột khi xuất cả phiên (không chọn file). Phiên nhiều câu: ô điểm của sinh viên là
 * TỔNG của các câu đã chốt, làm tròn đúng một lần; còn câu chưa chốt thì ô trống, không ghi điểm tạm (§8, §13.1).
 */
describe('P1b — xuất tổng sổ điểm cho phiên nhiều câu (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();
  const PASSWORD = 'correct-horse-battery';
  // Chỉ chữ và số: ck_session_roster_mssv từ chối dấu gạch ngang.
  const MSSV_A = 'TOTXA01';
  const MSSV_B = 'TOTXB01';

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `p1b_totx_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: res.body.accessToken as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
  }, 60_000);
  afterAll(async () => app.close());

  /** Một bài của `mssv` cho một câu, trên yêu cầu nộp của câu đó. */
  async function resultFor(ctx: SeedSession, mssv: string, problemId: string, deliverableId: string): Promise<string> {
    const [sub] = await ds.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, status, storage_key)
       VALUES ($1, $2, $3, 'Sinh viên xuất tổng', $4, $5, 'received', NULL) RETURNING id`,
      [ctx.sessionId, deliverableId, mssv, ctx.classId, ctx.teacherId],
    );
    for (const next of ['validated', 'collected']) {
      await ds.query(`UPDATE examcollect.submission SET status = $1 WHERE id = $2`, [next, sub.id]);
    }
    const [res] = await ds.query(
      `INSERT INTO examcollect.grading_result
         (submission_id, rubric_id_version, grading_triggered_by, status, pipeline, problem_id)
       VALUES ($1, $2, $3, 'ai_grading', 'one_shot', $4) RETURNING id`,
      [sub.id, ctx.rubricId, ctx.teacherId, problemId],
    );
    return res.id as string;
  }

  /** Giảng viên đã duyệt bài với điểm `finalScore` (cùng chuỗi như `oneShotReviewed` trong seed). */
  async function reviewed(ctx: SeedSession, resultId: string, finalScore: string): Promise<void> {
    await scoreResult(ds, resultId, '7.00');
    await ds.query(`UPDATE examcollect.grading_result SET status = 'flagged_for_review' WHERE id = $1`, [resultId]);
    await ds.query(`INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score) VALUES ($1, $2, $3)`, [
      resultId,
      ctx.teacherId,
      finalScore,
    ]);
    await ds.query(`UPDATE examcollect.grading_result SET status = 'teacher_reviewed' WHERE id = $1`, [resultId]);
  }

  /** Phiên hai câu, sinh viên A có bài cho cả hai; B không nộp gì. Trả các id để test dựng tiếp. */
  async function world(label: string, withSecond = true) {
    const owner = await login(label);
    const ctx = await seedSession(ds, `totx-${label}`, { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    const p1 = await ensureDefaultProblem(ds.manager, ctx.sessionId);
    const [d2] = await ds.query(
      `INSERT INTO examcollect.required_deliverable (exam_session_id, required_filename, deliverable_type, language)
       VALUES ($1, 'Cau2.docx', 'code_project', 'cpp') RETURNING id`,
      [ctx.sessionId],
    );
    const [p2] = await ds.query(
      `INSERT INTO examcollect.exam_problem (exam_session_id, ordinal, title, points_hundredths, required_deliverable_id)
       VALUES ($1, 2, 'Câu 2', 500, $2) RETURNING id`,
      [ctx.sessionId, d2.id],
    );
    for (const mssv of [MSSV_A, MSSV_B]) {
      await ds.query(
        `INSERT INTO examcollect.session_roster (exam_session_id, student_mssv, student_name, home_class_id, home_teacher_id, source)
         VALUES ($1, $2, 'Sinh viên xuất tổng', $3, $4, 'manual')`,
        [ctx.sessionId, mssv, ctx.classId, ctx.teacherId],
      );
    }
    const r1 = await resultFor(ctx, MSSV_A, p1, ctx.deliverableId);
    const r2 = withSecond ? await resultFor(ctx, MSSV_A, p2.id as string, d2.id as string) : null;
    return { owner, ctx, r1, r2 };
  }

  async function outcomesOf(sessionId: string) {
    const { students } = await ds.transaction((m) => app.get(GradeExportDataService).loadStudents(m, sessionId, null));
    return students;
  }

  it('hai câu đã chốt: ô điểm là tổng của hai câu', async () => {
    const w = await world('both');
    await reviewed(w.ctx, w.r1, '4.30');
    await reviewed(w.ctx, w.r2!, '5.20');
    await app.get(TeacherReviewService).finalizeGrades(w.ctx.sessionId, w.owner.id);

    const students = await outcomesOf(w.ctx.sessionId);
    expect(students.find((s) => s.mssv === MSSV_A)!.outcome).toMatchObject({ kind: 'scored', hundredths: 950 });
    // B không có bài nào: vắng, không phải "chưa chốt".
    expect(students.find((s) => s.mssv === MSSV_B)!.outcome).toEqual({ kind: 'blank', reason: 'absent' });
  });

  it('một câu thiếu bài: ô trống "chưa chốt", không ghi điểm tạm của câu đã chốt', async () => {
    // Không thể chốt phiên khi còn bài đang chấm (finalizeGrades từ chối), nên trường hợp thực tế là sinh viên
    // KHÔNG nộp câu 2 trong khi phiên đã chốt. Đó là tổng tạm: thiếu câu 2.
    const w = await world('partial', false);
    await reviewed(w.ctx, w.r1, '4.30');
    await app.get(TeacherReviewService).finalizeGrades(w.ctx.sessionId, w.owner.id);

    const students = await outcomesOf(w.ctx.sessionId);
    expect(students.find((s) => s.mssv === MSSV_A)!.outcome).toEqual({ kind: 'blank', reason: 'not_finished' });
  });
});
