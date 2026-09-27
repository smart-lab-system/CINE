import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { scoreResult, seedResult, seedSession } from './helpers/grading-seed';

/**
 * Phần schema của nhánh `feature/code-autograder-plan-1`, viết lại ở `1789410000000` (§9 bước 3).
 * Migration gốc `1789300000000` ghi đè guard bất biến bằng danh sách cột VIẾT CỨNG, thiếu
 * `advocate_outcome`; TypeORM chạy migration cũ hơn đó SAU `1789310000000` trên mọi DB đã có
 * migration mới — và gỡ `advocate_outcome` khỏi danh sách bất biến trong im lặng.
 */
describe('Schema bài code sau lượt merge plan-1 (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => app.close());

  it('T-MERGE-1: advocate_outcome VẪN nằm trong danh sách bất biến; test_run thì không', async () => {
    const [{ def }] = await ds.query(
      `SELECT pg_get_functiondef('examcollect.guard_grading_result_ai_immutable'::regproc) AS def`,
    );
    expect(def).toContain('advocate_outcome');
    expect(def).not.toContain('test_run');

    const ctx = await seedSession(ds, 'merge1');
    const { resultId } = await seedResult(ds, ctx);
    await scoreResult(ds, resultId);
    await expect(
      ds.query(`UPDATE examcollect.grading_result SET advocate_outcome = 'completed' WHERE id = $1`, [resultId]),
    ).rejects.toThrow(/immutable/i);
  });

  it('không còn dấu vết của plan-1 cũ: test_run, test_group', async () => {
    const rows = await ds.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'examcollect'
          AND ((table_name = 'grading_result' AND column_name = 'test_run')
            OR (table_name = 'rubric_criterion' AND column_name = 'test_group'))`,
    );
    expect(rows).toEqual([]);
  });

  it('bài không phải code KHÔNG mang ngôn ngữ', async () => {
    const ctx = await seedSession(ds, 'lang-doc');
    await expect(
      ds.query(
        `INSERT INTO examcollect.required_deliverable (exam_session_id, required_filename, deliverable_type, language)
         VALUES ($1, 'Cau2.docx', 'document', 'cpp')`,
        [ctx.sessionId],
      ),
    ).rejects.toThrow(/ck_required_deliverable_language/);
  });

  it('bài code CHƯA khai ngôn ngữ vẫn tạo được — nửa bị nới của ràng buộc plan-1 (§14.1)', async () => {
    const ctx = await seedSession(ds, 'lang-none', { deliverableType: 'code_project', language: null });
    const [row] = await ds.query(`SELECT language FROM examcollect.required_deliverable WHERE id = $1`, [ctx.deliverableId]);
    expect(row.language).toBeNull();
  });

  it('bài code khai cpp tạo được', async () => {
    const ctx = await seedSession(ds, 'lang-cpp', { deliverableType: 'code_project', language: 'cpp' });
    const [row] = await ds.query(`SELECT language FROM examcollect.required_deliverable WHERE id = $1`, [ctx.deliverableId]);
    expect(row.language).toBe('cpp');
  });
});
