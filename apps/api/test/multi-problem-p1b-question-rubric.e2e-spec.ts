import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { seedCriterion, seedSession, SeedSession } from './helpers/grading-seed';
import { seedPrices, seedRule } from './helpers/investigator-seed';

/**
 * P1b, 5.1 — rubric riêng cho từng câu sinh từ rubric mẫu của phiên. Dòng lỗi (`rubric_error`) được sao chép sang
 * tên rubric mới, và giá của phiên bản bảng giá mới nhất được co giãn theo tỉ lệ điểm câu (1,00 × 2/5 = 0,40;
 * 1,00 × 3/5 = 0,60). Mỗi câu có tên rubric riêng nên không dùng chung dòng lỗi với câu khác.
 */
describe('P1b 5.1 — rubric theo câu: sao chép lỗi và giá có co giãn (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();
  const PASSWORD = 'correct-horse-battery';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
  }, 60_000);
  afterAll(async () => app.close());

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `p1b_qrub_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: res.body.accessToken as string };
  }

  it('hai câu 2 và 3 điểm: mỗi câu có rubric và dòng lỗi riêng; giá 1,00 co giãn thành 0,40 và 0,60', async () => {
    const owner = await login('scale');
    const ctx: SeedSession = await seedSession(ds, 'qrub-scale', {
      teacherId: owner.id,
      deliverableType: 'code_project',
      language: 'cpp',
      startHoursAgo: -3,
    });
    // 5.2: phiên chưa khai yêu cầu nộp nào, để hai câu tự tạo bai1/bai2 (số lượng phải khớp nếu đã khai).
    await ds.query(`DELETE FROM examcollect.required_deliverable WHERE exam_session_id = $1`, [ctx.sessionId]);
    await seedCriterion(ds, ctx.rubricId, 'tieu_chi_1', 5);
    const rule = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tieu_chi_1');
    await seedPrices(ds, ctx.teacherId, { [rule.ruleId]: '1.00' });

    const exam = JSON.stringify({
      title: 'Đề hai câu',
      language: 'cpp',
      verification: { status: 'unverified', reason: 'sandbox_unavailable' },
      questions: [2, 3].map((points, i) => ({
        statement: `Đề câu ${i + 1}`,
        modelAnswer: 'int main() { return 0; }',
        topic: 'thử',
        points,
        testBundle: [{ name: `ca ${i + 1}`, group: 'co_ban', input: '1', expectedOutput: '1' }],
      })),
    });
    const res = await request(app.getHttpServer())
      .post('/exam-authoring/attach')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ examSessionId: ctx.sessionId, examJson: exam });
    expect(res.status).toBe(201);

    const problems: { id: string; rubric_id: string; name: string }[] = await ds.query(
      `SELECT p.id, p.rubric_id, rb.name FROM examcollect.exam_problem p
         JOIN examcollect.rubric rb ON rb.id = p.rubric_id
        WHERE p.exam_session_id = $1 ORDER BY p.ordinal`,
      [ctx.sessionId],
    );
    expect(problems).toHaveLength(2);
    expect(problems[0].rubric_id).not.toEqual(problems[1].rubric_id);
    expect(problems[0].name).not.toEqual(problems[1].name);

    // Mỗi câu có đúng một dòng lỗi, mang tên rubric của chính câu đó.
    const latest: { id: string } = (
      await ds.query(
        `SELECT id FROM examcollect.price_table_version WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1`,
        [ctx.teacherId],
      )
    )[0];
    const deductions: string[] = [];
    for (const p of problems) {
      const rows: { deduction: string }[] = await ds.query(
        `SELECT rep.deduction FROM examcollect.rubric_error re
           JOIN examcollect.rubric_error_price rep ON rep.rubric_error_id = re.id AND rep.price_table_version_id = $3
          WHERE re.teacher_id = $1 AND re.rubric_name = $2 AND re.removed_at IS NULL`,
        [ctx.teacherId, p.name, latest.id],
      );
      expect(rows).toHaveLength(1);
      deductions.push(rows[0].deduction);
    }
    expect(deductions).toEqual(['0.40', '0.60']);
  });
});
