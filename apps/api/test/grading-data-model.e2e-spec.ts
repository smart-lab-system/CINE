import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { scoreResult, seedCriterion, seedResult, seedSession } from './helpers/grading-seed';

/** Mô hình dữ liệu §14.1 ở tầng DB: cột, ràng buộc, dữ liệu cũ. Bảng mới thêm ở task sau. */
describe('Mô hình dữ liệu §14 (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => app.close());

  describe('grading_result', () => {
    it('kết quả mới mặc định đi đường one_shot, chưa có lớp lý do, chưa rút mẫu', async () => {
      const ctx = await seedSession(ds, 'dm-default');
      const { resultId } = await seedResult(ds, ctx);
      const [row] = await ds.query(
        `SELECT pipeline, ungradable_class, audit_sampled, current_attempt_id, finalized_by
           FROM examcollect.grading_result WHERE id = $1`,
        [resultId],
      );
      expect(row).toEqual({ pipeline: 'one_shot', ungradable_class: null, audit_sampled: false, current_attempt_id: null, finalized_by: null });
    });

    it('bài đã mang điểm AI thì không mang lớp lý do không chấm được', async () => {
      const ctx = await seedSession(ds, 'dm-class');
      const { resultId } = await seedResult(ds, ctx);
      await scoreResult(ds, resultId);
      await expect(
        ds.query(`UPDATE examcollect.grading_result SET ungradable_class = 'system', ungradable_reason = 'x' WHERE id = $1`, [resultId]),
      ).rejects.toThrow(/ck_grading_result_ungradable/);
    });

    it('lớp lý do đi kèm lời kể', async () => {
      const ctx = await seedSession(ds, 'dm-reason');
      const { resultId } = await seedResult(ds, ctx);
      await expect(
        ds.query(`UPDATE examcollect.grading_result SET ungradable_class = 'system' WHERE id = $1`, [resultId]),
      ).rejects.toThrow(/ck_grading_result_ungradable/);
    });

    it('rút mẫu và thời điểm rút đi cùng nhau', async () => {
      const ctx = await seedSession(ds, 'dm-audit');
      const { resultId } = await seedResult(ds, ctx);
      await expect(
        ds.query(`UPDATE examcollect.grading_result SET audit_sampled = true WHERE id = $1`, [resultId]),
      ).rejects.toThrow(/ck_grading_result_audit_sampled_at/);
    });
  });

  describe('teacher_review', () => {
    it('mọi kind trừ error_exception phải mang điểm', async () => {
      const ctx = await seedSession(ds, 'dm-review');
      const { resultId } = await seedResult(ds, ctx);
      await expect(
        ds.query(
          `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score, kind)
           VALUES ($1, $2, NULL, 'manual_score')`,
          [resultId, ctx.teacherId],
        ),
      ).rejects.toThrow(/ck_teacher_review_score_by_kind/);
    });

    it('error_exception phải trỏ một luật và một chiều', async () => {
      const ctx = await seedSession(ds, 'dm-exc');
      const { resultId } = await seedResult(ds, ctx);
      await expect(
        ds.query(
          `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score, kind)
           VALUES ($1, $2, NULL, 'error_exception')`,
          [resultId, ctx.teacherId],
        ),
      ).rejects.toThrow(/ck_teacher_review_exception_target/);
    });

    it('dòng review cũ không khai kind là review', async () => {
      const ctx = await seedSession(ds, 'dm-kind');
      const { resultId } = await seedResult(ds, ctx);
      const [row] = await ds.query(
        `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score)
         VALUES ($1, $2, 5) RETURNING kind`,
        [resultId, ctx.teacherId],
      );
      expect(row.kind).toBe('review');
    });
  });

  describe('rubric_criterion.key', () => {
    it('mọi tiêu chí đều có key, duy nhất trong rubric', async () => {
      const [row] = await ds.query(
        `SELECT count(*) FILTER (WHERE key IS NULL)::int AS missing,
                count(*)::int - count(DISTINCT (rubric_id, key))::int AS dup
           FROM examcollect.rubric_criterion`,
      );
      expect(row).toEqual({ missing: 0, dup: 0 });
    });

    it('trigger đóng băng tiêu chí vẫn BẬT sau khi điền key (§14.4)', async () => {
      const [row] = await ds.query(
        `SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_rubric_criterion_guard_immutable'`,
      );
      expect(row.tgenabled).toBe('O');
    });

    it('key trùng trong một rubric bị từ chối', async () => {
      const ctx = await seedSession(ds, 'dm-key');
      await seedCriterion(ds, ctx.rubricId, 'tinh_dung');
      await expect(seedCriterion(ds, ctx.rubricId, 'tinh_dung')).rejects.toThrow(/uq_rubric_criterion_key/);
    });
  });

  it('exam_session: mỗi phiên có grading_seed riêng từ lúc tạo (§8.1)', async () => {
    const a = await seedSession(ds, 'dm-seed-a');
    const b = await seedSession(ds, 'dm-seed-b');
    const rows = await ds.query(
      `SELECT grading_seed FROM examcollect.exam_session WHERE id = ANY($1)`,
      [[a.sessionId, b.sessionId]],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].grading_seed).not.toBe(rows[1].grading_seed);
  });
});
