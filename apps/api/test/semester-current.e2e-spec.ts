import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

/**
 * Bất biến "tối đa MỘT kỳ hiện hành" ép ở tầng DB, không ở service: service
 * không phải thứ duy nhất ghi được bảng này, và một check trước UPDATE không
 * nhìn thấy row mà request khác đang ghi ngay lúc đó.
 */
describe('semester.is_current — ràng buộc DB (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let schema: string;
  const stamp = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    schema = (dataSource.options as { schema?: string }).schema ?? 'examcollect';
  }, 60_000);

  afterAll(async () => {
    await dataSource.query(`DELETE FROM ${schema}.semester WHERE name LIKE $1`, [
      `Cur ${stamp}%`,
    ]);
    await app.close();
  });

  async function makeSemester(suffix: string, isCurrent: boolean): Promise<string> {
    const [row] = await dataSource.query(
      `INSERT INTO ${schema}.semester (name, start_date, end_date, is_current)
       VALUES ($1, '2026-09-01', '2027-01-15', $2) RETURNING id`,
      [`Cur ${stamp} ${suffix}`, isCurrent],
    );
    return row.id;
  }

  it('cho phép nhiều kỳ KHÔNG hiện hành', async () => {
    await makeSemester('a', false);
    await makeSemester('b', false);
    const [{ count }] = await dataSource.query(
      `SELECT count(*)::int FROM ${schema}.semester WHERE name LIKE $1`,
      [`Cur ${stamp}%`],
    );
    expect(count).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('từ chối kỳ hiện hành THỨ HAI', async () => {
    // Dọn cờ của bất kỳ kỳ nào khác đang giữ, để test đo đúng thứ nó nói là
    // đang đo — DB dev có thể đã có một kỳ hiện hành từ lần chạy trước.
    await dataSource.query(`UPDATE ${schema}.semester SET is_current = false WHERE is_current`);
    await makeSemester('first-current', true);
    await expect(makeSemester('second-current', true)).rejects.toThrow(
      /uq_semester_single_current/,
    );
  }, 30_000);
});
