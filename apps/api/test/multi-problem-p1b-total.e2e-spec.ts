import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ensureDefaultProblem } from '../src/grading/problem/resolve-problem-config';
import { loadStudentTotals } from '../src/grading/problem/student-total.query';
import { seedSession, SeedSession } from './helpers/grading-seed';

/**
 * P1b Task 5 — truy vấn điểm tổng đọc đúng bài của từng câu. Sinh viên vắng bài cho câu nào thì câu đó là
 * thiếu; một bài đang chấm dở thì câu đó là tạm. Không có điểm nào đã chốt ở đây, nên mọi tổng đều là `tạm`.
 */
describe('P1b — điểm tổng sinh viên, truy vấn (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });

  afterAll(async () => app.close());

  async function addRosterStudent(ctx: SeedSession, mssv: string): Promise<void> {
    await ds.query(
      `INSERT INTO examcollect.session_roster (exam_session_id, student_mssv, student_name, home_class_id, home_teacher_id, source)
       VALUES ($1, $2, 'Sinh viên kiểm total', $3, $4, 'manual')`,
      [ctx.sessionId, mssv, ctx.classId, ctx.teacherId],
    );
  }

  it('hai câu, hai sinh viên: một bài đang chấm ở câu 1, câu 2 không ai có → tổng tạm theo đúng câu thiếu', async () => {
    const ctx = await seedSession(ds, 'total-q', { deliverableType: 'code_project', language: 'cpp' });
    const firstId = await ensureDefaultProblem(ds.manager, ctx.sessionId);
    await ds.query(
      `INSERT INTO examcollect.exam_problem (exam_session_id, ordinal, title, points_hundredths) VALUES ($1, 2, 'Câu 2', 500)`,
      [ctx.sessionId],
    );
    await addRosterStudent(ctx, 'TOT001');
    await addRosterStudent(ctx, 'TOT002');

    // TOT001 nộp bài và có một kết quả đang chấm, gắn đúng câu 1.
    const [sub] = await ds.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, status, storage_key)
       VALUES ($1, $2, 'TOT001', 'Sinh viên kiểm total', $3, $4, 'received', NULL) RETURNING id`,
      [ctx.sessionId, ctx.deliverableId, ctx.classId, ctx.teacherId],
    );
    for (const next of ['validated', 'collected']) {
      await ds.query(`UPDATE examcollect.submission SET status = $1 WHERE id = $2`, [next, sub.id]);
    }
    await ds.query(
      `INSERT INTO examcollect.grading_result
         (submission_id, rubric_id_version, grading_triggered_by, status, pipeline, problem_id)
       VALUES ($1, $2, $3, 'ai_grading', 'one_shot', $4)`,
      [sub.id, ctx.rubricId, ctx.teacherId, firstId],
    );

    const totals = await loadStudentTotals(ds.manager, ctx.sessionId);

    // TOT001: câu 1 đang chấm (tạm, chưa cộng), câu 2 không có bài → thiếu [2].
    expect(totals.get('tot001')).toEqual({ kind: 'tạm', hundredths: 0, missing: [2] });
    // TOT002: không có bài nào → thiếu cả hai câu.
    expect(totals.get('tot002')).toEqual({ kind: 'tạm', hundredths: 0, missing: [1, 2] });
  });
});
