import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { ensureDefaultProblem } from '../src/grading/problem/resolve-problem-config';
import { TeacherReviewService } from '../src/grading/teacher-review.service';
import { createTestAccount } from './helpers/create-account';
import { scoreResult, seedSession, SeedSession } from './helpers/grading-seed';

/**
 * P1b Task 9 (Đợt B) — `GET /exam-sessions/:id/grading-students`: một dòng mỗi sinh viên, với tổng theo Task 5 và
 * một chip theo từng câu. Route cũ `grading-results` không đổi.
 */
describe('P1b — danh sách một dòng mỗi sinh viên (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();
  const PASSWORD = 'correct-horse-battery';
  // Chỉ chữ và số: ck_session_roster_mssv từ chối dấu gạch ngang.
  const A = 'STUDA01';
  const B = 'STUDB01';
  const C = 'STUDC01';

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `p1b_students_${label}_${stamp}@example.com`;
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

  async function resultFor(ctx: SeedSession, mssv: string, problemId: string, deliverableId: string): Promise<string> {
    const [sub] = await ds.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, status, storage_key)
       VALUES ($1, $2, $3, 'Sinh viên danh sách', $4, $5, 'received', NULL) RETURNING id`,
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

  it('một dòng mỗi sinh viên, đủ chip theo câu; tổng theo Task 5 (chốt đủ, thiếu câu, vắng)', async () => {
    const owner = await login('board');
    const ctx = await seedSession(ds, 'students-board', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
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
    for (const mssv of [A, B, C]) {
      await ds.query(
        `INSERT INTO examcollect.session_roster (exam_session_id, student_mssv, student_name, home_class_id, home_teacher_id, source)
         VALUES ($1, $2, $3, $4, $5, 'manual')`,
        [ctx.sessionId, mssv, `Sinh viên ${mssv}`, ctx.classId, ctx.teacherId],
      );
    }

    // A: hai câu đã duyệt. B: chỉ câu 1 đã duyệt. C: không nộp gì.
    const a1 = await resultFor(ctx, A, p1, ctx.deliverableId);
    const a2 = await resultFor(ctx, A, p2.id as string, d2.id as string);
    const b1 = await resultFor(ctx, B, p1, ctx.deliverableId);
    await reviewed(ctx, a1, '4.30');
    await reviewed(ctx, a2, '5.20');
    await reviewed(ctx, b1, '3.00');
    await app.get(TeacherReviewService).finalizeGrades(ctx.sessionId, owner.id);

    const res = await request(app.getHttpServer())
      .get(`/exam-sessions/${ctx.sessionId}/grading-students`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    const rows = res.body as {
      mssv: string;
      name: string;
      total: { kind: string; hundredths?: number; missing?: number[] };
      problems: { ordinal: number; problemId: string; status: string; scoreHundredths: number | null; auditPending: boolean }[];
    }[];
    expect(rows.map((r) => r.mssv).sort()).toEqual([A, B, C].sort()); // đúng một dòng mỗi sinh viên

    const a = rows.find((r) => r.mssv === A)!;
    expect(a.total).toEqual({ kind: 'final', hundredths: 950 });
    expect(a.problems.map((p) => [p.ordinal, p.status, p.scoreHundredths, p.auditPending])).toEqual([
      [1, 'finalized', 430, false],
      [2, 'finalized', 520, false],
    ]);
    expect(a.problems[1].problemId).toBe(p2.id);

    const b = rows.find((r) => r.mssv === B)!;
    expect(b.total).toEqual({ kind: 'tạm', hundredths: 300, missing: [2] });
    expect(b.problems.map((p) => [p.ordinal, p.status, p.scoreHundredths])).toEqual([
      [1, 'finalized', 300],
      [2, 'blank', null],
    ]);

    const c = rows.find((r) => r.mssv === C)!;
    expect(c.total).toEqual({ kind: 'tạm', hundredths: 0, missing: [1, 2] });
  });
});
