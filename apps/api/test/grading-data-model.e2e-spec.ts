import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { scoreResult, seedCriterion, seedResult, seedSession, seedTeacher } from './helpers/grading-seed';

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

  describe('bảng lỗi và bảng giá', () => {
    let keyCursor = 0;
    async function rule(teacherId: string, key = `r_${Date.now().toString(36)}_${keyCursor++}`) {
      const [r] = await ds.query(
        `INSERT INTO examcollect.error_rule (teacher_id, rule_key, origin, state) VALUES ($1, $2, 'teacher', 'active') RETURNING id`,
        [teacherId, key],
      );
      const [rev] = await ds.query(
        `INSERT INTO examcollect.error_rule_revision (error_rule_id, revision, name, description, criterion_key, created_by)
         VALUES ($1, 1, 'Sai ca biên', 'mô tả', 'tinh_dung', $2) RETURNING id`,
        [r.id, teacherId],
      );
      await ds.query(`UPDATE examcollect.error_rule SET current_revision_id = $2 WHERE id = $1`, [r.id, rev.id]);
      return { ruleId: r.id as string, revisionId: rev.id as string };
    }

    it('một giảng viên không có hai luật cùng rule_key; hai giảng viên thì được (T-POL-8)', async () => {
      const a = await seedTeacher(ds, 'rule-a');
      const b = await seedTeacher(ds, 'rule-b');
      await rule(a, 'sai_ca_bien');
      await rule(b, 'sai_ca_bien');
      await expect(rule(a, 'sai_ca_bien')).rejects.toThrow(/uq_error_rule_teacher_key/);
    });

    it('bản sửa luật là chỉ-thêm: sửa hay xoá đều bị từ chối', async () => {
      const t = await seedTeacher(ds, 'rev');
      const { revisionId } = await rule(t);
      await expect(ds.query(`UPDATE examcollect.error_rule_revision SET name = 'khác' WHERE id = $1`, [revisionId])).rejects.toThrow(/chỉ thêm/);
      await expect(ds.query(`DELETE FROM examcollect.error_rule_revision WHERE id = $1`, [revisionId])).rejects.toThrow(/chỉ thêm/);
    });

    it('bản sửa hiện hành phải thuộc chính luật đó', async () => {
      const t = await seedTeacher(ds, 'rev-own');
      const x = await rule(t);
      const y = await rule(t);
      await expect(ds.query(`UPDATE examcollect.error_rule SET current_revision_id = $2 WHERE id = $1`, [x.ruleId, y.revisionId]))
        .rejects.toThrow(/fk_error_rule_current_revision/);
    });

    it('luật không bao giờ bị xoá — hồ sơ trỏ vào nó vĩnh viễn', async () => {
      const t = await seedTeacher(ds, 'rule-del');
      const { ruleId } = await rule(t);
      await expect(ds.query(`DELETE FROM examcollect.error_rule WHERE id = $1`, [ruleId])).rejects.toThrow(/không xoá/);
    });

    it('giá: chỉ-thêm, và không trỏ được luật của giảng viên khác', async () => {
      const a = await seedTeacher(ds, 'price-a');
      const b = await seedTeacher(ds, 'price-b');
      const { ruleId } = await rule(b);
      const [v] = await ds.query(
        `INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, 1, $1) RETURNING id`,
        [a],
      );
      await expect(ds.query(
        `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction) VALUES ($1, $2, $3, 1.5)`,
        [v.id, ruleId, a],
      )).rejects.toThrow(/fk_rule_price_rule_teacher/);

      const own = await rule(a);
      await ds.query(
        `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction) VALUES ($1, $2, $3, 1.5)`,
        [v.id, own.ruleId, a],
      );
      await expect(ds.query(`UPDATE examcollect.rule_price SET deduction = 2 WHERE price_table_version_id = $1`, [v.id])).rejects.toThrow(/chỉ thêm/);
      await expect(ds.query(`UPDATE examcollect.price_table_version SET version = 9 WHERE id = $1`, [v.id])).rejects.toThrow(/chỉ thêm/);
    });

    it('luật chưa có giá là giá null, không phải 0 (§2.1)', async () => {
      const a = await seedTeacher(ds, 'price-null');
      const { ruleId } = await rule(a);
      const [v] = await ds.query(`INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, 1, $1) RETURNING id`, [a]);
      const [p] = await ds.query(
        `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction) VALUES ($1, $2, $3, NULL) RETURNING deduction`,
        [v.id, ruleId, a],
      );
      expect(p.deduction).toBeNull();
    });

    it('phiên ghim bảng giá của chính giảng viên phiên đó', async () => {
      const ctx = await seedSession(ds, 'pin');
      const other = await seedTeacher(ds, 'pin-other');
      const [v] = await ds.query(`INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, 1, $1) RETURNING id`, [other]);
      await expect(ds.query(`UPDATE examcollect.exam_session SET pinned_price_version_id = $2 WHERE id = $1`, [ctx.sessionId, v.id]))
        .rejects.toThrow(/fk_exam_session_pinned_price/);
    });
  });

  describe('lượt chấm (grading_attempt)', () => {
    async function attempt(resultId: string, teacherId: string, no = 1) {
      const [a] = await ds.query(
        `INSERT INTO examcollect.grading_attempt (grading_result_id, attempt_no, triggered_by, investigation)
         VALUES ($1, $2, $3, '{"toolCalls":[]}') RETURNING id`,
        [resultId, no, teacherId],
      );
      return a.id as string;
    }

    it('lượt đang chạy thì còn ghi được', async () => {
      const ctx = await seedSession(ds, 'att-open');
      const { resultId } = await seedResult(ds, ctx);
      const id = await attempt(resultId, ctx.teacherId);
      await ds.query(`UPDATE examcollect.grading_attempt SET investigation = '{"toolCalls":[1]}' WHERE id = $1`, [id]);
    });

    it('T-IMM-1: lượt đã ghi kết cục → investigation không sửa được, KỂ CẢ khi bài chưa có điểm', async () => {
      const ctx = await seedSession(ds, 'att-imm');
      const { resultId } = await seedResult(ds, ctx);
      const id = await attempt(resultId, ctx.teacherId);
      await ds.query(
        `UPDATE examcollect.grading_attempt
            SET outcome = 'ungradable', ungradable_class = 'system', ungradable_reason = 'sandbox chết', finished_at = now()
          WHERE id = $1`,
        [id],
      );
      await expect(ds.query(`UPDATE examcollect.grading_attempt SET investigation = '{}' WHERE id = $1`, [id])).rejects.toThrow(/bất biến/);
      await expect(ds.query(`DELETE FROM examcollect.grading_attempt WHERE id = $1`, [id])).rejects.toThrow(/không xoá/);
    });

    it('kết cục và thời điểm kết thúc đi cùng nhau; ungradable phải có lớp và lời kể', async () => {
      const ctx = await seedSession(ds, 'att-ck');
      const { resultId } = await seedResult(ds, ctx);
      const id = await attempt(resultId, ctx.teacherId);
      await expect(ds.query(`UPDATE examcollect.grading_attempt SET outcome = 'graded' WHERE id = $1`, [id])).rejects.toThrow(/ck_grading_attempt_outcome_finished/);
      await expect(ds.query(`UPDATE examcollect.grading_attempt SET outcome = 'ungradable', finished_at = now() WHERE id = $1`, [id]))
        .rejects.toThrow(/ck_grading_attempt_ungradable/);
    });

    it('lượt hiện hành của một kết quả phải là lượt CỦA kết quả đó', async () => {
      const ctx = await seedSession(ds, 'att-cur');
      const a = await seedResult(ds, ctx);
      const b = await seedResult(ds, ctx);
      const other = await attempt(b.resultId, ctx.teacherId);
      await expect(ds.query(`UPDATE examcollect.grading_result SET current_attempt_id = $2 WHERE id = $1`, [a.resultId, other]))
        .rejects.toThrow(/fk_grading_result_current_attempt/);
    });
  });

  describe('gói test, lượt tính điểm, đánh dấu tiêu chí, kiểm mẫu', () => {
    async function bundle(ctx: { sessionId: string; teacherId: string }, version = 1) {
      const [b] = await ds.query(
        `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by)
         VALUES ($1, $2, 'teacher', $3) RETURNING id`,
        [ctx.sessionId, version, ctx.teacherId],
      );
      return b.id as string;
    }

    it('một phiên có nhiều phiên bản gói test, không trùng số phiên bản', async () => {
      const ctx = await seedSession(ds, 'bundle-v');
      await bundle(ctx, 1);
      await bundle(ctx, 2);
      await expect(bundle(ctx, 2)).rejects.toThrow(/uq_grading_test_bundle_version/);
    });

    it('ca test là chỉ-thêm; bỏ ca là phiên bản gói mới', async () => {
      const ctx = await seedSession(ds, 'bundle-case');
      const b = await bundle(ctx);
      const [c] = await ds.query(
        `INSERT INTO examcollect.grading_test_case (bundle_id, case_key, "group", input, expected_output)
         VALUES ($1, 'c1', 'co_ban', '1', '1') RETURNING id`,
        [b],
      );
      await expect(ds.query(`UPDATE examcollect.grading_test_case SET expected_output = '2' WHERE id = $1`, [c.id])).rejects.toThrow(/chỉ thêm/);
    });

    it('duyệt gói: chỉ ghi được MỘT lần, và nội dung gói không đổi sau khi tạo', async () => {
      const ctx = await seedSession(ds, 'bundle-approve');
      const b = await bundle(ctx);
      await ds.query(`UPDATE examcollect.grading_test_bundle SET approved_by = $2, approved_at = now() WHERE id = $1`, [b, ctx.teacherId]);
      await expect(ds.query(`UPDATE examcollect.grading_test_bundle SET approved_at = now() WHERE id = $1`, [b])).rejects.toThrow(/Gói test/);
      await expect(ds.query(`UPDATE examcollect.grading_test_bundle SET origin = 'generated' WHERE id = $1`, [b])).rejects.toThrow(/Gói test/);
    });

    it('phiên chỉ ghim được gói test của chính nó', async () => {
      const a = await seedSession(ds, 'bundle-pin-a');
      const b = await seedSession(ds, 'bundle-pin-b');
      const foreign = await bundle(b);
      await expect(ds.query(`UPDATE examcollect.exam_session SET test_bundle_id = $2 WHERE id = $1`, [a.sessionId, foreign]))
        .rejects.toThrow(/fk_exam_session_test_bundle/);
    });

    it('lượt tính điểm là chỉ-thêm, và phải trỏ một lượt chấm của CHÍNH kết quả đó', async () => {
      const ctx = await seedSession(ds, 'score');
      const { resultId } = await seedResult(ds, ctx);
      const other = await seedResult(ds, ctx);
      const [att] = await ds.query(
        `INSERT INTO examcollect.grading_attempt (grading_result_id, attempt_no, triggered_by) VALUES ($1, 1, $2) RETURNING id`,
        [other.resultId, ctx.teacherId],
      );
      await expect(ds.query(
        `INSERT INTO examcollect.score_computation (grading_result_id, attempt_id, rubric_id_version, reason, score, breakdown)
         VALUES ($1, $2, $3, 'initial', 7, '{}')`,
        [resultId, att.id, ctx.rubricId],
      )).rejects.toThrow(/fk_score_computation_attempt/);

      const [own] = await ds.query(
        `INSERT INTO examcollect.grading_attempt (grading_result_id, attempt_no, triggered_by) VALUES ($1, 1, $2) RETURNING id`,
        [resultId, ctx.teacherId],
      );
      const [sc] = await ds.query(
        `INSERT INTO examcollect.score_computation (grading_result_id, attempt_id, rubric_id_version, reason, score, breakdown)
         VALUES ($1, $2, $3, 'initial', 7, '{}') RETURNING id`,
        [resultId, own.id, ctx.rubricId],
      );
      await expect(ds.query(`UPDATE examcollect.score_computation SET score = 9 WHERE id = $1`, [sc.id])).rejects.toThrow(/chỉ thêm/);
    });

    it('T-WAIVER-1 (phần DB): đánh dấu "không có luật trừ" khi rubric đã có kết quả chấm — ghi được, không đụng trigger đóng băng tiêu chí', async () => {
      const ctx = await seedSession(ds, 'waiver');
      await seedCriterion(ds, ctx.rubricId, 'hieu_nang');
      await seedResult(ds, ctx); // rubric này giờ đã được một kết quả trỏ tới
      await ds.query(
        `INSERT INTO examcollect.criterion_waiver (rubric_id, criterion_key, set_by) VALUES ($1, 'hieu_nang', $2)`,
        [ctx.rubricId, ctx.teacherId],
      );
      await expect(ds.query(
        `INSERT INTO examcollect.criterion_waiver (rubric_id, criterion_key, set_by) VALUES ($1, 'hieu_nang', $2)`,
        [ctx.rubricId, ctx.teacherId],
      )).rejects.toThrow(/uq_criterion_waiver_active/);
      await expect(ds.query(
        `INSERT INTO examcollect.criterion_waiver (rubric_id, criterion_key, set_by) VALUES ($1, 'khong_co', $2)`,
        [ctx.rubricId, ctx.teacherId],
      )).rejects.toThrow(/fk_criterion_waiver_criterion/);
    });

    it('nhận xét kiểm mẫu ghi rồi thì khoá (§8.1)', async () => {
      const ctx = await seedSession(ds, 'audit');
      const { resultId } = await seedResult(ds, ctx);
      await ds.query(`INSERT INTO examcollect.audit_sample_review (grading_result_id, teacher_id) VALUES ($1, $2)`, [resultId, ctx.teacherId]);
      await expect(ds.query(`UPDATE examcollect.audit_sample_review SET extra_errors = '{x}' WHERE grading_result_id = $1`, [resultId])).rejects.toThrow(/chỉ thêm/);
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
