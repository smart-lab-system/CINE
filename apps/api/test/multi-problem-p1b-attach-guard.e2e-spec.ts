import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { StorageService } from '../src/storage/storage.service';
import { createTestAccount } from './helpers/create-account';
import { seedSession, SeedSession } from './helpers/grading-seed';

/**
 * Review I1 (P1b, sửa sau nghiệm thu). Gắn đề vào phiên đã xác nhận đề cương phải bị 409 TRƯỚC khi ghi bất cứ thứ
 * gì lên kho lưu trữ. Trước đây đáp án được ghi đè vào khoá cố định rồi mới bị từ chối ở bước ghi tham chiếu.
 */
describe('P1b — gắn đề vào phiên đã xác nhận đề cương không ghi gì lên kho (e2e)', () => {
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
    const email = `p1b_attguard_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: res.body.accessToken as string };
  }

  /** Đề một câu tối thiểu, hình dạng khớp `parseExamJson`. */
  const oneQuestionExam = JSON.stringify({
    title: 'Đề một câu',
    language: 'cpp',
    verification: { status: 'unverified', reason: 'sandbox_unavailable' },
    questions: [
      {
        statement: 'Đề',
        modelAnswer: 'int main() { return 0; }',
        topic: 'thử',
        points: 1,
        testBundle: [{ name: 'ca', group: 'co_ban', input: '1', expectedOutput: '1' }],
      },
    ],
  });

  it('phiên đã xác nhận đề cương: attach → 409 và KHÔNG có lời gọi putObject nào', async () => {
    const owner = await login('confirmed');
    const ctx: SeedSession = await seedSession(ds, 'attguard-confirmed', {
      teacherId: owner.id,
      deliverableType: 'code_project',
      language: 'cpp',
      startHoursAgo: -3,
    });
    await ds.query(
      `UPDATE examcollect.exam_session SET blueprint_confirmed_at = now(), blueprint_confirmed_by = $2 WHERE id = $1`,
      [ctx.sessionId, owner.id],
    );

    const storage = app.get(StorageService);
    const put = jest.spyOn(storage, 'putObject');
    try {
      const res = await request(app.getHttpServer())
        .post('/exam-authoring/attach')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ examSessionId: ctx.sessionId, examJson: oneQuestionExam });

      expect(res.status).toBe(409);
      expect(put).not.toHaveBeenCalled();
    } finally {
      put.mockRestore();
    }
  });
});
