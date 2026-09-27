import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { canTransition, GRADING_STATUSES } from '../src/grading/lifecycle/grading-transitions';
import { TeacherReviewService } from '../src/grading/teacher-review.service';
import { forceStatus, scoreResult, seedResult, seedSession, SeedSession } from './helpers/grading-seed';

describe('Máy trạng thái §14.3 ở tầng DB (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let ctx: SeedSession;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    ctx = await seedSession(ds, 'life2');
  });
  afterAll(async () => app.close());

  /** Trạng thái nguồn đặt thẳng; bài ở `flagged_for_review` là bài không chấm được lớp system, để ca chấm lại hợp lệ. */
  async function resultAt(status: string): Promise<string> {
    const { resultId } = await seedResult(ds, ctx);
    const extra: Record<string, unknown> =
      status === 'flagged_for_review'
        ? { ungradable_class: 'system', ungradable_reason: 'seed', confidence: 0 }
        : status === 'finalized' || status === 'exported'
          ? { finalized_by: ctx.teacherId, finalized_at: new Date() }
          : {};
    if (status !== 'ai_grading') await forceStatus(ds, resultId, status, extra);
    return resultId;
  }

  it('T-LIFE-1: mọi cặp trạng thái — trigger chấp nhận ĐÚNG những cặp của bảng §14.3', async () => {
    const mismatches: string[] = [];
    for (const from of GRADING_STATUSES) {
      for (const to of GRADING_STATUSES) {
        if (from === to) continue;
        const id = await resultAt(from);
        const stamp = to === 'finalized' ? `, finalized_by = '${ctx.teacherId}', finalized_at = now()` : '';
        const accepted = await ds
          .query(`UPDATE examcollect.grading_result SET status = $2${stamp} WHERE id = $1`, [id, to])
          .then(() => true, () => false);
        if (accepted !== canTransition(from, to)) mismatches.push(`${from} → ${to}: DB ${accepted ? 'cho' : 'chặn'}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('T-FIN-2 (phần DB): sang finalized thiếu finalized_by bị từ chối', async () => {
    const id = await resultAt('teacher_reviewed');
    await expect(ds.query(`UPDATE examcollect.grading_result SET status = 'finalized' WHERE id = $1`, [id]))
      .rejects.toThrow(/finalized_by/);
  });

  it('chấm lại (flagged → ai_grading) chỉ cho bài không chấm được lớp system, chưa có điểm (§2.3 luật 1, 4)', async () => {
    const { resultId } = await seedResult(ds, ctx);
    await scoreResult(ds, resultId);
    await ds.query(`UPDATE examcollect.grading_result SET status = 'flagged_for_review' WHERE id = $1`, [resultId]);
    await expect(ds.query(`UPDATE examcollect.grading_result SET status = 'ai_grading' WHERE id = $1`, [resultId]))
      .rejects.toThrow(/Chỉ chấm lại/);

    const sub = await resultAt('ai_grading');
    await forceStatus(ds, sub, 'flagged_for_review', { ungradable_class: 'submission', ungradable_reason: 'file hỏng' });
    await expect(ds.query(`UPDATE examcollect.grading_result SET status = 'ai_grading' WHERE id = $1`, [sub]))
      .rejects.toThrow(/Chỉ chấm lại/);
  });

  it('pipeline không bao giờ đổi (§14.1, §2.3 luật 8)', async () => {
    const { resultId } = await seedResult(ds, ctx);
    await expect(ds.query(`UPDATE examcollect.grading_result SET pipeline = 'investigator' WHERE id = $1`, [resultId]))
      .rejects.toThrow(/pipeline/);
  });

  it('T-FIN-2: chốt phiên → mọi bài finalized mang finalized_by là người bấm', async () => {
    const own = await seedSession(ds, 'life2-fin');
    const a = await seedResult(ds, own);
    const b = await seedResult(ds, own);
    for (const r of [a, b]) await scoreResult(ds, r.resultId);
    await ds.query(`UPDATE examcollect.grading_result SET status = 'auto_approved' WHERE id = $1`, [a.resultId]);
    await ds.query(`UPDATE examcollect.grading_result SET status = 'flagged_for_review' WHERE id = $1`, [b.resultId]);
    await ds.query(
      `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score) VALUES ($1, $2, 6)`,
      [b.resultId, own.teacherId],
    );
    await ds.query(`UPDATE examcollect.grading_result SET status = 'teacher_reviewed' WHERE id = $1`, [b.resultId]);

    await app.get(TeacherReviewService).finalizeGrades(own.sessionId, own.teacherId);

    const rows = await ds.query(
      `SELECT status, finalized_by, finalized_at IS NOT NULL AS stamped FROM examcollect.grading_result WHERE id = ANY($1)`,
      [[a.resultId, b.resultId]],
    );
    expect(rows).toEqual([
      { status: 'finalized', finalized_by: own.teacherId, stamped: true },
      { status: 'finalized', finalized_by: own.teacherId, stamped: true },
    ]);
  });

  it('bài đang kiểm mẫu chặn chốt điểm', async () => {
    const own = await seedSession(ds, 'life2-audit');
    const r = await seedResult(ds, own);
    await forceStatus(ds, r.resultId, 'audit_pending');
    await expect(app.get(TeacherReviewService).finalizeGrades(own.sessionId, own.teacherId)).rejects.toThrow(/chưa duyệt xong/);
  });
});
