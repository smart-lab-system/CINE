import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  backfillDefaultProblems,
  ChecksumMismatchError,
  installProblemIdGuards,
} from '../src/grading/problem/default-problem-backfill';
import { scoreResult, seedCriterion, seedResult, seedSession, SeedSession } from './helpers/grading-seed';
import { ExamProblemBackfill1789610000000 } from '../src/database/migrations/1789610000000-ExamProblemBackfill';
import { rerunDefaultProblemBackfill } from '../src/grading/problem/rerun-default-problem-backfill';

/** Bộ bản ghi tối thiểu cho một phiên: gói test và đáp án mẫu (chỉ cần các cột NOT NULL). */
async function seedBundleAndReference(
  ds: DataSource,
  ctx: SeedSession,
  opts: { unverified: boolean },
): Promise<{ bundleId: string }> {
  const [bundle] = await ds.query(
    `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by)
     VALUES ($1, 1, 'teacher', $2) RETURNING id`,
    [ctx.sessionId, ctx.teacherId],
  );
  await ds.query(`UPDATE examcollect.exam_session SET test_bundle_id = $2 WHERE id = $1`, [ctx.sessionId, bundle.id]);
  await ds.query(
    `INSERT INTO examcollect.grading_reference (exam_session_id, created_by, model_answer_unverified)
     VALUES ($1, $2, $3)`,
    [ctx.sessionId, ctx.teacherId, opts.unverified],
  );
  return { bundleId: bundle.id };
}

/** Chạy backfill trong một transaction riêng, như migration chạy với `-t all`. */
async function runBackfill(ds: DataSource): Promise<Awaited<ReturnType<typeof backfillDefaultProblems>>> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    const counts = await backfillDefaultProblems(qr);
    await qr.commitTransaction();
    return counts;
  } catch (error) {
    await qr.rollbackTransaction();
    throw error;
  } finally {
    await qr.release();
  }
}

describe('P1a — backfill câu mặc định (M2)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => app.close());

  it('mỗi phiên có đúng một câu ordinal = 1; điểm = tổng tiêu chí × 100; rubric và gói test lấy từ phiên', async () => {
    const ctx = await seedSession(ds, 'bf-points');
    await seedCriterion(ds, ctx.rubricId, 'dung_dan', 6);
    await seedCriterion(ds, ctx.rubricId, 'trinh_bay', 4);
    const { bundleId } = await seedBundleAndReference(ds, ctx, { unverified: false });

    await runBackfill(ds);

    const rows: { ordinal: number; points_hundredths: number; rubric_id: string; test_bundle_id: string }[] =
      await ds.query(
        `SELECT ordinal, points_hundredths, rubric_id, test_bundle_id FROM examcollect.exam_problem
          WHERE exam_session_id = $1`,
        [ctx.sessionId],
      );
    expect(rows).toEqual([{ ordinal: 1, points_hundredths: 1000, rubric_id: ctx.rubricId, test_bundle_id: bundleId }]);
  });

  it('phiên không có tiêu chí nào → điểm 0, không ném', async () => {
    const ctx = await seedSession(ds, 'bf-empty');
    await runBackfill(ds);
    const [row] = await ds.query(
      `SELECT points_hundredths FROM examcollect.exam_problem WHERE exam_session_id = $1 AND ordinal = 1`,
      [ctx.sessionId],
    );
    expect(row.points_hundredths).toBe(0);
  });

  it('điền problem_id cho kết quả, gói test và tham chiếu; ruler_trust theo model_answer_unverified', async () => {
    const ctxU = await seedSession(ds, 'bf-trust-u');
    const ctxT = await seedSession(ds, 'bf-trust-t');
    await seedBundleAndReference(ds, ctxU, { unverified: true });
    await seedBundleAndReference(ds, ctxT, { unverified: false });
    const { resultId } = await seedResult(ds, ctxU);

    await runBackfill(ds);

    const [result] = await ds.query(
      `SELECT g.problem_id, p.id AS pid FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         JOIN examcollect.exam_problem p ON p.exam_session_id = s.exam_session_id AND p.ordinal = 1
        WHERE g.id = $1`,
      [resultId],
    );
    expect(result.problem_id).toBe(result.pid);
    const refs: { exam_session_id: string; ruler_trust: string; problem_id: string | null }[] = await ds.query(
      `SELECT exam_session_id, ruler_trust, problem_id FROM examcollect.grading_reference
        WHERE exam_session_id = ANY($1::uuid[])`,
      [[ctxU.sessionId, ctxT.sessionId]],
    );
    const byId = new Map(refs.map((r) => [r.exam_session_id, r]));
    expect(byId.get(ctxU.sessionId)?.ruler_trust).toBe('unverified');
    expect(byId.get(ctxT.sessionId)?.ruler_trust).toBe('teacher');
    expect(byId.get(ctxU.sessionId)?.problem_id).not.toBeNull();
  });

  it('checksum: ai_total_score, status, số dòng score_computation và updated_at của kết quả KHÔNG đổi', async () => {
    const ctx = await seedSession(ds, 'bf-checksum');
    const { resultId } = await seedResult(ds, ctx);
    await scoreResult(ds, resultId, '7.00');
    const snap = async () =>
      ds.query(
        `SELECT g.ai_total_score::text AS ai, g.status,
                (SELECT count(*)::int FROM examcollect.score_computation sc WHERE sc.grading_result_id = g.id) AS sc_n,
                g.updated_at::text AS upd
           FROM examcollect.grading_result g WHERE g.id = $1`,
        [resultId],
      );
    const before = await snap();

    await runBackfill(ds);

    expect(await snap()).toEqual(before);
  });

  it('chạy lại lần hai không tạo gì thêm (idempotent)', async () => {
    await runBackfill(ds);
    const again = await runBackfill(ds);
    expect(again).toEqual({ problems: 0, results: 0, bundles: 0, references: 0, synced: 0 });
  });

  it('cổng checksum: số liệu đổi giữa chừng → ném ChecksumMismatchError và rollback, không có câu nào được ghi', async () => {
    const ctx = await seedSession(ds, 'bf-rollback');
    const { resultId } = await seedResult(ds, ctx);
    await scoreResult(ds, resultId, '5.00');

    // Giả lập một ghi khác đổi số liệu chấm trong lúc backfill: sau bước ghi tham chiếu, cập nhật updated_at.
    const qr: QueryRunner = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    const injecting = {
      query: (sql: string, params?: unknown[]) => {
        const out = qr.query(sql, params);
        if (sql.includes('UPDATE examcollect.grading_reference')) {
          return out.then(async (rows) => {
            await qr.query(`UPDATE examcollect.grading_result SET updated_at = now() WHERE id = $1`, [resultId]);
            return rows;
          });
        }
        return out;
      },
    } as unknown as QueryRunner;

    await expect(backfillDefaultProblems(injecting)).rejects.toBeInstanceOf(ChecksumMismatchError);
    await qr.rollbackTransaction();
    await qr.release();

    const [count] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.exam_problem WHERE exam_session_id = $1`, [ctx.sessionId]);
    expect(count.n).toBe(0);
    const [trg] = await ds.query(
      `SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'examcollect.grading_result'::regclass AND tgname = 'trg_grading_result_updated_at'`,
    );
    expect(trg.tgenabled).toBe('O');
  });

  it('bất biến problem_id: NULL → giá trị được; đổi giá trị đã có bị từ chối', async () => {
    const ctxA = await seedSession(ds, 'bf-guard');
    const { resultId } = await seedResult(ds, ctxA);
    await runBackfill(ds);
    const ctxB = await seedSession(ds, 'bf-guard-b');
    await runBackfill(ds);

    const qr = ds.createQueryRunner();
    await qr.connect();
    await installProblemIdGuards(qr);
    await qr.release();

    const [pa] = await ds.query(`SELECT id FROM examcollect.exam_problem WHERE exam_session_id = $1 AND ordinal = 1`, [ctxA.sessionId]);
    const [pb] = await ds.query(`SELECT id FROM examcollect.exam_problem WHERE exam_session_id = $1 AND ordinal = 1`, [ctxB.sessionId]);
    // Kết quả đã có problem_id (từ backfill) — đổi sang câu khác phải bị chặn.
    await expect(
      ds.query(`UPDATE examcollect.grading_result SET problem_id = $2 WHERE id = $1`, [resultId, pb.id]),
    ).rejects.toThrow(/problem_id/);
    // Giữ nguyên giá trị hiện có thì không bị chặn.
    await ds.query(`UPDATE examcollect.grading_result SET problem_id = $2 WHERE id = $1`, [resultId, pa.id]);
  });

  // Lượt chạy lại sau triển khai (script rerun-default-problem-backfill): --dry-run đếm rồi rollback, không ghi gì.
  it('chạy lại ở chế độ dry-run: trả số đếm nhưng không ghi gì', async () => {
    const ctx = await seedSession(ds, 'bf-dry-run');
    const counts = await rerunDefaultProblemBackfill(ds, { dryRun: true });
    expect(counts.problems).toBeGreaterThanOrEqual(1);
    const [n] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.exam_problem WHERE exam_session_id = $1`, [ctx.sessionId]);
    expect(n.n).toBe(0);
    const real = await rerunDefaultProblemBackfill(ds);
    expect(real.problems).toBeGreaterThanOrEqual(1);
    const [after] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.exam_problem WHERE exam_session_id = $1`, [ctx.sessionId]);
    expect(after.n).toBe(1);
  });

  // Khoảng giữa migration và triển khai: code cũ vẫn ghi cột bí danh của phiên, câu 1 không biết. Chạy lại backfill
  // phải kéo câu 1 theo cột bí danh (§10.1, bước 3), không chỉ thêm câu còn thiếu.
  it('chạy lại sau triển khai: câu 1 lệch cột bí danh (code cũ ghi trong khoảng giữa) được kéo theo', async () => {
    const ctx = await seedSession(ds, 'bf-sync');
    await runBackfill(ds);
    const [rubricB] = await ds.query(
      `INSERT INTO examcollect.rubric (version, teacher_id, name) VALUES (1, $1, $2) RETURNING id`,
      [ctx.teacherId, `Rubric đồng bộ ${ctx.sessionId}`],
    );
    await seedCriterion(ds, rubricB.id, 'tieu_chi_b', 3);
    await ds.query(`UPDATE examcollect.exam_session SET rubric_id = $2 WHERE id = $1`, [ctx.sessionId, rubricB.id]);

    const counts = await runBackfill(ds);

    const [p] = await ds.query(
      `SELECT rubric_id, points_hundredths FROM examcollect.exam_problem WHERE exam_session_id = $1 AND ordinal = 1`,
      [ctx.sessionId],
    );
    expect(p).toEqual({ rubric_id: rubricB.id, points_hundredths: 300 });
    expect(counts.synced).toBeGreaterThanOrEqual(1);
  });

  // Migration chạy KHÔNG có `-t all` (migrationsTransactionMode = 'none'): migration phải tự mở transaction,
  // nếu không cổng checksum ném lỗi nhưng các dòng đã ghi vẫn nằm lại trong DB đang phục vụ người dùng.
  it('migration M2 không có transaction ngoài: checksum lệch → rollback toàn bộ, trigger được bật lại', async () => {
    const ctx = await seedSession(ds, 'bf-mig-rollback');
    const { resultId } = await seedResult(ds, ctx);
    await scoreResult(ds, resultId, '5.00');

    const qr = ds.createQueryRunner();
    await qr.connect();
    const realQuery = qr.query.bind(qr);
    qr.query = (sql: string, params?: unknown[]) => {
      const out = realQuery(sql, params);
      if (sql.includes('UPDATE examcollect.grading_reference')) {
        return out.then(async (rows) => {
          await realQuery(`UPDATE examcollect.grading_result SET updated_at = now() WHERE id = $1`, [resultId]);
          return rows;
        });
      }
      return out;
    };

    await expect(new ExamProblemBackfill1789610000000().up(qr)).rejects.toBeInstanceOf(ChecksumMismatchError);
    await qr.release();

    const [count] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.exam_problem WHERE exam_session_id = $1`, [ctx.sessionId]);
    expect(count.n).toBe(0);
    const [trg] = await ds.query(
      `SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'examcollect.grading_result'::regclass AND tgname = 'trg_grading_result_updated_at'`,
    );
    expect(trg.tgenabled).toBe('O');
  });
});
